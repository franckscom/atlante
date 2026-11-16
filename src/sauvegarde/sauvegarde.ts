// Sauvegarde complète et restauration.
// La restauration se fait en deux temps : un APERÇU (rien n'est modifié), puis l'application du choix.
import type { BaseAtlante } from '../donnees/db';
import { ecrireMeta, lireMeta, VERSION_SCHEMA } from '../donnees/db';
import { TABLES, type Ligne, type NomTable } from '../modele/types';
import { memeContenu } from '../synchro/moteur';
import { VERSION_APP } from '../config';
import { chiffrer, dechiffrer, type ArchiveChiffree } from './chiffrement';

/** Le contenu en clair d'une sauvegarde (et de l'export JSON complet). */
export interface Instantane {
  application: 'atlante';
  version_app: string;
  version_schema: number;
  cree_le: string;
  tables: Record<NomTable, Ligne[]>;
}

/** Photographie toutes les données, y compris la corbeille (lignes supprimées logiquement). */
export async function creerInstantane(base: BaseAtlante): Promise<Instantane> {
  const tables = {} as Record<NomTable, Ligne[]>;
  for (const t of TABLES) tables[t] = (await base.table<Ligne, string>(t).toArray()) as Ligne[];
  return { application: 'atlante', version_app: VERSION_APP, version_schema: VERSION_SCHEMA, cree_le: new Date().toISOString(), tables };
}

export async function creerSauvegarde(base: BaseAtlante, motDePasse: string, cleSecours: string, iterations?: number): Promise<ArchiveChiffree> {
  const instantane = await creerInstantane(base);
  const archive = await chiffrer(JSON.stringify(instantane), motDePasse, cleSecours, iterations);
  await ecrireMeta(base, 'derniere_sauvegarde', archive.creee_le);
  return archive;
}

export class ErreurSauvegarde extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErreurSauvegarde';
  }
}

/** Contrôle la structure et la version d'un instantané avant de s'en servir. */
export function verifierInstantane(donnees: unknown): Instantane {
  const i = donnees as Instantane;
  if (!i || i.application !== 'atlante' || typeof i.tables !== 'object') throw new ErreurSauvegarde("Contenu inattendu : ce n'est pas une sauvegarde Atlante.");
  if (typeof i.version_schema !== 'number' || i.version_schema > VERSION_SCHEMA) {
    throw new ErreurSauvegarde(`Sauvegarde au schéma ${i.version_schema}, plus récent que celui de cette app (${VERSION_SCHEMA}) : mets Atlante à jour avant de restaurer.`);
  }
  for (const t of TABLES) {
    if (!Array.isArray(i.tables[t])) throw new ErreurSauvegarde(`Sauvegarde incomplète : table « ${t} » absente.`);
    for (const l of i.tables[t]) {
      if (typeof l?.id !== 'string' || typeof l?.updated_at !== 'string') throw new ErreurSauvegarde(`Sauvegarde endommagée : ligne invalide dans « ${t} ».`);
    }
  }
  // Ici viendront les migrations d'anciens schémas (version_schema < VERSION_SCHEMA).
  return i;
}

export async function ouvrirSauvegarde(texteFichier: string, secret: string, genre: 'mot_de_passe' | 'cle_secours'): Promise<Instantane> {
  let archive: ArchiveChiffree;
  try {
    archive = JSON.parse(texteFichier);
  } catch {
    throw new ErreurSauvegarde('Fichier illisible : ce n\'est pas une sauvegarde Atlante.');
  }
  const clair = await dechiffrer(archive, secret, genre);
  return verifierInstantane(JSON.parse(clair));
}

export interface ApercuTable {
  /** Dans la sauvegarde, absentes de l'appareil. */
  nouvelles: number;
  identiques: number;
  /** Présentes des deux côtés avec un contenu différent. */
  differentes: number;
  /** Sur l'appareil, absentes de la sauvegarde. */
  seulementIci: number;
}
export interface Apercu {
  cree_le: string;
  version_app: string;
  tables: Record<NomTable, ApercuTable>;
}

/** Compare la sauvegarde à l'appareil SANS rien modifier. */
export async function apercuRestauration(base: BaseAtlante, instantane: Instantane): Promise<Apercu> {
  const tables = {} as Record<NomTable, ApercuTable>;
  for (const t of TABLES) {
    const locales = new Map((await base.table<Ligne, string>(t).toArray()).map((l) => [l.id, l]));
    const a: ApercuTable = { nouvelles: 0, identiques: 0, differentes: 0, seulementIci: 0 };
    const vues = new Set<string>();
    for (const l of instantane.tables[t]) {
      vues.add(l.id);
      const locale = locales.get(l.id);
      if (!locale) a.nouvelles++;
      else if (memeContenu(t, locale as any, l as any)) a.identiques++;
      else a.differentes++;
    }
    for (const [id, l] of locales) if (!vues.has(id) && !l.deleted_at) a.seulementIci++;
    tables[t] = a;
  }
  return { cree_le: instantane.cree_le, version_app: instantane.version_app, tables };
}

/**
 * - 'ajouter'   : ajoute ce qui manque, ne touche à rien d'existant.
 * - 'fusionner' : ajoute ce qui manque et, pour les éléments différents, prend la version de la sauvegarde.
 * - 'remplacer' : l'appareil redevient identique à la sauvegarde ; ce qui n'y figure pas part à la corbeille.
 */
export type ModeRestauration = 'ajouter' | 'fusionner' | 'remplacer';

export async function restaurer(base: BaseAtlante, instantane: Instantane, mode: ModeRestauration): Promise<void> {
  const maintenant = new Date().toISOString();
  await base.transaction('rw', base.tables, async () => {
    for (const t of TABLES) {
      const table = base.table<Ligne, string>(t);
      const locales = new Map((await table.toArray()).map((l) => [l.id, l]));
      const vues = new Set<string>();
      for (const l of instantane.tables[t]) {
        vues.add(l.id);
        const locale = locales.get(l.id);
        if (!locale) {
          // rev 0 : la synchro vérifiera elle-même si le serveur connaît déjà cette ligne.
          await table.put({ ...l, rev: 0, _modifie: 1 });
        } else if (mode !== 'ajouter' && !memeContenu(t, locale as any, l as any)) {
          // On garde la révision locale : si le serveur a une autre version, la synchro le signalera en conflit.
          await table.put({ ...l, owner_id: locale.owner_id, rev: locale.rev, updated_at: maintenant, _modifie: 1 });
        }
      }
      if (mode === 'remplacer') {
        for (const [id, l] of locales) {
          if (!vues.has(id) && !l.deleted_at) await table.update(id, { deleted_at: maintenant, updated_at: maintenant, _modifie: 1 });
        }
      }
    }
    // Une restauration peut ramener des versions que le serveur a dépassées : on relit tout au prochain passage.
    await base.conflits.clear();
    for (const t of TABLES) await base.meta.delete(`curseur:${t}`);
  });
}

/** Nombre de jours depuis la dernière sauvegarde chiffrée (null = jamais). */
export async function joursDepuisSauvegarde(base: BaseAtlante): Promise<number | null> {
  const d = await lireMeta<string | null>(base, 'derniere_sauvegarde', null);
  if (!d) return null;
  return Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);
}
