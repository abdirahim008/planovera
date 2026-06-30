-- Automatic 30-day free trial on signup
-- ======================================
-- Run this in the Supabase SQL editor on the live project.
--
-- Effect: every newly registered user/organization starts on a 30-day
-- "trialing" subscription instead of waiting for manual admin approval. When
-- the trial lapses the subscription becomes unusable and a platform admin must
-- activate it (admin_set_organization_subscription) for access to resume.
--
-- This only redefines the two signup functions; the data model and the app's
-- access gating already understand the "trialing" status, so no other change
-- is required. Re-running it is safe.

-- 1) Personal workspace created automatically on user signup --------------------
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
    -- Automatic 30-day free trial.
    'trialing',
    greatest(1, p.included_seats),
    p.included_seats,
    p.base_price_cents,
    p.per_seat_price_cents,
    timezone('utc', now()),
    timezone('utc', now()) + interval '30 days',
    timezone('utc', now()) + interval '30 days'
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

-- 2) Additional organization created from the app ------------------------------
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
      -- Automatic 30-day free trial.
      'trialing',
      greatest(plan_record.included_seats, 5),
      plan_record.included_seats,
      plan_record.base_price_cents,
      plan_record.per_seat_price_cents,
      timezone('utc', now()),
      timezone('utc', now()) + interval '30 days',
      timezone('utc', now()) + interval '30 days'
    )
    on conflict (organization_id) do nothing;
  end if;

  return created_org;
end;
$$;

-- 3) OPTIONAL: give existing not-yet-approved organizations a trial too --------
-- Converts organizations still sitting in 'incomplete' (never activated) onto a
-- fresh 30-day trial starting now. Remove/skip this block if you would rather
-- keep activating those manually.
--
-- update public.organization_subscriptions
-- set status = 'trialing',
--     current_period_start = timezone('utc', now()),
--     current_period_end   = timezone('utc', now()) + interval '30 days',
--     trial_ends_at        = timezone('utc', now()) + interval '30 days',
--     updated_at           = timezone('utc', now())
-- where status = 'incomplete';
