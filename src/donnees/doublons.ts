// Détection des doublons possibles avant de créer une fiche.
// L'app signale, elle ne décide jamais : c'est moi qui choisis de créer quand même ou non.
import type { Fiche } from '../modele/types';
import { normaliser } from '../utils/texte';

/** Ressemblance entre deux textes, de 0 (rien en commun) à 1 (identiques). Coefficient de Dice sur les paires de lettres. */
export function ressemblance(a: string, b: string): number {
  const x = normaliser(a);
  const y = normaliser(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const paires = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const p = s.slice(i, i + 2);
      m.set(p, (m.get(p) ?? 0) + 1);
    }
    return m;
  };
  const px = paires(x);
  const py = paires(y);
  let communs = 0;
  for (const [p, n] of px) communs += Math.min(n, py.get(p) ?? 0);
  const total = Math.max(1, x.length - 1) + Math.max(1, y.length - 1);
  return (2 * communs) / total;
}

/** Ramène une URL à sa forme comparable : sans protocole, « www », paramètres de suivi, ancre ni barre finale. */
export function normaliserUrl(url: string): string {
  let u = (url ?? '').trim().toLowerCase();
  if (!u) return '';
  u = u.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/#.*$/, '');
  const [chemin, requete] = u.split('?');
  const params = (requete ?? '')
    .split('&')
    .filter((p) => p && !/^(utm_[a-z]+|fbclid|gclid|mc_[a-z]+)=/.test(p))
    .sort();
  return chemin.replace(/\/+$/, '') + (params.length ? '?' + params.join('&') : '');
}

export interface DoublonPossible {
  fiche: Fiche;
  raison: string;
}

/** Cherche, parmi les fiches existantes, celles qui ressemblent à la fiche candidate. */
export function chercherDoublons(
  candidate: { id?: string; titre: string; auteur?: string; url?: string },
  existantes: Fiche[],
): DoublonPossible[] {
  const resultat: DoublonPossible[] = [];
  const url = normaliserUrl(candidate.url ?? '');
  for (const f of existantes) {
    if (f.deleted_at || f.id === candidate.id) continue;
    if (url && normaliserUrl(f.url) === url) {
      resultat.push({ fiche: f, raison: 'même URL' });
      continue;
    }
    const r = ressemblance(candidate.titre, f.titre);
    if (r === 1) resultat.push({ fiche: f, raison: 'même titre' });
    else if (r >= 0.8) resultat.push({ fiche: f, raison: 'titre très proche' });
    else if (r >= 0.6 && candidate.auteur && f.auteur && ressemblance(candidate.auteur, f.auteur) >= 0.8) {
      resultat.push({ fiche: f, raison: 'titre proche et même auteur' });
    }
  }
  return resultat;
}
