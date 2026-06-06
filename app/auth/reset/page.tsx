"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Lock } from "lucide-react";

import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase-browser";

type Status = "checking" | "ready" | "invalid" | "done";

export default function ResetPasswordPage() {
  const router = useRouter();
  const configured = isSupabaseConfigured();
  const [status, setStatus] = useState<Status>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // The recovery link routes through /auth/callback, which exchanges the one-time
  // code for a session before forwarding here. So a valid session means the reset
  // link is good; no session means the link was missing, already used, or expired.
  useEffect(() => {
    let active = true;

    if (!configured) {
      setStatus("invalid");
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setStatus("invalid");
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setStatus(data.session ? "ready" : "invalid");
    });

    return () => {
      active = false;
    };
  }, [configured]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (password.length < 8) {
      setNotice("Use at least 8 characters for your new password.");
      return;
    }
    if (password !== confirm) {
      setNotice("The two passwords don't match.");
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setNotice("Supabase environment variables are missing.");
      return;
    }

    setBusy(true);
    setNotice(null);

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setNotice(error.message);
      setBusy(false);
      return;
    }

    setStatus("done");
    setNotice("Password updated. Redirecting to your workspace...");
    setBusy(false);
    setTimeout(() => {
      router.replace("/workspace");
      router.refresh();
    }, 1200);
  };

  return (
    <main className="relative min-h-screen bg-bg text-txt">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-10">
        <a href="/" className="mb-8 flex items-center gap-3">
          <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-border bg-white">
            <img
              src="/brand/planovera-mark.png"
              alt="Planovera"
              className="h-8 w-8 object-contain"
            />
          </span>
          <span className="text-lg font-semibold text-txt">Planovera</span>
        </a>

        <section className="rounded-2xl border border-border bg-bg-surface p-6">
          <h1 className="text-xl font-semibold text-txt">Set a new password</h1>

          {status === "checking" ? (
            <p className="mt-4 text-sm text-txt-muted">Verifying your reset link...</p>
          ) : status === "invalid" ? (
            <div className="mt-5 space-y-4">
              <div className="rounded-lg border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm leading-6 text-amber-800">
                This reset link is invalid or has expired. Request a new one from the sign-in page.
              </div>
              <a
                href="/login"
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-500 px-4 text-sm font-semibold text-white transition hover:bg-blue-400"
              >
                Back to sign in
                <ArrowRight size={16} />
              </a>
            </div>
          ) : (
            <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-muted">
                  New password
                </label>
                <div className="relative">
                  <Lock
                    size={16}
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-txt-dim"
                  />
                  <input
                    className="w-full rounded-lg border border-border bg-bg-input px-4 py-2.5 pl-10 text-sm text-txt outline-none transition placeholder:text-txt-dim focus:border-accent focus:ring-2 focus:ring-blue-500/20"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                    disabled={status === "done"}
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-muted">
                  Confirm new password
                </label>
                <div className="relative">
                  <Lock
                    size={16}
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-txt-dim"
                  />
                  <input
                    className="w-full rounded-lg border border-border bg-bg-input px-4 py-2.5 pl-10 text-sm text-txt outline-none transition placeholder:text-txt-dim focus:border-accent focus:ring-2 focus:ring-blue-500/20"
                    type="password"
                    value={confirm}
                    onChange={(event) => setConfirm(event.target.value)}
                    placeholder="Re-enter your new password"
                    autoComplete="new-password"
                    disabled={status === "done"}
                  />
                </div>
              </div>

              {notice ? (
                <div className="rounded-lg border border-blue-400/25 bg-blue-400/10 px-4 py-2.5 text-sm leading-6 text-accent">
                  {notice}
                </div>
              ) : null}

              <button
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-500 px-4 text-sm font-semibold text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-55"
                disabled={busy || status === "done"}
              >
                {busy ? "Working..." : "Update password"}
                <ArrowRight size={16} />
              </button>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
