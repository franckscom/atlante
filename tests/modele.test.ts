import { describe, expect, it } from 'vitest';
import { nouvelAppareil } from './outils';
import { semerSiPremierLancement } from '../src/donnees/db';
import { creer, fabriquerFiche, modifier, restaurerFiche, supprimerDomaine, supprimerFiche, supprimerTypeRelation } from '../src/donnees/depot';
import { chercherDoublons, normaliserUrl, ressemblance } from '../src/donnees/doublons';
import { construireIndex, filtrer, type Corpus } from '../src/donnees/recherche';
import { analyserFichier, importerCandidates } from '../src/donnees/importFichiers';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

async function corpus(base: ReturnType<typeof nouvelAppareil>): Promise<Corpus> {
  return {
    fiches: await base.fiches.toArray(),
    affirmations: await base.affirmations.toArray(),
    relations: await base.relations.toArray(),
    dossierFiches: await base.dossier_fiches.toArray(),
  };
}

describe('modèle de données', () => {
  it('sème 14 domaines et les types de relation une seule fois', async () => {
    const base = nouvelAppareil();
    await semerSiPremierLancement(base);
    await semerSiPremierLancement(base);
    expect(await base.domaines.count()).toBe(14);
    expect(await base.types_relation.count()).toBe(10);
  });

  it('crée une fiche avec un UUID, des dates et la marque « à envoyer »', async () => {
    const base = nouvelAppareil();
    const f = await creer(base, 'fiches', fabriquerFiche('personne', 'Antonio Gramsci'));
    expect(f.id).toMatch(UUID);
    expect(f.created_at).toBe(f.updated_at);
    expect(f.deleted_at).toBeNull();
    expect(f._modifie).toBe(1);
    expect(f.rev).toBe(0);
    expect(f.provenance?.mode).toBe('manuel');
  });

  it('modifie un champ sans recréer la fiche', async () => {
    const base = nouvelAppareil();
    const f = await creer(base, 'fiches', fabriquerFiche('concept', 'Hégémonie'));
    await new Promise((r) => setTimeout(r, 5));
    await modifier(base, 'fiches', f.id, { contenu: 'Direction intellectuelle et morale.' });
    const apres = (await base.fiches.get(f.id))!;
    expect(apres.id).toBe(f.id);
    expect(apres.created_at).toBe(f.created_at);
    expect(apres.updated_at > f.updated_at).toBe(true);
    expect(apres.contenu).toBe('Direction intellectuelle et morale.');
    expect(apres.titre).toBe('Hégémonie');
  });

  it('une fiche peut appartenir à plusieurs domaines ; supprimer un domaine le retire des fiches', async () => {
    const base = nouvelAppareil();
    const d1 = await creer(base, 'domaines', { nom: 'Philosophie', description: '' });
    const d2 = await creer(base, 'domaines', { nom: 'Politique', description: '' });
    const f = await creer(base, 'fiches', { ...fabriquerFiche('concept', 'Hégémonie'), domaine_ids: [d1.id, d2.id] });
    await supprimerDomaine(base, d1.id);
    expect((await base.fiches.get(f.id))!.domaine_ids).toEqual([d2.id]);
    expect((await base.domaines.get(d1.id))!.deleted_at).not.toBeNull();
  });

  it('supprimer une fiche est une suppression logique qui emporte relations, affirmations et liens de dossier', async () => {
    const base = nouvelAppareil();
    const auteur = await creer(base, 'fiches', fabriquerFiche('personne', 'Gramsci'));
    const oeuvre = await creer(base, 'fiches', fabriquerFiche('oeuvre', 'Cahiers de prison'));
    const dossier = await creer(base, 'fiches', fabriquerFiche('dossier', 'Hégémonie culturelle'));
    const type = await creer(base, 'types_relation', { nom: 'a écrit', nom_inverse: 'écrit par' });
    const rel = await creer(base, 'relations', { source_id: auteur.id, cible_id: oeuvre.id, type_relation_id: type.id, note: '' });
    const aff = await creer(base, 'affirmations', { fiche_id: oeuvre.id, texte: 'Rédigés de 1929 à 1935', statut: 'fait', source_id: null, localisation: '', note: '' });
    const affAilleurs = await creer(base, 'affirmations', { fiche_id: auteur.id, texte: 'x', statut: 'hypothese', source_id: oeuvre.id, localisation: 'p. 12', note: '' });
    const lien = await creer(base, 'dossier_fiches', { dossier_id: dossier.id, fiche_id: oeuvre.id, position: 0, note: '' });

    await supprimerFiche(base, oeuvre.id);

    expect((await base.fiches.get(oeuvre.id))!.deleted_at).not.toBeNull(); // toujours là, marquée supprimée
    expect((await base.relations.get(rel.id))!.deleted_at).not.toBeNull();
    expect((await base.affirmations.get(aff.id))!.deleted_at).not.toBeNull();
    expect((await base.dossier_fiches.get(lien.id))!.deleted_at).not.toBeNull();
    // L'affirmation d'une autre fiche survit, mais perd sa source disparue.
    const autre = (await base.affirmations.get(affAilleurs.id))!;
    expect(autre.deleted_at).toBeNull();
    expect(autre.source_id).toBeNull();
    expect((await base.fiches.get(auteur.id))!.deleted_at).toBeNull();

    await restaurerFiche(base, oeuvre.id);
    expect((await base.fiches.get(oeuvre.id))!.deleted_at).toBeNull();
    expect((await base.relations.get(rel.id))!.deleted_at).toBeNull();
    expect((await base.affirmations.get(aff.id))!.deleted_at).toBeNull();
    expect((await base.dossier_fiches.get(lien.id))!.deleted_at).toBeNull();
  });

  it('supprimer un type de relation supprime les relations qui l\'utilisent', async () => {
    const base = nouvelAppareil();
    const a = await creer(base, 'fiches', fabriquerFiche('personne', 'A'));
    const b = await creer(base, 'fiches', fabriquerFiche('personne', 'B'));
    const type = await creer(base, 'types_relation', { nom: 'critique', nom_inverse: 'critiqué par' });
    const rel = await creer(base, 'relations', { source_id: a.id, cible_id: b.id, type_relation_id: type.id, note: '' });
    await supprimerTypeRelation(base, type.id);
    expect((await base.relations.get(rel.id))!.deleted_at).not.toBeNull();
  });
});

