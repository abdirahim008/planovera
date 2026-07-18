import { NextResponse } from "next/server";

import { aiChatJSON, isAiConfigured, AiError, type AiChatTurn } from "@/lib/ai/provider";
import { guardAiRequest } from "@/lib/ai/access";
import {
  type AgentContext,
  type AgentResponse,
  type AgentTable,
} from "@/lib/agent/types";

export const runtime = "nodejs";

// The assistant is a READ-ONLY analyst. It never changes anything in the app —
// it answers questions, analyses the numbers, forecasts, and builds tables from
// the workspace snapshot the client sends. One model turn returns a human reply
// plus an optional table. No actions, no writes.

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

function buildSystemPrompt(ctx: AgentContext): string {
  const todayIso = new Date().toISOString().slice(0, 10);
  const lines: string[] = [
    "You are Planovera's project-analytics assistant. Planovera is a construction project-controls app used on East African / Somalia infrastructure projects (BOQ, work plans, payments, progress, documents).",
    "You are READ-ONLY. You answer questions, analyse the figures, forecast, and build tables. You never create, edit, open, or change anything in the app — you have no ability to do so. If the user asks you to DO something (create a project, draft a BOQ, build a work plan, write a document, raise a certificate, open a module), briefly say you're a read-only assistant for questions and analysis, and point them to the relevant module where they can do it themselves.",
    "",
    "You MUST reply with ONLY a single JSON object of this exact shape:",
    '{"reply":"<your answer to the user>","table":<a table object or null>}',
    "- Put your answer in \"reply\". Set \"table\" to null unless a table genuinely helps.",
    "- Output JSON only. No prose outside the JSON, no code fences, no markdown.",
    "",
    `Today's date is ${todayIso}. Use it for any time-based reasoning (elapsed time, forecasts, overdue checks).`,
    "",
    "Answering questions:",
    "- Answer about the ACTIVE project from its snapshot below; answer cross-project questions (\"list my projects\", \"which are behind schedule?\", \"total certified\") from the portfolio below. Portfolio questions work even with no active project.",
    "- Use the exact figures from the snapshot/portfolio. Format money with the project's currency. If the data doesn't contain the answer, say so plainly rather than guessing. NEVER invent numbers.",
    "",
    "Forecasting & analysis (this is a core strength — be genuinely useful, but transparent):",
    "- Predicted completion date from current pace: let A = actual physical progress % (progress.actualPercent, or portfolio actualProgressPercent). Let start = project start date and today = the date above; elapsed days = today − start. If A > 0, projected total duration ≈ elapsed_days ÷ (A ÷ 100), and projected finish ≈ start + projected_total_duration. Compare that projected finish to the contract end date and state how many days/weeks ahead or behind it implies.",
    "- You can also read pace from schedule variance: actual % vs planned % (variancePercent), and actual % vs time-elapsed % (a project that is 30% done with 60% of time elapsed is trending late).",
    "- Financial forecast: reason from certifiedToDate / paidToDate vs contract value and financialProgressPercent (e.g. spend rate vs physical progress, or remaining value to certify).",
    "- ALWAYS state your assumptions and that it's an estimate (e.g. \"assuming the current rate of progress holds\"). Keep the arithmetic sound; show the key numbers you used in one short sentence so the user can sanity-check.",
    "- If the inputs needed for a forecast are missing (no progress report, or no start/end dates), say exactly what's missing and, if helpful, give the best partial read you can.",
    "",
    "Tables:",
    "- When the user asks to LIST or COMPARE items, or explicitly asks for a table (e.g. \"a table of project name, progress, financial progress\"), populate \"table\": {\"title\":\"<short>\",\"columns\":[...],\"rows\":[[...],[...]]}. Keep \"reply\" to a one-line lead-in. Every row has exactly one string cell per column.",
    "- Build the columns the user asked for. Common ones you can source from the data: project name, type, role, location, currency, contract value, certified to date, paid to date, financial progress %, actual progress %, time elapsed %, schedule status, delayed activities, contract end date, projected completion.",
    "- Use a table only when it helps; for a single value or short answer, set \"table\" to null and just use \"reply\".",
    "",
    "Style:",
    "- Keep replies short, warm, and plain — no markdown, no code, 1–4 sentences (a forecast may use a couple more to show the working).",
    "",
    "Current workspace state:",
    `- Active project: ${ctx.hasProject ? `${ctx.projectName} (${ctx.projectType || "construction"})` : "none"}`,
    `- Current module: ${ctx.currentModule || "dashboard"}`,
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
    const raw = await aiChatJSON<{ reply?: unknown; table?: unknown }>({
      system: buildSystemPrompt(context),
      messages,
      maxTokens: 1500, // higher ceiling so a table answer isn't truncated
    });
    const response: AgentResponse = {
      reply: str(raw?.reply) || "Okay.",
      table: normalizeTable(raw?.table),
    };
    return NextResponse.json(response);
  } catch (err) {
    const status = err instanceof AiError ? err.status : 500;
    const message = err instanceof Error ? err.message : "Unexpected error.";
    return NextResponse.json({ error: message }, { status });
  }
}
