-- Fix: deleting a project fails with
--   "insert or update on table audit_logs violates foreign key constraint
--    audit_logs_project_id_fkey"
--
-- Cause: log_project_audit_event() runs as an AFTER INSERT/UPDATE/DELETE trigger
-- on projects and every project-scoped child table. When a project is deleted the
-- delete cascades to its children, and each AFTER DELETE trigger (including the one
-- on projects itself) tries to write an audit_logs row referencing the project that
-- has just been removed. The new audit row therefore points at a non-existent
-- projects.id and the foreign key check fails, aborting the whole delete.
--
-- Same hazard applies to organization deletes via audit_logs_organization_id_fkey.
--
-- Fix: before writing the audit row, drop any parent reference that no longer
-- exists. The deleted entity is still captured in entity_id + details, so no audit
-- information is lost. Run this once in the Supabase SQL Editor.

create or replace function public.log_project_audit_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_project_id uuid;
  target_organization_id uuid;
  target_entity_id text;
  row_data jsonb;
begin
  if tg_op = 'DELETE' then
    row_data := to_jsonb(old);
  else
    row_data := to_jsonb(new);
  end if;

  if tg_table_name = 'projects' then
    target_project_id := nullif(row_data ->> 'id', '')::uuid;
    target_organization_id := nullif(row_data ->> 'organization_id', '')::uuid;
  elsif tg_table_name = 'organizations' then
    target_project_id := null;
    target_organization_id := nullif(row_data ->> 'id', '')::uuid;
  else
    target_project_id := nullif(row_data ->> 'project_id', '')::uuid;
    target_organization_id := nullif(row_data ->> 'organization_id', '')::uuid;
  end if;
  if target_organization_id is null and target_project_id is not null then
    select organization_id
    into target_organization_id
    from public.projects
    where id = target_project_id;
  end if;

  -- When the referenced parent row is being deleted (e.g. a project delete that
  -- cascades to its child rows), that parent is already gone by the time this
  -- AFTER trigger fires. Inserting the audit row with a dangling foreign key
  -- would violate audit_logs_project_id_fkey / audit_logs_organization_id_fkey,
  -- so null out the reference and rely on entity_id + details for traceability.
  if target_project_id is not null
     and not exists (select 1 from public.projects where id = target_project_id) then
    target_project_id := null;
  end if;
  if target_organization_id is not null
     and not exists (select 1 from public.organizations where id = target_organization_id) then
    target_organization_id := null;
  end if;

  target_entity_id := coalesce(row_data ->> 'id', row_data ->> 'user_id', 'unknown');

  insert into public.audit_logs (
    organization_id,
    project_id,
    actor_id,
    entity_type,
    entity_id,
    action,
    details
  )
  values (
    target_organization_id,
    target_project_id,
    auth.uid(),
    tg_table_name,
    target_entity_id,
    lower(tg_op),
    jsonb_build_object('table', tg_table_name)
  );

  return coalesce(new, old);
end;
$$;
