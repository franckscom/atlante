// Base locale de l'app : IndexedDB, pilotée par Dexie.
// C'est ICI que l'app lit et écrit en premier (principe « local-first »).
import Dexie, { type Table } from 'dexie';
import type { Affirmation, Conflit, Domaine, DossierFiche, Fiche, Relation, TypeRelation } from '../modele/types';
import { DOMAINES_DE_DEPART, TYPES_RELATION_DE_DEPART } from '../modele/semences';

/** Petit rangement clé → valeur pour les réglages locaux (curseurs de synchro, date de sauvegarde…). */
export interface Meta {
  cle: string;
  valeur: unknown;
}

/** Version du schéma des données. À augmenter à chaque migration (locale et serveur). */
export const VERSION_SCHEMA = 1;

export class BaseAtlante extends Dexie {
  fiches!: Table<Fiche, string>;
  domaines!: Table<Domaine, string>;
  types_relation!: Table<TypeRelation, string>;
  relations!: Table<Relation, string>;
  affirmations!: Table<Affirmation, string>;
  dossier_fiches!: Table<DossierFiche, string>;
  conflits!: Table<Conflit, string>;
  meta!: Table<Meta, string>;

  constructor(nom = 'atlante') {
    super(nom);
    // MIGRATIONS LOCALES VERSIONNÉES.
    // Chaque version décrit les tables et leurs index (pas toutes les colonnes).
    // Pour faire évoluer le modèle : ajouter this.version(2).stores({...}).upgrade(...)
    // SANS jamais modifier une version déjà publiée.
    this.version(1).stores({
      fiches: 'id, type, updated_at, _modifie, *domaine_ids',
      domaines: 'id, _modifie',
      types_relation: 'id, _modifie',
      relations: 'id, source_id, cible_id, type_relation_id, _modifie',
      affirmations: 'id, fiche_id, source_id, statut, _modifie',
      dossier_fiches: 'id, dossier_id, fiche_id, _modifie',
      conflits: 'cle, table',
      meta: 'cle',
    });
  }
}

/** La base utilisée par l'app. Les tests créent les leurs, avec d'autres noms. */
export const bd = new BaseAtlante();

export async function lireMeta<T>(base: BaseAtlante, cle: string, defaut: T): Promise<T> {
  const m = await base.meta.get(cle);
  return m === undefined ? defaut : (m.valeur as T);
}

export async function ecrireMeta(base: BaseAtlante, cle: string, valeur: unknown): Promise<void> {
  await base.meta.put({ cle, valeur });
}

/** Champs communs d'une nouvelle ligne. */
export function nouvelleLigne() {
  const maintenant = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    owner_id: null,
    created_at: maintenant,
    updated_at: maintenant,
    deleted_at: null,
    rev: 0,
    _modifie: 1 as const,
  };
}

/** Au tout premier lancement : crée les 14 domaines et les types de relation de départ. */
export async function semerSiPremierLancement(base: BaseAtlante): Promise<void> {
  await base.transaction('rw', base.meta, base.domaines, base.types_relation, async () => {
    if (await lireMeta(base, 'seme', false)) return;
    // Dates de création décalées d'une milliseconde : l'ordre de la liste de départ est conservé à l'affichage.
    const depart = Date.now();
    const date = (i: number) => new Date(depart + i).toISOString();
    for (const [i, nom] of DOMAINES_DE_DEPART.entries()) {
      await base.domaines.add({ ...nouvelleLigne(), created_at: date(i), updated_at: date(i), nom, description: '' });
    }
    for (const [nom, nom_inverse] of TYPES_RELATION_DE_DEPART) {
      await base.types_relation.add({ ...nouvelleLigne(), nom, nom_inverse });
    }
    await ecrireMeta(base, 'seme', true);
  });
}