describe('doublons', () => {
  it('mesure la ressemblance sans tenir compte des accents ni de la casse', () => {
    expect(ressemblance('Hégémonie culturelle', 'hegemonie CULTURELLE')).toBe(1);
    expect(ressemblance('Cahiers de prison', 'Les cahiers de prison')).toBeGreaterThan(0.8);
    expect(ressemblance('Cahiers de prison', 'Le Prince')).toBeLessThan(0.5);
  });

  it('normalise les URL', () => {
    expect(normaliserUrl('https://www.Exemple.fr/article/?utm_source=x&id=3#haut')).toBe('exemple.fr/article?id=3');
    expect(normaliserUrl('http://exemple.fr/article')).toBe('exemple.fr/article');
  });

  it('signale même titre, titre proche, même URL, et ignore les fiches supprimées', async () => {
    const base = nouvelAppareil();
    await creer(base, 'fiches', { ...fabriquerFiche('source', 'La Société du spectacle'), auteur: 'Guy Debord', url: 'https://exemple.fr/debord' });
    const supprimee = await creer(base, 'fiches', fabriquerFiche('source', 'Mythologies'));
    await supprimerFiche(base, supprimee.id);
    const existantes = await base.fiches.toArray();
    expect(chercherDoublons({ titre: 'la societe du spectacle' }, existantes)[0].raison).toBe('même titre');
    expect(chercherDoublons({ titre: 'La Société du spectacle (1967)' }, existantes)[0].raison).toBe('titre très proche');
    expect(chercherDoublons({ titre: 'Autre chose', url: 'http://www.exemple.fr/debord/' }, existantes)[0].raison).toBe('même URL');
    expect(chercherDoublons({ titre: 'Mythologies' }, existantes)).toHaveLength(0);
    expect(chercherDoublons({ titre: 'Surveiller et punir' }, existantes)).toHaveLength(0);
  });
});

