-- Fix: let platform admins allocate any seat count from 1 upward.
--
-- Previously admin_set_organization_subscription clamped the seat count to
-- plan.included_seats (5 for organization plans), so an admin typing fewer
-- than 5 seats was silently bumped back up. The plan's included_seats is a
-- pricing default, not a minimum — the only hard floor is the seats already
-- occupied (active members + reserved invites).
--
-- Run this in the Supabase SQL Editor. Idempotent.

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
  -- Admins allocate seats freely from 1 upward. The only hard floor is the
  -- seats already occupied (active members + reserved invites) — the plan's
  -- included_seats is a pricing default, not a minimum.
  next_seat_count := greatest(
    coalesce(seat_count_param, current_subscription.seat_count, occupied_seats, 1),
    occupied_seats,
    1
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
