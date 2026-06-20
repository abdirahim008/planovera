import Image from "next/image";

import LandingSignOut from "@/components/auth/LandingSignOut";
import { ArrowRight, CheckCircle2, LayoutDashboard, PencilRuler } from "lucide-react";

// Generic sample data for the "See it in action" product previews — no real
// project figures. The drawing imagery under /public/marketing is generic
// standard-detail content (title blocks stripped).
const boqPreviewRows = [
  { kind: "section" as const, label: "A — Earthworks" },
  { kind: "item" as const, no: "A.1", desc: "Clear and grub site", unit: "m²", qty: "2,400", rate: "3.50", amount: "8,400" },
  { kind: "item" as const, no: "A.2", desc: "Excavate to formation level", unit: "m³", qty: "1,850", rate: "6.20", amount: "11,470" },
  { kind: "subtotal" as const, label: "Subtotal — Earthworks", amount: "19,870" },
  { kind: "section" as const, label: "B — Pavement" },
  { kind: "item" as const, no: "B.1", desc: "Granular sub-base, 150 mm", unit: "m³", qty: "920", rate: "28.00", amount: "25,760" },
  { kind: "item" as const, no: "B.2", desc: "Asphalt wearing course, 70 mm", unit: "m²", qty: "6,400", rate: "14.50", amount: "92,800" },
  { kind: "subtotal" as const, label: "Subtotal — Pavement", amount: "118,560" },
  { kind: "total" as const, label: "Total carried to summary", amount: "138,430" },
];

const warehouseTiles = [
  { src: "/marketing/wh-kerb.png", label: "Kerb & sidewalk details", tag: "Civil · Roads" },
  { src: "/marketing/wh-catchbasin.png", label: "Catch basin", tag: "Civil · Drainage" },
  { src: "/marketing/wh-culvert.png", label: "Pipe culvert & headwall", tag: "Civil · Drainage" },
  { src: "/marketing/wh-manhole.png", label: "Precast manhole", tag: "Civil · Drainage" },
  { src: "/marketing/wh-retainingwall.png", label: "Retaining wall", tag: "Civil · Structures" },
  { src: "/marketing/wh-solar.png", label: "Solar street lighting", tag: "Civil · Utilities" },
];

