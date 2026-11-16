// Recherche plein texte locale (MiniSearch) et filtres combinables. Fonctionne hors ligne.
import MiniSearch from 'minisearch';
import type { Affirmation, DossierFiche, Fiche, Relation, Statut, TypeFiche } from '../modele/types';
import { anneeDe, normaliser } from '../utils/texte';

export interface Filtres {
  q?: string;
  type?: TypeFiche | '';
  domaine?: string;
  auteur?: string;
  statut?: Statut | '';
  /** Identifiant d'une fiche source : garde les fiches qui s'appuient sur elle. */
  source?: string;
  anneeMin?: number | null;
  anneeMax?: number | null;
  dossier?: string;
}

export interface Corpus {
  fiches: Fiche[];
  affirmations: Affirmation[];
  relations: Relation[];
  dossierFiches: DossierFiche[];
}

/** Construit l'index de recherche à partir des fiches et de leurs affirmations. */
export function construireIndex(corpus: Corpus): MiniSearch {
  const index = new MiniSearch({
    fields: ['titre', 'auteur', 'contenu', 'champs', 'affirmations'],
    storeFields: ['id'],
    // Les accents et la casse ne comptent pas : « hégémonie » trouve « Hegemonie ».
    processTerm: (terme) => normaliser(terme) || null,
    searchOptions: { boost: { titre: 3, auteur: 2 }, prefix: true, fuzzy: 0.15, combineWith: 'AND' },
  });
  const parFiche = new Map<string, string[]>();
  for (const a of corpus.affirmations) {
    if (a.deleted_at) continue;
    const liste = parFiche.get(a.fiche_id) ?? [];
    liste.push(a.texte, a.note);
    parFiche.set(a.fiche_id, liste);
  }
  index.addAll(
    corpus.fiches
      .filter((f) => !f.deleted_at)
      .map((f) => ({
        id: f.id,
        titre: f.titre,
        auteur: f.auteur,
        contenu: f.contenu + ' ' + f.url + ' ' + f.date,
        champs: Object.values(f.champs ?? {}).join(' '),
        affirmations: (parFiche.get(f.id) ?? []).join(' '),
      })),
  );
  return index;
}

/** Applique la recherche et les filtres. Sans texte cherché : tri par dernière modification. */
export function filtrer(corpus: Corpus, index: MiniSearch, filtres: Filtres): Fiche[] {
  const vivantes = corpus.fiches.filter((f) => !f.deleted_at);
  let resultat: Fiche[];
  const q = (filtres.q ?? '').trim();
  if (q) {
    const parId = new Map(vivantes.map((f) => [f.id, f]));
    resultat = index.search(q).map((r) => parId.get(r.id as string)).filter((f): f is Fiche => !!f);
  } else {
    resultat = [...vivantes].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }
  if (filtres.type) resultat = resultat.filter((f) => f.type === filtres.type);
  if (filtres.domaine) resultat = resultat.filter((f) => f.domaine_ids.includes(filtres.domaine!));
  if (filtres.auteur?.trim()) {
    const a = normaliser(filtres.auteur);
    resultat = resultat.filter((f) => normaliser(f.auteur).includes(a));
  }
  if (filtres.statut) {
    const ids = new Set(corpus.affirmations.filter((a) => !a.deleted_at && a.statut === filtres.statut).map((a) => a.fiche_id));
    resultat = resultat.filter((f) => ids.has(f.id));
  }
  if (filtres.source) {
    // Une fiche « s'appuie » sur une source si une de ses affirmations la cite, ou si une relation les lie.
    const ids = new Set<string>();
    for (const a of corpus.affirmations) if (!a.deleted_at && a.source_id === filtres.source) ids.add(a.fiche_id);
    for (const r of corpus.relations) {
      if (r.deleted_at) continue;
      if (r.cible_id === filtres.source) ids.add(r.source_id);
      if (r.source_id === filtres.source) ids.add(r.cible_id);
    }
    resultat = resultat.filter((f) => ids.has(f.id));
  }
  if (filtres.dossier) {
    const ids = new Set(corpus.dossierFiches.filter((l) => !l.deleted_at && l.dossier_id === filtres.dossier).map((l) => l.fiche_id));
    resultat = resultat.filter((f) => ids.has(f.id));
  }
  if (filtres.anneeMin != null || filtres.anneeMax != null) {
    resultat = resultat.filter((f) => {
      const an = anneeDe(f.date);
      if (an === null) return false;
      if (filtres.anneeMin != null && an < filtres.anneeMin) return false;
      if (filtres.anneeMax != null && an > filtres.anneeMax) return false;
      return true;
    });
  }
  return resultat;
}
