import { describe, expect, it } from 'vitest';
import { FauxServeur, nouvelAppareil } from './outils';
import { creer, fabriquerFiche, modifier, supprimerFiche } from '../src/donnees/depot';
import { chiffrer, cleSecoursValide, dechiffrer, empreinteCle, genererCleSecours, nettoyerCleSecours } from '../src/sauvegarde/chiffrement';
import { apercuRestauration, creerSauvegarde, joursDepuisSauvegarde, ouvrirSauvegarde, restaurer, verifierInstantane, creerInstantane } from '../src/sauvegarde/sauvegarde';
import { synchroniser } from '../src/synchro/moteur';
import { VERSION_SCHEMA } from '../src/donnees/db';

const IT = 1000; // peu d'itérations pour des tests rapides (600 000 dans l'app)
const MDP = 'correct cheval batterie agrafe';

describe('chiffrement', () => {
  it('génère une clé de secours lisible et la reconnaît malgré la casse et les espaces', () => {
    const cle = genererCleSecours();
    expect(cle).toMatch(/^([A-Z2-9]{4}-){7}[A-Z2-9]{4}$/);
    expect(cleSecoursValide(cle)).toBe(true);
    expect(cleSecoursValide(cle.toLowerCase().replace(/-/g, ' '))).toBe(true);
    expect(cleSecoursValide('ABCD-EFGH')).toBe(false);
    expect(genererCleSecours()).not.toBe(cle);
  });

  it('ouvre avec le mot de passe OU la clé de secours', async () => {
    const cle = genererCleSecours();
    const archive = await chiffrer('texte secret éàü', MDP, cle, IT);
    expect(JSON.stringify(archive)).not.toContain('texte secret');
    expect(await dechiffrer(archive, MDP, 'mot_de_passe')).toBe('texte secret éàü');
    expect(await dechiffrer(archive, cle.toLowerCase(), 'cle_secours')).toBe('texte secret éàü');
    expect(archive.empreinte_cle_secours).toBe(await empreinteCle(nettoyerCleSecours(cle)));
  });

  it('refuse un mauvais mot de passe ou une mauvaise clé', async () => {
    const archive = await chiffrer('secret', MDP, genererCleSecours(), IT);
    await expect(dechiffrer(archive, 'mauvais', 'mot_de_passe')).rejects.toThrow('Mot de passe incorrect');
    await expect(dechiffrer(archive, genererCleSecours(), 'cle_secours')).rejects.toThrow('Clé de secours incorrecte');
  });

  it('détecte un fichier modifié (contenu ou en-tête)', async () => {
    const archive = await chiffrer('secret', MDP, genererCleSecours(), IT);
    const d = archive.contenu.donnees;
    const abime = { ...archive, contenu: { ...archive.contenu, donnees: (d[0] === 'A' ? 'B' : 'A') + d.slice(1) } };
    await expect(dechiffrer(abime, MDP, 'mot_de_passe')).rejects.toThrow('intégrité');
    await expect(dechiffrer({ ...archive, creee_le: '2020-01-01T00:00:00.000Z' }, MDP, 'mot_de_passe')).rejects.toThrow('intégrité');
    await expect(dechiffrer({ ...archive, format: 'autre' } as any, MDP, 'mot_de_passe')).rejects.toThrow("n'est pas une sauvegarde");
  });
});

async function baseRemplie() {
  const base = nouvelAppareil();
  const d = await creer(base, 'domaines', { nom: 'Philosophie', description: '' });
  const a = await creer(base, 'fiches', { ...fabriquerFiche('personne', 'Gramsci'), domaine_ids: [d.id] });
  const b = await creer(base, 'fiches', { ...fabriquerFiche('oeuvre', 'Cahiers de prison'), contenu: 'Original' });
  const t = await creer(base, 'types_relation', { nom: 'a écrit', nom_inverse: 'écrit par' });
  await creer(base, 'relations', { source_id: a.id, cible_id: b.id, type_relation_id: t.id, note: '' });
  await creer(base, 'affirmations', { fiche_id: b.id, texte: 'Publiés après-guerre', statut: 'fait', source_id: null, localisation: '', note: '' });
  return { base, a, b };
}

