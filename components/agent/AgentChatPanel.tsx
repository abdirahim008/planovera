"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sparkles, X, Send, Bot, Loader2 } from "lucide-react";
import { v4 as uuid } from "uuid";

import { useAppStore } from "@/lib/store";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase-browser";
import {
  mapProjectRecord,
  toProjectRecord,
  type Project,
  type ProjectRecord,
  type BOQSheet,
  type WorkPlanSheet,
  type WorkPlanActivity,
  type GeneratedDocument,
  type DocumentTemplateType,
} from "@/lib/supabase";
import type {
  AgentAction,
  AgentContext,
  AgentProjectDraft,
  AgentResponse,
  WorkPlanDraftResponse,
  DocumentDraftResponse,
} from "@/lib/agent/types";

// A message in the visible thread. Only `variant: "chat"` lines are sent back to
// the model as conversation; status/error lines are local UI feedback.
type Variant = "chat" | "status" | "error";
interface PanelMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  variant: Variant;
}

const GREETING =
  "Hi! I can set things up for you across the app — just tell me what you need. I can create projects, draft BOQs, build work plans, start progress reports, write documents (letters, reports), and scaffold payment certificates. For example: \"Create a project called Hargeisa Water Supply\", then \"draft a BOQ for an elevated water tank and septic tank\", then \"make a work plan from it\".";

const SUGGESTIONS = [
  "Create a project called Hargeisa Water Supply",
  "Draft a BOQ for an elevated water tank and septic tank",
  "Generate a work plan from this BOQ",
  "Write a commencement letter to the contractor",
  "Start a progress report",
  "Raise an interim payment certificate",
];

