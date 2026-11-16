// Liste des fiches, avec recherche plein texte et filtres combinables.
// Les filtres vivent dans l'adresse (…/fiches?type=oeuvre&q=…) : on peut revenir en arrière ou mettre en favori.
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { filtrer, type Filtres } from '../../donnees/recherche';
import { STATUTS, TYPES_FICHE, type Statut, type TypeFiche } from '../../modele/types';
import { dateLisible } from '../../utils/texte';
import { useDonnees } from '../donnees';

const TAILLE_PAGE = 100;

export function PageFiches() {
  const { pret, ctx, corpus, index, domaines } = useDonnees();
  const [params, setParams] = useSearchParams();
  const [limite, setLimite] = useState(TAILLE_PAGE);
  const nombre = (cle: string) => (params.get(cle) && !isNaN(Number(params.get(cle))) ? Number(params.get(cle)) : null);
  const filtres: Filtres = {
    q: params.get('q') ?? '',
    type: (params.get('type') ?? '') as TypeFiche | '',
    domaine: params.get('domaine') ?? '',
    auteur: params.get('auteur') ?? '',
    statut: (params.get('statut') ?? '') as Statut | '',
    source: params.get('source') ?? '',
    dossier: params.get('dossier') ?? '',
    anneeMin: nombre('de'),
    anneeMax: nombre('a'),
  };
  const regler = (cle: string, valeur: string) => {
    const p = new URLSearchParams(params);
    if (valeur) p.set(cle, valeur);
    else p.delete(cle);
    setParams(p, { replace: true });
    setLimite(TAILLE_PAGE);
  };
  const resultats = useMemo(() => filtrer(corpus, index, filtres), [corpus, index, params]); // eslint-disable-line react-hooks/exhaustive-deps
  const sources = useMemo(() => corpus.fiches.filter((f) => f.type === 'source' || f.type === 'oeuvre').sort((a, b) => a.titre.localeCompare(b.titre, 'fr')), [corpus]);
  const nbFiltres = [...params.keys()].filter((k) => k !== 'q').length;
  const [filtresOuverts, setFiltresOuverts] = useState(nbFiltres > 0);
  const typeNouveau = filtres.type || 'note';
  const estDossiers = filtres.type === 'dossier';

  return (
    <>
      <div className="actions">
        <h1 style={{ margin: 0 }}>{estDossiers ? 'Dossiers thématiques' : 'Fiches'}</h1>
        <Link className="bouton principal droite" to={`/nouvelle?type=${typeNouveau}`}>
          {estDossiers ? 'Nouveau dossier' : 'Nouvelle fiche'}
        </Link>
      </div>

      <div className="actions">
        <button className="bouton" onClick={() => setFiltresOuverts(!filtresOuverts)} aria-expanded={filtresOuverts}>
          Filtres{nbFiltres ? ` (${nbFiltres})` : ''}
        </button>
        {(nbFiltres > 0 || filtres.q) && (
          <button className="bouton discret" onClick={() => setParams({}, { replace: true })}>Tout effacer</button>
        )}
        <span className="doux petit droite" aria-live="polite">
          {pret ? `${resultats.length} résultat${resultats.length > 1 ? 's' : ''}` : 'Chargement…'}
        </span>
      </div>

      {filtresOuverts && (
        <div className="carte grille">
          <div className="champ">
            <label htmlFor="f-type">Type</label>
            <select id="f-type" value={filtres.type} onChange={(e) => regler('type', e.target.value)}>
              <option value="">Tous</option>
              {Object.entries(TYPES_FICHE).map(([cle, nom]) => <option key={cle} value={cle}>{nom}</option>)}
            </select>
          </div>
          <div className="champ">
            <label htmlFor="f-domaine">Domaine</label>
            <select id="f-domaine" value={filtres.domaine} onChange={(e) => regler('domaine', e.target.value)}>
              <option value="">Tous</option>
              {domaines.map((d) => <option key={d.id} value={d.id}>{d.nom}</option>)}
            </select>
          </div>
          <div className="champ">
            <label htmlFor="f-auteur">Auteur</label>
            <input id="f-auteur" type="text" value={filtres.auteur} onChange={(e) => regler('auteur', e.target.value)} />
          </div>
          <div className="champ">
            <label htmlFor="f-statut">Contient une affirmation au statut</label>
            <select id="f-statut" value={filtres.statut} onChange={(e) => regler('statut', e.target.value)}>
              <option value="">Tous</option>
              {Object.entries(STATUTS).map(([cle, nom]) => <option key={cle} value={cle}>{nom}</option>)}
            </select>
          </div>
          <div className="champ">
            <label htmlFor="f-source">S'appuie sur la source</label>
            <select id="f-source" value={filtres.source} onChange={(e) => regler('source', e.target.value)}>
              <option value="">Toutes</option>
              {sources.map((s) => <option key={s.id} value={s.id}>{s.titre || 'Sans titre'}</option>)}
            </select>
          </div>
          <div className="champ">
            <label htmlFor="f-de">Année, de</label>
            <input id="f-de" type="number" inputMode="numeric" value={params.get('de') ?? ''} onChange={(e) => regler('de', e.target.value)} />
          </div>
          <div className="champ">
            <label htmlFor="f-a">Année, à</label>
            <input id="f-a" type="number" inputMode="numeric" value={params.get('a') ?? ''} onChange={(e) => regler('a', e.target.value)} />
          </div>
        </div>
      )}

      {pret && corpus.fiches.length === 0 && (
        <div className="carte">
          <h2>Atlante est vide pour l'instant</h2>
          <p>Crée ta première fiche, ou importe des fichiers texte ou Markdown.</p>
          <p className="doux petit">
            Tes données sont enregistrées sur cet appareil. Pour les retrouver sur tes autres appareils, connecte-toi dans <Link to="/reglages">Réglages</Link>.
          </p>
          <div className="actions">
            <Link className="bouton principal" to="/nouvelle?type=note">Nouvelle fiche</Link>
            <Link className="bouton" to="/import">Importer des fichiers</Link>
          </div>
        </div>
      )}

      <ul className="liste">
        {resultats.slice(0, limite).map((f) => (
          <li key={f.id}>
            <div className="ligne">
              <Link className="titre-fiche" to={`/fiche/${f.id}`}>{f.titre || 'Sans titre'}</Link>
              <span className="etiquette type">{TYPES_FICHE[f.type]}</span>
              {f.domaine_ids.map((d) => ctx.domaines.get(d)).filter(Boolean).map((d) => <span key={d!.id} className="etiquette">{d!.nom}</span>)}
            </div>
            <p className="extrait">
              {[f.auteur, f.date].filter(Boolean).join(', ')}
              {(f.auteur || f.date) && f.contenu ? ' · ' : ''}
              {f.contenu.slice(0, 240)}
            </p>
            <p className="doux petit" style={{ margin: 0 }}>Modifiée le {dateLisible(f.updated_at)}</p>
          </li>
        ))}
      </ul>
      {resultats.length > limite && (
        <div className="actions">
          <button className="bouton" onClick={() => setLimite(limite + TAILLE_PAGE)}>Afficher la suite ({resultats.length - limite} restantes)</button>
        </div>
      )}
      {pret && corpus.fiches.length > 0 && resultats.length === 0 && <p className="doux">Aucune fiche ne correspond.</p>}
    </>
  );
}
