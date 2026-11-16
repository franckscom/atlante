// Export Markdown : une fiche par fichier, lisible dans n'importe quel éditeur (Obsidian, VS Code, Bloc-notes…).
// Les relations deviennent des liens entre fichiers.
import { CHAMPS_PAR_TYPE, STATUTS, TYPES_FICHE, type Fiche } from '../modele/types';
import { nomFichierSur } from '../utils/texte';
import { relationsDe, type Contexte } from './contexte';

/** Attribue à chaque fiche un nom de fichier unique et stable. */
export function nomsDeFichiers(ctx: Contexte): Map<string, string> {
  const noms = new Map<string, string>();
  const pris = new Set<string>();
  const fiches = [...ctx.fiches.values()].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  for (const f of fiches) {
    let nom = `${f.type}/${nomFichierSur(f.titre)}`;
    if (pris.has(nom)) nom += '-' + f.id.slice(0, 8);
    pris.add(nom);
    noms.set(f.id, nom + '.md');
  }
  return noms;
}

const yaml = (v: string) => JSON.stringify(v ?? '');

/** Texte Markdown d'une fiche. « noms » sert à écrire les liens vers les autres fiches. */
export function ficheEnMarkdown(ctx: Contexte, fiche: Fiche, noms: Map<string, string>): string {
  // Depuis type/fichier.md, un lien vers une autre fiche remonte d'un dossier.
  const lien = (f: Fiche) => `[${f.titre || 'Sans titre'}](../${encodeURI(noms.get(f.id) ?? '')})`;
  const domaines = fiche.domaine_ids.map((id) => ctx.domaines.get(id)?.nom).filter((n): n is string => !!n);
  const l: string[] = ['---'];
  l.push(`id: ${fiche.id}`, `type: ${yaml(TYPES_FICHE[fiche.type])}`, `titre: ${yaml(fiche.titre)}`);
  if (fiche.auteur) l.push(`auteur: ${yaml(fiche.auteur)}`);
  if (fiche.date) l.push(`date: ${yaml(fiche.date)}`);
  if (fiche.url) l.push(`url: ${yaml(fiche.url)}`);
  if (domaines.length) l.push('domaines:', ...domaines.map((d) => `  - ${yaml(d)}`));
  for (const c of CHAMPS_PAR_TYPE[fiche.type]) if (fiche.champs?.[c.cle]) l.push(`${c.cle}: ${yaml(fiche.champs[c.cle])}`);
  if (fiche.provenance) {
    l.push(`provenance: ${yaml(fiche.provenance.mode === 'fichier' ? `fichier importé : ${fiche.provenance.fichier ?? ''}` : 'saisie manuelle')}`);
    l.push(`acquis_le: ${fiche.provenance.acquis_le}`);
  }
  l.push(`cree_le: ${fiche.created_at}`, `modifie_le: ${fiche.updated_at}`, '---', '', `# ${fiche.titre || 'Sans titre'}`, '');
  if (fiche.contenu.trim()) l.push(fiche.contenu.trim(), '');

  const affirmations = ctx.affirmations.filter((a) => a.fiche_id === fiche.id);
  if (affirmations.length) {
    l.push('## Affirmations', '');
    for (const a of affirmations) {
      let ligne = `- **${STATUTS[a.statut]}** : ${a.texte}`;
      const source = a.source_id ? ctx.fiches.get(a.source_id) : undefined;
      if (source) ligne += ` (source : ${lien(source)}${a.localisation ? ', ' + a.localisation : ''})`;
      else if (a.localisation) ligne += ` (${a.localisation})`;
      if (a.note) ligne += `\n  - Note : ${a.note}`;
      l.push(ligne);
    }
    l.push('');
  }

  const relations = relationsDe(ctx, fiche.id);
  if (relations.length) {
    l.push('## Relations', '');
    for (const r of relations) l.push(`- ${r.libelle} : ${lien(r.autre)}${r.note ? ' (' + r.note + ')' : ''}`);
    l.push('');
  }

  if (fiche.type === 'dossier') {
    const membres = ctx.dossierFiches.filter((d) => d.dossier_id === fiche.id);
    if (membres.length) {
      l.push('## Fiches du dossier', '');
      for (const m of membres) l.push(`- ${lien(ctx.fiches.get(m.fiche_id)!)}${m.note ? ' : ' + m.note : ''}`);
      l.push('');
    }
  }
  return l.join('\n');
}

/** Tous les fichiers de l'export Markdown : chemin → contenu. */
export function exportMarkdown(ctx: Contexte): Record<string, string> {
  const noms = nomsDeFichiers(ctx);
  const fichiers: Record<string, string> = {};
  for (const f of ctx.fiches.values()) fichiers[noms.get(f.id)!] = ficheEnMarkdown(ctx, f, noms);
  return fichiers;
}
