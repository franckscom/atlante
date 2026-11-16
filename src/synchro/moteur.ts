// Moteur de synchronisation local-first.
//
// Principe :
//  1. RECEVOIR : on demande au serveur tout ce qui a changé depuis la dernière fois (curseur « rev »).
//  2. ENVOYER  : on envoie chaque ligne modifiée en local, à condition que le serveur n'ait pas
//                changé cette ligne entre-temps (comparaison du numéro de révision).
//  3. CONFLIT  : si la même ligne a été modifiée ici ET ailleurs, on ne tranche pas :
//                les deux versions sont gardées et c'est moi qui choisis (écran « Conflits »).
import type { BaseAtlante } from '../donnees/db';
import { ecrireMeta, lireMeta } from '../donnees/db';
import { COLONNES, TABLES, type Conflit, type Ligne, type NomTable } from '../modele/types';
import { egal, normaliser } from '../utils/texte';
import { ErreurDistante, type Distant, type LigneDistante } from './distant';

const TAILLE_PAGE = 500;

export interface Bilan {
  recues: number;
  envoyees: number;
  conflits: number;
  /** Lignes refusées par le serveur (la synchro continue pour les autres). */
  erreurs: string[];
}

/** L'appareil contient déjà les données d'un autre compte : on refuse de les mélanger. */
export class ErreurAutreCompte extends Error {
  constructor() {
    super("Cet appareil contient les données d'un autre compte.");
    this.name = 'ErreurAutreCompte';
  }
}

/** Deux versions d'une ligne ont-elles le même contenu utile ? */
export function memeContenu(table: NomTable, a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  if (!!a.deleted_at !== !!b.deleted_at) return false;
  return (COLONNES[table] as string[]).every((c) => egal(a[c], b[c]));
}

/** Ce qu'on envoie au serveur : les colonnes utiles, sans les champs gérés par le serveur ou purement locaux. */
function charge(table: NomTable, ligne: Ligne): Record<string, unknown> {
  const l = ligne as unknown as Record<string, unknown>;
  const c: Record<string, unknown> = {
    id: ligne.id,
    created_at: ligne.created_at,
    updated_at: ligne.updated_at,
    deleted_at: ligne.deleted_at,
  };
  for (const col of COLONNES[table] as string[]) c[col] = l[col];
  return c;
}

const cleConflit = (table: NomTable, id: string) => `${table}:${id}`;

async function noterConflit(base: BaseAtlante, table: NomTable, locale: Ligne, distante: LigneDistante): Promise<void> {
  const conflit: Conflit = {
    cle: cleConflit(table, locale.id),
    table,
    id_ligne: locale.id,
    locale,
    distante: { ...(distante as unknown as Ligne), _modifie: 0 },
    detecte_le: new Date().toISOString(),
  };
  await base.conflits.put(conflit);
}

/** Applique en local une ligne reçue du serveur. Renvoie true si un conflit a été noté. */
async function appliquerDistante(base: BaseAtlante, table: NomTable, distante: LigneDistante): Promise<boolean> {
  const t = base.table<Ligne, string>(table);
  return base.transaction('rw', t, base.conflits, async () => {
    const locale = await t.get(distante.id);
    const propre = { ...(distante as unknown as Ligne), _modifie: 0 as const };
    if (!locale) {
      await t.put(propre);
      return false;
    }
    if (!locale._modifie) {
      // Pas de modification locale en attente : la version du serveur remplace la mienne.
      if (distante.rev > locale.rev) await t.put(propre);
      return false;
    }
    // Modification locale en attente.
    if (distante.rev <= locale.rev) return false; // je partais déjà de cette version du serveur
    if (memeContenu(table, locale as unknown as Record<string, unknown>, distante)) {
      // Même résultat des deux côtés : rien à choisir.
      await t.put(propre);
      await base.conflits.delete(cleConflit(table, locale.id));
      return false;
    }
    await noterConflit(base, table, locale, distante);
    return true;
  });
}

