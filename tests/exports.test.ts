import { describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { nouvelAppareil } from './outils';
import { creer, fabriquerFiche, supprimerFiche } from '../src/donnees/depot';
import { chargerContexte, relationsDe } from '../src/exports/contexte';
import { exportMarkdown } from '../src/exports/markdown';
import { celluleCsv, exportCsv } from '../src/exports/csv';
import { creerZip } from '../src/exports/fichiers';
import { preparerPourClaude } from '../src/ia/preparer';
import { creerInstantane, verifierInstantane } from '../src/sauvegarde/sauvegarde';

async function jeu() {
  const base = nouvelAppareil();
  const philo = await creer(base, 'domaines', { nom: 'Philosophie', description: '' });
  const gramsci = await creer(base, 'fiches', { ...fabriquerFiche('personne', 'Antonio Gramsci'), domaine_ids: [philo.id], champs: { naissance: '1891' } });
  const cahiers = await creer(base, 'fiches', { ...fabriquerFiche('oeuvre', 'Cahiers de prison'), auteur: 'Antonio Gramsci', date: '1948', contenu: 'Notes rédigées en détention.' });
  const source = await creer(base, 'fiches', { ...fabriquerFiche('source', 'Édition Gallimard'), url: 'https://exemple.fr/cahiers' });
  const dossier = await creer(base, 'fiches', { ...fabriquerFiche('dossier', 'Hégémonie culturelle'), contenu: 'Dossier de travail.' });
  const supprimee = await creer(base, 'fiches', fabriquerFiche('note', 'Brouillon jeté'));
  const aEcrit = await creer(base, 'types_relation', { nom: 'a écrit', nom_inverse: 'écrit par' });
  await creer(base, 'relations', { source_id: gramsci.id, cible_id: cahiers.id, type_relation_id: aEcrit.id, note: 'en prison' });
  await creer(base, 'relations', { source_id: gramsci.id, cible_id: supprimee.id, type_relation_id: aEcrit.id, note: '' });
  await creer(base, 'affirmations', { fiche_id: cahiers.id, texte: 'Rédigés entre 1929 et 1935', statut: 'fait', source_id: source.id, localisation: 'p. 12', note: '' });
  await creer(base, 'affirmations', { fiche_id: cahiers.id, texte: "L'hégémonie précède la prise du pouvoir", statut: 'interpretation', source_id: null, localisation: '', note: 'à vérifier' });
  await creer(base, 'dossier_fiches', { dossier_id: dossier.id, fiche_id: cahiers.id, position: 1, note: 'texte central' });
  await creer(base, 'dossier_fiches', { dossier_id: dossier.id, fiche_id: gramsci.id, position: 0, note: '' });
  await supprimerFiche(base, supprimee.id);
  return { base, gramsci, cahiers, source, dossier };
}

describe('exports', () => {
  it('relations lisibles dans les deux sens', async () => {
    const { base, gramsci, cahiers } = await jeu();
    const ctx = await chargerContexte(base);
    expect(relationsDe(ctx, gramsci.id).map((r) => `${r.libelle} ${r.autre.titre}`)).toEqual(['a écrit Cahiers de prison']);
    expect(relationsDe(ctx, cahiers.id).map((r) => `${r.libelle} ${r.autre.titre}`)).toEqual(['écrit par Antonio Gramsci']);
  });

  it('Markdown : une fiche par fichier, relations et sources en liens, rien de supprimé', async () => {
    const { base, cahiers } = await jeu();
    const fichiers = exportMarkdown(await chargerContexte(base));
    expect(Object.keys(fichiers).sort()).toEqual([
      'dossier/hegemonie-culturelle.md',
      'oeuvre/cahiers-de-prison.md',
      'personne/antonio-gramsci.md',
      'source/edition-gallimard.md',
    ]);
    const md = fichiers['oeuvre/cahiers-de-prison.md'];
    expect(md).toContain(`id: ${cahiers.id}`);
    expect(md).toContain('# Cahiers de prison');
    expect(md).toContain('Notes rédigées en détention.');
    expect(md).toContain('- écrit par : [Antonio Gramsci](../personne/antonio-gramsci.md) (en prison)');
    expect(md).toContain('- **Fait vérifiable** : Rédigés entre 1929 et 1935 (source : [Édition Gallimard](../source/edition-gallimard.md), p. 12)');
    expect(md).toContain('- **Interprétation ou opinion attribuée à un auteur**');
    expect(fichiers['personne/antonio-gramsci.md']).toContain('domaines:\n  - "Philosophie"');
    expect(fichiers['personne/antonio-gramsci.md']).not.toContain('Brouillon');
    expect(fichiers['dossier/hegemonie-culturelle.md']).toContain('## Fiches du dossier\n\n- [Antonio Gramsci](../personne/antonio-gramsci.md)\n- [Cahiers de prison](../oeuvre/cahiers-de-prison.md) : texte central');
  });

  it('Markdown : deux fiches de même titre donnent deux fichiers distincts', async () => {
    const base = nouvelAppareil();
    await creer(base, 'fiches', fabriquerFiche('note', 'Même titre'));
    await creer(base, 'fiches', fabriquerFiche('note', 'Même titre'));
    expect(Object.keys(exportMarkdown(await chargerContexte(base)))).toHaveLength(2);
  });

  it('CSV : un fichier par type, cellules protégées', async () => {
    const { base } = await jeu();
    const fichiers = exportCsv(await chargerContexte(base));
    expect(Object.keys(fichiers).sort()).toEqual([
      'affirmations.csv', 'domaines.csv', 'dossiers.csv', 'fiches_dossier.csv', 'fiches_oeuvre.csv', 'fiches_personne.csv', 'fiches_source.csv', 'relations.csv',
    ]);
    const lignes = fichiers['fiches_personne.csv'].replace('﻿', '').trim().split('\r\n');
    expect(lignes[0]).toBe('id;titre;auteur;date;url;domaines;naissance;deces;nationalite;activite;contenu;provenance;acquis_le;cree_le;modifie_le');
    expect(lignes[1]).toContain(';Antonio Gramsci;;;;Philosophie;1891;');
    expect(fichiers['relations.csv']).toContain(';Antonio Gramsci;a écrit;');
    expect(fichiers['affirmations.csv']).toContain('Fait vérifiable;Rédigés entre 1929 et 1935;');
    expect(celluleCsv('a;b')).toBe('"a;b"');
    expect(celluleCsv('dit "oui"\nfin')).toBe('"dit ""oui""\nfin"');
    expect(celluleCsv('=SOMME(A1)')).toBe("'=SOMME(A1)");
  });

  it('JSON complet : relisible et vérifiable', async () => {
    const { base } = await jeu();
    const json = JSON.stringify(await creerInstantane(base));
    const relu = verifierInstantane(JSON.parse(json));
    expect(relu.tables.fiches).toHaveLength(5); // corbeille comprise
    expect(relu.tables.relations).toHaveLength(2);
  });

  it('ZIP : les fichiers ressortent identiques', async () => {
    const { base } = await jeu();
    const fichiers = exportMarkdown(await chargerContexte(base));
    const relus = unzipSync(creerZip(fichiers));
    expect(Object.keys(relus).sort()).toEqual(Object.keys(fichiers).sort());
    expect(strFromU8(relus['oeuvre/cahiers-de-prison.md'])).toBe(fichiers['oeuvre/cahiers-de-prison.md']);
  });

  it('« Préparer pour Claude » : contenu, relations, statuts et sources d\'une fiche', async () => {
    const { base, cahiers } = await jeu();
    const texte = preparerPourClaude(await chargerContexte(base), cahiers.id);
    expect(texte).toContain('# Cahiers de prison (Œuvre)');
    expect(texte).toContain('- Auteur : Antonio Gramsci');
    expect(texte).toContain('Notes rédigées en détention.');
    expect(texte).toContain('- [Fait vérifiable] Rédigés entre 1929 et 1935 (source : Édition Gallimard, p. 12)');
    expect(texte).toContain("- [Interprétation ou opinion attribuée à un auteur] L'hégémonie précède la prise du pouvoir Note : à vérifier");
    expect(texte).toContain('- écrit par : Antonio Gramsci (Personne), en prison');
    expect(texte).toContain('## Sources citées\n\n- Édition Gallimard, https://exemple.fr/cahiers');
  });

  it('« Préparer pour Claude » : un dossier embarque ses fiches dans l\'ordre', async () => {
    const { base, dossier } = await jeu();
    const texte = preparerPourClaude(await chargerContexte(base), dossier.id);
    expect(texte).toContain('# Hégémonie culturelle (Dossier thématique)');
    expect(texte).toContain('## Fiches du dossier (2)');
    expect(texte.indexOf('### Antonio Gramsci')).toBeGreaterThan(0);
    expect(texte.indexOf('### Antonio Gramsci')).toBeLessThan(texte.indexOf('### Cahiers de prison'));
    expect(texte).toContain('Note sur la place de cette fiche dans le dossier : texte central');
    expect(texte).toContain('## Sources citées');
  });
});
