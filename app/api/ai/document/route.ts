import { NextResponse } from "next/server";

import { aiChatJSON, isAiConfigured, AiError } from "@/lib/ai/provider";
import { AGENT_DOC_TEMPLATES, type DocumentDraftResponse } from "@/lib/agent/types";

export const runtime = "nodejs";

// Drafts the BODY TEXT of a project document for a given template. Returns plain
// text (blank-line-separated paragraphs; "- " lines are bullets) — the document
// module parses exactly this shape, and hydrates letterhead/branding itself.

const TEMPLATE_SET = new Set<string>(AGENT_DOC_TEMPLATES);

const TEMPLATE_GUIDE: Record<string, string> = {
  "commencement-letter":
    "A formal order/notice to the contractor to commence the works, stating the commencement date, site possession, and the obligation to proceed with due diligence.",
  "instruction-letter":
    "A site instruction to the contractor: the purpose, the specific instruction/works affected, and any time or cost implication note.",
  "progress-report":
    "A concise project progress narrative: period under review, overall status, key activities completed, and next-period focus.",
  "payment-certificate-summary":
    "A short cover note summarising the commercial position of an interim payment certificate for the approving authority.",
  "completion-certificate":
    "A formal statement that the works (or a section) are practically complete and accepted, noting the completion date and defects-liability commencement.",
  "site-visit-report":
    "A field site-visit record: purpose of visit, observations on works and quality, and follow-up actions.",
  "milestone-invoice":
    "A short professional cover note for a milestone invoice referencing the milestone delivered.",
  "status-report":
    "A one-page status update written as short bullet sections: highlights, issues, upcoming work.",
};

function buildSystemPrompt(templateType: string): string {
  return [
    "You are a construction contract administrator for a project-controls app used on East African / Somalia infrastructure projects.",
    `You are drafting a "${templateType}" document. ${TEMPLATE_GUIDE[templateType] || ""}`,
    "",
    "Return ONLY a single JSON object of this exact shape:",
    '{"title":"<concise document title>","content":"<plain-text body>"}',
    "",
    "Body text rules:",
    "- Plain text only. Separate paragraphs with a blank line.",
    "- For a list, put each item on its own line starting with \"- \".",
    "- A short label line (<=50 chars, no ending punctuation) followed by a paragraph is rendered as a titled section.",
    "- Do NOT write the letterhead, addresses, date, reference number, salutation block, or signature block — the app adds those. Write only the substantive body.",
    "- Keep it professional, specific to the brief, and reasonably brief. No markdown symbols other than \"- \" bullets. No code fences.",
    "",
    "Output JSON only.",
  ].join("\n");
}

const str = (v: unknown): string =>
  typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();

export async function POST(req: Request) {
  if (!isAiConfigured()) {
    return NextResponse.json(
      { error: "The assistant is not configured on the server." },
      { status: 503 },
    );
  }

  let templateType = "";
  let userContent = "";
  try {
    const body = (await req.json()) as {
      templateType?: unknown;
      brief?: unknown;
      context?: unknown;
    };
    templateType = str(body?.templateType);
    const brief = str(body?.brief);
    const ctx = (body?.context && typeof body.context === "object" ? body.context : {}) as Record<string, unknown>;
    const ctxLines = [
      ctx.projectName ? `Project: ${str(ctx.projectName)}` : "",
      ctx.contractTitle ? `Contract: ${str(ctx.contractTitle)}` : "",
      ctx.clientName ? `Client/Employer: ${str(ctx.clientName)}` : "",
      ctx.contractorName ? `Contractor: ${str(ctx.contractorName)}` : "",
      ctx.consultantName ? `Engineer/Consultant: ${str(ctx.consultantName)}` : "",
      ctx.location ? `Location: ${str(ctx.location)}` : "",
    ].filter(Boolean);
    userContent =
      (brief ? `Request: ${brief}\n\n` : "") +
      (ctxLines.length ? `Project details:\n${ctxLines.join("\n")}` : "Draft the document body.");
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (!TEMPLATE_SET.has(templateType)) {
    return NextResponse.json({ error: "Unknown document template." }, { status: 400 });
  }

  try {
    const raw = await aiChatJSON<{ title?: unknown; content?: unknown }>({
      system: buildSystemPrompt(templateType),
      user: userContent,
      maxTokens: 1800,
    });
    const content = str(raw?.content);
    if (!content) {
      return NextResponse.json(
        { error: "The document draft came back empty. Try adding more detail." },
        { status: 422 },
      );
    }
    const result: DocumentDraftResponse = { title: str(raw?.title), content };
    return NextResponse.json(result);
  } catch (err) {
    const status = err instanceof AiError ? err.status : 500;
    const message = err instanceof Error ? err.message : "Unexpected error.";
    return NextResponse.json({ error: message }, { status });
  }
}
