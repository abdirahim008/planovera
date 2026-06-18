"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Ban,
  Building2,
  CalendarClock,
  CreditCard,
  Hourglass,
  MoreHorizontal,
  Pencil,
  Play,
  RefreshCcw,
  SlidersHorizontal,
  Users,
  XCircle,
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

type ProfileLite = {
  id: string;
  full_name: string | null;
  email: string;
  company: string | null;
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

// Initials for the avatar — first letters of the first two words, or first two
// characters of a single-word name.
const orgInitials = (name: string) => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
};

// Deterministic soft tint from the name so each org keeps a stable colour.
// Built only from existing theme tokens.
const AVATAR_TINTS = [
  "bg-accent/10 text-accent",
  "bg-ok/10 text-ok",
  "bg-warn/10 text-warn",
] as const;

const avatarTint = (name: string) => {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash + name.charCodeAt(i)) % AVATAR_TINTS.length;
  }
  return AVATAR_TINTS[hash];
};

// Status + access summarised as a single coloured dot + short label.
const statusDotInfo = (
  subscription: OrganizationSubscriptionRecord | undefined,
  accessState: ReturnType<typeof getSubscriptionAccessState>,
) => {
  if (!subscription || subscription.status === "incomplete") {
    return { className: "text-err", label: "Setup incomplete" };
  }
  if (subscription.status === "canceled") {
    return { className: "text-txt-dim", label: "Cancelled" };
  }
  if (subscription.status === "past_due") {
    return { className: "text-warn", label: "Past due" };
  }
  if (accessState === "expired") {
    return { className: "text-err", label: "Access expired" };
  }
  if (subscription.status === "trialing") {
    return { className: "text-accent", label: "On trial" };
  }
  return { className: "text-ok", label: "Access active" };
};

// Subscription-status dot (the left dot in the mobile two-dot status row):
// reflects the raw subscription.status rather than the derived access state.
const subscriptionStatusDot = (
  subscription: OrganizationSubscriptionRecord | undefined,
) => {
  if (!subscription) return { className: "text-txt-dim", label: "No subscription" };
  if (subscription.status === "active") return { className: "text-ok", label: "Active" };
  if (subscription.status === "trialing") return { className: "text-accent", label: "Trialing" };
  if (subscription.status === "past_due") return { className: "text-warn", label: "Past due" };
  if (subscription.status === "canceled") return { className: "text-err", label: "Cancelled" };
  return { className: "text-txt-dim", label: "Inactive" };
};

// Urgency colour for the access-until progress bar / remaining text.
const remainingUrgencyClass = (daysRemaining: number | null) => {
  if (daysRemaining === null || daysRemaining < 0) return "text-err";
  if (daysRemaining <= 14) return "text-warn";
  return "text-ok";
};

const remainingBarClass = (daysRemaining: number | null) => {
  if (daysRemaining === null || daysRemaining < 0) return "bg-err";
  if (daysRemaining <= 14) return "bg-warn";
  return "bg-ok";
};

