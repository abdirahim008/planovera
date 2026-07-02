"use client";

import { useEffect, useMemo, useState } from "react";
import { compressImageFile } from "@/lib/imageCompression";
import { v4 as uuid } from "uuid";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  ChevronUp,
  FileText,
  ImagePlus,
  Pencil,
  Plus,
  Printer,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { useAppStore, currency, getLiveMeetingActionItems } from "@/lib/store";
import { sanitizeRichTextHtml } from "@/lib/richText";
import type {
  CorrespondenceRecord,
  QualityControlRecord,
  CorrespondenceType,
  DocumentTemplateType,
  GeneratedDocument,
  MeetingMinute,
  PaymentCertificate,
  ProgressReport,
  Project,
  ReportItemFormat,
  ReportSectionId,
  ReportSectionToggles,
  ReportWorkPlanFormat,
  Risk,
  SavedWorkPlan,
  SiteNote,
  SiteNotePhoto,
  UserSignatureProfile,
} from "@/lib/supabase";
import { DEFAULT_PROGRESS_REPORT_SECTIONS } from "@/lib/supabase";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Badge from "@/components/ui/Badge";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { isTemplateVisibleForProject, labelsForType } from "@/lib/project-labels";

// Construction-flavored default labels. Non-construction projects swap in alternative
// vocabulary via labelsForType() — we resolve per-document below so the same module
// renders the right label whether the user is in a construction or non-construction
// project. The "default" labels here are also used when no project is in context yet.
const templateLabels: Record<DocumentTemplateType, string> = {
  "commencement-letter": "Commencement Letter",
  "instruction-letter": "Instruction Letter",
  "progress-report": "Progress Report",
  "payment-certificate-summary": "Payment Certificate Summary",
  "completion-certificate": "Completion Certificate",
  "site-visit-report": "Site Visit Report",
  "milestone-invoice": "Tax Invoice",
  "status-report": "Status Report",
};

/**
 * Resolve a template's display label given the current project context. Falls back
 * to the construction-flavored default when no project is selected.
 */
function templateLabelFor(
  templateType: DocumentTemplateType,
  project: Project | null,
): string {
  const labels = labelsForType(project).documentTemplates;
  switch (templateType) {
    case "commencement-letter":
      return labels.commencementLetter;
    case "instruction-letter":
      return labels.instructionLetter;
    case "progress-report":
      return labels.progressReport;
    case "payment-certificate-summary":
      return labels.paymentCertificateSummary;
    case "completion-certificate":
      return labels.completionCertificate;
    case "site-visit-report":
      return labels.siteVisitReport;
    case "milestone-invoice":
      return labels.milestoneInvoice;
    case "status-report":
      return labels.statusReport;
    default:
      return templateLabels[templateType];
  }
}

function toNumber(value: string | number | undefined | null) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  return parseFloat(String(value || "0").replace(/,/g, "")) || 0;
}

function certificateNet(cert: PaymentCertificate) {
  const subTotal = cert.sheets
    .flatMap((sheet) => sheet.items)
    .reduce((sum, item) => sum + toNumber(item.totalAmount), 0);
  // Gross valuation is the certified BOQ subtotal; contingency/government tax
  // belong in the BOQ, not the certificate.
  const gross = subTotal;
  const retention = (gross * cert.retentionPercent) / 100;
  const advance = (gross * cert.advancePaymentPercent) / 100;
  const withholding = (gross * cert.withholdingTaxPercent) / 100;
  return gross - retention - advance - withholding;
}

function progressMetrics(report: ProgressReport) {
  const items = report.sheets.flatMap((sheet) => sheet.items);
  const planned = items.reduce(
    (sum, item) => sum + (toNumber(item.weightPercent) * toNumber(item.plannedPercent)) / 100,
    0
  );
  const actual = items.reduce(
    (sum, item) => sum + (toNumber(item.weightPercent) * toNumber(item.actualPercent)) / 100,
    0
  );
  const earned = items.reduce((sum, item) => sum + toNumber(item.earnedAmount), 0);
  return { planned, actual, variance: actual - planned, earned, items: items.length };
}

function resolveReportSections(doc: Pick<GeneratedDocument, "reportSections">): ReportSectionToggles & Required<Pick<ReportSectionToggles, "cover" | "executiveSummary" | "keyMetrics" | "itemTable" | "sheetBreakdown" | "forecast" | "signoff">> {
  return {
    ...DEFAULT_PROGRESS_REPORT_SECTIONS,
    ...(doc.reportSections || {}),
  } as ReportSectionToggles & Required<Pick<ReportSectionToggles, "cover" | "executiveSummary" | "keyMetrics" | "itemTable" | "sheetBreakdown" | "forecast" | "signoff">>;
}

const PROGRESS_REPORT_SECTION_META: Array<{
  id: keyof ReportSectionToggles;
  label: string;
  description: string;
}> = [
  { id: "cover", label: "Cover page", description: "Title page with project, period and reference" },
  { id: "keyMetrics", label: "Key metrics", description: "Planned / Actual / Variance / Earned tiles" },
  { id: "itemTable", label: "Item-level progress", description: "Full table from the linked progress register" },
  { id: "sheetBreakdown", label: "Section breakdown", description: "Per-section aggregated progress" },
  { id: "workPlan", label: "Work plan", description: "Activities, durations and status from the saved work plan" },
  { id: "paymentCertificates", label: "Financial progress (IPCs)", description: "Payment certificates and net certified amounts" },
  { id: "actionPoints", label: "Open action points", description: "Outstanding actions for this project across all meeting minutes" },
  { id: "riskRegister", label: "Risk register", description: "Open and mitigated risks with owners and mitigation measures" },
  { id: "siteNotes", label: "Site notes & inspections", description: "Site notes recorded within the reporting period" },
  { id: "correspondenceLog", label: "Correspondence log", description: "Instructions, RFIs, submittals and claims within the period" },
  { id: "qualityControl", label: "Quality control", description: "Material tests and survey records, results and pass rate" },
  { id: "photos", label: "Photo gallery", description: "Uploaded site photos, two per row, on their own page" },
  { id: "forecast", label: "Forecast & recovery", description: "Next period plan and recovery actions" },
  { id: "signoff", label: "Sign-off", description: "Signature blocks at the end" },
];

// ── Progress-report presets ──────────────────────────────────────────────────
// One-click section bundles so the generator opens minimal instead of showing a
// wall of 14 toggles. Each preset is a full section map plus its preferred item /
// work-plan formats; "Custom" is shown when the live selection matches none.
type ReportPresetId = "minimal" | "standard" | "full";

const PROGRESS_REPORT_PRESETS: Record<
  ReportPresetId,
  {
    label: string;
    hint: string;
    sections: Record<ReportSectionId, boolean>;
    itemFormat: ReportItemFormat;
    workPlanFormat: ReportWorkPlanFormat;
  }
> = {
  minimal: {
    label: "Minimal",
    hint: "Cover, key metrics, progress bars, work plan",
    itemFormat: "bars",
    workPlanFormat: "gantt",
    sections: {
      cover: true,
      executiveSummary: true,
      keyMetrics: true,
      itemTable: true,
      sheetBreakdown: false,
      workPlan: true,
      paymentCertificates: false,
      actionPoints: false,
      riskRegister: false,
      siteNotes: false,
      correspondenceLog: false,
      qualityControl: false,
      photos: false,
      forecast: false,
      signoff: false,
    },
  },
  standard: {
    label: "Standard",
    hint: "Adds summary, breakdown, financials, forecast, sign-off",
    itemFormat: "table",
    workPlanFormat: "gantt",
    sections: {
      cover: true,
      executiveSummary: true,
      keyMetrics: true,
      itemTable: true,
      sheetBreakdown: true,
      workPlan: true,
      paymentCertificates: true,
      actionPoints: false,
      riskRegister: false,
      siteNotes: false,
      correspondenceLog: false,
      qualityControl: false,
      photos: true,
      forecast: true,
      signoff: true,
    },
  },
  full: {
    label: "Full",
    hint: "Every section turned on",
    itemFormat: "table",
    workPlanFormat: "gantt",
    sections: {
      cover: true,
      executiveSummary: true,
      keyMetrics: true,
      itemTable: true,
      sheetBreakdown: true,
      workPlan: true,
      paymentCertificates: true,
      actionPoints: true,
      riskRegister: true,
      siteNotes: true,
      correspondenceLog: true,
      qualityControl: true,
      photos: true,
      forecast: true,
      signoff: true,
    },
  },
};

const REPORT_PRESET_ORDER: ReportPresetId[] = ["minimal", "standard", "full"];

// Which preset (if any) the document currently matches — compared over the
// user-facing section toggles plus the two format choices.
function activeReportPreset(
  doc: Pick<GeneratedDocument, "reportSections" | "reportItemFormat" | "reportWorkPlanFormat">,
): ReportPresetId | null {
  const resolved = resolveReportSections(doc);
  const itemFormat = doc.reportItemFormat || "table";
  const workPlanFormat = doc.reportWorkPlanFormat || "table";
  return (
    REPORT_PRESET_ORDER.find((id) => {
      const preset = PROGRESS_REPORT_PRESETS[id];
      const sectionsMatch = PROGRESS_REPORT_SECTION_META.every(
        (section) => (resolved[section.id] ?? false) === (preset.sections[section.id] ?? false),
      );
      return sectionsMatch && itemFormat === preset.itemFormat && workPlanFormat === preset.workPlanFormat;
    }) || null
  );
}

function layoutForTemplate(templateType: DocumentTemplateType): GeneratedDocument["layoutStyle"] {
  if (
    templateType === "progress-report" ||
    templateType === "payment-certificate-summary" ||
    templateType === "site-visit-report"
  ) {
    return "report";
  }
  if (templateType === "completion-certificate") return "certificate";
  // Milestone invoice has its own self-contained print path (buildMilestoneInvoicePrintHtml).
  // We keep its layoutStyle as "letter" so any shared letter chrome still works as a sane
  // fallback, but the dedicated branch in buildDocumentPrintHtml takes priority.
  return "letter";
}

type ResolvedBrandingProfile = {
  clientLogoDataUrl: string;
  clientDisplayName: string;
  clientAddress: string;
  issuerDisplayName: string;
  issuerAddress: string;
  headerTagline: string;
};

function resolveProjectBranding(project: Project | null): ResolvedBrandingProfile {
  return {
    clientLogoDataUrl: project?.documentBranding?.clientLogoDataUrl || "",
    clientDisplayName:
      project?.documentBranding?.clientDisplayName || project?.clientName || "Client / Employer",
    clientAddress: project?.documentBranding?.clientAddress || project?.location || "Project Location",
    issuerDisplayName:
      project?.documentBranding?.issuerDisplayName ||
      project?.consultantName ||
      "Project Management Office",
    issuerAddress: project?.documentBranding?.issuerAddress || project?.location || "Project Location",
    headerTagline:
      project?.documentBranding?.headerTagline ||
      project?.contractTitle ||
      project?.name ||
      "Project correspondence",
  };
}

function letterheadDefaults(project: Project | null, templateType: DocumentTemplateType) {
  const branding = resolveProjectBranding(project);
  const projectLabel = project?.contractTitle || project?.name || "Project Controls Record";

  if (templateType === "completion-certificate") {
    return {
      letterheadTitle: branding.clientDisplayName,
      letterheadSubtitle: projectLabel,
      letterheadAddress: branding.clientAddress,
      brandLogoDataUrl: branding.clientLogoDataUrl,
    };
  }

  if (templateType === "progress-report" || templateType === "payment-certificate-summary") {
    return {
      letterheadTitle: branding.issuerDisplayName,
      letterheadSubtitle: branding.headerTagline || projectLabel,
      letterheadAddress: branding.issuerAddress,
      brandLogoDataUrl: branding.clientLogoDataUrl,
    };
  }

  return {
    letterheadTitle: branding.issuerDisplayName,
    letterheadSubtitle: branding.headerTagline || projectLabel,
    letterheadAddress: branding.issuerAddress,
    brandLogoDataUrl: branding.clientLogoDataUrl,
  };
}

function buildDocumentContent({
  templateType,
  project,
  progressReport,
  certificate,
}: {
  templateType: DocumentTemplateType;
  project: Project | null;
  progressReport?: ProgressReport | null;
  certificate?: PaymentCertificate | null;
}) {
  const branding = resolveProjectBranding(project);
  const location = project?.location || "project site";
  const contractTitle = project?.contractTitle || project?.name || "the project";
  const consultant = branding.issuerDisplayName || "the supervising consultant";
  const contractor = project?.contractorName || "the contractor";
  const progress = progressReport ? progressMetrics(progressReport) : null;
  const certAmount = certificate ? certificateNet(certificate) : null;

  switch (templateType) {
    // "commencement-letter" intentionally has no buildDocumentContent case — the
    // FIDIC commencement order is rendered by buildCommencementLetterPrintHtml
    // with its own structured body and never reads doc.content.
    case "instruction-letter":
      return `Purpose
This instruction relates to ${contractTitle} at ${location}.

Instruction
The contractor is directed to proceed with the instructed work, provide any necessary technical clarifications, and report implementation status.

Commercial and Time Implications
Any time or cost implications shall be notified promptly with supporting particulars for review by ${consultant}.

Closing
Please acknowledge receipt and confirm your action plan.`;
    case "progress-report":
      return `Executive Summary
- planned weighted progress: ${progress ? progress.planned.toFixed(1) : "0.0"}%
- actual weighted progress: ${progress ? progress.actual.toFixed(1) : "0.0"}%
- variance: ${progress ? progress.variance.toFixed(1) : "0.0"}%
- earned value: ${project?.currency || "USD"} ${progress ? currency(progress.earned) : "0.00"}

Highlights
- reporting period based on ${progressReport?.name || "the latest approved progress register"}
- total measured items: ${progress?.items || 0}
- summarize achievements, constraints, safety notes, and coordination issues here

Recommended Actions
- close overdue approvals and technical queries
- recover delayed activities affecting critical milestones
- confirm resources, inspections, and look-ahead priorities for the next period`;
    case "payment-certificate-summary":
      return `Commercial Summary
- certificate: ${certificate ? `${certificate.type === "final" ? "FPC" : "IPC"} ${certificate.number.toString().padStart(2, "0")}` : "certificate"}
- status: ${certificate?.status?.toUpperCase() || "DRAFT"}
- net certified amount: ${project?.currency || "USD"} ${certAmount !== null ? currency(certAmount) : "0.00"}
- retention percentage: ${certificate?.retentionPercent ?? 0}%
- advance recovery percentage: ${certificate?.advancePaymentPercent ?? 0}%
- withholding tax percentage: ${certificate?.withholdingTaxPercent ?? 0}%

Notes
This summary is issued for review and action in accordance with the contract payment provisions.

Recommendation
Verify measurements, deductions, and approvals before processing payment.`;
    case "completion-certificate":
      return `Certification
This certifies that the works for ${contractTitle} have reached substantial completion in accordance with the contract requirements, subject to any outstanding minor defects or snag items.

Conditions
The contractor remains responsible for completing outstanding items, submitting handover records, and attending to defects within the applicable liability period.

Handover
Operational documents, completion records, and any residual action lists shall be coordinated with the employer and supervising team.

Closing
This certificate is issued for formal completion and handover purposes.`;
    case "site-visit-report":
      return `Visit Summary
This site visit report records field observations for ${contractTitle} at ${location}.

Project Information
- project: ${project?.name || "Project"}
- contract reference: ${project?.contractNumber || project?.code || "Not set"}
- client: ${project?.clientName || branding.clientDisplayName}
- contractor: ${contractor}
- consultant: ${consultant}

Observations
Add site observations, progress notes, quality issues, safety notes, and instructions here.

Next Actions
- confirm responsible party for any open action
- track close-out in the next site visit
- attach supporting photos and captions below`;
    default:
      return "";
  }
}

function createDocumentDefaults({
  templateType,
  project,
  progressReport,
  certificate,
}: {
  templateType: DocumentTemplateType;
  project: Project | null;
  progressReport?: ProgressReport | null;
  certificate?: PaymentCertificate | null;
}) {
  const header = letterheadDefaults(project, templateType);
  const branding = resolveProjectBranding(project);
  const consultant = branding.issuerDisplayName || "Authorized Signatory";
  const client = branding.clientDisplayName || "Client / Employer";
  const contractor = project?.contractorName || "Contractor";

  return {
    layoutStyle: layoutForTemplate(templateType),
    brandingMode: "project" as const,
    ...header,
    coverTitle:
      templateType === "progress-report"
        ? "Project Progress Report"
        : templateType === "payment-certificate-summary"
        ? "Commercial Summary"
        : templateType === "site-visit-report"
        ? templateLabelFor("site-visit-report", project)
        : templateLabelFor(templateType, project),
    coverSubtitle:
      templateType === "progress-report"
        ? `${project?.contractTitle || project?.name || "Project"}${project?.location ? ` • ${project.location}` : ""}`
        : templateType === "payment-certificate-summary"
        ? `Commercial position for ${project?.name || "the project"}`
        : templateType === "site-visit-report"
        ? `${project?.name || "Project"}${project?.location ? ` • ${project.location}` : ""}`
        : "",
    recipientName:
      templateType === "completion-certificate"
        ? client
        : templateType === "payment-certificate-summary"
        ? client
        : contractor,
    recipientRole:
      templateType === "completion-certificate"
        ? "Employer"
        : templateType === "payment-certificate-summary"
        ? "Approving Authority"
        : "Recipient",
    signatoryName:
      templateType === "completion-certificate" ? client : consultant,
    signatoryRole:
      templateType === "completion-certificate"
        ? "Authorized Employer Representative"
        : "Authorized Project Representative",
    footerNote:
      templateType === "progress-report"
        ? "Prepared for formal project progress review and record."
        : templateType === "payment-certificate-summary"
        ? "Prepared for commercial review and payment processing."
        : templateType === "site-visit-report"
        ? "Prepared from field site notes and photo records stored in Planovera."
        : "Issued as controlled project correspondence.",
    content: buildDocumentContent({ templateType, project, progressReport, certificate }),
    // New progress reports open on the Minimal preset so the generator starts
    // clean; users widen scope with the preset chips or the Advanced panel.
    reportSections:
      templateType === "progress-report"
        ? { ...PROGRESS_REPORT_PRESETS.minimal.sections }
        : undefined,
    reportItemFormat:
      templateType === "progress-report" ? PROGRESS_REPORT_PRESETS.minimal.itemFormat : undefined,
    reportWorkPlanFormat:
      templateType === "progress-report" ? PROGRESS_REPORT_PRESETS.minimal.workPlanFormat : undefined,
    executiveSummary:
      templateType === "progress-report"
        ? "Progress during the reporting period tracked the approved baseline, with key activities advanced as detailed in the section breakdown below."
        : undefined,
    forecastNarrative:
      templateType === "progress-report"
        ? "Next-period focus: maintain critical path activities, close out outstanding items, and progress upcoming milestones in line with the approved programme."
        : undefined,
    // ── Milestone invoice defaults ───────────────────────────────
    invoiceLines:
      templateType === "milestone-invoice"
        ? [
            { id: uuid(), description: "Milestone deliverable", unit: "ea", qty: "1", rate: "0" },
          ]
        : undefined,
    invoiceTaxPercent: templateType === "milestone-invoice" ? "0" : undefined,
    invoiceDiscountPercent: templateType === "milestone-invoice" ? "0" : undefined,
    invoicePaymentTerms:
      templateType === "milestone-invoice"
        ? "Payment due within 30 days of invoice date."
        : undefined,
    // ── Status report defaults ───────────────────────────────────
    statusOverall:
      templateType === "status-report" ? ("green" as const) : undefined,
    statusHighlights:
      templateType === "status-report"
        ? "- Key milestone achieved this period\n- Team capacity at planned levels"
        : undefined,
    statusIssues:
      templateType === "status-report"
        ? "- No blocking issues at this time"
        : undefined,
    statusUpcoming:
      templateType === "status-report"
        ? "- Continue planned work\n- Prepare for upcoming milestone"
        : undefined,
    statusTopRisks:
      templateType === "status-report"
        ? "- No critical risks currently"
        : undefined,
    statusResourceAsks:
      templateType === "status-report"
        ? ""
        : undefined,
  };
}

function hydrateGeneratedDocument(
  doc: GeneratedDocument,
  project: Project | null,
  progressReport?: ProgressReport | null,
  certificate?: PaymentCertificate | null
) {
  const defaults = createDocumentDefaults({
    templateType: doc.templateType,
    project,
    progressReport,
    certificate,
  });
  const useCustomBranding = doc.brandingMode === "custom";

  return {
    ...defaults,
    ...doc,
    layoutStyle: doc.layoutStyle || defaults.layoutStyle,
    brandingMode: doc.brandingMode || defaults.brandingMode,
    letterheadTitle: useCustomBranding ? doc.letterheadTitle || defaults.letterheadTitle : defaults.letterheadTitle,
    letterheadSubtitle: useCustomBranding
      ? doc.letterheadSubtitle || defaults.letterheadSubtitle
      : defaults.letterheadSubtitle,
    letterheadAddress: useCustomBranding
      ? doc.letterheadAddress || defaults.letterheadAddress
      : defaults.letterheadAddress,
    brandLogoDataUrl: useCustomBranding ? doc.brandLogoDataUrl || defaults.brandLogoDataUrl : defaults.brandLogoDataUrl,
    coverTitle: doc.coverTitle || defaults.coverTitle,
    coverSubtitle: doc.coverSubtitle || defaults.coverSubtitle,
    recipientName: doc.recipientName || defaults.recipientName,
    recipientRole: doc.recipientRole || defaults.recipientRole,
    signatoryName: doc.signatoryName || defaults.signatoryName,
    signatoryRole: doc.signatoryRole || defaults.signatoryRole,
    footerNote: doc.footerNote || defaults.footerNote,
    content: doc.content || defaults.content,
  } satisfies GeneratedDocument;
}

function readFileAsDataUrl(file: File) {
  // Compress large images on the way in so they don't blow the localStorage
  // quota or bloat sync payloads (falls back to the original on failure).
  return compressImageFile(file);
}

function parseContentBlocks(content: string) {
  return content
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
      const isBulletList = lines.every((line) => line.startsWith("- "));
      const headingWithBullets =
        lines.length > 1 && !lines[0].startsWith("- ") && lines.slice(1).every((line) => line.startsWith("- "));
      // A short label line followed by prose ("Purpose\nThis instruction relates…").
      // Without this case the heading was being folded into the paragraph text and
      // rendered as a run-on line. Treat it as a titled section with a body paragraph.
      const headingWithBody =
        lines.length > 1 &&
        !lines[0].startsWith("- ") &&
        lines[0].length <= 50 &&
        !/[.;:]$/.test(lines[0]) &&
        lines.slice(1).every((line) => !line.startsWith("- "));

      if (isBulletList) return { type: "bullets" as const, title: "", items: lines.map((line) => line.replace(/^- /, "")) };
      if (headingWithBullets) {
        return {
          type: "section-bullets" as const,
          title: lines[0],
          items: lines.slice(1).map((line) => line.replace(/^- /, "")),
        };
      }
      if (headingWithBody) {
        return { type: "section" as const, title: lines[0], items: [lines.slice(1).join(" ")] };
      }
      if (lines.length === 1 && lines[0].length <= 50) return { type: "heading" as const, title: lines[0], items: [] as string[] };
      return { type: "paragraph" as const, title: "", items: [lines.join(" ")] };
    });
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeHtmlMultiline(value: string) {
  return escapeHtml(value).replace(/\n/g, "<br />");
}

