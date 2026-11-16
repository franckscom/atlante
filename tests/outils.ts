// Outils communs aux tests : bases locales jetables et faux serveur en mémoire.
import 'fake-indexeddb/auto';
import { BaseAtlante } from '../src/donnees/db';
import type { NomTable } from '../src/modele/types';
import { ErreurDistante, type Distant, type LigneDistante } from '../src/synchro/distant';

let compteur = 0;
/** Une base locale neuve : chaque appel simule un nouvel appareil. */
export function nouvelAppareil(): BaseAtlante {
  return new BaseAtlante(`test-${Date.now()}-${compteur++}`);
}

/** Faux serveur : mêmes règles que Supabase (révision croissante, mise à jour conditionnelle). */
export class FauxServeur implements Distant {
  tables = new Map<NomTable, Map<string, LigneDistante>>();
  rev = 0;
  /** Simule une panne : 'reseau' (pas de réponse) ou 'serveur' (projet en pause). */
  panne: 'reseau' | 'serveur' | null = null;
  /** Appelé juste avant chaque écriture : permet de simuler une action pendant un envoi. */
  avantEcriture: (() => Promise<void>) | null = null;

  private t(table: NomTable) {
    if (!this.tables.has(table)) this.tables.set(table, new Map());
    return this.tables.get(table)!;
  }
  private verifier() {
    if (this.panne) throw new ErreurDistante(this.panne, 'panne simulée');
  }
  async lireDepuis(table: NomTable, rev: number, limite: number) {
    this.verifier();
    return [...this.t(table).values()].filter((l) => l.rev > rev).sort((a, b) => a.rev - b.rev).slice(0, limite).map((l) => structuredClone(l));
  }
  async lire(table: NomTable, id: string) {
    this.verifier();
    const l = this.t(table).get(id);
    return l ? structuredClone(l) : null;
  }
  async inserer(table: NomTable, ligne: Record<string, unknown>) {
    this.verifier();
    if (this.avantEcriture) await this.avantEcriture();
    if (this.t(table).has(ligne.id as string)) throw new ErreurDistante('existe', 'duplicate key');
    const l = { ...structuredClone(ligne), owner_id: "utilisateur-1", rev: ++this.rev } as unknown as LigneDistante;
    this.t(table).set(l.id, l);
    return structuredClone(l);
  }
  async mettreAJour(table: NomTable, ligne: Record<string, unknown>, revAttendue: number) {
    this.verifier();
    if (this.avantEcriture) await this.avantEcriture();
    const actuelle = this.t(table).get(ligne.id as string);
    if (!actuelle || actuelle.rev !== revAttendue) return null;
    const l = { ...actuelle, ...structuredClone(ligne), rev: ++this.rev } as LigneDistante;
    this.t(table).set(l.id, l);
    return structuredClone(l);
  }
  async idsExistants(table: NomTable, ids: string[]) {
    this.verifier();
    return ids.filter((id) => this.t(table).has(id));
  }
  async effacerDefinitivement(table: NomTable, ids: string[]) {
    this.verifier();
    const effaces = ids.filter((id) => !!this.t(table).get(id)?.deleted_at);
    for (const id of effaces) this.t(table).delete(id);
    if (table === 'fiches') {
      // Comme le serveur (on delete cascade) : ce qui dépendait d'une fiche effacée disparaît avec elle.
      const reste = (id: unknown) => this.t('fiches').has(id as string);
      for (const [id, l] of this.t('relations')) if (!reste(l.source_id) || !reste(l.cible_id)) this.t('relations').delete(id);
      for (const [id, l] of this.t('affirmations')) if (!reste(l.fiche_id)) this.t('affirmations').delete(id);
      for (const [id, l] of this.t('dossier_fiches')) if (!reste(l.dossier_id) || !reste(l.fiche_id)) this.t('dossier_fiches').delete(id);
    }
    return effaces;
  }
}
