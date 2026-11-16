// Point d'entrée de l'app : prépare la base locale, puis affiche l'interface.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import './styles.css';
import { App } from './ui/App';
import { bd, semerSiPremierLancement } from './donnees/db';
import { demarrerSynchroAuto } from './synchro/etat';
import { retourLienEmail, supabase } from './synchro/supabase';

async function demarrer() {
  // Retour d'un lien reçu par e-mail : on laisse Supabase lire les paramètres, puis on va aux Réglages.
  if (retourLienEmail.present) {
    await supabase.auth.getSession().catch(() => undefined);
    window.location.hash = '#/reglages';
  }
  await semerSiPremierLancement(bd);
  demarrerSynchroAuto();
  createRoot(document.getElementById('racine')!).render(
    <StrictMode>
      {/* HashRouter : les adresses sont de la forme /atlante/#/fiche/…, ce qui fonctionne sur GitHub Pages sans réglage serveur. */}
      <HashRouter>
        <App />
      </HashRouter>
    </StrictMode>,
  );
}

void demarrer();
