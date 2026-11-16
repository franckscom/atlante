// Vue d'ensemble des données en mémoire, utilisée par les exports et par « Préparer pour Claude ».
import type { BaseAtlante } from '../donnees/db';
import type { Affirmation, Domaine, DossierFiche, Fiche, Relation, TypeRelation } from '../modele/types';

export interface Contexte {
  fiches: Map<string, Fiche>;
  domaines: Map<string, Domaine>;
  typesRelation: Map<string, TypeRelation>;
  relations: Relation[];
  affirmations: Affirmation[];
  dossierFiches: DossierFiche[];
}

/** Charge tout ce qui n'est pas supprimé. */
export async function chargerContexte(base: BaseAtlante): Promise<Contexte> {
  const vivant = <T extends { deleted_at: string | null }>(l: T[]) => l.filter((x) => !x.deleted_at);
  const fiches = new Map(vivant(await base.fiches.toArray()).map((f) => [f.id, f]));
  return {
    fiches,
    domaines: new Map(vivant(await base.domaines.toArray()).map((d) => [d.id, d])),
    typesRelation: new Map(vivant(await base.types_relation.toArray()).map((t) => [t.id, t])),
    // On ne garde que les liens dont les deux extrémités existent encore.
    relations: vivant(await base.relations.toArray()).filter((r) => fiches.has(r.source_id) && fiches.has(r.cible_id)),
    affirmations: vivant(await base.affirmations.toArray()).filter((a) => fiches.has(a.fiche_id)),
    dossierFiches: vivant(await base.dossier_fiches.toArray())
      .filter((l) => fiches.has(l.dossier_id) && fiches.has(l.fiche_id))
      .sort((a, b) => a.position - b.position),
  };
}

export interface RelationLisible {
  /** Libellé lu depuis la fiche courante (« a écrit » ou « écrit par »). */
  libelle: string;
  autre: Fiche;
  note: string;
  relation: Relation;
  sens: 'sortante' | 'entrante';
}

/** Relations d'une fiche, dans les deux sens, avec le bon libellé. */
export function relationsDe(ctx: Contexte, ficheId: string): RelationLisible[] {
  const liste: RelationLisible[] = [];
  for (const r of ctx.relations) {
    const type = ctx.typesRelation.get(r.type_relation_id);
    if (r.source_id === ficheId) {
      liste.push({ libelle: type?.nom ?? 'lié à', autre: ctx.fiches.get(r.cible_id)!, note: r.note, relation: r, sens: 'sortante' });
    } else if (r.cible_id === ficheId) {
      liste.push({ libelle: type?.nom_inverse || type?.nom || 'lié à', autre: ctx.fiches.get(r.source_id)!, note: r.note, relation: r, sens: 'entrante' });
    }
  }
  return liste.sort((a, b) => a.libelle.localeCompare(b.libelle, 'fr') || a.autre.titre.localeCompare(b.autre.titre, 'fr'));
}
