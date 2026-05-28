"use client";

import { useState } from "react";
import { ArrowLeft, BookCopy, CreditCard } from "lucide-react";

import AdminLibrary from "@/components/admin/AdminLibrary";
import BillingAdminPanel from "@/components/admin/BillingAdminPanel";

export default function AdminConsole() {
  const [tab, setTab] = useState<"billing" | "library">("billing");

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

        <div className="mb-6 flex flex-wrap gap-2 rounded-2xl border border-border bg-bg-surface p-2">
          <button
            type="button"
            onClick={() => setTab("billing")}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${
              tab === "billing"
                ? "bg-accent text-white"
                : "text-txt-muted hover:bg-bg-hover hover:text-txt"
            }`}
          >
            <CreditCard size={15} />
            Billing Ops
          </button>
          <button
            type="button"
            onClick={() => setTab("library")}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${
              tab === "library"
                ? "bg-accent text-white"
                : "text-txt-muted hover:bg-bg-hover hover:text-txt"
            }`}
          >
            <BookCopy size={15} />
            BOQ Library
          </button>
        </div>

        <div className="rounded-2xl border border-border bg-bg p-6">
          {tab === "billing" ? <BillingAdminPanel /> : <AdminLibrary embedded />}
        </div>
      </div>
    </div>
  );
}