const studioMenus = ["File", "Edit", "View", "Trays", "Insert", "Tools", "Sheet", "Warehouse"];
const studioTabs = ["Properties", "Title block", "Projects"];

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
          <div className="min-w-0 max-w-2xl">
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

          <div className="relative min-w-0">
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
                        Sample portfolio · Road rehabilitation
                      </div>
                      <div className="mt-0.5 truncate text-[13px] font-bold tracking-tight text-txt">
                        Package 2 — Riverside Avenue Upgrade
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
                        ["Contract", "USD 1,200,000", "bg-accent/10 text-accent"],
                        ["Physical", "52.0%", "bg-ok/10 text-ok"],
                        ["Certified", "USD 480,000", "bg-accent/10 text-accent"],
                        ["Remaining", "60.0%", "bg-warn/10 text-warn"],
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

        {/* See it in action — three framed product previews (generic data). */}
        <section className="border-t border-border py-16 lg:py-20">
          <div className="max-w-2xl">
            <span className="text-[11px] font-semibold uppercase tracking-[0.28em] text-accent">See it in action</span>
            <h2 className="mt-3 text-3xl font-bold tracking-[-0.02em] text-txt sm:text-4xl">
              The actual product — bills, drawings and a shared library.
            </h2>
            <p className="mt-4 text-base leading-7 text-txt-muted">
              A spreadsheet-grade BOQ, a built-in drawing studio, and a warehouse of ready-made standard details — all in
              one workspace, with no separate CAD tool to license.
            </p>
          </div>

          <div className="mt-10 space-y-10">
            {/* 1 · BOQ */}
            <div>
              <div className="overflow-hidden rounded-2xl border border-border bg-bg-surface shadow-sm">
                <div className="flex items-center gap-1.5 border-b border-border px-4 py-2.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-err/50" />
                  <span className="h-2.5 w-2.5 rounded-full bg-warn/50" />
                  <span className="h-2.5 w-2.5 rounded-full bg-ok/50" />
                  <span className="ml-2 text-[11px] font-medium text-txt-muted">Bill of quantities — Roadworks · Sheet 1</span>
                </div>
                <div className="overflow-x-auto p-3 sm:p-4">
                  <table className="w-full border-collapse text-left text-[12px] sm:min-w-[620px]">
                    <thead>
                      <tr className="border-b border-border text-[9px] uppercase tracking-[0.1em] text-txt-dim">
                        <th className="py-1.5 pr-3 font-semibold">Item</th>
                        <th className="py-1.5 pr-3 font-semibold">Description</th>
                        <th className="hidden py-1.5 pr-3 font-semibold sm:table-cell">Unit</th>
                        <th className="hidden py-1.5 pr-3 text-right font-semibold sm:table-cell">Qty</th>
                        <th className="hidden py-1.5 pr-3 text-right font-semibold sm:table-cell">Rate</th>
                        <th className="py-1.5 text-right font-semibold">Amount (USD)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {boqPreviewRows.map((row, i) => {
                        if (row.kind === "section")
                          return (
                            <tr key={i} className="bg-accent/5">
                              <td colSpan={6} className="px-1 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-accent">
                                {row.label}
                              </td>
                            </tr>
                          );
                        if (row.kind === "item")
                          return (
                            <tr key={i} className="border-b border-border/60">
                              <td className="py-1.5 pr-3 font-mono tabular-nums text-txt-muted">{row.no}</td>
                              <td className="py-1.5 pr-3 text-txt">{row.desc}</td>
                              <td className="hidden py-1.5 pr-3 text-txt-muted sm:table-cell">{row.unit}</td>
                              <td className="hidden py-1.5 pr-3 text-right font-mono tabular-nums text-txt sm:table-cell">{row.qty}</td>
                              <td className="hidden py-1.5 pr-3 text-right font-mono tabular-nums text-txt sm:table-cell">{row.rate}</td>
                              <td className="py-1.5 text-right font-mono tabular-nums text-txt">{row.amount}</td>
                            </tr>
                          );
                        if (row.kind === "subtotal")
                          return (
                            <tr key={i} className="border-b border-border">
                              <td colSpan={5} className="py-1.5 pr-3 text-right text-[11px] font-semibold text-txt-muted">{row.label}</td>
                              <td className="py-1.5 text-right font-mono font-semibold tabular-nums text-txt">{row.amount}</td>
                            </tr>
                          );
                        return (
                          <tr key={i}>
                            <td colSpan={5} className="py-2 pr-3 text-right text-[12px] font-bold uppercase tracking-[0.06em] text-txt">{row.label}</td>
                            <td className="py-2 text-right font-mono text-[13px] font-bold tabular-nums text-accent">{row.amount}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              <p className="mt-3 text-sm leading-6 text-txt-muted">
                <span className="font-semibold text-txt">Bills of quantities.</span> Spreadsheet-grade editing, Excel
                paste/import, section subtotals and live totals — the same figures flow straight into payments and progress.
              </p>
            </div>

            {/* 2 · Drawing studio (full module) */}
            <div>
              <div className="overflow-hidden rounded-2xl border border-[#34353c] bg-[#141519] shadow-sm">
                {/* top toolbar */}
                <div className="flex flex-wrap items-center gap-1.5 border-b border-[#34353c] bg-[#202127] px-3 py-2">
                  <span className="flex items-center gap-1.5 rounded-md bg-[#15161a] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#f0a13a]">
                    <PencilRuler size={12} /> Studio
                  </span>
                  <span className="hidden rounded-md border border-[#3a3b42] px-2 py-1 text-[10px] text-slate-300 sm:inline">
                    Package 2 — Riverside Avenue
                  </span>
                  <span className="mx-1 hidden h-4 w-px bg-[#34353c] sm:block" />
                  {studioMenus.map((m) => (
                    <span
                      key={m}
                      className={`rounded-md px-2 py-1 text-[10px] font-medium ${
                        m === "Warehouse"
                          ? "border border-[#f0a13a]/40 bg-[#f0a13a]/10 text-[#f0a13a]"
                          : "text-slate-300"
                      }`}
                    >
                      {m}
                    </span>
                  ))}
                  <span className="ml-auto hidden rounded-md border border-[#3a3b42] px-2 py-1 text-[10px] text-slate-400 md:inline">
                    Zoom 60%
                  </span>
                </div>
                <div className="flex">
                  {/* left tab rail */}
                  <div className="hidden w-28 shrink-0 flex-col gap-0.5 border-r border-[#34353c] bg-[#1a1b20] p-2 sm:flex">
                    {studioTabs.map((t) => (
                      <span
                        key={t}
                        className={`rounded-md px-2 py-1.5 text-[11px] ${
                          t === "Title block" ? "bg-[#f0a13a] font-medium text-[#1c1206]" : "text-slate-300"
                        }`}
                      >
                        {t}
                      </span>
                    ))}
                    <span className="mt-1 rounded-md px-2 py-1.5 text-[11px] text-slate-500">Publish</span>
                  </div>
                  {/* canvas with a generated drawing on an A3 sheet */}
                  <div
                    className="min-w-0 flex-1 p-4"
                    style={{
                      backgroundColor: "#26272e",
                      backgroundImage:
                        "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
                      backgroundSize: "22px 22px",
                    }}
                  >
                    <div className="mx-auto max-w-2xl rounded-sm bg-white p-2 shadow-[0_10px_40px_rgba(0,0,0,0.45)]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src="/marketing/studio-drawing.png"
                        alt="Generated road cross-section drawing on the studio canvas"
                        loading="lazy"
                        className="h-auto w-full"
                      />
                    </div>
                  </div>
                </div>
              </div>
              <p className="mt-3 text-sm leading-6 text-txt-muted">
                <span className="font-semibold text-txt">Drawing studio.</span> A built-in CAD canvas — draw, import SVG/DXF/PDF,
                add parametric reinforcement details and a clean title block, then export to PDF. No separate tool to license or learn.
              </p>
            </div>

            {/* 3 · Warehouse */}
            <div>
              <div className="overflow-hidden rounded-2xl border border-[#34353c] bg-[#141519] shadow-sm">
                <div className="flex items-center gap-3 border-b border-[#34353c] bg-[#202127] px-3 py-2.5">
                  <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-100">
                    <LayoutDashboard size={14} className="text-[#f0a13a]" /> Drawing library
                  </span>
                  <span className="flex flex-1 items-center gap-2 rounded-md border border-[#3a3b42] bg-[#15161a] px-2.5 py-1.5 text-[11px] text-slate-500">
                    Search culverts, kerb, manhole, tank…
                  </span>
                  <span className="hidden text-[11px] text-slate-400 sm:inline">{warehouseTiles.length * 4} drawings</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 border-b border-[#34353c] bg-[#17181c] px-3 py-1.5">
                  {["All", "Drawings", "Parts", "Cross sections", "Drainage", "Structures"].map((c, i) => (
                    <span
                      key={c}
                      className={`rounded-md px-2 py-1 text-[10px] font-medium ${
                        i === 0 ? "bg-[#f0a13a] text-[#1c1206]" : "text-slate-300"
                      }`}
                    >
                      {c}
                    </span>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2.5 p-3 sm:grid-cols-3">
                  {warehouseTiles.map((tile) => (
                    <div key={tile.src} className="overflow-hidden rounded-lg border border-[#34353c] bg-[#1a1b20]">
                      <div className="flex h-24 items-center justify-center bg-white p-1.5">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={tile.src} alt={tile.label} loading="lazy" className="max-h-full max-w-full object-contain" />
                      </div>
                      <div className="px-2 py-1.5">
                        <div className="truncate text-[11px] font-medium text-slate-100">{tile.label}</div>
                        <div className="truncate text-[9px] text-slate-500">{tile.tag}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <p className="mt-3 text-sm leading-6 text-txt-muted">
                <span className="font-semibold text-txt">Warehouse.</span> A shared library of standard details and complete
                sheets. Filter by category, preview, and import straight onto your canvas — so teams reuse work instead of redrawing it.
              </p>
            </div>
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
