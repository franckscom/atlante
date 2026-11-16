// Structure commune à tous les écrans : en-tête (recherche, synchro), navigation, routes.
import { useEffect, useState } from 'react';
import { Link, NavLink, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { bd } from '../donnees/db';
import { JOURS_ALERTE_SAUVEGARDE } from '../config';
import { joursDepuisSauvegarde } from '../sauvegarde/sauvegarde';
import { FournisseurDonnees } from './donnees';
import { HoteConfirmation } from './composants/Confirmation';
import { IndicateurSynchro } from './composants/IndicateurSynchro';
import { PageFiches } from './pages/PageFiches';
import { PageFiche } from './pages/PageFiche';
import { PageEdition } from './pages/PageEdition';
import { PageDomaines } from './pages/PageDomaines';
import { PageImport } from './pages/PageImport';
import { PageSauvegarde } from './pages/PageSauvegarde';
import { PageReglages } from './pages/PageReglages';
import { PageConflits } from './pages/PageConflits';

/** Champ de recherche de l'en-tête : présent sur tous les écrans. */
function Recherche() {
  const naviguer = useNavigate();
  const lieu = useLocation();
  const [params] = useSearchParams();
  const surListe = lieu.pathname === '/' || lieu.pathname === '/fiches';
  const [texte, setTexte] = useState(surListe ? params.get('q') ?? '' : '');
  // Si l'adresse change (retour arrière, clic sur un lien), le champ suit.
  useEffect(() => {
    setTexte(surListe ? params.get('q') ?? '' : '');
  }, [surListe, params]);
  const chercher = (q: string) => {
    setTexte(q);
    const p = new URLSearchParams(surListe ? params : undefined);
    if (q) p.set('q', q);
    else p.delete('q');
    naviguer({ pathname: '/fiches', search: p.toString() }, { replace: surListe });
  };
  return (
    <form className="recherche" role="search" onSubmit={(e) => e.preventDefault()}>
      <input type="search" value={texte} onChange={(e) => chercher(e.target.value)} placeholder="Rechercher dans Atlante…" aria-label="Rechercher dans les fiches et les notes" />
    </form>
  );
}

function BandeauxGlobaux() {
  const jours = useLiveQuery(() => joursDepuisSauvegarde(bd), [], undefined);
  const nbFiches = useLiveQuery(() => bd.fiches.count(), [], 0);
  const { needRefresh: [nouvelleVersion], updateServiceWorker } = useRegisterSW();
  const lieu = useLocation();
  return (
    <>
      {nouvelleVersion && (
        <div className="bandeau ok">
          Une nouvelle version d'Atlante est prête.{' '}
          <button className="bouton discret" onClick={() => void updateServiceWorker(true)}>Mettre à jour</button>
        </div>
      )}
      {lieu.pathname !== '/sauvegarde' && nbFiches > 0 && jours !== undefined && (jours === null || jours > JOURS_ALERTE_SAUVEGARDE) && (
        <div className="bandeau attention">
          {jours === null ? 'Aucune sauvegarde chiffrée pour le moment.' : `Dernière sauvegarde il y a ${jours} jours.`}{' '}
          <Link to="/sauvegarde">Sauvegarder maintenant</Link>
        </div>
      )}
    </>
  );
}

export function App() {
  const lien = ({ isActive }: { isActive: boolean }) => (isActive ? 'actif' : '');
  const lieu = useLocation();
  const [params] = useSearchParams();
  const surDossiers = lieu.pathname === '/fiches' && params.get('type') === 'dossier';
  return (
    <FournisseurDonnees>
      <header className="entete">
        <div className="entete-ligne">
          <Link to="/fiches" className="marque">Atlante</Link>
          <Recherche />
          <IndicateurSynchro />
        </div>
        <nav className="nav" aria-label="Navigation principale">
          <NavLink to="/fiches" className={({ isActive }) => (isActive && !surDossiers ? 'actif' : '')} end>Fiches</NavLink>
          <NavLink to="/fiches?type=dossier" className={() => (surDossiers ? 'actif' : '')}>Dossiers</NavLink>
          <NavLink to="/domaines" className={lien}>Domaines</NavLink>
          <NavLink to="/import" className={lien}>Import</NavLink>
          <NavLink to="/sauvegarde" className={lien}>Sauvegarde et exports</NavLink>
          <NavLink to="/reglages" className={lien}>Réglages</NavLink>
        </nav>
      </header>
      <main className="page">
        <BandeauxGlobaux />
        <Routes>
          <Route path="/" element={<PageFiches />} />
          <Route path="/fiches" element={<PageFiches />} />
          <Route path="/nouvelle" element={<PageEdition />} />
          <Route path="/fiche/:id" element={<PageFiche />} />
          <Route path="/fiche/:id/modifier" element={<PageEdition />} />
          <Route path="/domaines" element={<PageDomaines />} />
          <Route path="/import" element={<PageImport />} />
          <Route path="/sauvegarde" element={<PageSauvegarde />} />
          <Route path="/reglages" element={<PageReglages />} />
          <Route path="/conflits" element={<PageConflits />} />
          <Route path="*" element={<PageFiches />} />
        </Routes>
      </main>
      <HoteConfirmation />
    </FournisseurDonnees>
  );
}
