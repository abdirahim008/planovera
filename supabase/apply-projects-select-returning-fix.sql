-- Fix: "new row violates row-level security policy for table projects" (42501)
-- on EVERY project create, even for a valid org owner.
--
-- Root cause: the projects SELECT policy used can_access_project(id), which
-- re-queries the projects table for the current row. The app creates rows with
-- insert().select() (= INSERT ... RETURNING); RETURNING re-checks the new row
-- against the SELECT policy, but the new row is not yet visible to that
-- self-query, so it returned false and Postgres rejected the whole statement.
-- (Plain inserts without RETURNING passed — which is why the INSERT policy and
-- the owner/org membership all looked correct.)
--
-- Fix: the SELECT policy checks the row's own columns directly. Identical access
-- semantics to can_access_project, but works during RETURNING.
--
-- Run once in the Supabase SQL editor. Idempotent — safe to re-run.

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
    where pm.project_id = projects.id and pm.user_id = auth.uid()
  )
);

-- The same self-referential pattern affects organization creation and member
-- adds via insert().select(). Add a direct "you can always see your own row"
-- branch (owner for orgs, self for memberships) — no access is widened.

drop policy if exists "organizations_member_select" on public.organizations;
create policy "organizations_member_select"
on public.organizations
for select
to authenticated
using (
  public.is_admin()
  or owner_id = auth.uid()
  or public.is_organization_member(id)
);

drop policy if exists "organization_members_member_select" on public.organization_members;
create policy "organization_members_member_select"
on public.organization_members
for select
to authenticated
using (
  public.is_admin()
  or user_id = auth.uid()
  or public.is_organization_member(organization_id)
);