function blocksToHtml(content: string) {
  return parseContentBlocks(content)
    .map((block) => {
      if (block.type === "heading") return `<h3 class="doc-section-title">${escapeHtml(block.title)}</h3>`;
      if (block.type === "bullets") {
        return `<ul class="doc-list">${block.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
      }
      if (block.type === "section-bullets") {
        return `<section class="doc-section"><h3 class="doc-section-title">${escapeHtml(block.title)}</h3><ul class="doc-list">${block.items
          .map((item) => `<li>${escapeHtml(item)}</li>`)
          .join("")}</ul></section>`;
      }
      if (block.type === "section") {
        return `<section class="doc-section"><h3 class="doc-section-label">${escapeHtml(block.title)}</h3><p class="doc-paragraph">${escapeHtml(
          block.items[0] || "",
        )}</p></section>`;
      }
      return `<p class="doc-paragraph">${escapeHtml(block.items[0] || "")}</p>`;
    })
    .join("");
}

function siteVisitPhotosHtml(photos?: SiteNotePhoto[]) {
  if (!photos?.length) return "";

  const items = [...photos]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(
      (photo) => `
        <figure class="site-photo-card">
          <img src="${escapeHtml(photo.dataUrl)}" alt="${escapeHtml(photo.caption || "Site visit photo")}" />
          <figcaption>${escapeHtml(photo.caption || "Site visit photo")}</figcaption>
        </figure>
      `
    )
    .join("");

  return `
    <section class="site-photo-section">
      <h3 class="doc-section-title">Photo Record</h3>
      <div class="site-photo-grid">${items}</div>
    </section>
  `;
}

// Curated progress-report photo gallery — two per row, reuses the shared
// .site-photo-grid styles. Wrapped by the caller in a .section-photos block so
// it starts on its own PDF page.
function progressPhotosHtml(photos?: SiteNotePhoto[]) {
  if (!photos?.length) return "";
  const items = [...photos]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(
      (photo) => `
        <figure class="site-photo-card">
          <img src="${escapeHtml(photo.dataUrl)}" alt="${escapeHtml(photo.caption || "Progress photo")}" />
          ${photo.caption ? `<figcaption>${escapeHtml(photo.caption)}</figcaption>` : ""}
        </figure>
      `,
    )
    .join("");
  return `<div class="site-photo-grid">${items}</div>`;
}

function siteVisitObservationHtml(observationHtml?: string) {
  const cleanObservation = sanitizeRichTextHtml(observationHtml || "");
  if (!cleanObservation) return "";

  return `
    <section class="site-observation-section">
      <h3 class="doc-section-title">Observation</h3>
      <div class="site-observation-copy">${cleanObservation}</div>
    </section>
  `;
}

function SiteVisitObservation({ observationHtml }: { observationHtml?: string }) {
  const cleanObservation = sanitizeRichTextHtml(observationHtml || "");
  if (!cleanObservation) return null;

  return (
    <section className="mt-8 border-t border-slate-200 pt-7">
      <h3 className="font-sans text-[13px] font-bold uppercase tracking-[0.18em] text-sky-700">
        Observation
      </h3>
      <div
        className="site-observation-preview mt-4 text-[15px] leading-8 text-slate-700"
        dangerouslySetInnerHTML={{ __html: cleanObservation }}
      />
    </section>
  );
}

function SiteVisitPhotoGallery({ photos }: { photos?: SiteNotePhoto[] }) {
  if (!photos?.length) return null;

  return (
    <section className="mt-8 border-t border-slate-200 pt-7">
      <h3 className="text-[13px] uppercase tracking-[0.18em] text-sky-700 font-bold font-sans">
        Photo Record
      </h3>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {[...photos]
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((photo) => (
            <figure key={photo.id} className="overflow-hidden border border-slate-200 bg-slate-50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.dataUrl} alt={photo.caption || "Site visit photo"} className="h-52 w-full object-cover" />
              <figcaption className="px-3 py-2 text-[12px] font-semibold leading-5 text-slate-700">
                {photo.caption || "Site visit photo"}
              </figcaption>
            </figure>
          ))}
      </div>
    </section>
  );
}

function documentPrintStyles() {
  return `
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #f1f5f9;
      color: #1a1a1a;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", Roboto, Helvetica, Arial, sans-serif;
      font-size: 12px;
      line-height: 1.55;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .print-root { padding: 24px 0 48px; }
    .page {
      width: 210mm;
      min-height: 297mm;
      margin: 0 auto 20px;
      background: white;
      box-shadow: 0 20px 60px rgba(17, 32, 51, 0.14);
      position: relative;
      overflow: hidden;
    }
    .page-inner { padding: 26mm 22mm 22mm; }
    .certificate-page {
      border: 5px solid #19aee6;
    }
    .certificate-page .page-inner {
      padding: 8mm 9mm 10mm;
      min-height: 297mm;
      display: flex;
      flex-direction: column;
    }
    .certificate-page .certificate-shell {
      flex: 0 0 auto;
    }
    .certificate-page .certificate-signature-grid {
      margin-top: auto;
    }
    .cover {
      background: #ffffff;
      color: #0f172a;
      page-break-after: always;
      break-after: page;
      position: relative;
    }
    /* Decorative double-line page border on the cover */
    .cover::before {
      content: '';
      position: absolute;
      top: 9mm;
      right: 9mm;
      bottom: 9mm;
      left: 9mm;
      border: 3px double #0f172a;
      pointer-events: none;
      z-index: 3;
    }
    .cover .page-inner {
      padding: 0;
      min-height: 297mm;
      /* Hard-bound the cover to exactly one A4 page so nothing spills over. */
      max-height: 297mm;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      position: relative;
      z-index: 1;
    }
    .cover-hero {
      background: transparent;
      color: #0f172a;
      flex: 1 1 auto;
      padding: 22mm 26mm 14mm;
      display: flex;
      flex-direction: column;
      min-height: 180mm;
    }
    .cover-hero .letterhead {
      margin-bottom: 0;
      gap: 12px;
    }
    .cover-hero .letterhead-subtitle {
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.1em;
    }
    .cover-hero .letterhead-address {
      color: #64748b;
    }
    .cover-hero .letterhead-mark {
      background: #0f172a;
      color: white;
      font-weight: 600;
    }
    .cover-hero .letterhead-logo {
      background: white;
    }
    .cover-hero-spacer {
      flex: 1 1 auto;
      min-height: 24mm;
    }
    /* Dedicated image region inside the hero. The image is contained so any size fits without cropping.
       No frame chrome — just the picture. Negative side margins let the image extend close to the
       cover border (since the hero itself has 26mm side padding for letterhead/title alignment). */
    .cover-image-frame {
      flex: 1 1 auto;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: none;
      padding: 0;
      margin: 6mm -15mm 10mm;
      min-height: 115mm;
      overflow: hidden;
    }
    .cover-image-frame img {
      max-width: 100%;
      /* Absolute cap (not %) — a percentage can't resolve against the frame's
         indefinite flex height, so a large source image would render at its
         natural height and push the meta band onto a second page. This keeps
         the cover to a single page regardless of the uploaded image size. */
      max-height: 112mm;
      width: auto;
      height: auto;
      object-fit: contain;
      display: block;
    }
    .cover-meta-band {
      background: #0f172a;
      color: white;
      /* Inset from page edges so the cover border can enclose the navy band too. */
      margin: 0 11mm 11mm;
      padding: 14mm 22mm 16mm;
      flex: 0 0 auto;
    }
    .letterhead-band {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 26mm;
      background: linear-gradient(90deg, #0f2742 0%, #145b85 100%);
    }
    .letterhead-mark {
      width: 48px;
      height: 48px;
      border-radius: 6px;
      background: #0f172a;
      color: white;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      letter-spacing: 0.04em;
      font-size: 15px;
      box-shadow: none;
    }
    .letterhead-logo {
      width: 68px;
      height: 68px;
      border-radius: 0;
      background: white;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 18px 30px rgba(15, 39, 66, 0.16);
      overflow: hidden;
      border: 1px solid rgba(16, 32, 51, 0.08);
    }
    .letterhead-logo img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .letterhead {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 18px;
      margin-bottom: 24px;
      position: relative;
      z-index: 1;
    }
    .letterhead-title {
      font-size: 18px;
      line-height: 1.2;
      font-weight: 600;
      letter-spacing: 0;
      color: #0f172a;
      margin: 0 0 2px;
    }
    .letterhead-subtitle {
      font-size: 10px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: #64748b;
      margin: 0 0 6px;
      font-weight: 500;
    }
    .letterhead-address {
      font-size: 11px;
      color: #64748b;
      line-height: 1.5;
      margin: 0;
    }
    .document-title {
      font-size: 23px;
      text-transform: none;
      letter-spacing: -0.01em;
      margin: 24px 0 10px;
      color: #0f2742;
      font-weight: 700;
    }
    .document-title::after {
      content: '';
      display: block;
      width: 52px;
      height: 3px;
      border-radius: 2px;
      background: #0ea5e9;
      margin-top: 8px;
    }
    .cover-title {
      color: #0f172a;
      font-size: 44px;
      line-height: 1.08;
      font-weight: 700;
      letter-spacing: -0.02em;
      text-transform: none;
      margin: 0;
      max-width: 96%;
    }
    .cover-subtitle {
      margin: 14px 0 0;
      max-width: 92%;
      color: #475569;
      font-size: 14px;
      line-height: 1.55;
      letter-spacing: 0;
    }
    .cover-meta-band .meta-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 18px 32px;
      margin: 0;
    }
    .cover-meta-band .meta-item {
      border-top: none;
      padding-top: 0;
    }
    .cover-meta-band .meta-label {
      color: rgba(255,255,255,0.65);
      font-size: 10px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      font-weight: 500;
      margin-bottom: 5px;
    }
    .cover-meta-band .meta-value {
      color: white;
      font-weight: 600;
      font-size: 17px;
      line-height: 1.3;
      margin-top: 0;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px 18px;
      margin-bottom: 22px;
    }
    .meta-item {
      border-top: none;
      padding-top: 0;
    }
    .meta-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: #64748b;
      margin-bottom: 3px;
      font-weight: 500;
    }
    .meta-value {
      font-size: 13px;
      color: #0f172a;
      font-weight: 500;
    }
    .doc-section { margin-bottom: 18px; }
    .doc-section-title {
      font-size: 14px;
      text-transform: none;
      letter-spacing: 0;
      color: #0f172a;
      margin: 0 0 8px;
      font-weight: 600;
    }
    /* Short label heading for letter sections (Purpose / Instruction / Closing …). */
    .doc-section-label {
      font-size: 10.5px;
      text-transform: uppercase;
      letter-spacing: 0.14em;
      color: #1d5f8b;
      margin: 0 0 5px;
      font-weight: 700;
    }
    .doc-paragraph {
      font-size: 13px;
      line-height: 1.7;
      color: #334155;
      margin: 0 0 12px;
    }
    .doc-list {
      margin: 0 0 12px;
      padding-left: 18px;
      color: #334155;
      font-size: 13px;
      line-height: 1.65;
    }
    .doc-list li { margin-bottom: 6px; }
    .report-summary {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 14px;
      margin-bottom: 6px;
    }
    .report-card {
      border: none;
      border-left: 3px solid #0f172a;
      border-radius: 0;
      padding: 8px 14px;
      background: transparent;
    }
    .report-card-label {
      font-size: 10px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #64748b;
      margin-bottom: 4px;
      font-weight: 500;
    }
    .report-card-value {
      font-size: 22px;
      font-weight: 600;
      color: #0f172a;
      font-variant-numeric: tabular-nums;
    }
    .certificate-panel {
      border: 1px solid #d8e1ea;
      border-radius: 0;
      padding: 18px 18px 10px;
      background: linear-gradient(180deg, #f9fbfd 0%, #ffffff 100%);
      margin-bottom: 22px;
      font-family: Arial, sans-serif;
    }
    .signature-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 28px;
      margin-top: 42px;
    }
    .signature-box {
      border-top: 1px solid #cbd5e1;
      padding-top: 10px;
      min-height: 52px;
    }
    .signature-image {
      display: block;
      max-width: 42mm;
      max-height: 16mm;
      object-fit: contain;
      margin: -28px 0 8px;
    }
    .signature-name {
      font-weight: 600;
      color: #0f172a;
      margin-bottom: 4px;
      font-size: 13px;
    }
    .signature-role {
      font-size: 11.5px;
      color: #64748b;
    }
    .page-number {
      position: absolute;
      right: 15mm;
      bottom: 8mm;
      font-size: 10px;
      color: #94a3b8;
    }
    .footer-note {
      margin-top: 26px;
      padding-top: 12px;
      border-top: 1px solid #e5e7eb;
      font-size: 10.5px;
      color: #64748b;
      line-height: 1.55;
    }
    .brand-shell {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 18px;
      margin: -26mm -22mm 22px;
      padding: 18mm 22mm 14mm;
      background: linear-gradient(180deg, #f4f9fd 0%, #ffffff 100%);
      border-bottom: 2px solid #0f2742;
    }
    .brand-mark-box {
      display: flex;
      align-items: flex-start;
      gap: 16px;
      min-width: 0;
      flex: 1;
    }
    .brand-block {
      min-width: 0;
      max-width: 118mm;
    }
    .brand-kicker {
      font-family: Arial, sans-serif;
      font-size: 9.5px;
      letter-spacing: 0.28em;
      text-transform: uppercase;
      color: #1d5f8b;
      margin-bottom: 8px;
      font-weight: 700;
    }
    .brand-name {
      font-size: 25px;
      line-height: 1.15;
      margin: 0;
      color: #0f2742;
      font-weight: 700;
      letter-spacing: -0.01em;
      overflow-wrap: anywhere;
    }
    .brand-tagline {
      margin-top: 6px;
      font-family: Arial, sans-serif;
      font-size: 10.5px;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: #64748b;
      font-weight: 600;
      line-height: 1.5;
    }
    .brand-address {
      margin-top: 10px;
      font-family: Arial, sans-serif;
      font-size: 12px;
      line-height: 1.7;
      color: #617284;
    }
    .doc-status-chip {
      align-self: flex-start;
      border: 1px solid #d3deea;
      border-radius: 0;
      padding: 8px 14px;
      font-family: Arial, sans-serif;
      font-size: 10px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: #3d5a79;
      font-weight: 700;
      white-space: nowrap;
    }
    .doc-divider {
      height: 1px;
      background: linear-gradient(90deg, rgba(18,38,63,0.16), rgba(18,38,63,0));
      margin: 18px 0 22px;
    }
    .certificate-shell {
      background: #ffffff;
      color: #071526;
      font-family: Arial, sans-serif;
    }
    .certificate-banner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 18px;
      background: #1f5b89;
      color: #ffffff;
      padding: 12px 16px;
      border-bottom: 10px solid #19aee6;
    }
    .certificate-banner-logo {
      min-width: 92px;
      font-size: 26px;
      font-weight: 800;
      letter-spacing: -0.04em;
      text-transform: lowercase;
    }
    .certificate-banner-title {
      font-size: 12px;
      line-height: 1.35;
      text-align: right;
      text-transform: uppercase;
      font-weight: 800;
    }
    .certificate-banner-subtitle {
      display: block;
      font-size: 9px;
      font-style: italic;
      font-weight: 600;
      opacity: 0.9;
      text-transform: none;
    }
    .certificate-issued {
      margin-top: 12px;
      text-align: center;
      color: #0b9bd2;
      font-size: 11px;
      letter-spacing: 0.52em;
      text-transform: uppercase;
      font-weight: 700;
    }
    .certificate-main-title {
      margin: 6px 0 8px;
      text-align: center;
      font-size: 28px;
      line-height: 1;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: #071526;
      font-weight: 900;
    }
    .certificate-rule {
      height: 1px;
      margin: 0 12mm 8px;
      background: #c8942d;
    }
    .certificate-legal,
    .certificate-statement,
    .certificate-narrative {
      margin: 0 auto 7px;
      max-width: 164mm;
      text-align: center;
      font-size: 10px;
      line-height: 1.35;
      color: #071526;
    }
    .certificate-legal {
      font-style: italic;
      font-weight: 700;
    }
    .certificate-contractor {
      margin-top: 6px;
      text-align: center;
      font-size: 20px;
      line-height: 1.1;
      text-transform: uppercase;
      color: #0f4c93;
      font-weight: 900;
    }
    .certificate-project {
      margin: 4px auto 8px;
      max-width: 168mm;
      text-align: center;
      color: #0b9bd2;
      font-size: 12px;
      font-style: italic;
      font-weight: 800;
      line-height: 1.35;
    }
    .certificate-table {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      margin: 12px 0 0;
      border: 1.5px solid #19aee6;
      font-family: Arial, sans-serif;
    }
    .certificate-cell {
      min-height: 35px;
      padding: 7px 9px;
      border-right: 1.5px solid #19aee6;
      border-bottom: 1.5px solid #19aee6;
    }
    .certificate-cell:nth-child(2n) { border-right: 0; }
    .certificate-cell:nth-last-child(-n+2) { border-bottom: 0; }
    .certificate-cell-label {
      color: #0e5178;
      font-size: 8px;
      line-height: 1.15;
      text-transform: uppercase;
      font-weight: 900;
    }
    .certificate-cell-value {
      margin-top: 2px;
      color: #071526;
      font-size: 11px;
      line-height: 1.25;
      font-weight: 800;
    }
    .certificate-body-copy {
      margin: 12px auto 0;
      max-width: 166mm;
      text-align: left;
      font-family: Arial, sans-serif;
    }
    .certificate-body-copy .doc-paragraph,
    .certificate-body-copy .doc-list {
      font-size: 10px;
      line-height: 1.45;
      margin-bottom: 6px;
      color: #071526;
    }
    .certificate-body-copy .doc-section-title {
      margin-top: 8px;
      color: #0b4f93;
      font-size: 10px;
    }
    .certificate-signature-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 14px;
      margin-top: 21px;
      font-family: Arial, sans-serif;
    }
    .certificate-signature-box {
      border-top: 3px solid #19aee6;
      padding-top: 8px;
      min-height: 78px;
    }
    .certificate-signature-label {
      color: #0d4775;
      font-size: 10px;
      line-height: 1.15;
      text-transform: uppercase;
      font-weight: 900;
    }
    .certificate-signature-name {
      margin-top: 3px;
      color: #071526;
      font-size: 10px;
      line-height: 1.3;
      font-weight: 700;
    }
    .certificate-signature-image {
      display: block;
      max-width: 38mm;
      max-height: 14mm;
      object-fit: contain;
      margin: 4px 0 5px;
    }
    .certificate-signature-line {
      margin-top: 22px;
      border-top: 1px solid #8a9aac;
      padding-top: 4px;
      color: #66798b;
      font-size: 9px;
      font-style: italic;
    }
    .certificate-conditions {
      margin-top: 16px;
      border: 1.5px solid #19aee6;
      background: #eef9ff;
      padding: 9px 11px;
      font-family: Arial, sans-serif;
      color: #0f273b;
      font-size: 10px;
      line-height: 1.45;
    }
    .certificate-seal {
      width: 76px;
      height: 76px;
      margin: 0 auto 18px;
      border-radius: 0;
      border: 1px solid rgba(29,95,139,0.22);
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(20,91,133,0.06);
      color: #12395d;
      font-family: Arial, sans-serif;
      font-size: 12px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      font-weight: 700;
    }
    .certificate-title {
      margin: 18px 0 8px;
      font-size: 34px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #12263f;
    }
    .certificate-subtitle {
      font-family: Arial, sans-serif;
      font-size: 12px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: #507497;
      font-weight: 700;
      line-height: 1.6;
      max-width: 128mm;
      margin: 0 auto;
    }
    .site-observation-section {
      margin-top: 24px;
      padding-top: 18px;
      border-top: 1px solid #d7e2ee;
      break-inside: avoid;
    }
    .site-observation-copy {
      font-family: Arial, sans-serif;
      color: #273849;
      font-size: 14px;
      line-height: 1.85;
    }
    .site-observation-copy p {
      margin: 0 0 12px;
    }
    .site-observation-copy ul,
    .site-observation-copy ol {
      margin: 0 0 12px;
      padding-left: 18px;
    }
    .site-observation-copy li {
      margin-bottom: 5px;
    }
    .site-observation-copy strong {
      color: #071526;
      font-weight: 700;
    }
    .site-observation-copy u {
      text-underline-offset: 0.18em;
    }
    .site-photo-section {
      margin-top: 24px;
      padding-top: 18px;
      border-top: 1px solid #d7e2ee;
      break-inside: avoid;
    }
    .site-photo-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px;
      margin-top: 12px;
    }
    .site-photo-card {
      margin: 0;
      border: 1px solid #d7e2ee;
      background: #f8fafc;
      break-inside: avoid;
    }
    .site-photo-card img {
      display: block;
      width: 100%;
      height: 48mm;
      object-fit: cover;
    }
    .site-photo-card figcaption {
      padding: 8px 10px;
      font-family: Arial, sans-serif;
      font-size: 11px;
      font-weight: 700;
      line-height: 1.45;
      color: #334155;
    }
    .certificate-meta {
      margin: 24px auto 0;
      max-width: 150mm;
      text-align: left;
    }
    /* ── Progress report sections ─────────────────────────────────────── */
    .report-body { counter-reset: section; }
    .report-section {
      margin: 22px 0 14px;
      break-inside: avoid-page;
      page-break-inside: avoid;
      counter-increment: section;
    }
    .report-section.section-fluid {
      break-inside: auto;
      page-break-inside: auto;
    }
    /* The photo gallery always starts on a fresh page in the PDF. */
    .report-section.section-photos {
      page-break-before: always;
      break-before: page;
    }
    .report-section-title {
      font-size: 15px;
      font-weight: 600;
      letter-spacing: 0;
      text-transform: none;
      color: #0f172a;
      margin: 0 0 10px;
      padding-bottom: 6px;
      border-bottom: 1px solid #e5e7eb;
      display: flex;
      align-items: baseline;
      gap: 8px;
    }
    .report-section-title::before {
      content: counter(section) ".";
      color: #94a3b8;
      font-weight: 500;
      font-size: 13.5px;
    }
    .report-section-prose {
      font-size: 12.5px;
      line-height: 1.6;
      color: #334155;
    }
    .report-section-prose p { margin: 0 0 8px; }
    .report-section-prose p:last-child { margin-bottom: 0; }

    .report-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
      color: #1f2937;
    }
    .report-table thead {
      display: table-header-group;
    }
    .report-table thead tr {
      background: transparent;
      color: #0f172a;
    }
    .report-table thead th {
      padding: 10px 6px 6px;
      text-align: left;
      font-weight: 600;
      font-size: 10px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: #475569;
      border: none;
      border-bottom: 1.5px solid #0f172a;
    }
    .report-table tbody tr {
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .report-table tbody td {
      padding: 8px 6px;
      border: none;
      border-bottom: 1px solid #e5e7eb;
      vertical-align: top;
    }
    .report-table tbody tr.section-row td {
      background: transparent;
      font-weight: 600;
      color: #0f172a;
      text-transform: none;
      letter-spacing: 0;
      font-size: 11px;
      padding-top: 14px;
      border-bottom: 1px solid #e5e7eb;
    }
    .report-table .num {
      text-align: right;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .report-table tfoot tr {
      background: transparent;
      font-weight: 600;
    }
    .report-table tfoot td {
      padding: 10px 6px;
      border: none;
      border-top: 1.5px solid #0f172a;
      color: #0f172a;
    }

    /* ── Item-level progress: bar layout ──────────────────────────────── */
    .item-bars { font-size: 11.5px; }
    .item-bar-legend {
      display: flex;
      flex-wrap: wrap;
      gap: 14px;
      font-size: 10px;
      color: #64748b;
      margin: 0 0 10px;
      padding-bottom: 6px;
      border-bottom: 1px solid #e5e7eb;
    }
    .item-bar-legend-swatch {
      display: inline-block;
      width: 10px;
      height: 6px;
      border-radius: 1px;
      margin-right: 4px;
      vertical-align: middle;
    }
    .bar-section-header {
      font-size: 11px;
      font-weight: 600;
      color: #0f172a;
      margin: 12px 0 4px;
    }
    .item-bar-row {
      display: grid;
      grid-template-columns: 22px 1fr 110px 42px;
      gap: 10px;
      padding: 6px 0;
      align-items: center;
      border-bottom: 1px solid #e5e7eb;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .item-bar-num {
      font-size: 10px;
      color: #64748b;
      text-align: right;
      font-variant-numeric: tabular-nums;
    }
    .item-bar-name {
      font-size: 11px;
      color: #1f2937;
      line-height: 1.4;
      word-break: break-word;
    }
    .item-bar-track {
      height: 8px;
      background: #f1f5f9;
      position: relative;
      border-radius: 2px;
      overflow: hidden;
    }
    .item-bar-planned {
      position: absolute;
      inset: 0 auto 0 0;
      background: #cbd5e1;
    }
    .item-bar-actual {
      position: absolute;
      inset: 0 auto 0 0;
      background: #0f172a;
    }
    .item-bar-value {
      font-size: 11px;
      font-weight: 600;
      text-align: right;
      font-variant-numeric: tabular-nums;
      color: #0f172a;
    }

    /* ── Work plan Gantt ──────────────────────────────────────────────── */
    .gantt-chart { font-size: 10.5px; }
    .gantt-axis {
      display: grid;
      grid-template-columns: 30% 1fr;
      border-bottom: 1.5px solid #0f172a;
      padding-bottom: 4px;
      margin-bottom: 6px;
    }
    .gantt-axis-track {
      position: relative;
      height: 14px;
    }
    .gantt-axis .gantt-task {
      font-size: 9.5px;
      color: #64748b;
      letter-spacing: 0.06em;
    }
    .gantt-axis-tick {
      position: absolute;
      top: 0;
      bottom: 0;
      font-size: 9px;
      color: #64748b;
      padding-left: 3px;
      border-left: 1px solid #e2e8f0;
      white-space: nowrap;
    }
    .gantt-row {
      display: grid;
      grid-template-columns: 30% 1fr;
      padding: 5px 0;
      border-bottom: 1px solid #e5e7eb;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .gantt-task {
      padding-right: 10px;
      font-size: 10.5px;
      color: #1f2937;
      line-height: 1.35;
      word-break: break-word;
    }
    .gantt-track {
      position: relative;
      height: 16px;
      background: #f8fafc;
      border-radius: 2px;
    }
    .gantt-bar {
      position: absolute;
      top: 3px;
      bottom: 3px;
      background: #0f172a;
      border-radius: 2px;
    }
    .gantt-bar-completed { background: #047857; }
    .gantt-bar-delayed { background: #b91c1c; }
    .gantt-bar-in-progress { background: #1d4ed8; }
    .gantt-bar-pending { background: #94a3b8; }
    .gantt-unscheduled {
      margin-top: 14px;
      font-size: 10.5px;
      color: #475569;
    }
    .gantt-unscheduled-label {
      font-size: 9px;
      text-transform: uppercase;
      color: #64748b;
      letter-spacing: 0.08em;
      margin-bottom: 4px;
    }
    .gantt-unscheduled-item {
      padding: 3px 0;
      border-bottom: 1px solid #e5e7eb;
    }

    @page {
      size: A4;
      margin: 15mm 15mm 18mm;
      @bottom-right {
        content: counter(page);
        font-size: 9px;
        color: #94a3b8;
      }
    }
    @page :first {
      /* Cover prints edge-to-edge */
      margin: 0;
      @bottom-right { content: ""; }
    }
    @media print {
      body { background: white; }
      .print-root { padding: 0; }
      .page {
        margin: 0;
        width: auto;
        min-height: auto;
        box-shadow: none;
        page-break-after: always;
      }
      .page:last-child { page-break-after: auto; }
      /* Page-inner padding is provided by @page margins in print so content stays inside the safe area. */
      .page-inner { padding: 0; }
      .cover .page-inner {
        padding: 0;
        min-height: 297mm;
        max-height: 297mm;
        overflow: hidden;
      }
      .certificate-page .page-inner {
        min-height: 297mm;
      }
      .report-table { font-size: 10.5px; }
      /* Hide the in-content page-number stamp when printing — @page footer takes over. */
      .page-number { display: none; }
    }
  `;
}

function documentInitials(doc: GeneratedDocument) {
  const source = (doc.letterheadTitle || doc.title || "PB")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");
  return source || "PB";
}

function documentMarkHtml(doc: GeneratedDocument) {
  if (doc.brandLogoDataUrl) {
    return `<div class="letterhead-logo"><img src="${escapeHtml(doc.brandLogoDataUrl)}" alt="Logo" /></div>`;
  }
  return `<div class="letterhead-mark">${escapeHtml(documentInitials(doc))}</div>`;
}

function resolveSavedSignature(
  source: GeneratedDocument["signatorySignatureSource"] | GeneratedDocument["recipientSignatureSource"],
  signatureProfile?: UserSignatureProfile | null
) {
  if (source !== "saved" || !signatureProfile?.imageDataUrl) return "";
  return signatureProfile.imageDataUrl;
}

function signatureImageHtml(dataUrl: string, className = "signature-image") {
  if (!dataUrl) return "";
  return `<img class="${className}" src="${escapeHtml(dataUrl)}" alt="Saved signature" />`;
}

function progressItemTableHtml(progressReport: ProgressReport, currencyCode: string) {
  const sections = progressReport.sheets;
  if (!sections.length) return "";
  let runningIndex = 0;
  const rowsHtml = sections
    .map((sheet) => {
      const sheetItemsHtml = sheet.items
        .map((item) => {
          runningIndex += 1;
          const planned = toNumber(item.plannedPercent);
          const actual = toNumber(item.actualPercent);
          const variance = actual - planned;
          return `
            <tr>
              <td class="num">${runningIndex}</td>
              <td>${escapeHtml(item.description || "")}</td>
              <td>${escapeHtml(item.unit || "")}</td>
              <td class="num">${escapeHtml(item.weightPercent || "")}%</td>
              <td class="num">${planned.toFixed(1)}%</td>
              <td class="num">${actual.toFixed(1)}%</td>
              <td class="num" style="color:${variance >= 0 ? "#065f46" : "#991b1b"}">${variance >= 0 ? "+" : ""}${variance.toFixed(1)}%</td>
              <td class="num">${escapeHtml(currencyCode)} ${escapeHtml(currency(toNumber(item.earnedAmount)))}</td>
            </tr>
          `;
        })
        .join("");
      if (!sheetItemsHtml) return "";
      const sheetHeader =
        sections.length > 1
          ? `<tr class="section-row"><td colspan="8">${escapeHtml(sheet.name || "Section")}</td></tr>`
          : "";
      return sheetHeader + sheetItemsHtml;
    })
    .join("");
  if (!rowsHtml) return "";

  const totals = progressReport.sheets.flatMap((sheet) => sheet.items).reduce(
    (acc, item) => {
      acc.earned += toNumber(item.earnedAmount);
      return acc;
    },
    { earned: 0 },
  );

  return `
    <table class="report-table">
      <thead>
        <tr>
          <th style="width:5%">#</th>
          <th>Activity</th>
          <th style="width:6%">Unit</th>
          <th style="width:9%" class="num">Weight</th>
          <th style="width:9%" class="num">Planned</th>
          <th style="width:9%" class="num">Actual</th>
          <th style="width:10%" class="num">Variance</th>
          <th style="width:16%" class="num">Earned</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
      <tfoot>
        <tr>
          <td colspan="7" class="num">Total earned</td>
          <td class="num">${escapeHtml(currencyCode)} ${escapeHtml(currency(totals.earned))}</td>
        </tr>
      </tfoot>
    </table>
  `;
}

function progressSheetBreakdownHtml(progressReport: ProgressReport, currencyCode: string) {
  const sheets = progressReport.sheets;
  if (!sheets.length) return "";
  const rows = sheets
    .map((sheet) => {
      const planned = sheet.items.reduce(
        (sum, item) => sum + (toNumber(item.weightPercent) * toNumber(item.plannedPercent)) / 100,
        0,
      );
      const actual = sheet.items.reduce(
        (sum, item) => sum + (toNumber(item.weightPercent) * toNumber(item.actualPercent)) / 100,
        0,
      );
      const earned = sheet.items.reduce((sum, item) => sum + toNumber(item.earnedAmount), 0);
      const variance = actual - planned;
      return `
        <tr>
          <td>${escapeHtml(sheet.name || "Section")}</td>
          <td class="num">${planned.toFixed(1)}%</td>
          <td class="num">${actual.toFixed(1)}%</td>
          <td class="num" style="color:${variance >= 0 ? "#065f46" : "#991b1b"}">${variance >= 0 ? "+" : ""}${variance.toFixed(1)}%</td>
          <td class="num">${escapeHtml(currencyCode)} ${escapeHtml(currency(earned))}</td>
        </tr>
      `;
    })
    .join("");
  return `
    <table class="report-table">
      <thead>
        <tr>
          <th>Section</th>
          <th style="width:14%" class="num">Planned</th>
          <th style="width:14%" class="num">Actual</th>
          <th style="width:14%" class="num">Variance</th>
          <th style="width:22%" class="num">Earned</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function richNarrativeToHtml(text?: string) {
  if (!text || !text.trim()) return "";
  // Treat each blank-line-separated block as a paragraph; preserve single line breaks as <br>.
  return text
    .split(/\n{2,}/)
    .map((para) =>
      `<p>${escapeHtmlMultiline(para.trim())}</p>`
    )
    .join("");
}

function inPeriod(dateIso: string | undefined, start?: string, end?: string) {
  if (!dateIso) return true; // include items missing dates rather than hide them
  if (start && dateIso < start) return false;
  if (end && dateIso > end) return false;
  return true;
}

/**
 * Whether a work-plan activity overlaps the optional report window. Activities
 * with no dates at all can't be placed on a timeline, so they are kept (the
 * gantt view lists them under "Unscheduled" and the table shows "—").
 */
function activityInWindow(
  activity: { startDate: string; endDate: string },
  windowStart?: string,
  windowEnd?: string,
) {
  if (!windowStart && !windowEnd) return true;
  const start = activity.startDate || activity.endDate;
  const end = activity.endDate || activity.startDate;
  if (!start || !end) return true;
  if (windowStart && end < windowStart) return false;
  if (windowEnd && start > windowEnd) return false;
  return true;
}

function progressWorkPlanHtml(
  workPlans: SavedWorkPlan[],
  projectId: string,
  windowStart?: string,
  windowEnd?: string,
) {
  const activities = workPlans
    .filter((plan) => plan.project_id === projectId)
    .flatMap((plan) => plan.sheets.flatMap((sheet) => sheet.activities))
    .filter((activity) => (activity.rowType || "activity") !== "section" && activity.description)
    .filter((activity) => activityInWindow(activity, windowStart, windowEnd));

  if (activities.length === 0) return "";

  const statusLabel: Record<string, string> = {
    pending: "Pending",
    "in-progress": "In progress",
    completed: "Completed",
    delayed: "Delayed",
  };

  const rows = activities
    .map((activity, index) => {
      const status = activity.status || "pending";
      const color =
        status === "completed"
          ? "#047857"
          : status === "delayed"
            ? "#991b1b"
            : status === "in-progress"
              ? "#1d4ed8"
              : "#475569";
      return `
        <tr>
          <td class="num">${index + 1}</td>
          <td>${escapeHtml(activity.description)}</td>
          <td class="num">${escapeHtml(activity.duration || "—")}</td>
          <td>${escapeHtml(activity.startDate || "—")}</td>
          <td>${escapeHtml(activity.endDate || "—")}</td>
          <td style="color:${color}; font-weight:500">${escapeHtml(statusLabel[status] || status)}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <table class="report-table">
      <thead>
        <tr>
          <th style="width:5%">#</th>
          <th>Activity</th>
          <th style="width:12%" class="num">Duration</th>
          <th style="width:14%">Start</th>
          <th style="width:14%">End</th>
          <th style="width:13%">Status</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function progressPaymentCertificatesHtml(
  certificates: PaymentCertificate[],
  projectId: string,
  currencyCode: string,
  periodStart?: string,
  periodEnd?: string,
) {
  const projectCerts = certificates
    .filter((cert) => cert.project_id === projectId)
    .filter((cert) => inPeriod(cert.date, periodStart, periodEnd))
    .sort((a, b) =>
      a.type.localeCompare(b.type) ||
      a.number - b.number ||
      (a.revision || 0) - (b.revision || 0),
    );

  if (projectCerts.length === 0) return "";

  const statusLabel = (status: PaymentCertificate["status"]) =>
    status === "paid" ? "Paid" : status === "approved" ? "Approved" : status === "submitted" ? "Submitted" : "Draft";
  const statusColor = (status: PaymentCertificate["status"]) =>
    status === "paid" ? "#047857" : status === "approved" ? "#1d4ed8" : status === "submitted" ? "#b45309" : "#64748b";
  const fmtCert = (cert: PaymentCertificate) => {
    const base = cert.type === "final" ? "FPC" : "IPC";
    const rev = cert.revision ? ` Rev ${cert.revision}` : "";
    return `${base} ${cert.number.toString().padStart(2, "0")}${rev}`;
  };

  let cumulative = 0;
  const rows = projectCerts
    .map((cert, index) => {
      const net = certificateNet(cert);
      cumulative += net;
      return `
        <tr>
          <td class="num">${index + 1}</td>
          <td>${escapeHtml(fmtCert(cert))}</td>
          <td>${escapeHtml(cert.date || "—")}</td>
          <td style="color:${statusColor(cert.status)}; font-weight:500">${escapeHtml(statusLabel(cert.status))}</td>
          <td class="num">${escapeHtml(currencyCode)} ${escapeHtml(currency(net))}</td>
          <td class="num">${escapeHtml(currencyCode)} ${escapeHtml(currency(cumulative))}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <table class="report-table">
      <thead>
        <tr>
          <th style="width:5%">#</th>
          <th style="width:18%">Certificate</th>
          <th style="width:14%">Date</th>
          <th style="width:13%">Status</th>
          <th style="width:25%" class="num">Net certified</th>
          <th style="width:25%" class="num">Cumulative</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr>
          <td colspan="5" class="num">Total certified to date</td>
          <td class="num">${escapeHtml(currencyCode)} ${escapeHtml(currency(cumulative))}</td>
        </tr>
      </tfoot>
    </table>
  `;
}

function progressItemBarsHtml(progressReport: ProgressReport) {
  const sections = progressReport.sheets;
  if (!sections.length) return "";
  let runningIndex = 0;
  const blocks = sections
    .map((sheet) => {
      const headerHtml =
        sections.length > 1
          ? `<div class="bar-section-header">${escapeHtml(sheet.name || "Section")}</div>`
          : "";
      const itemsHtml = sheet.items
        .map((item) => {
          runningIndex += 1;
          const planned = Math.min(toNumber(item.plannedPercent), 100);
          const actual = Math.min(toNumber(item.actualPercent), 100);
          const ahead = actual >= planned;
          const complete = actual >= 95;
          const actualColor = complete ? "#047857" : ahead ? "#0f172a" : "#b45309";
          return `
            <div class="item-bar-row">
              <div class="item-bar-num">${runningIndex}</div>
              <div class="item-bar-name">${escapeHtml(item.description || "")}</div>
              <div class="item-bar-track">
                <div class="item-bar-planned" style="width:${planned.toFixed(1)}%"></div>
                <div class="item-bar-actual" style="width:${actual.toFixed(1)}%; background:${actualColor}"></div>
              </div>
              <div class="item-bar-value">${actual.toFixed(0)}%</div>
            </div>
          `;
        })
        .join("");
      return headerHtml + itemsHtml;
    })
    .join("");
  return `
    <div class="item-bars">
      <div class="item-bar-legend">
        <span><span class="item-bar-legend-swatch" style="background:#cbd5e1"></span> Planned</span>
        <span><span class="item-bar-legend-swatch" style="background:#0f172a"></span> Actual on/ahead</span>
        <span><span class="item-bar-legend-swatch" style="background:#b45309"></span> Behind plan</span>
        <span><span class="item-bar-legend-swatch" style="background:#047857"></span> ≥ 95% complete</span>
      </div>
      ${blocks}
    </div>
  `;
}

function parseDateSafe(iso?: string): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function progressWorkPlanGanttHtml(
  workPlans: SavedWorkPlan[],
  projectId: string,
  windowStart?: string,
  windowEnd?: string,
) {
  const activities = workPlans
    .filter((plan) => plan.project_id === projectId)
    .flatMap((plan) => plan.sheets.flatMap((sheet) => sheet.activities))
    .filter((activity) => (activity.rowType || "activity") !== "section" && activity.description)
    .filter((activity) => activityInWindow(activity, windowStart, windowEnd));

  if (activities.length === 0) return "";

  const dated = activities
    .map((a) => ({
      activity: a,
      start: parseDateSafe(a.startDate),
      end: parseDateSafe(a.endDate),
    }))
    .filter((row): row is { activity: typeof activities[number]; start: Date; end: Date } =>
      Boolean(row.start && row.end && row.end.getTime() >= row.start.getTime()),
    );

  if (dated.length === 0) {
    // No dated activities — fall back to the table format.
    return progressWorkPlanHtml(workPlans, projectId, windowStart, windowEnd);
  }

  const unscheduled = activities.filter(
    (a) => !parseDateSafe(a.startDate) || !parseDateSafe(a.endDate),
  );

  // When a window is set, the axis spans the window so bars that run past it
  // are clipped at the edges; otherwise span the full data range.
  const minTime =
    parseDateSafe(windowStart)?.getTime() ?? Math.min(...dated.map((r) => r.start.getTime()));
  const maxTime =
    parseDateSafe(windowEnd)?.getTime() ?? Math.max(...dated.map((r) => r.end.getTime()));
  const spanMs = Math.max(1, maxTime - minTime);
  const spanDays = spanMs / (1000 * 60 * 60 * 24);

  // Build axis ticks. Monthly if span > 90 days, otherwise weekly.
  const useMonthly = spanDays > 90;
  const ticks: Array<{ pos: number; label: string }> = [];
  if (useMonthly) {
    const d = new Date(minTime);
    d.setUTCDate(1);
    while (d.getTime() <= maxTime) {
      const pos = ((d.getTime() - minTime) / spanMs) * 100;
      if (pos >= 0 && pos <= 100) {
        ticks.push({
          pos,
          label: d.toLocaleDateString("en", { month: "short", year: "2-digit" }),
        });
      }
      d.setUTCMonth(d.getUTCMonth() + 1);
    }
  } else {
    const d = new Date(minTime);
    let safety = 0;
    while (d.getTime() <= maxTime && safety++ < 60) {
      const pos = ((d.getTime() - minTime) / spanMs) * 100;
      if (pos >= 0 && pos <= 100) {
        ticks.push({
          pos,
          label: `${d.getUTCDate()}/${d.getUTCMonth() + 1}`,
        });
      }
      d.setUTCDate(d.getUTCDate() + 7);
    }
  }

  const statusClass: Record<string, string> = {
    completed: "gantt-bar-completed",
    "in-progress": "gantt-bar-in-progress",
    delayed: "gantt-bar-delayed",
    pending: "gantt-bar-pending",
  };

  const rowsHtml = dated
    .map((row) => {
      // Clamp to the axis so bars overflowing a set window are clipped.
      const rawLeft = ((row.start.getTime() - minTime) / spanMs) * 100;
      const rawRight = ((row.end.getTime() - minTime) / spanMs) * 100;
      const leftPct = Math.min(100, Math.max(0, rawLeft));
      const widthPct = Math.max(0.6, Math.min(100, rawRight) - leftPct);
      const status = row.activity.status || "pending";
      return `
        <div class="gantt-row">
          <div class="gantt-task">${escapeHtml(row.activity.description)}</div>
          <div class="gantt-track">
            <div class="gantt-bar ${statusClass[status] || "gantt-bar-pending"}"
                 style="left:${leftPct.toFixed(2)}%; width:${widthPct.toFixed(2)}%"></div>
          </div>
        </div>
      `;
    })
    .join("");

  const axisHtml = `
    <div class="gantt-axis">
      <div class="gantt-task">ACTIVITY</div>
      <div class="gantt-axis-track">
        ${ticks
          .map(
            (t) =>
              `<div class="gantt-axis-tick" style="left:${t.pos.toFixed(2)}%">${escapeHtml(t.label)}</div>`,
          )
          .join("")}
      </div>
    </div>
  `;

  const unscheduledHtml =
    unscheduled.length > 0
      ? `
        <div class="gantt-unscheduled">
          <div class="gantt-unscheduled-label">Unscheduled (${unscheduled.length})</div>
          ${unscheduled
            .map((a) => `<div class="gantt-unscheduled-item">${escapeHtml(a.description)}</div>`)
            .join("")}
        </div>
      `
      : "";

  return `<div class="gantt-chart">${axisHtml}${rowsHtml}</div>${unscheduledHtml}`;
}

function progressActionPointsHtml(meetingMinutes: MeetingMinute[], projectId: string) {
  const liveActions = getLiveMeetingActionItems(meetingMinutes)
    .filter((action) => action.project_id === projectId)
    .filter((action) => action.status !== "closed");

  if (liveActions.length === 0) return "";

  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = (deadline: string) => Boolean(deadline) && deadline < today;

  liveActions.sort((a, b) => {
    const aOver = isOverdue(a.deadline);
    const bOver = isOverdue(b.deadline);
    if (aOver !== bOver) return aOver ? -1 : 1;
    return (a.deadline || "9999-12-31").localeCompare(b.deadline || "9999-12-31");
  });

  const statusLabel: Record<string, string> = {
    open: "Open",
    "in-progress": "In progress",
    closed: "Closed",
  };

  const rows = liveActions
    .map((action, idx) => {
      const overdue = isOverdue(action.deadline);
      const meetingRef = [action.meetingTitle, action.meetingDate].filter(Boolean).join(" · ");
      return `
        <tr>
          <td class="num">${idx + 1}</td>
          <td>${escapeHtml(action.description)}</td>
          <td>${escapeHtml(action.responsiblePerson || "—")}</td>
          <td style="color:${overdue ? "#b91c1c" : "#1f2937"}; font-weight:${overdue ? "600" : "400"}">
            ${escapeHtml(action.deadline || "—")}${overdue ? " (overdue)" : ""}
          </td>
          <td>${escapeHtml(statusLabel[action.status] || action.status)}</td>
          <td style="font-size:10px; color:#64748b">${escapeHtml(meetingRef)}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <table class="report-table">
      <thead>
        <tr>
          <th style="width:5%">#</th>
          <th>Action item</th>
          <th style="width:16%">Responsible</th>
          <th style="width:14%">Deadline</th>
          <th style="width:11%">Status</th>
          <th style="width:20%">From meeting</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function progressRiskRegisterHtml(risks: Risk[], projectId: string) {
  const levelRank: Record<Risk["likelihood"], number> = { high: 2, medium: 1, low: 0 };
  const projectRisks = risks
    .filter((risk) => risk.project_id === projectId && risk.status !== "closed")
    .sort(
      (a, b) =>
        levelRank[b.impact] + levelRank[b.likelihood] - (levelRank[a.impact] + levelRank[a.likelihood]) ||
        a.reference.localeCompare(b.reference),
    );

  if (projectRisks.length === 0) return "";

  const levelColor: Record<Risk["likelihood"], string> = {
    high: "#991b1b",
    medium: "#b45309",
    low: "#047857",
  };
  const levelLabel = (level: Risk["likelihood"]) => level.charAt(0).toUpperCase() + level.slice(1);
  const statusLabel: Record<Risk["status"], string> = {
    open: "Open",
    mitigated: "Mitigated",
    accepted: "Accepted",
    closed: "Closed",
  };
  const categoryLabel = (category: string) =>
    category.charAt(0).toUpperCase() + category.slice(1).replace(/-/g, " ");

  const rows = projectRisks
    .map(
      (risk) => `
        <tr>
          <td>${escapeHtml(risk.reference || "—")}</td>
          <td>${escapeHtml(risk.title)}</td>
          <td>${escapeHtml(categoryLabel(risk.category))}</td>
          <td style="color:${levelColor[risk.likelihood]}; font-weight:500">${escapeHtml(levelLabel(risk.likelihood))}</td>
          <td style="color:${levelColor[risk.impact]}; font-weight:500">${escapeHtml(levelLabel(risk.impact))}</td>
          <td>${escapeHtml(risk.owner || "—")}</td>
          <td>${escapeHtml(risk.mitigation || "—")}</td>
          <td>${escapeHtml(statusLabel[risk.status] || risk.status)}</td>
        </tr>
      `,
    )
    .join("");

  return `
    <table class="report-table">
      <thead>
        <tr>
          <th style="width:9%">Ref</th>
          <th style="width:22%">Risk</th>
          <th style="width:11%">Category</th>
          <th style="width:9%">Likelihood</th>
          <th style="width:9%">Impact</th>
          <th style="width:11%">Owner</th>
          <th>Mitigation</th>
          <th style="width:9%">Status</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function progressSiteNotesHtml(
  siteNotes: SiteNote[],
  projectId: string,
  periodStart?: string,
  periodEnd?: string,
) {
  const notes = siteNotes
    .filter((note) => note.project_id === projectId)
    .filter((note) => inPeriod(note.noteDate, periodStart, periodEnd))
    .sort((a, b) => (a.noteDate || "").localeCompare(b.noteDate || ""));

  if (notes.length === 0) return "";

  const trim = (text: string, max = 240) =>
    text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
  const categoryLabel = (category: string) =>
    category.charAt(0).toUpperCase() + category.slice(1).replace(/-/g, " ");

  const rows = notes
    .map(
      (note, index) => `
        <tr>
          <td class="num">${index + 1}</td>
          <td>${escapeHtml(note.noteDate || "—")}</td>
          <td>${escapeHtml(note.title || "Untitled note")}</td>
          <td>${escapeHtml(categoryLabel(note.category || "general"))}</td>
          <td>${escapeHtml(note.weather || "—")}</td>
          <td style="font-size:10px; color:#334155">${escapeHtml(trim(note.observationText || "—"))}</td>
        </tr>
      `,
    )
    .join("");

  return `
    <table class="report-table">
      <thead>
        <tr>
          <th style="width:5%">#</th>
          <th style="width:12%">Date</th>
          <th style="width:22%">Title</th>
          <th style="width:12%">Category</th>
          <th style="width:11%">Weather</th>
          <th>Observation</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function progressCorrespondenceLogHtml(
  records: CorrespondenceRecord[],
  projectId: string,
  periodStart?: string,
  periodEnd?: string,
) {
  const projectRecords = records
    .filter((record) => record.project_id === projectId)
    .filter((record) => inPeriod(record.date, periodStart, periodEnd))
    .sort((a, b) => (a.date || "").localeCompare(b.date || "") || a.number - b.number);

  if (projectRecords.length === 0) return "";

  const typeLabel: Record<CorrespondenceType, string> = {
    instruction: "Instruction",
    rfi: "RFI",
    submittal: "Submittal",
    "meeting-minute": "Meeting minute",
    "claim-notice": "Claim notice",
    "variation-order": "Variation order",
  };
  const statusLabel = (status: CorrespondenceRecord["status"]) =>
    status.charAt(0).toUpperCase() + status.slice(1).replace(/-/g, " ");

  const rows = projectRecords
    .map(
      (record, index) => `
        <tr>
          <td class="num">${index + 1}</td>
          <td>${escapeHtml(record.referenceNo || "—")}</td>
          <td>${escapeHtml(record.date || "—")}</td>
          <td>${escapeHtml(typeLabel[record.type] || record.type)}</td>
          <td>${escapeHtml(record.subject || "—")}</td>
          <td>${escapeHtml([record.from, record.to].filter(Boolean).join(" → ") || "—")}</td>
          <td>${escapeHtml(statusLabel(record.status))}</td>
        </tr>
      `,
    )
    .join("");

  return `
    <table class="report-table">
      <thead>
        <tr>
          <th style="width:5%">#</th>
          <th style="width:13%">Reference</th>
          <th style="width:11%">Date</th>
          <th style="width:13%">Type</th>
          <th>Subject</th>
          <th style="width:18%">From / To</th>
          <th style="width:10%">Status</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function progressQualityControlHtml(
  records: QualityControlRecord[],
  projectId: string,
  periodStart?: string,
  periodEnd?: string,
) {
  const projectRecords = records
    .filter((record) => record.project_id === projectId)
    .filter((record) => inPeriod(record.date, periodStart, periodEnd))
    .sort((a, b) => (a.date || "").localeCompare(b.date || "") || a.number - b.number);

  if (projectRecords.length === 0) return "";

  const categoryLabel: Record<string, string> = {
    "material-testing": "Material testing",
    survey: "Survey",
    ndt: "NDT",
    other: "Other",
  };
  const statusLabel: Record<string, string> = {
    pass: "Pass",
    fail: "Fail",
    pending: "Pending",
    conditional: "Conditional",
  };
  const linkHref = (url: string) => {
    const trimmed = url.trim();
    if (!trimmed) return "";
    return /^(https?:|mailto:|file:)/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  };

  const pass = projectRecords.filter((r) => r.status === "pass").length;
  const fail = projectRecords.filter((r) => r.status === "fail").length;
  const pending = projectRecords.filter((r) => r.status === "pending").length;
  const decided = pass + fail;
  const passRate = decided > 0 ? Math.round((pass / decided) * 100) : 0;

  const rows = projectRecords
    .map((record, index) => {
      const href = linkHref(record.reportLink);
      return `
        <tr>
          <td class="num">${index + 1}</td>
          <td>${escapeHtml(record.date || "—")}</td>
          <td>${escapeHtml(categoryLabel[record.category] || record.category)}</td>
          <td>${escapeHtml(record.testName || "—")}</td>
          <td>${escapeHtml(record.elementLocation || "—")}</td>
          <td>${escapeHtml(record.specification || "—")}</td>
          <td>${escapeHtml(record.result || "—")}</td>
          <td>${escapeHtml(statusLabel[record.status] || record.status)}</td>
          <td>${href ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener">Report</a>` : "—"}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <div class="report-section-prose" style="margin-bottom:8px">
      ${projectRecords.length} test${projectRecords.length === 1 ? "" : "s"} recorded — ${pass} passed, ${fail} failed, ${pending} pending (${passRate}% pass rate on decided tests).
    </div>
    <table class="report-table">
      <thead>
        <tr>
          <th style="width:4%">#</th>
          <th style="width:10%">Date</th>
          <th style="width:13%">Category</th>
          <th>Test / activity</th>
          <th style="width:16%">Element / location</th>
          <th style="width:11%">Spec</th>
          <th style="width:11%">Result</th>
          <th style="width:9%">Status</th>
          <th style="width:8%">Report</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderProgressReportBody(
  doc: GeneratedDocument,
  project: Project | null,
  progressReport?: ProgressReport | null,
  workPlans: SavedWorkPlan[] = [],
  certificates: PaymentCertificate[] = [],
  meetingMinutes: MeetingMinute[] = [],
  risks: Risk[] = [],
  siteNotes: SiteNote[] = [],
  correspondenceRecords: CorrespondenceRecord[] = [],
  qualityControlRecords: QualityControlRecord[] = [],
) {
  const toggles = resolveReportSections(doc);
  const metrics = progressReport ? progressMetrics(progressReport) : null;
  const currencyCode = project?.currency || "USD";
  const blocks: string[] = [];

  // Executive summary is mandatory in every progress report, regardless of preset.
  {
    const summary = doc.executiveSummary?.trim()
      ? richNarrativeToHtml(doc.executiveSummary)
      : blocksToHtml(doc.content);
    if (summary) {
      blocks.push(`
        <section class="report-section">
          <div class="report-section-title">Executive summary</div>
          <div class="report-section-prose">${summary}</div>
        </section>
      `);
    }
  }

  if (toggles.keyMetrics && metrics) {
    blocks.push(`
      <section class="report-section">
        <div class="report-section-title">Key metrics</div>
        <div class="report-summary">
          <div class="report-card"><div class="report-card-label">Planned</div><div class="report-card-value">${metrics.planned.toFixed(1)}%</div></div>
          <div class="report-card"><div class="report-card-label">Actual</div><div class="report-card-value">${metrics.actual.toFixed(1)}%</div></div>
          <div class="report-card"><div class="report-card-label">Variance</div><div class="report-card-value">${metrics.variance >= 0 ? "+" : ""}${metrics.variance.toFixed(1)}%</div></div>
          <div class="report-card"><div class="report-card-label">Earned</div><div class="report-card-value">${escapeHtml(currencyCode)} ${escapeHtml(currency(metrics.earned))}</div></div>
        </div>
      </section>
    `);
  }

  if (toggles.itemTable && progressReport) {
    const useBars = (doc.reportItemFormat || "table") === "bars";
    const bodyHtml = useBars
      ? progressItemBarsHtml(progressReport)
      : progressItemTableHtml(progressReport, currencyCode);
    if (bodyHtml) {
      blocks.push(`
        <section class="report-section section-fluid">
          <div class="report-section-title">Item-level progress</div>
          ${bodyHtml}
        </section>
      `);
    }
  }

  if (toggles.sheetBreakdown && progressReport) {
    const breakdownHtml = progressSheetBreakdownHtml(progressReport, currencyCode);
    if (breakdownHtml) {
      blocks.push(`
        <section class="report-section">
          <div class="report-section-title">Section breakdown</div>
          ${breakdownHtml}
        </section>
      `);
    }
  }

  if (toggles.workPlan && project?.id) {
    const useGantt = (doc.reportWorkPlanFormat || "table") === "gantt";
    const windowStart = doc.reportWorkPlanStart || "";
    const windowEnd = doc.reportWorkPlanEnd || "";
    const wpHtml = useGantt
      ? progressWorkPlanGanttHtml(workPlans, project.id, windowStart, windowEnd)
      : progressWorkPlanHtml(workPlans, project.id, windowStart, windowEnd);
    const windowLabel =
      windowStart || windowEnd
        ? ` <span style="font-weight:400; font-size:10px; color:#64748b">(${escapeHtml(windowStart || "start")} → ${escapeHtml(windowEnd || "end")})</span>`
        : "";
    if (wpHtml) {
      blocks.push(`
        <section class="report-section section-fluid">
          <div class="report-section-title">Work plan${windowLabel}</div>
          ${wpHtml}
        </section>
      `);
    } else {
      // The section is enabled but produced nothing. Rather than silently drop
      // it (which looks like a bug), explain why so the user can fix it — the
      // usual cause is a date window that excludes every activity, or a work
      // plan that was never saved for this project.
      const projectActivities = workPlans
        .filter((plan) => plan.project_id === project.id)
        .flatMap((plan) => plan.sheets.flatMap((sheet) => sheet.activities))
        .filter((activity) => (activity.rowType || "activity") !== "section" && activity.description);
      const emptyNote =
        projectActivities.length === 0
          ? "No saved work plan was found for this project. Build a work plan and save it to include it here."
          : windowStart || windowEnd
            ? `None of the ${projectActivities.length} work-plan activities fall within the selected window (${escapeHtml(windowStart || "start")} → ${escapeHtml(windowEnd || "end")}). Clear or widen the date window to include them.`
            : "No work-plan activities to display.";
      blocks.push(`
        <section class="report-section section-fluid">
          <div class="report-section-title">Work plan${windowLabel}</div>
          <p style="margin:0; font-size:11px; color:#64748b; font-style:italic">${emptyNote}</p>
        </section>
      `);
    }
  }

  if (toggles.paymentCertificates && project?.id) {
    const certsHtml = progressPaymentCertificatesHtml(
      certificates,
      project.id,
      currencyCode,
      doc.reportPeriodStart,
      doc.reportPeriodEnd,
    );
    if (certsHtml) {
      blocks.push(`
        <section class="report-section section-fluid">
          <div class="report-section-title">Financial progress (IPCs)</div>
          ${certsHtml}
        </section>
      `);
    }
  }

  if (toggles.actionPoints && project?.id) {
    const actionsHtml = progressActionPointsHtml(meetingMinutes, project.id);
    if (actionsHtml) {
      blocks.push(`
        <section class="report-section section-fluid">
          <div class="report-section-title">Open action points</div>
          ${actionsHtml}
        </section>
      `);
    }
  }

  if (toggles.riskRegister && project?.id) {
    const risksHtml = progressRiskRegisterHtml(risks, project.id);
    if (risksHtml) {
      blocks.push(`
        <section class="report-section section-fluid">
          <div class="report-section-title">Risk register</div>
          ${risksHtml}
        </section>
      `);
    }
  }

  if (toggles.siteNotes && project?.id) {
    const notesHtml = progressSiteNotesHtml(
      siteNotes,
      project.id,
      doc.reportPeriodStart,
      doc.reportPeriodEnd,
    );
    if (notesHtml) {
      blocks.push(`
        <section class="report-section section-fluid">
          <div class="report-section-title">Site notes &amp; inspections</div>
          ${notesHtml}
        </section>
      `);
    }
  }

  if (toggles.correspondenceLog && project?.id) {
    const logHtml = progressCorrespondenceLogHtml(
      correspondenceRecords,
      project.id,
      doc.reportPeriodStart,
      doc.reportPeriodEnd,
    );
    if (logHtml) {
      blocks.push(`
        <section class="report-section section-fluid">
          <div class="report-section-title">Correspondence log</div>
          ${logHtml}
        </section>
      `);
    }
  }

  if (toggles.qualityControl && project?.id) {
    const qcHtml = progressQualityControlHtml(
      qualityControlRecords,
      project.id,
      doc.reportPeriodStart,
      doc.reportPeriodEnd,
    );
    if (qcHtml) {
      blocks.push(`
        <section class="report-section section-fluid">
          <div class="report-section-title">Quality control</div>
          ${qcHtml}
        </section>
      `);
    }
  }

  if (toggles.photos) {
    const photosHtml = progressPhotosHtml(doc.reportPhotos);
    if (photosHtml) {
      blocks.push(`
        <section class="report-section section-fluid section-photos">
          <div class="report-section-title">Photo gallery</div>
          ${photosHtml}
        </section>
      `);
    }
  }

  if (toggles.forecast) {
    const forecast = doc.forecastNarrative?.trim();
    if (forecast) {
      blocks.push(`
        <section class="report-section">
          <div class="report-section-title">Forecast &amp; recovery</div>
          <div class="report-section-prose">${richNarrativeToHtml(forecast)}</div>
        </section>
      `);
    }
  }

  return `<div class="report-body">${blocks.join("")}</div>`;
}

function renderBodyHtml(
  doc: GeneratedDocument,
  project: Project | null,
  progressReport?: ProgressReport | null,
  certificate?: PaymentCertificate | null,
  workPlans: SavedWorkPlan[] = [],
  allCertificates: PaymentCertificate[] = [],
  meetingMinutes: MeetingMinute[] = [],
  risks: Risk[] = [],
  siteNotes: SiteNote[] = [],
  correspondenceRecords: CorrespondenceRecord[] = [],
  qualityControlRecords: QualityControlRecord[] = [],
) {
  const linkedMetrics = progressReport ? progressMetrics(progressReport) : null;
  const certValue = certificate ? certificateNet(certificate) : null;

  if (doc.layoutStyle === "report") {
    // Progress report uses the new section-driven composer.
    if (doc.templateType === "progress-report") {
      return renderProgressReportBody(
        doc,
        project,
        progressReport,
        workPlans,
        allCertificates,
        meetingMinutes,
        risks,
        siteNotes,
        correspondenceRecords,
        qualityControlRecords,
      );
    }
    return `
      <div class="report-summary">
        ${
          linkedMetrics
            ? `
              <div class="report-card"><div class="report-card-label">Planned</div><div class="report-card-value">${linkedMetrics.planned.toFixed(1)}%</div></div>
              <div class="report-card"><div class="report-card-label">Actual</div><div class="report-card-value">${linkedMetrics.actual.toFixed(1)}%</div></div>
              <div class="report-card"><div class="report-card-label">Variance</div><div class="report-card-value">${linkedMetrics.variance.toFixed(1)}%</div></div>
              <div class="report-card"><div class="report-card-label">Earned Value</div><div class="report-card-value">${escapeHtml(project?.currency || "USD")} ${escapeHtml(currency(linkedMetrics.earned))}</div></div>
            `
            : `
              <div class="report-card"><div class="report-card-label">Reference</div><div class="report-card-value">${escapeHtml(doc.referenceNo)}</div></div>
              <div class="report-card"><div class="report-card-label">Status</div><div class="report-card-value">${escapeHtml(doc.status.toUpperCase())}</div></div>
              <div class="report-card"><div class="report-card-label">Date</div><div class="report-card-value">${escapeHtml(doc.date)}</div></div>
              <div class="report-card"><div class="report-card-label">Currency</div><div class="report-card-value">${escapeHtml(project?.currency || "USD")}</div></div>
            `
        }
      </div>
      ${
        certValue !== null
          ? `<div class="certificate-panel"><div class="doc-section-title">Commercial Snapshot</div><p class="doc-paragraph">Net certified amount for the linked certificate is ${escapeHtml(project?.currency || "USD")} ${escapeHtml(currency(certValue))}.</p></div>`
          : ""
      }
      ${blocksToHtml(doc.content)}
      ${doc.templateType === "site-visit-report" ? siteVisitObservationHtml(doc.siteVisitObservationHtml) : ""}
      ${doc.templateType === "site-visit-report" ? siteVisitPhotosHtml(doc.siteVisitPhotos) : ""}
    `;
  }

  if (doc.layoutStyle === "certificate") {
    return `
      <div class="certificate-body-copy">
        ${blocksToHtml(doc.content)}
      </div>
    `;
  }

  return blocksToHtml(doc.content);
}

function formatCommencementDate(input?: string | null) {
  if (!input) return "";
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return input;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
}

function formatCommencementDateWithWeekday(input?: string | null) {
  if (!input) return "";
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return input;
  const datePart = d.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
  const dayPart = d.toLocaleDateString("en-GB", { weekday: "long" });
  return `${datePart} (${dayPart})`;
}

function commencementDaysBetween(a?: string | null, b?: string | null) {
  if (!a || !b) return "";
  const da = new Date(a);
  const db = new Date(b);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return "";
  const ms = db.getTime() - da.getTime();
  if (ms <= 0) return "";
  return Math.round(ms / 86400000).toString();
}

function buildCommencementLetterPrintHtml(
  mergedDoc: GeneratedDocument,
  project: Project | null,
  signatureProfile?: UserSignatureProfile | null,
) {
  const branding = resolveProjectBranding(project);
  const firmName = mergedDoc.letterheadTitle || branding.issuerDisplayName || project?.consultantName || "Engineer's Consultancy";
  const firmTagline = mergedDoc.letterheadSubtitle || branding.headerTagline || "Civil Engineering · Contract Administration · Project Supervision";
  const firmAddress = mergedDoc.letterheadAddress || branding.issuerAddress || project?.location || "Project office";
  const sealLetters = documentInitials(mergedDoc).slice(0, 3);

  const refNo = mergedDoc.referenceNo || "—";
  const letterDate = formatCommencementDate(mergedDoc.date) || mergedDoc.date || "—";

  const contractor = mergedDoc.recipientName || project?.contractorName || "The Contractor";
  const contractorRole = mergedDoc.recipientRole || "Project Director";
  const contractorAddress = project?.location || "";

  const projectName = project?.contractTitle || project?.name || "the Project";
  const contractNumber = project?.contractNumber || mergedDoc.referenceNo || "—";

  const employer = project?.clientName || branding.clientDisplayName || "the Employer";
  const contractDateField = project?.start_date || mergedDoc.date || "—";

  const commencementDate = formatCommencementDateWithWeekday(project?.start_date) || project?.start_date || "Not set";
  const scheduledCompletion = formatCommencementDate(project?.end_date) || project?.end_date || "Not set";
  const days = commencementDaysBetween(project?.start_date, project?.end_date);
  const timeForCompletion = days ? `${days} calendar days from the Commencement Date` : "As stipulated in the Contract";

  const engineerName = mergedDoc.signatoryName || branding.issuerDisplayName || "The Engineer";
  const engineerRole = mergedDoc.signatoryRole || `The Engineer · ${firmName}`;
  const engineerSignature = resolveSavedSignature(mergedDoc.signatorySignatureSource, signatureProfile);

  const ccList = [
    employer,
    "Employer's Representative",
    "Resident Engineer",
    "Quantity Surveyor",
    `Project File (${refNo})`,
  ]
    .filter(Boolean)
    .map((item) => escapeHtml(item as string))
    .join(" &middot; ");

  const cornerSvg = `
    <svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
      <rect x="-2.6" y="-2.6" width="5.2" height="5.2" transform="rotate(45 0 0)" fill="#1a1c20" />
      <rect x="18.4" y="18.4" width="3.2" height="3.2" transform="rotate(45 20 20)" fill="#1a1c20" />
    </svg>
  `;

  const styles = `
    :root {
      --ink: #1a1c20;
      --ink-soft: #2c2f35;
      --muted: #5e636d;
      --rule: #1a1c20;
      --paper: #fbf9f4;
      --accent: #6b2a1f;
      --head-band: #eaf0f3;
      --head-band-2: #dde6ec;
      --head-rule: #b9c6cf;
    }
    @page { size: A4; margin: 0; }
    html, body { margin: 0; padding: 0; background: #d9d4c8; font-family: 'Source Serif 4', Georgia, serif; color: var(--ink); }
    * { box-sizing: border-box; }
    .stage { min-height: 100vh; display: flex; justify-content: center; padding: 24px 16px 40px; }
    .sheet {
      width: 210mm;
      min-height: 297mm;
      background: var(--paper);
      background-image:
        radial-gradient(circle at 20% 10%, rgba(0,0,0,0.015) 0, transparent 40%),
        radial-gradient(circle at 80% 90%, rgba(0,0,0,0.02) 0, transparent 40%);
      box-shadow: 0 1px 0 rgba(0,0,0,0.04), 0 20px 60px -20px rgba(20,18,12,0.35);
      position: relative;
      padding: 16mm;
      color: var(--ink);
    }
    .sheet::before { content: ""; position: absolute; inset: 10mm; border: 1.6px solid var(--rule); pointer-events: none; }
    .sheet::after  { content: ""; position: absolute; inset: 15mm; border: 0.4px solid var(--rule); pointer-events: none; }
    .fleur { position: absolute; color: var(--ink); font-family: 'Cormorant Garamond', serif; font-size: 14px; line-height: 1; pointer-events: none; background: var(--paper); padding: 0 4px; }
    .fleur.top    { top: 9.2mm;    left: 50%; transform: translateX(-50%); }
    .fleur.bottom { bottom: 9.2mm; left: 50%; transform: translateX(-50%); }
    .fleur.left   { left: 9.2mm;   top: 50%;  transform: translate(-50%, -50%) rotate(-90deg); }
    .fleur.right  { right: 9.2mm;  top: 50%;  transform: translate(50%, -50%) rotate(90deg); }
    .corner { position: absolute; width: 5mm; height: 5mm; pointer-events: none; }
    .corner svg { width: 100%; height: 100%; display: block; overflow: visible; }
    .corner.tl { top: 10mm; left: 10mm; }
    .corner.tr { top: 10mm; right: 10mm; transform: scaleX(-1); }
    .corner.bl { bottom: 10mm; left: 10mm; transform: scaleY(-1); }
    .corner.br { bottom: 10mm; right: 10mm; transform: scale(-1, -1); }
    .inner { position: relative; padding: 12mm 14mm 14mm; }
    .letterhead {
      display: grid;
      grid-template-columns: 56px 1fr auto;
      column-gap: 18px;
      align-items: center;
      margin: -12mm -14mm 0;
      padding: 14mm 14mm 14px;
      background: linear-gradient(180deg, var(--head-band) 0%, var(--head-band-2) 100%);
      border-bottom: 0.6px solid var(--head-rule);
      position: relative;
    }
    .letterhead::after { content: ""; position: absolute; left: 14mm; right: 14mm; bottom: -4px; height: 1.2px; background: var(--rule); }
    .seal { width: 56px; height: 56px; border: 1.2px solid var(--ink); border-radius: 50%; display: flex; align-items: center; justify-content: center; position: relative; flex-shrink: 0; }
    .seal-diamond { width: 34px; height: 34px; border: 0.6px solid var(--ink); transform: rotate(45deg); display: flex; align-items: center; justify-content: center; }
    .seal-letters { transform: rotate(-45deg); font-family: 'Cormorant Garamond', serif; font-weight: 600; font-size: 15px; letter-spacing: 1px; color: var(--ink); }
    .firm { display: flex; flex-direction: column; line-height: 1.15; }
    .firm-name { font-family: 'Cormorant Garamond', serif; font-weight: 600; font-size: 26px; letter-spacing: 1.5px; text-transform: uppercase; color: var(--ink); }
    .firm-tag { font-family: 'Source Sans 3', sans-serif; font-size: 9px; letter-spacing: 3.2px; text-transform: uppercase; color: var(--muted); margin-top: 6px; }
    .firm-contact { font-family: 'Source Sans 3', sans-serif; font-size: 9px; line-height: 1.55; text-align: right; color: var(--ink-soft); letter-spacing: 0.2px; max-width: 56mm; }
    .firm-contact .label { color: var(--muted); letter-spacing: 2px; text-transform: uppercase; font-size: 7.5px; display: block; margin-bottom: 2px; }
    .meta { display: flex; justify-content: space-between; align-items: baseline; margin-top: 26px; font-family: 'Source Sans 3', sans-serif; font-size: 10px; letter-spacing: 2.4px; text-transform: uppercase; color: var(--muted); }
    .meta .ref strong, .meta .date strong { color: var(--ink); font-weight: 500; margin-left: 4px; letter-spacing: 1.2px; }
    .title-block { text-align: center; margin: 26px 0 22px; }
    .title-eyebrow { font-family: 'Source Sans 3', sans-serif; font-size: 9.5px; letter-spacing: 5px; text-transform: uppercase; color: var(--muted); margin-bottom: 8px; }
    .title { font-family: 'Cormorant Garamond', serif; font-weight: 600; font-size: 30px; letter-spacing: 4px; text-transform: uppercase; color: var(--ink); line-height: 1; margin: 0; }
    .title-flourish { display: flex; align-items: center; justify-content: center; gap: 10px; margin-top: 12px; }
    .title-flourish .line { width: 56px; height: 1px; background: var(--ink); }
    .title-flourish .dot { width: 5px; height: 5px; background: var(--ink); transform: rotate(45deg); }
    .addr { font-size: 11.5px; line-height: 1.55; margin: 4px 0 18px; }
    .addr .role { font-family: 'Source Sans 3', sans-serif; font-size: 8.5px; letter-spacing: 2.4px; text-transform: uppercase; color: var(--muted); margin-bottom: 4px; }
    .addr .name { font-weight: 600; }
    .salute { font-size: 12px; margin: 16px 0 6px; }
    .subject { font-size: 12px; text-decoration: underline; text-underline-offset: 4px; font-weight: 600; margin: 14px 0 14px; text-align: center; line-height: 1.45; }
    .body p { font-size: 11.5px; line-height: 1.7; margin: 0 0 11px; text-align: justify; text-justify: inter-word; hyphens: auto; color: var(--ink-soft); }
    .body p .field { border-bottom: 0.5px dotted var(--muted); padding: 0 4px; color: var(--ink); font-weight: 500; }
    .clause { font-style: italic; color: var(--accent); }
    .particulars { margin: 12px 0 14px; padding: 10px 14px; border-top: 0.5px solid var(--rule); border-bottom: 0.5px solid var(--rule); display: grid; grid-template-columns: 170px 1fr; row-gap: 6px; column-gap: 12px; font-size: 11px; }
    .particulars dt { font-family: 'Source Sans 3', sans-serif; font-size: 9px; letter-spacing: 2px; text-transform: uppercase; color: var(--muted); align-self: center; margin: 0; }
    .particulars dd { margin: 0; color: var(--ink); font-weight: 500; letter-spacing: 0.2px; }
    .closing { font-size: 11.5px; margin: 18px 0 4px; color: var(--ink-soft); }
    .sign-grid { display: grid; grid-template-columns: 1fr 1fr; column-gap: 36px; margin-top: 30px; }
    .sign-col .role { font-family: 'Source Sans 3', sans-serif; font-size: 8.5px; letter-spacing: 2.4px; text-transform: uppercase; color: var(--muted); margin-bottom: 28px; }
    .sign-col .sign-image { display: block; max-height: 38px; max-width: 70%; margin: -22px 0 4px; }
    .sign-line { border-bottom: 0.6px solid var(--ink); height: 0; margin-bottom: 6px; }
    .sign-meta { font-size: 10px; line-height: 1.55; }
    .sign-meta .nm { font-weight: 600; }
    .sign-meta .ti { color: var(--muted); }
    .stamp { position: absolute; right: 28mm; bottom: 60mm; width: 78px; height: 78px; border: 1.4px solid var(--accent); border-radius: 50%; display: flex; align-items: center; justify-content: center; transform: rotate(-8deg); opacity: 0.62; color: var(--accent); text-align: center; pointer-events: none; }
    .stamp .inner-ring { position: absolute; inset: 5px; border: 0.5px solid var(--accent); border-radius: 50%; }
    .stamp .stamp-text { font-family: 'Source Sans 3', sans-serif; font-size: 7px; letter-spacing: 1.8px; text-transform: uppercase; line-height: 1.25; font-weight: 600; }
    .stamp .stamp-mark { font-family: 'Cormorant Garamond', serif; font-style: italic; font-size: 15px; display: block; margin: 3px 0 2px; letter-spacing: 0.5px; }
    .cc { margin-top: 22px; padding-top: 10px; border-top: 0.5px solid var(--rule); font-size: 9.5px; color: var(--muted); font-family: 'Source Sans 3', sans-serif; letter-spacing: 0.4px; line-height: 1.6; }
    .cc .label { text-transform: uppercase; letter-spacing: 2.6px; color: var(--ink); font-weight: 500; margin-right: 8px; }
    .foot { margin-top: 14px; padding-top: 8px; border-top: 0.5px solid var(--rule); display: flex; justify-content: space-between; align-items: center; font-family: 'Source Sans 3', sans-serif; font-size: 8px; letter-spacing: 2.4px; text-transform: uppercase; color: var(--muted); }
    .foot .center { letter-spacing: 3.5px; }
    @media print {
      html, body { background: #fff; }
      .stage { padding: 0; }
      .sheet { box-shadow: none; width: 210mm; height: 297mm; min-height: 297mm; }
    }
  `;

  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(mergedDoc.title || "Commencement Order")}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
        <link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,opsz,wght@0,8..60,300..700;1,8..60,300..700&family=Source+Sans+3:wght@300;400;500;600;700&family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap" rel="stylesheet" />
        <style>${styles}</style>
      </head>
      <body>
        <div class="stage">
          <article class="sheet" role="document" aria-label="Commencement Order Letter">
            <div class="corner tl">${cornerSvg}</div>
            <div class="corner tr">${cornerSvg}</div>
            <div class="corner bl">${cornerSvg}</div>
            <div class="corner br">${cornerSvg}</div>
            <div class="fleur top" aria-hidden="true">&#10070;</div>
            <div class="fleur bottom" aria-hidden="true">&#10070;</div>
            <div class="fleur left" aria-hidden="true">&#10070;</div>
            <div class="fleur right" aria-hidden="true">&#10070;</div>

            <div class="inner">
              <header class="letterhead">
                <div class="seal" aria-hidden="true">
                  <div class="seal-diamond">
                    <span class="seal-letters">${escapeHtml(sealLetters)}</span>
                  </div>
                </div>
                <div class="firm">
                  <div class="firm-name">${escapeHtml(firmName)}</div>
                  <div class="firm-tag">${escapeHtml(firmTagline)}</div>
                </div>
                <div class="firm-contact">
                  <span class="label">Office</span>
                  ${escapeHtmlMultiline(firmAddress)}
                </div>
              </header>

              <div class="meta">
                <div class="ref">Our Ref. <strong>${escapeHtml(refNo)}</strong></div>
                <div class="date">Date <strong>${escapeHtml(letterDate)}</strong></div>
              </div>

              <div class="title-block">
                <h1 class="title">Commencement Order</h1>
                <div class="title-flourish" aria-hidden="true">
                  <span class="line"></span>
                  <span class="dot"></span>
                  <span class="line"></span>
                </div>
              </div>

              <div class="addr">
                <div class="role">To &mdash; The Contractor</div>
                <div class="name">${escapeHtml(contractor)}</div>
                ${contractorRole ? `<div>Attn: ${escapeHtml(contractorRole)}</div>` : ""}
                ${contractorAddress ? `<div>${escapeHtml(contractorAddress)}</div>` : ""}
              </div>

              <p class="salute">Dear Sir,</p>
              <p class="subject">
                Project: ${escapeHtml(projectName)}<br />
                Contract No.: <span style="font-weight:500">${escapeHtml(contractNumber)}</span>
                &nbsp;&middot;&nbsp; Notice to Commence the Works
              </p>

              <div class="body">
                <p>
                  With reference to the Contract Agreement executed between the Employer,
                  <span class="field">${escapeHtml(employer)}</span>, and the Contractor,
                  <span class="field">${escapeHtml(contractor)}</span>, dated
                  <span class="field">${escapeHtml(formatCommencementDate(contractDateField) || contractDateField)}</span>, and pursuant to the
                  provisions of <span class="clause">Sub-Clause&nbsp;8.1 [Commencement of Works]</span>
                  of the FIDIC Conditions of Contract for Construction (Red Book, 2017 Edition)
                  forming part of the said Contract, you are hereby formally instructed to
                  commence the Works on the date particularised hereunder.
                </p>

                <dl class="particulars">
                  <dt>Commencement Date</dt>
                  <dd>${escapeHtml(commencementDate)}</dd>

                  <dt>Time for Completion</dt>
                  <dd>${escapeHtml(timeForCompletion)}</dd>

                  <dt>Scheduled Completion</dt>
                  <dd>${escapeHtml(scheduledCompletion)}</dd>

                  <dt>Site Possession</dt>
                  <dd>Granted in accordance with Sub-Clause&nbsp;2.1</dd>

                  <dt>Performance Security</dt>
                  <dd>Required prior to commencement &mdash; as per the Contract</dd>

                  <dt>Advance Payment</dt>
                  <dd>To be released upon submission of Advance Payment Guarantee</dd>
                </dl>

                <p>
                  You are required, in accordance with <span class="clause">Sub-Clause&nbsp;8.3</span>,
                  to submit a detailed Programme of Works to the Engineer within twenty-eight (28)
                  days of the Commencement Date, together with a supporting report describing the
                  general methods, arrangements, order, and timing of all activities. The
                  Contractor&rsquo;s attention is further drawn to <span class="clause">Sub-Clauses&nbsp;4.1, 4.8 and 6.7</span>
                  concerning the Contractor&rsquo;s general obligations, safety procedures, and the
                  health and welfare of personnel on Site.
                </p>

                <p>
                  All correspondence, notices, and submissions arising under the Contract shall
                  be addressed to the Engineer at the address shown in the letterhead above, with
                  copies to the Employer&rsquo;s Representative. Any delay in commencement, or any
                  matter likely to affect the Time for Completion, shall be notified to the
                  Engineer in writing without delay in accordance with
                  <span class="clause">Sub-Clause&nbsp;8.4</span>.
                </p>

                <p>
                  We take this opportunity to wish the Contractor every success in the execution
                  of the Works and look forward to a safe, timely, and quality delivery of the
                  Project.
                </p>

                <p class="closing">Yours faithfully,</p>
              </div>

              <div class="sign-grid">
                <div class="sign-col">
                  <div class="role">For and on behalf of the Engineer</div>
                  ${engineerSignature ? `<img class="sign-image" src="${escapeHtml(engineerSignature)}" alt="" />` : ""}
                  <div class="sign-line"></div>
                  <div class="sign-meta">
                    <div class="nm">${escapeHtml(engineerName)}</div>
                    <div class="ti">${escapeHtml(engineerRole)}</div>
                  </div>
                </div>
                <div class="sign-col">
                  <div class="role">Acknowledged &amp; Received by the Contractor</div>
                  <div class="sign-line"></div>
                  <div class="sign-meta">
                    <div class="nm">${escapeHtml(contractor)}</div>
                    <div class="ti">Name, Designation, Date &amp; Company Stamp</div>
                  </div>
                </div>
              </div>

              <div class="stamp" aria-hidden="true">
                <div class="inner-ring"></div>
                <div>
                  <div class="stamp-text">The Engineer</div>
                  <span class="stamp-mark">&#10070;</span>
                  <div class="stamp-text">Official Seal</div>
                </div>
              </div>

              <div class="cc">
                <span class="label">Copies to</span>
                ${ccList}
              </div>

              <footer class="foot">
                <div>${escapeHtml(firmName)}</div>
                <div class="center">Commencement Order &middot; FIDIC Red Book 2017</div>
                <div>Page 1 of 1</div>
              </footer>
            </div>
          </article>
        </div>
      </body>
    </html>
  `;
}

/**
 * Lightweight Tax / Milestone Invoice print template.
 *
 * Distinct from the FIDIC Payment Certificate Summary — no retention, no advance recovery,
 * no withholding, no contingencies. Just an invoice with line items, a tax row and a total.
 * This is the non-construction parallel to the Payment Certificate, but any project type
 * can use it for simple invoicing.
 */
function buildMilestoneInvoicePrintHtml(
  mergedDoc: GeneratedDocument,
  project: Project | null,
  signatureProfile?: UserSignatureProfile | null,
) {
  const branding = resolveProjectBranding(project);
  const currencyCode = project?.currency || "USD";

  const issuerName = mergedDoc.letterheadTitle || branding.issuerDisplayName || project?.consultantName || "Your Company";
  const issuerTagline = mergedDoc.letterheadSubtitle || branding.headerTagline || "";
  const issuerAddress = mergedDoc.letterheadAddress || branding.issuerAddress || project?.location || "";

  const billToName = mergedDoc.recipientName || project?.clientName || branding.clientDisplayName || "Client";
  const billToRole = mergedDoc.recipientRole || "";
  // The recipient address is not a first-class field on GeneratedDocument, so we surface
  // the project location / client address from branding as the best-available billing address.
  const billToAddress = branding.clientAddress || project?.location || "";

  const lines = mergedDoc.invoiceLines || [];
  const numericRow = (line: { qty: string; rate: string }) => {
    const q = parseFloat(line.qty || "0") || 0;
    const r = parseFloat(line.rate || "0") || 0;
    return q * r;
  };
  const subtotal = lines.reduce((sum, line) => sum + numericRow(line), 0);
  const discountPct = parseFloat(mergedDoc.invoiceDiscountPercent || "0") || 0;
  const taxPct = parseFloat(mergedDoc.invoiceTaxPercent || "0") || 0;
  const discountAmount = (subtotal * discountPct) / 100;
  const taxedBase = subtotal - discountAmount;
  const taxAmount = (taxedBase * taxPct) / 100;
  const grandTotal = taxedBase + taxAmount;

  const fmt = (n: number) =>
    n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const invoiceTitle = templateLabelFor("milestone-invoice", project).toUpperCase();
  const signatureUrl = resolveSavedSignature(mergedDoc.signatorySignatureSource, signatureProfile);

  const linesHtml = lines.length
    ? lines
        .map((line, idx) => {
          const amount = numericRow(line);
          return `
            <tr>
              <td class="num">${idx + 1}</td>
              <td>${escapeHtml(line.description || "")}</td>
              <td>${escapeHtml(line.unit || "")}</td>
              <td class="num">${escapeHtml(line.qty || "0")}</td>
              <td class="num">${escapeHtml(currencyCode)} ${fmt(parseFloat(line.rate || "0") || 0)}</td>
              <td class="num">${escapeHtml(currencyCode)} ${fmt(amount)}</td>
            </tr>
          `;
        })
        .join("")
    : `<tr><td colspan="6" style="text-align:center; color:#94a3b8; padding:18px">No line items.</td></tr>`;

  const styles = `
    @page { size: A4 portrait; margin: 16mm 14mm; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #0f172a;
      font-family: 'Inter', 'Segoe UI', 'Helvetica Neue', system-ui, -apple-system, sans-serif;
      font-size: 11px;
      line-height: 1.5;
    }
    .invoice-root { width: 100%; }
    .invoice-head {
      display: grid;
      grid-template-columns: 1.4fr 1fr;
      gap: 18px;
      align-items: flex-start;
      padding-bottom: 14px;
      border-bottom: 2px solid #0f172a;
    }
    .invoice-head .issuer-name {
      font-size: 17px;
      font-weight: 700;
      letter-spacing: 0.2px;
      color: #0f172a;
      line-height: 1.2;
    }
    .invoice-head .issuer-tagline {
      margin-top: 2px;
      font-size: 9.5px;
      letter-spacing: 1.6px;
      text-transform: uppercase;
      color: #64748b;
    }
    .invoice-head .issuer-address {
      margin-top: 8px;
      font-size: 10px;
      color: #475569;
      line-height: 1.55;
    }
    .invoice-head .invoice-label {
      text-align: right;
      font-size: 22px;
      font-weight: 800;
      letter-spacing: 4px;
      color: #0f172a;
    }
    .invoice-head .invoice-status {
      text-align: right;
      margin-top: 4px;
      font-size: 9px;
      letter-spacing: 2.4px;
      text-transform: uppercase;
      color: #64748b;
    }
    .invoice-meta-grid {
      display: grid;
      grid-template-columns: 1.4fr 1fr;
      gap: 18px;
      margin-top: 18px;
      align-items: flex-start;
    }
    .meta-block .meta-label {
      font-size: 8.5px;
      letter-spacing: 1.8px;
      text-transform: uppercase;
      color: #64748b;
      margin-bottom: 3px;
    }
    .meta-block .meta-value { font-size: 11px; color: #0f172a; line-height: 1.55; }
    .meta-block .meta-value strong { font-weight: 600; }
    .invoice-numbers {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    .invoice-numbers .number-row {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      font-size: 10.5px;
      padding: 5px 0;
      border-bottom: 0.6px dashed #cbd5e1;
    }
    .invoice-numbers .number-row span:first-child { color: #64748b; text-transform: uppercase; letter-spacing: 1.2px; font-size: 9px; }
    .invoice-numbers .number-row span:last-child { color: #0f172a; font-weight: 600; }
    .invoice-project-band {
      margin-top: 14px;
      padding: 10px 14px;
      background: #f8fafc;
      border-left: 3px solid #0f172a;
      font-size: 10.5px;
      color: #0f172a;
    }
    .invoice-project-band .label {
      font-size: 8.5px;
      letter-spacing: 1.8px;
      text-transform: uppercase;
      color: #64748b;
      margin-bottom: 2px;
    }
    table.invoice-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 18px;
      font-size: 10.5px;
    }
    table.invoice-table thead th {
      background: #0f172a;
      color: #ffffff;
      text-align: left;
      padding: 8px 10px;
      font-weight: 600;
      letter-spacing: 0.6px;
      font-size: 9.5px;
      text-transform: uppercase;
    }
    table.invoice-table thead th.num { text-align: right; }
    table.invoice-table tbody td {
      padding: 7px 10px;
      border-bottom: 0.5px solid #e2e8f0;
      vertical-align: top;
      color: #0f172a;
    }
    table.invoice-table tbody td.num { text-align: right; font-variant-numeric: tabular-nums; }
    .totals-grid {
      display: grid;
      grid-template-columns: 1.4fr 1fr;
      gap: 18px;
      margin-top: 14px;
    }
    .totals-grid .terms { font-size: 10.5px; color: #334155; line-height: 1.6; }
    .totals-grid .terms .label {
      display: block;
      margin-bottom: 4px;
      font-size: 8.5px;
      letter-spacing: 1.8px;
      text-transform: uppercase;
      color: #64748b;
    }
    .totals-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
    }
    .totals-table td {
      padding: 6px 10px;
      border-bottom: 0.5px solid #e2e8f0;
    }
    .totals-table td:first-child {
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 1.2px;
      font-size: 9.5px;
    }
    .totals-table td:last-child {
      text-align: right;
      font-variant-numeric: tabular-nums;
      font-weight: 500;
    }
    .totals-table tr.grand-total td {
      border-top: 2px solid #0f172a;
      border-bottom: none;
      padding-top: 9px;
      padding-bottom: 9px;
      font-size: 13px;
      font-weight: 700;
      color: #0f172a;
      letter-spacing: 0.4px;
      text-transform: none;
    }
    .bank-details {
      margin-top: 22px;
      padding: 12px 14px;
      background: #f8fafc;
      border: 0.6px solid #e2e8f0;
      border-radius: 6px;
      font-size: 10.5px;
      color: #334155;
      line-height: 1.6;
    }
    .bank-details .label {
      display: block;
      margin-bottom: 4px;
      font-size: 8.5px;
      letter-spacing: 1.8px;
      text-transform: uppercase;
      color: #64748b;
    }
    .invoice-signoff {
      margin-top: 28px;
      display: flex;
      justify-content: flex-end;
    }
    .signoff-block {
      width: 280px;
      text-align: center;
    }
    .signoff-block .sig-image {
      display: block;
      max-height: 50px;
      max-width: 240px;
      margin: 0 auto 4px;
    }
    .signoff-block .sig-line {
      border-bottom: 0.8px solid #0f172a;
      margin: 0 auto 6px;
      width: 240px;
    }
    .signoff-block .sig-name { font-size: 11px; font-weight: 600; color: #0f172a; }
    .signoff-block .sig-role { font-size: 9.5px; color: #64748b; margin-top: 2px; }
    .invoice-foot {
      margin-top: 32px;
      padding-top: 10px;
      border-top: 0.5px solid #cbd5e1;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 9px;
      color: #64748b;
      letter-spacing: 0.8px;
    }
    @media print {
      table.invoice-table thead { display: table-header-group; }
      table.invoice-table tr { page-break-inside: avoid; }
    }
  `;

  const escapeHtml = (value: unknown) => {
    if (value === undefined || value === null) return "";
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  };
  const escapeHtmlMultiline = (value: unknown) =>
    escapeHtml(value).replace(/\n/g, "<br />");

  const issuedDate = mergedDoc.date || new Date().toISOString().split("T")[0];

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(mergedDoc.title || invoiceTitle)}</title>
    <style>${styles}</style>
  </head>
  <body>
    <div class="invoice-root">
      <div class="invoice-head">
        <div>
          ${mergedDoc.brandLogoDataUrl
            ? `<img src="${escapeHtml(mergedDoc.brandLogoDataUrl)}" alt="" style="max-height:48px; max-width:200px; margin-bottom:6px; object-fit:contain;" />`
            : ""}
          <div class="issuer-name">${escapeHtml(issuerName)}</div>
          ${issuerTagline ? `<div class="issuer-tagline">${escapeHtml(issuerTagline)}</div>` : ""}
          ${issuerAddress ? `<div class="issuer-address">${escapeHtmlMultiline(issuerAddress)}</div>` : ""}
        </div>
        <div>
          <div class="invoice-label">${escapeHtml(invoiceTitle)}</div>
          <div class="invoice-status">${escapeHtml((mergedDoc.status || "draft").toUpperCase())}</div>
        </div>
      </div>

      <div class="invoice-meta-grid">
        <div class="meta-block">
          <div class="meta-label">Bill to</div>
          <div class="meta-value"><strong>${escapeHtml(billToName)}</strong></div>
          ${billToRole ? `<div class="meta-value">${escapeHtml(billToRole)}</div>` : ""}
          ${billToAddress ? `<div class="meta-value" style="color:#475569; margin-top:2px">${escapeHtmlMultiline(billToAddress)}</div>` : ""}
        </div>
        <div class="invoice-numbers">
          <div class="number-row"><span>Invoice no.</span><span>${escapeHtml(mergedDoc.referenceNo || "—")}</span></div>
          <div class="number-row"><span>Issue date</span><span>${escapeHtml(issuedDate)}</span></div>
          ${mergedDoc.invoiceDueDate
            ? `<div class="number-row"><span>Due date</span><span>${escapeHtml(mergedDoc.invoiceDueDate)}</span></div>`
            : ""}
          <div class="number-row"><span>Currency</span><span>${escapeHtml(currencyCode)}</span></div>
        </div>
      </div>

      ${project?.name
        ? `<div class="invoice-project-band">
            <div class="label">Project reference</div>
            <div><strong>${escapeHtml(project.contractTitle || project.name)}</strong>${project.contractNumber ? ` · Contract ${escapeHtml(project.contractNumber)}` : ""}${project.location ? ` · ${escapeHtml(project.location)}` : ""}</div>
          </div>`
        : ""}

      <table class="invoice-table">
        <thead>
          <tr>
            <th style="width:32px">#</th>
            <th>Description</th>
            <th style="width:56px">Unit</th>
            <th class="num" style="width:72px">Qty</th>
            <th class="num" style="width:96px">Rate</th>
            <th class="num" style="width:110px">Amount</th>
          </tr>
        </thead>
        <tbody>${linesHtml}</tbody>
      </table>

      <div class="totals-grid">
        <div class="terms">
          ${mergedDoc.invoicePaymentTerms
            ? `<span class="label">Payment terms</span>${escapeHtmlMultiline(mergedDoc.invoicePaymentTerms)}`
            : ""}
        </div>
        <table class="totals-table">
          <tr>
            <td>Subtotal</td>
            <td>${escapeHtml(currencyCode)} ${fmt(subtotal)}</td>
          </tr>
          ${discountPct
            ? `<tr><td>Discount (${discountPct.toFixed(2)}%)</td><td>− ${escapeHtml(currencyCode)} ${fmt(discountAmount)}</td></tr>`
            : ""}
          ${taxPct
            ? `<tr><td>Tax (${taxPct.toFixed(2)}%)</td><td>${escapeHtml(currencyCode)} ${fmt(taxAmount)}</td></tr>`
            : ""}
          <tr class="grand-total">
            <td>Total due</td>
            <td>${escapeHtml(currencyCode)} ${fmt(grandTotal)}</td>
          </tr>
        </table>
      </div>

      ${mergedDoc.invoiceBankDetails
        ? `<div class="bank-details">
            <span class="label">Payment into</span>
            ${escapeHtmlMultiline(mergedDoc.invoiceBankDetails)}
          </div>`
        : ""}

      <div class="invoice-signoff">
        <div class="signoff-block">
          ${signatureUrl ? `<img class="sig-image" src="${escapeHtml(signatureUrl)}" alt="" />` : ""}
          <div class="sig-line"></div>
          <div class="sig-name">${escapeHtml(mergedDoc.signatoryName || issuerName)}</div>
          <div class="sig-role">${escapeHtml(mergedDoc.signatoryRole || "Authorized signatory")}</div>
        </div>
      </div>

      <div class="invoice-foot">
        <span>${escapeHtml(issuerName)}</span>
        <span>${escapeHtml(invoiceTitle)} · ${escapeHtml(mergedDoc.referenceNo || "")}</span>
      </div>
    </div>
  </body>
</html>`;
}

/**
 * One-page Status Report print template — universal, lighter than the Progress Report.
 *
 * Designed for weekly / monthly status updates: traffic-light overall status, then four
 * bullet sections (Highlights / Issues / Upcoming / Risks). Optional resource asks block.
 */
function buildStatusReportPrintHtml(
  mergedDoc: GeneratedDocument,
  project: Project | null,
  signatureProfile?: UserSignatureProfile | null,
) {
  const branding = resolveProjectBranding(project);
  const overall = mergedDoc.statusOverall || "green";
  const overallToneMap = {
    green: { bg: "#dcfce7", border: "#16a34a", text: "#166534", label: "On track" },
    amber: { bg: "#fef3c7", border: "#d97706", text: "#92400e", label: "At risk" },
    red: { bg: "#fee2e2", border: "#dc2626", text: "#991b1b", label: "Off track" },
  } as const;
  const tone = overallToneMap[overall];

  const signatureUrl = resolveSavedSignature(mergedDoc.signatorySignatureSource, signatureProfile);

  const bulletList = (raw: string | undefined): string => {
    const text = (raw || "").trim();
    if (!text) return "<li style=\"color:#94a3b8\">No items recorded.</li>";
    return text
      .split(/\r?\n/)
      .map((line) => line.replace(/^\s*[-*•]\s*/, "").trim())
      .filter((line) => line.length > 0)
      .map((line) => `<li>${escapeHtml(line)}</li>`)
      .join("");
  };

  const sections: Array<{ label: string; raw: string | undefined; color: string }> = [
    { label: "Highlights / Accomplishments", raw: mergedDoc.statusHighlights, color: "#16a34a" },
    { label: "Issues / Blockers", raw: mergedDoc.statusIssues, color: "#dc2626" },
    { label: "Upcoming Milestones", raw: mergedDoc.statusUpcoming, color: "#0ea5e9" },
    { label: "Top Risks", raw: mergedDoc.statusTopRisks, color: "#d97706" },
  ];

  const sectionsHtml = sections
    .map(
      (section) => `
        <div class="status-section">
          <div class="section-label" style="border-left-color:${section.color}">${escapeHtml(section.label)}</div>
          <ul class="section-list">${bulletList(section.raw)}</ul>
        </div>
      `,
    )
    .join("");

  const issuerName = mergedDoc.letterheadTitle || branding.issuerDisplayName || project?.consultantName || "Project Office";
  const issuerTagline = mergedDoc.letterheadSubtitle || branding.headerTagline || "";

  const styles = `
    @page { size: A4 portrait; margin: 14mm 14mm 12mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #ffffff; color: #0f172a; font-family: 'Inter', 'Segoe UI', 'Helvetica Neue', system-ui, -apple-system, sans-serif; font-size: 11px; line-height: 1.55; }
    .status-root { width: 100%; }
    .status-head { display: grid; grid-template-columns: 1fr auto; gap: 18px; align-items: flex-end; padding-bottom: 12px; border-bottom: 2px solid #0f172a; }
    .status-head .issuer-name { font-size: 15px; font-weight: 700; color: #0f172a; }
    .status-head .issuer-tag { margin-top: 2px; font-size: 9px; letter-spacing: 1.6px; text-transform: uppercase; color: #64748b; }
    .status-head .title { font-size: 22px; font-weight: 800; letter-spacing: 1.2px; color: #0f172a; line-height: 1; }
    .status-head .subtitle { margin-top: 2px; font-size: 9px; letter-spacing: 2px; text-transform: uppercase; color: #64748b; text-align: right; }
    .meta-band { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px; margin-top: 14px; padding: 12px 14px; background: #f8fafc; border-left: 3px solid #0f172a; }
    .meta-band .meta-cell .label { font-size: 8.5px; letter-spacing: 1.8px; text-transform: uppercase; color: #64748b; margin-bottom: 3px; }
    .meta-band .meta-cell .value { font-size: 11px; font-weight: 600; color: #0f172a; }
    .overall-band { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-top: 14px; padding: 14px 16px; border-radius: 10px; background: ${tone.bg}; border: 1.5px solid ${tone.border}; }
    .overall-band .overall-label { font-size: 9px; letter-spacing: 2.4px; text-transform: uppercase; color: ${tone.text}; }
    .overall-band .overall-status { font-size: 16px; font-weight: 800; letter-spacing: 0.6px; color: ${tone.text}; margin-top: 2px; }
    .overall-band .status-light { width: 24px; height: 24px; border-radius: 50%; background: ${tone.border}; box-shadow: 0 0 0 4px ${tone.bg}; }
    .sections-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 16px; }
    .status-section { background: #ffffff; border: 0.6px solid #e2e8f0; border-radius: 8px; padding: 12px 14px; }
    .status-section .section-label { font-size: 10px; letter-spacing: 1.6px; text-transform: uppercase; color: #0f172a; font-weight: 700; padding-left: 8px; border-left: 3px solid #0f172a; margin-bottom: 8px; }
    .status-section .section-list { margin: 0; padding-left: 18px; font-size: 11px; line-height: 1.6; }
    .status-section .section-list li { margin-bottom: 4px; color: #1e293b; }
    .resource-block { margin-top: 14px; background: #fffbeb; border: 0.6px solid #fcd34d; border-radius: 8px; padding: 12px 14px; }
    .resource-block .section-label { font-size: 10px; letter-spacing: 1.6px; text-transform: uppercase; color: #92400e; font-weight: 700; margin-bottom: 6px; }
    .resource-block .body { font-size: 11px; line-height: 1.6; color: #92400e; white-space: pre-wrap; }
    .signoff { margin-top: 22px; display: flex; justify-content: flex-end; }
    .signoff-block { width: 260px; text-align: center; }
    .signoff-block .sig-image { display: block; max-height: 44px; max-width: 220px; margin: 0 auto 4px; }
    .signoff-block .sig-line { border-bottom: 0.8px solid #0f172a; margin: 0 auto 6px; width: 220px; }
    .signoff-block .sig-name { font-size: 11px; font-weight: 600; color: #0f172a; }
    .signoff-block .sig-role { font-size: 9.5px; color: #64748b; margin-top: 2px; }
    .foot { margin-top: 22px; padding-top: 8px; border-top: 0.5px solid #cbd5e1; display: flex; justify-content: space-between; font-size: 9px; color: #64748b; letter-spacing: 0.8px; }
    @media print { .sections-grid, .status-section { break-inside: avoid; page-break-inside: avoid; } }
  `;

  const projectName = project?.contractTitle || project?.name || "Project";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(mergedDoc.title || "Status Report")}</title>
    <style>${styles}</style>
  </head>
  <body>
    <div class="status-root">
      <div class="status-head">
        <div>
          <div class="issuer-name">${escapeHtml(issuerName)}</div>
          ${issuerTagline ? `<div class="issuer-tag">${escapeHtml(issuerTagline)}</div>` : ""}
        </div>
        <div>
          <div class="title">STATUS REPORT</div>
          <div class="subtitle">${escapeHtml((mergedDoc.status || "draft").toUpperCase())} · ${escapeHtml(mergedDoc.referenceNo || "")}</div>
        </div>
      </div>

      <div class="meta-band">
        <div class="meta-cell">
          <div class="label">Project</div>
          <div class="value">${escapeHtml(projectName)}</div>
        </div>
        <div class="meta-cell">
          <div class="label">Reporting period</div>
          <div class="value">${escapeHtml(
            mergedDoc.reportPeriodStart && mergedDoc.reportPeriodEnd
              ? `${mergedDoc.reportPeriodStart} → ${mergedDoc.reportPeriodEnd}`
              : mergedDoc.date || "—",
          )}</div>
        </div>
        <div class="meta-cell">
          <div class="label">Prepared by</div>
          <div class="value">${escapeHtml(mergedDoc.signatoryName || branding.issuerDisplayName || "Project lead")}</div>
        </div>
      </div>

      <div class="overall-band">
        <div>
          <div class="overall-label">Overall status</div>
          <div class="overall-status">${escapeHtml(tone.label)}</div>
        </div>
        <div class="status-light"></div>
      </div>

      <div class="sections-grid">${sectionsHtml}</div>

      ${mergedDoc.statusResourceAsks?.trim()
        ? `<div class="resource-block">
            <div class="section-label">Resource / Support asks</div>
            <div class="body">${escapeHtml(mergedDoc.statusResourceAsks)}</div>
          </div>`
        : ""}

      <div class="signoff">
        <div class="signoff-block">
          ${signatureUrl ? `<img class="sig-image" src="${escapeHtml(signatureUrl)}" alt="" />` : ""}
          <div class="sig-line"></div>
          <div class="sig-name">${escapeHtml(mergedDoc.signatoryName || branding.issuerDisplayName || "Project lead")}</div>
          <div class="sig-role">${escapeHtml(mergedDoc.signatoryRole || "Authorized signatory")}</div>
        </div>
      </div>

      <div class="foot">
        <span>${escapeHtml(issuerName)}</span>
        <span>Status Report · ${escapeHtml(mergedDoc.date || "")}</span>
      </div>
    </div>
  </body>
</html>`;
}

function buildDocumentPrintHtml(
  doc: GeneratedDocument,
  project: Project | null,
  progressReport?: ProgressReport | null,
  certificate?: PaymentCertificate | null,
  signatureProfile?: UserSignatureProfile | null,
  workPlans: SavedWorkPlan[] = [],
  allCertificates: PaymentCertificate[] = [],
  meetingMinutes: MeetingMinute[] = [],
  risks: Risk[] = [],
  siteNotes: SiteNote[] = [],
  correspondenceRecords: CorrespondenceRecord[] = [],
  qualityControlRecords: QualityControlRecord[] = [],
) {
  const mergedDoc = hydrateGeneratedDocument(doc, project, progressReport, certificate);
  if (mergedDoc.templateType === "commencement-letter") {
    return buildCommencementLetterPrintHtml(mergedDoc, project, signatureProfile);
  }
  if (mergedDoc.templateType === "milestone-invoice") {
    return buildMilestoneInvoicePrintHtml(mergedDoc, project, signatureProfile);
  }
  if (mergedDoc.templateType === "status-report") {
    return buildStatusReportPrintHtml(mergedDoc, project, signatureProfile);
  }
  const isProgressReport = mergedDoc.templateType === "progress-report";
  const reportToggles = isProgressReport ? resolveReportSections(mergedDoc) : null;
  const coverNeeded =
    mergedDoc.layoutStyle === "report" && (!isProgressReport || (reportToggles?.cover ?? true));
  const signoffNeeded =
    mergedDoc.layoutStyle !== "certificate" && (!isProgressReport || (reportToggles?.signoff ?? true));
  const coverTitle = mergedDoc.coverTitle || mergedDoc.title;
  const reportNumberLabel =
    mergedDoc.reportNumber || mergedDoc.reportRevision
      ? `${mergedDoc.reportNumber ? `#${mergedDoc.reportNumber}` : ""}${
          mergedDoc.reportNumber && mergedDoc.reportRevision ? " " : ""
        }${mergedDoc.reportRevision ? `Rev ${mergedDoc.reportRevision}` : ""}`.trim()
      : "";
  const reportPeriodLabel =
    mergedDoc.reportPeriodStart && mergedDoc.reportPeriodEnd
      ? `${mergedDoc.reportPeriodStart} → ${mergedDoc.reportPeriodEnd}`
      : mergedDoc.reportPeriodStart || mergedDoc.reportPeriodEnd || "";
  const branding = resolveProjectBranding(project);
  const consultant = mergedDoc.signatoryName || branding.issuerDisplayName || "Authorized Representative";
  const recipient = mergedDoc.recipientName || project?.contractorName || "Recipient";
  const signatorySignature = resolveSavedSignature(mergedDoc.signatorySignatureSource, signatureProfile);
  const recipientSignature = resolveSavedSignature(mergedDoc.recipientSignatureSource, signatureProfile);
  const hasCoverImage = Boolean(mergedDoc.coverImageDataUrl);
  const certificateTitle = mergedDoc.title.toLowerCase().includes("completion")
    ? "Substantial Completion"
    : mergedDoc.title;
  const certificateConditions =
    mergedDoc.footerNote ||
    "Conditions: This certificate does not relieve the Contractor of obligations or liabilities under the Contract. Retention and any defects liability obligations remain subject to the contract conditions and final completion requirements.";

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(mergedDoc.title)}</title>
        <style>${documentPrintStyles()}</style>
      </head>
      <body>
        <div class="print-root">
          ${
            coverNeeded
              ? `
                <section class="page cover">
                  <div class="page-inner">
                    <div class="cover-hero">
                      <div class="letterhead">
                        <div>
                          ${documentMarkHtml(mergedDoc)}
                        </div>
                        <div style="margin-left:auto; text-align:right;">
                          <div class="letterhead-subtitle">${escapeHtml(
                            branding.headerTagline || "Project controls"
                          )}</div>
                          <div class="letterhead-address">${escapeHtmlMultiline(
                            branding.issuerAddress || mergedDoc.letterheadAddress || project?.location || "Project Location"
                          )}</div>
                        </div>
                      </div>
                      ${
                        hasCoverImage
                          ? `<div class="cover-image-frame"><img src="${escapeHtml(mergedDoc.coverImageDataUrl || "")}" alt="" /></div>`
                          : `<div class="cover-hero-spacer"></div>`
                      }
                      <h1 class="cover-title">${escapeHtml(coverTitle)}</h1>
                      ${
                        mergedDoc.coverSubtitle
                          ? `<div class="cover-subtitle">${escapeHtml(mergedDoc.coverSubtitle)}</div>`
                          : ""
                      }
                    </div>
                    <div class="cover-meta-band">
                      <div class="meta-grid">
                        <div class="meta-item"><div class="meta-label">Project</div><div class="meta-value">${escapeHtml(project?.name || "Project")}</div></div>
                        <div class="meta-item"><div class="meta-label">Reference</div><div class="meta-value">${escapeHtml(mergedDoc.referenceNo)}</div></div>
                        ${
                          reportPeriodLabel
                            ? `<div class="meta-item"><div class="meta-label">Reporting period</div><div class="meta-value">${escapeHtml(reportPeriodLabel)}</div></div>`
                            : `<div class="meta-item"><div class="meta-label">Date</div><div class="meta-value">${escapeHtml(mergedDoc.date)}</div></div>`
                        }
                        ${
                          reportNumberLabel
                            ? `<div class="meta-item"><div class="meta-label">Report</div><div class="meta-value">${escapeHtml(reportNumberLabel)}</div></div>`
                            : `<div class="meta-item"><div class="meta-label">Prepared by</div><div class="meta-value">${escapeHtml(consultant)}</div></div>`
                        }
                        ${
                          reportNumberLabel && reportPeriodLabel
                            ? `<div class="meta-item"><div class="meta-label">Prepared by</div><div class="meta-value">${escapeHtml(consultant)}</div></div>
                               <div class="meta-item"><div class="meta-label">For</div><div class="meta-value">${escapeHtml(project?.clientName || branding.clientDisplayName || "Client")}</div></div>`
                            : ""
                        }
                      </div>
                    </div>
                  </div>
                </section>
              `
              : ""
          }
          <section class="page${mergedDoc.layoutStyle === "certificate" ? " certificate-page" : ""}">
            <div class="page-inner">
              ${
                mergedDoc.layoutStyle === "certificate"
                  ? `
                    <div class="certificate-shell">
                      <div class="certificate-banner">
                        <div class="certificate-banner-logo">${escapeHtml(documentInitials(mergedDoc))}</div>
                        <div class="certificate-banner-title">
                          ${escapeHtml(mergedDoc.letterheadTitle || branding.clientDisplayName || "Project Authority")}
                          <span class="certificate-banner-subtitle">${escapeHtml(
                            mergedDoc.letterheadSubtitle || branding.headerTagline || project?.contractTitle || "Construction project controls"
                          )}</span>
                        </div>
                      </div>
                      <div class="certificate-issued">Certificate of</div>
                      <h1 class="certificate-main-title">${escapeHtml(certificateTitle)}</h1>
                      <div class="certificate-rule"></div>
                      <p class="certificate-legal">Issued pursuant to the conditions of contract and the project completion records.</p>
                      <p class="certificate-statement">This is to certify that the works executed by the Contractor</p>
                      <div class="certificate-contractor">${escapeHtml(recipient)}</div>
                      <div class="certificate-project">${escapeHtml(project?.contractTitle || project?.name || "Project works")}</div>
                      <p class="certificate-narrative">
                        have, on the basis of the Engineer's technical inspection and project records, achieved substantial completion for the stated scope, subject to outstanding defects and obligations recorded under the defects liability period.
                      </p>
                      <div class="certificate-table">
                        <div class="certificate-cell"><div class="certificate-cell-label">Date of substantial completion</div><div class="certificate-cell-value">${escapeHtml(mergedDoc.date)}</div></div>
                        <div class="certificate-cell"><div class="certificate-cell-label">Defects liability period</div><div class="certificate-cell-value">Six (6) months</div></div>
                        <div class="certificate-cell"><div class="certificate-cell-label">Commencement date</div><div class="certificate-cell-value">${escapeHtml(project?.start_date || "Not set")}</div></div>
                        <div class="certificate-cell"><div class="certificate-cell-label">Contract period</div><div class="certificate-cell-value">${escapeHtml(project?.start_date || "Start")} → ${escapeHtml(project?.end_date || "Completion")}</div></div>
                        <div class="certificate-cell"><div class="certificate-cell-label">Contract reference</div><div class="certificate-cell-value">${escapeHtml(project?.contractNumber || mergedDoc.referenceNo || "—")}</div></div>
                        <div class="certificate-cell"><div class="certificate-cell-label">Contract value</div><div class="certificate-cell-value">${escapeHtml(project?.currency || "USD")} ${escapeHtml(project?.contractAmount || "Not set")}</div></div>
                        <div class="certificate-cell"><div class="certificate-cell-label">Contractor</div><div class="certificate-cell-value">${escapeHtml(project?.contractorName || recipient || "Contractor")}</div></div>
                        <div class="certificate-cell"><div class="certificate-cell-label">Engineer</div><div class="certificate-cell-value">${escapeHtml(branding.issuerDisplayName || project?.consultantName || consultant)}</div></div>
                        <div class="certificate-cell"><div class="certificate-cell-label">Beneficiary</div><div class="certificate-cell-value">${escapeHtml(project?.clientName || branding.clientDisplayName || "Client / Employer")}</div></div>
                        <div class="certificate-cell"><div class="certificate-cell-label">Donor / Employer</div><div class="certificate-cell-value">${escapeHtml(branding.clientDisplayName || project?.clientName || "Employer")}</div></div>
                        <div class="certificate-cell"><div class="certificate-cell-label">Retention held</div><div class="certificate-cell-value">As per contract</div></div>
                        <div class="certificate-cell"><div class="certificate-cell-label">Project location</div><div class="certificate-cell-value">${escapeHtml(project?.location || "—")}</div></div>
                      </div>
                    </div>
                    ${renderBodyHtml(mergedDoc, project, progressReport, certificate)}
                    <div class="certificate-signature-grid">
                      <div class="certificate-signature-box">
                        <div class="certificate-signature-label">Issued by</div>
                        ${signatureImageHtml(signatorySignature, "certificate-signature-image")}
                        <div class="certificate-signature-name">${escapeHtml(mergedDoc.signatoryName || consultant)}</div>
                        <div class="certificate-signature-name">${escapeHtml(mergedDoc.signatoryRole || "Authorized Consultant")}</div>
                        <div class="certificate-signature-line">Signature / Name & Date</div>
                      </div>
                      <div class="certificate-signature-box">
                        <div class="certificate-signature-label">Certified by</div>
                        <div class="certificate-signature-name">${escapeHtml(branding.issuerDisplayName || project?.consultantName || "Engineer")}</div>
                        <div class="certificate-signature-name">Engineer Representative</div>
                        <div class="certificate-signature-line">Signature / Name & Date</div>
                      </div>
                      <div class="certificate-signature-box">
                        <div class="certificate-signature-label">Acknowledged by - the contractor</div>
                        ${signatureImageHtml(recipientSignature, "certificate-signature-image")}
                        <div class="certificate-signature-name">${escapeHtml(mergedDoc.recipientName || recipient)}</div>
                        <div class="certificate-signature-name">${escapeHtml(mergedDoc.recipientRole || "Contractor Representative")}</div>
                        <div class="certificate-signature-line">Signature / Name & Date</div>
                      </div>
                    </div>
                    <div class="certificate-conditions">${escapeHtmlMultiline(certificateConditions)}</div>
                  `
                  : isProgressReport
                  ? `
                    ${renderBodyHtml(mergedDoc, project, progressReport, certificate, workPlans, allCertificates, meetingMinutes, risks, siteNotes, correspondenceRecords, qualityControlRecords)}
                  `
                  : `
                    <div class="brand-shell">
                      <div class="brand-mark-box">
                        ${documentMarkHtml(mergedDoc)}
                        <div class="brand-block">
                          <div class="brand-kicker">Official project correspondence</div>
                          <h2 class="brand-name">${escapeHtml(
                            mergedDoc.letterheadTitle || branding.issuerDisplayName || project?.name || "Project Office"
                          )}</h2>
                          <div class="brand-tagline">${escapeHtml(
                            mergedDoc.letterheadSubtitle || branding.headerTagline || project?.contractTitle || mergedDoc.title
                          )}</div>
                          <div class="brand-address">${escapeHtmlMultiline(
                            mergedDoc.letterheadAddress || branding.issuerAddress || project?.location || "Project Location"
                          )}</div>
                        </div>
                      </div>
                      <div class="doc-status-chip">${escapeHtml(mergedDoc.status.toUpperCase())}</div>
                    </div>
                    <h1 class="document-title">${escapeHtml(mergedDoc.title)}</h1>
                    <div class="meta-grid">
                      <div class="meta-item"><div class="meta-label">Reference</div><div class="meta-value">${escapeHtml(mergedDoc.referenceNo)}</div></div>
                      <div class="meta-item"><div class="meta-label">Date</div><div class="meta-value">${escapeHtml(mergedDoc.date)}</div></div>
                      <div class="meta-item"><div class="meta-label">To</div><div class="meta-value">${escapeHtml(recipient)}</div></div>
                      <div class="meta-item"><div class="meta-label">Project</div><div class="meta-value">${escapeHtml(project?.name || "Project")}</div></div>
                    </div>
                    <div class="doc-divider"></div>
                    ${renderBodyHtml(mergedDoc, project, progressReport, certificate)}
                  `
              }

              ${
                mergedDoc.layoutStyle !== "certificate" && mergedDoc.footerNote
                  ? `<div class="footer-note">${escapeHtmlMultiline(mergedDoc.footerNote)}</div>`
                  : ""
              }

              ${
                signoffNeeded
                  ? `
                    <div class="signature-grid">
                      <div class="signature-box">
                        ${signatureImageHtml(recipientSignature)}
                        <div class="signature-name">${escapeHtml(mergedDoc.recipientName || recipient)}</div>
                        <div class="signature-role">${escapeHtml(mergedDoc.recipientRole || "Recipient")}</div>
                      </div>
                      <div class="signature-box">
                        ${signatureImageHtml(signatorySignature)}
                        <div class="signature-name">${escapeHtml(mergedDoc.signatoryName || consultant)}</div>
                        <div class="signature-role">${escapeHtml(mergedDoc.signatoryRole || "Authorized Signatory")}</div>
                      </div>
                    </div>
                  `
                  : ""
              }

              <div class="page-number">${coverNeeded ? "Page 2" : "Page 1"}</div>
            </div>
          </section>
        </div>
      </body>
    </html>
  `;
}

function openDocumentPdf(
  doc: GeneratedDocument,
  project: Project | null,
  progressReport?: ProgressReport | null,
  certificate?: PaymentCertificate | null,
  signatureProfile?: UserSignatureProfile | null,
  workPlans: SavedWorkPlan[] = [],
  allCertificates: PaymentCertificate[] = [],
  meetingMinutes: MeetingMinute[] = [],
  risks: Risk[] = [],
  siteNotes: SiteNote[] = [],
  correspondenceRecords: CorrespondenceRecord[] = [],
  qualityControlRecords: QualityControlRecord[] = [],
) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;
  printWindow.document.write(
    buildDocumentPrintHtml(
      doc,
      project,
      progressReport,
      certificate,
      signatureProfile,
      workPlans,
      allCertificates,
      meetingMinutes,
      risks,
      siteNotes,
      correspondenceRecords,
      qualityControlRecords,
    ),
  );
  printWindow.document.close();
  setTimeout(() => {
    printWindow.focus();
    printWindow.print();
  }, 350);
}

function DocumentPreview({
  doc,
  project,
  progressReport,
  certificate,
  signatureProfile,
}: {
  doc: GeneratedDocument;
  project: Project | null;
  progressReport?: ProgressReport | null;
  certificate?: PaymentCertificate | null;
  signatureProfile?: UserSignatureProfile | null;
}) {
  const mergedDoc = hydrateGeneratedDocument(doc, project, progressReport, certificate);
  const branding = resolveProjectBranding(project);
  const metrics = progressReport ? progressMetrics(progressReport) : null;
  const certValue = certificate ? certificateNet(certificate) : null;
  const coverNeeded = mergedDoc.layoutStyle === "report";
  const recipient = mergedDoc.recipientName || project?.contractorName || "Recipient";
  const signatory = mergedDoc.signatoryName || project?.consultantName || "Authorized Signatory";
  const isCertificate = mergedDoc.layoutStyle === "certificate";
  const signatorySignature = resolveSavedSignature(mergedDoc.signatorySignatureSource, signatureProfile);
  const recipientSignature = resolveSavedSignature(mergedDoc.recipientSignatureSource, signatureProfile);
  const certificateTitle = mergedDoc.title.toLowerCase().includes("completion")
    ? "Substantial Completion"
    : mergedDoc.title;
  const certificateConditions =
    mergedDoc.footerNote ||
    "Conditions: This certificate does not relieve the Contractor of obligations or liabilities under the Contract. Retention and defects liability obligations remain subject to the contract conditions and final completion requirements.";

  return (
    <div className="space-y-5">
      {coverNeeded && (
        <div
          className="mx-auto w-full max-w-[860px] overflow-hidden border border-border shadow-[0_24px_80px_rgba(0,0,0,0.28)]"
          style={{
            background: mergedDoc.coverImageDataUrl
              ? `linear-gradient(180deg, rgba(15,39,66,0.88) 0%, rgba(18,57,93,0.84) 48%, rgba(255,255,255,0.98) 48%, rgba(255,255,255,0.98) 100%), url(${mergedDoc.coverImageDataUrl}) center/cover no-repeat`
              : "radial-gradient(circle at top right, rgba(20,91,133,0.28), transparent 30%), linear-gradient(180deg, #0f2742 0%, #12395d 48%, #ffffff 48%, #ffffff 100%)",
          }}
        >
          <div className="p-10 min-h-[920px] flex flex-col">
            <div className="flex items-start justify-between">
              {mergedDoc.brandLogoDataUrl ? (
                 <div className="w-16 h-16 bg-white shadow-[0_18px_30px_rgba(15,39,66,0.16)] overflow-hidden border border-white/70">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={mergedDoc.brandLogoDataUrl} alt="Document logo" className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="w-14 h-14 bg-white/10 border border-white/20 flex items-center justify-center text-white font-black tracking-[0.18em]">
                  {documentInitials(mergedDoc)}
                </div>
              )}
              <div className="text-right">
                <div className="text-[11px] uppercase tracking-[0.24em] text-white/70 font-semibold">
                  {branding.headerTagline || "Professional project controls"}
                </div>
                <div className="mt-2 whitespace-pre-line text-sm text-white/90">
                  {branding.issuerAddress || mergedDoc.letterheadAddress || project?.location || "Project Location"}
                </div>
              </div>
            </div>
            <div className="mt-24">
              <div className="text-[12px] uppercase tracking-[0.24em] text-white/70 font-semibold mb-4">Document Package</div>
              <h1 className="text-5xl font-black tracking-[0.12em] uppercase text-white max-w-[70%] leading-tight">
                {mergedDoc.coverTitle || mergedDoc.title}
              </h1>
              {mergedDoc.coverSubtitle && (
                <p className="mt-5 max-w-[72%] text-sm leading-7 tracking-[0.04em] text-white/85">
                  {mergedDoc.coverSubtitle}
                </p>
              )}
              <div className="mt-10 w-[72%] bg-white/95 shadow-[0_24px_50px_rgba(15,39,66,0.18)] p-6 grid grid-cols-2 gap-4 text-sm text-slate-800">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 mb-1">Project</div>
                  <div className="font-semibold">{project?.name || "Project"}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 mb-1">Reference</div>
                  <div className="font-semibold">{mergedDoc.referenceNo}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 mb-1">Date</div>
                  <div className="font-semibold">{mergedDoc.date}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 mb-1">Prepared By</div>
                  <div className="font-semibold">{signatory}</div>
                </div>
              </div>
            </div>
            <div className="mt-auto text-sm text-slate-600">Cover Page</div>
          </div>
        </div>
      )}

      <div className={`mx-auto w-full max-w-[860px] overflow-hidden border bg-white shadow-[0_24px_80px_rgba(0,0,0,0.28)] ${isCertificate ? "border-sky-400 border-[5px]" : "border-border"}`}>
        <div className={isCertificate ? "bg-white px-8 py-8" : "px-10 py-10"}>
          {isCertificate ? (
            <div className="bg-white text-center">
              <div className="flex items-center justify-between gap-5 border-b-[10px] border-sky-400 bg-[#1f5b89] px-6 py-4 text-white">
                <div className="text-left text-[30px] font-black tracking-[-0.05em]">{documentInitials(mergedDoc)}</div>
                <div className="text-right">
                  <div className="text-[13px] font-black uppercase tracking-[0.08em]">
                    {mergedDoc.letterheadTitle || branding.clientDisplayName || "Project Authority"}
                  </div>
                  <div className="mt-1 max-w-[560px] text-[10px] italic leading-5 text-white/90">
                    {mergedDoc.letterheadSubtitle || branding.headerTagline || project?.contractTitle || "Construction project controls"}
                  </div>
                </div>
              </div>
              <div className="mt-5 text-[12px] font-bold uppercase tracking-[0.48em] text-sky-600">Certificate of</div>
              <h1 className="mt-2 text-[32px] font-black uppercase tracking-[0.04em] text-slate-950">
                {certificateTitle}
              </h1>
              <div className="mx-auto mt-3 h-px max-w-[620px] bg-amber-500" />
              <p className="mx-auto mt-3 max-w-[650px] text-[12px] font-semibold italic text-slate-700">
                Issued pursuant to the conditions of contract and the project completion records.
              </p>
              <p className="mt-4 text-sm text-slate-800">This is to certify that the works executed by the Contractor</p>
              <div className="mt-2 text-[24px] font-black uppercase tracking-[0.04em] text-blue-700">{recipient}</div>
              <div className="mx-auto mt-2 max-w-[640px] text-sm font-bold italic text-sky-600">
                {project?.contractTitle || project?.name || "Project works"}
              </div>
            </div>
          ) : (
            <>
              <div className="-mx-10 -mt-10 mb-9 border-b-2 border-[#0f2742] bg-gradient-to-b from-[#f4f9fd] to-white px-10 pb-7 pt-9">
                <div className="flex items-start justify-between gap-6">
                  <div className="flex min-w-0 items-start gap-4">
                    {mergedDoc.brandLogoDataUrl ? (
                      <div className="h-16 w-16 shrink-0 overflow-hidden border border-slate-200 bg-white shadow-[0_18px_30px_rgba(15,39,66,0.1)]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={mergedDoc.brandLogoDataUrl} alt="Document logo" className="h-full w-full object-cover" />
                      </div>
                    ) : (
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center bg-gradient-to-br from-[#145b85] to-[#0f2742] text-base font-black tracking-[0.16em] text-white shadow-[0_18px_30px_rgba(15,39,66,0.22)]">
                        {documentInitials(mergedDoc)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="text-[9.5px] font-semibold uppercase tracking-[0.28em] text-sky-700">
                        Official project correspondence
                      </div>
                      <h2 className="mt-2 text-[26px] font-bold leading-tight tracking-tight text-[#0f2742] break-words">
                        {mergedDoc.letterheadTitle || branding.issuerDisplayName || project?.name || "Project Office"}
                      </h2>
                      <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 break-words">
                        {mergedDoc.letterheadSubtitle || branding.headerTagline || project?.contractTitle || mergedDoc.title}
                      </div>
                      <div className="mt-3 whitespace-pre-line text-[13px] leading-6 text-slate-500">
                        {mergedDoc.letterheadAddress || branding.issuerAddress || project?.location || "Project Location"}
                      </div>
                    </div>
                  </div>
                  <Badge color={mergedDoc.status === "approved" ? "ok" : mergedDoc.status === "issued" ? "accent" : "warn"}>
                    {mergedDoc.status.toUpperCase()}
                  </Badge>
                </div>
              </div>
              <div className="mt-8">
                <h1 className="text-[26px] font-bold tracking-tight text-[#0f2742]">{mergedDoc.title}</h1>
                <div className="mt-2 h-[3px] w-14 rounded-full bg-sky-500" />
              </div>
            </>
          )}

          <div className={isCertificate ? "mt-7 grid grid-cols-2 border border-sky-400 text-sm" : "mt-7 grid grid-cols-2 gap-4 text-sm"}>
            {[
              { label: "Reference", value: mergedDoc.referenceNo },
              { label: "Date", value: mergedDoc.date },
              { label: "To", value: recipient },
              { label: "Project", value: project?.name || "Project" },
            ].map((item) => (
              <div key={item.label} className={isCertificate ? "border-r border-b border-sky-400 p-3 even:border-r-0 [&:nth-last-child(-n+2)]:border-b-0" : "border-t border-slate-200 pt-3"}>
                <div className={isCertificate ? "mb-1 text-[9px] font-black uppercase tracking-[0.12em] text-sky-800" : "text-[10px] uppercase tracking-[0.2em] text-slate-500 mb-1"}>{item.label}</div>
                <div className="font-semibold text-slate-900">{item.value}</div>
              </div>
            ))}
          </div>

          {mergedDoc.layoutStyle === "report" && (
            <div className="mt-8 grid grid-cols-4 gap-3">
              {(metrics
                ? [
                    { label: "Planned", value: `${metrics.planned.toFixed(1)}%` },
                    { label: "Actual", value: `${metrics.actual.toFixed(1)}%` },
                    { label: "Variance", value: `${metrics.variance.toFixed(1)}%` },
                    { label: "Earned Value", value: `${project?.currency || "USD"} ${currency(metrics.earned)}` },
                  ]
                : [
                    { label: "Reference", value: mergedDoc.referenceNo },
                    { label: "Date", value: mergedDoc.date },
                    { label: "Status", value: mergedDoc.status.toUpperCase() },
                    { label: "Currency", value: project?.currency || "USD" },
                  ]
              ).map((card) => (
                <div key={card.label} className="border border-slate-200 p-4 bg-slate-50">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500 mb-2">{card.label}</div>
                  <div className="text-xl font-bold text-slate-900">{card.value}</div>
                </div>
              ))}
            </div>
          )}

          {mergedDoc.layoutStyle === "report" && certValue !== null && (
            <div className="mt-6 border border-slate-200 p-5 bg-slate-50">
              <div className="text-[11px] uppercase tracking-[0.2em] text-sky-700 font-semibold mb-3">Commercial Snapshot</div>
              <div className="text-sm text-slate-700">
                Net certified amount for the linked certificate is <span className="font-bold text-slate-900">{project?.currency || "USD"} {currency(certValue)}</span>.
              </div>
            </div>
          )}

          {mergedDoc.layoutStyle === "certificate" && (
            <div className="mt-6 border border-sky-400 bg-sky-50/70">
              <div className="grid grid-cols-2 text-sm">
                {[
                  ["Date of substantial completion", mergedDoc.date],
                  ["Defects liability period", "Six (6) months"],
                  ["Contract value", `${project?.currency || "USD"} ${project?.contractAmount || "Not set"}`],
                  ["Retention held", "As per contract"],
                  ["Beneficiary", project?.clientName || branding.clientDisplayName || "Client / Employer"],
                  ["Engineer", branding.issuerDisplayName || project?.consultantName || signatory],
                ].map(([label, value]) => (
                  <div key={label} className="min-h-[50px] border-r border-b border-sky-400 p-3 even:border-r-0 [&:nth-last-child(-n+2)]:border-b-0">
                    <div className="text-[9px] font-black uppercase tracking-[0.12em] text-sky-800">{label}</div>
                    <div className="mt-1 font-bold text-slate-950">{value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-8 border-t border-slate-200 pt-7 space-y-5">
            {parseContentBlocks(mergedDoc.content).map((block, index) => {
              if (block.type === "heading") {
                return (
                  <h3 key={index} className="text-[13px] uppercase tracking-[0.18em] text-sky-700 font-bold font-sans">
                    {block.title}
                  </h3>
                );
              }

              if (block.type === "bullets") {
                return (
                  <ul key={index} className="list-disc pl-5 space-y-2 text-[15px] leading-8 text-slate-700">
                    {block.items.map((item, itemIndex) => (
                      <li key={itemIndex}>{item}</li>
                    ))}
                  </ul>
                );
              }

              if (block.type === "section-bullets") {
                return (
                  <section key={index}>
                    <h3 className="text-[13px] uppercase tracking-[0.18em] text-sky-700 font-bold font-sans mb-3">
                      {block.title}
                    </h3>
                    <ul className="list-disc pl-5 space-y-2 text-[15px] leading-8 text-slate-700">
                      {block.items.map((item, itemIndex) => (
                        <li key={itemIndex}>{item}</li>
                      ))}
                    </ul>
                  </section>
                );
              }

              if (block.type === "section") {
                return (
                  <section key={index}>
                    <h3 className="mb-1.5 text-[12px] font-bold uppercase tracking-[0.16em] text-sky-700 font-sans">
                      {block.title}
                    </h3>
                    <p className="text-[15px] leading-8 text-slate-700">{block.items[0]}</p>
                  </section>
                );
              }

              return (
                <p key={index} className="text-[15px] leading-8 text-slate-700">
                  {block.items[0]}
                </p>
              );
            })}
          </div>

          {mergedDoc.templateType === "site-visit-report" ? (
            <>
              <SiteVisitObservation observationHtml={mergedDoc.siteVisitObservationHtml} />
              <SiteVisitPhotoGallery photos={mergedDoc.siteVisitPhotos} />
            </>
          ) : null}

          {(mergedDoc.footerNote || isCertificate) && (
            <div className={isCertificate ? "mt-8 border border-sky-400 bg-sky-50 p-4 text-[12px] leading-6 text-slate-700" : "mt-10 pt-4 border-t border-slate-200 text-[12px] leading-6 text-slate-500"}>
              {isCertificate ? certificateConditions : mergedDoc.footerNote}
            </div>
          )}

          <div className={`mt-12 grid gap-8 ${isCertificate ? "grid-cols-3" : "grid-cols-2"}`}>
            <div className="border-t border-slate-300 pt-3">
              {recipientSignature ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={recipientSignature} alt="Recipient saved signature" className="-mt-9 mb-2 h-12 max-w-[170px] object-contain" />
              ) : null}
              <div className="font-bold text-slate-900">{recipient}</div>
              <div className="text-sm text-slate-500">{mergedDoc.recipientRole || "Recipient"}</div>
            </div>
            <div className="border-t border-slate-300 pt-3">
              {signatorySignature ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={signatorySignature} alt="Signatory saved signature" className="-mt-9 mb-2 h-12 max-w-[170px] object-contain" />
              ) : null}
              <div className="font-bold text-slate-900">{signatory}</div>
              <div className="text-sm text-slate-500">{mergedDoc.signatoryRole || "Authorized Signatory"}</div>
            </div>
            {isCertificate && (
              <div className="border-t border-slate-300 pt-3">
                <div className="font-bold text-slate-900">{project?.contractorName || recipient}</div>
                <div className="text-sm text-slate-500">Acknowledged by Contractor</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DocumentsModule() {
  const {
    project,
    generatedDocuments,
    progressReports,
    certificates,
    savedWorkPlans,
    meetingMinutes,
    risks,
    siteNotes,
    correspondenceRecords,
    qualityControlRecords,
    userSignatureProfile,
    setUserSignatureProfile,
    clearUserSignatureProfile,
    addGeneratedDocument,
    updateGeneratedDocument,
    deleteGeneratedDocument,
    setActiveGeneratedDocumentId,
  } = useAppStore();

  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);

  // Mirror the open document to the store so the AI assistant can fill its
  // fields. Clear it when leaving the module.
  useEffect(() => {
    setActiveGeneratedDocumentId(activeDocumentId);
    return () => setActiveGeneratedDocumentId(null);
  }, [activeDocumentId, setActiveGeneratedDocumentId]);
  const [showCreate, setShowCreate] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [templateType, setTemplateType] = useState<DocumentTemplateType>("progress-report");
  const [title, setTitle] = useState("Progress Report");
  const [linkedProgressReportId, setLinkedProgressReportId] = useState("");
  const [linkedCertificateId, setLinkedCertificateId] = useState("");
  // Progress-report generator: collapsed by default so the setup opens as a
  // compact preset picker. "Advanced" reveals branding, header, print assets and
  // the full per-section toggles.
  const [showReportAdvanced, setShowReportAdvanced] = useState(false);

  const projectDocuments = generatedDocuments.filter((doc) => doc.project_id === project?.id);
  const projectProgressReports = progressReports.filter((report) => report.project_id === project?.id);
  const projectCertificates = certificates.filter((certificate) => certificate.project_id === project?.id);
  const activeDocumentRaw = projectDocuments.find((doc) => doc.id === activeDocumentId) || null;

  useEffect(() => {
    setTitle(templateLabelFor(templateType, project));
  }, [templateType, project]);

  // List of template types the user is allowed to pick for the current project. FIDIC
  // payment-certificate-summary is hidden for non-construction projects; everything
  // else stays available with project-type-aware labels.
  const availableTemplates = useMemo<DocumentTemplateType[]>(() => {
    return (Object.keys(templateLabels) as DocumentTemplateType[]).filter((type) =>
      isTemplateVisibleForProject(type, project),
    );
  }, [project]);

  // If the modal happens to be open with a template that's hidden for this project
  // (e.g. user switched projects mid-flight), nudge them to a safe default.
  useEffect(() => {
    if (!availableTemplates.includes(templateType)) {
      setTemplateType(availableTemplates[0] || "progress-report");
    }
  }, [availableTemplates, templateType]);

  const latestProgress = useMemo(
    () => [...projectProgressReports].sort((a, b) => b.date.localeCompare(a.date))[0] || null,
    [projectProgressReports]
  );
  const latestCertificate = useMemo(
    () => [...projectCertificates].sort((a, b) => b.date.localeCompare(a.date))[0] || null,
    [projectCertificates]
  );

  const linkedProgress =
    projectProgressReports.find((report) => report.id === activeDocumentRaw?.linkedProgressReportId) || latestProgress;
  const linkedCertificate =
    projectCertificates.find((certificate) => certificate.id === activeDocumentRaw?.linkedCertificateId) || latestCertificate;
  const activeDocument =
    activeDocumentRaw ? hydrateGeneratedDocument(activeDocumentRaw, project, linkedProgress, linkedCertificate) : null;
  const branding = resolveProjectBranding(project);
  const brandingSource = activeDocument?.brandingMode === "custom" ? "custom" : "project";

  useEffect(() => {
    if (userSignatureProfile?.imageDataUrl) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    let active = true;
    const loadSignatureProfile = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!active || !user) return;

      const { data } = await supabase
        .from("profiles")
        .select("full_name, signature_display_name, signature_role_title, signature_image_data_url, updated_at")
        .eq("id", user.id)
        .maybeSingle();

      if (!active || !data?.signature_image_data_url) return;
      setUserSignatureProfile({
        displayName: data.signature_display_name || data.full_name || "Authorized Signatory",
        roleTitle: data.signature_role_title || "Authorized Signatory",
        imageDataUrl: data.signature_image_data_url,
        updatedAt: data.updated_at || new Date().toISOString(),
      });
    };

    void loadSignatureProfile();

    return () => {
      active = false;
    };
  }, [setUserSignatureProfile, userSignatureProfile?.imageDataUrl]);

  const persistSignatureProfile = async (profile: UserSignatureProfile | null) => {
    if (profile) {
      setUserSignatureProfile(profile);
    } else {
      clearUserSignatureProfile();
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from("profiles")
      .update({
        signature_display_name: profile?.displayName || null,
        signature_role_title: profile?.roleTitle || null,
        signature_image_data_url: profile?.imageDataUrl || null,
      })
      .eq("id", user.id);
  };

  const uploadDocumentAsset = async (
    field: "brandLogoDataUrl" | "coverImageDataUrl",
    file?: File | null
  ) => {
    if (!activeDocument || !file) return;
    const dataUrl = await readFileAsDataUrl(file);
    updateGeneratedDocument(activeDocument.id, { [field]: dataUrl } as Partial<GeneratedDocument>);
  };

  // ── Progress-report photo gallery (curated, stored on the document) ──────────
  const addReportPhotos = async (files: FileList | null) => {
    if (!activeDocument || !files?.length) return;
    const existing = activeDocument.reportPhotos || [];
    const added: SiteNotePhoto[] = [];
    const list = Array.from(files);
    for (let i = 0; i < list.length; i++) {
      const dataUrl = await readFileAsDataUrl(list[i]);
      if (!dataUrl) continue;
      added.push({
        id: uuid(),
        dataUrl,
        caption: "",
        takenAt: new Date().toISOString(),
        sortOrder: existing.length + i,
      });
    }
    if (added.length) {
      updateGeneratedDocument(activeDocument.id, { reportPhotos: [...existing, ...added] });
    }
  };

  const setReportPhotoCaption = (id: string, caption: string) => {
    if (!activeDocument) return;
    const next = (activeDocument.reportPhotos || []).map((photo) =>
      photo.id === id ? { ...photo, caption } : photo,
    );
    updateGeneratedDocument(activeDocument.id, { reportPhotos: next });
  };

  const removeReportPhoto = (id: string) => {
    if (!activeDocument) return;
    const next = (activeDocument.reportPhotos || [])
      .filter((photo) => photo.id !== id)
      .map((photo, index) => ({ ...photo, sortOrder: index }));
    updateGeneratedDocument(activeDocument.id, { reportPhotos: next });
  };

  const moveReportPhoto = (id: string, direction: -1 | 1) => {
    if (!activeDocument) return;
    const photos = [...(activeDocument.reportPhotos || [])].sort((a, b) => a.sortOrder - b.sortOrder);
    const index = photos.findIndex((photo) => photo.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= photos.length) return;
    [photos[index], photos[target]] = [photos[target], photos[index]];
    updateGeneratedDocument(activeDocument.id, {
      reportPhotos: photos.map((photo, i) => ({ ...photo, sortOrder: i })),
    });
  };

  const uploadSavedSignature = async (file?: File | null) => {
    if (!file) return;
    const dataUrl = await readFileAsDataUrl(file);
    await persistSignatureProfile({
      displayName:
        userSignatureProfile?.displayName ||
        activeDocument?.signatoryName ||
        project?.consultantName ||
        "Authorized Signatory",
      roleTitle:
        userSignatureProfile?.roleTitle ||
        activeDocument?.signatoryRole ||
        "Authorized Signatory",
      imageDataUrl: dataUrl,
      updatedAt: new Date().toISOString(),
    });
  };

  const setBrandingMode = (mode: "project" | "custom") => {
    if (!activeDocument) return;
    if (mode === "project") {
      updateGeneratedDocument(activeDocument.id, {
        brandingMode: "project",
        letterheadTitle: "",
        letterheadSubtitle: "",
        letterheadAddress: "",
        brandLogoDataUrl: "",
      });
      return;
    }

    updateGeneratedDocument(activeDocument.id, {
      brandingMode: "custom",
      letterheadTitle: activeDocument.letterheadTitle || branding.issuerDisplayName,
      letterheadSubtitle: activeDocument.letterheadSubtitle || branding.headerTagline || project?.contractTitle || "",
      letterheadAddress: activeDocument.letterheadAddress || branding.issuerAddress || project?.location || "",
      brandLogoDataUrl: activeDocument.brandLogoDataUrl || branding.clientLogoDataUrl,
    });
  };

  if (!activeDocument) {
    return (
      <div className="animate-fade-in">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold tracking-tight">Documents</h2>
          <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
            <Plus size={14} /> New Document
          </Button>
        </div>

        {projectDocuments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-16 h-16 rounded-xl bg-accent/10 flex items-center justify-center mb-4">
              <FileText size={28} className="text-accent opacity-60" />
            </div>
            <p className="text-txt-muted text-sm font-medium">No documents yet</p>
            <Button variant="primary" size="md" className="mt-4" onClick={() => setShowCreate(true)}>
              <Plus size={14} /> New Document
            </Button>
          </div>
        ) : (
          <div className="data-table-shell overflow-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Type</th>
                  <th>Reference</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th style={{ width: 110 }} aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {projectDocuments.map((doc) => {
                  const linkedListProgress =
                    projectProgressReports.find((report) => report.id === doc.linkedProgressReportId) || latestProgress;
                  const linkedListCertificate =
                    projectCertificates.find((certificate) => certificate.id === doc.linkedCertificateId) || latestCertificate;
                  const hydratedDoc = hydrateGeneratedDocument(doc, project, linkedListProgress, linkedListCertificate);

                  return (
                    <tr
                      key={doc.id}
                      onClick={() => {
                        setActiveDocumentId(doc.id);
                        setIsEditMode(false);
                      }}
                      className="cursor-pointer"
                    >
                      <td>
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-md bg-gradient-to-br from-accent/20 to-accent/5 flex items-center justify-center flex-shrink-0 overflow-hidden">
                            {hydratedDoc.brandLogoDataUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={hydratedDoc.brandLogoDataUrl} alt="Document logo" className="w-full h-full object-cover" />
                            ) : (
                              <FileText size={13} className="text-accent" />
                            )}
                          </div>
                          <span className="font-semibold text-sm">{hydratedDoc.title}</span>
                        </div>
                      </td>
                      <td className="text-xs text-txt-muted">{templateLabelFor(hydratedDoc.templateType, project)}</td>
                      <td className="text-xs text-txt-muted font-mono">{hydratedDoc.referenceNo}</td>
                      <td className="text-xs text-txt-muted">{hydratedDoc.date}</td>
                      <td>
                        <Badge color={hydratedDoc.status === "approved" ? "ok" : hydratedDoc.status === "issued" ? "accent" : "warn"}>
                          {hydratedDoc.status.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="data-cell-action">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openDocumentPdf(hydratedDoc, project, linkedListProgress, linkedListCertificate, userSignatureProfile, savedWorkPlans, certificates, meetingMinutes, risks, siteNotes, correspondenceRecords, qualityControlRecords);
                            }}
                            className="data-row-action"
                            aria-label="Print or save as PDF"
                          >
                            <Printer size={13} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteGeneratedDocument(doc.id);
                              if (activeDocumentId === doc.id) setActiveDocumentId(null);
                            }}
                            className="data-row-action danger"
                            aria-label="Delete document"
                          >
                            <Trash2 size={13} />
                          </button>
                          <ChevronRight size={14} className="text-txt-dim ml-0.5" />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Document" width={560}>
          <div className="space-y-4">
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-txt-dim mb-1.5 font-medium">
                Template
              </label>
              <select
                value={templateType}
                onChange={(e) => setTemplateType(e.target.value as DocumentTemplateType)}
                className="w-full px-3 py-2.5 bg-bg-input border border-border rounded-lg text-sm text-txt outline-none focus:border-accent transition-colors"
              >
                {availableTemplates.map((type) => (
                  <option key={type} value={type}>
                    {templateLabelFor(type, project)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-txt-dim mb-1.5 font-medium">
                Title
              </label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2.5 bg-bg-input border border-border rounded-lg text-sm text-txt outline-none focus:border-accent transition-colors"
              />
            </div>
            {(templateType === "progress-report" || templateType === "payment-certificate-summary") && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-txt-dim mb-1.5 font-medium">
                    Linked Progress Report
                  </label>
                  <select
                    value={linkedProgressReportId}
                    onChange={(e) => setLinkedProgressReportId(e.target.value)}
                    className="w-full px-3 py-2.5 bg-bg-input border border-border rounded-lg text-sm text-txt outline-none focus:border-accent transition-colors"
                  >
                    <option value="">Latest progress report</option>
                    {projectProgressReports.map((report) => (
                      <option key={report.id} value={report.id}>
                        {report.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-txt-dim mb-1.5 font-medium">
                    Linked Certificate
                  </label>
                  <select
                    value={linkedCertificateId}
                    onChange={(e) => setLinkedCertificateId(e.target.value)}
                    className="w-full px-3 py-2.5 bg-bg-input border border-border rounded-lg text-sm text-txt outline-none focus:border-accent transition-colors"
                  >
                    <option value="">Latest certificate</option>
                    {projectCertificates.map((certificate) => (
                      <option key={certificate.id} value={certificate.id}>
                        {certificate.type === "final" ? "FPC" : "IPC"} {certificate.number.toString().padStart(2, "0")}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>
          <div className="flex gap-3 mt-5 pt-4 border-t border-border">
            <Button variant="ghost" onClick={() => setShowCreate(false)} className="flex-1 justify-center">
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                const linkedProgressReport =
                  projectProgressReports.find((report) => report.id === linkedProgressReportId) || latestProgress;
                const linkedPaymentCertificate =
                  projectCertificates.find((certificate) => certificate.id === linkedCertificateId) || latestCertificate;
                const now = new Date().toISOString();
                const date = now.split("T")[0];
                const defaults = createDocumentDefaults({
                  templateType,
                  project,
                  progressReport: linkedProgressReport,
                  certificate: linkedPaymentCertificate,
                });
                const referenceBase = (project?.contractNumber || project?.code || "PB").toUpperCase();

                const doc: GeneratedDocument = {
                  id: uuid(),
                  project_id: project?.id || "",
                  title: title || templateLabelFor(templateType, project),
                  templateType,
                  referenceNo: `${referenceBase}/${date.replace(/-/g, "/")}/${projectDocuments.length + 1}`,
                  date,
                  status: "draft",
                  ...defaults,
                  signatorySignatureSource: userSignatureProfile?.imageDataUrl ? "saved" : "none",
                  recipientSignatureSource: "none",
                  linkedProgressReportId: linkedProgressReport?.id,
                  linkedCertificateId: linkedPaymentCertificate?.id,
                  createdAt: now,
                  updatedAt: now,
                };
                addGeneratedDocument(doc);
                setShowCreate(false);
                setActiveDocumentId(doc.id);
                setIsEditMode(true);
              }}
              className="flex-1 justify-center"
            >
              Generate Document
            </Button>
          </div>
        </Modal>
      </div>
    );
  }

  const isProgressReport = activeDocument?.templateType === "progress-report";
  const activePreset = activeDocument ? activeReportPreset(activeDocument) : null;

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Button size="sm" variant="ghost" onClick={() => { setActiveDocumentId(null); setIsEditMode(false); }}>
            <ArrowLeft size={14} /> Back
          </Button>
          <div className="h-5 w-px bg-border" />
          <div>
            <h2 className="text-lg font-semibold">{activeDocument.title}</h2>
            <p className="text-xs text-txt-muted mt-0.5">
              {templateLabelFor(activeDocument.templateType, project)} • {activeDocument.referenceNo}
            </p>
          </div>
          <Badge color={activeDocument.status === "approved" ? "ok" : activeDocument.status === "issued" ? "accent" : "warn"}>
            {activeDocument.status.toUpperCase()}
          </Badge>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="default"
              onClick={() => openDocumentPdf(activeDocument, project, linkedProgress, linkedCertificate, userSignatureProfile, savedWorkPlans, certificates, meetingMinutes, risks, siteNotes, correspondenceRecords, qualityControlRecords)}
          >
            <Printer size={14} /> Print / Save PDF
          </Button>
          {isEditMode ? (
            <Button size="sm" variant="primary" onClick={() => setIsEditMode(false)}>
              Done
            </Button>
          ) : (
            <Button size="sm" variant="primary" onClick={() => setIsEditMode(true)}>
              <Pencil size={14} /> Edit
            </Button>
          )}
        </div>
      </div>

      <div className="hidden sm:grid grid-cols-4 gap-3 mb-5">
        <div className="bg-bg-surface border border-border rounded-xl p-4">
          <div className="text-[10px] uppercase tracking-wider text-txt-dim mb-2">Layout</div>
          <div className="text-sm font-semibold">{(activeDocument.layoutStyle || "letter").toUpperCase()}</div>
        </div>
        <div className="bg-bg-surface border border-border rounded-xl p-4">
          <div className="text-[10px] uppercase tracking-wider text-txt-dim mb-2">Document Date</div>
          <div className="text-sm font-semibold">{activeDocument.date}</div>
        </div>
        <div className="bg-bg-surface border border-border rounded-xl p-4">
          <div className="text-[10px] uppercase tracking-wider text-txt-dim mb-2">Reference</div>
          <div className="text-sm font-semibold">{activeDocument.referenceNo}</div>
        </div>
        <div className="bg-bg-surface border border-border rounded-xl p-4">
          <div className="text-[10px] uppercase tracking-wider text-txt-dim mb-2">Output</div>
          <div className="text-sm font-semibold">Print-ready PDF layout</div>
        </div>
      </div>

      <div className="space-y-4">
        {isProgressReport && (
          <div className="rounded-2xl border border-border bg-bg-surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">Report preset</div>
                <div className="mt-1 truncate text-[12px] text-txt-muted">
                  {PROGRESS_REPORT_SECTION_META.filter((section) => resolveReportSections(activeDocument)[section.id])
                    .map((section) => section.label)
                    .join(" · ") || "No sections selected"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowReportAdvanced((value) => !value)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-bg-input px-3 py-1.5 text-[12px] font-medium text-txt-muted transition hover:border-accent/40 hover:text-txt"
              >
                {showReportAdvanced ? <ChevronUp size={14} /> : <SlidersHorizontal size={14} />}
                {showReportAdvanced ? "Hide advanced" : "Advanced"}
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {REPORT_PRESET_ORDER.map((id) => {
                const preset = PROGRESS_REPORT_PRESETS[id];
                const active = activePreset === id;
                return (
                  <button
                    key={id}
                    type="button"
                    disabled={!isEditMode}
                    onClick={() =>
                      updateGeneratedDocument(activeDocument.id, {
                        reportSections: { ...preset.sections },
                        reportItemFormat: preset.itemFormat,
                        reportWorkPlanFormat: preset.workPlanFormat,
                      })
                    }
                    className={`min-w-[140px] flex-1 rounded-xl border px-3 py-2 text-left transition ${
                      active ? "border-accent bg-accent/10" : "border-border bg-bg-input hover:border-accent/40"
                    } ${!isEditMode ? "cursor-default opacity-70" : "cursor-pointer"}`}
                  >
                    <div className="flex items-center gap-1.5 text-[13px] font-semibold text-txt">
                      {active ? <Check size={13} className="text-accent" /> : null}
                      {preset.label}
                    </div>
                    <div className="mt-0.5 text-[11px] leading-snug text-txt-muted">{preset.hint}</div>
                  </button>
                );
              })}
              {activePreset === null ? (
                <span className="inline-flex items-center rounded-xl border border-dashed border-border px-3 py-2 text-[12px] font-medium text-txt-dim">
                  Custom selection
                </span>
              ) : null}
            </div>
          </div>
        )}

        {(!isProgressReport || showReportAdvanced) && (
        <div className="rounded-2xl border border-border bg-bg-surface p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">Branding Source</div>
              <div className="mt-2 text-sm font-semibold text-txt">
                {brandingSource === "project" ? "Project branding" : "Document override"}
              </div>
            </div>
            {isEditMode ? (
              brandingSource === "project" ? (
                <Button size="sm" variant="ghost" onClick={() => setBrandingMode("custom")}>
                  Override branding
                </Button>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => setBrandingMode("project")}>
                  Reset to project branding
                </Button>
              )
            ) : null}
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-[88px_1fr_1fr]">
            <div className="flex h-[88px] w-[88px] items-center justify-center overflow-hidden rounded-xl border border-border bg-bg-input">
              {activeDocument.brandLogoDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={activeDocument.brandLogoDataUrl} alt="Brand logo" className="h-full w-full object-cover" />
              ) : (
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">
                  {documentInitials(activeDocument)}
                </span>
              )}
            </div>
            <div className="rounded-xl border border-border bg-bg-input/40 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">Resolved Header</div>
              <div className="mt-2 text-base font-semibold text-txt">{activeDocument.letterheadTitle}</div>
              <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
                {activeDocument.letterheadSubtitle}
              </div>
              <div className="mt-3 whitespace-pre-line text-sm leading-6 text-txt-muted">
                {activeDocument.letterheadAddress}
              </div>
            </div>
            <div className="rounded-xl border border-border bg-bg-input/40 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">Project Branding</div>
              <div className="mt-2 text-sm font-semibold text-txt">{branding.issuerDisplayName}</div>
              <div className="mt-1 text-sm text-txt-muted">{branding.clientDisplayName}</div>
              <div className="mt-3 whitespace-pre-line text-xs leading-6 text-txt-dim">
                {[branding.issuerAddress, branding.clientAddress].filter(Boolean).join("\n\n")}
              </div>
            </div>
          </div>
        </div>
        )}

        {(!isProgressReport || showReportAdvanced) && (
        <div className="rounded-2xl border border-border bg-bg-surface p-4">
          <div className="mb-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">
            Header and Recipient
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-txt-dim">Title</label>
              <input
                value={activeDocument.title}
                disabled={!isEditMode}
                onChange={(e) => updateGeneratedDocument(activeDocument.id, { title: e.target.value })}
                className="w-full rounded-lg border border-border bg-bg-input px-3 py-2.5 text-sm text-txt outline-none transition-colors focus:border-accent disabled:opacity-70"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-txt-dim">Date</label>
              <input
                type="date"
                value={activeDocument.date}
                disabled={!isEditMode}
                onChange={(e) => updateGeneratedDocument(activeDocument.id, { date: e.target.value })}
                className="w-full rounded-lg border border-border bg-bg-input px-3 py-2.5 text-sm text-txt outline-none transition-colors focus:border-accent disabled:opacity-70"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-txt-dim">Status</label>
              <select
                value={activeDocument.status}
                disabled={!isEditMode}
                onChange={(e) => updateGeneratedDocument(activeDocument.id, { status: e.target.value as GeneratedDocument["status"] })}
                className="w-full rounded-lg border border-border bg-bg-input px-3 py-2.5 text-sm text-txt outline-none transition-colors focus:border-accent disabled:opacity-70"
              >
                <option value="draft">Draft</option>
                <option value="issued">Issued</option>
                <option value="approved">Approved</option>
              </select>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-txt-dim">Header Title</label>
              <input
                value={activeDocument.letterheadTitle || ""}
                disabled={!isEditMode || brandingSource === "project"}
                onChange={(e) => updateGeneratedDocument(activeDocument.id, { letterheadTitle: e.target.value, brandingMode: "custom" })}
                className="w-full rounded-lg border border-border bg-bg-input px-3 py-2.5 text-sm text-txt outline-none transition-colors focus:border-accent disabled:opacity-70"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-txt-dim">Header Subtitle</label>
              <input
                value={activeDocument.letterheadSubtitle || ""}
                disabled={!isEditMode || brandingSource === "project"}
                onChange={(e) => updateGeneratedDocument(activeDocument.id, { letterheadSubtitle: e.target.value, brandingMode: "custom" })}
                className="w-full rounded-lg border border-border bg-bg-input px-3 py-2.5 text-sm text-txt outline-none transition-colors focus:border-accent disabled:opacity-70"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-txt-dim">Header Address</label>
              <input
                value={activeDocument.letterheadAddress || ""}
                disabled={!isEditMode || brandingSource === "project"}
                onChange={(e) => updateGeneratedDocument(activeDocument.id, { letterheadAddress: e.target.value, brandingMode: "custom" })}
                className="w-full rounded-lg border border-border bg-bg-input px-3 py-2.5 text-sm text-txt outline-none transition-colors focus:border-accent disabled:opacity-70"
              />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-txt-dim">Recipient Name</label>
              <input
                value={activeDocument.recipientName || ""}
                disabled={!isEditMode}
                onChange={(e) => updateGeneratedDocument(activeDocument.id, { recipientName: e.target.value })}
                className="w-full rounded-lg border border-border bg-bg-input px-3 py-2.5 text-sm text-txt outline-none transition-colors focus:border-accent disabled:opacity-70"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-txt-dim">Recipient Role</label>
              <input
                value={activeDocument.recipientRole || ""}
                disabled={!isEditMode}
                onChange={(e) => updateGeneratedDocument(activeDocument.id, { recipientRole: e.target.value })}
                className="w-full rounded-lg border border-border bg-bg-input px-3 py-2.5 text-sm text-txt outline-none transition-colors focus:border-accent disabled:opacity-70"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-txt-dim">Signatory Name</label>
              <input
                value={activeDocument.signatoryName || ""}
                disabled={!isEditMode}
                onChange={(e) => updateGeneratedDocument(activeDocument.id, { signatoryName: e.target.value })}
                className="w-full rounded-lg border border-border bg-bg-input px-3 py-2.5 text-sm text-txt outline-none transition-colors focus:border-accent disabled:opacity-70"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-txt-dim">Signatory Role</label>
              <input
                value={activeDocument.signatoryRole || ""}
                disabled={!isEditMode}
                onChange={(e) => updateGeneratedDocument(activeDocument.id, { signatoryRole: e.target.value })}
                className="w-full rounded-lg border border-border bg-bg-input px-3 py-2.5 text-sm text-txt outline-none transition-colors focus:border-accent disabled:opacity-70"
              />
            </div>
          </div>
        </div>
        )}

        <div className={`grid gap-4 ${!isProgressReport || showReportAdvanced ? "xl:grid-cols-[1fr_1fr]" : ""}`}>
          {(!isProgressReport || showReportAdvanced) && (
          <div className="rounded-2xl border border-border bg-bg-surface p-4">
            <div className="mb-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">Print Assets</div>
            <div className={`grid gap-3 ${activeDocument.layoutStyle === "report" ? "xl:grid-cols-3" : "xl:grid-cols-2"}`}>
              <div className="rounded-xl border border-border bg-bg-input/40 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-medium uppercase tracking-wider text-txt-dim">Letterhead Logo</div>
                  </div>
                  {activeDocument.brandLogoDataUrl && isEditMode && brandingSource === "custom" ? (
                    <button
                      type="button"
                      onClick={() => updateGeneratedDocument(activeDocument.id, { brandLogoDataUrl: "", brandingMode: "custom" })}
                      className="cursor-pointer rounded-md border-none bg-transparent p-1.5 text-txt-dim transition-colors hover:bg-err/10 hover:text-err"
                      title="Remove logo"
                    >
                      <X size={14} />
                    </button>
                  ) : null}
                </div>
                <div className="mt-4 flex h-28 items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-bg-surface">
                  {activeDocument.brandLogoDataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={activeDocument.brandLogoDataUrl} alt="Letterhead logo" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-txt-dim">
                      <ImagePlus size={18} />
                      <span className="text-xs">No logo uploaded</span>
                    </div>
                  )}
                </div>
                {isEditMode && brandingSource === "custom" ? (
                  <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-bg-surface px-3 py-2 text-sm transition-colors hover:border-accent/50">
                    <ImagePlus size={14} />
                    Upload Logo
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        await uploadDocumentAsset("brandLogoDataUrl", e.target.files?.[0]);
                        e.target.value = "";
                      }}
                    />
                  </label>
                ) : null}
              </div>

              <div className="rounded-xl border border-border bg-bg-input/40 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-medium uppercase tracking-wider text-txt-dim">My Saved Signature</div>
                  </div>
                  {userSignatureProfile?.imageDataUrl && isEditMode ? (
                    <button
                      type="button"
                      onClick={() => void persistSignatureProfile(null)}
                      className="cursor-pointer rounded-md border-none bg-transparent p-1.5 text-txt-dim transition-colors hover:bg-err/10 hover:text-err"
                      title="Remove saved signature"
                    >
                      <X size={14} />
                    </button>
                  ) : null}
                </div>
                <div className="mt-4 flex h-28 items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-bg-surface">
                  {userSignatureProfile?.imageDataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={userSignatureProfile.imageDataUrl} alt="Saved signature" className="h-full w-full object-contain p-3" />
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-txt-dim">
                      <Pencil size={18} />
                      <span className="text-xs">No signature saved</span>
                    </div>
                  )}
                </div>
                {isEditMode ? (
                  <div className="mt-4 space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        value={userSignatureProfile?.displayName || ""}
                        onChange={(e) =>
                          userSignatureProfile?.imageDataUrl
                            ? void persistSignatureProfile({
                                ...userSignatureProfile,
                                displayName: e.target.value,
                                updatedAt: new Date().toISOString(),
                              })
                            : undefined
                        }
                        placeholder="Signature name"
                        className="w-full rounded-lg border border-border bg-bg-surface px-3 py-2 text-xs text-txt outline-none transition-colors focus:border-accent"
                      />
                      <input
                        value={userSignatureProfile?.roleTitle || ""}
                        onChange={(e) =>
                          userSignatureProfile?.imageDataUrl
                            ? void persistSignatureProfile({
                                ...userSignatureProfile,
                                roleTitle: e.target.value,
                                updatedAt: new Date().toISOString(),
                              })
                            : undefined
                        }
                        placeholder="Title / role"
                        className="w-full rounded-lg border border-border bg-bg-surface px-3 py-2 text-xs text-txt outline-none transition-colors focus:border-accent"
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-bg-surface px-3 py-2 text-sm transition-colors hover:border-accent/50">
                        <ImagePlus size={14} />
                        Upload Signature
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={async (e) => {
                            await uploadSavedSignature(e.target.files?.[0]);
                            e.target.value = "";
                          }}
                        />
                      </label>
                      <Button
                        variant={activeDocument.signatorySignatureSource === "saved" ? "primary" : "ghost"}
                        size="sm"
                        disabled={!userSignatureProfile?.imageDataUrl}
                        onClick={() =>
                          updateGeneratedDocument(activeDocument.id, {
                            signatorySignatureSource:
                              activeDocument.signatorySignatureSource === "saved" ? "none" : "saved",
                          })
                        }
                      >
                        {activeDocument.signatorySignatureSource === "saved" ? "Signatory linked" : "Use for signatory"}
                      </Button>
                      <Button
                        variant={activeDocument.recipientSignatureSource === "saved" ? "primary" : "ghost"}
                        size="sm"
                        disabled={!userSignatureProfile?.imageDataUrl}
                        onClick={() =>
                          updateGeneratedDocument(activeDocument.id, {
                            recipientSignatureSource:
                              activeDocument.recipientSignatureSource === "saved" ? "none" : "saved",
                          })
                        }
                      >
                        {activeDocument.recipientSignatureSource === "saved" ? "Recipient linked" : "Use for recipient"}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>

              {activeDocument.layoutStyle === "report" ? (
                <div className="rounded-xl border border-border bg-bg-input/40 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-medium uppercase tracking-wider text-txt-dim">Cover Artwork</div>
                    </div>
                    {activeDocument.coverImageDataUrl && isEditMode ? (
                      <button
                        type="button"
                        onClick={() => updateGeneratedDocument(activeDocument.id, { coverImageDataUrl: "" })}
                        className="cursor-pointer rounded-md border-none bg-transparent p-1.5 text-txt-dim transition-colors hover:bg-err/10 hover:text-err"
                        title="Remove cover image"
                      >
                        <X size={14} />
                      </button>
                    ) : null}
                  </div>
                  <div className="mt-4 flex h-28 items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-bg-surface">
                    {activeDocument.coverImageDataUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={activeDocument.coverImageDataUrl} alt="Cover artwork" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-txt-dim">
                        <ImagePlus size={18} />
                        <span className="text-xs">Gradient cover will be used</span>
                      </div>
                    )}
                  </div>
                  {isEditMode ? (
                    <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-bg-surface px-3 py-2 text-sm transition-colors hover:border-accent/50">
                      <ImagePlus size={14} />
                      Upload Cover
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          await uploadDocumentAsset("coverImageDataUrl", e.target.files?.[0]);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  ) : null}
                </div>
              ) : null}
            </div>

            {activeDocument.layoutStyle === "report" ? (
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-txt-dim">Cover Title</label>
                  <input
                    value={activeDocument.coverTitle || ""}
                    disabled={!isEditMode}
                    onChange={(e) => updateGeneratedDocument(activeDocument.id, { coverTitle: e.target.value })}
                    className="w-full rounded-lg border border-border bg-bg-input px-3 py-2.5 text-sm text-txt outline-none transition-colors focus:border-accent disabled:opacity-70"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-txt-dim">Cover Subtitle</label>
                  <input
                    value={activeDocument.coverSubtitle || ""}
                    disabled={!isEditMode}
                    onChange={(e) => updateGeneratedDocument(activeDocument.id, { coverSubtitle: e.target.value })}
                    className="w-full rounded-lg border border-border bg-bg-input px-3 py-2.5 text-sm text-txt outline-none transition-colors focus:border-accent disabled:opacity-70"
                  />
                </div>
              </div>
            ) : null}
          </div>
          )}

          {isProgressReport && showReportAdvanced ? (
            <div className="rounded-2xl border border-border bg-bg-surface p-4">
              <div className="mb-4 flex items-center justify-between">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">
                  Progress report sections
                </div>
                <div className="text-[11px] text-txt-muted">Toggle what gets exported</div>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {PROGRESS_REPORT_SECTION_META.map((section) => {
                  const enabled =
                    resolveReportSections(activeDocument)[section.id] ?? false;
                  return (
                    <label
                      key={section.id}
                      className={`flex cursor-pointer items-start gap-2.5 rounded-lg border bg-bg-input px-3 py-2 transition ${
                        enabled ? "border-accent/40" : "border-border"
                      } ${!isEditMode ? "cursor-default opacity-70" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={enabled}
                        disabled={!isEditMode}
                        onChange={(e) =>
                          updateGeneratedDocument(activeDocument.id, {
                            reportSections: {
                              ...resolveReportSections(activeDocument),
                              [section.id]: e.target.checked,
                            },
                          })
                        }
                        className="mt-0.5 h-4 w-4 cursor-pointer accent-accent"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-medium text-txt">{section.label}</div>
                        <div className="mt-0.5 text-[11px] leading-snug text-txt-muted">
                          {section.description}
                        </div>
                        {section.id === "itemTable" && enabled ? (
                          <div className="mt-2 flex items-center gap-2 text-[11px] text-txt-muted">
                            <span>Format:</span>
                            {(["table", "bars"] as const).map((fmt) => {
                              const current = activeDocument.reportItemFormat || "table";
                              return (
                                <button
                                  key={fmt}
                                  type="button"
                                  disabled={!isEditMode}
                                  onClick={(event) => {
                                    event.preventDefault();
                                    updateGeneratedDocument(activeDocument.id, {
                                      reportItemFormat: fmt,
                                    });
                                  }}
                                  className={`rounded border px-2 py-0.5 text-[11px] font-medium transition ${
                                    current === fmt
                                      ? "border-accent bg-accent/15 text-accent"
                                      : "border-border bg-bg-surface text-txt-muted hover:border-accent/30"
                                  } ${!isEditMode ? "cursor-default opacity-70" : "cursor-pointer"}`}
                                >
                                  {fmt === "table" ? "Table" : "Bars"}
                                </button>
                              );
                            })}
                          </div>
                        ) : null}
                        {section.id === "workPlan" && enabled ? (
                          <>
                            <div className="mt-2 flex items-center gap-2 text-[11px] text-txt-muted">
                              <span>Format:</span>
                              {(["table", "gantt"] as const).map((fmt) => {
                                const current = activeDocument.reportWorkPlanFormat || "table";
                                return (
                                  <button
                                    key={fmt}
                                    type="button"
                                    disabled={!isEditMode}
                                    onClick={(event) => {
                                      event.preventDefault();
                                      updateGeneratedDocument(activeDocument.id, {
                                        reportWorkPlanFormat: fmt,
                                      });
                                    }}
                                    className={`rounded border px-2 py-0.5 text-[11px] font-medium transition ${
                                      current === fmt
                                        ? "border-accent bg-accent/15 text-accent"
                                        : "border-border bg-bg-surface text-txt-muted hover:border-accent/30"
                                    } ${!isEditMode ? "cursor-default opacity-70" : "cursor-pointer"}`}
                                  >
                                    {fmt === "table" ? "Table" : "Gantt"}
                                  </button>
                                );
                              })}
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-txt-muted">
                              <span>Window:</span>
                              <input
                                type="date"
                                value={activeDocument.reportWorkPlanStart || ""}
                                disabled={!isEditMode}
                                onClick={(event) => event.stopPropagation()}
                                onChange={(e) =>
                                  updateGeneratedDocument(activeDocument.id, {
                                    reportWorkPlanStart: e.target.value,
                                  })
                                }
                                className="rounded border border-border bg-bg-surface px-1.5 py-0.5 text-[11px] text-txt outline-none focus:border-accent [color-scheme:light] disabled:opacity-70"
                                aria-label="Work plan window start"
                              />
                              <span>→</span>
                              <input
                                type="date"
                                value={activeDocument.reportWorkPlanEnd || ""}
                                disabled={!isEditMode}
                                onClick={(event) => event.stopPropagation()}
                                onChange={(e) =>
                                  updateGeneratedDocument(activeDocument.id, {
                                    reportWorkPlanEnd: e.target.value,
                                  })
                                }
                                className="rounded border border-border bg-bg-surface px-1.5 py-0.5 text-[11px] text-txt outline-none focus:border-accent [color-scheme:light] disabled:opacity-70"
                                aria-label="Work plan window end"
                              />
                              {isEditMode && (activeDocument.reportWorkPlanStart || activeDocument.reportWorkPlanEnd) ? (
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.preventDefault();
                                    updateGeneratedDocument(activeDocument.id, {
                                      reportWorkPlanStart: "",
                                      reportWorkPlanEnd: "",
                                    });
                                  }}
                                  className="cursor-pointer rounded border border-border bg-bg-surface px-2 py-0.5 text-[11px] font-medium text-txt-muted transition hover:border-err/40 hover:text-err"
                                >
                                  Clear
                                </button>
                              ) : null}
                            </div>
                            <div className="mt-1 text-[10px] leading-snug text-txt-dim">
                              Only activities overlapping the window are included — leave empty for the full plan.
                            </div>
                          </>
                        ) : null}
                      </div>
                    </label>
                  );
                })}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div>
                  <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-txt-dim">Report #</label>
                  <input
                    value={activeDocument.reportNumber || ""}
                    disabled={!isEditMode}
                    onChange={(e) =>
                      updateGeneratedDocument(activeDocument.id, { reportNumber: e.target.value })
                    }
                    className="w-full rounded-lg border border-border bg-bg-input px-3 py-2 text-sm text-txt outline-none focus:border-accent disabled:opacity-70"
                    placeholder="e.g. 04"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-txt-dim">Revision</label>
                  <input
                    value={activeDocument.reportRevision || ""}
                    disabled={!isEditMode}
                    onChange={(e) =>
                      updateGeneratedDocument(activeDocument.id, { reportRevision: e.target.value })
                    }
                    className="w-full rounded-lg border border-border bg-bg-input px-3 py-2 text-sm text-txt outline-none focus:border-accent disabled:opacity-70"
                    placeholder="e.g. A"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-txt-dim">Period from</label>
                  <input
                    type="date"
                    value={activeDocument.reportPeriodStart || ""}
                    disabled={!isEditMode}
                    onChange={(e) =>
                      updateGeneratedDocument(activeDocument.id, { reportPeriodStart: e.target.value })
                    }
                    className="w-full rounded-lg border border-border bg-bg-input px-3 py-2 text-sm text-txt outline-none focus:border-accent [color-scheme:light] disabled:opacity-70"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-txt-dim">Period to</label>
                  <input
                    type="date"
                    value={activeDocument.reportPeriodEnd || ""}
                    disabled={!isEditMode}
                    onChange={(e) =>
                      updateGeneratedDocument(activeDocument.id, { reportPeriodEnd: e.target.value })
                    }
                    className="w-full rounded-lg border border-border bg-bg-input px-3 py-2 text-sm text-txt outline-none focus:border-accent [color-scheme:light] disabled:opacity-70"
                  />
                </div>
              </div>

              <div className="mt-4 grid gap-3">
                <div>
                  <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-txt-dim">
                    Executive summary
                  </label>
                  <textarea
                    value={activeDocument.executiveSummary || ""}
                    disabled={!isEditMode}
                    onChange={(e) =>
                      updateGeneratedDocument(activeDocument.id, { executiveSummary: e.target.value })
                    }
                    rows={4}
                    className="w-full resize-y rounded-lg border border-border bg-bg-input px-3 py-2 text-sm text-txt outline-none focus:border-accent disabled:opacity-70"
                    placeholder="Narrative overview of the reporting period."
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-txt-dim">
                    Forecast &amp; recovery
                  </label>
                  <textarea
                    value={activeDocument.forecastNarrative || ""}
                    disabled={!isEditMode}
                    onChange={(e) =>
                      updateGeneratedDocument(activeDocument.id, { forecastNarrative: e.target.value })
                    }
                    rows={3}
                    className="w-full resize-y rounded-lg border border-border bg-bg-input px-3 py-2 text-sm text-txt outline-none focus:border-accent disabled:opacity-70"
                    placeholder="Next period focus, recovery actions, upcoming milestones."
                  />
                </div>
              </div>
            </div>
          ) : null}

          {isProgressReport && showReportAdvanced ? (
            <div className="rounded-2xl border border-border bg-bg-surface p-4">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">Photo gallery</div>
                  <div className="mt-1 text-[11px] text-txt-muted">
                    Two per row, printed on their own page. Enable the &ldquo;Photo gallery&rdquo; section to include them.
                  </div>
                </div>
                {isEditMode ? (
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-bg-input px-3 py-2 text-sm transition hover:border-accent/50">
                    <ImagePlus size={14} /> Add photos
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={async (e) => {
                        await addReportPhotos(e.target.files);
                        e.target.value = "";
                      }}
                    />
                  </label>
                ) : null}
              </div>
              {(activeDocument.reportPhotos || []).length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-bg-input/40 p-6 text-center text-[12px] text-txt-muted">
                  No photos yet.{isEditMode ? " Use “Add photos” to upload site images." : ""}
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {[...(activeDocument.reportPhotos || [])]
                    .sort((a, b) => a.sortOrder - b.sortOrder)
                    .map((photo, index, arr) => (
                      <div key={photo.id} className="overflow-hidden rounded-xl border border-border bg-bg-input/40">
                        <div className="relative h-36 w-full overflow-hidden bg-bg">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={photo.dataUrl} alt={photo.caption || "Progress photo"} className="h-full w-full object-cover" />
                          {isEditMode ? (
                            <button
                              type="button"
                              onClick={() => removeReportPhoto(photo.id)}
                              className="absolute right-1.5 top-1.5 cursor-pointer rounded-md border-none bg-black/50 p-1 text-white transition hover:bg-err"
                              title="Remove photo"
                            >
                              <X size={13} />
                            </button>
                          ) : null}
                        </div>
                        <div className="space-y-2 p-2.5">
                          <input
                            value={photo.caption}
                            disabled={!isEditMode}
                            onChange={(e) => setReportPhotoCaption(photo.id, e.target.value)}
                            placeholder="Caption"
                            className="w-full rounded-md border border-border bg-bg-surface px-2 py-1.5 text-xs text-txt outline-none focus:border-accent disabled:opacity-70"
                          />
                          {isEditMode ? (
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-txt-dim">Photo {index + 1}</span>
                              <div className="flex gap-1">
                                <button
                                  type="button"
                                  disabled={index === 0}
                                  onClick={() => moveReportPhoto(photo.id, -1)}
                                  className="cursor-pointer rounded border border-border bg-bg-surface px-1.5 py-0.5 text-[11px] text-txt-muted transition hover:border-accent/40 hover:text-txt disabled:cursor-default disabled:opacity-40"
                                  title="Move up"
                                >
                                  ↑
                                </button>
                                <button
                                  type="button"
                                  disabled={index === arr.length - 1}
                                  onClick={() => moveReportPhoto(photo.id, 1)}
                                  className="cursor-pointer rounded border border-border bg-bg-surface px-1.5 py-0.5 text-[11px] text-txt-muted transition hover:border-accent/40 hover:text-txt disabled:cursor-default disabled:opacity-40"
                                  title="Move down"
                                >
                                  ↓
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          ) : null}

          {activeDocument.templateType === "milestone-invoice" ? (
            <div className="rounded-2xl border border-border bg-bg-surface p-4">
              <div className="mb-4 flex items-center justify-between">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">
                  Invoice line items
                </div>
                {isEditMode ? (
                  <Button
                    size="sm"
                    onClick={() => {
                      const next = [
                        ...(activeDocument.invoiceLines || []),
                        { id: uuid(), description: "", unit: "", qty: "1", rate: "0" },
                      ];
                      updateGeneratedDocument(activeDocument.id, { invoiceLines: next });
                    }}
                  >
                    <Plus size={14} /> Add line
                  </Button>
                ) : null}
              </div>

              <div className="data-table-shell overflow-auto">
                <table className="data-table" style={{ minWidth: 600 }}>
                  <thead>
                    <tr>
                      <th style={{ width: 36 }}>#</th>
                      <th>Description</th>
                      <th style={{ width: 80 }}>Unit</th>
                      <th className="text-right" style={{ width: 80 }}>Qty</th>
                      <th className="text-right" style={{ width: 110 }}>Rate</th>
                      <th className="text-right" style={{ width: 130 }}>Amount</th>
                      {isEditMode ? <th style={{ width: 36 }}></th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {(activeDocument.invoiceLines || []).map((line, idx) => {
                      const q = parseFloat(line.qty || "0") || 0;
                      const r = parseFloat(line.rate || "0") || 0;
                      const amt = q * r;
                      return (
                        <tr key={line.id}>
                          <td className="data-cell-num">{idx + 1}</td>
                          <td>
                            {isEditMode ? (
                              <input
                                className="data-cell-input"
                                value={line.description}
                                onChange={(e) => {
                                  const next = (activeDocument.invoiceLines || []).map((l) =>
                                    l.id === line.id ? { ...l, description: e.target.value } : l,
                                  );
                                  updateGeneratedDocument(activeDocument.id, { invoiceLines: next });
                                }}
                                placeholder="Milestone or deliverable"
                              />
                            ) : (
                              <span>{line.description || "—"}</span>
                            )}
                          </td>
                          <td>
                            {isEditMode ? (
                              <input
                                className="data-cell-input"
                                value={line.unit || ""}
                                onChange={(e) => {
                                  const next = (activeDocument.invoiceLines || []).map((l) =>
                                    l.id === line.id ? { ...l, unit: e.target.value } : l,
                                  );
                                  updateGeneratedDocument(activeDocument.id, { invoiceLines: next });
                                }}
                                placeholder="ea"
                              />
                            ) : (
                              <span>{line.unit || "—"}</span>
                            )}
                          </td>
                          <td className="data-cell-num">
                            {isEditMode ? (
                              <input
                                className="data-cell-input text-right font-mono"
                                value={line.qty}
                                onChange={(e) => {
                                  const next = (activeDocument.invoiceLines || []).map((l) =>
                                    l.id === line.id ? { ...l, qty: e.target.value } : l,
                                  );
                                  updateGeneratedDocument(activeDocument.id, { invoiceLines: next });
                                }}
                                inputMode="decimal"
                              />
                            ) : (
                              <span className="font-mono">{line.qty}</span>
                            )}
                          </td>
                          <td className="data-cell-num">
                            {isEditMode ? (
                              <input
                                className="data-cell-input text-right font-mono"
                                value={line.rate}
                                onChange={(e) => {
                                  const next = (activeDocument.invoiceLines || []).map((l) =>
                                    l.id === line.id ? { ...l, rate: e.target.value } : l,
                                  );
                                  updateGeneratedDocument(activeDocument.id, { invoiceLines: next });
                                }}
                                inputMode="decimal"
                              />
                            ) : (
                              <span className="font-mono">{line.rate}</span>
                            )}
                          </td>
                          <td className="data-cell-num font-mono">
                            {amt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          {isEditMode ? (
                            <td className="text-center">
                              <button
                                type="button"
                                className="p-1 text-txt-dim transition hover:text-err"
                                onClick={() => {
                                  const next = (activeDocument.invoiceLines || []).filter((l) => l.id !== line.id);
                                  updateGeneratedDocument(activeDocument.id, { invoiceLines: next });
                                }}
                                title="Remove line"
                              >
                                <Trash2 size={14} />
                              </button>
                            </td>
                          ) : null}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div>
                  <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-txt-dim">Due date</label>
                  <input
                    type="date"
                    value={activeDocument.invoiceDueDate || ""}
                    disabled={!isEditMode}
                    onChange={(e) =>
                      updateGeneratedDocument(activeDocument.id, { invoiceDueDate: e.target.value })
                    }
                    className="w-full rounded-lg border border-border bg-bg-input px-3 py-2 text-sm text-txt outline-none focus:border-accent [color-scheme:light] disabled:opacity-70"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-txt-dim">Discount %</label>
                  <input
                    inputMode="decimal"
                    value={activeDocument.invoiceDiscountPercent || ""}
                    disabled={!isEditMode}
                    onChange={(e) =>
                      updateGeneratedDocument(activeDocument.id, { invoiceDiscountPercent: e.target.value })
                    }
                    className="w-full rounded-lg border border-border bg-bg-input px-3 py-2 text-sm text-txt outline-none focus:border-accent disabled:opacity-70"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-txt-dim">Tax %</label>
                  <input
                    inputMode="decimal"
                    value={activeDocument.invoiceTaxPercent || ""}
                    disabled={!isEditMode}
                    onChange={(e) =>
                      updateGeneratedDocument(activeDocument.id, { invoiceTaxPercent: e.target.value })
                    }
                    className="w-full rounded-lg border border-border bg-bg-input px-3 py-2 text-sm text-txt outline-none focus:border-accent disabled:opacity-70"
                    placeholder="0"
                  />
                </div>
                <div className="flex items-end justify-end text-right">
                  <div>
                    <div className="text-[11px] font-medium uppercase tracking-wider text-txt-dim">Total due</div>
                    <div className="mt-1 font-mono text-lg font-semibold text-ok">
                      {(() => {
                        const lines = activeDocument.invoiceLines || [];
                        const sub = lines.reduce((s, l) => {
                          const q = parseFloat(l.qty || "0") || 0;
                          const r = parseFloat(l.rate || "0") || 0;
                          return s + q * r;
                        }, 0);
                        const disc = (sub * (parseFloat(activeDocument.invoiceDiscountPercent || "0") || 0)) / 100;
                        const tax = ((sub - disc) * (parseFloat(activeDocument.invoiceTaxPercent || "0") || 0)) / 100;
                        const total = sub - disc + tax;
                        return `${project?.currency || "USD"} ${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                      })()}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-txt-dim">Payment terms</label>
                  <textarea
                    value={activeDocument.invoicePaymentTerms || ""}
                    disabled={!isEditMode}
                    onChange={(e) =>
                      updateGeneratedDocument(activeDocument.id, { invoicePaymentTerms: e.target.value })
                    }
                    rows={3}
                    className="w-full resize-y rounded-lg border border-border bg-bg-input px-3 py-2 text-sm text-txt outline-none focus:border-accent disabled:opacity-70"
                    placeholder="e.g. Payment due within 30 days of invoice date."
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-txt-dim">Payment into (bank details)</label>
                  <textarea
                    value={activeDocument.invoiceBankDetails || ""}
                    disabled={!isEditMode}
                    onChange={(e) =>
                      updateGeneratedDocument(activeDocument.id, { invoiceBankDetails: e.target.value })
                    }
                    rows={3}
                    className="w-full resize-y rounded-lg border border-border bg-bg-input px-3 py-2 text-sm text-txt outline-none focus:border-accent disabled:opacity-70"
                    placeholder="Bank, branch, account name &amp; number, SWIFT/IBAN."
                  />
                </div>
              </div>
            </div>
          ) : null}

          {activeDocument.templateType === "status-report" ? (
            <div className="rounded-2xl border border-border bg-bg-surface p-4">
              <div className="mb-4 flex items-center justify-between">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">
                  Status report
                </div>
                <div className="text-[11px] text-txt-muted">One-page weekly / monthly status</div>
              </div>

              <div className="mb-4">
                <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-txt-dim">Overall status</label>
                <div className="flex gap-2">
                  {([
                    { value: "green" as const, label: "On track", tone: "border-ok bg-ok/15 text-ok" },
                    { value: "amber" as const, label: "At risk", tone: "border-warn bg-warn/15 text-warn" },
                    { value: "red" as const, label: "Off track", tone: "border-err bg-err/15 text-err" },
                  ]).map((opt) => {
                    const selected = (activeDocument.statusOverall || "green") === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        disabled={!isEditMode}
                        onClick={() =>
                          updateGeneratedDocument(activeDocument.id, { statusOverall: opt.value })
                        }
                        className={`flex-1 rounded-lg border px-3 py-2.5 text-xs font-semibold transition ${
                          selected ? `${opt.tone} ring-2 ring-current/30` : "border-border bg-bg-input text-txt-muted hover:border-accent/30"
                        } ${!isEditMode ? "cursor-default opacity-70" : "cursor-pointer"}`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  { key: "statusHighlights" as const, label: "Highlights / Accomplishments", placeholder: "- Milestone X completed\n- Team velocity above plan" },
                  { key: "statusIssues" as const, label: "Issues / Blockers", placeholder: "- Vendor delivery delayed\n- Awaiting client approval on Y" },
                  { key: "statusUpcoming" as const, label: "Upcoming milestones", placeholder: "- Phase 2 kickoff next week\n- Final review on Dec 15" },
                  { key: "statusTopRisks" as const, label: "Top risks", placeholder: "- Resource availability through Q4\n- Scope creep on module A" },
                ].map((section) => (
                  <div key={section.key}>
                    <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-txt-dim">{section.label}</label>
                    <textarea
                      value={(activeDocument[section.key] as string | undefined) || ""}
                      disabled={!isEditMode}
                      onChange={(e) =>
                        updateGeneratedDocument(activeDocument.id, { [section.key]: e.target.value })
                      }
                      rows={4}
                      className="w-full resize-y rounded-lg border border-border bg-bg-input px-3 py-2 text-sm text-txt outline-none focus:border-accent disabled:opacity-70"
                      placeholder={section.placeholder}
                    />
                  </div>
                ))}
              </div>

              <div className="mt-4">
                <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-txt-dim">
                  Resource / support asks <span className="text-txt-dim normal-case">(optional)</span>
                </label>
                <textarea
                  value={activeDocument.statusResourceAsks || ""}
                  disabled={!isEditMode}
                  onChange={(e) =>
                    updateGeneratedDocument(activeDocument.id, { statusResourceAsks: e.target.value })
                  }
                  rows={2}
                  className="w-full resize-y rounded-lg border border-border bg-bg-input px-3 py-2 text-sm text-txt outline-none focus:border-accent disabled:opacity-70"
                  placeholder="e.g. Need 1 additional QA engineer for Q4; sign-off needed on revised scope by Dec 1."
                />
              </div>
            </div>
          ) : null}

          <div className="rounded-2xl border border-border bg-bg-surface p-4">
            <div className="mb-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">Content</div>
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-txt-dim">Footer Note</label>
            <input
              value={activeDocument.footerNote || ""}
              disabled={!isEditMode}
              onChange={(e) => updateGeneratedDocument(activeDocument.id, { footerNote: e.target.value })}
              className="mb-4 w-full rounded-lg border border-border bg-bg-input px-3 py-2.5 text-sm text-txt outline-none transition-colors focus:border-accent disabled:opacity-70"
              placeholder="Optional footer text"
            />
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-txt-dim">Document Content</label>
            {isEditMode ? (
              <textarea
                value={activeDocument.content}
                onChange={(e) => updateGeneratedDocument(activeDocument.id, { content: e.target.value })}
                className="min-h-[360px] w-full resize-y rounded-xl border border-border bg-bg-input px-4 py-3 text-sm text-txt outline-none transition-colors focus:border-accent"
              />
            ) : (
              <div className="rounded-xl border border-border bg-bg-input/40 p-4 text-sm text-txt-muted">
                Preview below shows the print-ready layout.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6">
        <DocumentPreview
          doc={activeDocument}
          project={project}
          progressReport={linkedProgress}
          certificate={linkedCertificate}
          signatureProfile={userSignatureProfile}
        />
      </div>
    </div>
  );
}
