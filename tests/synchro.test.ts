import { describe, expect, it } from 'vitest';
import { FauxServeur, nouvelAppareil } from './outils';
import { semerSiPremierLancement } from '../src/donnees/db';
import { creer, fabriquerFiche, modifier, supprimerFiche } from '../src/donnees/depot';
import { compterCorbeille, compterEnAttente, ErreurAutreCompte, ErreurCorbeille, resoudreConflit, synchroniser, viderCorbeille } from '../src/synchro/moteur';
import { TABLES } from '../src/modele/types';
import { ErreurDistante } from '../src/synchro/distant';

const MOI = 'utilisateur-1';

describe('synchronisation', () => {
  it('envoie les créations puis un second appareil les reçoit', async () => {
    const serveur = new FauxServeur();
    const pc = nouvelAppareil();
    const iphone = nouvelAppareil();
    const f = await creer(pc, 'fiches', fabriquerFiche('concept', 'Hégémonie'));
    expect(await compterEnAttente(pc)).toBe(1);

    const bilan = await synchroniser(pc, serveur, MOI);
    expect(bilan).toMatchObject({ envoyees: 1, conflits: 0, erreurs: [] });
    expect(await compterEnAttente(pc)).toBe(0);
    expect((await pc.fiches.get(f.id))!.rev).toBeGreaterThan(0);

    await synchroniser(iphone, serveur, MOI);
    const recue = (await iphone.fiches.get(f.id))!;
    expect(recue.titre).toBe('Hégémonie');
    expect(recue._modifie).toBe(0);
  });

  it('propage les mises à jour dans les deux sens', async () => {
    const serveur = new FauxServeur();
    const pc = nouvelAppareil();
    const iphone = nouvelAppareil();
    const f = await creer(pc, 'fiches', fabriquerFiche('concept', 'Hégémonie'));
    await synchroniser(pc, serveur, MOI);
    await synchroniser(iphone, serveur, MOI);

    await modifier(iphone, 'fiches', f.id, { contenu: 'Écrit sur iPhone' });
    await synchroniser(iphone, serveur, MOI);
    await synchroniser(pc, serveur, MOI);
    expect((await pc.fiches.get(f.id))!.contenu).toBe('Écrit sur iPhone');

    await modifier(pc, 'fiches', f.id, { titre: 'Hégémonie culturelle' });
    await synchroniser(pc, serveur, MOI);
    await synchroniser(iphone, serveur, MOI);
    const surIphone = (await iphone.fiches.get(f.id))!;
    expect(surIphone.titre).toBe('Hégémonie culturelle');
    expect(surIphone.contenu).toBe('Écrit sur iPhone');
    expect(await pc.conflits.count()).toBe(0);
    expect(await iphone.conflits.count()).toBe(0);
  });

  it('propage les suppressions : une fiche supprimée ne réapparaît pas', async () => {
    const serveur = new FauxServeur();
    const pc = nouvelAppareil();
    const iphone = nouvelAppareil();
    const a = await creer(pc, 'fiches', fabriquerFiche('personne', 'A'));
    const b = await creer(pc, 'fiches', fabriquerFiche('oeuvre', 'B'));
    const type = await creer(pc, 'types_relation', { nom: 'a écrit', nom_inverse: 'écrit par' });
    const rel = await creer(pc, 'relations', { source_id: a.id, cible_id: b.id, type_relation_id: type.id, note: '' });
    await synchroniser(pc, serveur, MOI);
    await synchroniser(iphone, serveur, MOI);
    expect((await iphone.relations.get(rel.id))!.deleted_at).toBeNull();

    await supprimerFiche(iphone, b.id);
    await synchroniser(iphone, serveur, MOI);
    await synchroniser(pc, serveur, MOI);
    expect((await pc.fiches.get(b.id))!.deleted_at).not.toBeNull();
    expect((await pc.relations.get(rel.id))!.deleted_at).not.toBeNull();

    // Plusieurs allers-retours plus tard, elle est toujours supprimée partout.
    await synchroniser(pc, serveur, MOI);
    await synchroniser(iphone, serveur, MOI);
    await synchroniser(pc, serveur, MOI);
    expect((await pc.fiches.get(b.id))!.deleted_at).not.toBeNull();
    expect((await iphone.fiches.get(b.id))!.deleted_at).not.toBeNull();
    expect(serveur.tables.get('fiches')!.get(b.id)!.deleted_at).not.toBeNull();
  });

  it('détecte un conflit et garde les deux versions, sans rien écraser', async () => {
    const serveur = new FauxServeur();
    const pc = nouvelAppareil();
    const iphone = nouvelAppareil();
    const f = await creer(pc, 'fiches', fabriquerFiche('concept', 'Hégémonie'));
    await synchroniser(pc, serveur, MOI);
    await synchroniser(iphone, serveur, MOI);

    // Les deux appareils modifient la même fiche hors ligne.
    await modifier(pc, 'fiches', f.id, { contenu: 'Version PC' });
    await modifier(iphone, 'fiches', f.id, { contenu: 'Version iPhone' });
    await synchroniser(pc, serveur, MOI); // le PC passe en premier
    const bilan = await synchroniser(iphone, serveur, MOI);

    expect(bilan.conflits).toBe(1);
    const [conflit] = await iphone.conflits.toArray();
    expect((conflit.locale as any).contenu).toBe('Version iPhone');
    expect((conflit.distante as any).contenu).toBe('Version PC');
    // Rien n'a été écrasé, ni ici ni sur le serveur.
    expect((await iphone.fiches.get(f.id))!.contenu).toBe('Version iPhone');
    expect((serveur.tables.get('fiches')!.get(f.id) as any).contenu).toBe('Version PC');
    // Tant que je n'ai pas choisi, les synchros suivantes ne tranchent pas à ma place.
    await synchroniser(iphone, serveur, MOI);
    expect((serveur.tables.get('fiches')!.get(f.id) as any).contenu).toBe('Version PC');
    expect(await iphone.conflits.count()).toBe(1);
  });

  it('conflit résolu en gardant MA version : elle remplace celle du serveur', async () => {
    const serveur = new FauxServeur();
    const pc = nouvelAppareil();
    const iphone = nouvelAppareil();
    const f = await creer(pc, 'fiches', fabriquerFiche('concept', 'Hégémonie'));
    await synchroniser(pc, serveur, MOI);
    await synchroniser(iphone, serveur, MOI);
    await modifier(pc, 'fiches', f.id, { contenu: 'Version PC' });
    await modifier(iphone, 'fiches', f.id, { contenu: 'Version iPhone' });
    await synchroniser(pc, serveur, MOI);
    await synchroniser(iphone, serveur, MOI);

    const [conflit] = await iphone.conflits.toArray();
    await resoudreConflit(iphone, conflit.cle, 'locale');
    const bilan = await synchroniser(iphone, serveur, MOI);
    expect(bilan.conflits).toBe(0);
    expect((serveur.tables.get('fiches')!.get(f.id) as any).contenu).toBe('Version iPhone');
    await synchroniser(pc, serveur, MOI);
    expect((await pc.fiches.get(f.id))!.contenu).toBe('Version iPhone');
    expect(await pc.conflits.count()).toBe(0);
  });

  it('conflit résolu en prenant la version du serveur', async () => {
    const serveur = new FauxServeur();
    const pc = nouvelAppareil();
    const iphone = nouvelAppareil();
    const f = await creer(pc, 'fiches', fabriquerFiche('concept', 'Hégémonie'));
    await synchroniser(pc, serveur, MOI);
    await synchroniser(iphone, serveur, MOI);
    await modifier(pc, 'fiches', f.id, { contenu: 'Version PC' });
    await modifier(iphone, 'fiches', f.id, { contenu: 'Version iPhone' });
    await synchroniser(pc, serveur, MOI);
    await synchroniser(iphone, serveur, MOI);

    const [conflit] = await iphone.conflits.toArray();
    await resoudreConflit(iphone, conflit.cle, 'distante');
    expect((await iphone.fiches.get(f.id))!.contenu).toBe('Version PC');
    expect(await compterEnAttente(iphone)).toBe(0);
    await synchroniser(iphone, serveur, MOI);
    expect((serveur.tables.get('fiches')!.get(f.id) as any).contenu).toBe('Version PC');
  });

  it('suppression d\'un côté et modification de l\'autre : conflit, pas de perte silencieuse', async () => {
    const serveur = new FauxServeur();
    const pc = nouvelAppareil();
    const iphone = nouvelAppareil();
    const f = await creer(pc, 'fiches', fabriquerFiche('note', 'Note'));
    await synchroniser(pc, serveur, MOI);
    await synchroniser(iphone, serveur, MOI);
    await supprimerFiche(pc, f.id);
    await modifier(iphone, 'fiches', f.id, { contenu: 'Complétée sur iPhone' });
    await synchroniser(pc, serveur, MOI);
    const bilan = await synchroniser(iphone, serveur, MOI);
    expect(bilan.conflits).toBe(1);
    expect((await iphone.fiches.get(f.id))!.deleted_at).toBeNull();
  });

  it('la même modification faite des deux côtés ne crée pas de conflit', async () => {
    const serveur = new FauxServeur();
    const pc = nouvelAppareil();
    const iphone = nouvelAppareil();
    const f = await creer(pc, 'fiches', fabriquerFiche('concept', 'Hégémonie'));
    await synchroniser(pc, serveur, MOI);
    await synchroniser(iphone, serveur, MOI);
    await modifier(pc, 'fiches', f.id, { date: '1930' });
    await modifier(iphone, 'fiches', f.id, { date: '1930' });
    await synchroniser(pc, serveur, MOI);
    const bilan = await synchroniser(iphone, serveur, MOI);
    expect(bilan.conflits).toBe(0);
    expect(await compterEnAttente(iphone)).toBe(0);
  });

  it('ne duplique pas les domaines de départ créés sur chaque appareil', async () => {
    const serveur = new FauxServeur();
    const pc = nouvelAppareil();
    const iphone = nouvelAppareil();
    await semerSiPremierLancement(pc);
    await semerSiPremierLancement(iphone);
    // Sur iPhone, avant la première synchro, une fiche utilise un domaine et une relation de départ.
    const domaine = (await iphone.domaines.toArray()).find((d) => d.nom === 'Sociologie')!;
    const type = (await iphone.types_relation.toArray()).find((t) => t.nom === 'critique')!;
    const a = await creer(iphone, 'fiches', { ...fabriquerFiche('personne', 'A'), domaine_ids: [domaine.id] });
    const b = await creer(iphone, 'fiches', fabriquerFiche('personne', 'B'));
    const rel = await creer(iphone, 'relations', { source_id: a.id, cible_id: b.id, type_relation_id: type.id, note: '' });

    await synchroniser(pc, serveur, MOI);
    await synchroniser(iphone, serveur, MOI);
    await synchroniser(pc, serveur, MOI);

    for (const appareil of [pc, iphone]) {
      expect(await appareil.domaines.count()).toBe(14);
      expect(await appareil.types_relation.count()).toBe(10);
    }
    expect(serveur.tables.get('domaines')!.size).toBe(14);
    // La fiche et la relation pointent maintenant vers les lignes communes (celles du PC).
    const domainePc = (await pc.domaines.toArray()).find((d) => d.nom === 'Sociologie')!;
    const typePc = (await pc.types_relation.toArray()).find((t) => t.nom === 'critique')!;
    expect((await pc.fiches.get(a.id))!.domaine_ids).toEqual([domainePc.id]);
    expect((await pc.relations.get(rel.id))!.type_relation_id).toBe(typePc.id);
  });

  it('serveur en pause ou injoignable : rien n\'est perdu, la synchro reprend ensuite', async () => {
    const serveur = new FauxServeur();
    const pc = nouvelAppareil();
    const f = await creer(pc, 'fiches', fabriquerFiche('note', 'Écrite pendant la pause'));
    serveur.panne = 'serveur';
    await expect(synchroniser(pc, serveur, MOI)).rejects.toMatchObject({ genre: 'serveur' });
    serveur.panne = 'reseau';
    await expect(synchroniser(pc, serveur, MOI)).rejects.toBeInstanceOf(ErreurDistante);
    expect(await compterEnAttente(pc)).toBe(1);
    expect((await pc.fiches.get(f.id))!.titre).toBe('Écrite pendant la pause');
    serveur.panne = null;
    await synchroniser(pc, serveur, MOI);
    expect(await compterEnAttente(pc)).toBe(0);
    expect(serveur.tables.get('fiches')!.has(f.id)).toBe(true);
  });

  it('une modification faite pendant l\'envoi n\'est pas perdue', async () => {
    const serveur = new FauxServeur();
    const pc = nouvelAppareil();
    const f = await creer(pc, 'fiches', fabriquerFiche('note', 'Note'));
    let fait = false;
    serveur.avantEcriture = async () => {
      if (fait) return;
      fait = true;
      await new Promise((r) => setTimeout(r, 3));
      await modifier(pc, 'fiches', f.id, { contenu: 'Ajout pendant la synchro' });
    };
    await synchroniser(pc, serveur, MOI);
    serveur.avantEcriture = null;
    expect(await compterEnAttente(pc)).toBe(1); // toujours à envoyer
    await synchroniser(pc, serveur, MOI);
    expect((serveur.tables.get('fiches')!.get(f.id) as any).contenu).toBe('Ajout pendant la synchro');
    expect(await pc.conflits.count()).toBe(0);
  });

  it('refuse de mélanger les données de deux comptes sur un appareil', async () => {
    const serveur = new FauxServeur();
    const pc = nouvelAppareil();
    await synchroniser(pc, serveur, MOI);
    await expect(synchroniser(pc, serveur, 'quelqu-un-d-autre')).rejects.toBeInstanceOf(ErreurAutreCompte);
  });

  it('reçoit un grand nombre de lignes en plusieurs pages', async () => {
    const serveur = new FauxServeur();
    for (let i = 0; i < 1203; i++) {
      await serveur.inserer('fiches', { ...fabriquerFiche('note', `Note ${i}`), id: crypto.randomUUID(), created_at: 'x', updated_at: 'x', deleted_at: null });
    }
    const pc = nouvelAppareil();
    const bilan = await synchroniser(pc, serveur, MOI);
    expect(bilan.recues).toBe(1203);
    expect(await pc.fiches.count()).toBe(1203);
  });
});

