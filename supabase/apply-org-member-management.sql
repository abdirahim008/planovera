-- ===========================================================================
-- Planovera — Organization onboarding + member-management functions
-- ---------------------------------------------------------------------------
-- One-off apply script. Paste the whole file into the Supabase SQL Editor and
-- run it once against the Planovera project. Every statement is
-- CREATE OR REPLACE, so re-running is safe and idempotent.
--
-- These five functions are also present in supabase/schema.sql (the source of
-- truth). This file exists only to apply the org-onboarding + member-lifecycle
-- changes to an already-provisioned database without re-running the full schema.
--
--   1. create_organization_workspace        — new orgs start "incomplete" (pending admin approval)
--   2. admin_set_organization_subscription   — platform admin grants/sets access + seats + period
--   3. set_organization_member_status        — owner/admin suspend / reactivate a member (seat-aware)
--   4. transfer_member_assets                — reassign projects/programs/categories between members
--   5. remove_organization_member            — remove a membership (optionally transfer assets first)
-- ===========================================================================

-- 1. New organizations start as 'incomplete' (awaiting manual admin approval).
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

-- 2. Platform admin manually grants/sets an organization's subscription status,
--    seat count, plan, and access period.
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

-- 3. Change a member's status within an organization. Only owner/admin members
--    can call this. Suspending frees the seat immediately; activating verifies
--    seat capacity and that the subscription is currently usable.
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

-- 4. Reassign ownership of an organization's projects, programs, and project
--    categories from one member to another. Only owner/admin members can call this.
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

-- 5. Remove a member from an organization. If transfer_to is provided, first
--    transfers the leaving user's projects/programs/categories to that recipient.
--    The auth.users / profiles row is NOT deleted — only the membership.
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
