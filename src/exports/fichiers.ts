// Remise d'un fichier à l'utilisateur (téléchargement) et création d'archives ZIP.
import { strToU8, zipSync } from 'fflate';

/** Assemble des fichiers texte dans une archive ZIP. */
export function creerZip(fichiers: Record<string, string>): Uint8Array {
  const entrees: Record<string, Uint8Array> = {};
  for (const [chemin, contenu] of Object.entries(fichiers)) entrees[chemin] = strToU8(contenu);
  return zipSync(entrees, { level: 6 });
}

/**
 * Enregistre un fichier sur l'appareil.
 * Sur iPhone, une app installée sur l'écran d'accueil ne sait pas toujours télécharger :
 * on passe alors par la feuille de partage (« Enregistrer dans Fichiers »).
 */
export async function enregistrerFichier(contenu: string | Uint8Array, nom: string, mime: string): Promise<void> {
  const blob = new Blob([contenu as BlobPart], { type: mime });
  const autonome = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (ios && autonome && navigator.canShare) {
    const fichier = new File([blob], nom, { type: mime });
    if (navigator.canShare({ files: [fichier] })) {
      try {
        await navigator.share({ files: [fichier], title: nom });
        return;
      } catch (e) {
        if ((e as Error).name === 'AbortError') return; // partage annulé par moi
        // sinon : on tente le téléchargement classique ci-dessous
      }
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nom;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
