-- ============================================================================
-- rls-audit.sql — READ-ONLY. Run in the Supabase SQL Editor to verify Row Level
-- Security is enabled and correctly scoped on the LIVE database (not just in
-- schema.sql). Nothing here modifies data. Review each result set.
-- ============================================================================

-- 1) TABLES WITH RLS DISABLED  → must be EMPTY.
--    Any public table here is wide open: any logged-in (or anon) caller can read
--    /write every row through the Supabase API.
select n.nspname as schema, c.relname as table
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relrowsecurity = false
order by 2;

-- 2) RLS ENABLED BUT NO POLICIES  → these tables are deny-all (safe from leaks,
--    but the app may silently fail to read/write them). Confirm each is intended.
select t.tablename
from pg_tables t
left join pg_policies p
  on p.schemaname = t.schemaname and p.tablename = t.tablename
where t.schemaname = 'public'
group by t.tablename
having count(p.policyname) = 0
order by 1;

-- 3) OVER-PERMISSIVE POLICIES  → a SELECT/ALL policy with qual `true` (or null)
--    lets any matching role touch EVERY row. Expect ONLY the shared library
--    tables here (boq_library_items, drawing_library_items, billing_plans),
--    and they should be restricted to role {authenticated}, never {public}.
--    Anything else (projects, certificates, etc.) with `true` is a leak.
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and (qual is null or btrim(qual) = 'true' or with_check is null or btrim(with_check) = 'true')
order by tablename, cmd;

-- 4) POLICIES TARGETING anon / public  → should be EMPTY (or only intentional
--    public-read tables). A policy granted to {public} or {anon} is reachable
--    without logging in.
select tablename, policyname, cmd, roles, qual
from pg_policies
where schemaname = 'public'
  and (roles::text[] && array['anon','public'])
order by tablename, cmd;

-- 5) FULL POLICY DUMP  → eyeball the scoping expression on every sensitive table.
--    project_* / projects / *_certificates should reference can_access_project /
--    can_edit_project / can_admin_project; workspace_* / drawing_projects should
--    reference owner_id = auth.uid().
select tablename, policyname, cmd, roles, qual as using_expr, with_check
from pg_policies
where schemaname = 'public'
order by tablename, cmd, policyname;

-- 6) HELPER FUNCTIONS EXIST AND ARE SECURITY DEFINER  → the scoping relies on
--    these. Missing or non-definer functions break the policies. Expect one row
--    each, prosecdef = true.
select p.proname, p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'is_admin','can_access_project','can_edit_project','can_admin_project',
    'is_organization_member','can_manage_organization','can_view_profile'
  )
order by 1;

-- 7) TABLE-LEVEL GRANTS TO anon/authenticated  → Supabase relies on RLS, but a
--    stray GRANT to anon on a sensitive table widens exposure. Review anon rows
--    especially; they should be limited to library/reference tables.
select table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type) as privs
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon','authenticated')
group by table_name, grantee
order by grantee, table_name;
