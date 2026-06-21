"use client";

import { ArrowLeft } from "lucide-react";

import BillingAdminPanel from "@/components/admin/BillingAdminPanel";

// The BOQ library and the drawing warehouse are curated from the backend
// (Supabase + SQL seeds / upload scripts), not from this console — so the only
// admin surface here is Billing Ops.
export default function AdminConsole() {
  return (
    <div className="min-h-screen bg-bg p-6">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center gap-3 mb-6">
          <a
            href="/workspace"
            className="text-txt-muted hover:text-txt transition-colors"
          >
            <ArrowLeft size={18} />
          </a>
          <div>
            <h1 className="text-xl font-semibold">Platform administration</h1>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-bg p-6">
          <BillingAdminPanel />
        </div>
      </div>
    </div>
  );
}
