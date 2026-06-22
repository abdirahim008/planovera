// Platform-wide usage metrics for the admin console "Overview" tab.
//
// Everything here is read on demand (only when an admin opens the tab) and uses
// `head: true` count queries — Postgres returns just the count, no rows — so the
// dashboard stays light even on a large database. Admin RLS already exposes
// every row to platform admins (each select policy ORs in `public.is_admin()`),
// so these aggregate straight off the existing tables; no schema migration and
// no security-definer RPC needed.

import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase-browser";

// One day in the 30-day creation trend: ISO date (YYYY-MM-DD) + that day's new
// signups and new projects.
export interface TrendPoint {
  date: string;
  users: number;
  projects: number;
}

// Distinct recent users per workspace module (from presence heartbeats).
export interface ModuleUsage {
  module: string;
  users: number;
}

export interface PlatformMetrics {
  users: { total: number; admins: number; new7d: number; new30d: number };
  projects: { total: number; new7d: number; new30d: number; construction: number; nonConstruction: number };
  organizations: { total: number; team: number; personal: number };
  programs: number;
  library: { drawings: number; boq: number };
  // Live collaboration presence, derived from the same heartbeat the workspace
  // writes (`project_presence.last_seen_at` / `active_module`).
  presence: { onlineNow: number; activeToday: number };
  subscriptions: {
    active: number;
    trialing: number;
    pastDue: number;
    incomplete: number;
    canceled: number;
    totalSeats: number;
  };
  // Daily new users + projects over the last 30 days (oldest → newest).
  trend: TrendPoint[];
  // Where recently-active users are spending time, busiest first.
  moduleUsage: ModuleUsage[];
  generatedAt: string;
}

const TREND_DAYS = 30;

// Pretty labels for the workspace module keys stored in presence.active_module.
const MODULE_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  boq: "BOQ",
  payment: "Payments",
  payments: "Payments",
  workplan: "Work plan",
  progress: "Progress",
  documents: "Documents",
  correspondence: "Correspondence",
  checklist: "Checklist",
  "site-notes": "Site notes",
  siteNotes: "Site notes",
  meetings: "Meetings",
  drawings: "Drawings",
  organization: "Organization",
};

const moduleLabel = (key: string) =>
  MODULE_LABELS[key] ?? key.replace(/[-_]/g, " ").replace(/^\w/, (c) => c.toUpperCase());

// UTC day key (YYYY-MM-DD) for bucketing timestamps.
const dayKey = (iso: string | number | Date) => new Date(iso).toISOString().slice(0, 10);

// Build the last `TREND_DAYS` day keys, oldest → newest, anchored to today.
function buildTrendBuckets(): Map<string, TrendPoint> {
  const buckets = new Map<string, TrendPoint>();
  for (let i = TREND_DAYS - 1; i >= 0; i -= 1) {
    const key = dayKey(Date.now() - i * DAY_MS);
    buckets.set(key, { date: key, users: 0, projects: 0 });
  }
  return buckets;
}

const ONLINE_WINDOW_MS = 2 * 60 * 1000; // "online now" — seen in the last 2 min
const DAY_MS = 24 * 60 * 60 * 1000;

const isoAgo = (ms: number) => new Date(Date.now() - ms).toISOString();

type SupabaseClient = NonNullable<ReturnType<typeof getSupabaseBrowserClient>>;

