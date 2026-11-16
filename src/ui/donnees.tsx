// Met les données locales à disposition de tous les écrans, et les rafraîchit
// automatiquement dès que la base change (y compris après une synchro).
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type MiniSearch from 'minisearch';
import { bd } from '../donnees/db';
import { construireIndex, type Corpus } from '../donnees/recherche';
import type { Contexte } from '../exports/contexte';
import type { Domaine, TypeRelation } from '../modele/types';

export interface Donnees {
  pret: boolean;
  /** Tout ce qui n'est pas supprimé, prêt à l'emploi. */
  ctx: Contexte;
  corpus: Corpus;
  index: MiniSearch;
  domaines: Domaine[];
  typesRelation: TypeRelation[];
}

const ContexteDonnees = createContext<Donnees | null>(null);

export function FournisseurDonnees({ children }: { children: ReactNode }) {
  const brut = useLiveQuery(async () => ({
    fiches: await bd.fiches.toArray(),
    domaines: await bd.domaines.toArray(),
    types: await bd.types_relation.toArray(),
    relations: await bd.relations.toArray(),
    affirmations: await bd.affirmations.toArray(),
    dossierFiches: await bd.dossier_fiches.toArray(),
  }));

  const donnees = useMemo<Donnees>(() => {
    const b = brut ?? { fiches: [], domaines: [], types: [], relations: [], affirmations: [], dossierFiches: [] };
    const vivant = <T extends { deleted_at: string | null }>(l: T[]) => l.filter((x) => !x.deleted_at);
    const fiches = new Map(vivant(b.fiches).map((f) => [f.id, f]));
    const domaines = vivant(b.domaines).sort((x, y) => x.created_at.localeCompare(y.created_at) || x.nom.localeCompare(y.nom, 'fr'));
    const typesRelation = vivant(b.types).sort((x, y) => x.nom.localeCompare(y.nom, 'fr'));
    const ctx: Contexte = {
      fiches,
      domaines: new Map(domaines.map((d) => [d.id, d])),
      typesRelation: new Map(typesRelation.map((t) => [t.id, t])),
      relations: vivant(b.relations).filter((r) => fiches.has(r.source_id) && fiches.has(r.cible_id)),
      affirmations: vivant(b.affirmations).filter((a) => fiches.has(a.fiche_id)).sort((x, y) => x.created_at.localeCompare(y.created_at)),
      dossierFiches: vivant(b.dossierFiches)
        .filter((l) => fiches.has(l.dossier_id) && fiches.has(l.fiche_id))
        .sort((x, y) => x.position - y.position || x.created_at.localeCompare(y.created_at)),
    };
    const corpus: Corpus = { fiches: [...fiches.values()], affirmations: ctx.affirmations, relations: ctx.relations, dossierFiches: ctx.dossierFiches };
    return { pret: brut !== undefined, ctx, corpus, index: construireIndex(corpus), domaines, typesRelation };
  }, [brut]);

  return <ContexteDonnees.Provider value={donnees}>{children}</ContexteDonnees.Provider>;
}

export function useDonnees(): Donnees {
  const d = useContext(ContexteDonnees);
  if (!d) throw new Error('useDonnees doit être utilisé sous FournisseurDonnees');
  return d;
}
