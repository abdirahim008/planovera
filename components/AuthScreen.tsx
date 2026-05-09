"use client";

import { useState, type FormEvent } from "react";

export default function AuthScreen({
  configured,
  busy,
  notice,
  onSignIn,
  onSignUp,
}: {
  configured: boolean;
  busy: boolean;
  notice: string | null;
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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (mode === "signin") {
      await onSignIn({ email, password });
      return;
    }

    await onSignUp({ name, company, email, password });
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(30,64,175,0.12),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(15,23,42,0.14),_transparent_36%),linear-gradient(180deg,_#f8fafc,_#eef2ff)] px-6 py-10">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-7xl items-center gap-10 lg:flex-row flex-col">
        <section className="flex-1">
          <div className="inline-flex rounded-full border border-slate-200 bg-white/80 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.34em] text-slate-500 shadow-[0_12px_40px_rgba(15,23,42,0.06)]">
            Planovera Engineering Workspace
          </div>
          <h1 className="mt-6 max-w-3xl text-4xl font-semibold leading-tight text-slate-950 sm:text-5xl">
            Professional web-based technical drawings without depending on desktop CAD tools.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
            Engineers can sign in, open a drawing package, bring reusable details from the library, draft on the canvas, and export PDFs. Admins can publish approved SVG blocks to the shared library.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              {
                title: "Authenticated workspaces",
                body: "Users get their own saved project history while admins manage the shared library and publishing workflow.",
              },
              {
                title: "Reusable drawing content",
                body: "Library blocks can be curated centrally so teams work faster and stay visually consistent.",
              },
              {
                title: "Vercel-ready deployment",
                body: "The app stays inside the Next.js App Router and uses server-aware Supabase auth for a clean Vercel rollout.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-[28px] border border-white/70 bg-white/75 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl"
              >
                <div className="text-base font-semibold text-slate-900">{item.title}</div>
                <p className="mt-2 text-sm leading-6 text-slate-600">{item.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="w-full max-w-xl rounded-[32px] border border-white/70 bg-white/88 p-6 shadow-[0_30px_90px_rgba(15,23,42,0.12)] backdrop-blur-xl">
          <img
            src="/brand/planovera-logo-horizontal.png"
            alt="Planovera"
            className="mb-6 h-12 w-auto object-contain"
          />
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-slate-500">
                {configured ? "Account Access" : "Setup Required"}
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-950">
                {configured ? "Enter the drawing workspace" : "Connect Supabase first"}
              </h2>
            </div>
            <div className="rounded-2xl bg-slate-900 px-4 py-3 text-center text-white">
              <div className="text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-300">Backend</div>
              <div className="mt-1 text-sm font-semibold">
                {configured ? "Cookie auth enabled" : "Missing env vars"}
              </div>
            </div>
          </div>

          {!configured ? (
            <div className="mt-6 rounded-[28px] border border-amber-200 bg-amber-50 p-5 text-sm leading-7 text-amber-900">
              <p className="font-semibold">Add these environment variables before signing in:</p>
              <div className="mt-3 rounded-2xl bg-white px-4 py-3 font-mono text-xs text-slate-800">
                NEXT_PUBLIC_SUPABASE_URL
                <br />
                NEXT_PUBLIC_SUPABASE_ANON_KEY
              </div>
              <p className="mt-4">
                The database and policy setup lives in <code>supabase/schema.sql</code>, and the matching
                env template is in <code>.env.example</code>.
              </p>
            </div>
          ) : (
            <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
              <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
                <button
                  type="button"
                  className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                    mode === "signin" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
                  }`}
                  onClick={() => setMode("signin")}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                    mode === "signup" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
                  }`}
                  onClick={() => setMode("signup")}
                >
                  Create account
                </button>
              </div>

              {mode === "signup" ? (
                <>
                  <div>
                    <label className="label">Full name</label>
                    <input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Engineer or admin name" />
                  </div>
                  <div>
                    <label className="label">Company or team</label>
                    <input className="input" value={company} onChange={(event) => setCompany(event.target.value)} placeholder="Engineering team or business unit" />
                  </div>
                </>
              ) : null}

              <div>
                <label className="label">Email</label>
                <input
                  className="input"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="name@company.com"
                  autoComplete="email"
                />
              </div>
              <div>
                <label className="label">Password</label>
                <input
                  className="input"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                />
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                New users start as <strong className="text-slate-900">engineers</strong>. Promote admins in the
                <code> profiles</code> table after signup.
              </div>

              {notice ? (
                <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
                  {notice}
                </div>
              ) : null}

              <button className="btn btn-primary h-12 w-full justify-center text-sm" disabled={busy}>
                {busy ? "Working..." : mode === "signin" ? "Sign in" : "Create account"}
              </button>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
