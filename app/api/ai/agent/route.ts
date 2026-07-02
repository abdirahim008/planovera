import { NextResponse } from "next/server";

import { aiChatJSON, isAiConfigured, AiError, type AiChatTurn } from "@/lib/ai/provider";
import { guardAiRequest } from "@/lib/ai/access";
import { BOQ_LIBRARY_TAXONOMY } from "@/lib/boqLibrary";
import {
  AGENT_MODULES,
  AGENT_DOC_TEMPLATES,
  type AgentAction,
  type AgentContext,
  type AgentModule,
  type AgentResponse,
  type AgentTable,
} from "@/lib/agent/types";
import type { DocumentTemplateType } from "@/lib/supabase";
import { isModuleEnabled } from "@/lib/modules";

export const runtime = "nodejs";

// The agent is intentionally a thin "intent picker": one model turn returns a
// human reply plus exactly one structured action. The client executes the
// action against the Zustand store (creating projects, loading BOQs, etc.) and
// calls the dedicated content routes for BOQ/work-plan generation. Keeping the
// heavy content generation out of this route keeps each call cheap and reliable.

// Only modules enabled in the current product are offered to / accepted from the model.
const ENABLED_MODULES = AGENT_MODULES.filter(isModuleEnabled);
const MODULE_SET = new Set<string>(ENABLED_MODULES);
const DOC_TEMPLATE_SET = new Set<string>(AGENT_DOC_TEMPLATES);

const TAXONOMY_TEXT = Object.keys(BOQ_LIBRARY_TAXONOMY).join(", ");

