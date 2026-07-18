// Shared contract between the agent API route (server) and the chat panel
// (client). Pure types + small constants only — no server-only imports — so it
// is safe to import from both sides.

import type { BOQSheet, WorkPlanSheet, DocumentTemplateType } from "@/lib/supabase";

/** Document templates the assistant can draft. Mirrors DocumentTemplateType. */
export const AGENT_DOC_TEMPLATES: DocumentTemplateType[] = [
  "commencement-letter",
  "instruction-letter",
  "progress-report",
  "payment-certificate-summary",
  "completion-certificate",
  "site-visit-report",
  "milestone-invoice",
  "status-report",
];

/** Optional tabular payload for list/compare answers (rendered as a table). */
export interface AgentTable {
  title?: string;
  columns: string[];
  rows: string[][];
}

/** What the assistant route returns for one user turn. Read-only: a reply and,
 *  when a list/comparison helps, a table. No actions — the assistant never
 *  changes app state. */
export interface AgentResponse {
  reply: string;
  /** Present when the answer is best shown as a table (e.g. "list my projects"). */
  table?: AgentTable | null;
}

/** Snapshot of workspace state the client sends so the model can ground itself. */
export interface AgentContext {
  hasProject: boolean;
  projectId?: string;
  projectName?: string;
  projectType?: "construction" | "non-construction";
  currentModule?: string;
  existingProjects?: string[];
  hasBOQ?: boolean;
  boqItemCount?: number;
  /** Read-only snapshot of the active project, used to answer questions. */
  snapshot?: Record<string, unknown> | null;
  /** Slim per-project summaries across the whole portfolio, for portfolio Q&A. */
  portfolio?: Record<string, unknown>[] | null;
  /** The document currently open in the Documents module, if any. */
  activeDocument?: { id: string; templateType: string; title: string } | null;
}

export interface AgentChatMessage {
  role: "user" | "assistant";
  content: string;
}

// ─── Work plan generation contract (POST /api/ai/workplan) ───────────────────

/** One activity as returned by the work-plan route (dates computed client-side). */
export interface DraftWorkPlanActivity {
  rowType: "section" | "activity";
  description: string;
  /** Whole days; only meaningful for activity rows. */
  duration?: string;
  /**
   * Finish-to-start predecessors as 1-based row positions within the same
   * sheet's activities array (must point at EARLIER activity rows). The client
   * maps these to activity UUIDs and lets the scheduling engine compute dates —
   * this is how the AI expresses overlapping/parallel trades realistically.
   */
  predecessors?: number[];
}
export interface DraftWorkPlanSheet {
  name: string;
  activities: DraftWorkPlanActivity[];
}
export interface WorkPlanDraftResponse {
  sheets: DraftWorkPlanSheet[];
}

// ─── Document drafting contract (POST /api/ai/document) ──────────────────────

export interface DocumentDraftResponse {
  /** Suggested document title. */
  title: string;
  /** Plain-text body: blank-line-separated paragraphs; lines starting with "- " are bullets. */
  content: string;
}

/** Field → value map returned by POST /api/ai/document-fill. */
export interface DocumentFillResponse {
  values: Record<string, string>;
}

// Re-export the store-facing shapes the panel applies, so callers have one stop.
export type { BOQSheet, WorkPlanSheet, DocumentTemplateType };
