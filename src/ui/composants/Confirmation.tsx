// Fenêtre de confirmation commune : toute suppression passe par elle.
import { useEffect, useRef, useState } from 'react';

interface Demande {
  titre: string;
  message: string;
  bouton: string;
  danger: boolean;
  repondre: (oui: boolean) => void;
}

let afficher: ((d: Demande) => void) | null = null;

/** Pose une question oui/non. Exemple : if (await confirmer({ titre: 'Supprimer ?', … })) { … } */
export function confirmer(options: { titre: string; message: string; bouton?: string; danger?: boolean }): Promise<boolean> {
  return new Promise((repondre) => {
    if (!afficher) return repondre(window.confirm(options.titre + '\n\n' + options.message));
    afficher({ titre: options.titre, message: options.message, bouton: options.bouton ?? 'Confirmer', danger: options.danger ?? false, repondre });
  });
}

/** À placer une fois dans l'app. */
export function HoteConfirmation() {
  const [demande, setDemande] = useState<Demande | null>(null);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    afficher = setDemande;
    return () => {
      afficher = null;
    };
  }, []);
  useEffect(() => {
    if (demande && ref.current && !ref.current.open) ref.current.showModal();
  }, [demande]);
  if (!demande) return null;
  const fermer = (oui: boolean) => {
    demande.repondre(oui);
    setDemande(null);
  };
  return (
    <dialog ref={ref} onCancel={() => fermer(false)} aria-labelledby="titre-confirmation">
      <h2 id="titre-confirmation" style={{ marginTop: 0 }}>{demande.titre}</h2>
      <p style={{ whiteSpace: 'pre-line' }}>{demande.message}</p>
      <div className="actions">
        <button className="bouton" onClick={() => fermer(false)} autoFocus>Annuler</button>
        <button className={'bouton ' + (demande.danger ? 'danger' : 'principal')} onClick={() => fermer(true)}>{demande.bouton}</button>
      </div>
    </dialog>
  );
}
