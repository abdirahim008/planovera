import { NextResponse } from "next/server";

import { aiChatJSON, isAiConfigured, AiError, type AiChatTurn } from "@/lib/ai/provider";
import { BOQ_LIBRARY_TAXONOMY } from "@/lib/boqLibrary";
import {
  AGENT_MODULES,
  AGENT_DOC_TEMPLATES,
  type AgentAction,
  type AgentContext,
  type AgentModule,
  type AgentResponse,
} from "@/lib/agent/types";
import type { DocumentTemplateType } from "@/lib/supabase";

export const runtime = "nodejs";

// The agent is intentionally a thin "intent picker": one model turn returns a
// human reply plus exactly one structured action. The client executes the
// action against the Zustand store (creating projects, loading BOQs, etc.) and
// calls the dedicated content routes for BOQ/work-plan generation. Keeping the
// heavy content generation out of this route keeps each call cheap and reliable.

const MODULE_SET = new Set<string>(AGENT_MODULES);
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
    `{"type":"open_module","module":"<one of: ${AGENT_MODULES.join(", ")}>"} — navigate the workspace.`,
    "",
    "Answering questions:",
    "- If the user ASKS something about the current project (money certified, progress %, delayed activities, contract value, counts, dates, etc.), answer it directly from the project snapshot below and set action to {\"type\":\"none\"}.",
    "- Use the exact figures from the snapshot; format money with the project currency. If the snapshot doesn't contain the answer, say you don't have that figure rather than guessing. Never invent numbers.",
    "",
    "Rules:",
    "- Take action when the user's intent is clear; do not ask for confirmation of things they already said.",
    "- If the user asks for a BOQ or work plan but no project is active, first guide them to create or select a project (ask or create_project if they gave a name).",
    "- Only ONE action per turn. To do several things, do the first and tell the user the next step in your reply (they will say yes).",
    "- Keep replies short, warm, and plain — no markdown, no code, 1-3 sentences.",
    `- Relevant BOQ categories: ${TAXONOMY_TEXT}.`,
    "- Output JSON only. No prose outside the JSON, no code fences.",
    "",
    "Current workspace state:",
    `- Active project: ${ctx.hasProject ? `${ctx.projectName} (${ctx.projectType || "construction"})` : "none"}`,
    `- Current module: ${ctx.currentModule || "dashboard"}`,
    `- Active project has a BOQ: ${ctx.hasBOQ ? `yes (${ctx.boqItemCount ?? 0} items)` : "no"}`,
    `- Existing projects: ${ctx.existingProjects?.length ? ctx.existingProjects.slice(0, 30).join("; ") : "none"}`,
  ];
  if (ctx.snapshot) {
    lines.push(
      "",
      "Active project snapshot (authoritative figures — answer questions from this):",
      JSON.stringify(ctx.snapshot),
    );
  }
  return lines.join("\n");
}

const str = (v: unknown): string =>
  typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();

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
    const raw = await aiChatJSON<{ reply?: unknown; action?: unknown }>({
      system: buildSystemPrompt(context),
      messages,
      maxTokens: 700,
    });
    const response: AgentResponse = {
      reply: str(raw?.reply) || "Okay.",
      action: normalizeAction(raw?.action),
    };
    return NextResponse.json(response);
  } catch (err) {
    const status = err instanceof AiError ? err.status : 500;
    const message = err instanceof Error ? err.message : "Unexpected error.";
    return NextResponse.json({ error: message }, { status });
  }
}