// ─── date helpers (sequential scheduling of generated activities) ────────────
function pad(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function addDaysISO(iso: string, days: number) {
  const [y, m, d] = iso.split("-").map((x) => parseInt(x, 10));
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

export default function AgentChatPanel() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<PanelMessage[]>([
    { id: uuid(), role: "assistant", content: GREETING, variant: "chat" },
  ]);

  const router = useRouter();
  const pathname = usePathname();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, open, busy]);

  function push(role: PanelMessage["role"], content: string, variant: Variant = "chat") {
    setMessages((prev) => [...prev, { id: uuid(), role, content, variant }]);
  }

  // ── context snapshot for the model ─────────────────────────────────────────
  function buildContext(): AgentContext {
    const st = useAppStore.getState();
    const project = st.project;
    const items = st.boqSheets.reduce(
      (n, s) => n + s.rows.filter((r) => r.type === "item").length,
      0,
    );
    const savedForProject = project
      ? st.savedBOQs.some((b) => b.project_id === project.id)
      : false;
    return {
      hasProject: Boolean(project),
      projectId: project?.id,
      projectName: project?.name,
      projectType: project?.type,
      currentModule: st.activeModule,
      existingProjects: st.projects.map((p) => p.name),
      hasBOQ: items > 0 || savedForProject,
      boqItemCount: items,
    };
  }

  // ── action executors ───────────────────────────────────────────────────────
  async function createProject(draft: AgentProjectDraft) {
    const st = useAppStore.getState();
    const now = new Date().toISOString();
    // Best-effort org scoping: attach to the first known program's org so the row
    // is visible under org accounts; harmless ("") for individual/demo accounts.
    const orgId = st.programs[0]?.organizationId || "";
    const project: Project = {
      id: uuid(),
      programId: "",
      categoryId: "",
      organizationId: orgId,
      name: draft.name,
      type: draft.projectType || "construction",
      role: draft.role || "contractor",
      created_at: now,
      location: draft.location || "",
      region: draft.region || "",
      town: draft.town || "",
      clientName: draft.clientName || "",
      contractorName: draft.contractorName || "",
      consultantName: draft.consultantName || "",
      contractNumber: draft.contractNumber || "",
      contractTitle: draft.contractTitle || "",
      contractAmount: draft.contractAmount || "",
      currency: draft.currency || "USD",
    };

    if (isSupabaseConfigured()) {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) throw new Error("Supabase is not available.");
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) throw new Error("You need to be signed in to create a project.");
      const { data, error } = await supabase
        .from("projects")
        .insert(toProjectRecord(project, user.id))
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      st.createNewProject(mapProjectRecord(data as ProjectRecord));
    } else {
      st.createNewProject(project);
    }
    push("assistant", `✅ Created project "${project.name}" and opened it.`, "status");
  }

  function selectProjectByName(name: string) {
    const st = useAppStore.getState();
    const needle = name.trim().toLowerCase();
    const match =
      st.projects.find((p) => p.name.toLowerCase() === needle) ||
      st.projects.find((p) => p.name.toLowerCase().includes(needle));
    if (!match) {
      push("assistant", `I couldn't find a project named "${name}".`, "error");
      return;
    }
    st.selectProject(match.id);
    push("assistant", `📂 Opened "${match.name}".`, "status");
  }

  async function draftBoq(brief: string, boqName?: string) {
    const st = useAppStore.getState();
    if (!st.project) {
      push("assistant", "Let's set up a project first — what should I call it?", "status");
      return;
    }
    push("assistant", "Drafting the BOQ…", "status");
    const res = await fetch("/api/ai/boq", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ brief }),
    });
    const data = (await res.json()) as { sheets?: BOQSheet[]; error?: string };
    if (!res.ok || !data.sheets?.length) {
      throw new Error(data.error || "The BOQ draft came back empty.");
    }
    const name = boqName?.trim() || "AI draft BOQ";
    st.createBOQ(name);
    st.loadBOQFromLibrary(data.sheets);
    st.saveBOQ();
    st.setActiveModule("boq");
    const itemCount = data.sheets.reduce(
      (n, s) => n + s.rows.filter((r) => r.type === "item").length,
      0,
    );
    push(
      "assistant",
      `✅ Drafted "${name}" — ${data.sheets.length} sheet(s), ${itemCount} items. Opened the BOQ. Add your rates, or ask me to build a work plan from it.`,
      "status",
    );
  }

  async function generateWorkPlan(startDate?: string, planName?: string) {
    const st = useAppStore.getState();
    if (!st.project) {
      push("assistant", "Open or create a project first, then I can build its work plan.", "status");
      return;
    }
    // Prefer the BOQ currently open; fall back to the project's most recent saved BOQ.
    let sheets: BOQSheet[] = st.boqSheets;
    const hasItems = sheets.some((s) => s.rows.some((r) => r.type === "item"));
    if (!hasItems) {
      const saved = st.savedBOQs.filter((b) => b.project_id === st.project!.id);
      const latest = saved[saved.length - 1];
      sheets = latest?.sheets || [];
    }
    const items = sheets.flatMap((s) =>
      s.rows
        .filter((r) => (r.type === "header" || r.type === "item") && r.description.trim())
        .map((r) => (r.type === "header" ? `SECTION: ${r.description}` : `- ${r.description}`)),
    );
    if (items.length === 0) {
      push("assistant", "There's no BOQ to plan from yet. Want me to draft a BOQ first?", "status");
      return;
    }

    push("assistant", "Building the work plan…", "status");
    const res = await fetch("/api/ai/workplan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ items }),
    });
    const data = (await res.json()) as WorkPlanDraftResponse & { error?: string };
    if (!res.ok || !data.sheets?.length) {
      throw new Error(data.error || "The work plan came back empty.");
    }

    // Schedule activities sequentially; sections keep blank dates (store derives spans).
    let cursor = startDate?.trim() || todayISO();
    const planSheets: WorkPlanSheet[] = data.sheets.map((sheet, idx) => {
      const activities: WorkPlanActivity[] = sheet.activities.map((a) => {
        if (a.rowType === "section") {
          return {
            id: uuid(),
            project_id: st.project!.id,
            rowType: "section",
            description: a.description,
            duration: "",
            startDate: "",
            endDate: "",
            status: "pending",
          };
        }
        const days = Math.max(1, parseInt(a.duration || "1", 10) || 1);
        const start = cursor;
        const end = addDaysISO(start, days);
        cursor = end;
        return {
          id: uuid(),
          project_id: st.project!.id,
          rowType: "activity",
          description: a.description,
          duration: String(days),
          startDate: start,
          endDate: end,
          status: "pending",
        };
      });
      return { id: uuid(), name: sheet.name, sort_order: idx, activities };
    });

    const name = planName?.trim() || "AI work plan";
    st.createWorkPlan(name);
    st.loadWorkPlanFromDraft(planSheets);
    st.saveWorkPlan();
    st.setActiveModule("workplan");
    const activityCount = planSheets.reduce(
      (n, s) => n + s.activities.filter((a) => a.rowType !== "section").length,
      0,
    );
    push(
      "assistant",
      `✅ Built "${name}" — ${activityCount} scheduled activities. Opened the Work Plan. Adjust dates and durations as needed.`,
      "status",
    );
  }

  // Most recent saved BOQ (with items) for the active project — the source for
  // progress reports and payment certificates.
  function latestProjectBoqId(): string | null {
    const st = useAppStore.getState();
    if (!st.project) return null;
    const saved = st.savedBOQs.filter(
      (b) => b.project_id === st.project!.id && b.sheets.some((s) => s.rows.some((r) => r.type === "item")),
    );
    return saved.length ? saved[saved.length - 1].id : null;
  }

  async function createProgressReport(name?: string, inputMode?: "quantity" | "percent") {
    const st = useAppStore.getState();
    if (!st.project) {
      push("assistant", "Open or create a project first, then I can start a progress report.", "status");
      return;
    }
    const isConstruction = st.project.type === "construction";
    const sourceType: "boq" | "items" = isConstruction ? "boq" : "items";
    const sourceId = isConstruction
      ? latestProjectBoqId()
      : (st.savedSimpleItemSets.filter((x) => x.project_id === st.project!.id).slice(-1)[0]?.id ?? null);
    if (!sourceId) {
      push(
        "assistant",
        isConstruction
          ? "There's no BOQ to measure against yet. Want me to draft a BOQ first?"
          : "There's no item list to measure against yet. Add one first.",
        "status",
      );
      return;
    }
    const count = st.progressReports.filter((r) => r.project_id === st.project!.id).length;
    const reportName = name?.trim() || `Progress Report ${count + 1}`;
    st.createProgressReport(reportName, sourceType, sourceId, null, inputMode || "percent");
    st.setActiveModule("progress");
    push(
      "assistant",
      `✅ Started "${reportName}". Opened Progress — enter the ${inputMode === "quantity" ? "quantities" : "percentages"} done this period.`,
      "status",
    );
  }

  async function draftDocument(templateType: DocumentTemplateType, title?: string, brief?: string) {
    const st = useAppStore.getState();
    const project = st.project;
    if (!project) {
      push("assistant", "Open or create a project first, then I can draft a document for it.", "status");
      return;
    }
    push("assistant", "Writing the document…", "status");
    const res = await fetch("/api/ai/document", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        templateType,
        brief,
        context: {
          projectName: project.name,
          contractTitle: project.contractTitle,
          clientName: project.clientName,
          contractorName: project.contractorName,
          consultantName: project.consultantName,
          location: project.location,
        },
      }),
    });
    const data = (await res.json()) as DocumentDraftResponse & { error?: string };
    if (!res.ok || !data.content) {
      throw new Error(data.error || "The document draft came back empty.");
    }

    const date = todayISO();
    const refBase = (project.contractNumber || project.code || "PB").toUpperCase();
    const docCount = st.generatedDocuments.filter((d) => d.project_id === project.id).length;
    // Minimal document — the Documents module hydrates letterhead/branding/cover
    // from the project at render time; only the body text is AI-authored here.
    const doc: GeneratedDocument = {
      id: uuid(),
      project_id: project.id,
      title: title?.trim() || data.title || templateType.replace(/-/g, " "),
      templateType,
      referenceNo: `${refBase}/${date.replace(/-/g, "/")}/${docCount + 1}`,
      date,
      status: "draft",
      content: data.content,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    st.addGeneratedDocument(doc);
    st.setActiveModule("documents");
    push(
      "assistant",
      `✅ Drafted "${doc.title}". Opened Documents — review the wording, then issue or export it.`,
      "status",
    );
  }

  async function createPaymentCertificate(certType: "interim" | "final") {
    const st = useAppStore.getState();
    if (!st.project) {
      push("assistant", "Open or create a project first to raise a payment certificate.", "status");
      return;
    }
    if (st.project.type !== "construction") {
      push("assistant", "Payment certificates are only available on construction projects.", "status");
      return;
    }
    const boqId = latestProjectBoqId();
    if (!boqId) {
      push("assistant", "A payment certificate is built from the BOQ, and there isn't one yet. Want me to draft a BOQ first?", "status");
      return;
    }
    st.addCertificate(certType, boqId, undefined);
    st.setActiveModule("payment");
    const label = certType === "final" ? "final certificate" : "interim payment certificate (IPC)";
    push(
      "assistant",
      `✅ Created a draft ${label} from the BOQ. Opened Payments — enter the cumulative quantities done; the app computes retention, advance recovery and totals.`,
      "status",
    );
  }

  async function runAction(action: AgentAction) {
    // Workspace actions only make sense on the workspace page — bring the user there.
    if (action.type !== "none" && pathname !== "/workspace") {
      router.push("/workspace");
    }
    switch (action.type) {
      case "create_project":
        await createProject(action.project);
        break;
      case "select_project":
        selectProjectByName(action.name);
        break;
      case "draft_boq":
        await draftBoq(action.brief, action.boqName);
        break;
      case "generate_work_plan":
        await generateWorkPlan(action.startDate, action.planName);
        break;
      case "create_progress_report":
        await createProgressReport(action.name, action.inputMode);
        break;
      case "draft_document":
        await draftDocument(action.templateType, action.title, action.brief);
        break;
      case "create_payment_certificate":
        await createPaymentCertificate(action.certType || "interim");
        break;
      case "open_module":
        useAppStore.getState().setActiveModule(action.module);
        break;
      case "none":
      default:
        break;
    }
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

      push("assistant", data.reply || "Okay.", "chat");
      await runAction(data.action);
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
        className="fixed right-3 top-3 z-[900] inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-accent/30 transition hover:brightness-110"
        aria-label="Open assistant"
      >
        <Sparkles size={18} />
        <span className="hidden sm:inline">Assistant</span>
      </button>
    );
  }

  return (
    <div className="fixed right-3 top-3 z-[900] flex h-[min(80vh,640px)] w-[min(380px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-border bg-bg-surface shadow-2xl">
      <div className="flex items-center gap-2 border-b border-border bg-bg-raised px-4 py-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/15 text-accent">
          <Bot size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-txt">Planovera Assistant</div>
          <div className="truncate text-[11px] text-txt-dim">Creates projects, BOQs &amp; work plans for you</div>
        </div>
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
          if (m.variant === "status") {
            return (
              <div key={m.id} className="text-center text-[12px] text-txt-dim">
                {m.content}
              </div>
            );
          }
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
            <div key={m.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed ${
                  isUser
                    ? "bg-accent text-white"
                    : "bg-bg-raised text-txt"
                }`}
              >
                {m.content}
              </div>
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
            placeholder="Tell me what to set up…"
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
          AI estimates — review BOQs and rates before use.
        </div>
      </div>
    </div>
  );
}
