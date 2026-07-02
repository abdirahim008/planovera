import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";

import { aiChatJSON, isAiConfigured, AiError } from "@/lib/ai/provider";
import { isAiRequestAuthorized } from "@/lib/ai/access";
import { BOQ_LIBRARY_TAXONOMY, buildSeedLibraryItems } from "@/lib/boqLibrary";
import type { BOQRow, BOQSheet } from "@/lib/supabase";

export const runtime = "nodejs";

// What we ask the model to return. Loose on purpose — everything is re-validated
// in normalizeDraft before it becomes real BOQ rows.
interface DraftRow {
  type?: string;
  itemNo?: string;
  description?: string;
  unit?: string;
  qty?: string;
}
interface DraftSheet {
  name?: string;
  rows?: DraftRow[];
}
interface DraftResponse {
  sheets?: DraftSheet[];
}

const ROW_TYPES = new Set<BOQRow["type"]>([
  "item",
  "header",
  "subtotal",
  "sheettotal",
  "grandtotal",
  "notes",
  "specification",
]);

// Grounding context, computed once. The model drafts more reliably when it
// echoes the taxonomy and the families of templates the library already curates,
// rather than inventing structure from scratch.
const TEMPLATE_NAMES = buildSeedLibraryItems()
  .map((t) => `${t.name} [${t.category} › ${t.subcategory}]`)
  .join("; ");

const TAXONOMY_TEXT = Object.entries(BOQ_LIBRARY_TAXONOMY)
  .map(([cat, subs]) => `${cat}: ${subs.join(", ")}`)
  .join(" | ");

function buildSystemPrompt(): string {
  return [
    "You are a quantity surveyor assistant for a construction project-controls app used on East African / Somalia infrastructure projects.",
    "You draft Bills of Quantities (BOQ).",
    "",
    "Return ONLY a single JSON object of exactly this shape:",
    '{"sheets":[{"name":"<sheet name>","rows":[{"type":"header|item|subtotal|grandtotal|notes|specification","itemNo":"","description":"","unit":"","qty":""}]}]}',
    "",
    "Row type rules:",
    '- "header": a section heading. Use only "description".',
    '- "item": a measurable work item. Provide itemNo (e.g. "1.1"), description, unit (m3, m2, m, No, kg, sum, LS), and qty as a numeric string estimate.',
    '- "subtotal": closes a section. Use only "description" (e.g. "Subtotal - Earthworks").',
    '- "grandtotal": overall total. Use only "description".',
    '- "specification": a free-text specification/preamble note. Use only "description".',
    "- Never provide rate or amount. The engineer enters rates; the app computes amounts.",
    "",
    "Structure rules:",
    "- Group items under section headers, end each section with a subtotal, and finish with one grandtotal.",
    "- Use realistic units and reasonable estimated quantities for the works described. Keep itemNo sequential (1.1, 1.2, 2.1 ...).",
    "- Usually one sheet with 8-25 item rows. Use multiple sheets only for clearly distinct bills.",
    "- Prefer terminology consistent with these existing template families: " + TEMPLATE_NAMES + ".",
    "- Relevant categories: " + TAXONOMY_TEXT + ".",
    "",
    "Output JSON only — no prose, no markdown code fences.",
  ].join("\n");
}

const str = (v: unknown): string =>
  typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();

function normalizeDraft(draft: DraftResponse): BOQSheet[] {
  const rawSheets = Array.isArray(draft?.sheets) ? draft.sheets : [];
  const sheets: BOQSheet[] = [];

  rawSheets.slice(0, 6).forEach((rs, idx) => {
    const rawRows = Array.isArray(rs?.rows) ? rs.rows : [];
    const rows: BOQRow[] = [];

    rawRows.slice(0, 200).forEach((rr) => {
      const candidate = str(rr?.type) as BOQRow["type"];
      const type: BOQRow["type"] = ROW_TYPES.has(candidate) ? candidate : "item";
      const isItem = type === "item";
      const isTotal = type === "subtotal" || type === "sheettotal" || type === "grandtotal";
      const description = str(rr?.description);

      // Skip empty noise rows the model sometimes emits.
      if (!description && !isItem) return;

      rows.push({
        id: uuid(),
        type,
        itemNo: isItem ? str(rr?.itemNo) : "",
        description,
        unit: isItem ? str(rr?.unit) : "",
        qty: isItem ? str(rr?.qty) : "",
        rate: "",
        // Totals carry a computed placeholder; the store recalculates on load.
        amount: isTotal ? "0.00" : "",
      });
    });

    if (rows.length === 0) return;
    sheets.push({
      id: uuid(),
      project_id: "",
      name: str(rs?.name) || `Sheet ${idx + 1}`,
      sort_order: idx,
      rows,
    });
  });

  return sheets;
}

export async function POST(req: Request) {
  if (!(await isAiRequestAuthorized())) {
    return NextResponse.json({ error: "Sign in to use the assistant." }, { status: 401 });
  }
  if (!isAiConfigured()) {
    return NextResponse.json(
      { error: "AI drafting is not configured on the server." },
      { status: 503 },
    );
  }

  let brief = "";
  try {
    const body = (await req.json()) as { brief?: unknown };
    brief = typeof body?.brief === "string" ? body.brief.trim() : "";
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (brief.length < 3) {
    return NextResponse.json(
      { error: "Describe the works to draft a BOQ." },
      { status: 400 },
    );
  }
  if (brief.length > 2000) brief = brief.slice(0, 2000);

  try {
    const draft = await aiChatJSON<DraftResponse>({
      system: buildSystemPrompt(),
      user: brief,
      maxTokens: 4000,
    });
    const sheets = normalizeDraft(draft);
    if (sheets.length === 0) {
      return NextResponse.json(
        { error: "The model did not return any usable BOQ items. Try a more specific description." },
        { status: 422 },
      );
    }
    return NextResponse.json({ sheets });
  } catch (err) {
    const status = err instanceof AiError ? err.status : 500;
    const message = err instanceof Error ? err.message : "Unexpected error.";
    return NextResponse.json({ error: message }, { status });
  }
}