/**
 * Les domaines et types de relation de départ sont créés sur chaque appareil au premier lancement.
 * Pour ne pas les avoir en double après la première synchro, ceux qui n'ont jamais été envoyés
 * et portent le même nom qu'une ligne venue du serveur sont fusionnés avec elle.
 */
async function fusionnerSemences(base: BaseAtlante): Promise<void> {
  await base.transaction('rw', base.domaines, base.types_relation, base.fiches, base.relations, async () => {
    const maintenant = new Date().toISOString();
    const domaines = await base.domaines.toArray();
    const cleD = (d: { nom: string }) => normaliser(d.nom);
    const domServeur = new Map(domaines.filter((d) => d.rev > 0 && !d.deleted_at).map((d) => [cleD(d), d.id]));
    for (const d of domaines.filter((x) => x.rev === 0)) {
      const cible = domServeur.get(cleD(d));
      if (!cible) continue;
      for (const f of await base.fiches.where('domaine_ids').equals(d.id).toArray()) {
        const ids = [...new Set(f.domaine_ids.map((x) => (x === d.id ? cible : x)))];
        await base.fiches.update(f.id, { domaine_ids: ids, updated_at: maintenant, _modifie: 1 });
      }
      await base.domaines.delete(d.id);
    }
    const types = await base.types_relation.toArray();
    const cleT = (t: { nom: string; nom_inverse: string }) => normaliser(t.nom) + '|' + normaliser(t.nom_inverse);
    const typServeur = new Map(types.filter((t) => t.rev > 0 && !t.deleted_at).map((t) => [cleT(t), t.id]));
    for (const t of types.filter((x) => x.rev === 0)) {
      const cible = typServeur.get(cleT(t));
      if (!cible) continue;
      for (const r of await base.relations.where('type_relation_id').equals(t.id).toArray()) {
        await base.relations.update(r.id, { type_relation_id: cible, updated_at: maintenant, _modifie: 1 });
      }
      await base.types_relation.delete(t.id);
    }
  });
}

/**
 * Corbeille vidée depuis un autre appareil : les lignes ont disparu du serveur.
 * Ici, elles sont encore dans la corbeille locale. On demande au serveur lesquelles existent toujours
 * et on efface les autres. Seules des lignes déjà supprimées sont concernées : aucun risque pour les données vivantes.
 */
async function retirerCorbeilleVidee(base: BaseAtlante, distant: Distant): Promise<void> {
  let fichesRetirees = false;
  for (const table of TABLES) {
    const t = base.table<Ligne, string>(table);
    const ids = (await t.filter((l) => !!l.deleted_at && !l._modifie && l.rev > 0).primaryKeys()) as string[];
    if (!ids.length) continue;
    const restantes = new Set(await distant.idsExistants(table, ids));
    const aRetirer = ids.filter((id) => !restantes.has(id));
    if (!aRetirer.length) continue;
    await t.bulkDelete(aRetirer);
    if (table === 'fiches') fichesRetirees = true;
  }
  if (fichesRetirees) await retirerOrphelins(base);
}

/** Efface les relations, affirmations et liens de dossier dont une fiche n'existe plus du tout (comme le fait le serveur). */
async function retirerOrphelins(base: BaseAtlante): Promise<void> {
  await base.transaction('rw', base.fiches, base.relations, base.affirmations, base.dossier_fiches, async () => {
    const fiches = new Set((await base.fiches.toCollection().primaryKeys()) as string[]);
    await base.relations.filter((r) => !fiches.has(r.source_id) || !fiches.has(r.cible_id)).delete();
    await base.affirmations.filter((a) => !fiches.has(a.fiche_id)).delete();
    await base.dossier_fiches.filter((l) => !fiches.has(l.dossier_id) || !fiches.has(l.fiche_id)).delete();
    // Une affirmation vivante qui citait une fiche effacée perd simplement cette source.
    await base.affirmations.filter((a) => !!a.source_id && !fiches.has(a.source_id)).modify({ source_id: null });
  });
}

