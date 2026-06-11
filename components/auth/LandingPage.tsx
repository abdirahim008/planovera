import Image from "next/image";

import LandingSignOut from "@/components/auth/LandingSignOut";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  FileText,
  LayoutDashboard,
  Link2,
  MapPinned,
  PencilRuler,
  ShieldCheck,
} from "lucide-react";

const moduleCards = [
  {
    label: "Portfolio",
    description: "Live dashboards across every project and programme.",
    icon: LayoutDashboard,
  },
  {
    label: "BOQ",
    description: "Spreadsheet-grade bills of quantities with Excel import.",
    icon: FileText,
  },
  {
    label: "Progress",
    description: "Planned-versus-actual tracking with earned value.",
    icon: CheckCircle2,
  },
  {
    label: "Payments",
    description: "FIDIC-style certificates, retention and advance recovery.",
    icon: ShieldCheck,
  },
  {
    label: "Documents",
    description: "Generate, store and version project paperwork.",
    icon: ClipboardList,
  },
  {
    label: "Project map",
    description: "Geo-locate sites and visualise your portfolio.",
    icon: MapPinned,
  },
];

const valueProps = [
  {
    title: "One source of truth",
    description:
      "BOQs, payments, progress and documents stay linked, so the numbers reconcile automatically across every report.",
    icon: Link2,
  },
  {
    title: "Built for the field",
    description:
      "Site notes, checklists, correspondence and meeting minutes capture the work where it actually happens.",
    icon: ClipboardList,
  },
  {
    title: "Drawings included",
    description:
      "An integrated technical drawing studio is built in, so there is no separate CAD tool to license or learn.",
    icon: PencilRuler,
  },
];

