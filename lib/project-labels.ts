/**
 * Project-type-aware label resolver.
 *
 * Planovera serves both construction and non-construction project workflows. The data
 * model is shared, but several modules surface different vocabulary depending on the
 * type of project (e.g. "BOQ" vs "Deliverables", "Site Notes" vs "Project Notes").
 *
 * Centralizing the strings here keeps the UI consistent and makes it easy to add
 * new project-type variants (consulting, NGO programs, internal projects, etc.) later.
 */

import type { Project } from "./supabase";

export type ProjectTypeKey = Project["type"];

export interface ProjectLabelSet {
  /** Sidebar / module nav titles */
  nav: {
    boqOrItems: string;
    siteNotes: string;
    drawings: string;
    payment: string;
    workPlan: string;
    progress: string;
    correspondence: string;
    documents: string;
    checklist: string;
  };
  /** Modules headers / page titles when the user opens them */
  pageTitle: {
    boqOrItems: string;
    siteNotes: string;
    payment: string;
  };
  /** Document template labels (overrides DocumentsModule.tsx templateLabels per type) */
  documentTemplates: {
    /** Title shown in the template picker for the "commencement-letter" template type */
    commencementLetter: string;
    /** Title shown in the template picker for the "completion-certificate" template type */
    completionCertificate: string;
    /** Title shown in the template picker for the "payment-certificate-summary" template type */
    paymentCertificateSummary: string;
    /** Title for "instruction-letter" template type */
    instructionLetter: string;
    /** Title for "site-visit-report" template type */
    siteVisitReport: string;
    /** Title for "progress-report" — universal */
    progressReport: string;
    /** Title for "milestone-invoice" template — lightweight, FIDIC-free invoice */
    milestoneInvoice: string;
    /** Title for "status-report" — universal lightweight one-page status update */
    statusReport: string;
  };
  /** Generic role / actor names that read differently in non-construction contexts */
  roles: {
    /** "Engineer" in construction; "Lead" or "Project Manager" elsewhere */
    issuer: string;
    /** "Contractor" in construction; "Vendor" or "Delivery Partner" elsewhere */
    recipient: string;
    /** "Employer" in construction; "Client" elsewhere */
    client: string;
  };
}

const CONSTRUCTION_LABELS: ProjectLabelSet = {
  nav: {
    boqOrItems: "BOQ",
    siteNotes: "Site Notes",
    drawings: "Drawings",
    payment: "Payments",
    workPlan: "Work Plan",
    progress: "Progress",
    correspondence: "Correspondence",
    documents: "Documents",
    checklist: "Checklist",
  },
  pageTitle: {
    boqOrItems: "Bill of Quantities",
    siteNotes: "Site Notes",
    payment: "Payment Certificates",
  },
  documentTemplates: {
    commencementLetter: "Commencement Letter",
    completionCertificate: "Completion Certificate",
    paymentCertificateSummary: "Payment Certificate Summary",
    instructionLetter: "Instruction Letter",
    siteVisitReport: "Site Visit Report",
    progressReport: "Progress Report",
    milestoneInvoice: "Tax Invoice",
    statusReport: "Status Report",
  },
  roles: {
    issuer: "Engineer",
    recipient: "Contractor",
    client: "Employer",
  },
};

const NON_CONSTRUCTION_LABELS: ProjectLabelSet = {
  nav: {
    boqOrItems: "Deliverables",
    siteNotes: "Project Notes",
    drawings: "References",
    payment: "Invoices",
    workPlan: "Work Plan",
    progress: "Progress",
    correspondence: "Correspondence",
    documents: "Documents",
    checklist: "Checklist",
  },
  pageTitle: {
    boqOrItems: "Deliverables",
    siteNotes: "Project Notes",
    payment: "Milestone Invoices",
  },
  documentTemplates: {
    commencementLetter: "Kickoff Letter",
    completionCertificate: "Project Closeout",
    paymentCertificateSummary: "Invoice Summary",
    instructionLetter: "Instruction Letter",
    siteVisitReport: "Field Report",
    progressReport: "Progress Report",
    milestoneInvoice: "Milestone Invoice",
    statusReport: "Status Report",
  },
  roles: {
    issuer: "Lead",
    recipient: "Vendor",
    client: "Client",
  },
};

/**
 * Resolve the label set for a project. Falls back to the construction set when no
 * project is in context — that preserves backwards-compatible copy for screens that
 * render before a project is selected.
 */
export function labelsForType(project: Project | null | undefined): ProjectLabelSet {
  if (project?.type === "non-construction") return NON_CONSTRUCTION_LABELS;
  return CONSTRUCTION_LABELS;
}

/**
 * Should a "construction-only" module be visible to this project?
 *
 * Use this in the sidebar and module guards rather than open-coding
 * `project.type === "construction"` everywhere. That way the rules live in one place.
 */
export function isConstructionProject(project: Project | null | undefined): boolean {
  return project?.type === "construction";
}

/**
 * Document template visibility per project type.
 *
 * Construction projects see every template. Non-construction projects don't see
 * FIDIC-flavored templates (the deeply construction-specific ones), so the picker
 * stays focused on what makes sense for the engagement.
 */
export function isTemplateVisibleForProject(
  templateType:
    | "commencement-letter"
    | "instruction-letter"
    | "progress-report"
    | "payment-certificate-summary"
    | "completion-certificate"
    | "site-visit-report"
    | "milestone-invoice"
    | "status-report",
  project: Project | null | undefined,
): boolean {
  if (isConstructionProject(project)) return true;
  // Non-construction projects: hide payment-certificate-summary (too FIDIC-specific).
  // commencement-letter and completion-certificate stay visible but get renamed via labelsForType.
  // milestone-invoice and status-report are universal — visible to everyone.
  if (templateType === "payment-certificate-summary") return false;
  return true;
}

/**
 * Friendly human-readable label for a project's type. Used in summaries and tooltips.
 */
export function projectTypeLabel(project: Project | null | undefined): string {
  if (project?.type === "non-construction") return "Non-construction";
  return "Construction";
}

/**
 * One-line tagline shown alongside the project type in pickers and badges.
 * Helps a fresh user understand what each type unlocks without reading docs.
 */
export const PROJECT_TYPE_DESCRIPTIONS: Record<ProjectTypeKey, string> = {
  construction:
    "Civil / building works with BOQ, FIDIC payment certificates, drawings, and site supervision.",
  "non-construction":
    "Consulting, programs, internal initiatives — deliverables, milestone invoices, no BOQ.",
};
