// Pastille d'état de la synchro, visible sur tous les écrans.
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { bd } from '../../donnees/db';
import { compterEnAttente } from '../../synchro/moteur';
import { useEtatSynchro, type EtatSynchro } from '../../synchro/etat';

export interface Affichage {
  classe: 'ok' | 'attente' | 'erreur' | 'cours' | '';
  court: string;
  long: string;
  vers: string;
}

/** Choisit le message à afficher. L'ordre des tests fixe la priorité. */
export function affichageSynchro(e: EtatSynchro, enAttente: number, conflits: number): Affichage {
  const attente = enAttente > 0 ? ` (${enAttente} en attente)` : '';
  if (!e.enLigne) return { classe: 'attente', court: 'Hors ligne', long: 'Hors ligne' + attente, vers: '/reglages' };
  if (!e.utilisateur) return { classe: '', court: 'Local', long: 'Non connecté : données sur cet appareil seulement', vers: '/reglages' };
  if (e.phase === 'en_cours') return { classe: 'cours', court: 'Synchro…', long: 'Synchronisation…', vers: '/reglages' };
  if (conflits > 0) return { classe: 'erreur', court: `${conflits} conflit${conflits > 1 ? 's' : ''}`, long: `${conflits} conflit${conflits > 1 ? 's' : ''} à trancher`, vers: '/conflits' };
  if (e.phase === 'injoignable') return { classe: 'erreur', court: 'Serveur en pause', long: 'Serveur en pause ou injoignable' + attente, vers: '/reglages' };
  if (e.phase === 'erreur') return { classe: 'erreur', court: 'Erreur', long: 'Erreur de synchro' + attente, vers: '/reglages' };
  if (enAttente > 0) return { classe: 'attente', court: 'En attente', long: `En attente : ${enAttente} modification${enAttente > 1 ? 's' : ''} à envoyer`, vers: '/reglages' };
  return { classe: 'ok', court: 'Synchronisé', long: 'Synchronisé', vers: '/reglages' };
}

export function IndicateurSynchro() {
  const etat = useEtatSynchro();
  const enAttente = useLiveQuery(() => compterEnAttente(bd), [], 0);
  const conflits = useLiveQuery(() => bd.conflits.count(), [], 0);
  const a = affichageSynchro(etat, enAttente, conflits);
  return (
    <Link to={a.vers} className={'synchro ' + a.classe} title={a.long} aria-label={'État de la synchronisation : ' + a.long}>
      <span className="pastille" aria-hidden="true" />
      {a.court}
    </Link>
  );
}
