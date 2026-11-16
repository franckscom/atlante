// « Préparer pour Claude » : assemble une fiche ou un dossier en un texte structuré,
// à coller soi-même dans Claude. Aucune API, aucune donnée envoyée par l'app.
import { CHAMPS_PAR_TYPE, STATUTS, TYPES_FICHE, type Fiche } from '../modele/types';
import { relationsDe, type Contexte } from '../exports/contexte';

function blocFiche(ctx: Contexte, fiche: Fiche, niveau: string): string {
  const l: string[] = [`${niveau} ${fiche.titre || 'Sans titre'} (${TYPES_FICHE[fiche.type]})`, ''];
  const infos: string[] = [];
  if (fiche.auteur) infos.push(`Auteur : ${fiche.auteur}`);
  if (fiche.date) infos.push(`Date : ${fiche.date}`);
  if (fiche.url) infos.push(`URL : ${fiche.url}`);
  for (const c of CHAMPS_PAR_TYPE[fiche.type]) if (fiche.champs?.[c.cle]) infos.push(`${c.libelle} : ${fiche.champs[c.cle]}`);
  const domaines = fiche.domaine_ids.map((id) => ctx.domaines.get(id)?.nom).filter(Boolean);
  if (domaines.length) infos.push(`Domaines : ${domaines.join(' ; ')}`);
  if (infos.length) l.push(...infos.map((i) => `- ${i}`), '');
  if (fiche.contenu.trim()) l.push('Contenu :', '', fiche.contenu.trim(), '');

  const affirmations = ctx.affirmations.filter((a) => a.fiche_id === fiche.id);
  if (affirmations.length) {
    l.push('Affirmations (statut attribué par moi) :', '');
    for (const a of affirmations) {
      const source = a.source_id ? ctx.fiches.get(a.source_id) : undefined;
      const ref = [source ? `source : ${source.titre}${source.auteur ? ' (' + source.auteur + ')' : ''}` : '', a.localisation].filter(Boolean).join(', ');
      l.push(`- [${STATUTS[a.statut]}] ${a.texte}${ref ? ` (${ref})` : ''}${a.note ? ` Note : ${a.note}` : ''}`);
    }
    l.push('');
  }
  const relations = relationsDe(ctx, fiche.id);
  if (relations.length) {
    l.push('Relations :', '');
    for (const r of relations) l.push(`- ${r.libelle} : ${r.autre.titre} (${TYPES_FICHE[r.autre.type]})${r.note ? ', ' + r.note : ''}`);
    l.push('');
  }
  return l.join('\n');
}

/** Texte prêt à coller pour une fiche, ou pour un dossier et toutes ses fiches. */
export function preparerPourClaude(ctx: Contexte, ficheId: string): string {
  const fiche = ctx.fiches.get(ficheId);
  if (!fiche) return '';
  const l: string[] = [
    "Voici un extrait de ma base de connaissance personnelle (Atlante).",
    "Chaque affirmation porte un statut que j'ai attribué moi-même selon l'état de la preuve : respecte-le et ne le requalifie pas sans me le dire.",
    'Si tu ajoutes une déduction, signale-la comme « inférence produite par une IA ».',
    '',
    '---',
    '',
  ];
  if (fiche.type === 'dossier') {
    l.push(blocFiche(ctx, fiche, '#'));
    const membres = ctx.dossierFiches.filter((d) => d.dossier_id === fiche.id);
    l.push(`## Fiches du dossier (${membres.length})`, '');
    for (const m of membres) {
      if (m.note) l.push(`Note sur la place de cette fiche dans le dossier : ${m.note}`, '');
      l.push(blocFiche(ctx, ctx.fiches.get(m.fiche_id)!, '###'));
    }
    // Sources citées par les affirmations mais absentes du dossier : on les liste pour référence.
    const dedans = new Set([fiche.id, ...membres.map((m) => m.fiche_id)]);
    const sources = new Map<string, Fiche>();
    for (const a of ctx.affirmations) {
      if (dedans.has(a.fiche_id) && a.source_id && !dedans.has(a.source_id)) {
        const s = ctx.fiches.get(a.source_id);
        if (s) sources.set(s.id, s);
      }
    }
    if (sources.size) {
      l.push('## Sources citées', '');
      for (const s of sources.values()) l.push(`- ${s.titre}${s.auteur ? ', ' + s.auteur : ''}${s.date ? ', ' + s.date : ''}${s.url ? ', ' + s.url : ''}`);
      l.push('');
    }
  } else {
    l.push(blocFiche(ctx, fiche, '#'));
    const sources = new Map<string, Fiche>();
    for (const a of ctx.affirmations) {
      if (a.fiche_id === fiche.id && a.source_id) {
        const s = ctx.fiches.get(a.source_id);
        if (s) sources.set(s.id, s);
      }
    }
    if (sources.size) {
      l.push('## Sources citées', '');
      for (const s of sources.values()) {
        l.push(`- ${s.titre}${s.auteur ? ', ' + s.auteur : ''}${s.date ? ', ' + s.date : ''}${s.url ? ', ' + s.url : ''}${s.champs?.reference ? ' ; ' + s.champs.reference : ''}`);
      }
      l.push('');
    }
  }
  return l.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