function buildSystemPrompt(ctx: AgentContext): string {
  const lines: string[] = [
    "You are Planovera's in-app assistant. Planovera is a construction project-controls app used on East African / Somalia infrastructure projects (BOQ, work plans, payments, progress, documents).",
    "Many users feel overwhelmed by the app's modules and forms. Your job is to do the work for them through chat: create projects, draft Bills of Quantities (BOQ), generate work plans, and navigate the app — so they rarely have to open forms themselves.",
    "",
    "You MUST reply with ONLY a single JSON object of this exact shape:",
    '{"reply":"<short friendly message to the user>","action":<one action object>}',
    "",
    "The action object is exactly ONE of:",
    '{"type":"none"} — when you are only chatting, answering, or need to ask a clarifying question. Put the question in "reply".',
    '{"type":"create_project","project":{"name":"...","projectType":"construction"|"non-construction","role":"contractor"|"supervision"|"employer","location":"...","clientName":"...","contractorName":"...","consultantName":"...","contractNumber":"...","contractAmount":"...","currency":"..."}} — only "name" is required; include other fields only if the user gave them. Default projectType to "construction" and role to "contractor" unless told otherwise.',
    '{"type":"select_project","name":"..."} — switch to an existing project the user names.',
    '{"type":"draft_boq","brief":"<concise works description>","boqName":"<short title>"} — draft a BOQ. Requires an active project. Pack the brief with the elements the user mentioned (e.g. "elevated steel water tank 150 m3 on 12m tower, septic tank 20 m3, pump house, perimeter fence").',
    '{"type":"generate_work_plan","planName":"<short title>","startDate":"YYYY-MM-DD"} — build a work plan from the active project\'s current BOQ. Requires an active project that already has a BOQ. startDate is optional.',
    '{"type":"create_progress_report","name":"<short title>","inputMode":"percent"|"quantity"} — create a progress report the user can fill in. Requires an active project that has a BOQ. Default inputMode to "percent".',
    `{"type":"draft_document","templateType":"<one of: ${AGENT_DOC_TEMPLATES.join(", ")}>","title":"<short title>","brief":"<what the document should say>"} — write a project document/letter. Pick the templateType that best matches the user's request (e.g. a start/commencement order → commencement-letter, an instruction to the contractor → instruction-letter, a one-page RAG update → status-report). Put the specifics in "brief".`,
    '{"type":"create_payment_certificate","certType":"interim"|"final"} — scaffold a payment certificate (IPC) from the project BOQ for the user to enter quantities. Requires an active project that has a BOQ. Default certType to "interim". Never quote money amounts — the app computes them.',
    '{"type":"fill_document","instruction":"<what to write>","fields":[<optional field names>]} — fill the narrative sections of the document CURRENTLY OPEN in the Documents module (e.g. progress report executive summary & forecast, completion certificate body, site-visit observations, status-report highlights/issues). Requires a document to be open (see "Active document open" below). The app writes the fields appropriate to that document type from the real project figures; only pass "fields" if the user named specific sections. If no document is open, ask the user to open the document first.',
    `{"type":"open_module","module":"<one of: ${ENABLED_MODULES.join(", ")}>"} — navigate the workspace.`,
    "",
    "Answering questions:",
    "- If the user ASKS something about the current project (money certified, progress %, delayed activities, contract value, counts, dates, etc.), answer it directly from the project snapshot below and set action to {\"type\":\"none\"}.",
    "- For questions spanning MULTIPLE projects (\"list my projects\", \"which projects are behind schedule?\", \"total certified across projects\"), answer from the portfolio data below. This works even when no single project is active.",
    "- Use the exact figures from the snapshot/portfolio; format money with the relevant project currency. If the data doesn't contain the answer, say you don't have that figure rather than guessing. Never invent numbers.",
    "",
    "Tables:",
    "- When the user asks to LIST or COMPARE multiple items (projects with status, certificates, delayed activities, etc.), populate the optional top-level \"table\" field: {\"title\":\"<short>\",\"columns\":[...],\"rows\":[[...],[...]]}. Keep \"reply\" to a one-line lead-in. Each row must have one cell per column, all strings.",
    "- Use a table only when it genuinely helps; for a single value or short answer, omit \"table\" and just use \"reply\".",
    "",
    "Gather details before acting (ask first, then act — set action to {\"type\":\"none\"} while gathering):",
    "- create_project: you need at least the project NAME. In ONE short, friendly question also ask for the important details: client/employer, contractor, the user's role (contractor / supervision / employer), project type (construction or non-construction), location, and contract amount + currency. Only emit create_project once you have the name; fill in whatever the user gave and leave the rest blank. If the user says 'just create it' or only wants a name, create it with what you have.",
    "- draft_boq: make sure you know WHAT the BOQ should cover. If the request is vague (e.g. just 'create a BOQ' or 'draft a BOQ'), ask the user to describe the works/structures first (e.g. 'an elevated water tank, septic tank and pump house'); only emit draft_boq once you have a concrete scope.",
    "- draft_document: if the document type or its key contents weren't given, ask which document and the essentials before drafting.",
    "- generate_work_plan / create_progress_report / create_payment_certificate build on the active project's BOQ — proceed once that exists; only ask if something essential is genuinely missing (e.g. a useful start date for the work plan).",
    "- Don't over-ask: a single follow-up listing what you need is enough, and never re-ask for things the user already provided. Respect it when the user wants to skip optional fields.",
    "- fill_document needs a document open in the Documents module. If one is open, proceed; if not, tell the user to open the document first.",
    "",
    "Picking a project when none is active:",
    "- If NO project is active and the user asks for a project-specific task or question (BOQ, work plan, progress, a document, payment, or a figure about a project), do NOT guess or pick one yourself. List the existing projects (a short bullet list of their names, or a table) and ask which one they mean.",
    "- When the user names/picks a project, select it with select_project. Then carry out their original request on the next turn (your reply can say what you'll do next).",
    "",
    "Rules:",
    "- Act once you have the essential details (see above); otherwise ask one brief follow-up instead of acting.",
    "- If the user asks for a BOQ or work plan but no project is active, follow 'Picking a project when none is active'.",
    "- Only ONE action per turn. To do several things, do the first and tell the user the next step in your reply (they will say yes).",
    "- Keep replies short, warm, and plain — no markdown, no code, 1-3 sentences.",
    `- Relevant BOQ categories: ${TAXONOMY_TEXT}.`,
    "- Output JSON only. No prose outside the JSON, no code fences.",
    "",
    "Current workspace state:",
    `- Active project: ${ctx.hasProject ? `${ctx.projectName} (${ctx.projectType || "construction"})` : "none"}`,
    `- Current module: ${ctx.currentModule || "dashboard"}`,
    `- Active project has a BOQ: ${ctx.hasBOQ ? `yes (${ctx.boqItemCount ?? 0} items)` : "no"}`,
    `- Active document open: ${ctx.activeDocument ? `${ctx.activeDocument.title} [${ctx.activeDocument.templateType}]` : "none"}`,
    `- Existing projects: ${ctx.existingProjects?.length ? ctx.existingProjects.slice(0, 30).join("; ") : "none"}`,
  ];
  if (ctx.snapshot) {
    lines.push(
      "",
      "Active project snapshot (authoritative figures — answer questions from this):",
      JSON.stringify(ctx.snapshot),
    );
  }
  if (ctx.portfolio?.length) {
    lines.push(
      "",
      "Portfolio (all projects — answer cross-project questions from this; scheduleStatus is progress vs time elapsed):",
      JSON.stringify(ctx.portfolio),
    );
  }
  return lines.join("\n");
}

const str = (v: unknown): string =>
  typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();

// Validate an optional table payload: bounded columns/rows, every cell a string,
// each row padded/truncated to the column count. Returns null if unusable.
function normalizeTable(raw: unknown): AgentTable | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as Record<string, unknown>;
  const columns = (Array.isArray(t.columns) ? t.columns : []).map(str).filter(Boolean).slice(0, 8);
  if (columns.length === 0) return null;
  const rawRows = Array.isArray(t.rows) ? t.rows : [];
  const rows = rawRows
    .slice(0, 60)
    .map((r) => {
      const cells = (Array.isArray(r) ? r : [r]).map(str);
      // Pad/truncate to match the column count.
      while (cells.length < columns.length) cells.push("");
      return cells.slice(0, columns.length);
    });
  if (rows.length === 0) return null;
  const title = str(t.title);
  return { ...(title ? { title } : {}), columns, rows };
}

