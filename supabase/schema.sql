create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  company text,
  signature_display_name text,
  signature_role_title text,
  signature_image_data_url text,
  role text not null default 'engineer' check (role in ('engineer', 'admin')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.profiles
  add column if not exists email text,
  add column if not exists full_name text,
  add column if not exists company text,
  add column if not exists role text not null default 'engineer',
  add column if not exists signature_display_name text,
  add column if not exists signature_role_title text,
  add column if not exists signature_image_data_url text;

-- Backfill email for pre-existing profile rows that predate the column, so the
-- not-null/unique constraint and the org backfill below have a value to use.
update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id
  and (p.email is null or p.email = '');

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_email_key'
  ) then
    alter table public.profiles add constraint profiles_email_key unique (email);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'profiles_role_check'
  ) then
    alter table public.profiles add constraint profiles_role_check check (role in ('engineer', 'admin'));
  end if;

  if not exists (select 1 from public.profiles where email is null) then
    alter table public.profiles alter column email set not null;
  end if;
end $$;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  owner_id uuid references public.profiles(id) on delete set null,
  personal boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'manager', 'member', 'viewer')),
  status text not null default 'active' check (status in ('active', 'invited', 'suspended')),
  joined_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, user_id)
);

create table if not exists public.billing_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  audience text not null check (audience in ('individual', 'organization')),
  billing_interval text not null check (billing_interval in ('monthly', 'yearly')),
  base_price_cents integer not null default 0,
  per_seat_price_cents integer not null default 0,
  included_seats integer not null default 1,
  trial_days integer not null default 30,
  description text,
  features text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.organization_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  plan_code text not null references public.billing_plans(code) on delete restrict,
  audience text not null check (audience in ('individual', 'organization')),
  billing_interval text not null check (billing_interval in ('monthly', 'yearly')),
  status text not null default 'trialing' check (status in ('trialing', 'active', 'past_due', 'canceled', 'incomplete')),
  seat_count integer not null default 1 check (seat_count > 0),
  included_seats integer not null default 1 check (included_seats > 0),
  base_price_cents integer not null default 0,
  per_seat_price_cents integer not null default 0,
  provider text,
  provider_customer_id text,
  provider_subscription_id text,
  provider_price_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  trial_ends_at timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id)
);

create table if not exists public.organization_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'member' check (role in ('admin', 'manager', 'member', 'viewer')),
  delivery_method text not null default 'manual' check (delivery_method in ('manual', 'email')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  seat_reserved boolean not null default true,
  invite_token text not null unique,
  invited_by uuid references public.profiles(id) on delete set null,
  accepted_by uuid references public.profiles(id) on delete set null,
  expires_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

do $$
begin
  if to_regclass('public.projects') is not null
    and to_regclass('public.drawing_projects') is null
    and exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'projects'
        and column_name = 'pages'
    )
  then
    alter table public.projects rename to drawing_projects;
  end if;

  if to_regclass('public.library_items') is not null and to_regclass('public.drawing_library_items') is null then
    alter table public.library_items rename to drawing_library_items;
  end if;
end;
$$;

do $$
begin
  if to_regclass('public.boq_library') is not null and to_regclass('public.boq_library_items') is null then
    alter table public.boq_library rename to boq_library_items;
  end if;
end;
$$;

do $$
begin
  if to_regclass('public.projects') is not null
    and exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'projects'
        and column_name = 'user_id'
    )
    and not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'projects'
        and column_name = 'owner_id'
    )
  then
    alter table public.projects rename column user_id to owner_id;
  end if;
end;
$$;

create table if not exists public.programs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  name text not null,
  code text,
  description text,
  client_name text,
  location text,
  currency text not null default 'USD',
  budget_amount text,
  start_date date,
  end_date date,
  status text not null default 'active' check (status in ('planning', 'active', 'completed', 'paused')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.project_categories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  name text not null,
  code text,
  description text,
  color text,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  program_id uuid references public.programs(id) on delete set null,
  category_id uuid references public.project_categories(id) on delete set null,
  category_name text,
  name text not null,
  type text not null check (type in ('construction', 'non-construction')),
  role text not null check (role in ('contractor', 'supervision', 'employer')),
  code text,
  contract_number text,
  client_name text,
  contractor_name text,
  consultant_name text,
  location text,
  region text,
  town text,
  latitude text,
  longitude text,
  contract_title text,
  contract_amount text,
  currency text not null default 'USD',
  start_date date,
  end_date date,
  client_logo_data_url text,
  client_display_name text,
  client_address text,
  issuer_display_name text,
  issuer_address text,
  header_tagline text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'editor' check (role in ('owner', 'admin', 'editor', 'commenter', 'viewer')),
  permissions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (project_id, user_id)
);

