// La migration SQL est exécutée dans un vrai PostgreSQL embarqué (PGlite), avec les mêmes rôles
// que Supabase (anon, authenticated) et la même fonction auth.uid().
// Ce test vérifie le SQL lui-même ; il ne remplace pas la vérification sur le vrai projet Supabase.
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { nouvelAppareil } from './outils';
import { COLONNES, TABLES, type NomTable } from '../src/modele/types';
import { ErreurDistante, type Distant, type LigneDistante } from '../src/synchro/distant';
import { normaliserDates } from '../src/synchro/distantSupabase';
import { resoudreConflit, synchroniser, viderCorbeille } from '../src/synchro/moteur';
import { creer, fabriquerFiche, modifier, supprimerFiche } from '../src/donnees/depot';
import { semerSiPremierLancement } from '../src/donnees/db';

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';

let pg: PGlite;

/** Exécute du SQL « en tant que » un utilisateur connecté, un visiteur anonyme, ou l'administrateur. */
async function en<T>(qui: string | 'anon' | 'admin', f: () => Promise<T>): Promise<T> {
  if (qui === 'admin') return f();
  await pg.exec(`set role ${qui === 'anon' ? 'anon' : 'authenticated'}; select set_config('request.jwt.claim.sub', '${qui === 'anon' ? '' : qui}', false);`);
  try {
    return await f();
  } finally {
    await pg.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}

/** Le « distant » branché sur PostgreSQL, pour faire tourner le vrai moteur de synchro sur le vrai SQL. */
class DistantPg implements Distant {
  constructor(private utilisateur: string) {}
  private cols(table: NomTable, ligne: Record<string, unknown>) {
    return ['id', 'created_at', 'updated_at', 'deleted_at', ...(COLONNES[table] as string[])].filter((c) => c in ligne);
  }
  private async q(sql: string, params: unknown[]): Promise<LigneDistante[]> {
    try {
      const r = await en(this.utilisateur, () => pg.query<{ l: LigneDistante }>(sql, params));
      return r.rows.map((x) => normaliserDates(x.l));
    } catch (e: any) {
      throw new ErreurDistante(e.code === '23505' ? 'existe' : 'autre', e.message);
    }
  }
  lireDepuis(table: NomTable, rev: number, limite: number) {
    return this.q(`select to_jsonb(t) as l from public.${table} t where rev > $1 order by rev limit $2`, [rev, limite]);
  }
  async lire(table: NomTable, id: string) {
    return (await this.q(`select to_jsonb(t) as l from public.${table} t where id = $1`, [id]))[0] ?? null;
  }
  async inserer(table: NomTable, ligne: Record<string, unknown>) {
    const c = this.cols(table, ligne).join(', ');
    const r = await this.q(`insert into public.${table} as t (${c}) select ${c} from jsonb_populate_record(null::public.${table}, $1::jsonb) returning to_jsonb(t) as l`, [JSON.stringify(ligne)]);
    return r[0];
  }
  async mettreAJour(table: NomTable, ligne: Record<string, unknown>, revAttendue: number) {
    const c = this.cols(table, ligne).filter((x) => x !== 'id').join(', ');
    const r = await this.q(
      `update public.${table} as t set (${c}) = (select ${c} from jsonb_populate_record(null::public.${table}, $1::jsonb)) where id = $2 and rev = $3 returning to_jsonb(t) as l`,
      [JSON.stringify(ligne), ligne.id, revAttendue],
    );
    return r[0] ?? null;
  }
  async idsExistants(table: NomTable, ids: string[]) {
    return (await this.q(`select to_jsonb(t) as l from public.${table} t where id = any($1::uuid[])`, [ids])).map((l) => l.id);
  }
  async effacerDefinitivement(table: NomTable, ids: string[]) {
    return (await this.q(`delete from public.${table} t where id = any($1::uuid[]) returning to_jsonb(t) as l`, [ids])).map((l) => l.id);
  }
}

beforeAll(async () => {
  pg = new PGlite();
  // Ce que Supabase fournit d'office : les rôles, le schéma auth, auth.uid().
  await pg.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    grant usage on schema public to anon, authenticated;
    insert into auth.users values ('${ALICE}', 'alice@exemple.fr'), ('${BOB}', 'bob@exemple.fr');
  `);
  await pg.exec(readFileSync('supabase/migrations/0001_schema_initial.sql', 'utf8'));
  await pg.exec(readFileSync('supabase/migrations/0002_vider_corbeille.sql', 'utf8'));
});

const ficheSql = (id: string, titre: string) => `insert into public.fiches (id, type, titre) values ('${id}', 'note', '${titre}')`;

describe('migration SQL et RLS', () => {
  it('la RLS est activée sur toutes les tables du schéma public', async () => {
    const r = await pg.query<{ relname: string; relrowsecurity: boolean }>(
      `select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r'`,
    );
    expect(r.rows.map((x) => x.relname).sort()).toEqual([...TABLES, 'atlante_migrations'].sort());
    expect(r.rows.every((x) => x.relrowsecurity)).toBe(true);
  });

  it('chaque utilisateur ne voit et ne modifie que ses lignes', async () => {
    const idA = crypto.randomUUID();
    const idB = crypto.randomUUID();
    await en(ALICE, () => pg.exec(ficheSql(idA, "Fiche d''Alice")));
    await en(BOB, () => pg.exec(ficheSql(idB, 'Fiche de Bob')));

    const vuesParAlice = await en(ALICE, () => pg.query<{ id: string; owner_id: string }>(`select id, owner_id from public.fiches where id in ('${idA}', '${idB}')`));
    expect(vuesParAlice.rows).toEqual([{ id: idA, owner_id: ALICE }]); // propriétaire rempli par le serveur

    // Bob tente de modifier la fiche d'Alice : aucune ligne touchée.
    const tentative = await en(BOB, () => pg.query(`update public.fiches set titre = 'piratée' where id = '${idA}' returning id`));
    expect(tentative.rows).toHaveLength(0);
    // Bob tente de créer une ligne au nom d'Alice : refusé.
    await expect(en(BOB, () => pg.exec(`insert into public.fiches (id, owner_id, type) values ('${crypto.randomUUID()}', '${ALICE}', 'note')`))).rejects.toThrow(/row-level security/);
    // Alice tente de donner sa fiche à Bob : le propriétaire ne change pas.
    await en(ALICE, () => pg.exec(`update public.fiches set owner_id = '${BOB}' where id = '${idA}'`));
    const apres = await pg.query<{ owner_id: string; titre: string }>(`select owner_id, titre from public.fiches where id = '${idA}'`);
    expect(apres.rows[0]).toEqual({ owner_id: ALICE, titre: "Fiche d'Alice" });
  });

  it('un visiteur anonyme (clé publique seule, sans connexion) n\'a accès à rien', async () => {
    for (const t of TABLES) {
      await expect(en('anon', () => pg.query(`select * from public.${t}`))).rejects.toThrow(/permission denied/);
    }
    await expect(en('anon', () => pg.exec(ficheSql(crypto.randomUUID(), 'x')))).rejects.toThrow(/permission denied/);
    await expect(en('anon', () => pg.query(`select public.supprimer_mon_compte()`))).rejects.toThrow(/permission denied/);
    await expect(en(ALICE, () => pg.query(`select * from public.atlante_migrations`))).rejects.toThrow(/permission denied/);
  });

  it('suppression physique : seulement mes lignes déjà dans la corbeille ; listes fermées contrôlées', async () => {
    const vivante = crypto.randomUUID();
    const jetee = crypto.randomUUID();
    const jeteeBob = crypto.randomUUID();
    await en(ALICE, () => pg.exec(`${ficheSql(vivante, 'vivante')}; insert into public.fiches (id, type, deleted_at) values ('${jetee}', 'note', now())`));
    await en(BOB, () => pg.exec(`insert into public.fiches (id, type, deleted_at) values ('${jeteeBob}', 'note', now())`));
    // Alice demande à tout effacer, sans filtre : le serveur n'efface que SA ligne déjà supprimée.
    const effacees = await en(ALICE, () => pg.query<{ id: string }>(`delete from public.fiches returning id`));
    expect(effacees.rows.map((r) => r.id)).toEqual([jetee]);
    const restantes = await pg.query<{ id: string }>(`select id from public.fiches where id in ('${vivante}', '${jetee}', '${jeteeBob}')`);
    expect(restantes.rows.map((r) => r.id).sort()).toEqual([vivante, jeteeBob].sort());
    await expect(en('anon', () => pg.exec(`delete from public.fiches`))).rejects.toThrow(/permission denied/);
    await en(BOB, () => pg.exec(`delete from public.fiches where id = '${jeteeBob}'`));
    await expect(en(ALICE, () => pg.exec(`insert into public.fiches (id, type) values ('${crypto.randomUUID()}', 'inconnu')`))).rejects.toThrow(/check constraint/);
  });

  it('la révision augmente à chaque écriture, même si le client tente de la fixer', async () => {
    const id = crypto.randomUUID();
    await en(ALICE, () => pg.exec(`insert into public.fiches (id, type, rev) values ('${id}', 'note', 999999)`));
    const r1 = (await pg.query<{ rev: number }>(`select rev from public.fiches where id = '${id}'`)).rows[0].rev;
    expect(r1).toBeLessThan(999999);
    await en(ALICE, () => pg.exec(`update public.fiches set titre = 'v2', rev = 1 where id = '${id}'`));
    const r2 = (await pg.query<{ rev: number }>(`select rev from public.fiches where id = '${id}'`)).rows[0].rev;
    expect(r2).toBeGreaterThan(r1);
  });
});

