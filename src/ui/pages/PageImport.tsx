// Import de fichiers texte et Markdown, avec contrôle des doublons AVANT création.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { bd, ecrireMeta, lireMeta } from '../../donnees/db';
import { chercherDoublons } from '../../donnees/doublons';
import { analyserFichier, importerCandidates, type FicheCandidate } from '../../donnees/importFichiers';
import { TYPES_FICHE, type Fiche, type TypeFiche } from '../../modele/types';
import { dateLisible } from '../../utils/texte';
import { useDonnees } from '../donnees';

interface Ligne {
  candidate: FicheCandidate;
  retenue: boolean;
}

export function PageImport() {
  const { corpus, domaines } = useDonnees();
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [type, setType] = useState<TypeFiche>('note');
  const [domaineIds, setDomaineIds] = useState<string[]>([]);
  const [erreur, setErreur] = useState('');
  const [creees, setCreees] = useState<Fiche[] | null>(null);
  const dernier = useLiveQuery(() => lireMeta<{ date: string; nombre: number } | null>(bd, 'dernier_import', null), [], null);

  const lire = async (fichiers: FileList | null) => {
    setErreur('');
    setCreees(null);
    if (!fichiers?.length) return;
    const lues: Ligne[] = [];
    const refuses: string[] = [];
    for (const f of Array.from(fichiers)) {
      if (!/\.(md|markdown|txt)$/i.test(f.name) && !f.type.startsWith('text/')) {
        refuses.push(f.name);
        continue;
      }
      const candidate = analyserFichier({ nom: f.name, texte: await f.text() });
      // Un doublon possible n'est pas coché d'office : c'est à toi de décider.
      lues.push({ candidate, retenue: chercherDoublons(candidate, corpus.fiches).length === 0 });
    }
    if (refuses.length) setErreur(`Fichiers ignorés (seuls .txt et .md sont acceptés en V1) : ${refuses.join(', ')}`);
    setLignes(lues);
  };

  const importer = async () => {
    const retenues = lignes.filter((l) => l.retenue).map((l) => l.candidate);
    const resultat = await importerCandidates(bd, retenues, type, domaineIds);
    await ecrireMeta(bd, 'dernier_import', { date: new Date().toISOString(), nombre: resultat.length });
    setCreees(resultat);
    setLignes([]);
  };

  const nbRetenues = lignes.filter((l) => l.retenue).length;

  return (
    <div className="etroit">
      <h1>Import</h1>
      <p className="doux">
        Chaque fichier texte (.txt) ou Markdown (.md) devient une nouvelle fiche. Un import ne modifie et n'écrase jamais une fiche existante.
        Le nom du fichier et la date d'acquisition sont conservés.
      </p>
      <p className="doux petit">
        Dernier import : {dernier ? `${dateLisible(dernier.date)} (${dernier.nombre} fiche${dernier.nombre > 1 ? 's' : ''})` : 'aucun'}.
        Pour enregistrer une URL ou une référence bibliographique, <Link to="/nouvelle?type=source">crée une fiche Source</Link>.
      </p>

      <div className="carte">
        <div className="champ">
          <label htmlFor="i-fichiers">Fichiers à importer</label>
          <input id="i-fichiers" type="file" multiple accept=".txt,.md,.markdown,text/plain,text/markdown" onChange={(e) => { void lire(e.target.files); e.target.value = ''; }} />
        </div>
        {erreur && <div className="bandeau attention" role="alert">{erreur}</div>}

        {lignes.length > 0 && (
          <>
            <div className="grille">
              <div className="champ">
                <label htmlFor="i-type">Type des fiches créées</label>
                <select id="i-type" value={type} onChange={(e) => setType(e.target.value as TypeFiche)}>
                  {Object.entries(TYPES_FICHE).filter(([c]) => c !== 'dossier').map(([cle, nom]) => <option key={cle} value={cle}>{nom}</option>)}
                </select>
              </div>
            </div>
            <fieldset style={{ border: 0, padding: 0, margin: '0 0 14px' }}>
              <legend className="doux petit" style={{ padding: 0 }}>Domaines à attribuer</legend>
              <div className="cases">
                {domaines.map((d) => (
                  <label key={d.id}>
                    <input type="checkbox" checked={domaineIds.includes(d.id)} onChange={(e) => setDomaineIds(e.target.checked ? [...domaineIds, d.id] : domaineIds.filter((x) => x !== d.id))} />
                    {d.nom}
                  </label>
                ))}
              </div>
            </fieldset>
            <h3>Aperçu avant création</h3>
            <ul className="liste">
              {lignes.map((l, i) => {
                const doublons = chercherDoublons(l.candidate, corpus.fiches);
                return (
                  <li key={i}>
                    <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--texte)', fontSize: '1rem' }}>
                      <input type="checkbox" checked={l.retenue} onChange={(e) => setLignes(lignes.map((x, j) => (j === i ? { ...x, retenue: e.target.checked } : x)))} />
                      <input
                        type="text"
                        value={l.candidate.titre}
                        aria-label={`Titre de la fiche tirée de ${l.candidate.fichier}`}
                        onChange={(e) => setLignes(lignes.map((x, j) => (j === i ? { ...x, candidate: { ...x.candidate, titre: e.target.value } } : x)))}
                      />
                    </label>
                    <div className="doux petit">{l.candidate.fichier} · {l.candidate.contenu.length} caractères</div>
                    {doublons.length > 0 && (
                      <div className="bandeau attention petit" style={{ marginTop: 6 }}>
                        Doublon possible :{' '}
                        {doublons.slice(0, 3).map((d, k) => (
                          <span key={d.fiche.id}>{k > 0 && ', '}<Link to={`/fiche/${d.fiche.id}`} target="_blank">{d.fiche.titre}</Link> ({d.raison})</span>
                        ))}
                        . Coche la case pour créer quand même une nouvelle fiche.
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="actions">
              <button className="bouton principal" onClick={importer} disabled={nbRetenues === 0}>
                Créer {nbRetenues} fiche{nbRetenues > 1 ? 's' : ''}
              </button>
              <button className="bouton" onClick={() => setLignes([])}>Annuler</button>
            </div>
          </>
        )}

        {creees && (
          <div className="bandeau ok" role="status">
            {creees.length} fiche{creees.length > 1 ? 's' : ''} créée{creees.length > 1 ? 's' : ''} :
            <ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>
              {creees.map((f) => <li key={f.id}><Link to={`/fiche/${f.id}`}>{f.titre}</Link></li>)}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
