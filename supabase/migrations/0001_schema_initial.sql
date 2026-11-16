-- =====================================================================
-- ATLANTE : migration 0001, schéma initial
-- À exécuter une seule fois dans l'éditeur SQL de Supabase (voir ACTIONS_MANUELLES.md).
--
-- Contenu :
--   1. Un compteur de révisions et la fonction qui tient à jour chaque ligne
--   2. Les 6 tables de données
--   3. La Row Level Security (RLS) sur TOUTES les tables
--   4. La fonction « supprimer mon compte » (droit à l'effacement, RGPD)
--   5. Le registre des migrations appliquées
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Révisions
-- Chaque écriture reçoit un numéro de révision (« rev ») toujours croissant.
-- Il sert à deux choses :
--   - recevoir : l'app demande « tout ce qui a une rev supérieure à ma dernière rev connue » ;
--   - détecter les conflits : l'app ne met à jour une ligne que si sa rev n'a pas bougé.
-- ---------------------------------------------------------------------
create sequence if not exists public.atlante_rev;

create or replace function public.atlante_avant_ecriture()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    -- Ces deux colonnes ne changent jamais après la création.
    new.owner_id := old.owner_id;
    new.created_at := old.created_at;
  end if;
  new.rev := nextval('public.atlante_rev');
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Tables
-- Colonnes communes : id (UUID créé par l'app), owner_id (propriétaire),
-- created_at, updated_at, deleted_at (suppression logique), rev.
-- « on delete cascade » sur owner_id : supprimer le compte supprime ses lignes.
-- ---------------------------------------------------------------------
create table public.domaines (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  rev bigint not null default 0,
  nom text not null,
  description text not null default ''
);

create table public.types_relation (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  rev bigint not null default 0,
  nom text not null,
  nom_inverse text not null default ''
);

create table public.fiches (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  rev bigint not null default 0,
  type text not null check (type in (
    'personne', 'concept', 'courant', 'oeuvre', 'organisation', 'evenement',
    'methode', 'citation', 'source', 'note', 'dossier')),
  titre text not null default '',
  contenu text not null default '',
  auteur text not null default '',
  url text not null default '',
  date text not null default '',
  domaine_ids uuid[] not null default '{}',
  champs jsonb not null default '{}',
  provenance jsonb
);

create table public.relations (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  rev bigint not null default 0,
  source_id uuid not null references public.fiches (id) on delete cascade,
  cible_id uuid not null references public.fiches (id) on delete cascade,
  type_relation_id uuid not null references public.types_relation (id) on delete cascade,
  note text not null default ''
);

create table public.affirmations (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  rev bigint not null default 0,
  fiche_id uuid not null references public.fiches (id) on delete cascade,
  texte text not null default '',
  statut text not null check (statut in (
    'fait', 'interpretation', 'hypothese', 'controverse', 'insuffisant', 'inference_ia', 'personnel')),
  source_id uuid references public.fiches (id) on delete set null,
  localisation text not null default '',
  note text not null default ''
);

create table public.dossier_fiches (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  rev bigint not null default 0,
  dossier_id uuid not null references public.fiches (id) on delete cascade,
  fiche_id uuid not null references public.fiches (id) on delete cascade,
  position integer not null default 0,
  note text not null default ''
);

-- ---------------------------------------------------------------------
-- 3. Pour chaque table : index, déclencheur de révision, droits, RLS
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['domaines', 'types_relation', 'fiches', 'relations', 'affirmations', 'dossier_fiches']
  loop
    -- Index pour « donne-moi mes lignes modifiées depuis la rev N ».
    execute format('create index %I on public.%I (owner_id, rev)', t || '_owner_rev', t);

    execute format(
      'create trigger %I before insert or update on public.%I
         for each row execute function public.atlante_avant_ecriture()', t || '_rev', t);

    -- Droits de base : rien pour les visiteurs anonymes, lecture et écriture pour les connectés.
    -- Pas de droit DELETE : l'app ne fait que des suppressions logiques (deleted_at).
    execute format('revoke all on public.%I from anon, public', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);

    -- ROW LEVEL SECURITY : sans politique qui l'autorise, aucune ligne n'est visible.
    execute format('alter table public.%I enable row level security', t);

    -- Chaque ligne n'est lisible et modifiable que par son propriétaire.
    execute format(
      'create policy %I on public.%I for select to authenticated
         using (owner_id = (select auth.uid()))', t || '_lire', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated
         with check (owner_id = (select auth.uid()))', t || '_creer', t);
    execute format(
      'create policy %I on public.%I for update to authenticated
         using (owner_id = (select auth.uid()))
         with check (owner_id = (select auth.uid()))', t || '_modifier', t);
  end loop;
end;
$$;

grant usage on sequence public.atlante_rev to authenticated;

-- ---------------------------------------------------------------------
-- 4. Droit à l'effacement : « Supprimer mon compte et toutes mes données »
-- « security definer » : la fonction s'exécute avec les droits de son créateur, ce qui lui
-- permet de supprimer la ligne du compte dans auth.users. Elle ne peut supprimer QUE le compte
-- de la personne connectée (auth.uid()). Les données partent avec lui (on delete cascade).
-- ---------------------------------------------------------------------
create or replace function public.supprimer_mon_compte()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  moi uuid := auth.uid();
begin
  if moi is null then
    raise exception 'Non connecté';
  end if;
  delete from auth.users where id = moi;
end;
$$;

revoke all on function public.supprimer_mon_compte() from public, anon;
grant execute on function public.supprimer_mon_compte() to authenticated;

-- ---------------------------------------------------------------------
-- 5. Registre des migrations appliquées (lisible par personne depuis l'app)
-- ---------------------------------------------------------------------
create table public.atlante_migrations (
  version integer primary key,
  nom text not null,
  appliquee_le timestamptz not null default now()
);
alter table public.atlante_migrations enable row level security;
revoke all on public.atlante_migrations from anon, authenticated, public;

insert into public.atlante_migrations (version, nom) values (1, '0001_schema_initial');
