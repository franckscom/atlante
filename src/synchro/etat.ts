// État de la synchro et de la session, partagé par toute l'interface,
// et déclenchement automatique de la synchro.
import { useSyncExternalStore } from 'react';
import { liveQuery } from 'dexie';
import { bd } from '../donnees/db';
import { ErreurDistante } from './distant';
import { DistantSupabase } from './distantSupabase';
import { compterEnAttente, ErreurAutreCompte, synchroniser } from './moteur';
import { supabase } from './supabase';

export type Phase =
  | 'repos'
  | 'en_cours'
  /** Serveur en pause ou injoignable alors que l'appareil a Internet. */
  | 'injoignable'
  | 'erreur';

export interface EtatSynchro {
  /** null = pas connecté à un compte. */
  utilisateur: { id: string; email: string } | null;
  sessionChargee: boolean;
  enLigne: boolean;
  phase: Phase;
  message: string;
  /** Lignes refusées par le serveur lors de la dernière synchro. */
  erreursLignes: string[];
  derniereReussite: string | null;
}

let etat: EtatSynchro = {
  utilisateur: null,
  sessionChargee: false,
  enLigne: typeof navigator === 'undefined' ? true : navigator.onLine,
  phase: 'repos',
  message: '',
  erreursLignes: [],
  derniereReussite: null,
};
const abonnes = new Set<() => void>();

function maj(changements: Partial<EtatSynchro>) {
  etat = { ...etat, ...changements };
  abonnes.forEach((f) => f());
}

/** Hook React : donne l'état courant et redessine l'écran quand il change. */
export function useEtatSynchro(): EtatSynchro {
  return useSyncExternalStore(
    (f) => {
      abonnes.add(f);
      return () => abonnes.delete(f);
    },
    () => etat,
  );
}

export const MESSAGE_INJOIGNABLE = 'Synchro impossible : serveur en pause ou injoignable';

let enCours = false;
let redemander = false;
let passageEnCours: Promise<void> = Promise.resolve();

/** Lance une synchronisation (bouton « Synchroniser maintenant » et déclenchements automatiques). */
export function lancerSynchro(): Promise<void> {
  if (!etat.utilisateur || !etat.enLigne) return Promise.resolve();
  if (enCours) {
    // Une synchro tourne déjà : on en demande une autre juste après, et on attend la fin de celle en cours.
    redemander = true;
    return passageEnCours;
  }
  passageEnCours = unPassage();
  return passageEnCours;
}

async function unPassage(): Promise<void> {
  if (!etat.utilisateur) return;
  enCours = true;
  maj({ phase: 'en_cours', message: '' });
  try {
    const bilan = await synchroniser(bd, new DistantSupabase(supabase), etat.utilisateur.id);
    maj({
      phase: bilan.erreurs.length ? 'erreur' : 'repos',
      message: bilan.erreurs.length ? `${bilan.erreurs.length} élément(s) refusé(s) par le serveur` : '',
      erreursLignes: bilan.erreurs,
      derniereReussite: new Date().toISOString(),
    });
  } catch (e) {
    if (e instanceof ErreurDistante && (e.genre === 'reseau' || e.genre === 'serveur')) {
      maj({ phase: 'injoignable', message: MESSAGE_INJOIGNABLE });
    } else if (e instanceof ErreurDistante && e.genre === 'auth') {
      maj({ phase: 'erreur', message: 'Session expirée : reconnecte-toi dans Réglages.' });
    } else if (e instanceof ErreurAutreCompte) {
      maj({ phase: 'erreur', message: e.message + ' Efface les données locales (Réglages) avant de synchroniser ce compte.' });
    } else {
      maj({ phase: 'erreur', message: e instanceof Error ? e.message : String(e) });
    }
  } finally {
    enCours = false;
    if (redemander) {
      redemander = false;
      void lancerSynchro();
    }
  }
}

let demarre = false;

/** À appeler une fois au lancement de l'app. */
export function demarrerSynchroAuto(): void {
  if (demarre) return;
  demarre = true;

  // Session : restaurée depuis l'appareil au démarrage, puis suivie.
  supabase.auth.onAuthStateChange((_evenement, session) => {
    const avant = etat.utilisateur?.id;
    const utilisateur = session?.user ? { id: session.user.id, email: session.user.email ?? '' } : null;
    maj({ utilisateur, sessionChargee: true, ...(utilisateur ? {} : { phase: 'repos' as Phase, message: '' }) });
    // setTimeout : Supabase déconseille d'appeler son API directement dans ce rappel.
    if (utilisateur && utilisateur.id !== avant) setTimeout(() => void lancerSynchro(), 0);
  });

  window.addEventListener('online', () => {
    maj({ enLigne: true });
    void lancerSynchro();
  });
  window.addEventListener('offline', () => maj({ enLigne: false }));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void lancerSynchro();
  });
  // Filet de sécurité : toutes les 5 minutes tant que l'app est ouverte.
  setInterval(() => void lancerSynchro(), 5 * 60 * 1000);

  // Dès qu'une modification locale attend, on synchronise après 4 secondes de calme.
  let minuterie: ReturnType<typeof setTimeout> | undefined;
  liveQuery(() => compterEnAttente(bd)).subscribe((n) => {
    if (n === 0) return;
    clearTimeout(minuterie);
    minuterie = setTimeout(() => void lancerSynchro(), 4000);
  });
}