// Count rows with an optional filter, fetching only the count (head: true).
// Tolerates errors (e.g. a table absent on an older schema) by returning 0 so a
// single missing table never blanks the whole dashboard.
async function countRows(
  supabase: SupabaseClient,
  table: string,
  build?: (query: any) => any,
): Promise<number> {
  try {
    let query = supabase.from(table).select("*", { count: "exact", head: true });
    if (build) query = build(query);
    const { count, error } = await query;
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Aggregate platform usage for the admin Overview. Returns null in demo mode /
 * when Supabase isn't configured (the caller renders a "connect Supabase" hint).
 * All independent counts run in parallel — a couple of round-trips of tiny
 * head-only queries.
 */
export async function fetchPlatformMetrics(): Promise<PlatformMetrics | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;

  const since7d = isoAgo(7 * DAY_MS);
  const since30d = isoAgo(TREND_DAYS * DAY_MS);

  const [
    usersTotal,
    usersAdmins,
    projectsTotal,
    projectsConstruction,
    projectsNonConstruction,
    orgsTotal,
    orgsPersonal,
    programs,
    libraryDrawings,
    libraryBoq,
    subscriptionRows,
    presenceRows,
    userCreatedRows,
    projectCreatedRows,
  ] = await Promise.all([
    countRows(supabase, "profiles"),
    countRows(supabase, "profiles", (q) => q.eq("role", "admin")),
    countRows(supabase, "projects"),
    countRows(supabase, "projects", (q) => q.eq("type", "construction")),
    countRows(supabase, "projects", (q) => q.eq("type", "non-construction")),
    countRows(supabase, "organizations"),
    countRows(supabase, "organizations", (q) => q.eq("personal", true)),
    countRows(supabase, "programs"),
    countRows(supabase, "drawing_library_items"),
    countRows(supabase, "boq_library_items"),
    supabase.from("organization_subscriptions").select("status, seat_count"),
    supabase
      .from("project_presence")
      .select("user_id, last_seen_at, active_module")
      .gte("last_seen_at", isoAgo(DAY_MS)),
    // 30-day creation timestamps drive both the trend chart and the 7d/30d
    // "new" figures — one column, last 30 days, so we skip four count queries.
    supabase.from("profiles").select("created_at").gte("created_at", since30d),
    supabase.from("projects").select("created_at").gte("created_at", since30d),
  ]);

  // Tally subscriptions by status + total purchased seats (small: one row/org).
  const subscriptions = { active: 0, trialing: 0, pastDue: 0, incomplete: 0, canceled: 0, totalSeats: 0 };
  for (const row of (subscriptionRows.data ?? []) as Array<{ status: string; seat_count: number | null }>) {
    subscriptions.totalSeats += row.seat_count ?? 0;
    if (row.status === "active") subscriptions.active += 1;
    else if (row.status === "trialing") subscriptions.trialing += 1;
    else if (row.status === "past_due") subscriptions.pastDue += 1;
    else if (row.status === "incomplete") subscriptions.incomplete += 1;
    else if (row.status === "canceled") subscriptions.canceled += 1;
  }

  // Distinct users seen in the last 24h (active today) and last 2 min (online),
  // plus distinct users per workspace module they were last active in.
  const onlineThreshold = Date.now() - ONLINE_WINDOW_MS;
  const activeToday = new Set<string>();
  const onlineNow = new Set<string>();
  const moduleUsers = new Map<string, Set<string>>();
  for (const row of (presenceRows.data ?? []) as Array<{
    user_id: string;
    last_seen_at: string;
    active_module: string | null;
  }>) {
    activeToday.add(row.user_id);
    if (new Date(row.last_seen_at).getTime() >= onlineThreshold) onlineNow.add(row.user_id);
    const key = row.active_module?.trim();
    if (key) {
      if (!moduleUsers.has(key)) moduleUsers.set(key, new Set());
      moduleUsers.get(key)!.add(row.user_id);
    }
  }
  const moduleUsage: ModuleUsage[] = Array.from(moduleUsers.entries())
    .map(([key, users]) => ({ module: moduleLabel(key), users: users.size }))
    .sort((a, b) => b.users - a.users);

  // Bucket the 30-day creation timestamps into the daily trend, and derive the
  // 7d/30d "new" figures from the same rows (no extra count queries).
  const since7dMs = Date.now() - 7 * DAY_MS;
  const trendBuckets = buildTrendBuckets();
  let usersNew7d = 0;
  let usersNew30d = 0;
  for (const row of (userCreatedRows.data ?? []) as Array<{ created_at: string }>) {
    usersNew30d += 1;
    if (new Date(row.created_at).getTime() >= since7dMs) usersNew7d += 1;
    const bucket = trendBuckets.get(dayKey(row.created_at));
    if (bucket) bucket.users += 1;
  }
  let projectsNew7d = 0;
  let projectsNew30d = 0;
  for (const row of (projectCreatedRows.data ?? []) as Array<{ created_at: string }>) {
    projectsNew30d += 1;
    if (new Date(row.created_at).getTime() >= since7dMs) projectsNew7d += 1;
    const bucket = trendBuckets.get(dayKey(row.created_at));
    if (bucket) bucket.projects += 1;
  }
  const trend = Array.from(trendBuckets.values());

  return {
    users: { total: usersTotal, admins: usersAdmins, new7d: usersNew7d, new30d: usersNew30d },
    projects: {
      total: projectsTotal,
      new7d: projectsNew7d,
      new30d: projectsNew30d,
      construction: projectsConstruction,
      nonConstruction: projectsNonConstruction,
    },
    organizations: { total: orgsTotal, team: Math.max(0, orgsTotal - orgsPersonal), personal: orgsPersonal },
    programs,
    library: { drawings: libraryDrawings, boq: libraryBoq },
    presence: { onlineNow: onlineNow.size, activeToday: activeToday.size },
    subscriptions,
    trend,
    moduleUsage,
    generatedAt: new Date().toISOString(),
  };
}
