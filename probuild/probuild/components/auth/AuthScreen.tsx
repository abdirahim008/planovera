"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  FileSpreadsheet,
  FileText,
  Mail,
  PenTool,
  ShieldCheck,
  UsersRound,
} from "lucide-react";

const platformModules = [
  { label: "Projects", icon: Building2 },
  { label: "BOQ", icon: FileSpreadsheet },
  { label: "Progress", icon: ClipboardList },
  { label: "Payments", icon: ShieldCheck },
  { label: "Work plans", icon: CalendarDays },
  { label: "Drawings", icon: PenTool },
  { label: "Documents", icon: FileText },
  { label: "Teams", icon: UsersRound },
];

const operatingHighlights = [
  "Portfolio dashboard",
  "BOQ and item schedules",
  "Progress reports",
  "Payment certificates",
  "Correspondence register",
  "Meeting minutes",
  "Technical drawing editor",
  "Team seats and invites",
];

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
    <main className="min-h-screen bg-[#f3f0e8] text-[#17211d]">
      <div className="absolute inset-0 -z-0 bg-[linear-gradient(90deg,_rgba(23,33,29,0.055)_1px,_transparent_1px),linear-gradient(0deg,_rgba(23,33,29,0.055)_1px,_transparent_1px)] bg-[size:42px_42px]" />
      <div className="relative z-10 mx-auto grid min-h-screen max-w-7xl grid-cols-1 gap-8 px-5 py-6 lg:grid-cols-[minmax(0,1fr)_440px] lg:px-8">
        <section className="flex min-h-[58vh] flex-col justify-between py-4 lg:min-h-0 lg:py-8">
          <div>
            <div className="flex items-center justify-between gap-4">
              <a href="/" className="flex items-center gap-3">
                <img
                  src="/brand/planovera-mark.png"
                  alt="Planovera"
                  className="h-12 w-12 rounded-xl object-contain shadow-[0_14px_30px_rgba(23,33,29,0.12)]"
                />
                <div>
                  <div className="text-xl font-black tracking-normal text-[#17211d]">Planovera</div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#68756d]">
                    Project delivery platform
                  </div>
                </div>
              </a>

              <div className="hidden items-center gap-2 rounded-lg border border-[#d8d2c4] bg-white/60 px-3 py-2 text-xs font-bold text-[#56645c] shadow-sm backdrop-blur md:flex">
                <ShieldCheck size={14} className="text-[#0d7c66]" />
                Manual billing ready
              </div>
            </div>

            <div className="mt-16 max-w-4xl lg:mt-24">
              <p className="inline-flex rounded-lg border border-[#d8d2c4] bg-white/65 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.22em] text-[#58665e] shadow-sm backdrop-blur">
                One workspace for project delivery
              </p>
              <h1 className="mt-6 max-w-4xl text-4xl font-black leading-[1.04] tracking-normal text-[#121a16] sm:text-5xl lg:text-6xl">
                Run construction projects from contract setup to final handover.
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-8 text-[#4f5d55] sm:text-lg">
                Planovera brings project controls, BOQ management, progress tracking,
                payments, work plans, correspondence, meetings, documents, teams, and
                technical drawings into one calm operating system.
              </p>
            </div>
          </div>

          <div className="mt-12 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {platformModules.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.label}
                  className="flex min-h-[74px] items-center gap-3 rounded-lg border border-[#d8d2c4] bg-white/72 px-4 py-3 shadow-[0_14px_38px_rgba(23,33,29,0.06)] backdrop-blur"
                >
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-[#eef5ef] text-[#0d7c66]">
                    <Icon size={18} />
                  </div>
                  <div className="text-sm font-bold text-[#1d2823]">{item.label}</div>
                </div>
              );
            })}
          </div>
        </section>

        <aside className="flex items-center lg:py-8">
          <section className="w-full rounded-lg border border-[#d9d2c5] bg-[#fffdf8] p-5 shadow-[0_30px_90px_rgba(23,33,29,0.16)] sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#6f7d74]">
                  {configured ? "Secure access" : "Setup required"}
                </p>
                <h2 className="mt-2 text-2xl font-black tracking-normal text-[#17211d]">
                  {configured ? "Open your Planovera workspace" : "Connect Supabase first"}
                </h2>
              </div>
              <div className="rounded-lg border border-[#d8d2c4] bg-[#f8f5ee] px-3 py-2 text-right">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#6f7d74]">
                  Account
                </div>
                <div className="mt-1 text-sm font-black text-[#17211d]">
                  {configured ? "Ready" : "Offline"}
                </div>
              </div>
            </div>

            {!configured ? (
              <div className="mt-6 rounded-lg border border-[#e7c46f] bg-[#fff8dd] p-4 text-sm leading-7 text-[#6b5215]">
                <p className="font-bold">Add these environment variables before signing in:</p>
                <div className="mt-3 rounded-md bg-white px-3 py-3 font-mono text-xs text-[#17211d]">
                  NEXT_PUBLIC_SUPABASE_URL
                  <br />
                  NEXT_PUBLIC_SUPABASE_ANON_KEY
                </div>
                <p className="mt-4">
                  The database setup lives in <code>supabase/schema.sql</code>, and the matching
                  env template is in <code>.env.example</code>.
                </p>
              </div>
            ) : (
              <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
                <div className="grid grid-cols-2 gap-1 rounded-lg bg-[#ebe5d7] p-1">
                  <button
                    type="button"
                    className={`rounded-md px-3 py-2 text-sm font-bold transition ${
                      mode === "signin"
                        ? "bg-[#17211d] text-white shadow-sm"
                        : "text-[#66746c] hover:bg-white/50 hover:text-[#17211d]"
                    }`}
                    onClick={() => setMode("signin")}
                  >
                    Sign in
                  </button>
                  <button
                    type="button"
                    className={`rounded-md px-3 py-2 text-sm font-bold transition ${
                      mode === "signup"
                        ? "bg-[#17211d] text-white shadow-sm"
                        : "text-[#66746c] hover:bg-white/50 hover:text-[#17211d]"
                    }`}
                    onClick={() => setMode("signup")}
                  >
                    Create account
                  </button>
                </div>

                {mode === "signup" ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.18em] text-[#6f7d74]">
                        Full name
                      </label>
                      <input
                        className="w-full rounded-lg border border-[#d8d2c4] bg-[#f8f5ee] px-3.5 py-3 text-sm text-[#17211d] outline-none transition focus:border-[#17211d] focus:bg-white focus:ring-4 focus:ring-[#17211d]/10"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        placeholder="Your name"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.18em] text-[#6f7d74]">
                        Company
                      </label>
                      <input
                        className="w-full rounded-lg border border-[#d8d2c4] bg-[#f8f5ee] px-3.5 py-3 text-sm text-[#17211d] outline-none transition focus:border-[#17211d] focus:bg-white focus:ring-4 focus:ring-[#17211d]/10"
                        value={company}
                        onChange={(event) => setCompany(event.target.value)}
                        placeholder="Company or team"
                      />
                    </div>
                  </div>
                ) : null}

                <div>
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.18em] text-[#6f7d74]">
                    Email
                  </label>
                  <div className="relative">
                    <Mail
                      size={16}
                      className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#748178]"
                    />
                    <input
                      className="w-full rounded-lg border border-[#d8d2c4] bg-[#f8f5ee] px-3.5 py-3 pl-10 text-sm text-[#17211d] outline-none transition focus:border-[#17211d] focus:bg-white focus:ring-4 focus:ring-[#17211d]/10 disabled:cursor-not-allowed disabled:opacity-70"
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
                  <div className="rounded-lg border border-[#b6dec5] bg-[#eefaf1] px-4 py-3 text-sm leading-6 text-[#195b32]">
                    This email has an active organization invite. Sign in or register with
                    <strong> {inviteEmail}</strong> to claim the reserved seat.
                  </div>
                ) : null}

                <div>
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.18em] text-[#6f7d74]">
                    Password
                  </label>
                  <input
                    className="w-full rounded-lg border border-[#d8d2c4] bg-[#f8f5ee] px-3.5 py-3 text-sm text-[#17211d] outline-none transition focus:border-[#17211d] focus:bg-white focus:ring-4 focus:ring-[#17211d]/10"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Enter your password"
                    autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  />
                </div>

                <div className="rounded-lg border border-[#d8d2c4] bg-[#f8f5ee] px-4 py-3 text-sm leading-6 text-[#536159]">
                  New accounts start with a personal workspace. Organization owners can add
                  seats, reserve employee emails, and activate teams manually from admin.
                </div>

                {notice ? (
                  <div className="rounded-lg border border-[#b8d4ea] bg-[#eef7ff] px-4 py-3 text-sm leading-6 text-[#234765]">
                    {notice}
                  </div>
                ) : null}

                <button
                  className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#17211d] px-4 text-sm font-black text-white shadow-[0_18px_36px_rgba(23,33,29,0.22)] transition hover:bg-[#26322d] disabled:cursor-not-allowed disabled:opacity-55"
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
          <div className="grid gap-4 border-t border-[#d8d2c4] py-6 md:grid-cols-[1.1fr_0.9fr]">
            <div className="grid gap-3 sm:grid-cols-2">
              {operatingHighlights.map((item) => (
                <div key={item} className="flex items-center gap-2 text-sm font-bold text-[#314039]">
                  <CheckCircle2 size={16} className="text-[#0d7c66]" />
                  {item}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-3">
              {[
                ["12", "Active projects"],
                ["4.8M", "Tracked value"],
                ["37", "Open actions"],
              ].map(([value, label]) => (
                <div
                  key={label}
                  className="rounded-lg border border-[#d8d2c4] bg-white/65 px-4 py-4 text-center shadow-sm backdrop-blur"
                >
                  <div className="text-xl font-black text-[#17211d]">{value}</div>
                  <div className="mt-1 text-[11px] font-bold uppercase tracking-[0.14em] text-[#6f7d74]">
                    {label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
