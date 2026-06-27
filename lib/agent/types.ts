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

/** Modules the agent is allowed to navigate the user to. */
export const AGENT_MODULES = [
  "dashboard",
  "boq",
  "items",
  "workplan",
  "progress",
  "payment",
  "documents",
  "correspondence",
  "checklist",
  "quality",
  "site-notes",
  "risks",
  "stakeholders",
] as const;
export type AgentModule = (typeof AGENT_MODULES)[number];

/** Core project fields the agent can set when creating a project. */
export interface AgentProjectDraft {
  name: string;
  projectType?: "construction" | "non-construction";
  role?: "contractor" | "supervision" | "employer";
  location?: string;
  region?: string;
  town?: string;
  clientName?: string;
  contractorName?: string;
  consultantName?: string;
  contractNumber?: string;
  contractTitle?: string;
  contractAmount?: string;
  currency?: string;
}

// ─── Action union ────────────────────────────────────────────────────────────
// The model picks exactly one of these per turn. The client executes it against
// the Zustand store (and, for content actions, calls the dedicated content
// routes). Nothing is destructive without the user having asked for it in chat.

export type AgentAction =
  /** Just talk / ask a clarifying question — no side effect. */
  | { type: "none" }
  /** Create a project and make it active. */
  | { type: "create_project"; project: AgentProjectDraft }
  /** Switch to an existing project by (fuzzy) name. */
  | { type: "select_project"; name: string }
  /** Draft a BOQ for the active project from a works brief. */
  | { type: "draft_boq"; brief: string; boqName?: string }
  /** Generate a work plan from the active project's current BOQ. */
  | { type: "generate_work_plan"; startDate?: string; planName?: string }
  /** Create a progress report shell from the project's BOQ/items for the user to fill. */
  | { type: "create_progress_report"; name?: string; inputMode?: "quantity" | "percent" }
  /** Draft a project document (letter / report / certificate summary) with AI-written body text. */
  | { type: "draft_document"; templateType: DocumentTemplateType; title?: string; brief?: string }
  /** Scaffold a payment certificate from the project's BOQ (no money is computed by AI). */
  | { type: "create_payment_certificate"; certType?: "interim" | "final" }
  /** Navigate the workspace to a module. */
  | { type: "open_module"; module: AgentModule };

export type AgentActionType = AgentAction["type"];

/** What the agent route returns for one user turn. */
export interface AgentResponse {
  reply: string;
  action: AgentAction;
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

// Re-export the store-facing shapes the panel applies, so callers have one stop.
export type { BOQSheet, WorkPlanSheet, DocumentTemplateType };
