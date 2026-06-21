"use client";

import { useState } from "react";
import { ArrowLeft, BookCopy, CreditCard, PencilRuler } from "lucide-react";

import AdminDrawings from "@/components/admin/AdminDrawings";
import AdminLibrary from "@/components/admin/AdminLibrary";
import BillingAdminPanel from "@/components/admin/BillingAdminPanel";

type Tab = "billing" | "library" | "drawings";

// The admin curates the BOQ library and the drawing warehouse from this console
// (not from the studio / warehouse front end).
export default function AdminConsole() {
  const [tab, setTab] = useState<Tab>("billing");

  const tabs: Array<{ id: Tab; label: string; icon: typeof CreditCard }> = [
    { id: "billing", label: "Billing Ops", icon: CreditCard },
    { id: "library", label: "BOQ Library", icon: BookCopy },
    { id: "drawings", label: "Drawing Warehouse", icon: PencilRuler },
  ];

  return (
    <div className="min-h-screen bg-bg p-6">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center gap-3 mb-6">
          <a href="/workspace" className="text-txt-muted hover:text-txt transition-colors">
            <ArrowLeft size={18} />
          </a>
          <div>
            <h1 className="text-xl font-semibold">Platform administration</h1>
          </div>
        </div>

        <div className="mb-6 flex flex-wrap gap-2 rounded-2xl border border-border bg-bg-surface p-2">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${
                tab === id ? "bg-accent text-white" : "text-txt-muted hover:bg-bg-hover hover:text-txt"
              }`}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>

        <div className="rounded-2xl border border-border bg-bg p-6">
          {tab === "billing" ? <BillingAdminPanel /> : null}
          {tab === "library" ? <AdminLibrary embedded /> : null}
          {tab === "drawings" ? <AdminDrawings /> : null}
        </div>
      </div>
    </div>
  );
}
