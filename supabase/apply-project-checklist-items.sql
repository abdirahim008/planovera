-- Promote the compliance checklist to a first-class, project-scoped table.
--
-- Until now checklist items rode only inside the monolithic
-- construction_workspace_snapshots blob. This gives them their own synced
-- table (like BOQ, work plans, certificates, progress, correspondence, …) so
-- each edit is a targeted upsert and the data is durable and inspectable.
--
-- Safe to run more than once. Existing checklist items keep loading from the
-- snapshot blob (the app falls back to it when this table is empty) and get
-- written here on the next checklist edit — no data is lost.

create table if not exists public.project_checklist_items (
  id uuid primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  name text not null,
  payload jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists project_checklist_items_project_idx
on public.project_checklist_items (project_id, updated_at desc);

drop trigger if exists project_checklist_items_set_updated_at on public.project_checklist_items;
create trigger project_checklist_items_set_updated_at
before update on public.project_checklist_items
for each row
execute function public.set_updated_at();

drop trigger if exists project_checklist_items_audit_trigger on public.project_checklist_items;
create trigger project_checklist_items_audit_trigger
after insert or update or delete on public.project_checklist_items
for each row
execute function public.log_project_audit_event();

alter table public.project_checklist_items enable row level security;

drop policy if exists "project_checklist_items_member_select" on public.project_checklist_items;
create policy "project_checklist_items_member_select"
on public.project_checklist_items
for select
to authenticated
using (public.can_access_project(project_id));

drop policy if exists "project_checklist_items_member_insert" on public.project_checklist_items;
create policy "project_checklist_items_member_insert"
on public.project_checklist_items
for insert
to authenticated
with check (public.can_edit_project(project_id));

drop policy if exists "project_checklist_items_member_update" on public.project_checklist_items;
create policy "project_checklist_items_member_update"
on public.project_checklist_items
for update
to authenticated
using (public.can_edit_project(project_id))
with check (public.can_edit_project(project_id));

drop policy if exists "project_checklist_items_member_delete" on public.project_checklist_items;
create policy "project_checklist_items_member_delete"
on public.project_checklist_items
for delete
to authenticated
using (public.can_edit_project(project_id));

comment on table public.project_checklist_items is 'Compliance checklist items linked to projects (contract docs, bonds, insurances, approvals, handover).';
