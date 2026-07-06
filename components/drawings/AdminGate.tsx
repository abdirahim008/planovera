"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useState } from "react";

import { fetchCurrentUserRole } from "@/lib/drawings/libraryBridge";
import { isSupabaseConfigured } from "@/lib/supabase-browser";

// The drawing studio and warehouse browser are admin curation tools — regular
// engineers build drawing packages inside the workspace instead. Demo mode
// (no Supabase) has no roles, so it stays open for local evaluation.
export default function AdminGate({ children }: { children: ReactNode }) {
  const [allowed, setAllowed] = useState<boolean | null>(
    isSupabaseConfigured() ? null : true,
  );

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    let active = true;
    void fetchCurrentUserRole().then((role) => {
      if (active) setAllowed(role === "admin");
    });
    return () => {
      active = false;
    };
  }, []);

  if (allowed === null) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-[13px] text-slate-400">
        Checking access…
      </main>
    );
  }

  if (!allowed) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-white">
        <div className="max-w-lg rounded-[28px] border border-white/10 bg-white/8 p-8 text-center shadow-[0_28px_90px_rgba(0,0,0,0.35)] backdrop-blur-xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-sky-300">
            Drawing studio
          </p>
          <h1 className="mt-3 text-2xl font-semibold">This is an admin curation tool</h1>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            Ready-made drawings now live in your project&apos;s <strong>Drawings</strong> module —
            pick from the warehouse, fill in the title block, and export the package as PDF.
          </p>
          <Link
            href="/workspace"
            className="mt-6 inline-flex rounded-xl border border-white/15 bg-white px-4 py-2 text-sm font-semibold text-slate-950"
          >
            Open Planovera
          </Link>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
