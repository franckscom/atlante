// Toutes les écritures de l'app passent par ce fichier.
// Règle : chaque création, modification ou suppression marque la ligne « _modifie = 1 »
// pour que la synchro sache qu'elle doit l'envoyer au serveur.
import type { BaseAtlante } from './db';
import { nouvelleLigne } from './db';
import type { Fiche, Ligne, LignesParTable, NomTable, TypeFiche } from '../modele/types';

type ChampsSysteme = keyof Ligne;

/** Crée une ligne dans une table et renvoie la ligne complète. */
export async function creer<T extends NomTable>(
  base: BaseAtlante,
  table: T,
  donnees: Omit<LignesParTable[T], ChampsSysteme>,
): Promise<LignesParTable[T]> {
  const ligne = { ...nouvelleLigne(), ...donnees } as unknown as LignesParTable[T];
  await (base.table(table) as any).add(ligne);
  return ligne;
}

/** Modifie certains champs d'une ligne, sans la recréer. */
export async function modifier<T extends NomTable>(
  base: BaseAtlante,
  table: T,
  id: string,
  changements: Partial<Omit<LignesParTable[T], ChampsSysteme>>,
): Promise<void> {
  await base.table(table).update(id, { ...changements, updated_at: new Date().toISOString(), _modifie: 1 });
}

/** Suppression logique d'une ligne (elle part à la corbeille et la suppression se propagera). */
async function marquerSupprimee(base: BaseAtlante, table: NomTable, id: string, quand: string): Promise<void> {
  await base.table(table).update(id, { deleted_at: quand, updated_at: quand, _modifie: 1 });
}

export function fabriquerFiche(type: TypeFiche, titre: string): Omit<Fiche, ChampsSysteme> {
  return {
    type,
    titre,
    contenu: '',
    auteur: '',
    url: '',
    date: '',
    domaine_ids: [],
    champs: {},
    provenance: { mode: 'manuel', acquis_le: new Date().toISOString() },
  };
}

/**
 * Supprime une fiche et tout ce qui en dépend : ses relations, ses affirmations,
 * sa présence dans les dossiers (et le contenu du dossier si c'en est un).
 * Tout reçoit la même date de suppression, ce qui permet de tout restaurer d'un coup.
 */
export async function supprimerFiche(base: BaseAtlante, id: string): Promise<void> {
  const quand = new Date().toISOString();
  await base.transaction('rw', base.fiches, base.relations, base.affirmations, base.dossier_fiches, async () => {
    const vivante = (l: Ligne) => !l.deleted_at;
    const relations = [
      ...(await base.relations.where('source_id').equals(id).filter(vivante).toArray()),
      ...(await base.relations.where('cible_id').equals(id).filter(vivante).toArray()),
    ];
    for (const r of relations) await marquerSupprimee(base, 'relations', r.id, quand);
    for (const a of await base.affirmations.where('fiche_id').equals(id).filter(vivante).toArray()) {
      await marquerSupprimee(base, 'affirmations', a.id, quand);
    }
    // Les affirmations d'autres fiches qui citaient cette fiche comme source perdent ce lien.
    for (const a of await base.affirmations.where('source_id').equals(id).filter(vivante).toArray()) {
      await modifier(base, 'affirmations', a.id, { source_id: null });
    }
    const liens = [
      ...(await base.dossier_fiches.where('dossier_id').equals(id).filter(vivante).toArray()),
      ...(await base.dossier_fiches.where('fiche_id').equals(id).filter(vivante).toArray()),
    ];
    for (const l of liens) await marquerSupprimee(base, 'dossier_fiches', l.id, quand);
    await marquerSupprimee(base, 'fiches', id, quand);
  });
}

/** Sort une fiche de la corbeille, avec ce qui avait été supprimé en même temps qu'elle. */
export async function restaurerFiche(base: BaseAtlante, id: string): Promise<void> {
  await base.transaction('rw', base.fiches, base.relations, base.affirmations, base.dossier_fiches, async () => {
    const fiche = await base.fiches.get(id);
    if (!fiche?.deleted_at) return;
    const quand = fiche.deleted_at;
    const maintenant = new Date().toISOString();
    const relever = { deleted_at: null, updated_at: maintenant, _modifie: 1 as const };
    const existe = async (ficheId: string) => {
      if (ficheId === id) return true;
      const f = await base.fiches.get(ficheId);
      return !!f && !f.deleted_at;
    };
    for (const r of await base.relations.filter((x) => x.deleted_at === quand && (x.source_id === id || x.cible_id === id)).toArray()) {
      if ((await existe(r.source_id)) && (await existe(r.cible_id))) await base.relations.update(r.id, relever);
    }
    for (const a of await base.affirmations.filter((x) => x.deleted_at === quand && x.fiche_id === id).toArray()) {
      await base.affirmations.update(a.id, relever);
    }
    for (const l of await base.dossier_fiches.filter((x) => x.deleted_at === quand && (x.dossier_id === id || x.fiche_id === id)).toArray()) {
      if ((await existe(l.dossier_id)) && (await existe(l.fiche_id))) await base.dossier_fiches.update(l.id, relever);
    }
    await base.fiches.update(id, relever);
  });
}

/** Supprime un domaine et le retire des fiches qui le portaient. */
export async function supprimerDomaine(base: BaseAtlante, id: string): Promise<void> {
  const quand = new Date().toISOString();
  await base.transaction('rw', base.domaines, base.fiches, async () => {
    for (const f of await base.fiches.where('domaine_ids').equals(id).toArray()) {
      await modifier(base, 'fiches', f.id, { domaine_ids: f.domaine_ids.filter((d) => d !== id) });
    }
    await marquerSupprimee(base, 'domaines', id, quand);
  });
}

/** Supprime un type de relation ET les relations qui l'utilisent. */
export async function supprimerTypeRelation(base: BaseAtlante, id: string): Promise<void> {
  const quand = new Date().toISOString();
  await base.transaction('rw', base.types_relation, base.relations, async () => {
    for (const r of await base.relations.where('type_relation_id').equals(id).filter((x) => !x.deleted_at).toArray()) {
      await marquerSupprimee(base, 'relations', r.id, quand);
    }
    await marquerSupprimee(base, 'types_relation', id, quand);
  });
}

/** Supprime une ligne simple (relation, affirmation, lien de dossier). */
export async function supprimerSimple(base: BaseAtlante, table: 'relations' | 'affirmations' | 'dossier_fiches', id: string): Promise<void> {
  await marquerSupprimee(base, table, id, new Date().toISOString());
}

/** Efface toutes les données de CET appareil (le serveur n'est pas touché). */
export async function effacerDonneesLocales(base: BaseAtlante): Promise<void> {
  await base.transaction('rw', base.tables, async () => {
    for (const t of base.tables) await t.clear();
  });
}
