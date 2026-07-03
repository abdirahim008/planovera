import { NextResponse } from "next/server";

import { aiChatJSON, isAiConfigured, AiError } from "@/lib/ai/provider";
import { guardAiRequest } from "@/lib/ai/access";
import type { WorkPlanDraftResponse } from "@/lib/agent/types";

export const runtime = "nodejs";

// Generates a work plan (sections + activities with durations and MS Project-
// style finish-to-start predecessors) from a list of BOQ section/item
// descriptions, or from a plain brief. Dates are intentionally NOT produced
// here — the client resolves predecessors to activity ids and lets the
// dependency scheduler compute dates, which keeps AI output consistent with
// manual editing.

interface DraftRow {
  rowType?: string;
  description?: string;
  duration?: string;
  predecessors?: unknown;
}
interface DraftSheet {
  name?: string;
  activities?: DraftRow[];
}
interface RawResponse {
  sheets?: DraftSheet[];
}

function buildSystemPrompt(windowDays: number | null): string {
  return [
    "You are a construction planner for a project-controls app used on East African / Somalia infrastructure projects.",
    "You turn a Bill of Quantities (or a works description) into a practical construction work plan with MS Project-style finish-to-start dependencies.",
    "",
    "Return ONLY a single JSON object of this exact shape:",
    '{"sheets":[{"name":"<sheet name>","activities":[{"rowType":"section|activity","description":"...","duration":"<whole days>","predecessors":[<row numbers>]}]}]}',
    "",
    "Rules:",
    '- Group activities under section rows. A "section" row has only a description (no duration, no predecessors).',
    '- An "activity" row has a description and a duration in WHOLE DAYS as a numeric string (e.g. "5", "14").',
    "- Order rows in a realistic construction sequence (site setup → substructure → superstructure → finishes → external works → testing/handover).",
    '- "predecessors" lists the 1-based ROW POSITIONS (counting every row in the sheet, sections included) of the activities this one starts after. Reference only EARLIER activity rows, never section rows.',
    "- Build a REALISTIC dependency network, not one long chain: independent trades (e.g. electrical vs plumbing first fix, external works vs internal finishes) should share a predecessor so they run in parallel; converging work (e.g. testing, handover) should list several predecessors.",
    "- Every activity except the first should have at least one predecessor.",
    windowDays
      ? `- The programme must fit roughly ${windowDays} calendar days end-to-end along the longest dependency path (critical path). Calibrate durations and parallelism to that window.`
      : "- Use durations that are reasonable for the scale implied by the items.",
    "- Typically 8-30 activity rows total.",
    "- Do NOT include dates, costs, quantities, or money — the app computes dates from the dependencies.",
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
      .map((rr, rowIdx) => {
        const isSection = str(rr?.rowType) === "section";
        const description = str(rr?.description);
        if (!description) return null;
        // Keep only sane predecessor references: integers pointing at EARLIER
        // rows. Section/self/forward references are dropped (the client also
        // validates against its own row list).
        const predecessors = isSection
          ? []
          : (Array.isArray(rr?.predecessors) ? rr.predecessors : [])
              .map((p) => Number(p))
              .filter((p) => Number.isInteger(p) && p >= 1 && p <= rowIdx)
              .slice(0, 8);
        return {
          rowType: isSection ? ("section" as const) : ("activity" as const),
          description,
          duration: isSection ? "" : str(rr?.duration),
          predecessors,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
    return { name: str(rs?.name) || `Schedule ${idx + 1}`, activities };
  });
  return { sheets: sheets.filter((s) => s.activities.length > 0) };
}

/** Whole-day span between two ISO dates (inclusive), or null. */
function daysBetween(startIso: string, endIso: string): number | null {
  const s = new Date(`${startIso}T00:00:00`);
  const e = new Date(`${endIso}T00:00:00`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return null;
  const days = Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
  return days > 0 ? days : null;
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

  let userContent = "";
  let windowDays: number | null = null;
  try {
    const body = (await req.json()) as {
      items?: unknown;
      brief?: unknown;
      startDate?: unknown;
      endDate?: unknown;
      durationDays?: unknown;
    };
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

    // Optional timeline window for calibration: explicit duration wins, else
    // derived from start/end dates. Clamped to something sane.
    const explicitDays = Number(body?.durationDays);
    if (Number.isFinite(explicitDays) && explicitDays > 0) {
      windowDays = Math.round(explicitDays);
    } else {
      const startDate = str(body?.startDate);
      const endDate = str(body?.endDate);
      if (startDate && endDate) windowDays = daysBetween(startDate, endDate);
    }
    if (windowDays !== null) windowDays = Math.min(Math.max(windowDays, 7), 3650);
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
      system: buildSystemPrompt(windowDays),
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
