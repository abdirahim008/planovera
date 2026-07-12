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

-- Note: the same self-referential pattern exists on organizations
-- (is_organization_member(id)) and organization_members
-- (is_organization_member(organization_id)) SELECT policies. Those only bite
-- when creating a new organization or adding a member via insert().select();
-- harden them the same way if/when those flows start failing with 42501.
