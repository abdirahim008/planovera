"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowRight,
  BarChart3,
  Building2,
  CalendarDays,
  CheckCircle2,
  CheckSquare,
  ClipboardList,
  FileSpreadsheet,
  FileText,
  Mail,
  MessageSquareText,
  PenTool,
  ShieldCheck,
  UsersRound,
} from "lucide-react";

const platformModules = [
  { label: "Portfolio", icon: Building2, tone: "blue" },
  { label: "BOQ", icon: FileSpreadsheet, tone: "cyan" },
  { label: "Progress", icon: ClipboardList, tone: "green" },
  { label: "Payments", icon: ShieldCheck, tone: "amber" },
  { label: "Work Plan", icon: CalendarDays, tone: "blue" },
  { label: "Drawings", icon: PenTool, tone: "cyan" },
  { label: "Documents", icon: FileText, tone: "green" },
  { label: "Checklist", icon: CheckSquare, tone: "amber" },
  { label: "Site Notes", icon: MessageSquareText, tone: "blue" },
  { label: "Meetings", icon: UsersRound, tone: "cyan" },
];

const operatingHighlights = [
  "Manual organization activation",
  "Team seats and employee invites",
  "BOQ-weighted progress reports",
  "Technical drawing studio",
  "Meeting minutes and action tracking",
  "Document compliance checklist",
];

const dashboardMetrics = [
  { value: "12", label: "Active projects", accent: "text-blue-400" },
  { value: "4.8M", label: "Tracked value", accent: "text-emerald-400" },
  { value: "37", label: "Open actions", accent: "text-amber-400" },
];

const toneClasses: Record<string, string> = {
  blue: "bg-blue-500/10 text-blue-300 ring-blue-400/15",
  cyan: "bg-cyan-500/10 text-cyan-300 ring-cyan-400/15",
  green: "bg-emerald-500/10 text-emerald-300 ring-emerald-400/15",
  amber: "bg-amber-500/10 text-amber-300 ring-amber-400/15",
};

