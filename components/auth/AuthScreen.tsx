"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, Mail } from "lucide-react";

export default function AuthScreen({
  configured,
  busy,
  notice,
  inviteEmail,
  emailLocked,
  initialMode = "signin",
  onSignIn,
  onSignUp,
}: {
  configured: boolean;
  busy: boolean;
  notice: string | null;
  inviteEmail?: string | null;
  emailLocked?: boolean;
  initialMode?: "signin" | "signup";
  onSignIn: (payload: { email: string; password: string }) => Promise<void>;
  onSignUp: (payload: {
    name: string;
    company: string;
    email: string;
    password: string;
  }) => Promise<void>;
}) {
  const [mode, setMode] = useState<"signin" | "signup">(initialMode);
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState(inviteEmail || "");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (!inviteEmail) return;
    setEmail(inviteEmail);
  }, [inviteEmail]);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (mode === "signin") {
      await onSignIn({ email, password });
      return;
    }

    await onSignUp({ name, company, email, password });
  };

  return (
    <main className="relative min-h-screen bg-[#0b0e14] text-[#e2e8f4]">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-10">
        <a href="/" className="mb-8 flex items-center gap-3">
          <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white">
            <img
              src="/brand/planovera-mark.png"
              alt="Planovera"
              className="h-8 w-8 object-contain"
            />
          </span>
          <span className="text-lg font-semibold text-white">Planovera</span>
        </a>

        <section className="rounded-2xl border border-white/10 bg-[#12161f] p-6">
          <h1 className="text-xl font-semibold text-white">
            {mode === "signin" ? "Sign in" : "Create account"}
          </h1>

          {!configured ? (
            <div className="mt-5 rounded-lg border border-amber-400/25 bg-amber-400/10 p-4 text-sm leading-6 text-amber-100">
              <p className="font-semibold text-amber-200">Add these environment variables before signing in:</p>
              <div className="mt-3 rounded-lg border border-white/10 bg-[#0b0e14] px-3 py-3 font-mono text-xs text-slate-200">
                NEXT_PUBLIC_SUPABASE_URL
                <br />
                NEXT_PUBLIC_SUPABASE_ANON_KEY
              </div>
            </div>
          ) : (
            <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
              {mode === "signup" ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Full name
                    </label>
                    <input
                      className="w-full rounded-lg border border-white/10 bg-[#0b0e14] px-4 py-2.5 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-blue-400/70 focus:ring-2 focus:ring-blue-500/20"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder="Your name"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Company
                    </label>
                    <input
                      className="w-full rounded-lg border border-white/10 bg-[#0b0e14] px-4 py-2.5 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-blue-400/70 focus:ring-2 focus:ring-blue-500/20"
                      value={company}
                      onChange={(event) => setCompany(event.target.value)}
                      placeholder="Company or team"
                    />
                  </div>
                </div>
              ) : null}

              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Email
                </label>
                <div className="relative">
                  <Mail
                    size={16}
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500"
                  />
                  <input
                    className="w-full rounded-lg border border-white/10 bg-[#0b0e14] px-4 py-2.5 pl-10 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-blue-400/70 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-70"
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
                <div className="rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-4 py-2.5 text-sm leading-6 text-emerald-100">
                  Sign in or register with <strong>{inviteEmail}</strong> to claim the reserved seat.
                </div>
              ) : null}

              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Password
                </label>
                <input
                  className="w-full rounded-lg border border-white/10 bg-[#0b0e14] px-4 py-2.5 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-blue-400/70 focus:ring-2 focus:ring-blue-500/20"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                />
              </div>

              {notice ? (
                <div className="rounded-lg border border-blue-400/25 bg-blue-400/10 px-4 py-2.5 text-sm leading-6 text-blue-100">
                  {notice}
                </div>
              ) : null}

              <button
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-500 px-4 text-sm font-semibold text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-55"
                disabled={busy}
              >
                {busy ? "Working..." : mode === "signin" ? "Sign in" : "Create account"}
                <ArrowRight size={16} />
              </button>

              <div className="pt-2 text-center text-sm text-slate-500">
                {mode === "signin" ? (
                  <>
                    No account?{" "}
                    <button
                      type="button"
                      className="font-semibold text-blue-300 hover:text-blue-200"
                      onClick={() => setMode("signup")}
                    >
                      Create one
                    </button>
                  </>
                ) : (
                  <>
                    Already have an account?{" "}
                    <button
                      type="button"
                      className="font-semibold text-blue-300 hover:text-blue-200"
                      onClick={() => setMode("signin")}
                    >
                      Sign in
                    </button>
                  </>
                )}
              </div>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