/** Nombre d'éléments dans la corbeille, toutes tables confondues. */
export async function compterCorbeille(base: BaseAtlante): Promise<number> {
  let n = 0;
  for (const table of TABLES) n += await base.table<Ligne, string>(table).filter((l) => !!l.deleted_at).count();
  return n;
}

export class ErreurCorbeille extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErreurCorbeille';
  }
}

/**
 * « Vider la corbeille » : efface POUR DE BON tout ce qui est marqué supprimé, sur le serveur puis sur l'appareil.
 * Les autres appareils s'alignent à leur prochaine synchro (retirerCorbeilleVidee).
 *
 * - distant = null : appareil jamais relié à un compte, on n'efface qu'en local.
 * - sinon : tout doit d'abord être synchronisé. Si une suppression n'était pas encore partie,
 *   la ligne resterait vivante sur le serveur et sur les autres appareils.
 */
export async function viderCorbeille(base: BaseAtlante, distant: Distant | null): Promise<number> {
  if (distant) {
    if ((await compterEnAttente(base)) > 0) throw new ErreurCorbeille('Des modifications attendent encore d\'être envoyées. Synchronise, puis recommence.');
    if ((await base.conflits.count()) > 0) throw new ErreurCorbeille('Des conflits sont à trancher avant de vider la corbeille.');
  }
  let total = 0;
  // Ordre inverse : les lignes qui dépendent d'une fiche avant la fiche elle-même.
  for (const table of [...TABLES].reverse()) {
    const t = base.table<Ligne, string>(table);
    const ids = (await t.filter((l) => !!l.deleted_at).primaryKeys()) as string[];
    if (!ids.length) continue;
    if (distant) await distant.effacerDefinitivement(table, ids.filter(Boolean));
    await t.bulkDelete(ids);
    total += ids.length;
  }
  await retirerOrphelins(base);
  return total;
}

/** Après un envoi réussi : enregistre la révision donnée par le serveur. */
async function confirmerEnvoi(base: BaseAtlante, table: NomTable, envoyee: Ligne, recue: LigneDistante): Promise<void> {
  const t = base.table<Ligne, string>(table);
  await base.transaction('rw', t, async () => {
    const actuelle = await t.get(envoyee.id);
    if (!actuelle) return;
    if (actuelle.updated_at === envoyee.updated_at) {
      await t.put({ ...(recue as unknown as Ligne), _modifie: 0 });
    } else {
      // J'ai remodifié la ligne pendant l'envoi : elle reste « à envoyer », à partir de la nouvelle révision.
      await t.update(envoyee.id, { rev: recue.rev, owner_id: (recue as any).owner_id ?? null });
    }
  });
}

/** Le serveur a une autre version que celle dont je partais : même contenu → on adopte ; sinon → conflit. */
async function traiterDivergence(base: BaseAtlante, table: NomTable, locale: Ligne, distante: LigneDistante): Promise<boolean> {
  if (memeContenu(table, locale as unknown as Record<string, unknown>, distante)) {
    await confirmerEnvoi(base, table, locale, distante);
    return false;
  }
  await noterConflit(base, table, locale, distante);
  return true;
}