export default function AuthScreen({
  configured,
  busy,
  notice,
  inviteEmail,
  emailLocked,
  onSignIn,
  onSignUp,
}: {
  configured: boolean;
  busy: boolean;
  notice: string | null;
  inviteEmail?: string | null;
  emailLocked?: boolean;
  onSignIn: (payload: { email: string; password: string }) => Promise<void>;
  onSignUp: (payload: {
    name: string;
    company: string;
    email: string;
    password: string;
  }) => Promise<void>;
}) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState(inviteEmail || "");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (!inviteEmail) return;
    setEmail(inviteEmail);
  }, [inviteEmail]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (mode === "signin") {
      await onSignIn({ email, password });
      return;
    }

    await onSignUp({ name, company, email, password });
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0b0e14] text-[#e2e8f4]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_14%,rgba(59,130,246,0.22),transparent_28%),radial-gradient(circle_at_82%_10%,rgba(14,165,233,0.15),transparent_24%),radial-gradient(circle_at_72%_84%,rgba(245,158,11,0.12),transparent_28%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(148,163,184,0.055)_1px,transparent_1px),linear-gradient(0deg,rgba(148,163,184,0.055)_1px,transparent_1px)] bg-[size:44px_44px]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-blue-500/10 to-transparent" />

      <div className="relative z-10 mx-auto grid min-h-screen max-w-7xl grid-cols-1 gap-8 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_430px] lg:px-8 lg:py-8">
        <section className="flex flex-col gap-8 lg:min-h-[calc(100vh-4rem)] lg:justify-between">
          <div>
            <header className="flex items-center justify-between gap-4">
              <a href="/" className="flex min-w-0 items-center gap-3">
                <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white shadow-[0_18px_45px_rgba(0,0,0,0.34)]">
                  <img
                    src="/brand/planovera-mark.png"
                    alt="Planovera"
                    className="h-10 w-10 object-contain"
                  />
                </span>
                <span className="min-w-0">
                  <span className="block text-xl font-black leading-none text-white">Planovera</span>
                  <span className="mt-1 block truncate text-[11px] font-bold uppercase tracking-[0.24em] text-slate-500">
                    Project controls
                  </span>
                </span>
              </a>

              <div className="hidden items-center gap-2 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs font-bold text-emerald-300 shadow-[0_18px_40px_rgba(16,185,129,0.08)] backdrop-blur md:flex">
                <ShieldCheck size={15} />
                Organization access ready
              </div>
            </header>

            <div className="mt-12 max-w-4xl sm:mt-16 lg:mt-20">
              <p className="inline-flex items-center gap-2 rounded-2xl border border-blue-400/20 bg-blue-400/10 px-3 py-2 text-[11px] font-black uppercase tracking-[0.22em] text-blue-200 shadow-[0_18px_45px_rgba(37,99,235,0.12)] backdrop-blur">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-400 shadow-[0_0_18px_rgba(96,165,250,0.9)]" />
                Built for project delivery teams
              </p>
              <h1 className="mt-6 max-w-5xl text-4xl font-black leading-[1.02] tracking-[-0.04em] text-white sm:text-5xl lg:text-7xl">
                Project controls, drawings, payments, and reports in one workspace.
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-8 text-slate-400 sm:text-lg">
                Planovera gives NGOs, government agencies, consultants, and contractors one
                operating system for BOQs, progress, payments, meetings, documents, compliance,
                field notes, and technical drawings.
              </p>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
            <div className="rounded-3xl border border-white/10 bg-[#12161f]/80 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.28)] backdrop-blur">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-500">
                    Operating modules
                  </p>
                  <h2 className="mt-1 text-lg font-black text-white">One project delivery stack</h2>
                </div>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold text-slate-400">
                  10 tools
                </span>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {platformModules.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.label}
                      className="group flex items-center gap-3 rounded-2xl border border-white/8 bg-[#0f141f] px-3 py-3 transition hover:border-blue-400/30 hover:bg-[#151c2a]"
                    >
                      <span
                        className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ring-1 ${
                          toneClasses[item.tone]
                        }`}
                      >
                        <Icon size={17} />
                      </span>
                      <span className="text-sm font-black text-slate-200">{item.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-[#12161f]/80 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.28)] backdrop-blur">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-500">
                    Live command view
                  </p>
                  <h2 className="mt-1 text-lg font-black text-white">Portfolio snapshot</h2>
                </div>
                <BarChart3 size={20} className="text-blue-300" />
              </div>

              <div className="mt-5 grid grid-cols-3 gap-2">
                {dashboardMetrics.map((item) => (
                  <div
                    key={item.label}
                    className="rounded-2xl border border-white/10 bg-[#0b0e14] px-3 py-3 text-center"
                  >
                    <div className={`text-2xl font-black ${item.accent}`}>{item.value}</div>
                    <div className="mt-1 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-500">
                      {item.label}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-5 space-y-3">
                {[
                  ["Physical progress", "68%", "bg-blue-400", "w-[68%]"],
                  ["Checklist compliance", "91%", "bg-emerald-400", "w-[91%]"],
                  ["Open action closure", "54%", "bg-amber-400", "w-[54%]"],
                ].map(([label, value, color, width]) => (
                  <div key={label}>
                    <div className="mb-1.5 flex items-center justify-between text-xs font-bold">
                      <span className="text-slate-400">{label}</span>
                      <span className="text-slate-200">{value}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-white/8">
                      <div className={`h-full rounded-full ${color} ${width}`} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <aside className="flex items-start lg:items-center">
          <section className="w-full rounded-3xl border border-white/10 bg-[#12161f]/95 p-5 shadow-[0_34px_100px_rgba(0,0,0,0.42)] backdrop-blur-xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-500">
                  {configured ? "Secure access" : "Setup required"}
                </p>
                <h2 className="mt-2 text-2xl font-black tracking-[-0.02em] text-white">
                  {configured ? "Open your workspace" : "Connect Supabase first"}
                </h2>
              </div>
              <div className="rounded-2xl border border-white/10 bg-[#0b0e14] px-3 py-2 text-right">
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                  Account
                </div>
                <div className={`mt-1 text-sm font-black ${configured ? "text-emerald-300" : "text-amber-300"}`}>
                  {configured ? "Ready" : "Offline"}
                </div>
              </div>
            </div>

            {!configured ? (
              <div className="mt-6 rounded-2xl border border-amber-400/25 bg-amber-400/10 p-4 text-sm leading-7 text-amber-100">
                <p className="font-black text-amber-200">Add these environment variables before signing in:</p>
                <div className="mt-3 rounded-xl border border-white/10 bg-[#0b0e14] px-3 py-3 font-mono text-xs text-slate-200">
                  NEXT_PUBLIC_SUPABASE_URL
                  <br />
                  NEXT_PUBLIC_SUPABASE_ANON_KEY
                </div>
                <p className="mt-4 text-amber-100/80">
                  The database setup lives in <code>supabase/schema.sql</code>, and the matching
                  env template is in <code>.env.example</code>.
                </p>
              </div>
            ) : (
              <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
                <div className="grid grid-cols-2 gap-1 rounded-2xl border border-white/10 bg-[#0b0e14] p-1">
                  <button
                    type="button"
                    className={`rounded-xl px-3 py-2.5 text-sm font-black transition ${
                      mode === "signin"
                        ? "bg-blue-500 text-white shadow-[0_12px_30px_rgba(59,130,246,0.22)]"
                        : "text-slate-400 hover:bg-white/5 hover:text-white"
                    }`}
                    onClick={() => setMode("signin")}
                  >
                    Sign in
                  </button>
                  <button
                    type="button"
                    className={`rounded-xl px-3 py-2.5 text-sm font-black transition ${
                      mode === "signup"
                        ? "bg-blue-500 text-white shadow-[0_12px_30px_rgba(59,130,246,0.22)]"
                        : "text-slate-400 hover:bg-white/5 hover:text-white"
                    }`}
                    onClick={() => setMode("signup")}
                  >
                    Create account
                  </button>
                </div>

                {mode === "signup" ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">
                        Full name
                      </label>
                      <input
                        className="w-full rounded-2xl border border-white/10 bg-[#0b0e14] px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-blue-400/70 focus:ring-4 focus:ring-blue-500/10"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        placeholder="Your name"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">
                        Company
                      </label>
                      <input
                        className="w-full rounded-2xl border border-white/10 bg-[#0b0e14] px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-blue-400/70 focus:ring-4 focus:ring-blue-500/10"
                        value={company}
                        onChange={(event) => setCompany(event.target.value)}
                        placeholder="Company or team"
                      />
                    </div>
                  </div>
                ) : null}

                <div>
                  <label className="mb-1.5 block text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">
                    Email
                  </label>
                  <div className="relative">
                    <Mail
                      size={16}
                      className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"
                    />
                    <input
                      className="w-full rounded-2xl border border-white/10 bg-[#0b0e14] px-4 py-3 pl-11 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-blue-400/70 focus:ring-4 focus:ring-blue-500/10 disabled:cursor-not-allowed disabled:opacity-70"
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="name@company.com"
                      autoComplete="email"
                      disabled={emailLocked}
                    />
                  </div>
                </div>

                {inviteEmail ? (
                  <div className="rounded-2xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-3 text-sm leading-6 text-emerald-100">
                    This email has an active organization invite. Sign in or register with
                    <strong> {inviteEmail}</strong> to claim the reserved seat.
                  </div>
                ) : null}

                <div>
                  <label className="mb-1.5 block text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">
                    Password
                  </label>
                  <input
                    className="w-full rounded-2xl border border-white/10 bg-[#0b0e14] px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-blue-400/70 focus:ring-4 focus:ring-blue-500/10"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Enter your password"
                    autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  />
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm leading-6 text-slate-400">
                  New accounts start with a personal workspace. Organization owners can add
                  seats, reserve employee emails, and activate teams manually from admin.
                </div>

                {notice ? (
                  <div className="rounded-2xl border border-blue-400/25 bg-blue-400/10 px-4 py-3 text-sm leading-6 text-blue-100">
                    {notice}
                  </div>
                ) : null}

                <button
                  className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-blue-500 px-4 text-sm font-black text-white shadow-[0_20px_44px_rgba(59,130,246,0.28)] transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-55"
                  disabled={busy}
                >
                  {busy ? "Working..." : mode === "signin" ? "Sign in to Planovera" : "Create Planovera account"}
                  <ArrowRight size={16} />
                </button>
              </form>
            )}
          </section>
        </aside>

        <section className="lg:col-span-2">
          <div className="grid gap-5 border-t border-white/10 py-6 md:grid-cols-[1fr_0.8fr]">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {operatingHighlights.map((item) => (
                <div key={item} className="flex items-center gap-2 text-sm font-bold text-slate-300">
                  <CheckCircle2 size={16} className="text-emerald-400" />
                  {item}
                </div>
              ))}
            </div>

            <div className="rounded-3xl border border-white/10 bg-[#12161f]/75 p-4">
              <div className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">
                Built for organizations
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Start with manual activation for pilots, then grow into organization seats,
                employee invites, program dashboards, and project-level delivery controls.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
