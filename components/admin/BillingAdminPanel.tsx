"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Ban,
  Building2,
  CalendarClock,
  CreditCard,
  Hourglass,
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
  durationPreset: "14" | "30" | "90" | "365" | "custom";
  expiryDate: string;
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

const durationOptions = [
  { value: "14", label: "14 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "365", label: "1 year" },
  { value: "custom", label: "Custom date" },
] as const;

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
      );
  }, [inviteRows, memberRows, organizations, statusFilter, subscriptions]);

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

    setBusy(editor.organizationId);
    setNotice(null);

    const seatCountValue = Number(editor.seatCount);
    const { error } = await supabase.rpc("admin_set_organization_subscription", {
      org_uuid: editor.organizationId,
      new_status: editor.status,
      seat_count_param: Number.isFinite(seatCountValue) ? seatCountValue : null,
      plan_code_param: editor.planCode,
      expires_at_param: isoFromDateInput(editor.expiryDate),
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
  }: {
    organization: OrganizationRecord;
    subscription?: OrganizationSubscriptionRecord;
  }) => {
    const effectivePlanCode =
      subscription?.plan_code ||
      (organization.personal ? "individual-monthly" : "organization-monthly");
    const effectiveSeatCount =
      subscription?.seat_count || (organization.personal ? 1 : 5);
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
          <Play size={13} /> Activate 30d
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
        <Button
          variant="warning"
          size="sm"
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
        >
          <Ban size={13} /> Suspend
        </Button>
        <Button
          variant="danger"
          size="sm"
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
        >
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={() =>
            setEditor({
              organizationId: organization.id,
              organizationName: organization.name,
              planCode: effectivePlanCode,
              status: subscription?.status || "trialing",
              seatCount: String(effectiveSeatCount),
              durationPreset: "custom",
              expiryDate: subscriptionExpiryInput(subscription),
            })
          }
        >
          Edit
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
        <div className="rounded-2xl border border-border bg-bg-surface p-4">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">
            <Building2 size={14} className="text-accent" />
            Organizations
          </div>
          <div className="mt-3 text-2xl font-semibold text-white">{organizations.length}</div>
        </div>
        <button
          type="button"
          onClick={() => setStatusFilter("incomplete")}
          className={`rounded-2xl border bg-bg-surface p-4 text-left transition hover:border-warn/60 ${
            totalPending > 0 ? "border-warn/50" : "border-border"
          }`}
        >
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">
            <Hourglass size={14} className="text-warn" />
            Pending approval
          </div>
          <div className="mt-3 text-2xl font-semibold text-white">{totalPending}</div>
          <div className="mt-1 text-xs text-txt-muted">Awaiting activation</div>
        </button>
        <div className="rounded-2xl border border-border bg-bg-surface p-4">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">
            <CreditCard size={14} className="text-accent" />
            Active
          </div>
          <div className="mt-3 text-2xl font-semibold text-white">{totalActive}</div>
        </div>
        <div className="rounded-2xl border border-border bg-bg-surface p-4">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">
            <CalendarClock size={14} className="text-accent" />
            Trials / expired
          </div>
          <div className="mt-3 text-2xl font-semibold text-white">{totalTrialing}</div>
          <div className="mt-1 text-xs text-txt-muted">{totalExpired} expired</div>
        </div>
        <div className="rounded-2xl border border-border bg-bg-surface p-4">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">
            <Users size={14} className="text-accent" />
            Seats sold
          </div>
          <div className="mt-3 text-2xl font-semibold text-white">
            {subscriptions.reduce((sum, subscription) => sum + subscription.seat_count, 0)}
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
                        <span className="font-semibold text-white">{organization.name}</span>
                        <Badge color={organization.personal ? "ok" : "accent"}>
                          {organization.personal ? "PERSONAL" : "ORG"}
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

                    {renderOrgActions({ organization, subscription })}
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
                            <span className="font-semibold text-white">{organization.name}</span>
                            <Badge color={organization.personal ? "ok" : "accent"}>
                              {organization.personal ? "PERSONAL" : "ORG"}
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
                        <td>{renderOrgActions({ organization, subscription })}</td>
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
                <input
                  className="input"
                  value={editor.seatCount}
                  onChange={(event) =>
                    setEditor((current) =>
                      current ? { ...current, seatCount: event.target.value } : current,
                    )
                  }
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="label">Manual access duration</label>
                <select
                  className="input"
                  value={editor.durationPreset}
                  onChange={(event) => {
                    const nextPreset = event.target.value as EditableSubscription["durationPreset"];
                    setEditor((current) =>
                      current
                        ? {
                            ...current,
                            durationPreset: nextPreset,
                            expiryDate:
                              nextPreset === "custom"
                                ? current.expiryDate
                                : dateInputFromNow(Number(nextPreset)),
                          }
                        : current,
                    );
                  }}
                >
                  {durationOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Access expires</label>
                <input
                  type="date"
                  className="input"
                  value={editor.expiryDate}
                  onChange={(event) =>
                    setEditor((current) =>
                      current
                        ? {
                            ...current,
                            durationPreset: "custom",
                            expiryDate: event.target.value,
                          }
                        : current,
                    )
                  }
                />
              </div>
            </div>

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