// Re-validate whatever the model emitted into a safe AgentAction. Anything
// unexpected degrades to {type:"none"} so the client never acts on garbage.
function normalizeAction(raw: unknown): AgentAction {
  if (!raw || typeof raw !== "object") return { type: "none" };
  const a = raw as Record<string, unknown>;
  const type = str(a.type);

  switch (type) {
    case "create_project": {
      const p = (a.project && typeof a.project === "object" ? a.project : {}) as Record<string, unknown>;
      const name = str(p.name);
      if (!name) return { type: "none" };
      const projectType = str(p.projectType) === "non-construction" ? "non-construction" : "construction";
      const roleRaw = str(p.role);
      const role =
        roleRaw === "supervision" || roleRaw === "employer" ? roleRaw : "contractor";
      return {
        type: "create_project",
        project: {
          name,
          projectType,
          role,
          location: str(p.location) || undefined,
          region: str(p.region) || undefined,
          town: str(p.town) || undefined,
          clientName: str(p.clientName) || undefined,
          contractorName: str(p.contractorName) || undefined,
          consultantName: str(p.consultantName) || undefined,
          contractNumber: str(p.contractNumber) || undefined,
          contractTitle: str(p.contractTitle) || undefined,
          contractAmount: str(p.contractAmount) || undefined,
          currency: str(p.currency) || undefined,
        },
      };
    }
    case "select_project": {
      const name = str(a.name);
      return name ? { type: "select_project", name } : { type: "none" };
    }
    case "draft_boq": {
      const brief = str(a.brief);
      if (brief.length < 3) return { type: "none" };
      return { type: "draft_boq", brief, boqName: str(a.boqName) || undefined };
    }
    case "generate_work_plan":
      return {
        type: "generate_work_plan",
        startDate: str(a.startDate) || undefined,
        planName: str(a.planName) || undefined,
      };
    case "create_progress_report":
      return {
        type: "create_progress_report",
        name: str(a.name) || undefined,
        inputMode: str(a.inputMode) === "quantity" ? "quantity" : "percent",
      };
    case "draft_document": {
      const templateType = str(a.templateType);
      if (!DOC_TEMPLATE_SET.has(templateType)) return { type: "none" };
      return {
        type: "draft_document",
        templateType: templateType as DocumentTemplateType,
        title: str(a.title) || undefined,
        brief: str(a.brief) || undefined,
      };
    }
    case "create_payment_certificate":
      return {
        type: "create_payment_certificate",
        certType: str(a.certType) === "final" ? "final" : "interim",
      };
    case "fill_document":
      return {
        type: "fill_document",
        instruction: str(a.instruction) || undefined,
        fields: Array.isArray(a.fields) ? a.fields.map(str).filter(Boolean).slice(0, 10) : undefined,
      };
    case "open_module": {
      const module = str(a.module);
      return MODULE_SET.has(module)
        ? { type: "open_module", module: module as AgentModule }
        : { type: "none" };
    }
    default:
      return { type: "none" };
  }
}

export async function POST(req: Request) {
  const blocked = await guardAiRequest(req);
  if (blocked) return blocked;
  if (!isAiConfigured()) {
    return NextResponse.json(
      { error: "The assistant is not configured on the server." },
      { status: 503 },
    );
  }

  let messages: AiChatTurn[] = [];
  let context: AgentContext = { hasProject: false };
  try {
    const body = (await req.json()) as { messages?: unknown; context?: unknown };
    if (Array.isArray(body?.messages)) {
      messages = body.messages
        .map((m) => {
          const role = (m as { role?: unknown })?.role === "assistant" ? "assistant" : "user";
          const content = str((m as { content?: unknown })?.content);
          return { role, content } as AiChatTurn;
        })
        .filter((m) => m.content)
        .slice(-16); // keep the last few turns; the brief is short
    }
    if (body?.context && typeof body.context === "object") {
      const incoming = body.context as Partial<AgentContext>;
      context = { ...incoming, hasProject: Boolean(incoming.hasProject) };
    }
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    return NextResponse.json({ error: "Say something to the assistant." }, { status: 400 });
  }

  try {
    const raw = await aiChatJSON<{ reply?: unknown; action?: unknown; table?: unknown }>({
      system: buildSystemPrompt(context),
      messages,
      maxTokens: 1500, // higher ceiling so a table answer isn't truncated
    });
    const response: AgentResponse = {
      reply: str(raw?.reply) || "Okay.",
      action: normalizeAction(raw?.action),
      table: normalizeTable(raw?.table),
    };
    return NextResponse.json(response);
  } catch (err) {
    const status = err instanceof AiError ? err.status : 500;
    const message = err instanceof Error ? err.message : "Unexpected error.";
    return NextResponse.json({ error: message }, { status });
  }
}
