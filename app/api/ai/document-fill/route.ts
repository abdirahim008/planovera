import { NextResponse } from "next/server";

import { aiChatJSON, isAiConfigured, AiError } from "@/lib/ai/provider";
import { guardAiRequest } from "@/lib/ai/access";

export const runtime = "nodejs";

// Fills the narrative fields of an already-created document (progress report,
// completion certificate, status report, site-visit report, letters) using the
// project's real figures plus the user's instruction. Returns plain text per
// field (HTML only for the site-visit observation). The Documents module stores
// these values directly and renders them.

// Fillable narrative fields per template, with how each should be written.
const TEMPLATE_FIELDS: Record<string, Record<string, string>> = {
  "progress-report": {
    executiveSummary:
      "Executive summary of project progress this reporting period — overall status against plan, key achievements, and any concerns. 1-2 short plain-text paragraphs.",
    forecastNarrative:
      "Forward-looking narrative — next-period focus, upcoming milestones and outlook. Plain text, a few sentences.",
  },
  "completion-certificate": {
    content:
      "The certificate body: a formal statement that the works (or the named section) are practically complete and accepted, noting the completion date and the start of the defects-liability period. Plain text paragraphs.",
  },
  "commencement-letter": {
    content:
      "The letter body instructing the contractor to commence the works: commencement date, site possession, and the obligation to proceed with due diligence. Plain text paragraphs only (no letterhead, salutation or signature block).",
  },
  "instruction-letter": {
    content:
      "The letter body: the instruction to the contractor, the works affected, and any time/cost implication note. Plain text paragraphs only.",
  },
  "payment-certificate-summary": {
    content:
      "A short cover note summarising the commercial position of the certificate for the approving authority. Plain text.",
  },
  "milestone-invoice": {
    content: "A short professional cover note for the milestone invoice. Plain text.",
  },
  "site-visit-report": {
    siteVisitObservationHtml:
      "Observations from the site visit — works inspected, quality, progress and issues noted. Return simple HTML paragraphs, e.g. <p>...</p><p>...</p>.",
    content: "A brief site-visit summary body. Plain text.",
  },
  "status-report": {
    statusHighlights: 'Key highlights this period. One per line, each starting with "- ".',
    statusIssues: 'Current issues / blockers. One per line, each starting with "- ".',
    statusUpcoming: 'Upcoming work next period. One per line, each starting with "- ".',
    statusTopRisks: 'Top risks. One per line, each starting with "- ".',
    statusResourceAsks: 'Resource or decision asks. One per line, each starting with "- ".',
  },
};

const str = (v: unknown): string =>
  typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();

function buildSystemPrompt(templateType: string, fields: Record<string, string>): string {
  const fieldLines = Object.entries(fields).map(([k, desc]) => `- "${k}": ${desc}`);
  return [
    "You are a construction contract administrator filling in a project document for a project-controls app used on East African / Somalia infrastructure projects.",
    `The document is a "${templateType}". Write professional, specific content grounded in the project figures provided by the user (progress %, certified amounts, dates, delayed activities, etc.). Never invent numbers that contradict those figures.`,
    "",
    "Return ONLY a JSON object of the form {\"values\":{ <field>: <text>, ... }} containing ONLY these fields (omit a field only if you truly cannot write it):",
    ...fieldLines,
    "",
    "Plain text for all fields EXCEPT siteVisitObservationHtml, which must be simple HTML paragraphs. Separate paragraphs with a blank line. No markdown headings or code fences. Output JSON only.",
  ].join("\n");
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

  let templateType = "";
  let requested: string[] = [];
  let userContent = "";
  try {
    const body = (await req.json()) as {
      templateType?: unknown;
      fields?: unknown;
      instruction?: unknown;
      context?: unknown;
    };
    templateType = str(body?.templateType);
    requested = Array.isArray(body?.fields) ? body.fields.map(str).filter(Boolean) : [];
    const instruction = str(body?.instruction);
    const ctx = body?.context ? JSON.stringify(body.context).slice(0, 6000) : "";
    userContent =
      (instruction ? `Instruction: ${instruction}\n\n` : "Fill the document's narrative fields.\n\n") +
      (ctx ? `Project figures (authoritative):\n${ctx}` : "");
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const allFields = TEMPLATE_FIELDS[templateType];
  if (!allFields) {
    return NextResponse.json({ error: "This document type can't be auto-filled." }, { status: 400 });
  }
  // If the model/user asked for specific fields, restrict to those (that are valid).
  const fields =
    requested.length > 0
      ? Object.fromEntries(Object.entries(allFields).filter(([k]) => requested.includes(k)))
      : allFields;
  const effectiveFields = Object.keys(fields).length > 0 ? fields : allFields;

  try {
    const raw = await aiChatJSON<{ values?: Record<string, unknown> }>({
      system: buildSystemPrompt(templateType, effectiveFields),
      user: userContent,
      maxTokens: 2200,
    });
    const out: Record<string, string> = {};
    const values = raw?.values && typeof raw.values === "object" ? raw.values : {};
    for (const key of Object.keys(effectiveFields)) {
      const text = str((values as Record<string, unknown>)[key]);
      if (text) out[key] = text;
    }
    if (Object.keys(out).length === 0) {
      return NextResponse.json(
        { error: "Nothing was generated. Try a more specific instruction." },
        { status: 422 },
      );
    }
    return NextResponse.json({ values: out });
  } catch (err) {
    const status = err instanceof AiError ? err.status : 500;
    const message = err instanceof Error ? err.message : "Unexpected error.";
    return NextResponse.json({ error: message }, { status });
  }
}