/** Une synchronisation complète : recevoir, puis envoyer. */
export async function synchroniser(base: BaseAtlante, distant: Distant, utilisateurId: string): Promise<Bilan> {
  const bilan: Bilan = { recues: 0, envoyees: 0, conflits: 0, erreurs: [] };

  // Garde-fou : un appareil = un compte.
  const connu = await lireMeta<string | null>(base, 'utilisateur_id', null);
  if (connu && connu !== utilisateurId) throw new ErreurAutreCompte();
  if (!connu) await ecrireMeta(base, 'utilisateur_id', utilisateurId);

  // 1. RECEVOIR
  for (const table of TABLES) {
    let curseur = await lireMeta<number>(base, `curseur:${table}`, 0);
    for (;;) {
      const page = await distant.lireDepuis(table, curseur, TAILLE_PAGE);
      for (const ligne of page) {
        await appliquerDistante(base, table, ligne);
        bilan.recues++;
        curseur = Math.max(curseur, ligne.rev);
      }
      await ecrireMeta(base, `curseur:${table}`, curseur);
      if (page.length < TAILLE_PAGE) break;
    }
  }
  await fusionnerSemences(base);
  await retirerCorbeilleVidee(base, distant);

  // 2. ENVOYER (les lignes en conflit attendent ma décision)
  for (const table of TABLES) {
    const t = base.table<Ligne, string>(table);
    const aEnvoyer = await t.where('_modifie').equals(1).toArray();
    for (const locale of aEnvoyer) {
      if (await base.conflits.get(cleConflit(table, locale.id))) continue;
      try {
        const donnees = charge(table, locale);
        if (locale.rev === 0) {
          try {
            await confirmerEnvoi(base, table, locale, await distant.inserer(table, donnees));
            bilan.envoyees++;
          } catch (e) {
            if (!(e instanceof ErreurDistante && e.genre === 'existe')) throw e;
            const distante = await distant.lire(table, locale.id);
            if (!distante) throw e;
            await traiterDivergence(base, table, locale, distante);
          }
        } else {
          const recue = await distant.mettreAJour(table, donnees, locale.rev);
          if (recue) {
            await confirmerEnvoi(base, table, locale, recue);
            bilan.envoyees++;
          } else {
            const distante = await distant.lire(table, locale.id);
            if (!distante && locale.deleted_at) {
              // Supprimée ici, et déjà effacée pour de bon sur le serveur (corbeille vidée ailleurs) : rien à renvoyer.
              await t.delete(locale.id);
            } else if (!distante) {
              // La ligne n'existe plus sur le serveur mais je l'ai modifiée : on la recrée plutôt que de perdre mon travail.
              await confirmerEnvoi(base, table, locale, await distant.inserer(table, donnees));
              bilan.envoyees++;
            } else {
              await traiterDivergence(base, table, locale, distante);
            }
          }
        }
      } catch (e) {
        // Panne générale (réseau, serveur, session) : on arrête tout. Erreur sur une ligne : on continue.
        if (e instanceof ErreurDistante && e.genre !== 'autre' && e.genre !== 'existe') throw e;
        bilan.erreurs.push(`${table} ${locale.id} : ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
  bilan.conflits = await base.conflits.count();
  await ecrireMeta(base, 'derniere_synchro', new Date().toISOString());
  return bilan;
}

/** Je tranche un conflit : garder ma version (elle sera envoyée) ou prendre celle du serveur. */
export async function resoudreConflit(base: BaseAtlante, cle: string, choix: 'locale' | 'distante'): Promise<void> {
  const conflit = await base.conflits.get(cle);
  if (!conflit) return;
  const t = base.table<Ligne, string>(conflit.table);
  await base.transaction('rw', t, base.conflits, async () => {
    if (choix === 'distante') {
      await t.put({ ...conflit.distante, _modifie: 0 });
    } else {
      // Ma version repart de la révision du serveur : au prochain envoi, elle la remplacera.
      const actuelle = (await t.get(conflit.id_ligne)) ?? conflit.locale;
      await t.put({ ...actuelle, rev: conflit.distante.rev, owner_id: conflit.distante.owner_id, updated_at: new Date().toISOString(), _modifie: 1 });
    }
    await base.conflits.delete(cle);
  });
}

/** Nombre de lignes modifiées en local qui attendent d'être envoyées. */
export async function compterEnAttente(base: BaseAtlante): Promise<number> {
  let n = 0;
  for (const table of TABLES) n += await base.table(table).where('_modifie').equals(1).count();
  return n;
}
