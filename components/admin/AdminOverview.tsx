"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  Building2,
  CreditCard,
  FolderKanban,
  Gauge,
  Layers,
  RefreshCcw,
  TrendingUp,
  Users,
} from "lucide-react";

import {
  fetchPlatformMetrics,
  type ModuleUsage,
  type PlatformMetrics,
  type TrendPoint,
} from "@/lib/admin-metrics";

const REFRESH_MS = 30_000;

const fmt = (value: number) => new Intl.NumberFormat("en-US").format(value);

const shortDate = (isoDate: string) =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(`${isoDate}T00:00:00Z`),
  );

// Dependency-free sparkline: thin bars scaled to the series max. Tinted via the
// parent's text color (currentColor).
function Sparkbars({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  const barW = 3;
  const gap = 1;
  const width = values.length * (barW + gap);
  return (
    <svg
      viewBox={`0 0 ${width} 40`}
      preserveAspectRatio="none"
      className="h-12 w-full"
      role="img"
      aria-label="30-day trend"
    >
      {values.map((value, index) => {
        const barH = (value / max) * 36;
        return (
          <rect
            key={index}
            x={index * (barW + gap)}
            y={38 - barH}
            width={barW}
            height={Math.max(value > 0 ? 1.5 : 0, barH)}
            rx={1}
            fill="currentColor"
            opacity={value > 0 ? 0.85 : 0.18}
          />
        );
      })}
    </svg>
  );
}

// A 30-day growth card: big total + sparkline + busiest day.
function TrendCard({
  label,
  trend,
  pick,
  tone,
}: {
  label: string;
  trend: TrendPoint[];
  pick: (point: TrendPoint) => number;
  tone: "accent" | "ok";
}) {
  const values = trend.map(pick);
  const total = values.reduce((sum, value) => sum + value, 0);
  const peakIndex = values.reduce((best, value, index) => (value > values[best] ? index : best), 0);
  const peak = values[peakIndex] ?? 0;
  const toneClass = tone === "ok" ? "text-ok" : "text-accent";
  return (
    <div className="rounded-xl border border-border bg-bg-surface px-4 py-3">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium uppercase tracking-[0.08em] text-txt-dim">{label}</span>
        <span className={`text-lg font-semibold tabular-nums ${toneClass}`}>{fmt(total)}</span>
      </div>
      <div className={`mt-1.5 ${toneClass}`}>
        <Sparkbars values={values} />
      </div>
      <div className="mt-1 text-xs text-txt-muted">
        {peak > 0 ? `Peak ${fmt(peak)} on ${shortDate(trend[peakIndex].date)}` : "No activity in the last 30 days"}
      </div>
    </div>
  );
}

// Horizontal usage bars for the busiest workspace modules (last 24h).
function ModuleBars({ usage }: { usage: ModuleUsage[] }) {
  if (usage.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-txt-muted">
        No active sessions in the last 24 hours.
      </div>
    );
  }
  const max = Math.max(1, ...usage.map((entry) => entry.users));
  return (
    <div className="space-y-2 rounded-xl border border-border bg-bg-surface px-4 py-3">
      {usage.map((entry) => (
        <div key={entry.module} className="flex items-center gap-3">
          <span className="w-28 shrink-0 truncate text-sm text-txt">{entry.module}</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-bg-hover">
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${(entry.users / max) * 100}%` }}
            />
          </div>
          <span className="w-8 shrink-0 text-right text-sm tabular-nums text-txt-muted">{fmt(entry.users)}</span>
        </div>
      ))}
    </div>
  );
}

function relativeTime(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  return `${minutes}m ago`;
}

// A single stat tile. `tone` tints the value for status-flavoured numbers.
function Stat({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: number | string;
  hint?: string;
  tone?: "default" | "ok" | "warn" | "err" | "accent";
}) {
  const toneClass =
    tone === "ok"
      ? "text-ok"
      : tone === "warn"
        ? "text-warn"
        : tone === "err"
          ? "text-err"
          : tone === "accent"
            ? "text-accent"
            : "text-txt";
  return (
    <div className="rounded-xl border border-border bg-bg-surface px-4 py-3">
      <div className="text-xs font-medium uppercase tracking-[0.08em] text-txt-dim">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</div>
      {hint ? <div className="mt-0.5 text-xs text-txt-muted">{hint}</div> : null}
    </div>
  );
}

function Section({ icon: Icon, title, children }: { icon: typeof Users; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-semibold text-txt">
        <Icon size={15} className="text-txt-muted" />
        {title}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{children}</div>
    </div>
  );
}

// Platform-usage overview for admins: how many users/projects exist, who's
// online right now, and the state of subscriptions. Polls every 30s while the
// tab is mounted so the "online now" figure stays live; pause with the toggle.
export default function AdminOverview() {
  const [metrics, setMetrics] = useState<PlatformMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [live, setLive] = useState(true);
  const liveRef = useRef(live);
  liveRef.current = live;

  const load = useCallback(async () => {
    const result = await fetchPlatformMetrics();
    if (result) {
      setMetrics(result);
      setUnavailable(false);
    } else {
      setUnavailable(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      if (liveRef.current) void load();
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  if (unavailable) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-txt">Platform usage</h2>
        <div className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-txt-muted">
          Live usage metrics need a connected Supabase backend. In demo mode there’s no shared database to aggregate.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-txt">Platform usage</h2>
          <p className="mt-1 text-sm text-txt-muted">
            How the platform is being used across every account — refreshed automatically.
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs font-medium text-txt-muted">
          <input type="checkbox" checked={live} onChange={(event) => setLive(event.target.checked)} />
          Live
        </label>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent/10 px-3.5 py-2 text-sm font-medium text-accent transition hover:bg-accent/20"
        >
          <RefreshCcw size={14} /> Refresh
        </button>
      </div>

      {loading && !metrics ? (
        <div className="rounded-2xl border border-border bg-bg-surface px-4 py-5 text-sm text-txt-muted">
          Loading platform metrics…
        </div>
      ) : metrics ? (
        <div className="space-y-6">
          {/* Live highlights */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-xl border border-ok/30 bg-ok/5 px-4 py-3">
              <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.08em] text-txt-dim">
                <span className="relative flex h-2 w-2">
                  {metrics.presence.onlineNow > 0 ? (
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ok opacity-75" />
                  ) : null}
                  <span
                    className={`relative inline-flex h-2 w-2 rounded-full ${
                      metrics.presence.onlineNow > 0 ? "bg-ok" : "bg-txt-dim"
                    }`}
                  />
                </span>
                Online now
              </div>
              <div className="mt-1 text-2xl font-semibold tabular-nums text-ok">{fmt(metrics.presence.onlineNow)}</div>
              <div className="mt-0.5 text-xs text-txt-muted">{fmt(metrics.presence.activeToday)} active today</div>
            </div>
            <Stat label="Total users" value={fmt(metrics.users.total)} hint={`${fmt(metrics.users.new7d)} new this week`} />
            <Stat
              label="Total projects"
              value={fmt(metrics.projects.total)}
              hint={`${fmt(metrics.projects.new7d)} new this week`}
            />
            <Stat
              label="Organizations"
              value={fmt(metrics.organizations.total)}
              hint={`${fmt(metrics.organizations.team)} team · ${fmt(metrics.organizations.personal)} personal`}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-txt">
              <TrendingUp size={15} className="text-txt-muted" />
              Growth · last 30 days
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <TrendCard label="New users" trend={metrics.trend} pick={(p) => p.users} tone="accent" />
              <TrendCard label="New projects" trend={metrics.trend} pick={(p) => p.projects} tone="ok" />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-txt">
              <Gauge size={15} className="text-txt-muted" />
              Module activity · last 24 hours
            </div>
            <ModuleBars usage={metrics.moduleUsage} />
          </div>

          <Section icon={Users} title="Users">
            <Stat label="Total" value={fmt(metrics.users.total)} />
            <Stat label="Admins" value={fmt(metrics.users.admins)} tone="accent" />
            <Stat label="New · 7 days" value={fmt(metrics.users.new7d)} />
            <Stat label="New · 30 days" value={fmt(metrics.users.new30d)} />
          </Section>

          <Section icon={FolderKanban} title="Projects">
            <Stat label="Total" value={fmt(metrics.projects.total)} />
            <Stat label="New · 7 days" value={fmt(metrics.projects.new7d)} />
            <Stat label="New · 30 days" value={fmt(metrics.projects.new30d)} />
            <Stat
              label="Construction"
              value={fmt(metrics.projects.construction)}
              hint={`${fmt(metrics.projects.nonConstruction)} non-construction`}
            />
          </Section>

          <Section icon={Building2} title="Organizations">
            <Stat label="Total" value={fmt(metrics.organizations.total)} />
            <Stat label="Team" value={fmt(metrics.organizations.team)} />
            <Stat label="Personal" value={fmt(metrics.organizations.personal)} />
            <Stat label="Programs" value={fmt(metrics.programs)} />
          </Section>

          <Section icon={Layers} title="Shared content">
            <Stat label="Drawing warehouse" value={fmt(metrics.library.drawings)} />
            <Stat label="BOQ library" value={fmt(metrics.library.boq)} />
          </Section>

          <Section icon={CreditCard} title="Subscriptions">
            <Stat label="Active" value={fmt(metrics.subscriptions.active)} tone="ok" />
            <Stat label="Trialing" value={fmt(metrics.subscriptions.trialing)} tone="accent" />
            <Stat label="Incomplete" value={fmt(metrics.subscriptions.incomplete)} tone="warn" />
            <Stat label="Past due" value={fmt(metrics.subscriptions.pastDue)} tone="err" />
            <Stat label="Canceled" value={fmt(metrics.subscriptions.canceled)} />
            <Stat label="Purchased seats" value={fmt(metrics.subscriptions.totalSeats)} />
          </Section>

          <div className="flex items-center gap-1.5 text-xs text-txt-dim">
            <Activity size={12} />
            Updated {relativeTime(metrics.generatedAt)}
            {live ? " · live" : " · paused"}
          </div>
        </div>
      ) : null}
    </div>
  );
}
