-- =====================================================================
-- ATLANTE : migration 0002, « Vider la corbeille »
-- À exécuter une seule fois, APRÈS la 0001, dans l'éditeur SQL de Supabase.
--
-- Jusqu'ici, l'app ne pouvait que marquer une ligne comme supprimée (deleted_at).
-- Pour qu'une donnée supprimée puisse être réellement effacée sans supprimer le compte
-- (minimisation, RGPD), on autorise la suppression physique, mais dans un seul cas :
-- la ligne m'appartient ET elle est déjà dans la corbeille.
-- Une ligne vivante ne peut donc jamais être détruite directement depuis l'app.
-- =====================================================================
do $$
declare
  t text;
begin
  foreach t in array array['domaines', 'types_relation', 'fiches', 'relations', 'affirmations', 'dossier_fiches']
  loop
    execute format('grant delete on public.%I to authenticated', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated
         using (owner_id = (select auth.uid()) and deleted_at is not null)', t || '_effacer', t);
  end loop;
end;
$$;

insert into public.atlante_migrations (version, nom) values (2, '0002_vider_corbeille');