export default function LandingPage({ authenticated = false }: { authenticated?: boolean }) {
  // When the visitor already has a live session, point every call-to-action at
  // the workspace instead of bouncing through /login (which would just redirect
  // back to the dashboard). Logged-out visitors get the real sign-in / sign-up.
  const enterHref = authenticated ? "/workspace" : "/login";
  const signupHref = authenticated ? "/workspace" : "/login?mode=signup";
  return (
    <main className="relative min-h-screen overflow-hidden bg-bg text-txt">
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(rgba(37,99,235,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(37,99,235,0.05)_1px,transparent_1px)] bg-[size:64px_64px]" />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(37,99,235,0.10),transparent_32%),radial-gradient(circle_at_86%_18%,rgba(20,184,166,0.08),transparent_28%),linear-gradient(180deg,rgba(245,246,248,0.15),#f5f6f8_88%)]" />

      <div className="relative mx-auto w-full max-w-7xl px-5 sm:px-8 lg:px-10">
        <header className="flex flex-wrap items-center justify-between gap-4 py-6">
          <a href="/" className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-white shadow-xl shadow-blue-950/30">
              <Image
                src="/brand/planovera-mark.png"
                alt="Planovera"
                width={36}
                height={36}
                className="h-9 w-9 object-contain"
                priority
              />
            </span>
            <span>
              <span className="block text-xl font-extrabold tracking-tight text-txt">Planovera</span>
              <span className="block text-[11px] font-semibold uppercase tracking-[0.32em] text-accent">
                Project controls
              </span>
            </span>
          </a>

          <nav className="flex items-center gap-3">
            {authenticated ? (
              <>
                <LandingSignOut className="rounded-2xl border border-border bg-bg-surface px-5 py-3 text-sm font-semibold text-txt transition hover:border-accent/50 hover:bg-bg-hover disabled:opacity-60" />
                <a
                  href="/workspace"
                  className="rounded-2xl bg-blue-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 transition hover:bg-blue-400"
                >
                  Go to workspace
                </a>
              </>
            ) : (
              <>
                <a
                  href={enterHref}
                  className="rounded-2xl border border-border bg-bg-surface px-5 py-3 text-sm font-semibold text-txt transition hover:border-accent/50 hover:bg-bg-hover"
                >
                  Sign in
                </a>
                <a
                  href={signupHref}
                  className="rounded-2xl bg-blue-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 transition hover:bg-blue-400"
                >
                  Create account
                </a>
              </>
            )}
          </nav>
        </header>

        <section className="grid items-center gap-10 py-12 lg:grid-cols-[0.82fr_1.18fr] lg:py-16">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-300/20 bg-blue-400/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-accent">
              <span className="h-2 w-2 rounded-full bg-blue-400" />
              Built for project delivery teams
            </div>

            <h1 className="mt-7 text-4xl font-bold leading-[1.05] tracking-[-0.02em] text-txt sm:text-5xl lg:text-[3.5rem]">
              Project delivery{" "}
              <span className="bg-gradient-to-r from-blue-400 to-teal-300 bg-clip-text text-transparent">
                command centre
              </span>{" "}
              for serious field teams.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-8 text-txt-muted sm:text-lg">
              Planovera gives NGOs, government agencies, consultants, and contractors one operating system for BOQs,
              progress, payments, meetings, documents, compliance, field notes, and technical drawings.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href={signupHref}
                className="inline-flex items-center gap-2 rounded-2xl bg-blue-500 px-6 py-3.5 text-sm font-semibold text-white shadow-xl shadow-blue-500/25 transition hover:bg-blue-400"
              >
                Start with Planovera
                <ArrowRight size={16} />
              </a>
              <a
                href={enterHref}
                className="rounded-2xl border border-border bg-bg-surface px-6 py-3.5 text-sm font-semibold text-txt transition hover:border-accent/40 hover:bg-bg-hover"
              >
                Open workspace
              </a>
            </div>

            <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3 text-[13px] font-medium text-txt-muted">
              {["BOQ & payments", "Progress & earned value", "Drawings studio"].map((item) => (
                <span key={item} className="inline-flex items-center gap-2">
                  <CheckCircle2 size={15} className="text-teal-300" />
                  {item}
                </span>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-8 rounded-[3rem] bg-blue-500/12 blur-3xl" />
            <div className="relative overflow-hidden rounded-[2rem] border border-border bg-bg-surface p-3 shadow-2xl shadow-black/10">
              {/* Hand-built, light-themed mockup of the real project overview so the
                  hero always matches the actual product UI (the old asset was a
                  dark-themed screenshot the app never ships). Pure CSS/SVG — no image. */}
              <div
                aria-hidden
                className="pointer-events-none relative flex min-h-[420px] select-none overflow-hidden rounded-[1.4rem] border border-border bg-bg lg:min-h-[560px]"
              >
                {/* Sidebar */}
                <div className="hidden w-[136px] shrink-0 flex-col border-r border-border bg-bg-surface px-3 py-4 sm:flex">
                  <div className="flex items-center gap-2">
                    <Image
                      src="/brand/planovera-mark.png"
                      alt=""
                      width={22}
                      height={22}
                      className="h-[22px] w-[22px] rounded-md object-contain"
                    />
                    <span className="text-[11px] font-bold tracking-tight text-txt">Planovera</span>
                  </div>
                  <div className="mt-5 space-y-1">
                    {["Overview", "BOQ", "Progress", "Payments", "Work Plan", "Drawings", "Documents", "Checklist"].map(
                      (item, index) => (
                        <div
                          key={item}
                          className={`rounded-md px-2.5 py-1.5 text-[10px] font-medium ${
                            index === 0 ? "bg-accent/10 text-accent" : "text-txt-muted"
                          }`}
                        >
                          {item}
                        </div>
                      ),
                    )}
                  </div>
                </div>

                {/* Main panel */}
                <div className="min-w-0 flex-1 p-4 pb-24">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[8px] font-semibold uppercase tracking-[0.18em] text-txt-dim">
                        SURP2/MOG/P3 · Road rehabilitation
                      </div>
                      <div className="mt-0.5 truncate text-[13px] font-bold tracking-tight text-txt">
                        Package 3 — Saddexda Geed &amp; Hamarweyne Roads
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full border border-ok/20 bg-ok/10 px-2 py-0.5 text-[8px] font-bold uppercase tracking-[0.14em] text-ok">
                      Active
                    </span>
                  </div>

                  {/* KPI tiles */}
                  <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
                    {(
                      [
                        ["Contract", "USD 962,540", "bg-accent/10 text-accent"],
                        ["Physical", "46.0%", "bg-ok/10 text-ok"],
                        ["Certified", "USD 157,209", "bg-accent/10 text-accent"],
                        ["Remaining", "65.8%", "bg-warn/10 text-warn"],
                      ] as const
                    ).map(([label, value, chip]) => (
                      <div key={label} className="rounded-xl border border-border bg-bg-surface px-2.5 py-2">
                        <div className="flex items-center gap-1.5">
                          <span className={`h-4 w-4 shrink-0 rounded ${chip}`} />
                          <span className="truncate text-[8px] font-semibold uppercase tracking-[0.12em] text-txt-dim">
                            {label}
                          </span>
                        </div>
                        <div className="mt-1 truncate font-mono text-[11px] font-semibold tabular-nums text-txt">
                          {value}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-2 grid gap-2 lg:grid-cols-[1.15fr_0.85fr]">
                    {/* Progress card with strips + S-curve */}
                    <div className="rounded-xl border border-border bg-bg-surface p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-semibold text-txt">Progress</span>
                        <span className="rounded-full border border-warn/25 bg-warn/10 px-1.5 py-0.5 text-[8px] font-semibold text-warn">
                          -0.4% variance
                        </span>
                      </div>
                      <div className="mt-2 space-y-1.5">
                        {(
                          [
                            ["Planned (time)", 46.4, "#3b82f6"],
                            ["Actual", 46.0, "#f59e0b"],
                            ["Financial (paid)", 16.3, "#3b82f6"],
                          ] as const
                        ).map(([label, value, color]) => (
                          <div key={label}>
                            <div className="flex items-center justify-between text-[8px] text-txt-muted">
                              <span>{label}</span>
                              <span className="font-mono tabular-nums text-txt">{value.toFixed(1)}%</span>
                            </div>
                            <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-black/5">
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${value}%`, background: `linear-gradient(90deg, ${color}, ${color}66)` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2 border-t border-border pt-1.5">
                        <div className="text-[8px] font-semibold uppercase tracking-[0.12em] text-txt-dim">
                          Progress reports — planned vs actual
                        </div>
                        <svg viewBox="0 0 240 56" className="mt-1 w-full" preserveAspectRatio="none" style={{ height: 56 }}>
                          {[14, 28, 42].map((y) => (
                            <line key={y} x1="0" x2="240" y1={y} y2={y} stroke="rgba(124,135,158,0.14)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                          ))}
                          <polygon points="0,52 60,40 120,28 180,18 240,12 240,52" fill="#f59e0b" opacity="0.08" />
                          <polyline
                            points="0,52 60,38 120,26 180,16 240,10"
                            fill="none"
                            stroke="#3b82f6"
                            strokeWidth="1.5"
                            strokeDasharray="4 3"
                            vectorEffect="non-scaling-stroke"
                          />
                          <polyline
                            points="0,52 60,40 120,28 180,18 240,12"
                            fill="none"
                            stroke="#f59e0b"
                            strokeWidth="2"
                            vectorEffect="non-scaling-stroke"
                          />
                          <circle cx="240" cy="12" r="2.5" fill="#f59e0b" />
                        </svg>
                      </div>
                    </div>

                    {/* Timeline + work plan card */}
                    <div className="rounded-xl border border-border bg-bg-surface p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-semibold text-txt">Timeline</span>
                        <span className="font-mono text-[8px] tabular-nums text-txt-muted">148 of 319 days</span>
                      </div>
                      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-black/5">
                        <div className="h-full w-[46%] rounded-full" style={{ background: "linear-gradient(90deg, #f59e0b, #f59e0b66)" }} />
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-1.5">
                        {(
                          [
                            ["Start", "2026-01-15"],
                            ["Remaining", "171 days"],
                            ["Finish", "2026-11-30"],
                          ] as const
                        ).map(([label, value]) => (
                          <div key={label} className="rounded-lg border border-border bg-bg px-1.5 py-1">
                            <div className="text-[7px] font-semibold uppercase tracking-[0.1em] text-txt-dim">{label}</div>
                            <div className="mt-0.5 truncate font-mono text-[8px] font-semibold tabular-nums text-txt">{value}</div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2 border-t border-border pt-1.5">
                        <div className="flex items-center justify-between text-[8px]">
                          <span className="font-semibold uppercase tracking-[0.12em] text-txt-dim">Work plan</span>
                          <span className="text-txt-muted">2/10 done</span>
                        </div>
                        <div className="mt-1 flex h-1 overflow-hidden rounded-full bg-black/5">
                          <div className="w-[20%] bg-ok" />
                          <div className="w-[20%] bg-accent" />
                        </div>
                        <div className="mt-1.5 space-y-1">
                          {(
                            [
                              ["Reinforced concrete frame", "bg-accent"],
                              ["Blockwork and partitions", "bg-accent"],
                              ["Roofing installation", "bg-black/20"],
                            ] as const
                          ).map(([label, dot]) => (
                            <div key={label} className="flex items-center gap-1.5 rounded-md border border-border bg-bg px-1.5 py-1">
                              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
                              <span className="truncate text-[8px] text-txt">{label}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Commercial bar */}
                  <div className="mt-2 rounded-xl border border-border bg-bg-surface p-3">
                    <div className="flex items-center justify-between text-[8px]">
                      <span className="text-[9px] font-semibold text-txt">Commercial</span>
                      <span className="font-mono tabular-nums text-txt-muted">Certified 38.9% of contract</span>
                    </div>
                    <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-black/5">
                      <div className="w-[16%] bg-ok" />
                      <div className="w-[18%] bg-accent" />
                      <div className="w-[5%] bg-warn" />
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[8px] text-txt-muted">
                      {(
                        [
                          ["Paid", "bg-ok"],
                          ["Approved", "bg-accent"],
                          ["Submitted", "bg-warn"],
                          ["Retention", "bg-err"],
                        ] as const
                      ).map(([label, dot]) => (
                        <span key={label} className="inline-flex items-center gap-1">
                          <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
                          {label}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <div className="absolute inset-x-3 bottom-3 grid gap-3 sm:grid-cols-3">
                {[
                  ["12", "Active projects"],
                  ["4.8M", "Tracked value"],
                  ["37", "Open actions"],
                ].map(([value, label]) => (
                  <div
                    key={label}
                    className="rounded-2xl border border-border bg-white/85 px-5 py-4 text-center shadow-xl shadow-black/10 backdrop-blur"
                  >
                    <div className="text-2xl font-bold text-txt">{value}</div>
                    <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.26em] text-txt-muted">
                      {label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="border-t border-border py-16 lg:py-20">
          <div className="max-w-2xl">
            <span className="text-[11px] font-semibold uppercase tracking-[0.28em] text-accent">
              One workspace
            </span>
            <h2 className="mt-3 text-3xl font-bold tracking-[-0.02em] text-txt sm:text-4xl">
              Every discipline, in the same place.
            </h2>
            <p className="mt-4 text-base leading-7 text-txt-muted">
              Stop stitching together spreadsheets, email threads, and drawing files. Planovera connects each module so
              your team works from a single, current picture of the project.
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {moduleCards.map(({ label, description, icon: Icon }) => (
              <div
                key={label}
                className="group rounded-2xl border border-border bg-bg-surface p-5 transition hover:border-accent/30 hover:bg-bg-hover"
              >
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-blue-500/15 text-accent transition group-hover:bg-blue-500/25">
                  <Icon size={20} />
                </span>
                <div className="mt-4 text-base font-semibold text-txt">{label}</div>
                <p className="mt-1.5 text-sm leading-6 text-txt-muted">{description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t border-border py-16 lg:py-20">
          <div className="grid gap-8 lg:grid-cols-3">
            {valueProps.map(({ title, description, icon: Icon }) => (
              <div key={title} className="flex flex-col gap-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-teal-300/20 bg-teal-400/10 text-teal-300">
                  <Icon size={20} />
                </span>
                <h3 className="text-lg font-semibold text-txt">{title}</h3>
                <p className="text-sm leading-7 text-txt-muted">{description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="py-12 lg:py-16">
          <div className="relative overflow-hidden rounded-[2rem] border border-blue-500/20 bg-gradient-to-br from-blue-600 via-blue-500 to-teal-500 px-6 py-12 text-center sm:px-12 sm:py-16">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.18),transparent_60%)]" />
            <div className="relative mx-auto max-w-2xl">
              <h2 className="text-3xl font-bold tracking-[-0.02em] text-white sm:text-4xl">
                Bring your next project online today.
              </h2>
              <p className="mt-4 text-base leading-7 text-blue-50/90">
                Create an account in minutes, or open the workspace and explore with built-in demo data first.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <a
                  href={signupHref}
                  className="inline-flex items-center gap-2 rounded-2xl bg-white px-6 py-3.5 text-sm font-semibold text-slate-900 shadow-xl shadow-black/20 transition hover:bg-blue-50"
                >
                  Create account
                  <ArrowRight size={16} />
                </a>
                <a
                  href={enterHref}
                  className="rounded-2xl border border-white/20 bg-white/5 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-white/10"
                >
                  Open workspace
                </a>
              </div>
            </div>
          </div>
        </section>

        <footer className="flex flex-col items-center justify-between gap-4 border-t border-border py-8 sm:flex-row">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-white">
              <Image
                src="/brand/planovera-mark.png"
                alt="Planovera"
                width={24}
                height={24}
                className="h-6 w-6 object-contain"
              />
            </span>
            <span className="text-sm font-semibold text-txt">Planovera</span>
          </div>
          <p className="text-[13px] text-txt-dim">
            &copy; {new Date().getFullYear()} Planovera. Project controls for delivery teams.
          </p>
          <a href={enterHref} className="text-[13px] font-semibold text-accent transition hover:text-accent-hover">
            Sign in
          </a>
        </footer>
      </div>
    </main>
  );
}
