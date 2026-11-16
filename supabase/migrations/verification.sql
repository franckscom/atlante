-- Vérification après la migration : à exécuter dans l'éditeur SQL de Supabase.
-- Résultat attendu : 7 lignes, toutes avec rls_active = true ;
-- 3 politiques pour chaque table de données, 0 pour atlante_migrations.
select
  c.relname as table_name,
  c.relrowsecurity as rls_active,
  (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as politiques
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;
