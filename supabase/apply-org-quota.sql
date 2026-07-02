-- Organization-creation quota (anti trial-farming)
-- =================================================
-- Run this in the Supabase SQL editor on the live project.
--
-- Effect: an account can create at most 3 organizations in-app (the personal
-- workspace auto-created at signup does not count). This caps how many free
-- 30-day trials a single account can mint. Legitimate users who need more can
-- be raised manually (adjust the number below, or activate them via
-- admin_set_organization_subscription).
--
-- This only redefines create_organization_workspace; re-running it is safe.

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

  -- Anti-abuse quota: cap in-app organization creation per account. Personal
  -- workspaces (auto-created at signup) do not count. Raise the number here for
  -- a legitimate customer who needs more.
  if (
    select count(*)
    from public.organizations
    where owner_id = auth.uid()
      and personal = false
  ) >= 3 then
    raise exception 'You have reached the maximum number of organizations for your account. Contact support to add more.';
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