create table if not exists public.construction_workspace_snapshots (
  owner_id uuid primary key references public.profiles(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  project_id uuid references public.projects(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  entity_type text not null,
  entity_id text not null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.project_presence (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  active_module text,
  cursor_state jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (project_id, user_id)
);

create table if not exists public.drawing_projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  linked_project_id text,
  linked_project_name text,
  name text not null,
  pages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.drawing_library_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null check (category in ('layouts', 'structural', 'mechanical', 'electrical', 'civil', 'details')),
  description text not null default '',
  tags text[] not null default '{}',
  svg text not null,
  thumbnail text,
  author_id uuid references public.profiles(id) on delete set null,
  author_name text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- Backfill the thumbnail column on databases created before it existed.
alter table public.drawing_library_items add column if not exists thumbnail text;

create table if not exists public.boq_library_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  category text not null default 'General',
  subcategory text not null default '',
  tags text[] not null default '{}',
  sheets jsonb not null default '[]'::jsonb,
  author_id uuid references public.profiles(id) on delete set null,
  author_name text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.project_boq_documents (
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

create table if not exists public.project_work_plans (
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

create table if not exists public.project_simple_item_sets (
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

create table if not exists public.project_payment_certificates (
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

create table if not exists public.project_progress_reports (
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

create table if not exists public.project_generated_documents (
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

create table if not exists public.project_correspondence_records (
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

create table if not exists public.workspace_attendee_groups (
  id uuid primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.workspace_meeting_minutes (
  id uuid primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.workspace_action_points (
  id uuid primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.projects
  add column if not exists owner_id uuid;

alter table public.projects
  add column if not exists organization_id uuid;

alter table public.projects
  add column if not exists program_id uuid;

alter table public.projects
  add column if not exists category_id uuid;

alter table public.projects
  add column if not exists category_name text;

alter table public.programs
  add column if not exists owner_id uuid;

alter table public.programs
  add column if not exists organization_id uuid;

alter table public.programs
  add column if not exists code text;

alter table public.programs
  add column if not exists description text;

alter table public.programs
  add column if not exists client_name text;

alter table public.programs
  add column if not exists location text;

alter table public.programs
  add column if not exists currency text;

alter table public.programs
  add column if not exists budget_amount text;

alter table public.programs
  add column if not exists start_date date;

alter table public.programs
  add column if not exists end_date date;

alter table public.programs
  add column if not exists status text;

alter table public.programs
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

alter table public.project_categories
  add column if not exists owner_id uuid;

alter table public.project_categories
  add column if not exists organization_id uuid;

alter table public.project_categories
  add column if not exists code text;

alter table public.project_categories
  add column if not exists description text;

alter table public.project_categories
  add column if not exists color text;

alter table public.project_categories
  add column if not exists status text;

alter table public.project_categories
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'projects_program_id_fkey'
  ) then
    alter table public.projects
      add constraint projects_program_id_fkey
      foreign key (program_id)
      references public.programs(id)
      on delete set null;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'projects_category_id_fkey'
  ) then
    alter table public.projects
      add constraint projects_category_id_fkey
      foreign key (category_id)
      references public.project_categories(id)
      on delete set null;
  end if;
end;
$$;

alter table public.projects
  add column if not exists code text;

alter table public.projects
  add column if not exists contract_number text;

alter table public.projects
  add column if not exists client_name text;

alter table public.projects
  add column if not exists contractor_name text;

alter table public.projects
  add column if not exists consultant_name text;

alter table public.projects
  add column if not exists location text;

alter table public.projects
  add column if not exists region text;

alter table public.projects
  add column if not exists town text;

alter table public.projects
  add column if not exists latitude text;

alter table public.projects
  add column if not exists longitude text;

alter table public.projects
  add column if not exists contract_title text;

alter table public.projects
  add column if not exists contract_amount text;

alter table public.projects
  add column if not exists currency text;

alter table public.projects
  add column if not exists start_date date;

alter table public.projects
  add column if not exists end_date date;

alter table public.projects
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

alter table public.construction_workspace_snapshots
  add column if not exists payload jsonb not null default '{}'::jsonb;

alter table public.construction_workspace_snapshots
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

alter table public.boq_library_items
  add column if not exists author_id uuid;

alter table public.boq_library_items
  add column if not exists author_name text;

alter table public.boq_library_items
  add column if not exists tags text[] not null default '{}';

alter table public.boq_library_items
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

alter table public.drawing_projects
  add column if not exists linked_project_id text;

alter table public.drawing_projects
  add column if not exists linked_project_name text;

create index if not exists projects_owner_idx
on public.projects (owner_id);

create index if not exists projects_organization_idx
on public.projects (organization_id);

create index if not exists projects_program_idx
on public.projects (program_id);

create index if not exists organization_members_user_idx
on public.organization_members (user_id);

create index if not exists organization_subscriptions_org_idx
on public.organization_subscriptions (organization_id);

create index if not exists organization_invites_org_idx
on public.organization_invites (organization_id, status, created_at desc);

create index if not exists organization_invites_email_idx
on public.organization_invites (lower(email));

create index if not exists programs_owner_idx
on public.programs (owner_id);

create index if not exists programs_organization_idx
on public.programs (organization_id);

create index if not exists programs_code_idx
on public.programs (organization_id, code);

create index if not exists project_categories_owner_idx
on public.project_categories (owner_id);

create index if not exists project_categories_organization_idx
on public.project_categories (organization_id);

create index if not exists project_categories_code_idx
on public.project_categories (organization_id, code);

create index if not exists projects_category_idx
on public.projects (category_id);

create index if not exists project_members_project_idx
on public.project_members (project_id);

create index if not exists project_members_user_idx
on public.project_members (user_id);

create index if not exists audit_logs_project_idx
on public.audit_logs (project_id, created_at desc);

create index if not exists audit_logs_actor_idx
on public.audit_logs (actor_id, created_at desc);

create index if not exists project_presence_last_seen_idx
on public.project_presence (project_id, last_seen_at desc);

create index if not exists boq_library_items_category_idx
on public.boq_library_items (category);

create index if not exists boq_library_items_subcategory_idx
on public.boq_library_items (category, subcategory);

create index if not exists project_boq_documents_project_idx
on public.project_boq_documents (project_id, updated_at desc);

create index if not exists project_work_plans_project_idx
on public.project_work_plans (project_id, updated_at desc);

create index if not exists project_simple_item_sets_project_idx
on public.project_simple_item_sets (project_id, updated_at desc);

create index if not exists project_payment_certificates_project_idx
on public.project_payment_certificates (project_id, updated_at desc);

create index if not exists project_progress_reports_project_idx
on public.project_progress_reports (project_id, updated_at desc);

create index if not exists project_generated_documents_project_idx
on public.project_generated_documents (project_id, updated_at desc);

create index if not exists project_correspondence_records_project_idx
on public.project_correspondence_records (project_id, updated_at desc);

create index if not exists workspace_attendee_groups_owner_idx
on public.workspace_attendee_groups (owner_id, updated_at desc);

create index if not exists workspace_meeting_minutes_owner_idx
on public.workspace_meeting_minutes (owner_id, updated_at desc);

create index if not exists workspace_action_points_owner_idx
on public.workspace_action_points (owner_id, updated_at desc);

create index if not exists drawing_projects_linked_project_idx
on public.drawing_projects (linked_project_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

drop trigger if exists organizations_set_updated_at on public.organizations;
create trigger organizations_set_updated_at
before update on public.organizations
for each row
execute function public.set_updated_at();

drop trigger if exists organization_members_set_updated_at on public.organization_members;
create trigger organization_members_set_updated_at
before update on public.organization_members
for each row
execute function public.set_updated_at();

drop trigger if exists billing_plans_set_updated_at on public.billing_plans;
create trigger billing_plans_set_updated_at
before update on public.billing_plans
for each row
execute function public.set_updated_at();

drop trigger if exists organization_subscriptions_set_updated_at on public.organization_subscriptions;
create trigger organization_subscriptions_set_updated_at
before update on public.organization_subscriptions
for each row
execute function public.set_updated_at();

drop trigger if exists organization_invites_set_updated_at on public.organization_invites;
create trigger organization_invites_set_updated_at
before update on public.organization_invites
for each row
execute function public.set_updated_at();

drop trigger if exists project_members_set_updated_at on public.project_members;
create trigger project_members_set_updated_at
before update on public.project_members
for each row
execute function public.set_updated_at();

drop trigger if exists programs_set_updated_at on public.programs;
create trigger programs_set_updated_at
before update on public.programs
for each row
execute function public.set_updated_at();

drop trigger if exists project_categories_set_updated_at on public.project_categories;
create trigger project_categories_set_updated_at
before update on public.project_categories
for each row
execute function public.set_updated_at();

drop trigger if exists construction_projects_set_updated_at on public.projects;
drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
before update on public.projects
for each row
execute function public.set_updated_at();

drop trigger if exists construction_workspace_snapshots_set_updated_at on public.construction_workspace_snapshots;
create trigger construction_workspace_snapshots_set_updated_at
before update on public.construction_workspace_snapshots
for each row
execute function public.set_updated_at();

drop trigger if exists project_presence_set_updated_at on public.project_presence;
create trigger project_presence_set_updated_at
before update on public.project_presence
for each row
execute function public.set_updated_at();

drop trigger if exists projects_set_updated_at on public.drawing_projects;
drop trigger if exists drawing_projects_set_updated_at on public.drawing_projects;
create trigger drawing_projects_set_updated_at
before update on public.drawing_projects
for each row
execute function public.set_updated_at();

drop trigger if exists boq_library_items_set_updated_at on public.boq_library_items;
create trigger boq_library_items_set_updated_at
before update on public.boq_library_items
for each row
execute function public.set_updated_at();

drop trigger if exists project_boq_documents_set_updated_at on public.project_boq_documents;
create trigger project_boq_documents_set_updated_at
before update on public.project_boq_documents
for each row
execute function public.set_updated_at();

drop trigger if exists project_work_plans_set_updated_at on public.project_work_plans;
create trigger project_work_plans_set_updated_at
before update on public.project_work_plans
for each row
execute function public.set_updated_at();

drop trigger if exists project_simple_item_sets_set_updated_at on public.project_simple_item_sets;
create trigger project_simple_item_sets_set_updated_at
before update on public.project_simple_item_sets
for each row
execute function public.set_updated_at();

drop trigger if exists project_payment_certificates_set_updated_at on public.project_payment_certificates;
create trigger project_payment_certificates_set_updated_at
before update on public.project_payment_certificates
for each row
execute function public.set_updated_at();

drop trigger if exists project_progress_reports_set_updated_at on public.project_progress_reports;
create trigger project_progress_reports_set_updated_at
before update on public.project_progress_reports
for each row
execute function public.set_updated_at();

drop trigger if exists project_generated_documents_set_updated_at on public.project_generated_documents;
create trigger project_generated_documents_set_updated_at
before update on public.project_generated_documents
for each row
execute function public.set_updated_at();

drop trigger if exists project_correspondence_records_set_updated_at on public.project_correspondence_records;
create trigger project_correspondence_records_set_updated_at
before update on public.project_correspondence_records
for each row
execute function public.set_updated_at();

drop trigger if exists workspace_attendee_groups_set_updated_at on public.workspace_attendee_groups;
create trigger workspace_attendee_groups_set_updated_at
before update on public.workspace_attendee_groups
for each row
execute function public.set_updated_at();

drop trigger if exists workspace_meeting_minutes_set_updated_at on public.workspace_meeting_minutes;
create trigger workspace_meeting_minutes_set_updated_at
before update on public.workspace_meeting_minutes
for each row
execute function public.set_updated_at();

drop trigger if exists workspace_action_points_set_updated_at on public.workspace_action_points;
create trigger workspace_action_points_set_updated_at
before update on public.workspace_action_points
for each row
execute function public.set_updated_at();

drop trigger if exists library_items_set_updated_at on public.drawing_library_items;
drop trigger if exists drawing_library_items_set_updated_at on public.drawing_library_items;
create trigger drawing_library_items_set_updated_at
before update on public.drawing_library_items
for each row
execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  personal_org_id uuid;
begin
  insert into public.profiles (id, email, full_name, company, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, 'engineer'), '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'company', ''),
    'engineer'
  )
  on conflict (id) do nothing;

  select id
  into personal_org_id
  from public.organizations
  where owner_id = new.id
    and personal = true
  limit 1;

  if personal_org_id is null then
    insert into public.organizations (name, slug, owner_id, personal)
    values (
      coalesce(new.raw_user_meta_data ->> 'company', split_part(coalesce(new.email, 'workspace'), '@', 1) || ' Workspace'),
      'org-' || replace(new.id::text, '-', ''),
      new.id,
      true
    )
    returning id into personal_org_id;
  end if;

  insert into public.organization_members (organization_id, user_id, role, status)
  values (personal_org_id, new.id, 'owner', 'active')
  on conflict (organization_id, user_id) do update
  set role = excluded.role,
      status = excluded.status,
      updated_at = timezone('utc', now());

  insert into public.organization_subscriptions (
    organization_id,
    plan_code,
    audience,
    billing_interval,
    status,
    seat_count,
    included_seats,
    base_price_cents,
    per_seat_price_cents,
    current_period_start,
    current_period_end,
    trial_ends_at
  )
  select
    personal_org_id,
    p.code,
    p.audience,
    p.billing_interval,
    -- New signups start as 'incomplete' (awaiting manual admin approval) rather
    -- than auto-granting a trial. A platform admin activates access via
    -- admin_set_organization_subscription. Users invited into an already-active
    -- organization still get access through that organization's subscription.
    'incomplete',
    greatest(1, p.included_seats),
    p.included_seats,
    p.base_price_cents,
    p.per_seat_price_cents,
    null,
    null,
    null
  from public.billing_plans p
  where p.code = 'individual-monthly'
    and not exists (
      select 1
      from public.organization_subscriptions os
      where os.organization_id = personal_org_id
    );

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute procedure public.handle_new_user();

insert into public.organizations (name, slug, owner_id, personal)
select
  coalesce(nullif(p.company, ''), split_part(p.email, '@', 1) || ' Workspace'),
  'org-' || replace(p.id::text, '-', ''),
  p.id,
  true
from public.profiles p
where not exists (
  select 1
  from public.organizations o
  where o.owner_id = p.id
    and o.personal = true
)
on conflict (slug) do nothing;

insert into public.organization_members (organization_id, user_id, role, status)
select o.id, p.id, 'owner', 'active'
from public.profiles p
join public.organizations o
  on o.owner_id = p.id
 and o.personal = true
where not exists (
  select 1
  from public.organization_members om
  where om.organization_id = o.id
    and om.user_id = p.id
)
on conflict (organization_id, user_id) do nothing;

insert into public.billing_plans (
  code,
  name,
  audience,
  billing_interval,
  base_price_cents,
  per_seat_price_cents,
  included_seats,
  trial_days,
  description,
  features
)
values
  (
    'individual-monthly',
    'Individual Monthly',
    'individual',
    'monthly',
    2900,
    0,
    1,
    30,
    'Single engineer workspace billed monthly.',
    array['1 seat', 'Project controls', '2D drawings', 'PDF export']
  ),
  (
    'individual-yearly',
    'Individual Yearly',
    'individual',
    'yearly',
    29000,
    0,
    1,
    30,
    'Single engineer workspace billed yearly with lower annual cost.',
    array['1 seat', 'Project controls', '2D drawings', 'Priority annual billing']
  ),
  (
    'organization-monthly',
    'Organization Monthly',
    'organization',
    'monthly',
    9900,
    1800,
    5,
    30,
    'Team workspace billed monthly with included seats and optional extras.',
    array['5 included seats', 'Seat invites', 'Shared library', 'Collaboration presence']
  ),
  (
    'organization-yearly',
    'Organization Yearly',
    'organization',
    'yearly',
    99000,
    18000,
    5,
    30,
    'Team workspace billed yearly with included seats and lower annual cost.',
    array['5 included seats', 'Seat invites', 'Shared library', 'Priority annual billing']
  )
on conflict (code) do update
set name = excluded.name,
    audience = excluded.audience,
    billing_interval = excluded.billing_interval,
    base_price_cents = excluded.base_price_cents,
    per_seat_price_cents = excluded.per_seat_price_cents,
    included_seats = excluded.included_seats,
    trial_days = excluded.trial_days,
    description = excluded.description,
    features = excluded.features,
    active = true,
    updated_at = timezone('utc', now());

insert into public.organization_subscriptions (
  organization_id,
  plan_code,
  audience,
  billing_interval,
  status,
  seat_count,
  included_seats,
  base_price_cents,
  per_seat_price_cents,
  current_period_start,
  current_period_end,
  trial_ends_at
)
select
  o.id,
  case when o.personal then 'individual-monthly' else 'organization-monthly' end,
  case when o.personal then 'individual' else 'organization' end,
  'monthly',
  'trialing',
  case
    when o.personal then 1
    else greatest(
      5,
      (
        select count(*)
        from public.organization_members om
        where om.organization_id = o.id
          and om.status = 'active'
      )
    )
  end,
  p.included_seats,
  p.base_price_cents,
  p.per_seat_price_cents,
  timezone('utc', now()),
  timezone('utc', now()) + interval '30 days',
  timezone('utc', now()) + make_interval(days => p.trial_days)
from public.organizations o
join public.billing_plans p
  on p.code = case when o.personal then 'individual-monthly' else 'organization-monthly' end
where not exists (
  select 1
  from public.organization_subscriptions os
  where os.organization_id = o.id
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
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
    select 1
    from public.organization_members
    where organization_id = org_uuid
      and user_id = auth.uid()
      and status = 'active'
  );
$$;

create or replace function public.can_access_project(project_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = project_uuid
      and (
        public.is_admin()
        or p.owner_id = auth.uid()
        or (
          p.organization_id is not null
          and public.is_organization_member(p.organization_id)
        )
        or exists (
          select 1
          from public.project_members pm
          where pm.project_id = p.id
            and pm.user_id = auth.uid()
        )
      )
  );
$$;

create or replace function public.can_edit_project(project_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = project_uuid
      and (
        public.is_admin()
        or p.owner_id = auth.uid()
        or exists (
          select 1
          from public.organization_members om
          where om.organization_id = p.organization_id
            and om.user_id = auth.uid()
            and om.status = 'active'
            and om.role in ('owner', 'admin', 'manager')
        )
        or exists (
          select 1
          from public.project_members pm
          where pm.project_id = p.id
            and pm.user_id = auth.uid()
            and pm.role in ('owner', 'admin', 'editor')
        )
      )
  );
$$;

create or replace function public.can_admin_project(project_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = project_uuid
      and (
        public.is_admin()
        or p.owner_id = auth.uid()
        or exists (
          select 1
          from public.organization_members om
          where om.organization_id = p.organization_id
            and om.user_id = auth.uid()
            and om.status = 'active'
            and om.role in ('owner', 'admin')
        )
        or exists (
          select 1
          from public.project_members pm
          where pm.project_id = p.id
            and pm.user_id = auth.uid()
            and pm.role in ('owner', 'admin')
        )
      )
  );
$$;

create or replace function public.prepare_project_record()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.owner_id is null then
    new.owner_id := auth.uid();
  end if;

  if new.organization_id is null then
    select organization_id
    into new.organization_id
    from public.organization_members
    where user_id = new.owner_id
      and status = 'active'
    order by case role
      when 'owner' then 0
      when 'admin' then 1
      when 'manager' then 2
      when 'member' then 3
      else 4
    end
    limit 1;
  end if;

  return new;
end;
$$;

create or replace function public.prepare_program_record()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.owner_id is null then
    new.owner_id := auth.uid();
  end if;

  if new.organization_id is null then
    select organization_id
    into new.organization_id
    from public.organization_members
    where user_id = new.owner_id
      and status = 'active'
    order by case role
      when 'owner' then 0
      when 'admin' then 1
      when 'manager' then 2
      when 'member' then 3
      else 4
    end
    limit 1;
  end if;

  if new.currency is null or length(trim(new.currency)) = 0 then
    new.currency := 'USD';
  end if;

  if new.status is null or length(trim(new.status)) = 0 then
    new.status := 'active';
  end if;

  return new;
end;
$$;

create or replace function public.finalize_project_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.project_members (project_id, organization_id, user_id, role)
  values (new.id, new.organization_id, new.owner_id, 'owner')
  on conflict (project_id, user_id) do update
  set role = excluded.role,
      organization_id = excluded.organization_id,
      updated_at = timezone('utc', now());

  return new;
end;
$$;

create or replace function public.can_manage_organization(org_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_admin()
    or exists (
      select 1
      from public.organization_members
      where organization_id = org_uuid
        and user_id = auth.uid()
        and status = 'active'
        and role in ('owner', 'admin')
    );
$$;

create or replace function public.can_view_profile(profile_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    profile_uuid = auth.uid()
    or public.is_admin()
    or exists (
      select 1
      from public.organization_members me
      join public.organization_members them
        on them.organization_id = me.organization_id
      where me.user_id = auth.uid()
        and them.user_id = profile_uuid
        and me.status = 'active'
        and them.status = 'active'
    )
    or exists (
      select 1
      from public.project_members me
      join public.project_members them
        on them.project_id = me.project_id
      where me.user_id = auth.uid()
        and them.user_id = profile_uuid
    );
$$;

create or replace function public.create_organization_workspace(org_name text)
returns public.organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  created_org public.organizations;
  plan_record public.billing_plans;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if coalesce(trim(org_name), '') = '' then
    raise exception 'Organization name is required.';
  end if;

  insert into public.organizations (name, owner_id, personal)
  values (trim(org_name), auth.uid(), false)
  returning * into created_org;

  insert into public.organization_members (organization_id, user_id, role, status)
  values (created_org.id, auth.uid(), 'owner', 'active')
  on conflict (organization_id, user_id) do update
  set role = 'owner',
      status = 'active',
      updated_at = timezone('utc', now());

  select *
  into plan_record
  from public.billing_plans
  where code = 'organization-monthly'
  limit 1;

  if plan_record.id is not null then
    insert into public.organization_subscriptions (
      organization_id,
      plan_code,
      audience,
      billing_interval,
      status,
      seat_count,
      included_seats,
      base_price_cents,
      per_seat_price_cents,
      current_period_start,
      current_period_end,
      trial_ends_at
    )
    values (
      created_org.id,
      plan_record.code,
      plan_record.audience,
      plan_record.billing_interval,
      -- New organizations start as 'incomplete' (awaiting manual admin approval).
      -- A platform admin grants access via admin_set_organization_subscription,
      -- which sets seats, status, and the access period.
      'incomplete',
      greatest(plan_record.included_seats, 5),
      plan_record.included_seats,
      plan_record.base_price_cents,
      plan_record.per_seat_price_cents,
      null,
      null,
      null
    )
    on conflict (organization_id) do nothing;
  end if;

  return created_org;
end;
$$;

create or replace function public.configure_organization_subscription(
  org_uuid uuid,
  plan_code_param text,
  seat_count_param integer default null
)
returns public.organization_subscriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  plan_record public.billing_plans;
  requested_seats integer;
  active_members integer;
  pending_invites integer;
  occupied_seats integer;
  updated_subscription public.organization_subscriptions;
begin
  if not public.can_manage_organization(org_uuid) then
    raise exception 'You do not have permission to manage billing for this organization.';
  end if;

  select *
  into plan_record
  from public.billing_plans
  where code = plan_code_param
    and active = true
  limit 1;

  if plan_record.id is null then
    raise exception 'Billing plan not found.';
  end if;

  select count(*)
  into active_members
  from public.organization_members
  where organization_id = org_uuid
    and status = 'active';

  select count(*)
  into pending_invites
  from public.organization_invites
  where organization_id = org_uuid
    and status = 'pending'
    and seat_reserved = true;

  occupied_seats := active_members + pending_invites;
  requested_seats := greatest(
    coalesce(seat_count_param, occupied_seats, 1),
    occupied_seats,
    plan_record.included_seats
  );

  insert into public.organization_subscriptions (
    organization_id,
    plan_code,
    audience,
    billing_interval,
    status,
    seat_count,
    included_seats,
    base_price_cents,
    per_seat_price_cents,
    current_period_start,
    current_period_end,
    trial_ends_at
  )
  values (
    org_uuid,
    plan_record.code,
    plan_record.audience,
    plan_record.billing_interval,
    'trialing',
    requested_seats,
    plan_record.included_seats,
    plan_record.base_price_cents,
    plan_record.per_seat_price_cents,
    timezone('utc', now()),
    case
      when plan_record.billing_interval = 'yearly' then timezone('utc', now()) + interval '1 year'
      else timezone('utc', now()) + interval '1 month'
    end,
    timezone('utc', now()) + make_interval(days => plan_record.trial_days)
  )
  on conflict (organization_id) do update
  set plan_code = excluded.plan_code,
      audience = excluded.audience,
      billing_interval = excluded.billing_interval,
      seat_count = excluded.seat_count,
      included_seats = excluded.included_seats,
      base_price_cents = excluded.base_price_cents,
      per_seat_price_cents = excluded.per_seat_price_cents,
      current_period_start = timezone('utc', now()),
      current_period_end = excluded.current_period_end,
      trial_ends_at = case
        when public.organization_subscriptions.status in ('active', 'trialing') then public.organization_subscriptions.trial_ends_at
        else excluded.trial_ends_at
      end,
      updated_at = timezone('utc', now())
  returning * into updated_subscription;

  return updated_subscription;
end;
$$;

create or replace function public.expire_overdue_organization_subscriptions()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  expired_count integer := 0;
begin
  update public.organization_subscriptions
  set status = 'past_due',
      updated_at = timezone('utc', now())
  where status in ('trialing', 'active')
    and (
      case
        when status = 'trialing' then coalesce(trial_ends_at, current_period_end)
        else coalesce(current_period_end, trial_ends_at)
      end
    ) is not null
    and (
      case
        when status = 'trialing' then coalesce(trial_ends_at, current_period_end)
        else coalesce(current_period_end, trial_ends_at)
      end
    ) < timezone('utc', now());

  get diagnostics expired_count = row_count;
  return expired_count;
end;
$$;

create or replace function public.create_organization_invite(
  org_uuid uuid,
  invite_email text,
  invite_role text default 'member',
  invite_name text default null,
  delivery_method_param text default 'manual'
)
returns public.organization_invites
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text;
  seat_capacity integer;
  active_members integer;
  pending_invites integer;
  subscription_record public.organization_subscriptions;
  existing_invite public.organization_invites;
  created_invite public.organization_invites;
begin
  if not public.can_manage_organization(org_uuid) then
    raise exception 'You do not have permission to invite users to this organization.';
  end if;

  perform public.expire_overdue_organization_subscriptions();

  normalized_email := lower(trim(coalesce(invite_email, '')));
  if normalized_email = '' then
    raise exception 'Invite email is required.';
  end if;

  if invite_role not in ('admin', 'manager', 'member', 'viewer') then
    raise exception 'Unsupported invite role.';
  end if;

  if delivery_method_param not in ('manual', 'email') then
    raise exception 'Unsupported delivery method.';
  end if;

  select *
  into existing_invite
  from public.organization_invites
  where organization_id = org_uuid
    and lower(email) = normalized_email
    and status = 'pending'
  limit 1;

  if existing_invite.id is not null then
    update public.organization_invites
    set role = invite_role,
        full_name = nullif(trim(coalesce(invite_name, '')), ''),
        delivery_method = delivery_method_param,
        invited_by = auth.uid(),
        updated_at = timezone('utc', now())
    where id = existing_invite.id
    returning * into created_invite;

    return created_invite;
  end if;

  select *
  into subscription_record
  from public.organization_subscriptions
  where organization_id = org_uuid
    and status in ('trialing', 'active')
    and (
      (
        case
          when status = 'trialing' then coalesce(trial_ends_at, current_period_end)
          else coalesce(current_period_end, trial_ends_at)
        end
      ) is null
      or (
        case
          when status = 'trialing' then coalesce(trial_ends_at, current_period_end)
          else coalesce(current_period_end, trial_ends_at)
        end
      ) >= timezone('utc', now())
    )
  limit 1;

  if subscription_record.id is null then
    raise exception 'This organization subscription is expired or inactive. Activate access before inviting users.';
  end if;

  seat_capacity := coalesce(subscription_record.seat_count, 1);

  select count(*)
  into active_members
  from public.organization_members
  where organization_id = org_uuid
    and status = 'active';

  select count(*)
  into pending_invites
  from public.organization_invites
  where organization_id = org_uuid
    and status = 'pending'
    and seat_reserved = true;

  if active_members + pending_invites >= seat_capacity then
    raise exception 'All purchased seats are already assigned or reserved. Increase seats before inviting more users.';
  end if;

  insert into public.organization_invites (
    organization_id,
    email,
    full_name,
    role,
    delivery_method,
    invited_by,
    invite_token,
    expires_at
  )
  values (
    org_uuid,
    normalized_email,
    nullif(trim(coalesce(invite_name, '')), ''),
    invite_role,
    delivery_method_param,
    auth.uid(),
    encode(gen_random_bytes(24), 'hex'),
    timezone('utc', now()) + interval '14 days'
  )
  returning * into created_invite;

  return created_invite;
end;
$$;

create or replace function public.accept_organization_invites(invite_token_param text default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  current_email text;
  accepted_count integer := 0;
  active_members integer;
  invite_record public.organization_invites;
  subscription_record public.organization_subscriptions;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  perform public.expire_overdue_organization_subscriptions();

  select lower(email)
  into current_email
  from public.profiles
  where id = auth.uid();

  if current_email is null then
    raise exception 'Could not resolve your account email.';
  end if;

  for invite_record in
    select *
    from public.organization_invites
    where status = 'pending'
      and lower(email) = current_email
      and (
        invite_token_param is null
        or invite_token = invite_token_param
      )
      and (expires_at is null or expires_at > timezone('utc', now()))
  loop
    select *
    into subscription_record
    from public.organization_subscriptions
    where organization_id = invite_record.organization_id
      and status in ('trialing', 'active')
      and (
        (
          case
            when status = 'trialing' then coalesce(trial_ends_at, current_period_end)
            else coalesce(current_period_end, trial_ends_at)
          end
        ) is null
        or (
          case
            when status = 'trialing' then coalesce(trial_ends_at, current_period_end)
            else coalesce(current_period_end, trial_ends_at)
          end
        ) >= timezone('utc', now())
      )
    limit 1;

    if subscription_record.id is null then
      if invite_token_param is not null then
        raise exception 'This organization subscription has expired. Ask the organization admin to renew access.';
      end if;
      continue;
    end if;

    select count(*)
    into active_members
    from public.organization_members
    where organization_id = invite_record.organization_id
      and status = 'active';

    if active_members >= coalesce(subscription_record.seat_count, 1)
      and not exists (
        select 1
        from public.organization_members
        where organization_id = invite_record.organization_id
          and user_id = auth.uid()
          and status = 'active'
      )
    then
      raise exception 'This organization has no available seats. Ask an organization admin to increase seats.';
    end if;

    insert into public.organization_members (organization_id, user_id, role, status)
    values (invite_record.organization_id, auth.uid(), invite_record.role, 'active')
    on conflict (organization_id, user_id) do update
    set role = excluded.role,
        status = 'active',
        updated_at = timezone('utc', now());

    update public.organization_invites
    set status = 'accepted',
        accepted_by = auth.uid(),
        accepted_at = timezone('utc', now()),
        updated_at = timezone('utc', now())
    where id = invite_record.id;

    accepted_count := accepted_count + 1;
  end loop;

  if invite_token_param is not null and accepted_count = 0 then
    raise exception 'This invite is invalid, expired, or does not match your email address.';
  end if;

  return accepted_count;
end;
$$;

create or replace function public.admin_set_organization_subscription(
  org_uuid uuid,
  new_status text,
  seat_count_param integer default null,
  plan_code_param text default null,
  expires_at_param timestamptz default null,
  duration_days_param integer default null
)
returns public.organization_subscriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  current_subscription public.organization_subscriptions;
  plan_record public.billing_plans;
  effective_plan_code text;
  next_seat_count integer;
  active_members integer;
  pending_invites integer;
  occupied_seats integer;
  manual_expires_at timestamptz;
begin
  if not public.is_admin() then
    raise exception 'Only platform admins can manually update subscription status.';
  end if;

  if new_status not in ('trialing', 'active', 'past_due', 'canceled', 'incomplete') then
    raise exception 'Unsupported subscription status.';
  end if;

  select *
  into current_subscription
  from public.organization_subscriptions
  where organization_id = org_uuid
  limit 1;

  effective_plan_code := coalesce(
    nullif(plan_code_param, ''),
    current_subscription.plan_code,
    (
      select case
        when personal then 'individual-monthly'
        else 'organization-monthly'
      end
      from public.organizations
      where id = org_uuid
    )
  );

  select *
  into plan_record
  from public.billing_plans
  where code = effective_plan_code
  limit 1;

  if plan_record.id is null then
    raise exception 'Billing plan not found.';
  end if;

  select count(*)
  into active_members
  from public.organization_members
  where organization_id = org_uuid
    and status = 'active';

  select count(*)
  into pending_invites
  from public.organization_invites
  where organization_id = org_uuid
    and status = 'pending'
    and seat_reserved = true;

  occupied_seats := active_members + pending_invites;
  next_seat_count := greatest(
    coalesce(seat_count_param, current_subscription.seat_count, occupied_seats, plan_record.included_seats),
    occupied_seats,
    plan_record.included_seats
  );

  manual_expires_at := coalesce(
    expires_at_param,
    case
      when duration_days_param is not null then timezone('utc', now()) + make_interval(days => duration_days_param)
      when current_subscription.id is not null
        and current_subscription.status = new_status
        then coalesce(current_subscription.current_period_end, current_subscription.trial_ends_at)
      when plan_record.billing_interval = 'yearly' then timezone('utc', now()) + interval '1 year'
      else timezone('utc', now()) + interval '1 month'
    end
  );

  insert into public.organization_subscriptions (
    organization_id,
    plan_code,
    audience,
    billing_interval,
    status,
    seat_count,
    included_seats,
    base_price_cents,
    per_seat_price_cents,
    provider,
    provider_customer_id,
    provider_subscription_id,
    provider_price_id,
    current_period_start,
    current_period_end,
    trial_ends_at
  )
  values (
    org_uuid,
    plan_record.code,
    plan_record.audience,
    plan_record.billing_interval,
    new_status,
    next_seat_count,
    plan_record.included_seats,
    plan_record.base_price_cents,
    plan_record.per_seat_price_cents,
    null,
    null,
    null,
    null,
    timezone('utc', now()),
    manual_expires_at,
    case
      when new_status = 'trialing' then manual_expires_at
      else current_subscription.trial_ends_at
    end
  )
  on conflict (organization_id) do update
  set plan_code = excluded.plan_code,
      audience = excluded.audience,
      billing_interval = excluded.billing_interval,
      status = new_status,
      seat_count = next_seat_count,
      included_seats = excluded.included_seats,
      base_price_cents = excluded.base_price_cents,
      per_seat_price_cents = excluded.per_seat_price_cents,
      provider = null,
      provider_customer_id = null,
      provider_subscription_id = null,
      provider_price_id = null,
      cancel_at_period_end = false,
      current_period_start = timezone('utc', now()),
      current_period_end = excluded.current_period_end,
      trial_ends_at = case
        when new_status = 'trialing' then manual_expires_at
        else public.organization_subscriptions.trial_ends_at
      end,
      updated_at = timezone('utc', now())
  returning * into current_subscription;

  return current_subscription;
end;
$$;

-- ---------------------------------------------------------------------------
-- Organization member lifecycle: deactivate / reactivate / transfer / remove
-- ---------------------------------------------------------------------------

-- Change a member's status within an organization. Only owner/admin members can
-- call this. Suspending frees the seat immediately (seat capacity counts only
-- active members + pending reserved invites). Activating verifies seat capacity
-- and that the subscription is currently usable.
create or replace function public.set_organization_member_status(
  org_uuid uuid,
  target_user uuid,
  new_status text
)
returns public.organization_members
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role text;
  target_member public.organization_members;
  subscription_record public.organization_subscriptions;
  active_members integer;
  pending_invites integer;
  seat_capacity integer;
  remaining_owners integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if new_status not in ('active', 'suspended') then
    raise exception 'Unsupported member status. Use active or suspended.';
  end if;

  select role
  into caller_role
  from public.organization_members
  where organization_id = org_uuid
    and user_id = auth.uid()
    and status = 'active';

  if caller_role is null or caller_role not in ('owner', 'admin') then
    raise exception 'Only organization owners and admins can change member status.';
  end if;

  select *
  into target_member
  from public.organization_members
  where organization_id = org_uuid
    and user_id = target_user;

  if target_member.id is null then
    raise exception 'That user is not a member of this organization.';
  end if;

  if target_member.status = new_status then
    return target_member;
  end if;

  -- Guard against suspending the last remaining active owner.
  if new_status = 'suspended' and target_member.role = 'owner' then
    select count(*)
    into remaining_owners
    from public.organization_members
    where organization_id = org_uuid
      and role = 'owner'
      and status = 'active'
      and user_id <> target_user;

    if remaining_owners = 0 then
      raise exception 'Cannot suspend the last active owner of the organization.';
    end if;
  end if;

  -- When reactivating, verify the subscription is usable and a seat is free.
  if new_status = 'active' then
    perform public.expire_overdue_organization_subscriptions();

    select *
    into subscription_record
    from public.organization_subscriptions
    where organization_id = org_uuid
      and status in ('trialing', 'active')
      and (
        (status = 'trialing' and (coalesce(trial_ends_at, current_period_end) is null
            or coalesce(trial_ends_at, current_period_end) > timezone('utc', now())))
        or
        (status = 'active' and (current_period_end is null
            or current_period_end > timezone('utc', now())))
      );

    if subscription_record.id is null then
      raise exception 'This organization subscription is expired or inactive. Activate the subscription before reactivating members.';
    end if;

    select count(*)
    into active_members
    from public.organization_members
    where organization_id = org_uuid
      and status = 'active';

    select count(*)
    into pending_invites
    from public.organization_invites
    where organization_id = org_uuid
      and status = 'pending'
      and seat_reserved = true;

    seat_capacity := coalesce(subscription_record.seat_count, 1);
    if active_members + pending_invites >= seat_capacity then
      raise exception 'No available seats. Increase the seat count before reactivating this member.';
    end if;
  end if;

  update public.organization_members
  set status = new_status,
      updated_at = timezone('utc', now())
  where id = target_member.id
  returning * into target_member;

  return target_member;
end;
$$;

-- Reassign ownership of an organization's projects, programs, and project
-- categories from one member to another. Used to retain work history when a
-- user leaves the organization. Only owner/admin members can call this.
create or replace function public.transfer_member_assets(
  org_uuid uuid,
  from_user uuid,
  to_user uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role text;
  recipient_member public.organization_members;
  total_transferred integer := 0;
  moved integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if from_user = to_user then
    raise exception 'Source and destination members must differ.';
  end if;

  select role
  into caller_role
  from public.organization_members
  where organization_id = org_uuid
    and user_id = auth.uid()
    and status = 'active';

  if caller_role is null or caller_role not in ('owner', 'admin') then
    raise exception 'Only organization owners and admins can transfer member assets.';
  end if;

  select *
  into recipient_member
  from public.organization_members
  where organization_id = org_uuid
    and user_id = to_user
    and status = 'active';

  if recipient_member.id is null then
    raise exception 'The destination user must be an active member of this organization.';
  end if;

  update public.projects
  set owner_id = to_user,
      updated_at = timezone('utc', now())
  where organization_id = org_uuid
    and owner_id = from_user;
  get diagnostics moved = row_count;
  total_transferred := total_transferred + coalesce(moved, 0);

  update public.programs
  set owner_id = to_user,
      updated_at = timezone('utc', now())
  where organization_id = org_uuid
    and owner_id = from_user;
  get diagnostics moved = row_count;
  total_transferred := total_transferred + coalesce(moved, 0);

  update public.project_categories
  set owner_id = to_user,
      updated_at = timezone('utc', now())
  where organization_id = org_uuid
    and owner_id = from_user;
  get diagnostics moved = row_count;
  total_transferred := total_transferred + coalesce(moved, 0);

  return total_transferred;
end;
$$;

-- Remove a member from an organization. If transfer_to is provided, first
-- transfers the leaving user's projects/programs/categories to that recipient
-- so the data is retained inside the organization. The auth.users / profiles
-- row is NOT deleted by this function — only the membership.
create or replace function public.remove_organization_member(
  org_uuid uuid,
  target_user uuid,
  transfer_to uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role text;
  target_member public.organization_members;
  remaining_owners integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  select role
  into caller_role
  from public.organization_members
  where organization_id = org_uuid
    and user_id = auth.uid()
    and status = 'active';

  if caller_role is null or caller_role not in ('owner', 'admin') then
    raise exception 'Only organization owners and admins can remove members.';
  end if;

  select *
  into target_member
  from public.organization_members
  where organization_id = org_uuid
    and user_id = target_user;

  if target_member.id is null then
    raise exception 'That user is not a member of this organization.';
  end if;

  if target_member.role = 'owner' then
    select count(*)
    into remaining_owners
    from public.organization_members
    where organization_id = org_uuid
      and role = 'owner'
      and user_id <> target_user;

    if remaining_owners = 0 then
      raise exception 'Cannot remove the last owner of the organization.';
    end if;
  end if;

  if transfer_to is not null then
    perform public.transfer_member_assets(org_uuid, target_user, transfer_to);
  end if;

  delete from public.organization_members where id = target_member.id;
end;
$$;

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

drop trigger if exists prepare_project_record_trigger on public.projects;
create trigger prepare_project_record_trigger
before insert on public.projects
for each row
execute function public.prepare_project_record();

drop trigger if exists prepare_program_record_trigger on public.programs;
create trigger prepare_program_record_trigger
before insert on public.programs
for each row
execute function public.prepare_program_record();

drop trigger if exists finalize_project_membership_trigger on public.projects;
create trigger finalize_project_membership_trigger
after insert on public.projects
for each row
execute function public.finalize_project_membership();

drop trigger if exists projects_audit_trigger on public.projects;
create trigger projects_audit_trigger
after insert or update or delete on public.projects
for each row
execute function public.log_project_audit_event();

drop trigger if exists organizations_audit_trigger on public.organizations;
create trigger organizations_audit_trigger
after insert or update or delete on public.organizations
for each row
execute function public.log_project_audit_event();

drop trigger if exists programs_audit_trigger on public.programs;
create trigger programs_audit_trigger
after insert or update or delete on public.programs
for each row
execute function public.log_project_audit_event();

drop trigger if exists project_categories_audit_trigger on public.project_categories;
create trigger project_categories_audit_trigger
after insert or update or delete on public.project_categories
for each row
execute function public.log_project_audit_event();

drop trigger if exists organization_members_audit_trigger on public.organization_members;
create trigger organization_members_audit_trigger
after insert or update or delete on public.organization_members
for each row
execute function public.log_project_audit_event();

drop trigger if exists organization_subscriptions_audit_trigger on public.organization_subscriptions;
create trigger organization_subscriptions_audit_trigger
after insert or update or delete on public.organization_subscriptions
for each row
execute function public.log_project_audit_event();

drop trigger if exists organization_invites_audit_trigger on public.organization_invites;
create trigger organization_invites_audit_trigger
after insert or update or delete on public.organization_invites
for each row
execute function public.log_project_audit_event();

drop trigger if exists project_members_audit_trigger on public.project_members;
create trigger project_members_audit_trigger
after insert or update or delete on public.project_members
for each row
execute function public.log_project_audit_event();

drop trigger if exists project_boq_documents_audit_trigger on public.project_boq_documents;
create trigger project_boq_documents_audit_trigger
after insert or update or delete on public.project_boq_documents
for each row
execute function public.log_project_audit_event();

drop trigger if exists project_work_plans_audit_trigger on public.project_work_plans;
create trigger project_work_plans_audit_trigger
after insert or update or delete on public.project_work_plans
for each row
execute function public.log_project_audit_event();

drop trigger if exists project_simple_item_sets_audit_trigger on public.project_simple_item_sets;
create trigger project_simple_item_sets_audit_trigger
after insert or update or delete on public.project_simple_item_sets
for each row
execute function public.log_project_audit_event();

drop trigger if exists project_payment_certificates_audit_trigger on public.project_payment_certificates;
create trigger project_payment_certificates_audit_trigger
after insert or update or delete on public.project_payment_certificates
for each row
execute function public.log_project_audit_event();

drop trigger if exists project_progress_reports_audit_trigger on public.project_progress_reports;
create trigger project_progress_reports_audit_trigger
after insert or update or delete on public.project_progress_reports
for each row
execute function public.log_project_audit_event();

drop trigger if exists project_generated_documents_audit_trigger on public.project_generated_documents;
create trigger project_generated_documents_audit_trigger
after insert or update or delete on public.project_generated_documents
for each row
execute function public.log_project_audit_event();

drop trigger if exists project_correspondence_records_audit_trigger on public.project_correspondence_records;
create trigger project_correspondence_records_audit_trigger
after insert or update or delete on public.project_correspondence_records
for each row
execute function public.log_project_audit_event();

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.billing_plans enable row level security;
alter table public.organization_subscriptions enable row level security;
alter table public.organization_invites enable row level security;
alter table public.programs enable row level security;
alter table public.project_categories enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.construction_workspace_snapshots enable row level security;
alter table public.audit_logs enable row level security;
alter table public.project_presence enable row level security;
alter table public.drawing_projects enable row level security;
alter table public.boq_library_items enable row level security;
alter table public.project_boq_documents enable row level security;
alter table public.project_work_plans enable row level security;
alter table public.project_simple_item_sets enable row level security;
alter table public.project_payment_certificates enable row level security;
alter table public.project_progress_reports enable row level security;
alter table public.project_generated_documents enable row level security;
alter table public.project_correspondence_records enable row level security;
alter table public.workspace_attendee_groups enable row level security;
alter table public.workspace_meeting_minutes enable row level security;
alter table public.workspace_action_points enable row level security;
alter table public.drawing_library_items enable row level security;

drop policy if exists "profiles_select_self" on public.profiles;
create policy "profiles_select_self"
on public.profiles
for select
to authenticated
using (public.can_view_profile(id));

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self"
on public.profiles
for update
to authenticated
using (id = auth.uid() or public.is_admin())
with check (id = auth.uid() or public.is_admin());

drop policy if exists "organizations_member_select" on public.organizations;
create policy "organizations_member_select"
on public.organizations
for select
to authenticated
using (public.is_organization_member(id) or public.is_admin());

drop policy if exists "organizations_owner_insert" on public.organizations;
create policy "organizations_owner_insert"
on public.organizations
for insert
to authenticated
with check (owner_id = auth.uid() or public.is_admin());

drop policy if exists "organizations_manager_update" on public.organizations;
create policy "organizations_manager_update"
on public.organizations
for update
to authenticated
using (public.can_manage_organization(id) or owner_id = auth.uid())
with check (public.can_manage_organization(id) or owner_id = auth.uid());

drop policy if exists "organization_members_member_select" on public.organization_members;
create policy "organization_members_member_select"
on public.organization_members
for select
to authenticated
using (public.is_organization_member(organization_id) or public.is_admin());

drop policy if exists "billing_plans_authenticated_select" on public.billing_plans;
create policy "billing_plans_authenticated_select"
on public.billing_plans
for select
to authenticated
using (active = true or public.is_admin());

drop policy if exists "organization_subscriptions_member_select" on public.organization_subscriptions;
create policy "organization_subscriptions_member_select"
on public.organization_subscriptions
for select
to authenticated
using (public.is_organization_member(organization_id) or public.is_admin());

drop policy if exists "organization_invites_manager_select" on public.organization_invites;
create policy "organization_invites_manager_select"
on public.organization_invites
for select
to authenticated
using (public.can_manage_organization(organization_id) or public.is_admin());

drop policy if exists "organization_invites_manager_delete" on public.organization_invites;
create policy "organization_invites_manager_delete"
on public.organization_invites
for delete
to authenticated
using (public.can_manage_organization(organization_id) or public.is_admin());

drop policy if exists "organization_members_manager_insert" on public.organization_members;
create policy "organization_members_manager_insert"
on public.organization_members
for insert
to authenticated
with check (
  public.can_manage_organization(organization_id)
  or public.is_admin()
);

drop policy if exists "organization_members_manager_update" on public.organization_members;
create policy "organization_members_manager_update"
on public.organization_members
for update
to authenticated
using (public.can_manage_organization(organization_id) or public.is_admin())
with check (public.can_manage_organization(organization_id) or public.is_admin());

drop policy if exists "organization_members_manager_delete" on public.organization_members;
create policy "organization_members_manager_delete"
on public.organization_members
for delete
to authenticated
using (public.can_manage_organization(organization_id) or public.is_admin());

drop policy if exists "programs_member_select" on public.programs;
create policy "programs_member_select"
on public.programs
for select
to authenticated
using (
  owner_id = auth.uid()
  or public.is_admin()
  or (
    organization_id is not null
    and public.is_organization_member(organization_id)
  )
);

drop policy if exists "programs_member_insert" on public.programs;
create policy "programs_member_insert"
on public.programs
for insert
to authenticated
with check (
  (
    organization_id is null
    and coalesce(owner_id, auth.uid()) = auth.uid()
  )
  or (
    organization_id is not null
    and public.can_manage_organization(organization_id)
  )
  or public.is_admin()
);

drop policy if exists "programs_member_update" on public.programs;
create policy "programs_member_update"
on public.programs
for update
to authenticated
using (
  public.is_admin()
  or (
    organization_id is null
    and owner_id = auth.uid()
  )
  or (
    organization_id is not null
    and public.can_manage_organization(organization_id)
  )
)
with check (
  public.is_admin()
  or (
    organization_id is null
    and owner_id = auth.uid()
  )
  or (
    organization_id is not null
    and public.can_manage_organization(organization_id)
  )
);

drop policy if exists "programs_member_delete" on public.programs;
create policy "programs_member_delete"
on public.programs
for delete
to authenticated
using (
  public.is_admin()
  or (
    organization_id is null
    and owner_id = auth.uid()
  )
  or (
    organization_id is not null
    and public.can_manage_organization(organization_id)
  )
);

drop policy if exists "project_categories_member_select" on public.project_categories;
create policy "project_categories_member_select"
on public.project_categories
for select
to authenticated
using (
  owner_id = auth.uid()
  or public.is_admin()
  or (
    organization_id is not null
    and public.is_organization_member(organization_id)
  )
);

drop policy if exists "project_categories_member_insert" on public.project_categories;
create policy "project_categories_member_insert"
on public.project_categories
for insert
to authenticated
with check (
  (
    organization_id is null
    and coalesce(owner_id, auth.uid()) = auth.uid()
  )
  or (
    organization_id is not null
    and public.can_manage_organization(organization_id)
  )
  or public.is_admin()
);

drop policy if exists "project_categories_member_update" on public.project_categories;
create policy "project_categories_member_update"
on public.project_categories
for update
to authenticated
using (
  public.is_admin()
  or (
    organization_id is null
    and owner_id = auth.uid()
  )
  or (
    organization_id is not null
    and public.can_manage_organization(organization_id)
  )
)
with check (
  public.is_admin()
  or (
    organization_id is null
    and owner_id = auth.uid()
  )
  or (
    organization_id is not null
    and public.can_manage_organization(organization_id)
  )
);

drop policy if exists "project_categories_member_delete" on public.project_categories;
create policy "project_categories_member_delete"
on public.project_categories
for delete
to authenticated
using (
  public.is_admin()
  or (
    organization_id is null
    and owner_id = auth.uid()
  )
  or (
    organization_id is not null
    and public.can_manage_organization(organization_id)
  )
);

drop policy if exists "Users manage own projects" on public.projects;
drop policy if exists "projects_owner_select" on public.projects;
drop policy if exists "construction_projects_owner_select" on public.projects;
create policy "construction_projects_member_select"
on public.projects
for select
to authenticated
using (public.can_access_project(id));

drop policy if exists "projects_owner_insert" on public.projects;
drop policy if exists "construction_projects_owner_insert" on public.projects;
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

drop policy if exists "projects_owner_update" on public.projects;
drop policy if exists "construction_projects_owner_update" on public.projects;
create policy "construction_projects_member_update"
on public.projects
for update
to authenticated
using (public.can_edit_project(id))
with check (
  public.can_edit_project(id)
  and (
    organization_id is null
    or public.is_organization_member(organization_id)
    or public.is_admin()
  )
);

drop policy if exists "projects_owner_delete" on public.projects;
drop policy if exists "construction_projects_owner_delete" on public.projects;
create policy "construction_projects_member_delete"
on public.projects
for delete
to authenticated
using (public.can_admin_project(id));

drop policy if exists "project_members_member_select" on public.project_members;
create policy "project_members_member_select"
on public.project_members
for select
to authenticated
using (public.can_access_project(project_id));

drop policy if exists "project_members_admin_insert" on public.project_members;
create policy "project_members_admin_insert"
on public.project_members
for insert
to authenticated
with check (
  public.can_admin_project(project_id)
  and (
    organization_id is null
    or public.is_organization_member(organization_id)
    or public.is_admin()
  )
);

drop policy if exists "project_members_admin_update" on public.project_members;
create policy "project_members_admin_update"
on public.project_members
for update
to authenticated
using (public.can_admin_project(project_id))
with check (
  public.can_admin_project(project_id)
  and (
    organization_id is null
    or public.is_organization_member(organization_id)
    or public.is_admin()
  )
);

drop policy if exists "project_members_admin_delete" on public.project_members;
create policy "project_members_admin_delete"
on public.project_members
for delete
to authenticated
using (public.can_admin_project(project_id));

drop policy if exists "construction_workspace_snapshots_owner_select" on public.construction_workspace_snapshots;
create policy "construction_workspace_snapshots_owner_select"
on public.construction_workspace_snapshots
for select
to authenticated
using (owner_id = auth.uid() or public.is_admin());

drop policy if exists "construction_workspace_snapshots_owner_insert" on public.construction_workspace_snapshots;
create policy "construction_workspace_snapshots_owner_insert"
on public.construction_workspace_snapshots
for insert
to authenticated
with check (owner_id = auth.uid() or public.is_admin());

drop policy if exists "construction_workspace_snapshots_owner_update" on public.construction_workspace_snapshots;
create policy "construction_workspace_snapshots_owner_update"
on public.construction_workspace_snapshots
for update
to authenticated
using (owner_id = auth.uid() or public.is_admin())
with check (owner_id = auth.uid() or public.is_admin());

drop policy if exists "construction_workspace_snapshots_owner_delete" on public.construction_workspace_snapshots;
create policy "construction_workspace_snapshots_owner_delete"
on public.construction_workspace_snapshots
for delete
to authenticated
using (owner_id = auth.uid() or public.is_admin());

drop policy if exists "audit_logs_project_select" on public.audit_logs;
create policy "audit_logs_project_select"
on public.audit_logs
for select
to authenticated
using (
  public.is_admin()
  or (project_id is not null and public.can_access_project(project_id))
  or (
    project_id is null
    and organization_id is not null
    and public.is_organization_member(organization_id)
  )
);

drop policy if exists "project_presence_member_select" on public.project_presence;
create policy "project_presence_member_select"
on public.project_presence
for select
to authenticated
using (public.can_access_project(project_id));

drop policy if exists "project_presence_member_insert" on public.project_presence;
create policy "project_presence_member_insert"
on public.project_presence
for insert
to authenticated
with check (user_id = auth.uid() and public.can_access_project(project_id));

drop policy if exists "project_presence_member_update" on public.project_presence;
create policy "project_presence_member_update"
on public.project_presence
for update
to authenticated
using (user_id = auth.uid() and public.can_access_project(project_id))
with check (user_id = auth.uid() and public.can_access_project(project_id));

drop policy if exists "project_presence_member_delete" on public.project_presence;
create policy "project_presence_member_delete"
on public.project_presence
for delete
to authenticated
using (user_id = auth.uid() or public.can_admin_project(project_id));

drop policy if exists "projects_owner_select" on public.drawing_projects;
drop policy if exists "drawing_projects_owner_select" on public.drawing_projects;
create policy "drawing_projects_owner_select"
on public.drawing_projects
for select
to authenticated
using (owner_id = auth.uid() or public.is_admin());

drop policy if exists "projects_owner_insert" on public.drawing_projects;
drop policy if exists "drawing_projects_owner_insert" on public.drawing_projects;
create policy "drawing_projects_owner_insert"
on public.drawing_projects
for insert
to authenticated
with check (owner_id = auth.uid() or public.is_admin());

drop policy if exists "projects_owner_update" on public.drawing_projects;
drop policy if exists "drawing_projects_owner_update" on public.drawing_projects;
create policy "drawing_projects_owner_update"
on public.drawing_projects
for update
to authenticated
using (owner_id = auth.uid() or public.is_admin())
with check (owner_id = auth.uid() or public.is_admin());

drop policy if exists "projects_owner_delete" on public.drawing_projects;
drop policy if exists "drawing_projects_owner_delete" on public.drawing_projects;
create policy "drawing_projects_owner_delete"
on public.drawing_projects
for delete
to authenticated
using (owner_id = auth.uid() or public.is_admin());

drop policy if exists "library_authenticated_read" on public.drawing_library_items;
drop policy if exists "drawing_library_authenticated_read" on public.drawing_library_items;
create policy "drawing_library_authenticated_read"
on public.drawing_library_items
for select
to authenticated
using (true);

drop policy if exists "boq_library_authenticated_read" on public.boq_library_items;
create policy "boq_library_authenticated_read"
on public.boq_library_items
for select
to authenticated
using (true);

drop policy if exists "boq_library_admin_insert" on public.boq_library_items;
create policy "boq_library_admin_insert"
on public.boq_library_items
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "boq_library_admin_update" on public.boq_library_items;
create policy "boq_library_admin_update"
on public.boq_library_items
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "boq_library_admin_delete" on public.boq_library_items;
create policy "boq_library_admin_delete"
on public.boq_library_items
for delete
to authenticated
using (public.is_admin());

drop policy if exists "project_boq_documents_member_select" on public.project_boq_documents;
create policy "project_boq_documents_member_select"
on public.project_boq_documents
for select
to authenticated
using (public.can_access_project(project_id));

drop policy if exists "project_boq_documents_member_insert" on public.project_boq_documents;
create policy "project_boq_documents_member_insert"
on public.project_boq_documents
for insert
to authenticated
with check (public.can_edit_project(project_id));

drop policy if exists "project_boq_documents_member_update" on public.project_boq_documents;
create policy "project_boq_documents_member_update"
on public.project_boq_documents
for update
to authenticated
using (public.can_edit_project(project_id))
with check (public.can_edit_project(project_id));

drop policy if exists "project_boq_documents_member_delete" on public.project_boq_documents;
create policy "project_boq_documents_member_delete"
on public.project_boq_documents
for delete
to authenticated
using (public.can_edit_project(project_id));

drop policy if exists "project_work_plans_member_select" on public.project_work_plans;
create policy "project_work_plans_member_select"
on public.project_work_plans
for select
to authenticated
using (public.can_access_project(project_id));

drop policy if exists "project_work_plans_member_insert" on public.project_work_plans;
create policy "project_work_plans_member_insert"
on public.project_work_plans
for insert
to authenticated
with check (public.can_edit_project(project_id));

drop policy if exists "project_work_plans_member_update" on public.project_work_plans;
create policy "project_work_plans_member_update"
on public.project_work_plans
for update
to authenticated
using (public.can_edit_project(project_id))
with check (public.can_edit_project(project_id));

drop policy if exists "project_work_plans_member_delete" on public.project_work_plans;
create policy "project_work_plans_member_delete"
on public.project_work_plans
for delete
to authenticated
using (public.can_edit_project(project_id));

drop policy if exists "project_simple_item_sets_member_select" on public.project_simple_item_sets;
create policy "project_simple_item_sets_member_select"
on public.project_simple_item_sets
for select
to authenticated
using (public.can_access_project(project_id));

drop policy if exists "project_simple_item_sets_member_insert" on public.project_simple_item_sets;
create policy "project_simple_item_sets_member_insert"
on public.project_simple_item_sets
for insert
to authenticated
with check (public.can_edit_project(project_id));

drop policy if exists "project_simple_item_sets_member_update" on public.project_simple_item_sets;
create policy "project_simple_item_sets_member_update"
on public.project_simple_item_sets
for update
to authenticated
using (public.can_edit_project(project_id))
with check (public.can_edit_project(project_id));

drop policy if exists "project_simple_item_sets_member_delete" on public.project_simple_item_sets;
create policy "project_simple_item_sets_member_delete"
on public.project_simple_item_sets
for delete
to authenticated
using (public.can_edit_project(project_id));

drop policy if exists "project_payment_certificates_member_select" on public.project_payment_certificates;
create policy "project_payment_certificates_member_select"
on public.project_payment_certificates
for select
to authenticated
using (public.can_access_project(project_id));

drop policy if exists "project_payment_certificates_member_insert" on public.project_payment_certificates;
create policy "project_payment_certificates_member_insert"
on public.project_payment_certificates
for insert
to authenticated
with check (public.can_edit_project(project_id));

drop policy if exists "project_payment_certificates_member_update" on public.project_payment_certificates;
create policy "project_payment_certificates_member_update"
on public.project_payment_certificates
for update
to authenticated
using (public.can_edit_project(project_id))
with check (public.can_edit_project(project_id));

drop policy if exists "project_payment_certificates_member_delete" on public.project_payment_certificates;
create policy "project_payment_certificates_member_delete"
on public.project_payment_certificates
for delete
to authenticated
using (public.can_edit_project(project_id));

drop policy if exists "project_progress_reports_member_select" on public.project_progress_reports;
create policy "project_progress_reports_member_select"
on public.project_progress_reports
for select
to authenticated
using (public.can_access_project(project_id));

drop policy if exists "project_progress_reports_member_insert" on public.project_progress_reports;
create policy "project_progress_reports_member_insert"
on public.project_progress_reports
for insert
to authenticated
with check (public.can_edit_project(project_id));

drop policy if exists "project_progress_reports_member_update" on public.project_progress_reports;
create policy "project_progress_reports_member_update"
on public.project_progress_reports
for update
to authenticated
using (public.can_edit_project(project_id))
with check (public.can_edit_project(project_id));

drop policy if exists "project_progress_reports_member_delete" on public.project_progress_reports;
create policy "project_progress_reports_member_delete"
on public.project_progress_reports
for delete
to authenticated
using (public.can_edit_project(project_id));

drop policy if exists "project_generated_documents_member_select" on public.project_generated_documents;
create policy "project_generated_documents_member_select"
on public.project_generated_documents
for select
to authenticated
using (public.can_access_project(project_id));

drop policy if exists "project_generated_documents_member_insert" on public.project_generated_documents;
create policy "project_generated_documents_member_insert"
on public.project_generated_documents
for insert
to authenticated
with check (public.can_edit_project(project_id));

drop policy if exists "project_generated_documents_member_update" on public.project_generated_documents;
create policy "project_generated_documents_member_update"
on public.project_generated_documents
for update
to authenticated
using (public.can_edit_project(project_id))
with check (public.can_edit_project(project_id));

drop policy if exists "project_generated_documents_member_delete" on public.project_generated_documents;
create policy "project_generated_documents_member_delete"
on public.project_generated_documents
for delete
to authenticated
using (public.can_edit_project(project_id));

drop policy if exists "project_correspondence_records_member_select" on public.project_correspondence_records;
create policy "project_correspondence_records_member_select"
on public.project_correspondence_records
for select
to authenticated
using (public.can_access_project(project_id));

drop policy if exists "project_correspondence_records_member_insert" on public.project_correspondence_records;
create policy "project_correspondence_records_member_insert"
on public.project_correspondence_records
for insert
to authenticated
with check (public.can_edit_project(project_id));

drop policy if exists "project_correspondence_records_member_update" on public.project_correspondence_records;
create policy "project_correspondence_records_member_update"
on public.project_correspondence_records
for update
to authenticated
using (public.can_edit_project(project_id))
with check (public.can_edit_project(project_id));

drop policy if exists "project_correspondence_records_member_delete" on public.project_correspondence_records;
create policy "project_correspondence_records_member_delete"
on public.project_correspondence_records
for delete
to authenticated
using (public.can_edit_project(project_id));

drop policy if exists "workspace_attendee_groups_owner_select" on public.workspace_attendee_groups;
create policy "workspace_attendee_groups_owner_select"
on public.workspace_attendee_groups
for select
to authenticated
using (owner_id = auth.uid() or public.is_admin());

drop policy if exists "workspace_attendee_groups_owner_insert" on public.workspace_attendee_groups;
create policy "workspace_attendee_groups_owner_insert"
on public.workspace_attendee_groups
for insert
to authenticated
with check (owner_id = auth.uid() or public.is_admin());

drop policy if exists "workspace_attendee_groups_owner_update" on public.workspace_attendee_groups;
create policy "workspace_attendee_groups_owner_update"
on public.workspace_attendee_groups
for update
to authenticated
using (owner_id = auth.uid() or public.is_admin())
with check (owner_id = auth.uid() or public.is_admin());

drop policy if exists "workspace_attendee_groups_owner_delete" on public.workspace_attendee_groups;
create policy "workspace_attendee_groups_owner_delete"
on public.workspace_attendee_groups
for delete
to authenticated
using (owner_id = auth.uid() or public.is_admin());

drop policy if exists "workspace_meeting_minutes_owner_select" on public.workspace_meeting_minutes;
create policy "workspace_meeting_minutes_owner_select"
on public.workspace_meeting_minutes
for select
to authenticated
using (owner_id = auth.uid() or public.is_admin());

drop policy if exists "workspace_meeting_minutes_owner_insert" on public.workspace_meeting_minutes;
create policy "workspace_meeting_minutes_owner_insert"
on public.workspace_meeting_minutes
for insert
to authenticated
with check (owner_id = auth.uid() or public.is_admin());

drop policy if exists "workspace_meeting_minutes_owner_update" on public.workspace_meeting_minutes;
create policy "workspace_meeting_minutes_owner_update"
on public.workspace_meeting_minutes
for update
to authenticated
using (owner_id = auth.uid() or public.is_admin())
with check (owner_id = auth.uid() or public.is_admin());

drop policy if exists "workspace_meeting_minutes_owner_delete" on public.workspace_meeting_minutes;
create policy "workspace_meeting_minutes_owner_delete"
on public.workspace_meeting_minutes
for delete
to authenticated
using (owner_id = auth.uid() or public.is_admin());

drop policy if exists "workspace_action_points_owner_select" on public.workspace_action_points;
create policy "workspace_action_points_owner_select"
on public.workspace_action_points
for select
to authenticated
using (owner_id = auth.uid() or public.is_admin());

drop policy if exists "workspace_action_points_owner_insert" on public.workspace_action_points;
create policy "workspace_action_points_owner_insert"
on public.workspace_action_points
for insert
to authenticated
with check (owner_id = auth.uid() or public.is_admin());

drop policy if exists "workspace_action_points_owner_update" on public.workspace_action_points;
create policy "workspace_action_points_owner_update"
on public.workspace_action_points
for update
to authenticated
using (owner_id = auth.uid() or public.is_admin())
with check (owner_id = auth.uid() or public.is_admin());

drop policy if exists "workspace_action_points_owner_delete" on public.workspace_action_points;
create policy "workspace_action_points_owner_delete"
on public.workspace_action_points
for delete
to authenticated
using (owner_id = auth.uid() or public.is_admin());

drop policy if exists "library_admin_insert" on public.drawing_library_items;
drop policy if exists "drawing_library_admin_insert" on public.drawing_library_items;
create policy "drawing_library_admin_insert"
on public.drawing_library_items
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "library_admin_update" on public.drawing_library_items;
drop policy if exists "drawing_library_admin_update" on public.drawing_library_items;
create policy "drawing_library_admin_update"
on public.drawing_library_items
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "library_admin_delete" on public.drawing_library_items;
drop policy if exists "drawing_library_admin_delete" on public.drawing_library_items;
create policy "drawing_library_admin_delete"
on public.drawing_library_items
for delete
to authenticated
using (public.is_admin());

insert into storage.buckets (id, name, public)
values ('drawing-assets', 'drawing-assets', false)
on conflict (id) do nothing;

drop policy if exists "drawing_assets_authenticated_read" on storage.objects;
create policy "drawing_assets_authenticated_read"
on storage.objects
for select
to authenticated
using (bucket_id = 'drawing-assets');

drop policy if exists "drawing_assets_admin_write" on storage.objects;
create policy "drawing_assets_admin_write"
on storage.objects
for all
to authenticated
using (bucket_id = 'drawing-assets' and public.is_admin())
with check (bucket_id = 'drawing-assets' and public.is_admin());

comment on table public.profiles is 'Shared user profile and role record for the construction platform and drawing workspace.';
comment on table public.organizations is 'Shared tenant records for companies, departments, and personal workspaces.';
comment on table public.organization_members is 'Organization membership and role assignments used for tenant-level permissions.';
comment on table public.billing_plans is 'Catalog of subscription plans for individual and organization billing intervals.';
comment on table public.organization_subscriptions is 'Seat-based billing state for each organization, ready for Stripe-backed subscriptions.';
comment on table public.organization_invites is 'Reserved-seat invitations that let organizations onboard employees by email or shareable invite link.';
comment on table public.programs is 'Lightweight portfolio grouping records for donor, municipal, NGO, and corporate programs containing multiple projects.';
comment on table public.projects is 'Shared ProBuild construction or service project records with organization-aware access control.';
comment on table public.project_members is 'Project-specific permission assignments for collaborators working inside a project workspace.';
comment on table public.construction_workspace_snapshots is 'Server-backed ProBuild workspace payloads storing BOQ, payments, reports, documents, correspondence, and meetings for each user.';
comment on table public.audit_logs is 'Immutable activity stream for project and workspace changes generated by collaboration-aware tables.';
comment on table public.project_presence is 'Ephemeral live-collaboration presence records showing who is active inside a project.';
comment on table public.drawing_projects is 'Saved multi-sheet drawing packages owned by a user and optionally linked to a construction project workspace.';
comment on table public.boq_library_items is 'Shared reusable BOQ templates published by admins for all authenticated users.';
comment on table public.project_boq_documents is 'Normalized BOQ document records linked to construction projects for shared editing and reporting.';
comment on table public.project_work_plans is 'Normalized work plan records linked to construction projects for shared scheduling workflows.';
comment on table public.project_simple_item_sets is 'Normalized non-construction item schedules linked to projects.';
comment on table public.project_payment_certificates is 'Normalized payment certificate records linked to projects for shared commercial controls.';
comment on table public.project_progress_reports is 'Normalized progress report records linked to projects for shared monitoring and approvals.';
comment on table public.project_generated_documents is 'Normalized generated document records linked to projects for shared correspondence and reporting.';
comment on table public.project_correspondence_records is 'Normalized correspondence and instruction records linked to projects.';
comment on table public.workspace_attendee_groups is 'Reusable meeting attendee groups owned by a user across the wider workspace.';
comment on table public.workspace_meeting_minutes is 'Meeting minute records owned by a user across the wider workspace.';
comment on table public.workspace_action_points is 'Action points register (source of truth for open items) owned by a user across the wider workspace.';
comment on table public.drawing_library_items is 'Shared drawing library entries published by admins.';

-- Promote your first admin after signup:
-- update public.profiles set role = 'admin' where email = 'your-email@company.com';
