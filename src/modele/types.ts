// Modèle de données d'Atlante : les formes des objets manipulés par l'app.
// Les mêmes colonnes existent en local (IndexedDB) et sur le serveur (Supabase).

/** Champs communs à toutes les lignes synchronisées. */
export interface Ligne {
  /** Identifiant unique (UUID), créé sur l'appareil : il ne change jamais. */
  id: string;
  /** Propriétaire. Rempli par le serveur ; null tant que la ligne n'a pas été envoyée. */
  owner_id: string | null;
  created_at: string;
  /** Date de la dernière modification faite par moi (heure de l'appareil). */
  updated_at: string;
  /** Suppression logique : la ligne reste, marquée supprimée, pour que la suppression se propage. */
  deleted_at: string | null;
  /** Numéro de révision donné par le serveur à chaque écriture. 0 = jamais envoyée. */
  rev: number;
  /** 1 = modifiée en local, pas encore envoyée au serveur. N'existe qu'en local. */
  _modifie: 0 | 1;
}

export const TYPES_FICHE = {
  personne: 'Personne',
  concept: 'Concept',
  courant: 'Courant',
  oeuvre: 'Œuvre',
  organisation: 'Organisation',
  evenement: 'Événement',
  methode: 'Méthode',
  citation: 'Citation',
  source: 'Source',
  note: 'Note personnelle',
  dossier: 'Dossier thématique',
} as const;
export type TypeFiche = keyof typeof TYPES_FICHE;

/** Champs propres à chaque type de fiche (rangés dans la colonne « champs »). */
export const CHAMPS_PAR_TYPE: Record<TypeFiche, { cle: string; libelle: string }[]> = {
  personne: [
    { cle: 'naissance', libelle: 'Naissance' },
    { cle: 'deces', libelle: 'Décès' },
    { cle: 'nationalite', libelle: 'Nationalité' },
    { cle: 'activite', libelle: 'Activité' },
  ],
  concept: [],
  courant: [{ cle: 'periode', libelle: 'Période' }],
  oeuvre: [
    { cle: 'genre', libelle: 'Genre (livre, article, film…)' },
    { cle: 'editeur', libelle: 'Éditeur' },
  ],
  organisation: [
    { cle: 'fondation', libelle: 'Fondation' },
    { cle: 'lieu', libelle: 'Siège ou lieu' },
  ],
  evenement: [
    { cle: 'fin', libelle: 'Date de fin' },
    { cle: 'lieu', libelle: 'Lieu' },
  ],
  methode: [],
  citation: [{ cle: 'localisation', libelle: 'Page ou section' }],
  source: [
    { cle: 'genre', libelle: 'Genre (livre, article, site, PDF…)' },
    { cle: 'editeur', libelle: 'Éditeur ou média' },
    { cle: 'reference', libelle: 'Référence bibliographique complète' },
    { cle: 'consulte_le', libelle: 'Consulté le' },
  ],
  note: [],
  dossier: [],
};

/** Statuts d'une affirmation. Attribués par moi seul, jamais par l'app. */
export const STATUTS = {
  fait: 'Fait vérifiable',
  interpretation: 'Interprétation ou opinion attribuée à un auteur',
  hypothese: 'Hypothèse',
  controverse: 'Affirmation controversée',
  insuffisant: 'Données insuffisantes ou non vérifiées',
  inference_ia: 'Inférence produite par une IA',
  personnel: 'Observation ou conclusion personnelle',
} as const;
export type Statut = keyof typeof STATUTS;

/** D'où vient une fiche : saisie à la main ou importée. */
export interface Provenance {
  mode: 'manuel' | 'fichier';
  /** Nom du fichier importé, s'il y en a un. */
  fichier?: string;
  /** Date d'acquisition. */
  acquis_le: string;
}

export interface Fiche extends Ligne {
  type: TypeFiche;
  titre: string;
  /** Texte principal, en Markdown. */
  contenu: string;
  auteur: string;
  url: string;
  /** Date libre : « 1923 », « 2024-05-01 », « vers 380 av. J.-C. »… */
  date: string;
  /** Une fiche peut appartenir à plusieurs domaines. */
  domaine_ids: string[];
  champs: Record<string, string>;
  provenance: Provenance | null;
}

export interface Domaine extends Ligne {
  nom: string;
  description: string;
}

/** Type de relation nommé, lisible dans les deux sens (« a écrit » / « écrit par »). */
export interface TypeRelation extends Ligne {
  nom: string;
  nom_inverse: string;
}

export interface Relation extends Ligne {
  source_id: string;
  cible_id: string;
  type_relation_id: string;
  note: string;
}

export interface Affirmation extends Ligne {
  fiche_id: string;
  texte: string;
  statut: Statut;
  /** Fiche (de type Source, Œuvre…) qui appuie l'affirmation. */
  source_id: string | null;
  /** Page ou section précise. */
  localisation: string;
  note: string;
}

/** Appartenance d'une fiche à un dossier thématique. */
export interface DossierFiche extends Ligne {
  dossier_id: string;
  fiche_id: string;
  position: number;
  note: string;
}

/** Tables synchronisées, dans l'ordre d'envoi (les tables référencées d'abord). */
export const TABLES = ['domaines', 'types_relation', 'fiches', 'relations', 'affirmations', 'dossier_fiches'] as const;
export type NomTable = (typeof TABLES)[number];

export interface LignesParTable {
  domaines: Domaine;
  types_relation: TypeRelation;
  fiches: Fiche;
  relations: Relation;
  affirmations: Affirmation;
  dossier_fiches: DossierFiche;
}

/** Colonnes « métier » de chaque table : celles qu'on compare pour détecter un vrai conflit. */
export const COLONNES: { [T in NomTable]: (keyof LignesParTable[T] & string)[] } = {
  domaines: ['nom', 'description'],
  types_relation: ['nom', 'nom_inverse'],
  fiches: ['type', 'titre', 'contenu', 'auteur', 'url', 'date', 'domaine_ids', 'champs', 'provenance'],
  relations: ['source_id', 'cible_id', 'type_relation_id', 'note'],
  affirmations: ['fiche_id', 'texte', 'statut', 'source_id', 'localisation', 'note'],
  dossier_fiches: ['dossier_id', 'fiche_id', 'position', 'note'],
};

export const LIBELLES_TABLES: Record<NomTable, string> = {
  domaines: 'Domaines',
  types_relation: 'Types de relation',
  fiches: 'Fiches',
  relations: 'Relations',
  affirmations: 'Affirmations',
  dossier_fiches: 'Contenus de dossiers',
};

/** Conflit de synchro : la même ligne a été modifiée ici et ailleurs. */
export interface Conflit {
  /** « table:id » */
  cle: string;
  table: NomTable;
  id_ligne: string;
  locale: Ligne;
  distante: Ligne;
  detecte_le: string;
}