describe('vider la corbeille', () => {
  /** Deux appareils synchronisés : une fiche à jeter (avec relation, affirmation, lien de dossier) et une fiche à garder. */
  async function decor() {
    const serveur = new FauxServeur();
    const pc = nouvelAppareil();
    const iphone = nouvelAppareil();
    const garder = await creer(pc, 'fiches', fabriquerFiche('personne', 'À garder'));
    const jeter = await creer(pc, 'fiches', { ...fabriquerFiche('note', 'À effacer'), contenu: 'Donnée à faire disparaître' });
    const dossier = await creer(pc, 'fiches', fabriquerFiche('dossier', 'Dossier'));
    const type = await creer(pc, 'types_relation', { nom: 'cite', nom_inverse: 'cité par' });
    await creer(pc, 'relations', { source_id: garder.id, cible_id: jeter.id, type_relation_id: type.id, note: '' });
    await creer(pc, 'affirmations', { fiche_id: jeter.id, texte: 'Affirmation de la fiche jetée', statut: 'hypothese', source_id: null, localisation: '', note: '' });
    const citante = await creer(pc, 'affirmations', { fiche_id: garder.id, texte: 'Affirmation gardée', statut: 'fait', source_id: jeter.id, localisation: '', note: '' });
    await creer(pc, 'dossier_fiches', { dossier_id: dossier.id, fiche_id: jeter.id, position: 0, note: '' });
    await synchroniser(pc, serveur, MOI);
    await synchroniser(iphone, serveur, MOI);
    return { serveur, pc, iphone, garder, jeter, dossier, citante };
  }
  const contient = async (appareil: ReturnType<typeof nouvelAppareil>, texte: string) => {
    for (const t of TABLES) if (JSON.stringify(await appareil.table(t).toArray()).includes(texte)) return true;
    return false;
  };

  it('efface réellement les données du serveur, de l\'appareil, puis des autres appareils', async () => {
    const { serveur, pc, iphone, garder, jeter, dossier, citante } = await decor();
    await supprimerFiche(pc, jeter.id);
    await synchroniser(pc, serveur, MOI);
    await synchroniser(iphone, serveur, MOI);
    expect(await compterCorbeille(pc)).toBe(4); // la fiche, sa relation, son affirmation, son lien de dossier
    expect(await contient(iphone, 'Donnée à faire disparaître')).toBe(true); // encore dans la corbeille de l'iPhone

    expect(await viderCorbeille(pc, serveur)).toBe(4);

    expect(await compterCorbeille(pc)).toBe(0);
    expect(await contient(pc, 'Donnée à faire disparaître')).toBe(false);
    expect(JSON.stringify([...serveur.tables.values()].map((m) => [...m.values()]))).not.toContain('Donnée à faire disparaître');
    expect(serveur.tables.get('fiches')!.has(jeter.id)).toBe(false);

    // L'iPhone s'aligne à sa prochaine synchro, sans rien renvoyer au serveur.
    const bilan = await synchroniser(iphone, serveur, MOI);
    expect(bilan.erreurs).toEqual([]);
    expect(await contient(iphone, 'Donnée à faire disparaître')).toBe(false);
    expect(await contient(iphone, 'Affirmation de la fiche jetée')).toBe(false);
    expect(await compterCorbeille(iphone)).toBe(0);
    expect(serveur.tables.get('fiches')!.has(jeter.id)).toBe(false);

    // Les données vivantes sont intactes partout.
    for (const appareil of [pc, iphone]) {
      expect((await appareil.fiches.get(garder.id))!.deleted_at).toBeNull();
      expect((await appareil.fiches.get(dossier.id))!.deleted_at).toBeNull();
      expect((await appareil.affirmations.get(citante.id))!.texte).toBe('Affirmation gardée');
    }
    expect(await pc.fiches.count()).toBe(2);
    await synchroniser(pc, serveur, MOI);
    expect(await pc.fiches.count()).toBe(2);
  });

  it('refuse tant que tout n\'est pas synchronisé, pour ne pas laisser la donnée vivante ailleurs', async () => {
    const { serveur, pc, jeter } = await decor();
    await supprimerFiche(pc, jeter.id); // suppression pas encore envoyée
    await expect(viderCorbeille(pc, serveur)).rejects.toBeInstanceOf(ErreurCorbeille);
    expect((await pc.fiches.get(jeter.id))!.deleted_at).not.toBeNull(); // rien n'a été touché
    expect(serveur.tables.get('fiches')!.has(jeter.id)).toBe(true);
  });

  it('ne peut pas effacer une ligne vivante, même si on le demande au serveur', async () => {
    const { serveur, garder } = await decor();
    expect(await serveur.effacerDefinitivement('fiches', [garder.id])).toEqual([]);
    expect(serveur.tables.get('fiches')!.has(garder.id)).toBe(true);
  });

  it('une fiche supprimée hors ligne sur un autre appareil ne ressuscite pas après le vidage', async () => {
    const { serveur, pc, iphone, jeter } = await decor();
    await supprimerFiche(pc, jeter.id);
    await supprimerFiche(iphone, jeter.id); // l'iPhone la supprime aussi, hors ligne
    await synchroniser(pc, serveur, MOI);
    await viderCorbeille(pc, serveur);
    const bilan = await synchroniser(iphone, serveur, MOI);
    expect(bilan.erreurs).toEqual([]);
    expect(serveur.tables.get('fiches')!.has(jeter.id)).toBe(false);
    expect(await iphone.fiches.get(jeter.id)).toBeUndefined();
    expect(await compterEnAttente(iphone)).toBe(0);
  });

  it('une fiche modifiée hors ligne ailleurs est recréée plutôt que perdue en silence', async () => {
    const { serveur, pc, iphone, jeter } = await decor();
    await modifier(iphone, 'fiches', jeter.id, { contenu: 'Travail fait hors ligne sur iPhone' });
    await supprimerFiche(pc, jeter.id);
    await synchroniser(pc, serveur, MOI);
    await viderCorbeille(pc, serveur);
    await synchroniser(iphone, serveur, MOI);
    expect((serveur.tables.get('fiches')!.get(jeter.id) as any).contenu).toBe('Travail fait hors ligne sur iPhone');
    expect((await iphone.fiches.get(jeter.id))!.deleted_at).toBeNull();
  });

  it('sans compte : vide la corbeille de l\'appareil seulement', async () => {
    const pc = nouvelAppareil();
    const f = await creer(pc, 'fiches', fabriquerFiche('note', 'Locale'));
    await supprimerFiche(pc, f.id);
    expect(await viderCorbeille(pc, null)).toBe(1);
    expect(await pc.fiches.count()).toBe(0);
  });
});
