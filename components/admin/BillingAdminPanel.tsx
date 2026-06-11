"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Ban,
  Building2,
  CalendarClock,
  CreditCard,
  Hourglass,
  Pencil,
  Play,
  RefreshCcw,
  Users,
} from "lucide-react";

import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase-browser";
import type {
  BillingPlanRecord,
  OrganizationRecord,
  OrganizationSubscriptionRecord,
} from "@/lib/supabase";
import {
  dateInputFromNow,
  formatSubscriptionExpiry,
  getDaysUntilSubscriptionExpiry,
  getSubscriptionAccessState,
  isoFromDateInput,
  subscriptionBadgeColor,
  subscriptionStateLabel,
} from "@/lib/subscriptions";

type InviteCountRecord = {
  organization_id: string;
  status: string;
};

type MemberCountRecord = {
  organization_id: string;
  status: string;
};

type EditableSubscription = {
  organizationId: string;
  organizationName: string;
  planCode: string;
  status: OrganizationSubscriptionRecord["status"];
  seatCount: string;
  originalSeatCount: number;
  occupiedSeats: number;
  startDate: string;
  termPreset: "trial-month" | "month" | "year" | "custom";
  expiryDate: string;
  isPersonal: boolean;
};

const formatMoney = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);

const statusBadge = (status: OrganizationSubscriptionRecord["status"]) => {
  if (status === "active") return "ok";
  if (status === "trialing") return "accent";
  if (status === "past_due") return "warn";
  return "err";
};

const planLabel = (code: string) => code.replace(/-/g, " ");

const termOptions = [
  { value: "trial-month", label: "1 month trial" },
  { value: "month", label: "1 month" },
  { value: "year", label: "1 year" },
  { value: "custom", label: "Custom expiry date" },
] as const;