describe('recherche et filtres', () => {
  it('cherche en plein texte (accents ignorés) et combine les filtres', async () => {
    const base = nouvelAppareil();
    const philo = await creer(base, 'domaines', { nom: 'Philosophie', description: '' });
    const gramsci = await creer(base, 'fiches', { ...fabriquerFiche('personne', 'Antonio Gramsci'), domaine_ids: [philo.id], date: '1891' });
    const cahiers = await creer(base, 'fiches', { ...fabriquerFiche('oeuvre', 'Cahiers de prison'), auteur: 'Antonio Gramsci', date: '1948', contenu: "Théorie de l'hégémonie culturelle." });
    const debord = await creer(base, 'fiches', { ...fabriquerFiche('oeuvre', 'La Société du spectacle'), auteur: 'Guy Debord', date: '1967' });
    await creer(base, 'affirmations', { fiche_id: gramsci.id, texte: 'Emprisonné par le régime fasciste en 1926', statut: 'fait', source_id: cahiers.id, localisation: 'préface', note: '' });
    const supprimee = await creer(base, 'fiches', fabriquerFiche('note', 'Hégémonie brouillon'));
    await supprimerFiche(base, supprimee.id);

    const c = await corpus(base);
    const index = construireIndex(c);
    const titres = (f: Parameters<typeof filtrer>[2]) => filtrer(c, index, f).map((x) => x.titre);

    expect(titres({ q: 'hegemonie' })).toEqual(['Cahiers de prison']); // accent ignoré, fiche supprimée exclue
    expect(titres({ q: 'fasciste' })).toEqual(['Antonio Gramsci']); // texte d'une affirmation
    expect(titres({ q: 'gramsci' }).sort()).toEqual(['Antonio Gramsci', 'Cahiers de prison']);
    expect(titres({ q: 'gramsci', type: 'oeuvre' })).toEqual(['Cahiers de prison']);
    expect(titres({ type: 'oeuvre', auteur: 'debord' })).toEqual(['La Société du spectacle']);
    expect(titres({ domaine: philo.id })).toEqual(['Antonio Gramsci']);
    expect(titres({ statut: 'fait' })).toEqual(['Antonio Gramsci']);
    expect(titres({ statut: 'hypothese' })).toEqual([]);
    expect(titres({ source: cahiers.id })).toEqual(['Antonio Gramsci']);
    expect(titres({ anneeMin: 1940, anneeMax: 1950 })).toEqual(['Cahiers de prison']);
    expect(titres({ type: 'oeuvre', anneeMin: 1960 })).toEqual([debord.titre]);
  });
});

describe('import de fichiers', () => {
  it('tire le titre de l\'en-tête, du premier titre ou du nom de fichier', () => {
    expect(analyserFichier({ nom: 'a.md', texte: '---\ntitre: "Mon titre"\nauteur: Moi\n---\n# Autre\nCorps' })).toMatchObject({ titre: 'Mon titre', auteur: 'Moi', contenu: '# Autre\nCorps' });
    expect(analyserFichier({ nom: 'b.md', texte: '# Le titre\n\nCorps du texte' })).toMatchObject({ titre: 'Le titre', contenu: 'Corps du texte' });
    expect(analyserFichier({ nom: 'notes de lecture.txt', texte: 'Juste du texte' })).toMatchObject({ titre: 'notes de lecture', contenu: 'Juste du texte' });
  });

  it('crée de nouvelles fiches avec provenance, sans toucher aux fiches existantes', async () => {
    const base = nouvelAppareil();
    const existante = await creer(base, 'fiches', { ...fabriquerFiche('note', 'Le titre'), contenu: 'Version originale' });
    const [importee] = await importerCandidates(base, [analyserFichier({ nom: 'b.md', texte: '# Le titre\n\nVersion importée' })], 'note', []);
    expect(importee.id).not.toBe(existante.id);
    expect(importee.provenance).toMatchObject({ mode: 'fichier', fichier: 'b.md' });
    expect(importee.provenance!.acquis_le).toBeTruthy();
    expect((await base.fiches.get(existante.id))!.contenu).toBe('Version originale');
    expect(await base.fiches.count()).toBe(2);
  });
});
