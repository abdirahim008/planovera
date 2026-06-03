-- ============================================================================
-- fix-projects-rls.sql  — consolidated, fully idempotent
-- ----------------------------------------------------------------------------
-- Applies BOTH the SELECT and INSERT row-level-security policies for
-- public.projects in one safe script. Each policy is dropped (if it exists)
-- immediately before being (re)created, so running the WHOLE file any number
-- of times can never raise 42710 "policy ... already exists".
--
-- IMPORTANT: run the ENTIRE file, not a hand-picked selection of lines. The
-- "already exists" error happens when a `create policy` is run without the
-- `drop policy if exists` line that precedes it.
--
-- Supersedes the scratch files fix-projects-select-rls.sql and
-- fix-projects-insert-rls.sql.
-- ============================================================================

alter table public.projects enable row level security;

-- --- Helper functions (security definer; avoid self-referential RLS) --------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.is_organization_member(org_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = org_uuid
      and user_id = auth.uid()
      and status = 'active'
  );
$$;

-- --- SELECT policy ----------------------------------------------------------
-- Evaluate the read predicate INLINE on the row's own columns (no call to
-- can_access_project(id)) so it does not re-query projects during
-- INSERT ... RETURNING.
drop policy if exists "Users manage own projects"           on public.projects;
drop policy if exists "projects_owner_select"               on public.projects;
drop policy if exists "construction_projects_owner_select"  on public.projects;
drop policy if exists "construction_projects_member_select" on public.projects;
create policy "construction_projects_member_select"
on public.projects
for select
to authenticated
using (
  public.is_admin()
  or owner_id = auth.uid()
  or (organization_id is not null and public.is_organization_member(organization_id))
  or exists (
    select 1 from public.project_members pm
    where pm.project_id = projects.id
      and pm.user_id = auth.uid()
  )
);

-- --- INSERT policy ----------------------------------------------------------
drop policy if exists "projects_owner_insert"               on public.projects;
drop policy if exists "construction_projects_owner_insert"  on public.projects;
drop policy if exists "construction_projects_member_insert" on public.projects;
create policy "construction_projects_member_insert"
on public.projects
for insert
to authenticated
with check (
  (coalesce(owner_id, auth.uid()) = auth.uid() or public.is_admin())
  and (
    organization_id is null
    or public.is_organization_member(organization_id)
    or public.is_admin()
  )
);

-- --- Confirmation -----------------------------------------------------------
select policyname,
       permissive,
       cmd,
       coalesce(qual, '(none)')       as using_expr,
       coalesce(with_check, '(none)') as with_check_expr
from pg_policies
where schemaname = 'public'
  and tablename  = 'projects'
order by cmd, permissive, policyname;