// Compact "x minutes ago" string for the footer sync indicator.
const formatRelativeTime = (date: Date | null) => {
  if (!date) return "never";
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
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
  const [profilesById, setProfilesById] = useState<Record<string, ProfileLite>>({});
  const [editor, setEditor] = useState<EditableSubscription | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | OrganizationSubscriptionRecord["status"]>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "individual" | "organization">("all");
  const [search, setSearch] = useState("");
  // Pending view = orgs without a subscription or with status "incomplete".
  // Tracked separately so the stat card can drive it without colliding with the
  // status select.
  const [pendingOnly, setPendingOnly] = useState(false);
  const [menuOrgId, setMenuOrgId] = useState<string | null>(null);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  // Re-render the footer "synced x ago" label on a slow tick.
  const [, setNowTick] = useState(0);

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
      { data: profileRows, error: profilesError },
    ] = await Promise.all([
      supabase.from("organizations").select("*").order("created_at", { ascending: false }),
      supabase.from("billing_plans").select("*").order("base_price_cents", { ascending: true }),
      supabase
        .from("organization_subscriptions")
        .select("*")
        .order("updated_at", { ascending: false }),
      supabase.from("organization_members").select("organization_id,status"),
      supabase.from("organization_invites").select("organization_id,status"),
      // Admins can read every profile (can_view_profile → is_admin), so we can
      // show who actually owns each account.
      supabase.from("profiles").select("id,full_name,email,company"),
    ]);

    setOrganizations((orgRows ?? []) as OrganizationRecord[]);
    setPlans((planRows ?? []) as BillingPlanRecord[]);
    setSubscriptions((subscriptionRows ?? []) as OrganizationSubscriptionRecord[]);
    setMemberRows((members ?? []) as MemberCountRecord[]);
    setInviteRows((invites ?? []) as InviteCountRecord[]);
    setProfilesById(
      Object.fromEntries(((profileRows ?? []) as ProfileLite[]).map((profile) => [profile.id, profile])),
    );
    setNotice(
      expiryError?.message ||
        orgError?.message ||
        planError?.message ||
        subscriptionError?.message ||
        membersError?.message ||
        invitesError?.message ||
        profilesError?.message ||
        null,
    );
    setLastSyncedAt(new Date());
    setLoading(false);
  };

  useEffect(() => {
    void loadData();
  }, [configured]);

  // Keep the footer "synced x ago" label fresh without re-fetching.
  useEffect(() => {
    const id = window.setInterval(() => setNowTick((tick) => tick + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

  // Close the per-row actions menu on outside click or Escape.
  useEffect(() => {
    if (!menuOrgId) return;
    const handleClick = () => setMenuOrgId(null);
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOrgId(null);
    };
    document.addEventListener("click", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("click", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [menuOrgId]);

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
        pendingOnly
          ? !item.subscription || item.subscription.status === "incomplete"
          : true,
      )
      .filter((item) =>
        statusFilter === "all" ? true : item.subscription?.status === statusFilter,
      )
      .filter((item) => {
        if (typeFilter === "all") return true;
        if (typeFilter === "individual") return item.organization.personal;
        return !item.organization.personal;
      })
      .filter((item) => {
        const needle = search.trim().toLowerCase();
        if (!needle) return true;
        const owner = item.organization.owner_id ? profilesById[item.organization.owner_id] : undefined;
        const haystack = [
          item.organization.name,
          owner?.full_name ?? "",
          owner?.email ?? "",
          owner?.company ?? "",
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(needle);
      });
  }, [inviteRows, memberRows, organizations, pendingOnly, profilesById, search, statusFilter, typeFilter, subscriptions]);

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

  const seatsSold = subscriptions.reduce(
    (sum, subscription) => sum + subscription.seat_count,
    0,
  );

  // Which stat card is currently "active" (filled dark) — derived from the live
  // filter state so the highlight always reflects the table.
  const activeStat: "all" | "pending" | "active" | "trialing" =
    pendingOnly || statusFilter === "incomplete"
      ? "pending"
      : statusFilter === "active"
        ? "active"
        : statusFilter === "trialing"
          ? "trialing"
          : "all";

  const showAll = () => {
    setPendingOnly(false);
    setStatusFilter("all");
  };
  const showPending = () => {
    setStatusFilter("all");
    setPendingOnly(true);
  };
  const showActive = () => {
    setPendingOnly(false);
    setStatusFilter("active");
  };
  const showTrialing = () => {
    setPendingOnly(false);
    setStatusFilter("trialing");
  };

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

  // Opens the seat/term editor modal with the same payload the legacy Edit
  // button used — preserved verbatim so the modal behaviour is unchanged.
  const openEditor = (
    organization: OrganizationRecord,
    subscription: OrganizationSubscriptionRecord | undefined,
    occupiedSeats: number,
    effectivePlanCode: string,
    effectiveSeatCount: number,
  ) => {
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
  };

  // Per-org actions: one primary "Activate" button plus a three-dots menu with
  // the secondary actions. Shared between the desktop table row and the mobile
  // card layout so behaviour stays identical.
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
    const menuOpen = menuOrgId === organization.id;

    const menuItemClass =
      "flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-txt transition hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-40";

    return (
      <div className="flex items-center justify-end gap-2">
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
          <Play size={13} /> {organization.personal ? "Activate trial" : "Activate 30d"}
        </Button>

        <div className="relative">
          <button
            type="button"
            aria-label="More actions"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            disabled={orgBusy}
            onClick={(event) => {
              event.stopPropagation();
              setMenuOrgId(menuOpen ? null : organization.id);
            }}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-bg-surface text-txt-dim transition hover:bg-bg-hover hover:text-txt disabled:cursor-not-allowed disabled:opacity-40"
          >
            <MoreHorizontal size={16} />
          </button>

          {menuOpen ? (
            <div
              role="menu"
              onClick={(event) => event.stopPropagation()}
              className="absolute right-0 top-full z-20 mt-1 hidden w-56 overflow-hidden rounded-lg border border-border bg-bg-surface py-1 shadow-lg sm:block"
            >
              <button
                type="button"
                role="menuitem"
                disabled={orgBusy}
                onClick={() => {
                  setMenuOrgId(null);
                  handleQuickUpdate({
                    organizationId: organization.id,
                    planCode: effectivePlanCode,
                    status: subscription?.status === "trialing" ? "trialing" : "active",
                    seatCount: effectiveSeatCount,
                    days: 90,
                  });
                }}
                className={menuItemClass}
              >
                <CalendarClock size={14} className="text-txt-dim" /> Extend access 90 days
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOrgId(null);
                  openEditor(
                    organization,
                    subscription,
                    occupiedSeats,
                    effectivePlanCode,
                    effectiveSeatCount,
                  );
                }}
                className={menuItemClass}
              >
                <Pencil size={14} className="text-txt-dim" /> Edit seats &amp; access
              </button>
              <div className="my-1 border-t border-border" />
              <button
                type="button"
                role="menuitem"
                disabled={orgBusy}
                onClick={() => {
                  setMenuOrgId(null);
                  handleQuickUpdate({
                    organizationId: organization.id,
                    planCode: effectivePlanCode,
                    status: "past_due",
                    seatCount: effectiveSeatCount,
                    days: -1,
                  });
                }}
                className={`${menuItemClass} !text-warn hover:bg-warn/10`}
              >
                <Ban size={14} /> Suspend organisation
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={orgBusy}
                onClick={() => {
                  setMenuOrgId(null);
                  handleQuickUpdate({
                    organizationId: organization.id,
                    planCode: effectivePlanCode,
                    status: "canceled",
                    seatCount: effectiveSeatCount,
                    days: -1,
                  });
                }}
                className={`${menuItemClass} !text-err hover:bg-err/10`}
              >
                <XCircle size={14} /> Cancel subscription
              </button>
            </div>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Manual billing operations</h2>
        <p className="mt-1 text-sm text-txt-dim">
          Activate, extend, suspend or cancel organisation subscriptions. Click a stat to filter.
        </p>
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

      {/* Mobile: compact stat chips (4) — same filters as the desktop cards. */}
      <div className="grid grid-cols-4 gap-2 sm:hidden">
        {([
          {
            key: "all" as const,
            label: "Orgs",
            value: organizations.length,
            icon: Building2,
            active: activeStat === "all",
            onClick: showAll,
          },
          {
            key: "pending" as const,
            label: "Pending",
            value: totalPending,
            icon: Hourglass,
            active: activeStat === "pending",
            onClick: showPending,
          },
          {
            key: "active" as const,
            label: "Active",
            value: totalActive,
            icon: CreditCard,
            active: activeStat === "active",
            onClick: showActive,
          },
          {
            key: "trialing" as const,
            label: "Trials",
            value: totalTrialing,
            icon: CalendarClock,
            active: activeStat === "trialing",
            onClick: showTrialing,
          },
        ]).map((chip) => {
          const Icon = chip.icon;
          return (
            <button
              key={chip.key}
              type="button"
              onClick={chip.onClick}
              className={`flex flex-col gap-1 rounded-xl border p-2.5 text-left transition ${
                chip.active
                  ? "border-txt bg-txt text-white"
                  : "border-border bg-bg-surface"
              }`}
            >
              <Icon size={13} className={chip.active ? "text-white/70" : "text-txt-dim"} />
              <span className={`text-lg font-semibold leading-none ${chip.active ? "text-white" : "text-txt"}`}>
                {chip.value}
              </span>
              <span
                className={`text-[9px] font-semibold uppercase tracking-[0.12em] ${
                  chip.active ? "text-white/80" : "text-txt-dim"
                }`}
              >
                {chip.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Desktop: the full set of 5 big stat cards. */}
      <div className="hidden gap-3 sm:grid sm:grid-cols-2 lg:grid-cols-5">
        {([
          {
            key: "all" as const,
            label: "Organisations",
            value: organizations.length,
            sub: null,
            icon: Building2,
            active: activeStat === "all",
            onClick: showAll,
          },
          {
            key: "pending" as const,
            label: "Pending approval",
            value: totalPending,
            sub: "awaiting",
            icon: Hourglass,
            active: activeStat === "pending",
            onClick: showPending,
          },
          {
            key: "active" as const,
            label: "Active",
            value: totalActive,
            sub: null,
            icon: CreditCard,
            active: activeStat === "active",
            onClick: showActive,
          },
          {
            key: "trialing" as const,
            label: "Trials / expired",
            value: totalTrialing,
            sub: `${totalExpired} expired`,
            icon: CalendarClock,
            active: activeStat === "trialing",
            onClick: showTrialing,
          },
          {
            key: "seats" as const,
            label: "Seats sold",
            value: seatsSold,
            sub: null,
            icon: Users,
            active: false,
            onClick: showAll,
          },
        ]).map((card) => {
          const Icon = card.icon;
          return (
            <button
              key={card.key}
              type="button"
              onClick={card.onClick}
              className={`flex flex-col gap-2 rounded-2xl border p-4 text-left transition ${
                card.active
                  ? "border-txt bg-txt text-white"
                  : "border-border bg-bg-surface hover:border-border-light"
              }`}
            >
              <div className="flex items-center gap-2">
                <Icon
                  size={14}
                  className={card.active ? "text-white/70" : "text-txt-dim"}
                />
                <span
                  className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${
                    card.active ? "text-white/80" : "text-txt-dim"
                  }`}
                >
                  {card.label}
                </span>
              </div>
              <div
                className={`text-2xl font-semibold ${
                  card.active ? "text-white" : "text-txt"
                }`}
              >
                {card.value}
              </div>
              {card.sub ? (
                <div
                  className={`text-xs ${card.active ? "text-white/70" : "text-txt-dim"}`}
                >
                  {card.sub}
                </div>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-bg-surface p-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        {/* Mobile: search + filter-toggle button on one row; selects collapse. */}
        <div className="flex w-full items-center gap-2 sm:hidden">
          <input
            type="search"
            className="input w-full"
            placeholder="Search organisations…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <button
            type="button"
            aria-label="Toggle filters"
            aria-expanded={showMobileFilters}
            onClick={() => setShowMobileFilters((open) => !open)}
            className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border transition ${
              showMobileFilters
                ? "border-txt bg-txt text-white"
                : "border-border bg-bg-surface text-txt-dim hover:text-txt"
            }`}
          >
            <SlidersHorizontal size={16} />
          </button>
        </div>

        {/* Desktop: inline search + both selects. */}
        <div className="hidden w-full flex-col gap-2 sm:flex sm:w-auto sm:flex-row sm:items-center sm:gap-3">
          <input
            type="search"
            className="input w-full sm:!w-auto sm:min-w-[220px]"
            placeholder="Search by name, email or account…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select
            className="input w-full sm:!w-auto sm:min-w-[180px]"
            value={pendingOnly ? "incomplete" : statusFilter}
            onChange={(event) => {
              setPendingOnly(false);
              setStatusFilter(
                event.target.value as "all" | OrganizationSubscriptionRecord["status"],
              );
            }}
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

        {/* Mobile: collapsible filter panel revealed by the toggle button. */}
        {showMobileFilters ? (
          <div className="flex w-full flex-col gap-2 sm:hidden">
            <select
              className="input w-full"
              value={pendingOnly ? "incomplete" : statusFilter}
              onChange={(event) => {
                setPendingOnly(false);
                setStatusFilter(
                  event.target.value as "all" | OrganizationSubscriptionRecord["status"],
                );
              }}
            >
              <option value="all">All statuses</option>
              <option value="trialing">Trialing</option>
              <option value="active">Active</option>
              <option value="past_due">Past due</option>
              <option value="canceled">Canceled</option>
              <option value="incomplete">Incomplete</option>
            </select>
            <select
              className="input w-full"
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
        ) : null}

        <button
          type="button"
          onClick={() => void loadData()}
          disabled={loading}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-accent/40 bg-accent/10 px-3.5 py-1.5 text-sm font-medium text-accent transition hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
        >
          <RefreshCcw size={14} /> Refresh
        </button>
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
              {organizationCards.map(({ organization, subscription, occupiedSeats }) => {
                const plan = plans.find((item) => item.code === subscription?.plan_code);
                const accessState = getSubscriptionAccessState(subscription);
                const daysRemaining = getDaysUntilSubscriptionExpiry(subscription);
                const statusDot = subscriptionStatusDot(subscription);
                const accessDot = statusDotInfo(subscription, accessState);
                const seatTotal = subscription?.seat_count || 0;
                const seatPct = seatTotal > 0 ? Math.min(100, (occupiedSeats / seatTotal) * 100) : 0;
                const seatFull = seatTotal > 0 && occupiedSeats >= seatTotal;
                const hasExpiry = formatSubscriptionExpiry(subscription) !== "No expiry set";
                const expiryShort = hasExpiry
                  ? new Date(
                      subscription?.current_period_end ||
                        subscription?.trial_ends_at ||
                        "",
                    ).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      timeZone: "UTC",
                    })
                  : null;
                const remainingShort =
                  daysRemaining === null
                    ? null
                    : daysRemaining < 0
                      ? `${Math.abs(daysRemaining)}d over`
                      : `${daysRemaining}d`;
                const effectivePlanCode =
                  subscription?.plan_code ||
                  (organization.personal ? "individual-monthly" : "organization-monthly");
                const effectiveSeatCount = organization.personal
                  ? 1
                  : subscription?.seat_count || Math.max(occupiedSeats, 1);
                const orgBusy = busy?.startsWith(`${organization.id}:`);
                return (
                  <div
                    key={organization.id}
                    className="space-y-3 rounded-2xl border border-border bg-bg-surface p-4"
                  >
                    {/* Header: avatar + name/type + plan·interval. */}
                    <div className="flex items-start gap-3">
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${avatarTint(
                          organization.name,
                        )}`}
                      >
                        {orgInitials(organization.name)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-txt">{organization.name}</span>
                          <Badge color={organization.personal ? "ok" : "accent"}>
                            {organization.personal ? "INDIVIDUAL" : "ORG"}
                          </Badge>
                        </div>
                        <div className="mt-0.5 text-xs text-txt-dim">
                          {organization.personal ? "Individual" : "Organization"} ·{" "}
                          {plan?.name || (subscription?.plan_code ? planLabel(subscription.plan_code) : "No plan")}
                        </div>
                      </div>
                    </div>

                    {/* Status row: subscription status dot + access state dot. */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                      <span className={`inline-flex items-center gap-1.5 ${statusDot.className}`}>
                        <span className="h-2 w-2 shrink-0 rounded-full bg-current" />
                        {statusDot.label}
                      </span>
                      <span className={`inline-flex items-center gap-1.5 ${accessDot.className}`}>
                        <span className="h-2 w-2 shrink-0 rounded-full bg-current" />
                        {accessDot.label}
                      </span>
                    </div>

                    {/* Seats / access-until row. */}
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-txt-dim">Seats</div>
                        <div className="mt-0.5 font-mono tabular-nums text-txt">
                          {occupiedSeats}/{seatTotal}
                        </div>
                        <div className="mt-1 h-1 w-16 overflow-hidden rounded-full bg-border">
                          <div
                            className={`h-full rounded-full ${seatFull ? "bg-warn" : "bg-ok"}`}
                            style={{ width: `${seatPct}%` }}
                          />
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-txt-dim">Access until</div>
                        {hasExpiry ? (
                          <div className="mt-0.5 text-txt">
                            {expiryShort}
                            {remainingShort ? (
                              <span className={`ml-1 ${remainingUrgencyClass(daysRemaining)}`}>
                                · {remainingShort}
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <div className="mt-0.5 text-txt-dim">
                            —
                            <span className="ml-1 text-txt-dim">Awaiting activation</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Primary activate button + overflow opens the bottom sheet. */}
                    <div className="flex items-center gap-2">
                      <Button
                        variant="success"
                        size="sm"
                        className="flex-1 justify-center"
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
                        <Play size={13} /> {organization.personal ? "Activate trial" : "Activate 30d"}
                      </Button>
                      <button
                        type="button"
                        aria-label="More actions"
                        disabled={orgBusy}
                        onClick={(event) => {
                          event.stopPropagation();
                          setMenuOrgId(organization.id);
                        }}
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-bg-surface text-txt-dim transition hover:bg-bg-hover hover:text-txt disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <MoreHorizontal size={16} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop: tabular layout. overflow-visible so the row action
                menu can escape the shell without being clipped. */}
            <div className="hidden data-table-shell !overflow-visible sm:block">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Organisation</th>
                    <th>Plan</th>
                    <th>Status &amp; access</th>
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
                    const owner = organization.owner_id ? profilesById[organization.owner_id] : undefined;
                    const dot = statusDotInfo(subscription, accessState);
                    const seatTotal = subscription?.seat_count || 0;
                    const seatPct = seatTotal > 0 ? Math.min(100, (occupiedSeats / seatTotal) * 100) : 0;
                    const seatFull = seatTotal > 0 && occupiedSeats >= seatTotal;
                    const hasExpiry = formatSubscriptionExpiry(subscription) !== "No expiry set";
                    // Days-left percentage against a 30-day horizon for the bar.
                    const expiryPct =
                      daysRemaining === null
                        ? 0
                        : Math.max(0, Math.min(100, (daysRemaining / 30) * 100));
                    return (
                      <tr key={organization.id}>
                        <td className="data-cell-wrap">
                          <div className="flex items-center gap-3">
                            <span
                              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${avatarTint(
                                organization.name,
                              )}`}
                            >
                              {orgInitials(organization.name)}
                            </span>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-semibold text-txt">{organization.name}</span>
                                <Badge color={organization.personal ? "ok" : "accent"}>
                                  {organization.personal ? "INDIVIDUAL" : "ORG"}
                                </Badge>
                              </div>
                              <div className="mt-0.5 text-xs text-txt-dim">
                                {owner?.email ? (
                                  <a href={`mailto:${owner.email}`} className="hover:text-accent hover:underline">
                                    {owner.email}
                                  </a>
                                ) : (
                                  "—"
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="data-cell-wrap">
                          <div className="text-txt">
                            {plan?.name || (subscription?.plan_code ? planLabel(subscription.plan_code) : "Not set")}
                          </div>
                          <div className="text-xs text-txt-dim">Monthly</div>
                        </td>
                        <td>
                          <span className={`inline-flex items-center gap-1.5 text-sm ${dot.className}`}>
                            <span className="h-2 w-2 shrink-0 rounded-full bg-current" />
                            {dot.label}
                          </span>
                        </td>
                        <td className="data-cell-num">
                          <div className="font-mono tabular-nums text-txt">
                            {occupiedSeats}/{seatTotal}
                          </div>
                          <div className="mt-1 h-1 w-16 overflow-hidden rounded-full bg-border">
                            <div
                              className={`h-full rounded-full ${seatFull ? "bg-warn" : "bg-ok"}`}
                              style={{ width: `${seatPct}%` }}
                            />
                          </div>
                        </td>
                        <td className="data-cell-num">{activeMembers}</td>
                        <td className="data-cell-num">{pendingInvites}</td>
                        <td className="data-cell-wrap">
                          {hasExpiry ? (
                            <>
                              <div className="text-txt">{formatSubscriptionExpiry(subscription)}</div>
                              <div className="mt-1 h-1 w-24 overflow-hidden rounded-full bg-border">
                                <div
                                  className={`h-full rounded-full ${remainingBarClass(daysRemaining)}`}
                                  style={{ width: `${expiryPct}%` }}
                                />
                              </div>
                              <div className={`mt-1 text-xs ${remainingUrgencyClass(daysRemaining)}`}>
                                {formatRemaining(daysRemaining)}
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="text-txt-dim">No expiry set</div>
                              <div className="text-xs text-txt-dim">Awaiting activation</div>
                            </>
                          )}
                        </td>
                        <td>{renderOrgActions({ organization, subscription, occupiedSeats })}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Footer: result count + last-sync indicator. */}
            <div className="flex flex-col gap-1 px-1 pt-1 text-xs text-txt-dim sm:flex-row sm:items-center sm:justify-between">
              <span>
                Showing {organizationCards.length} of {organizations.length} organisations
              </span>
              <span>Last synced {formatRelativeTime(lastSyncedAt)}</span>
            </div>
          </>
        ) : null}
      </div>

      {/* Mobile action sheet — bottom sheet alternative to the desktop dropdown.
          Driven by the same menuOrgId so both stay in sync. */}
      {menuOrgId
        ? (() => {
            const card = organizationCards.find(
              (item) => item.organization.id === menuOrgId,
            );
            if (!card) return null;
            const { organization, subscription, occupiedSeats } = card;
            const accessState = getSubscriptionAccessState(subscription);
            const statusDot = subscriptionStatusDot(subscription);
            const accessDot = statusDotInfo(subscription, accessState);
            const effectivePlanCode =
              subscription?.plan_code ||
              (organization.personal ? "individual-monthly" : "organization-monthly");
            const effectiveSeatCount = organization.personal
              ? 1
              : subscription?.seat_count || Math.max(occupiedSeats, 1);
            const orgBusy = busy?.startsWith(`${organization.id}:`);
            const rowClass =
              "flex w-full items-center gap-3 px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-40";
            const iconWrap =
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg";
            return (
              <div className="sm:hidden">
                <div
                  className="fixed inset-0 z-40 bg-black/40"
                  onClick={() => setMenuOrgId(null)}
                />
                <div className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-2xl border-t border-border bg-bg-surface pb-[env(safe-area-inset-bottom)]">
                  <div className="flex justify-center pt-3">
                    <span className="h-1 w-10 rounded-full bg-border" />
                  </div>

                  {/* Header: avatar + name + status dots. */}
                  <div className="flex items-center gap-3 px-4 py-3">
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${avatarTint(
                        organization.name,
                      )}`}
                    >
                      {orgInitials(organization.name)}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-txt">{organization.name}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
                        <span className={`inline-flex items-center gap-1.5 ${statusDot.className}`}>
                          <span className="h-2 w-2 shrink-0 rounded-full bg-current" />
                          {statusDot.label}
                        </span>
                        <span className={`inline-flex items-center gap-1.5 ${accessDot.className}`}>
                          <span className="h-2 w-2 shrink-0 rounded-full bg-current" />
                          {accessDot.label}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-border" />

                  {/* Action rows — same handlers as the desktop dropdown. */}
                  <button
                    type="button"
                    disabled={orgBusy}
                    onClick={() => {
                      setMenuOrgId(null);
                      handleQuickUpdate({
                        organizationId: organization.id,
                        planCode: effectivePlanCode,
                        status: "active",
                        seatCount: effectiveSeatCount,
                        days: 30,
                      });
                    }}
                    className={`${rowClass} bg-ok/10`}
                  >
                    <span className={`${iconWrap} bg-ok/10 text-ok`}>
                      <Play size={16} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-ok">
                        {organization.personal ? "Activate 1-month trial" : "Activate 1 month"}
                      </span>
                      <span className="block text-xs text-txt-dim">Grant 30 days of full access</span>
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={orgBusy}
                    onClick={() => {
                      setMenuOrgId(null);
                      handleQuickUpdate({
                        organizationId: organization.id,
                        planCode: effectivePlanCode,
                        status: subscription?.status === "trialing" ? "trialing" : "active",
                        seatCount: effectiveSeatCount,
                        days: 90,
                      });
                    }}
                    className={rowClass}
                  >
                    <span className={`${iconWrap} bg-bg text-txt-dim`}>
                      <CalendarClock size={16} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-txt">Extend access 90 days</span>
                      <span className="block text-xs text-txt-dim">Push the expiry date out</span>
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setMenuOrgId(null);
                      openEditor(
                        organization,
                        subscription,
                        occupiedSeats,
                        effectivePlanCode,
                        effectiveSeatCount,
                      );
                    }}
                    className={rowClass}
                  >
                    <span className={`${iconWrap} bg-bg text-txt-dim`}>
                      <Pencil size={16} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-txt">Edit seats &amp; access</span>
                      <span className="block text-xs text-txt-dim">Change limits and members</span>
                    </span>
                  </button>

                  <div className="border-t border-border" />

                  <button
                    type="button"
                    disabled={orgBusy}
                    onClick={() => {
                      setMenuOrgId(null);
                      handleQuickUpdate({
                        organizationId: organization.id,
                        planCode: effectivePlanCode,
                        status: "past_due",
                        seatCount: effectiveSeatCount,
                        days: -1,
                      });
                    }}
                    className={rowClass}
                  >
                    <span className={`${iconWrap} bg-warn/10 text-warn`}>
                      <Ban size={16} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-warn">Suspend organisation</span>
                      <span className="block text-xs text-txt-dim">Pause access immediately</span>
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={orgBusy}
                    onClick={() => {
                      setMenuOrgId(null);
                      handleQuickUpdate({
                        organizationId: organization.id,
                        planCode: effectivePlanCode,
                        status: "canceled",
                        seatCount: effectiveSeatCount,
                        days: -1,
                      });
                    }}
                    className={rowClass}
                  >
                    <span className={`${iconWrap} bg-err/10 text-err`}>
                      <XCircle size={16} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-err">Cancel subscription</span>
                      <span className="block text-xs text-txt-dim">End billing and revoke access</span>
                    </span>
                  </button>

                  <div className="border-t border-border p-3">
                    <Button
                      variant="ghost"
                      className="w-full justify-center"
                      onClick={() => setMenuOrgId(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </div>
            );
          })()
        : null}

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