describe('sauvegarde et restauration', () => {
  it('sauvegarde tout, note la date, et restaure à l\'identique sur un appareil vide', async () => {
    const { base } = await baseRemplie();
    expect(await joursDepuisSauvegarde(base)).toBeNull();
    const cle = genererCleSecours();
    const fichier = JSON.stringify(await creerSauvegarde(base, MDP, cle, IT));
    expect(await joursDepuisSauvegarde(base)).toBe(0);
    expect(fichier).not.toContain('Gramsci');

    const neuf = nouvelAppareil();
    const instantane = await ouvrirSauvegarde(fichier, MDP, 'mot_de_passe');
    const apercu = await apercuRestauration(neuf, instantane);
    expect(apercu.tables.fiches).toEqual({ nouvelles: 2, identiques: 0, differentes: 0, seulementIci: 0 });
    expect(await neuf.fiches.count()).toBe(0); // l'aperçu n'a rien écrit

    await restaurer(neuf, instantane, 'ajouter');
    for (const t of ['fiches', 'domaines', 'types_relation', 'relations', 'affirmations'] as const) {
      const sansSysteme = (l: any[]) => l.map(({ _modifie, rev, ...r }) => r).sort((x, y) => x.id.localeCompare(y.id));
      expect(sansSysteme(await neuf.table(t).toArray())).toEqual(sansSysteme(await base.table(t).toArray()));
    }
    // Ouverture par la clé de secours.
    expect((await ouvrirSauvegarde(fichier, cle, 'cle_secours')).tables.fiches).toHaveLength(2);
  });

  it('l\'aperçu distingue nouveau, identique, différent et absent de la sauvegarde', async () => {
    const { base, b } = await baseRemplie();
    const instantane = await creerInstantane(base);
    await modifier(base, 'fiches', b.id, { contenu: 'Modifié après la sauvegarde' });
    await creer(base, 'fiches', fabriquerFiche('note', 'Créée après la sauvegarde'));
    const apercu = await apercuRestauration(base, instantane);
    expect(apercu.tables.fiches).toEqual({ nouvelles: 0, identiques: 1, differentes: 1, seulementIci: 1 });
    expect(apercu.tables.domaines).toEqual({ nouvelles: 0, identiques: 1, differentes: 0, seulementIci: 0 });
  });

  it('mode « ajouter » : ne modifie aucun élément existant', async () => {
    const { base, a, b } = await baseRemplie();
    const instantane = await creerInstantane(base);
    await modifier(base, 'fiches', b.id, { contenu: 'Modifié après' });
    await supprimerFiche(base, a.id);
    await restaurer(base, instantane, 'ajouter');
    expect((await base.fiches.get(b.id))!.contenu).toBe('Modifié après');
    expect((await base.fiches.get(a.id))!.deleted_at).not.toBeNull();
  });

  it('mode « fusionner » : reprend la version sauvegardée des éléments différents, garde les nouveautés', async () => {
    const { base, b } = await baseRemplie();
    const instantane = await creerInstantane(base);
    await modifier(base, 'fiches', b.id, { contenu: 'Modifié après' });
    const nouvelle = await creer(base, 'fiches', fabriquerFiche('note', 'Nouvelle'));
    await restaurer(base, instantane, 'fusionner');
    expect((await base.fiches.get(b.id))!.contenu).toBe('Original');
    expect((await base.fiches.get(nouvelle.id))!.deleted_at).toBeNull();
  });

  it('mode « remplacer » : revient à l\'état sauvegardé ; les nouveautés partent à la corbeille', async () => {
    const { base, a, b } = await baseRemplie();
    const instantane = await creerInstantane(base);
    await modifier(base, 'fiches', b.id, { contenu: 'Modifié après' });
    await supprimerFiche(base, a.id);
    const nouvelle = await creer(base, 'fiches', fabriquerFiche('note', 'Nouvelle'));
    await restaurer(base, instantane, 'remplacer');
    expect((await base.fiches.get(b.id))!.contenu).toBe('Original');
    expect((await base.fiches.get(a.id))!.deleted_at).toBeNull();
    expect((await base.relations.toArray()).every((r) => !r.deleted_at)).toBe(true);
    expect((await base.fiches.get(nouvelle.id))!.deleted_at).not.toBeNull(); // corbeille, pas destruction
  });

  it('refuse une sauvegarde d\'un schéma plus récent, incomplète ou étrangère', async () => {
    const { base } = await baseRemplie();
    const i = await creerInstantane(base);
    expect(() => verifierInstantane({ ...i, version_schema: VERSION_SCHEMA + 1 })).toThrow('mets Atlante à jour');
    expect(() => verifierInstantane({ ...i, tables: { ...i.tables, fiches: undefined } })).toThrow('incomplète');
    expect(() => verifierInstantane({ ...i, tables: { ...i.tables, fiches: [{ titre: 'sans id' }] } })).toThrow('endommagée');
    expect(() => verifierInstantane({ application: 'autre' })).toThrow("n'est pas une sauvegarde");
    await expect(ouvrirSauvegarde('pas du json', MDP, 'mot_de_passe')).rejects.toThrow('illisible');
  });

  it('après une restauration, la synchro renvoie les données au serveur sans doublon', async () => {
    const serveur = new FauxServeur();
    const { base, b } = await baseRemplie();
    await synchroniser(base, serveur, 'utilisateur-1');
    const instantane = await creerInstantane(base);
    await modifier(base, 'fiches', b.id, { contenu: 'Erreur à annuler' });
    await synchroniser(base, serveur, 'utilisateur-1');

    await restaurer(base, instantane, 'remplacer');
    const bilan = await synchroniser(base, serveur, 'utilisateur-1');
    expect(bilan.conflits).toBe(0);
    expect((serveur.tables.get('fiches')!.get(b.id) as any).contenu).toBe('Original');
    expect(serveur.tables.get('fiches')!.size).toBe(2);

    // Restauration sur un appareil neuf relié au même compte : aucune ligne en double, aucun conflit.
    const neuf = nouvelAppareil();
    await restaurer(neuf, instantane, 'ajouter');
    const bilan2 = await synchroniser(neuf, serveur, 'utilisateur-1');
    expect(bilan2.conflits).toBe(0);
    expect(serveur.tables.get('fiches')!.size).toBe(2);
    expect(await neuf.fiches.count()).toBe(2);
  });
});
