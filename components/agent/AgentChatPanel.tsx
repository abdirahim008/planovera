"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sparkles, X, Send, Bot, Loader2 } from "lucide-react";
import { v4 as uuid } from "uuid";

import { useAppStore } from "@/lib/store";
import { requestFeedbackForm } from "@/lib/feedback";
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
  AgentTable,
  WorkPlanDraftResponse,
  DocumentDraftResponse,
  DocumentFillResponse,
} from "@/lib/agent/types";
import { buildProjectSnapshot, buildPortfolioSnapshot } from "@/lib/agent/snapshot";

// A message in the visible thread. Only `variant: "chat"` lines are sent back to
// the model as conversation; status/error lines are local UI feedback.
type Variant = "chat" | "status" | "error";
interface PanelMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  variant: Variant;
  table?: AgentTable | null;
}

const GREETING =
  "Hi! I can set things up for you and answer questions about your project. I can create projects, draft BOQs, build work plans, start progress reports, write documents, and scaffold payment certificates — and tell you things like what's certified to date or which activities are delayed. Just say what you need.";

const SUGGESTIONS = [
  "Create a new project",
  "Draft a BOQ",
  "Generate a work plan",
  "Write a document",
  "List my projects with status",
  "Which projects are behind schedule?",
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

  const router = useRouter();
  const pathname = usePathname();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, open, busy]);

  function push(role: PanelMessage["role"], content: string, variant: Variant = "chat", table?: AgentTable | null) {
    setMessages((prev) => [...prev, { id: uuid(), role, content, variant, table }]);
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
      // Authoritative read-only figures so the assistant can answer questions
      // ("certified to date?", "which activities are delayed?") consistently
      // with the dashboard.
      snapshot: buildProjectSnapshot(st) as unknown as Record<string, unknown> | null,
      // Slim per-project rows so portfolio questions work even with no active project.
      portfolio: buildPortfolioSnapshot(st) as unknown as Record<string, unknown>[],
      activeDocument: (() => {
        const d = st.activeGeneratedDocumentId
          ? st.generatedDocuments.find((x) => x.id === st.activeGeneratedDocumentId)
          : null;
        return d ? { id: d.id, templateType: d.templateType, title: d.title } : null;
      })(),
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

  async function generateWorkPlan(
    startDate?: string,
    planName?: string,
    endDate?: string,
    durationDays?: number,
    mode?: "new" | "update",
    brief?: string,
  ) {
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
    // With a BOQ we plan from its items; without one we plan from a works
    // description (the agent supplies a brief, or infers it from the project).
    const briefText = brief?.trim() || "";
    if (items.length === 0 && !briefText) {
      push(
        "assistant",
        "There's no BOQ to plan from yet. Tell me what the works involve (e.g. \"a 2 km gravel road with drainage and culverts\") and I'll build a timeline — or I can draft a BOQ first.",
        "status",
      );
      return;
    }

    // Timeline calibration: explicit params win, then the project record's own
    // dates, then today. The window (if known) lets the AI fit the critical
    // path into the real contract period.
    const anchorStart = startDate?.trim() || st.project.start_date || todayISO();
    const anchorEnd = endDate?.trim() || st.project.end_date || "";
    push("assistant", "Building the work plan…", "status");

    // Try the AI planner; if it's unavailable or returns nothing, fall back to a
    // sequential plan built straight from the BOQ so the user always gets a
    // usable, linked timeline they can refine — never a dead end.
    let draftSheets: WorkPlanDraftResponse["sheets"] | null = null;
    try {
      const res = await fetch("/api/ai/workplan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          // The route uses items when present, else the brief. We send both so
          // a BOQ-backed project plans from its items and a BOQ-less one plans
          // from the works description.
          items,
          brief: briefText || undefined,
          startDate: anchorStart,
          endDate: anchorEnd || undefined,
          durationDays: durationDays || undefined,
        }),
      });
      const data = (await res.json()) as WorkPlanDraftResponse & { error?: string };
      if (res.ok && data.sheets?.length) draftSheets = data.sheets;
    } catch {
      /* network/transport error — fall through to the local fallback */
    }
    const usedFallback = !draftSheets;
    if (!draftSheets) {
      // The sequential fallback needs BOQ lines to lay out. For a BOQ-less
      // (brief-only) project there's nothing to fall back to, so ask the user
      // to retry rather than building an empty plan.
      if (items.length === 0) {
        push(
          "assistant",
          "I couldn't build the timeline just now — please try again, or add a bit more detail about the works.",
          "status",
        );
        return;
      }
      draftSheets = buildSequentialDraftFromItems(items, anchorStart, anchorEnd);
    }

    // Build activities with real ids and MS Project-style finish-to-start
    // links. The AI references predecessors by 1-based row position; map those
    // to activity ids — the store's dependency scheduler computes all dates.
    // Activities without predecessors anchor at the start date; any
    // non-first activity the AI left unlinked chains to the previous activity
    // so the network stays connected.
    const planSheets: WorkPlanSheet[] = draftSheets.map((sheet, idx) => {
      const rowIds = sheet.activities.map(() => uuid());
      let previousActivityRow = -1;
      const activities: WorkPlanActivity[] = sheet.activities.map((a, rowIdx) => {
        if (a.rowType === "section") {
          return {
            id: rowIds[rowIdx],
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
        const predecessorRows = (a.predecessors ?? [])
          .map((p) => p - 1)
          .filter(
            (p) =>
              p >= 0 &&
              p < rowIdx &&
              sheet.activities[p]?.rowType !== "section",
          );
        if (predecessorRows.length === 0 && previousActivityRow >= 0) {
          predecessorRows.push(previousActivityRow);
        }
        previousActivityRow = rowIdx;
        const isRoot = predecessorRows.length === 0;
        return {
          id: rowIds[rowIdx],
          project_id: st.project!.id,
          rowType: "activity",
          description: a.description,
          duration: String(days),
          // Roots anchor at the project start; linked rows are computed by the
          // dependency scheduler inside loadWorkPlanFromDraft.
          startDate: isRoot ? anchorStart : "",
          endDate: isRoot ? addDaysISO(anchorStart, days - 1) : "",
          status: "pending",
          predecessorIds: predecessorRows.map((p) => rowIds[p]),
        };
      });
      return { id: uuid(), name: sheet.name, sort_order: idx, activities };
    });

    const updating = mode === "update" && Boolean(st.activeWorkPlanId);
    const name = updating
      ? st.savedWorkPlans.find((p) => p.id === st.activeWorkPlanId)?.name || "work plan"
      : planName?.trim() || "AI work plan";
    if (!updating) st.createWorkPlan(name);
    st.loadWorkPlanFromDraft(planSheets);
    st.saveWorkPlan();
    st.setActiveModule("workplan");
    const activityCount = planSheets.reduce(
      (n, s) => n + s.activities.filter((a) => a.rowType !== "section").length,
      0,
    );
    push(
      "assistant",
      usedFallback
        ? `✅ ${updating ? `Updated "${name}"` : `Built "${name}"`} — ${activityCount} activities scheduled sequentially from ${anchorStart}. (The AI planner was busy, so I laid them out from your BOQ; edit any duration or the Predecessors column and the rest reflow automatically.)`
        : `✅ ${updating ? `Updated "${name}"` : `Built "${name}"`} — ${activityCount} activities scheduled with linked dependencies from ${anchorStart}. Opened the Work Plan; shift any activity and its successors reflow automatically.`,
      "status",
    );
  }

  // Fallback plan when the AI planner is unavailable: parse the BOQ lines
  // (SECTION: / - item) into a single sheet, distributing the project window
  // evenly across activities. Predecessors are left blank — the executor chains
  // each activity to the previous one, so the timeline still cascades on edit.
  function buildSequentialDraftFromItems(
    items: string[],
    startIso: string,
    endIso: string,
  ): WorkPlanDraftResponse["sheets"] {
    const rows = items.map((line) =>
      line.startsWith("SECTION: ")
        ? { rowType: "section" as const, description: line.slice("SECTION: ".length).trim() }
        : { rowType: "activity" as const, description: line.replace(/^-\s*/, "").trim() },
    );
    const activityCount = Math.max(1, rows.filter((r) => r.rowType === "activity").length);
    let perActivity = 7;
    if (endIso) {
      const start = new Date(`${startIso}T00:00:00`);
      const end = new Date(`${endIso}T00:00:00`);
      const span = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
      if (span > 0) perActivity = Math.max(1, Math.round(span / activityCount));
    }
    return [
      {
        name: "Schedule 1",
        activities: rows.map((r) =>
          r.rowType === "activity"
            ? { rowType: "activity", description: r.description, duration: String(perActivity) }
            : { rowType: "section", description: r.description, duration: "" },
        ),
      },
    ];
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

  // Readable names for the document fields the assistant can fill.
  const FIELD_LABELS: Record<string, string> = {
    executiveSummary: "executive summary",
    forecastNarrative: "forecast / outlook",
    content: "body",
    siteVisitObservationHtml: "observations",
    statusHighlights: "highlights",
    statusIssues: "issues",
    statusUpcoming: "upcoming work",
    statusTopRisks: "top risks",
    statusResourceAsks: "resource asks",
  };

  async function fillDocument(instruction?: string, fields?: string[]) {
    const st = useAppStore.getState();
    const docId = st.activeGeneratedDocumentId;
    const doc = docId ? st.generatedDocuments.find((d) => d.id === docId) : null;
    if (!doc) {
      push(
        "assistant",
        "Open the document you'd like me to fill in the Documents module first, then ask again.",
        "status",
      );
      return;
    }
    push("assistant", "Writing the document sections…", "status");
    const res = await fetch("/api/ai/document-fill", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        templateType: doc.templateType,
        fields,
        instruction,
        context: buildProjectSnapshot(st),
      }),
    });
    const data = (await res.json()) as DocumentFillResponse & { error?: string };
    if (!res.ok || !data.values || Object.keys(data.values).length === 0) {
      throw new Error(data.error || "Nothing was generated for this document.");
    }
    st.updateGeneratedDocument(doc.id, data.values);
    st.setActiveModule("documents");
    const filled = Object.keys(data.values)
      .map((k) => FIELD_LABELS[k] || k)
      .join(", ");
    push(
      "assistant",
      `✅ Filled the ${filled} in "${doc.title}". Review and tweak the wording as needed.`,
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
        await generateWorkPlan(
          action.startDate,
          action.planName,
          action.endDate,
          action.durationDays,
          action.mode,
          action.brief,
        );
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
      case "fill_document":
        await fillDocument(action.instruction, action.fields);
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

      push("assistant", data.reply || "Okay.", "chat", data.table);
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
        className="fixed bottom-4 right-4 z-[900] inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-accent/30 transition hover:brightness-110"
        aria-label="Open assistant"
      >
        <Sparkles size={18} />
        <span className="hidden sm:inline">Assistant</span>
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
          <div className="text-sm font-semibold text-txt">Planovera Assistant</div>
          <div className="truncate text-[11px] text-txt-dim">Sets things up &amp; answers questions for you</div>
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
