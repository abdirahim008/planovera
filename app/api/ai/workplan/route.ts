import { NextResponse } from "next/server";

import { aiChatJSON, isAiConfigured, AiError } from "@/lib/ai/provider";
import { isAiRequestAuthorized } from "@/lib/ai/access";
import type { WorkPlanDraftResponse } from "@/lib/agent/types";

export const runtime = "nodejs";

// Generates a work plan (sections + activities with durations) from a list of
// BOQ section/item descriptions, or from a plain brief. Dates are intentionally
// NOT produced here — the client schedules them sequentially using the store's
// own date logic, which keeps scheduling consistent with manual editing.

interface DraftRow {
  rowType?: string;
  description?: string;
  duration?: string;
}
interface DraftSheet {
  name?: string;
  activities?: DraftRow[];
}
interface RawResponse {
  sheets?: DraftSheet[];
}

function buildSystemPrompt(): string {
  return [
    "You are a construction planner for a project-controls app used on East African / Somalia infrastructure projects.",
    "You turn a Bill of Quantities (or a works description) into a practical construction work plan / schedule.",
    "",
    "Return ONLY a single JSON object of this exact shape:",
    '{"sheets":[{"name":"<sheet name>","activities":[{"rowType":"section|activity","description":"...","duration":"<whole days>"}]}]}',
    "",
    "Rules:",
    '- Group activities under section rows. A "section" row has only a description (no duration).',
    '- An "activity" row has a description and a duration in WHOLE DAYS as a numeric string (e.g. "5", "14").',
    "- Order activities in a realistic construction sequence (site setup → substructure → superstructure → finishes → external works → testing/handover).",
    "- Use durations that are reasonable for the scale implied by the items. Typically 8-30 activity rows total.",
    "- Do NOT include dates, costs, quantities, or money. Durations only.",
    "- Usually one sheet. Output JSON only — no prose, no markdown code fences.",
  ].join("\n");
}

const str = (v: unknown): string =>
  typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();

function normalize(raw: RawResponse): WorkPlanDraftResponse {
  const rawSheets = Array.isArray(raw?.sheets) ? raw.sheets : [];
  const sheets = rawSheets.slice(0, 4).map((rs, idx) => {
    const rawRows = Array.isArray(rs?.activities) ? rs.activities : [];
    const activities = rawRows
      .slice(0, 120)
      .map((rr) => {
        const isSection = str(rr?.rowType) === "section";
        const description = str(rr?.description);
        if (!description) return null;
        return {
          rowType: isSection ? ("section" as const) : ("activity" as const),
          description,
          duration: isSection ? "" : str(rr?.duration),
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
    return { name: str(rs?.name) || `Schedule ${idx + 1}`, activities };
  });
  return { sheets: sheets.filter((s) => s.activities.length > 0) };
}

export async function POST(req: Request) {
  if (!(await isAiRequestAuthorized())) {
    return NextResponse.json({ error: "Sign in to use the assistant." }, { status: 401 });
  }
  if (!isAiConfigured()) {
    return NextResponse.json(
      { error: "The assistant is not configured on the server." },
      { status: 503 },
    );
  }

  let userContent = "";
  try {
    const body = (await req.json()) as { items?: unknown; brief?: unknown };
    const items = Array.isArray(body?.items)
      ? body.items.map((x) => str(x)).filter(Boolean).slice(0, 300)
      : [];
    const brief = str(body?.brief);
    if (items.length > 0) {
      userContent =
        "Build a work plan covering these BOQ sections and items:\n" + items.join("\n");
    } else if (brief) {
      userContent = "Build a work plan for these works:\n" + brief;
    }
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (!userContent) {
    return NextResponse.json(
      { error: "Provide a BOQ or a works description to plan." },
      { status: 400 },
    );
  }

  try {
    const raw = await aiChatJSON<RawResponse>({
      system: buildSystemPrompt(),
      user: userContent,
      maxTokens: 3000,
    });
    const result = normalize(raw);
    if (result.sheets.length === 0) {
      return NextResponse.json(
        { error: "Could not build a work plan from that. Try adding more detail." },
        { status: 422 },
      );
    }
    return NextResponse.json(result);
  } catch (err) {
    const status = err instanceof AiError ? err.status : 500;
    const message = err instanceof Error ? err.message : "Unexpected error.";
    return NextResponse.json({ error: message }, { status });
  }
}
