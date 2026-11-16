// Export CSV : un fichier par type de fiche, plus les relations et les affirmations.
// S'ouvre dans Excel, LibreOffice ou Google Sheets.
import { CHAMPS_PAR_TYPE, STATUTS, TYPES_FICHE, type TypeFiche } from '../modele/types';
import type { Contexte } from './contexte';

/** Une cellule CSV : entre guillemets si elle contient un séparateur, un guillemet ou un saut de ligne. */
export function celluleCsv(v: unknown): string {
  let s = v === null || v === undefined ? '' : String(v);
  // Protection contre l'injection de formules à l'ouverture dans un tableur.
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/** Séparateur point-virgule et BOM : Excel en français ouvre le fichier correctement d'un double-clic. */
export function enCsv(lignes: unknown[][]): string {
  return '﻿' + lignes.map((l) => l.map(celluleCsv).join(';')).join('\r\n') + '\r\n';
}

export function exportCsv(ctx: Contexte): Record<string, string> {
  const fichiers: Record<string, string> = {};
  const titre = (id: string | null) => (id ? ctx.fiches.get(id)?.titre ?? '' : '');
  for (const type of Object.keys(TYPES_FICHE) as TypeFiche[]) {
    const fiches = [...ctx.fiches.values()].filter((f) => f.type === type);
    if (!fiches.length) continue;
    const champs = CHAMPS_PAR_TYPE[type];
    const lignes: unknown[][] = [['id', 'titre', 'auteur', 'date', 'url', 'domaines', ...champs.map((c) => c.cle), 'contenu', 'provenance', 'acquis_le', 'cree_le', 'modifie_le']];
    for (const f of fiches) {
      lignes.push([
        f.id, f.titre, f.auteur, f.date, f.url,
        f.domaine_ids.map((d) => ctx.domaines.get(d)?.nom).filter(Boolean).join(' | '),
        ...champs.map((c) => f.champs?.[c.cle] ?? ''),
        f.contenu,
        f.provenance ? (f.provenance.mode === 'fichier' ? `fichier : ${f.provenance.fichier ?? ''}` : 'saisie manuelle') : '',
        f.provenance?.acquis_le ?? '', f.created_at, f.updated_at,
      ]);
    }
    fichiers[`fiches_${type}.csv`] = enCsv(lignes);
  }
  fichiers['relations.csv'] = enCsv([
    ['id', 'source_id', 'source', 'relation', 'cible_id', 'cible', 'note'],
    ...ctx.relations.map((r) => [r.id, r.source_id, titre(r.source_id), ctx.typesRelation.get(r.type_relation_id)?.nom ?? '', r.cible_id, titre(r.cible_id), r.note]),
  ]);
  fichiers['affirmations.csv'] = enCsv([
    ['id', 'fiche_id', 'fiche', 'statut', 'texte', 'source_id', 'source', 'localisation', 'note'],
    ...ctx.affirmations.map((a) => [a.id, a.fiche_id, titre(a.fiche_id), STATUTS[a.statut], a.texte, a.source_id ?? '', titre(a.source_id), a.localisation, a.note]),
  ]);
  fichiers['dossiers.csv'] = enCsv([
    ['dossier_id', 'dossier', 'fiche_id', 'fiche', 'position', 'note'],
    ...ctx.dossierFiches.map((d) => [d.dossier_id, titre(d.dossier_id), d.fiche_id, titre(d.fiche_id), d.position, d.note]),
  ]);
  fichiers['domaines.csv'] = enCsv([['id', 'nom', 'description'], ...[...ctx.domaines.values()].map((d) => [d.id, d.nom, d.description])]);
  return fichiers;
}
