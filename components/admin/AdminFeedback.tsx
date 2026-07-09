"use client";

import { CheckCircle2, RefreshCcw, Star, Undo2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  fetchFeedback,
  setFeedbackStatus,
  type FeedbackEntry,
  type FeedbackStatus,
} from "@/lib/feedback";

const CATEGORY_LABELS: Record<string, string> = {
  problem: "Problem",
  idea: "Suggestion",
  other: "Other",
};

// Admin triage for in-app feedback: read what users submitted (with the
// module/page context captured automatically) and mark entries reviewed.
export default function AdminFeedback() {
  const [entries, setEntries] = useState<FeedbackEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | FeedbackStatus>("new");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { entries: list, error } = await fetchFeedback();
    setEntries(list);
    setNotice(error ? `Could not load feedback: ${error}` : null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(
    () => (filter === "all" ? entries : entries.filter((entry) => entry.status === filter)),
    [entries, filter],
  );
  const newCount = entries.filter((entry) => entry.status === "new").length;

  const toggleStatus = async (entry: FeedbackEntry) => {
    const next: FeedbackStatus = entry.status === "new" ? "reviewed" : "new";
    setBusyId(entry.id);
    const { error } = await setFeedbackStatus(entry.id, next);
    setBusyId(null);
    if (error) {
      setNotice(`Update failed: ${error}`);
      return;
    }
    setEntries((current) =>
      current.map((item) => (item.id === entry.id ? { ...item, status: next } : item)),
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-txt">User feedback</h2>
        <p className="mt-1 text-sm leading-6 text-txt-muted">
          What users submitted from the “Send feedback” form — experience ratings, problems and
          suggestions, with the module and page captured automatically.
        </p>
      </div>

      {notice ? (
        <div className="rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-sm text-accent">
          {notice}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {(["new", "reviewed", "all"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold capitalize transition ${
              filter === value
                ? "border-accent bg-accent/10 text-accent"
                : "border-border text-txt-muted hover:text-txt"
            }`}
          >
            {value}
            {value === "new" && newCount > 0 ? ` (${newCount})` : ""}
          </button>
        ))}
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent/10 px-3.5 py-2 text-sm font-medium text-accent transition hover:bg-accent/20 disabled:opacity-40"
        >
          <RefreshCcw size={14} /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-border bg-bg-surface px-4 py-5 text-sm text-txt-muted">
          Loading feedback…
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-txt-muted">
          {filter === "new" ? "No new feedback — all caught up." : "Nothing here yet."}
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((entry) => (
            <div key={entry.id} className="rounded-xl border border-border bg-bg-surface p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                    entry.category === "problem"
                      ? "bg-err/10 text-err"
                      : entry.category === "idea"
                        ? "bg-ok/10 text-ok"
                        : "bg-bg-hover text-txt-muted"
                  }`}
                >
                  {CATEGORY_LABELS[entry.category] ?? entry.category}
                </span>
                {entry.rating ? (
                  <span className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((value) => (
                      <Star
                        key={value}
                        size={12}
                        className={
                          value <= (entry.rating ?? 0)
                            ? "fill-amber-400 text-amber-400"
                            : "text-txt-dim"
                        }
                      />
                    ))}
                  </span>
                ) : null}
                <span className="text-xs text-txt-muted">{entry.user_email ?? "unknown user"}</span>
                <span className="text-xs text-txt-dim">
                  {entry.module ? `· ${entry.module}` : ""} · {entry.created_at.slice(0, 16).replace("T", " ")}
                </span>
                <button
                  type="button"
                  onClick={() => void toggleStatus(entry)}
                  disabled={busyId === entry.id}
                  className={`ml-auto inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold transition disabled:opacity-40 ${
                    entry.status === "new"
                      ? "border-ok/40 text-ok hover:bg-ok/10"
                      : "border-border text-txt-muted hover:text-txt"
                  }`}
                >
                  {entry.status === "new" ? (
                    <>
                      <CheckCircle2 size={12} /> Mark reviewed
                    </>
                  ) : (
                    <>
                      <Undo2 size={12} /> Reopen
                    </>
                  )}
                </button>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-txt">{entry.message}</p>
              {entry.page ? <p className="mt-1 text-[11px] text-txt-dim">{entry.page}</p> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
