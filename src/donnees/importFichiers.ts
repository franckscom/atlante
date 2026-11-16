// Import de fichiers texte et Markdown. Chaque fichier devient une NOUVELLE fiche :
// un import n'écrase jamais rien.
import type { BaseAtlante } from './db';
import { creer, fabriquerFiche } from './depot';
import type { Fiche, TypeFiche } from '../modele/types';

export interface FichierLu {
  nom: string;
  texte: string;
}

export interface FicheCandidate {
  fichier: string;
  titre: string;
  contenu: string;
  auteur: string;
  url: string;
  date: string;
}

/**
 * Prépare une fiche à partir d'un fichier.
 * Titre : champ « title/titre » de l'en-tête YAML, sinon premier titre « # », sinon nom du fichier.
 */
export function analyserFichier(f: FichierLu): FicheCandidate {
  let texte = f.texte.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  const meta: Record<string, string> = {};
  const enTete = /^---\n([\s\S]*?)\n---\n?/.exec(texte);
  if (enTete) {
    for (const ligne of enTete[1].split('\n')) {
      const m = /^([A-Za-zÀ-ÿ_]+)\s*:\s*(.+)$/.exec(ligne);
      if (m) meta[m[1].toLowerCase()] = m[2].trim().replace(/^["'](.*)["']$/, '$1');
    }
    texte = texte.slice(enTete[0].length);
  }
  let titre = meta.titre ?? meta.title ?? '';
  const h1 = /^\s*#\s+(.+)\n?/.exec(texte);
  if (h1) {
    if (!titre) titre = h1[1].trim();
    // Le titre devient celui de la fiche : inutile de le répéter en tête du contenu.
    if (h1[1].trim() === titre) texte = texte.slice(h1[0].length);
  }
  if (!titre) titre = f.nom.replace(/\.(md|markdown|txt)$/i, '');
  return {
    fichier: f.nom,
    titre,
    contenu: texte.trim(),
    auteur: meta.auteur ?? meta.author ?? '',
    url: meta.url ?? meta.source ?? '',
    date: meta.date ?? '',
  };
}

/** Crée les fiches retenues, en gardant la provenance (nom du fichier, date d'acquisition). */
export async function importerCandidates(base: BaseAtlante, candidates: FicheCandidate[], type: TypeFiche, domaineIds: string[]): Promise<Fiche[]> {
  const creees: Fiche[] = [];
  const acquis_le = new Date().toISOString();
  for (const c of candidates) {
    creees.push(
      await creer(base, 'fiches', {
        ...fabriquerFiche(type, c.titre),
        contenu: c.contenu,
        auteur: c.auteur,
        url: c.url,
        date: c.date,
        domaine_ids: domaineIds,
        provenance: { mode: 'fichier', fichier: c.fichier, acquis_le },
      }),
    );
  }
  return creees;
}