describe('moteur de synchro sur le vrai SQL', () => {
  it('deux appareils : créations, modifications, suppression, conflit et résolution', async () => {
    const pc = nouvelAppareil();
    const iphone = nouvelAppareil();
    const serveur = new DistantPg(ALICE);
    await semerSiPremierLancement(pc);
    await semerSiPremierLancement(iphone);

    const domaine = (await pc.domaines.toArray())[0];
    const type = (await pc.types_relation.toArray())[0];
    const a = await creer(pc, 'fiches', { ...fabriquerFiche('personne', 'Antonio Gramsci'), domaine_ids: [domaine.id], champs: { naissance: '1891' } });
    const b = await creer(pc, 'fiches', { ...fabriquerFiche('oeuvre', "Cahiers de l'« hégémonie »"), contenu: 'Texte\navec des lignes' });
    const rel = await creer(pc, 'relations', { source_id: a.id, cible_id: b.id, type_relation_id: type.id, note: '' });
    await creer(pc, 'affirmations', { fiche_id: b.id, texte: 'Affirmation', statut: 'fait', source_id: a.id, localisation: 'p. 3', note: '' });
    const dossier = await creer(pc, 'fiches', fabriquerFiche('dossier', 'Dossier'));
    await creer(pc, 'dossier_fiches', { dossier_id: dossier.id, fiche_id: b.id, position: 0, note: '' });

    const b1 = await synchroniser(pc, serveur, ALICE);
    expect(b1.erreurs).toEqual([]);
    expect(b1.envoyees).toBe(14 + 10 + 3 + 1 + 1 + 1);

    const b2 = await synchroniser(iphone, serveur, ALICE);
    expect(b2.erreurs).toEqual([]);
    expect(await iphone.domaines.count()).toBe(14); // semences fusionnées
    const recue = (await iphone.fiches.get(a.id))!;
    expect(recue).toMatchObject({ titre: 'Antonio Gramsci', domaine_ids: [domaine.id], champs: { naissance: '1891' }, owner_id: ALICE, _modifie: 0 });
    expect(recue.created_at).toBe(a.created_at); // dates conservées à l'identique
    expect((await iphone.fiches.get(b.id))!.contenu).toBe('Texte\navec des lignes');

    // Conflit
    await modifier(pc, 'fiches', b.id, { contenu: 'Version PC' });
    await modifier(iphone, 'fiches', b.id, { contenu: 'Version iPhone' });
    await synchroniser(pc, serveur, ALICE);
    const b3 = await synchroniser(iphone, serveur, ALICE);
    expect(b3.conflits).toBe(1);
    await resoudreConflit(iphone, (await iphone.conflits.toArray())[0].cle, 'locale');
    expect((await synchroniser(iphone, serveur, ALICE)).conflits).toBe(0);
    await synchroniser(pc, serveur, ALICE);
    expect((await pc.fiches.get(b.id))!.contenu).toBe('Version iPhone');

    // Suppression propagée
    await supprimerFiche(pc, b.id);
    expect((await synchroniser(pc, serveur, ALICE)).erreurs).toEqual([]);
    await synchroniser(iphone, serveur, ALICE);
    expect((await iphone.fiches.get(b.id))!.deleted_at).not.toBeNull();
    expect((await iphone.relations.get(rel.id))!.deleted_at).not.toBeNull();

    // Corbeille vidée sur le PC : effacement réel dans PostgreSQL, puis sur l'iPhone.
    const dansCorbeille = async () => (await pg.query<{ n: number }>(`select count(*)::int as n from public.fiches where owner_id = '${ALICE}' and id = '${b.id}'`)).rows[0].n;
    expect(await dansCorbeille()).toBe(1);
    expect(await viderCorbeille(pc, serveur)).toBeGreaterThanOrEqual(4);
    expect(await dansCorbeille()).toBe(0);
    expect((await pg.query(`select 1 from public.relations where id = '${rel.id}'`)).rows).toHaveLength(0);
    expect((await pg.query(`select 1 from public.fiches where id = '${a.id}' and deleted_at is null`)).rows).toHaveLength(1);
    expect((await synchroniser(iphone, serveur, ALICE)).erreurs).toEqual([]);
    expect(await iphone.fiches.get(b.id)).toBeUndefined();
    expect(await iphone.relations.get(rel.id)).toBeUndefined();
    expect((await iphone.fiches.get(a.id))!.deleted_at).toBeNull();

    // Bob, connecté sur son propre appareil, ne reçoit rien d'Alice.
    const appareilBob = nouvelAppareil();
    const b4 = await synchroniser(appareilBob, new DistantPg(BOB), BOB);
    expect((await appareilBob.fiches.toArray()).filter((f) => f.owner_id === ALICE)).toHaveLength(0);
    expect(b4.recues).toBe(1); // seulement la fiche de Bob créée dans le test précédent
  });
});

describe('droit à l\'effacement', () => {
  it('« supprimer mon compte » efface le compte et toutes ses données, et seulement les siennes', async () => {
    const avant = await pg.query<{ n: number }>(`select count(*)::int as n from public.fiches where owner_id = '${ALICE}'`);
    expect(avant.rows[0].n).toBeGreaterThan(0);
    await en(ALICE, () => pg.query(`select public.supprimer_mon_compte()`));
    for (const t of TABLES) {
      const r = await pg.query<{ n: number }>(`select count(*)::int as n from public.${t} where owner_id = '${ALICE}'`);
      expect(r.rows[0].n).toBe(0);
    }
    expect((await pg.query(`select 1 from auth.users where id = '${ALICE}'`)).rows).toHaveLength(0);
    expect((await pg.query(`select 1 from auth.users where id = '${BOB}'`)).rows).toHaveLength(1);
    expect((await pg.query<{ n: number }>(`select count(*)::int as n from public.fiches where owner_id = '${BOB}'`)).rows[0].n).toBe(1);
  });
});
