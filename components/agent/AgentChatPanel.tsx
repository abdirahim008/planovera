"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, X, Send, Bot, Loader2 } from "lucide-react";
import { v4 as uuid } from "uuid";

import { useAppStore } from "@/lib/store";
import { requestFeedbackForm } from "@/lib/feedback";
import type { AgentContext, AgentResponse, AgentTable } from "@/lib/agent/types";
import { buildProjectSnapshot, buildPortfolioSnapshot } from "@/lib/agent/snapshot";

// A message in the visible thread. Only `variant: "chat"` lines are sent back to
// the model as conversation; error lines are local UI feedback.
type Variant = "chat" | "error";
interface PanelMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  variant: Variant;
  table?: AgentTable | null;
}

const GREETING =
  "Hi! I'm your project analyst. Ask me anything about your projects and I'll answer from your live figures — progress, money certified, what's delayed, and so on. I can forecast (e.g. when a project will actually finish at the current pace) and build comparison tables across your whole portfolio. I only read your data — I don't change anything.";

const SUGGESTIONS = [
  "When will this project actually finish at the current pace?",
  "Is this project ahead or behind schedule?",
  "How much have I certified to date?",
  "Which activities are delayed?",
  "Table of my projects: progress, financial progress, schedule status",
  "Which projects are behind schedule?",
];

function AgentTableView({ table }: { table: AgentTable }) {
  return (
    <div className="w-full max-w-full overflow-x-auto rounded-xl border border-border bg-bg-surface">
      {table.title ? (
        <div className="border-b border-border px-3 py-1.5 text-[12px] font-semibold text-txt">{table.title}</div>
      ) : null}
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr className="bg-bg-raised text-left">
            {table.columns.map((col, i) => (
              <th key={i} className="whitespace-nowrap px-2.5 py-1.5 font-semibold text-txt-muted">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, r) => (
            <tr key={r} className="border-t border-border">
              {row.map((cell, c) => (
                <td key={c} className="px-2.5 py-1.5 align-top text-txt">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AgentChatPanel() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<PanelMessage[]>([
    { id: uuid(), role: "assistant", content: GREETING, variant: "chat" },
  ]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, open, busy]);

  function push(role: PanelMessage["role"], content: string, variant: Variant = "chat", table?: AgentTable | null) {
    setMessages((prev) => [...prev, { id: uuid(), role, content, variant, table }]);
  }

  // ── read-only context snapshot for the model ───────────────────────────────
  // Everything here is derived, read-only figures the assistant reasons over —
  // the same numbers the dashboard shows. Nothing is ever written back.
  function buildContext(): AgentContext {
    const st = useAppStore.getState();
    const project = st.project;
    return {
      hasProject: Boolean(project),
      projectId: project?.id,
      projectName: project?.name,
      projectType: project?.type,
      currentModule: st.activeModule,
      existingProjects: st.projects.map((p) => p.name),
      // Authoritative read-only figures so the assistant answers questions and
      // forecasts consistently with the dashboard.
      snapshot: buildProjectSnapshot(st) as unknown as Record<string, unknown> | null,
      // Slim per-project rows so portfolio questions work even with no active project.
      portfolio: buildPortfolioSnapshot(st) as unknown as Record<string, unknown>[],
    };
  }

  // ── send a turn ─────────────────────────────────────────────────────────────
  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setInput("");
    push("user", trimmed, "chat");
    setBusy(true);

    try {
      // Only real chat turns become conversation history for the model.
      const history = [...messages, { role: "user" as const, content: trimmed, variant: "chat" as const }]
        .filter((m) => m.variant === "chat")
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await fetch("/api/ai/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: history, context: buildContext() }),
      });
      const data = (await res.json()) as AgentResponse & { error?: string };
      if (!res.ok) throw new Error(data.error || "The assistant could not respond.");

      push("assistant", data.reply || "Okay.", "chat", data.table);
    } catch (err) {
      push("assistant", err instanceof Error ? err.message : "Something went wrong.", "error");
    } finally {
      setBusy(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  // ── render ──────────────────────────────────────────────────────────────────
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-[900] inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-accent/30 transition hover:brightness-110"
        aria-label="Open assistant"
      >
        <Sparkles size={18} />
        <span className="hidden sm:inline">Ask about your projects</span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-[900] flex h-[min(80vh,640px)] w-[min(380px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-border bg-bg-surface shadow-2xl">
      <div className="flex items-center gap-2 border-b border-border bg-bg-raised px-4 py-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/15 text-accent">
          <Bot size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-txt">Project Analyst</div>
          <div className="truncate text-[11px] text-txt-dim">Answers &amp; forecasts from your data — read-only</div>
        </div>
        <button
          type="button"
          onClick={() => requestFeedbackForm()}
          className="rounded-lg px-2 py-1 text-[11px] font-semibold text-txt-dim transition hover:bg-bg-hover hover:text-txt"
          title="Tell the Planovera team about a problem or an idea"
        >
          Report a problem
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-txt-dim transition hover:bg-bg-hover hover:text-txt"
          aria-label="Close assistant"
        >
          <X size={18} />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-auto px-4 py-4">
        {messages.map((m) => {
          if (m.variant === "error") {
            return (
              <div
                key={m.id}
                className="rounded-lg border border-err/30 bg-err/10 px-3 py-2 text-[12px] text-err"
              >
                {m.content}
              </div>
            );
          }
          const isUser = m.role === "user";
          return (
            <div key={m.id} className={`flex flex-col gap-1.5 ${isUser ? "items-end" : "items-start"}`}>
              <div
                className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed ${
                  isUser
                    ? "bg-accent text-white"
                    : "bg-bg-raised text-txt"
                }`}
              >
                {m.content}
              </div>
              {m.table ? <AgentTableView table={m.table} /> : null}
            </div>
          );
        })}

        {messages.length <= 1 && (
          <div className="space-y-2 pt-1">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => send(s)}
                className="block w-full rounded-lg border border-border bg-bg px-3 py-2 text-left text-[12px] text-txt transition hover:border-accent/50 hover:bg-bg-hover"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {busy && (
          <div className="flex items-center gap-2 text-[12px] text-txt-dim">
            <Loader2 size={14} className="animate-spin" />
            Thinking…
          </div>
        )}
      </div>

      <div className="border-t border-border bg-bg-raised p-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={1}
            placeholder="Ask about progress, money, delays, forecasts…"
            disabled={busy}
            className="max-h-28 min-h-[40px] flex-1 resize-none rounded-xl border border-border bg-bg px-3 py-2 text-[13px] text-txt outline-none transition focus:border-accent disabled:opacity-60"
          />
          <button
            type="button"
            onClick={() => send(input)}
            disabled={busy || !input.trim()}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-white transition hover:brightness-110 disabled:opacity-40"
            aria-label="Send"
          >
            <Send size={16} />
          </button>
        </div>
        <div className="mt-1.5 text-center text-[10px] text-txt-dim">
          Answers come from your live data. Forecasts are estimates — sense-check before relying on them.
        </div>
      </div>
    </div>
  );
}
