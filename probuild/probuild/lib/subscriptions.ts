import type { OrganizationSubscriptionRecord } from "@/lib/supabase";

export type SubscriptionAccessState = "active" | "expiring" | "expired" | "inactive";

const ACTIVE_STATUSES = new Set<OrganizationSubscriptionRecord["status"]>([
  "active",
  "trialing",
]);

export function getSubscriptionExpiryDate(
  subscription?: OrganizationSubscriptionRecord | null,
) {
  if (!subscription) return null;
  const value =
    subscription.status === "trialing"
      ? subscription.trial_ends_at || subscription.current_period_end
      : subscription.current_period_end || subscription.trial_ends_at;
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getDaysUntilSubscriptionExpiry(
  subscription?: OrganizationSubscriptionRecord | null,
  now = new Date(),
) {
  const expiry = getSubscriptionExpiryDate(subscription);
  if (!expiry) return null;
  return Math.ceil((expiry.getTime() - now.getTime()) / 86_400_000);
}

export function isSubscriptionUsable(
  subscription?: OrganizationSubscriptionRecord | null,
  now = new Date(),
) {
  if (!subscription || !ACTIVE_STATUSES.has(subscription.status)) return false;
  const daysRemaining = getDaysUntilSubscriptionExpiry(subscription, now);
  return daysRemaining === null || daysRemaining >= 0;
}

export function getSubscriptionAccessState(
  subscription?: OrganizationSubscriptionRecord | null,
  now = new Date(),
): SubscriptionAccessState {
  if (!subscription) return "inactive";
  const daysRemaining = getDaysUntilSubscriptionExpiry(subscription, now);

  if (!ACTIVE_STATUSES.has(subscription.status)) {
    return subscription.status === "past_due" ? "expired" : "inactive";
  }

  if (daysRemaining !== null && daysRemaining < 0) return "expired";
  if (daysRemaining !== null && daysRemaining <= 7) return "expiring";
  return "active";
}

export function formatSubscriptionExpiry(subscription?: OrganizationSubscriptionRecord | null) {
  const expiry = getSubscriptionExpiryDate(subscription);
  if (!expiry) return "No expiry set";
  return expiry.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function subscriptionStateLabel(state: SubscriptionAccessState) {
  if (state === "active") return "Active";
  if (state === "expiring") return "Expiring soon";
  if (state === "expired") return "Expired";
  return "Inactive";
}

export function subscriptionBadgeColor(state: SubscriptionAccessState) {
  if (state === "active") return "ok" as const;
  if (state === "expiring") return "warn" as const;
  if (state === "expired") return "err" as const;
  return "purple" as const;
}

export function dateInputFromNow(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function isoFromDateInput(value?: string | null) {
  if (!value) return null;
  const date = new Date(`${value}T23:59:59.999`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