// Expiry = start date + term. Calendar-aware (Jan 31 + 1 month = Feb 28/29,
// leap years handled by Date), computed in UTC to dodge timezone day-shifts.
const addTermToDateInput = (start: string, term: "trial-month" | "month" | "year") => {
  const date = new Date(`${start}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return start;
  if (term === "year") date.setUTCFullYear(date.getUTCFullYear() + 1);
  else date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString().slice(0, 10);
};

const effectiveExpiryInput = (editor: EditableSubscription) =>
  editor.termPreset === "custom"
    ? editor.expiryDate
    : addTermToDateInput(editor.startDate, editor.termPreset);

const formatDateInput = (value: string) => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      });
};

// Human-friendly remaining time: months + days for longer licenses, days for
// short ones, and a clear overdue/expiry-today state.
const formatRemaining = (daysRemaining: number | null) => {
  if (daysRemaining === null) return "No duration";
  if (daysRemaining < 0) {
    const overdue = Math.abs(daysRemaining);
    return overdue >= 31
      ? `${Math.floor(overdue / 30)} mo overdue`
      : `${overdue} day${overdue === 1 ? "" : "s"} overdue`;
  }
  if (daysRemaining === 0) return "Expires today";
  if (daysRemaining < 45) {
    return `${daysRemaining} day${daysRemaining === 1 ? "" : "s"} left`;
  }
  const months = Math.floor(daysRemaining / 30);
  const days = daysRemaining % 30;
  return days > 0
    ? `${months} mo ${days} d left`
    : `${months} month${months === 1 ? "" : "s"} left`;
};

const subscriptionExpiryInput = (subscription?: OrganizationSubscriptionRecord | null) => {
  const expiry = subscription?.current_period_end || subscription?.trial_ends_at;
  if (!expiry) return dateInputFromNow(30);
  const date = new Date(expiry);
  return Number.isNaN(date.getTime()) ? dateInputFromNow(30) : date.toISOString().slice(0, 10);
};

export default function BillingAdminPanel() {
  const configured = isSupabaseConfigured();
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [organizations, setOrganizations] = useState<OrganizationRecord[]>([]);
  const [plans, setPlans] = useState<BillingPlanRecord[]>([]);
  const [subscriptions, setSubscriptions] = useState<OrganizationSubscriptionRecord[]>([]);
  const [memberRows, setMemberRows] = useState<MemberCountRecord[]>([]);
  const [inviteRows, setInviteRows] = useState<InviteCountRecord[]>([]);
  const [editor, setEditor] = useState<EditableSubscription | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | OrganizationSubscriptionRecord["status"]>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "individual" | "organization">("all");

  const loadData = async () => {
    if (!configured) {
      setLoading(false);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setLoading(false);
      setNotice("Supabase environment variables are missing.");
      return;
    }

    setLoading(true);
    const { error: expiryError } = await supabase.rpc("expire_overdue_organization_subscriptions");
    const [
      { data: orgRows, error: orgError },
      { data: planRows, error: planError },
      { data: subscriptionRows, error: subscriptionError },
      { data: members, error: membersError },
      { data: invites, error: invitesError },
    ] = await Promise.all([
      supabase.from("organizations").select("*").order("created_at", { ascending: false }),
      supabase.from("billing_plans").select("*").order("base_price_cents", { ascending: true }),
      supabase
        .from("organization_subscriptions")
        .select("*")
        .order("updated_at", { ascending: false }),
      supabase.from("organization_members").select("organization_id,status"),
      supabase.from("organization_invites").select("organization_id,status"),
    ]);

    setOrganizations((orgRows ?? []) as OrganizationRecord[]);
    setPlans((planRows ?? []) as BillingPlanRecord[]);
    setSubscriptions((subscriptionRows ?? []) as OrganizationSubscriptionRecord[]);
    setMemberRows((members ?? []) as MemberCountRecord[]);
    setInviteRows((invites ?? []) as InviteCountRecord[]);
    setNotice(
      expiryError?.message ||
        orgError?.message ||
        planError?.message ||
        subscriptionError?.message ||
        membersError?.message ||
        invitesError?.message ||
        null,
    );
    setLoading(false);
  };

  useEffect(() => {
    void loadData();
  }, [configured]);

  const organizationCards = useMemo(() => {
    return organizations
      .map((organization) => {
        const subscription = subscriptions.find(
          (item) => item.organization_id === organization.id,
        );
        const activeMembers = memberRows.filter(
          (item) => item.organization_id === organization.id && item.status === "active",
        ).length;
        const pendingInvites = inviteRows.filter(
          (item) => item.organization_id === organization.id && item.status === "pending",
        ).length;
        const occupiedSeats = activeMembers + pendingInvites;
        return {
          organization,
          subscription,
          activeMembers,
          pendingInvites,
          occupiedSeats,
        };
      })
      .filter((item) =>
        statusFilter === "all" ? true : item.subscription?.status === statusFilter,
      )
      .filter((item) => {
        if (typeFilter === "all") return true;
        if (typeFilter === "individual") return item.organization.personal;
        return !item.organization.personal;
      });
  }, [inviteRows, memberRows, organizations, statusFilter, typeFilter, subscriptions]);

  const totalActive = subscriptions.filter(
    (item) => getSubscriptionAccessState(item) === "active",
  ).length;
  const totalTrialing = subscriptions.filter((item) => item.status === "trialing").length;
  const totalExpired = subscriptions.filter(
    (item) => getSubscriptionAccessState(item) === "expired",
  ).length;
  // Organizations awaiting approval: never activated (status 'incomplete') or no
  // subscription row yet. These are the ones that need a manual "Activate".
  const totalPending = organizations.filter((organization) => {
    const subscription = subscriptions.find(
      (item) => item.organization_id === organization.id,
    );
    return !subscription || subscription.status === "incomplete";
  }).length;

  const handleSave = async () => {
    if (!editor) return;

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setNotice("Supabase environment variables are missing.");
      return;
    }

    const seatCountValue = Math.floor(Number(editor.seatCount));
    if (!editor.isPersonal && Number.isFinite(seatCountValue)) {
      const seatFloor = Math.max(1, editor.occupiedSeats);
      if (seatCountValue < seatFloor) {
        setNotice(
          `Seat count can't go below ${seatFloor} — ${editor.occupiedSeats} seat(s) are already occupied by active members or reserved invites.`,
        );
        return;
      }
    }

    setBusy(editor.organizationId);
    setNotice(null);

    const { error } = await supabase.rpc("admin_set_organization_subscription", {
      org_uuid: editor.organizationId,
      new_status: editor.status,
      seat_count_param: Number.isFinite(seatCountValue) ? seatCountValue : null,
      plan_code_param: editor.planCode,
      expires_at_param: isoFromDateInput(effectiveExpiryInput(editor)),
    });

    if (error) {
      setBusy(null);
      setNotice(error.message);
      return;
    }

    setBusy(null);
    setEditor(null);
    setNotice("Manual subscription update saved.");
    await loadData();
  };

  const handleQuickUpdate = async ({
    organizationId,
    planCode,
    status,
    seatCount,
    days,
  }: {
    organizationId: string;
    planCode: string;
    status: OrganizationSubscriptionRecord["status"];
    seatCount: number;
    days: number;
  }) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setNotice("Supabase environment variables are missing.");
      return;
    }

    setBusy(`${organizationId}:${status}`);
    setNotice(null);
    const { error } = await supabase.rpc("admin_set_organization_subscription", {
      org_uuid: organizationId,
      new_status: status,
      seat_count_param: seatCount,
      plan_code_param: planCode,
      expires_at_param: isoFromDateInput(dateInputFromNow(days)),
    });

    if (error) {
      setBusy(null);
      setNotice(error.message);
      return;
    }

    setBusy(null);
    setNotice(`Subscription marked ${status}.`);
    await loadData();
  };

  // Per-org action buttons. Shared between the desktop table row and the
  // mobile card layout so behaviour stays identical.
  const renderOrgActions = ({
    organization,
    subscription,
    occupiedSeats,
  }: {
    organization: OrganizationRecord;
    subscription?: OrganizationSubscriptionRecord;
    occupiedSeats: number;
  }) => {
    const effectivePlanCode =
      subscription?.plan_code ||
      (organization.personal ? "individual-monthly" : "organization-monthly");
    // Personal workspaces are fixed at a single seat (the owner) — never edit it.
    // Orgs without a subscription start from the seats actually occupied; the
    // admin sets the real allocation via Edit.
    const effectiveSeatCount = organization.personal
      ? 1
      : subscription?.seat_count || Math.max(occupiedSeats, 1);
    const orgBusy = busy?.startsWith(`${organization.id}:`);
    return (
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant="success"
          size="sm"
          disabled={orgBusy}
          onClick={() =>
            handleQuickUpdate({
              organizationId: organization.id,
              planCode: effectivePlanCode,
              status: "active",
              seatCount: effectiveSeatCount,
              days: 30,
            })
          }
        >
          <Play size={13} /> {organization.personal ? "Activate (1 mo trial)" : "Activate 30d"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={orgBusy}
          onClick={() =>
            handleQuickUpdate({
              organizationId: organization.id,
              planCode: effectivePlanCode,
              status: subscription?.status === "trialing" ? "trialing" : "active",
              seatCount: effectiveSeatCount,
              days: 90,
            })
          }
        >
          Extend 90d
        </Button>
        <button
          type="button"
          disabled={orgBusy}
          onClick={() =>
            handleQuickUpdate({
              organizationId: organization.id,
              planCode: effectivePlanCode,
              status: "past_due",
              seatCount: effectiveSeatCount,
              days: -1,
            })
          }
          className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-surface px-2.5 py-1 text-xs font-medium text-warn transition hover:border-warn/40 hover:bg-warn/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Ban size={13} /> Suspend
        </button>
        <button
          type="button"
          disabled={orgBusy}
          onClick={() =>
            handleQuickUpdate({
              organizationId: organization.id,
              planCode: effectivePlanCode,
              status: "canceled",
              seatCount: effectiveSeatCount,
              days: -1,
            })
          }
          className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-surface px-2.5 py-1 text-xs font-medium text-err transition hover:border-err/40 hover:bg-err/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Cancel
        </button>
        <Button
          variant="default"
          size="sm"
          onClick={() => {
            // A live subscription opens on "custom" holding its current expiry,
            // so seat-only edits never shift the renewal date (added seats stay
            // co-terminous). Otherwise default the term to the plan's interval.
            const existingExpiry =
              subscription?.current_period_end || subscription?.trial_ends_at;
            const hasFutureExpiry = existingExpiry
              ? new Date(existingExpiry).getTime() > Date.now()
              : false;
            setEditor({
              organizationId: organization.id,
              organizationName: organization.name,
              planCode: effectivePlanCode,
              status: subscription?.status || "trialing",
              seatCount: String(effectiveSeatCount),
              originalSeatCount: effectiveSeatCount,
              occupiedSeats,
              startDate: dateInputFromNow(0),
              termPreset: hasFutureExpiry
                ? "custom"
                : effectivePlanCode.includes("yearly")
                  ? "year"
                  : "month",
              expiryDate: subscriptionExpiryInput(subscription),
              isPersonal: organization.personal,
            });
          }}
        >
          <Pencil size={13} /> Edit seats & access
        </Button>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Manual billing operations</h2>
      </div>

      {notice ? (
        <div className="rounded-xl border border-accent/25 bg-accent/10 px-4 py-3 text-sm text-txt">
          {notice}
        </div>
      ) : null}

      {!configured ? (
        <div className="rounded-2xl border border-warn/30 bg-warn/10 px-4 py-4 text-sm text-warn">
          Add your Supabase environment variables before using manual billing operations.
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-bg-surface p-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
            <Building2 size={16} />
          </span>
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-txt-dim">
              Organizations
            </div>
            <div className="text-xl font-semibold text-txt">{organizations.length}</div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setStatusFilter("incomplete")}
          className={`flex items-center gap-3 rounded-2xl border bg-bg-surface p-4 text-left transition hover:border-warn/60 ${
            totalPending > 0 ? "border-warn/50" : "border-border"
          }`}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warn/10 text-warn">
            <Hourglass size={16} />
          </span>
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-txt-dim">
              Pending approval
            </div>
            <div className="text-xl font-semibold text-txt">{totalPending}</div>
            <div className="text-xs text-txt-muted">Awaiting activation</div>
          </div>
        </button>
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-bg-surface p-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ok/10 text-ok">
            <CreditCard size={16} />
          </span>
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-txt-dim">
              Active
            </div>
            <div className="text-xl font-semibold text-txt">{totalActive}</div>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-bg-surface p-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
            <CalendarClock size={16} />
          </span>
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-txt-dim">
              Trials / expired
            </div>
            <div className="text-xl font-semibold text-txt">{totalTrialing}</div>
            <div className="text-xs text-txt-muted">{totalExpired} expired</div>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-bg-surface p-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
            <Users size={16} />
          </span>
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-txt-dim">
              Seats sold
            </div>
            <div className="text-xl font-semibold text-txt">
              {subscriptions.reduce((sum, subscription) => sum + subscription.seat_count, 0)}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-bg-surface p-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-3">
          <label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">
            Filter
          </label>
          <select
            className="input w-full sm:!w-auto sm:min-w-[180px]"
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(
                event.target.value as "all" | OrganizationSubscriptionRecord["status"],
              )
            }
          >
            <option value="all">All statuses</option>
            <option value="trialing">Trialing</option>
            <option value="active">Active</option>
            <option value="past_due">Past due</option>
            <option value="canceled">Canceled</option>
            <option value="incomplete">Incomplete</option>
          </select>
          <select
            className="input w-full sm:!w-auto sm:min-w-[180px]"
            value={typeFilter}
            onChange={(event) =>
              setTypeFilter(event.target.value as "all" | "individual" | "organization")
            }
          >
            <option value="all">All types</option>
            <option value="individual">Individuals</option>
            <option value="organization">Organizations</option>
          </select>
        </div>

        <Button variant="ghost" className="w-full justify-center sm:w-auto" onClick={() => void loadData()} disabled={loading}>
          <RefreshCcw size={14} /> Refresh
        </Button>
      </div>

      <div className="space-y-4">
        {loading ? (
          <div className="rounded-2xl border border-border bg-bg-surface px-4 py-5 text-sm text-txt-muted">
            Loading organizations and subscription records...
          </div>
        ) : null}

        {!loading && organizationCards.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-bg-surface px-4 py-5 text-sm text-txt-muted">
            No organizations match this filter yet.
          </div>
        ) : null}

        {!loading && organizationCards.length > 0 ? (
          <>
            {/* Mobile: stacked cards so action buttons stay reachable on phones. */}
            <div className="space-y-3 sm:hidden">
              {organizationCards.map(({ organization, subscription, activeMembers, pendingInvites, occupiedSeats }) => {
                const plan = plans.find((item) => item.code === subscription?.plan_code);
                const accessState = getSubscriptionAccessState(subscription);
                const daysRemaining = getDaysUntilSubscriptionExpiry(subscription);
                return (
                  <div
                    key={organization.id}
                    className="rounded-2xl border border-border bg-bg-surface p-4 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-txt">{organization.name}</span>
                        <Badge color={organization.personal ? "ok" : "accent"}>
                          {organization.personal ? "INDIVIDUAL" : "ORG"}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {subscription ? (
                          <Badge color={subscriptionBadgeColor(accessState)}>
                            {subscriptionStateLabel(accessState).toUpperCase()}
                          </Badge>
                        ) : (
                          <Badge color="warn">NO SUBSCRIPTION</Badge>
                        )}
                        {subscription ? (
                          <Badge color={statusBadge(subscription.status)}>
                            {subscription.status.toUpperCase()}
                          </Badge>
                        ) : null}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-txt-dim">Plan</div>
                        <div className="text-txt">
                          {plan?.name || (subscription?.plan_code ? planLabel(subscription.plan_code) : "Not set")}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-txt-dim">Seats</div>
                        <div className="font-mono tabular-nums text-txt">
                          {occupiedSeats}/{subscription?.seat_count || 0}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-txt-dim">Members</div>
                        <div className="font-mono tabular-nums text-txt">
                          {activeMembers} active · {pendingInvites} pending
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-txt-dim">Access until</div>
                        <div className="text-txt">{formatSubscriptionExpiry(subscription)}</div>
                        <div
                          className={`${
                            daysRemaining !== null && daysRemaining < 0
                              ? "text-err"
                              : daysRemaining !== null && daysRemaining <= 7
                                ? "text-warn"
                                : "text-txt-dim"
                          }`}
                        >
                          {formatRemaining(daysRemaining)}
                        </div>
                      </div>
                    </div>

                    {renderOrgActions({ organization, subscription, occupiedSeats })}
                  </div>
                );
              })}
            </div>

            {/* Desktop: tabular layout. */}
            <div className="hidden data-table-shell sm:block">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Organization</th>
                    <th>Plan</th>
                    <th>Status</th>
                    <th>Seats</th>
                    <th>Members</th>
                    <th>Pending</th>
                    <th>Access until</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {organizationCards.map(({ organization, subscription, activeMembers, pendingInvites, occupiedSeats }) => {
                    const plan = plans.find((item) => item.code === subscription?.plan_code);
                    const accessState = getSubscriptionAccessState(subscription);
                    const daysRemaining = getDaysUntilSubscriptionExpiry(subscription);
                    return (
                      <tr key={organization.id}>
                        <td className="data-cell-wrap">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-txt">{organization.name}</span>
                            <Badge color={organization.personal ? "ok" : "accent"}>
                              {organization.personal ? "INDIVIDUAL" : "ORG"}
                            </Badge>
                          </div>
                        </td>
                        <td className="data-cell-wrap">
                          {plan?.name || (subscription?.plan_code ? planLabel(subscription.plan_code) : "Not set")}
                        </td>
                        <td>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {subscription ? (
                              <Badge color={subscriptionBadgeColor(accessState)}>
                                {subscriptionStateLabel(accessState).toUpperCase()}
                              </Badge>
                            ) : (
                              <Badge color="warn">NO SUBSCRIPTION</Badge>
                            )}
                            {subscription ? (
                              <Badge color={statusBadge(subscription.status)}>
                                {subscription.status.toUpperCase()}
                              </Badge>
                            ) : null}
                          </div>
                        </td>
                        <td className="data-cell-num">
                          {occupiedSeats}/{subscription?.seat_count || 0}
                        </td>
                        <td className="data-cell-num">{activeMembers}</td>
                        <td className="data-cell-num">{pendingInvites}</td>
                        <td className="data-cell-wrap">
                          <div>{formatSubscriptionExpiry(subscription)}</div>
                          <div
                            className={`text-xs ${
                              daysRemaining !== null && daysRemaining < 0
                                ? "text-err"
                                : daysRemaining !== null && daysRemaining <= 7
                                  ? "text-warn"
                                  : "text-txt-dim"
                            }`}
                          >
                            {formatRemaining(daysRemaining)}
                          </div>
                        </td>
                        <td>{renderOrgActions({ organization, subscription, occupiedSeats })}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </div>

      <Modal
        open={!!editor}
        onClose={() => setEditor(null)}
        title="Manual subscription update"
        width={520}
      >
        {editor ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-bg-raised px-4 py-2.5 text-sm text-txt">
              Updating <strong>{editor.organizationName}</strong>.
            </div>

            <div>
              <label className="label">Plan</label>
              <select
                className="input"
                value={editor.planCode}
                onChange={(event) =>
                  setEditor((current) =>
                    current ? { ...current, planCode: event.target.value } : current,
                  )
                }
              >
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.code}>
                    {plan.name} · {formatMoney(plan.base_price_cents)}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="label">Status</label>
                <select
                  className="input"
                  value={editor.status}
                  onChange={(event) =>
                    setEditor((current) =>
                      current
                        ? {
                            ...current,
                            status: event.target.value as OrganizationSubscriptionRecord["status"],
                          }
                        : current,
                    )
                  }
                >
                  <option value="trialing">Trialing</option>
                  <option value="active">Active</option>
                  <option value="past_due">Past due</option>
                  <option value="canceled">Canceled</option>
                  <option value="incomplete">Incomplete</option>
                </select>
              </div>
              <div>
                <label className="label">Seat count</label>
                {editor.isPersonal ? (
                  <div className="input flex items-center text-txt-muted">
                    Individual — 1 user (fixed)
                  </div>
                ) : (
                  <>
                    <input
                      type="number"
                      min={Math.max(1, editor.occupiedSeats)}
                      step={1}
                      className="input"
                      value={editor.seatCount}
                      onChange={(event) =>
                        setEditor((current) =>
                          current ? { ...current, seatCount: event.target.value } : current,
                        )
                      }
                    />
                    <p className="mt-1 text-xs leading-5 text-txt-dim">
                      Any number from {Math.max(1, editor.occupiedSeats)} up —{" "}
                      {editor.occupiedSeats} seat{editor.occupiedSeats === 1 ? " is" : "s are"}{" "}
                      already occupied (active members + reserved invites).
                    </p>
                  </>
                )}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="label">Subscription term</label>
                <select
                  className="input"
                  value={editor.termPreset}
                  onChange={(event) => {
                    const nextTerm = event.target.value as EditableSubscription["termPreset"];
                    setEditor((current) => {
                      if (!current) return current;
                      // Picking a term implies the matching status; the status
                      // select above stays editable for overrides.
                      let nextStatus = current.status;
                      if (nextTerm === "trial-month") {
                        nextStatus = "trialing";
                      } else if (
                        nextTerm !== "custom" &&
                        current.status !== "active"
                      ) {
                        nextStatus = "active";
                      }
                      return { ...current, termPreset: nextTerm, status: nextStatus };
                    });
                  }}
                >
                  {termOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              {editor.termPreset === "custom" ? (
                <div>
                  <label className="label">Access expires</label>
                  <input
                    type="date"
                    className="input"
                    value={editor.expiryDate}
                    onChange={(event) =>
                      setEditor((current) =>
                        current ? { ...current, expiryDate: event.target.value } : current,
                      )
                    }
                  />
                </div>
              ) : (
                <div>
                  <label className="label">Start date</label>
                  <input
                    type="date"
                    className="input"
                    value={editor.startDate}
                    onChange={(event) =>
                      setEditor((current) =>
                        current ? { ...current, startDate: event.target.value } : current,
                      )
                    }
                  />
                </div>
              )}
            </div>

            {editor.termPreset !== "custom" ? (
              <div className="rounded-lg border border-border bg-bg-raised px-3.5 py-2.5 text-sm text-txt">
                Access expires{" "}
                <strong>{formatDateInput(effectiveExpiryInput(editor))}</strong>
                <span className="text-txt-muted"> — start date + {
                  editor.termPreset === "year" ? "1 year" : "1 month"
                }{editor.termPreset === "trial-month" ? " (trial)" : ""}.</span>
              </div>
            ) : null}

            {(() => {
              // Seats added mid-term are co-terminous: they inherit the org's
              // existing expiry so every seat renews together. Billing is
              // manual, so surface the suggested pro-rated charge here.
              if (editor.isPersonal) return null;
              const plan = plans.find((item) => item.code === editor.planCode);
              const seatDelta = Math.floor(Number(editor.seatCount)) - editor.originalSeatCount;
              const expiryInput = effectiveExpiryInput(editor);
              const expiryMs = new Date(`${expiryInput}T00:00:00Z`).getTime();
              const daysLeft = Math.ceil((expiryMs - Date.now()) / 86_400_000);
              if (!plan || seatDelta <= 0 || !Number.isFinite(daysLeft) || daysLeft <= 0) {
                return null;
              }
              const intervalDays = plan.billing_interval === "yearly" ? 365 : 30;
              const proRataCents = Math.round(
                seatDelta * plan.per_seat_price_cents * (daysLeft / intervalDays),
              );
              return (
                <div className="rounded-lg border border-accent/25 bg-accent/10 px-3.5 py-2.5 text-xs leading-5 text-txt">
                  Adding <strong>{seatDelta}</strong> seat{seatDelta === 1 ? "" : "s"} mid-term:
                  the new seats share the current expiry ({formatDateInput(expiryInput)}) so all
                  seats renew together.
                  {plan.per_seat_price_cents > 0 ? (
                    <>
                      {" "}
                      Suggested pro-rata charge: <strong>~{formatMoney(proRataCents)}</strong>{" "}
                      ({seatDelta} × {formatMoney(plan.per_seat_price_cents)}/seat ×{" "}
                      {daysLeft} of {intervalDays} days).
                    </>
                  ) : null}
                </div>
              );
            })()}

            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setEditor(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleSave}
                disabled={busy === editor.organizationId}
              >
                {busy === editor.organizationId ? "Saving..." : "Save manual update"}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
