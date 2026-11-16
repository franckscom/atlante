// Conflits de synchro : la même ligne a été modifiée sur deux appareils.
// L'app montre les deux versions ; c'est moi qui choisis.
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { bd } from '../../donnees/db';
import { COLONNES, LIBELLES_TABLES, STATUTS, TYPES_FICHE, type Conflit, type Ligne } from '../../modele/types';
import { lancerSynchro } from '../../synchro/etat';
import { resoudreConflit } from '../../synchro/moteur';
import { dateLisible, egal } from '../../utils/texte';
import { confirmer } from '../composants/Confirmation';
import { useDonnees } from '../donnees';

const LIBELLES: Record<string, string> = {
  nom: 'Nom', nom_inverse: 'Nom inverse', description: 'Description', type: 'Type', titre: 'Titre', contenu: 'Contenu', auteur: 'Auteur',
  url: 'URL', date: 'Date', domaine_ids: 'Domaines', champs: 'Champs', provenance: 'Provenance', source_id: 'Source', cible_id: 'Cible',
  type_relation_id: 'Relation', note: 'Note', fiche_id: 'Fiche', texte: 'Texte', statut: 'Statut', localisation: 'Page ou section',
  dossier_id: 'Dossier', position: 'Position',
};

export function PageConflits() {
  const conflits = useLiveQuery(() => bd.conflits.toArray(), [], [] as Conflit[]);
  const { ctx } = useDonnees();

  /** Rend une valeur lisible : titres plutôt qu'identifiants. */
  const lisible = (colonne: string, v: unknown): string => {
    if (v === null || v === undefined || v === '') return '(vide)';
    if (colonne === 'domaine_ids') return (v as string[]).map((d) => ctx.domaines.get(d)?.nom ?? '?').join(', ') || '(aucun)';
    if (['source_id', 'cible_id', 'fiche_id', 'dossier_id'].includes(colonne)) return ctx.fiches.get(v as string)?.titre ?? String(v);
    if (colonne === 'type_relation_id') return ctx.typesRelation.get(v as string)?.nom ?? String(v);
    if (colonne === 'type') return TYPES_FICHE[v as keyof typeof TYPES_FICHE] ?? String(v);
    if (colonne === 'statut') return STATUTS[v as keyof typeof STATUTS] ?? String(v);
    if (typeof v === 'object') return Object.entries(v as object).map(([k, x]) => `${k} : ${x}`).join('\n') || '(vide)';
    return String(v);
  };

  const resoudre = async (c: Conflit, choix: 'locale' | 'distante') => {
    await resoudreConflit(bd, c.cle, choix);
    void lancerSynchro();
  };
  const toutResoudre = async (choix: 'locale' | 'distante') => {
    const ok = await confirmer({
      titre: choix === 'locale' ? 'Garder partout la version de cet appareil ?' : 'Prendre partout la version du serveur ?',
      message: `Ce choix s'applique aux ${conflits.length} conflits. L'autre version de chaque élément sera abandonnée.`,
      bouton: 'Appliquer à tous',
      danger: true,
    });
    if (!ok) return;
    for (const c of conflits) await resoudreConflit(bd, c.cle, choix);
    void lancerSynchro();
  };

  const nom = (c: Conflit) => {
    const l = c.locale as unknown as Record<string, unknown>;
    return (l.titre ?? l.nom ?? l.texte ?? '') as string;
  };

  return (
    <div>
      <h1>Conflits de synchronisation</h1>
      {conflits.length === 0 ? (
        <p>Aucun conflit. <Link to="/fiches">Retour aux fiches</Link></p>
      ) : (
        <>
          <p className="doux">
            Ces éléments ont été modifiés ici et sur un autre appareil avant d'avoir pu se synchroniser. Rien n'a été écrasé : choisis la version à garder.
            Seules les différences sont affichées.
          </p>
          {conflits.length > 1 && (
            <div className="actions">
              <button className="bouton" onClick={() => toutResoudre('locale')}>Tout : garder cet appareil</button>
              <button className="bouton" onClick={() => toutResoudre('distante')}>Tout : prendre le serveur</button>
            </div>
          )}
          {conflits.map((c) => {
            const colonnes = (COLONNES[c.table] as string[]).filter((col) => !egal((c.locale as any)[col], (c.distante as any)[col]));
            const version = (l: Ligne) => (
              <>
                <p className="petit doux" style={{ margin: '0 0 6px' }}>Modifiée le {dateLisible(l.updated_at)}</p>
                {l.deleted_at ? (
                  <p><strong>Supprimée</strong></p>
                ) : (
                  colonnes.map((col) => (
                    <div key={col} style={{ marginBottom: 8 }}>
                      <div className="petit doux">{LIBELLES[col] ?? col}</div>
                      <pre>{lisible(col, (l as any)[col])}</pre>
                    </div>
                  ))
                )}
              </>
            );
            return (
              <div className="carte" key={c.cle}>
                <h2>{LIBELLES_TABLES[c.table]} : {nom(c) || 'élément sans nom'}</h2>
                <div className="deux-colonnes">
                  <div className="version">
                    <h3>Version de cet appareil</h3>
                    {version(c.locale)}
                    <button className="bouton principal" onClick={() => resoudre(c, 'locale')}>Garder cette version</button>
                  </div>
                  <div className="version">
                    <h3>Version du serveur</h3>
                    {version(c.distante)}
                    <button className="bouton principal" onClick={() => resoudre(c, 'distante')}>Garder cette version</button>
                  </div>
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
