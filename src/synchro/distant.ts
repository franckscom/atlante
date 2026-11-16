// Le « distant » : ce que le moteur de synchro attend d'un serveur.
// Le moteur ne connaît que cette interface. En production c'est Supabase (distantSupabase.ts) ;
// dans les tests c'est un faux serveur en mémoire ou une vraie base PostgreSQL embarquée.
import type { NomTable } from '../modele/types';

/** Une ligne telle que le serveur la renvoie (sans le champ local _modifie). */
export type LigneDistante = Record<string, unknown> & {
  id: string;
  rev: number;
  updated_at: string;
  deleted_at: string | null;
};

export type GenreErreur =
  /** Pas de réponse du tout : pas d'Internet, ou serveur injoignable. */
  | 'reseau'
  /** Le serveur répond par une erreur 5xx : projet en pause ou en panne. */
  | 'serveur'
  /** Session expirée ou refusée. */
  | 'auth'
  /** Insertion refusée : cet identifiant existe déjà sur le serveur. */
  | 'existe'
  | 'autre';

export class ErreurDistante extends Error {
  constructor(public genre: GenreErreur, message: string) {
    super(message);
    this.name = 'ErreurDistante';
  }
}

export interface Distant {
  /** Lignes dont la révision est supérieure au curseur, triées par révision croissante. */
  lireDepuis(table: NomTable, rev: number, limite: number): Promise<LigneDistante[]>;
  lire(table: NomTable, id: string): Promise<LigneDistante | null>;
  /** Insère une ligne. Lève ErreurDistante('existe') si l'identifiant est déjà pris. */
  inserer(table: NomTable, ligne: Record<string, unknown>): Promise<LigneDistante>;
  /**
   * Met à jour une ligne SEULEMENT si sa révision sur le serveur est encore revAttendue.
   * Renvoie null si le serveur a changé entre-temps (ou si la ligne n'existe pas) : c'est ainsi
   * qu'on détecte un conflit au lieu d'écraser la version de l'autre appareil.
   */
  mettreAJour(table: NomTable, ligne: Record<string, unknown>, revAttendue: number): Promise<LigneDistante | null>;
  /** Parmi ces identifiants, lesquels existent encore sur le serveur ? */
  idsExistants(table: NomTable, ids: string[]): Promise<string[]>;
  /**
   * Efface pour de bon des lignes DÉJÀ dans la corbeille (le serveur refuse les autres).
   * Renvoie les identifiants réellement effacés.
   */
  effacerDefinitivement(table: NomTable, ids: string[]): Promise<string[]>;
}
