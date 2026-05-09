"use client";

import { useEffect, useMemo, useState } from "react";
import { v4 as uuid } from "uuid";
import {
  ArrowLeft,
  ChevronRight,
  FileText,
  ImagePlus,
  Pencil,
  Plus,
  Printer,
  Trash2,
  X,
} from "lucide-react";
import { useAppStore, currency } from "@/lib/store";
import { sanitizeRichTextHtml } from "@/lib/richText";
import type {
  DocumentTemplateType,
  GeneratedDocument,
  PaymentCertificate,
  ProgressReport,
  Project,
  SiteNotePhoto,
  UserSignatureProfile,
} from "@/lib/supabase";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Badge from "@/components/ui/Badge";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

const templateLabels: Record<DocumentTemplateType, string> = {
  "commencement-letter": "Commencement Letter",
  "instruction-letter": "Instruction Letter",
  "progress-report": "Progress Report",
  "payment-certificate-summary": "Payment Certificate Summary",
  "completion-certificate": "Completion Certificate",
  "site-visit-report": "Site Visit Report",
};

function toNumber(value: string | number | undefined | null) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  return parseFloat(String(value || "0").replace(/,/g, "")) || 0;
}

function certificateNet(cert: PaymentCertificate) {
  const subTotal = cert.sheets
    .flatMap((sheet) => sheet.items)
    .reduce((sum, item) => sum + toNumber(item.totalAmount), 0);
  const contingencies = (subTotal * cert.contingenciesPercent) / 100;
  const afterCont = subTotal + contingencies;
  const govTax = (afterCont * cert.governmentTaxPercent) / 100;
  const gross = afterCont + govTax;
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

function layoutForTemplate(templateType: DocumentTemplateType): GeneratedDocument["layoutStyle"] {
  if (
    templateType === "progress-report" ||
    templateType === "payment-certificate-summary" ||
    templateType === "site-visit-report"
  ) {
    return "report";
  }
  if (templateType === "completion-certificate") return "certificate";
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
    case "commencement-letter":
      return `Purpose
Formal notice to commence the works for ${contractTitle} at ${location}.

Instruction
The contractor shall mobilize and commence the works in accordance with the contract, approved drawings, specifications, and the accepted work program.

Required Actions
- confirm mobilization arrangements and key personnel deployment
- submit updated work program, method statements, and insurance records
- maintain quality, safety, and progress reporting throughout execution

Closing
Please acknowledge receipt of this commencement notice and confirm readiness to proceed.`;
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
        ? "Site Visit Report"
        : templateLabels[templateType],
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
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("Unable to read file"));
    reader.readAsDataURL(file);
  });
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

      if (isBulletList) return { type: "bullets" as const, title: "", items: lines.map((line) => line.replace(/^- /, "")) };
      if (headingWithBullets) {
        return {
          type: "section-bullets" as const,
          title: lines[0],
          items: lines.slice(1).map((line) => line.replace(/^- /, "")),
        };
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
      background: #e9eef5;
      color: #102033;
      font-family: Georgia, "Times New Roman", serif;
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
    }
    .cover {
      background:
        radial-gradient(circle at top right, rgba(20, 91, 133, 0.18), transparent 34%),
        linear-gradient(180deg, #0f2742 0%, #12395d 48%, #ffffff 48%, #ffffff 100%);
      color: #102033;
    }
    .cover .page-inner { padding-top: 36mm; }
    .letterhead-band {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 26mm;
      background: linear-gradient(90deg, #0f2742 0%, #145b85 100%);
    }
    .letterhead-mark {
      width: 54px;
      height: 54px;
      border-radius: 0;
      background: linear-gradient(135deg, #145b85 0%, #0f2742 100%);
      color: white;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-family: "Arial", sans-serif;
      font-weight: 700;
      letter-spacing: 0.08em;
      font-size: 16px;
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
      font-size: 22px;
      line-height: 1.15;
      font-weight: 700;
      letter-spacing: 0.02em;
      color: #102033;
      margin: 0 0 4px;
    }
    .letterhead-subtitle {
      font-family: Arial, sans-serif;
      font-size: 11px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: #145b85;
      margin: 0 0 8px;
    }
    .letterhead-address {
      font-family: Arial, sans-serif;
      font-size: 12px;
      color: #576879;
      margin: 0;
    }
    .document-title {
      font-size: 24px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin: 20px 0 18px;
      color: #102033;
      font-weight: 700;
    }
    .cover-title {
      color: white;
      font-size: 34px;
      line-height: 1.05;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin: 46mm 0 18px;
      max-width: 70%;
    }
    .cover-meta {
      width: 72%;
      background: rgba(255,255,255,0.94);
      padding: 18px 20px;
      border-radius: 0;
      box-shadow: 0 18px 40px rgba(15, 39, 66, 0.15);
      margin-top: 18px;
      font-family: Arial, sans-serif;
    }
    .cover-subtitle {
      margin-top: 10px;
      max-width: 72%;
      color: rgba(255,255,255,0.86);
      font-family: Arial, sans-serif;
      font-size: 13px;
      line-height: 1.7;
      letter-spacing: 0.04em;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px 18px;
      margin-bottom: 22px;
      font-family: Arial, sans-serif;
    }
    .meta-item {
      border-top: 1px solid #d8e1ea;
      padding-top: 8px;
    }
    .meta-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.18em;
      color: #718193;
      margin-bottom: 4px;
    }
    .meta-value {
      font-size: 13px;
      color: #102033;
      font-weight: 600;
    }
    .doc-section { margin-bottom: 18px; }
    .doc-section-title {
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.16em;
      color: #145b85;
      font-family: Arial, sans-serif;
      margin: 0 0 8px;
      font-weight: 700;
    }
    .doc-paragraph {
      font-size: 14px;
      line-height: 1.85;
      color: #273849;
      margin: 0 0 14px;
    }
    .doc-list {
      margin: 0 0 14px;
      padding-left: 18px;
      color: #273849;
      font-size: 14px;
      line-height: 1.75;
    }
    .doc-list li { margin-bottom: 6px; }
    .report-summary {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      margin-bottom: 22px;
      font-family: Arial, sans-serif;
    }
    .report-card {
      border: 1px solid #d8e1ea;
      border-radius: 0;
      padding: 14px 16px;
      background: linear-gradient(180deg, #f9fbfd 0%, #ffffff 100%);
    }
    .report-card-label {
      font-size: 10px;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: #718193;
      margin-bottom: 8px;
    }
    .report-card-value {
      font-size: 20px;
      font-weight: 700;
      color: #102033;
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
      gap: 24px;
      margin-top: 38px;
      font-family: Arial, sans-serif;
    }
    .signature-box {
      border-top: 1px solid #8896a6;
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
      font-weight: 700;
      color: #102033;
      margin-bottom: 4px;
    }
    .signature-role {
      font-size: 12px;
      color: #718193;
    }
    .page-number {
      position: absolute;
      right: 22mm;
      bottom: 14mm;
      font-family: Arial, sans-serif;
      font-size: 11px;
      color: #8190a1;
    }
    .footer-note {
      margin-top: 26px;
      padding-top: 12px;
      border-top: 1px solid #d8e1ea;
      font-family: Arial, sans-serif;
      font-size: 11px;
      color: #718193;
      line-height: 1.6;
    }
    .brand-shell {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 18px;
      margin: -26mm -22mm 22px;
      padding: 18mm 22mm 16mm;
      background: #eef8ff;
      border-bottom: 3px solid #19aee6;
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
      font-size: 10px;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      color: #54708c;
      margin-bottom: 8px;
      font-weight: 700;
    }
    .brand-name {
      font-size: 26px;
      line-height: 1.15;
      margin: 0;
      color: #12263f;
      font-weight: 700;
      overflow-wrap: anywhere;
    }
    .brand-tagline {
      margin-top: 6px;
      font-family: Arial, sans-serif;
      font-size: 11px;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: #1d5f8b;
      font-weight: 700;
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
      text-align: center;
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
    @page { size: A4; margin: 12mm; }
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

function renderBodyHtml(doc: GeneratedDocument, project: Project | null, progressReport?: ProgressReport | null, certificate?: PaymentCertificate | null) {
  const linkedMetrics = progressReport ? progressMetrics(progressReport) : null;
  const certValue = certificate ? certificateNet(certificate) : null;

  if (doc.layoutStyle === "report") {
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

function buildDocumentPrintHtml(
  doc: GeneratedDocument,
  project: Project | null,
  progressReport?: ProgressReport | null,
  certificate?: PaymentCertificate | null,
  signatureProfile?: UserSignatureProfile | null
) {
  const mergedDoc = hydrateGeneratedDocument(doc, project, progressReport, certificate);
  const coverNeeded = mergedDoc.layoutStyle === "report";
  const coverTitle = mergedDoc.coverTitle || mergedDoc.title;
  const branding = resolveProjectBranding(project);
  const consultant = mergedDoc.signatoryName || branding.issuerDisplayName || "Authorized Representative";
  const recipient = mergedDoc.recipientName || project?.contractorName || "Recipient";
  const signatorySignature = resolveSavedSignature(mergedDoc.signatorySignatureSource, signatureProfile);
  const recipientSignature = resolveSavedSignature(mergedDoc.recipientSignatureSource, signatureProfile);
  const coverBackground = mergedDoc.coverImageDataUrl
    ? `background:
        linear-gradient(180deg, rgba(15,39,66,0.88) 0%, rgba(18,57,93,0.84) 48%, rgba(255,255,255,0.98) 48%, rgba(255,255,255,0.98) 100%),
        url('${escapeHtml(mergedDoc.coverImageDataUrl)}') center/cover no-repeat;`
    : "";
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
                <section class="page cover" ${coverBackground ? `style="${coverBackground}"` : ""}>
                  <div class="page-inner">
                    <div class="letterhead">
                      <div>
                        ${documentMarkHtml(mergedDoc)}
                      </div>
                      <div style="margin-left:auto; text-align:right;">
                        <div class="letterhead-subtitle" style="color:rgba(255,255,255,0.8)">${escapeHtml(
                          branding.headerTagline || "Professional project controls"
                        )}</div>
                        <div class="letterhead-address" style="color:rgba(255,255,255,0.88)">${escapeHtmlMultiline(
                          branding.issuerAddress || mergedDoc.letterheadAddress || project?.location || "Project Location"
                        )}</div>
                      </div>
                    </div>
                    <h1 class="cover-title">${escapeHtml(coverTitle)}</h1>
                    ${
                      mergedDoc.coverSubtitle
                        ? `<div class="cover-subtitle">${escapeHtml(mergedDoc.coverSubtitle)}</div>`
                        : ""
                    }
                    <div class="cover-meta">
                      <div class="meta-grid" style="margin-bottom:0">
                        <div class="meta-item"><div class="meta-label">Project</div><div class="meta-value">${escapeHtml(project?.name || "Project")}</div></div>
                        <div class="meta-item"><div class="meta-label">Reference</div><div class="meta-value">${escapeHtml(mergedDoc.referenceNo)}</div></div>
                        <div class="meta-item"><div class="meta-label">Date</div><div class="meta-value">${escapeHtml(mergedDoc.date)}</div></div>
                        <div class="meta-item"><div class="meta-label">Prepared By</div><div class="meta-value">${escapeHtml(consultant)}</div></div>
                      </div>
                    </div>
                    <div class="page-number">Cover</div>
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
                        <div class="certificate-cell"><div class="certificate-cell-label">Contract value</div><div class="certificate-cell-value">${escapeHtml(project?.currency || "USD")} ${escapeHtml(project?.contractAmount || "Not set")}</div></div>
                        <div class="certificate-cell"><div class="certificate-cell-label">Retention held</div><div class="certificate-cell-value">As per contract</div></div>
                        <div class="certificate-cell"><div class="certificate-cell-label">Beneficiary</div><div class="certificate-cell-value">${escapeHtml(project?.clientName || branding.clientDisplayName || "Client / Employer")}</div></div>
                        <div class="certificate-cell"><div class="certificate-cell-label">Donor / Employer</div><div class="certificate-cell-value">${escapeHtml(branding.clientDisplayName || project?.clientName || "Employer")}</div></div>
                        <div class="certificate-cell"><div class="certificate-cell-label">Engineer</div><div class="certificate-cell-value">${escapeHtml(branding.issuerDisplayName || project?.consultantName || consultant)}</div></div>
                        <div class="certificate-cell"><div class="certificate-cell-label">Implementation period</div><div class="certificate-cell-value">${escapeHtml(project?.start_date || "Start")} - ${escapeHtml(project?.end_date || "Completion")}</div></div>
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
                mergedDoc.layoutStyle !== "certificate"
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
  signatureProfile?: UserSignatureProfile | null
) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;
  printWindow.document.write(buildDocumentPrintHtml(doc, project, progressReport, certificate, signatureProfile));
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
              <div className="-mx-10 -mt-10 mb-8 flex items-start justify-between gap-6 border-b-[3px] border-sky-400 bg-sky-50 px-10 py-8">
                <div className="flex min-w-0 items-start gap-4">
                  {mergedDoc.brandLogoDataUrl ? (
                    <div className="h-16 w-16 overflow-hidden border border-slate-200 bg-white shadow-[0_18px_30px_rgba(15,39,66,0.1)]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={mergedDoc.brandLogoDataUrl} alt="Document logo" className="h-full w-full object-cover" />
                    </div>
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center bg-gradient-to-br from-[#145b85] to-[#0f2742] font-black tracking-[0.18em] text-white shadow-[0_18px_30px_rgba(15,39,66,0.22)]">
                      {documentInitials(mergedDoc)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                      Official project correspondence
                    </div>
                    <h2 className="mt-2 text-[28px] font-bold leading-tight text-slate-900 break-words">
                      {mergedDoc.letterheadTitle || branding.issuerDisplayName || project?.name || "Project Office"}
                    </h2>
                    <div className="mt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700 break-words">
                      {mergedDoc.letterheadSubtitle || branding.headerTagline || project?.contractTitle || mergedDoc.title}
                    </div>
                    <div className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-500">
                      {mergedDoc.letterheadAddress || branding.issuerAddress || project?.location || "Project Location"}
                    </div>
                  </div>
                </div>
                <Badge color={mergedDoc.status === "approved" ? "ok" : mergedDoc.status === "issued" ? "accent" : "warn"}>
                  {mergedDoc.status.toUpperCase()}
                </Badge>
              </div>
              <div className="mt-8">
                <h1 className="text-[30px] font-black uppercase tracking-[0.12em] text-slate-900">{mergedDoc.title}</h1>
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
    userSignatureProfile,
    setUserSignatureProfile,
    clearUserSignatureProfile,
    addGeneratedDocument,
    updateGeneratedDocument,
    deleteGeneratedDocument,
  } = useAppStore();

  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [templateType, setTemplateType] = useState<DocumentTemplateType>("progress-report");
  const [title, setTitle] = useState("Progress Report");
  const [linkedProgressReportId, setLinkedProgressReportId] = useState("");
  const [linkedCertificateId, setLinkedCertificateId] = useState("");

  const projectDocuments = generatedDocuments.filter((doc) => doc.project_id === project?.id);
  const projectProgressReports = progressReports.filter((report) => report.project_id === project?.id);
  const projectCertificates = certificates.filter((certificate) => certificate.project_id === project?.id);
  const activeDocumentRaw = projectDocuments.find((doc) => doc.id === activeDocumentId) || null;

  useEffect(() => {
    setTitle(templateLabels[templateType]);
  }, [templateType]);

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
          <div>
            <h2 className="text-lg font-bold tracking-tight">Documents</h2>
            <p className="text-xs text-txt-muted mt-0.5">
              Generate polished PDF-ready letters, certificates, and reports from live project data.
            </p>
          </div>
          <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
            <Plus size={14} /> New Document
          </Button>
        </div>

        {projectDocuments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-20 h-20 rounded-2xl bg-accent/10 flex items-center justify-center mb-5">
              <FileText size={32} className="text-accent opacity-60" />
            </div>
            <p className="text-txt-muted text-sm font-medium">No generated documents yet</p>
            <p className="text-xs text-txt-dim mt-1.5 max-w-[340px] text-center">
              Start with professional commencement letters, instruction letters, progress reports with cover pages, payment summaries, and completion certificates.
            </p>
            <Button variant="primary" size="md" className="mt-5" onClick={() => setShowCreate(true)}>
              <Plus size={14} /> Create First Document
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {projectDocuments.map((doc, idx) => {
              const linkedListProgress =
                projectProgressReports.find((report) => report.id === doc.linkedProgressReportId) || latestProgress;
              const linkedListCertificate =
                projectCertificates.find((certificate) => certificate.id === doc.linkedCertificateId) || latestCertificate;
              const hydratedDoc = hydrateGeneratedDocument(doc, project, linkedListProgress, linkedListCertificate);

              return (
                <div
                  key={doc.id}
                  onClick={() => {
                    setActiveDocumentId(doc.id);
                    setIsEditMode(false);
                  }}
                  className="group flex items-center justify-between p-4 bg-bg-surface border border-border rounded-xl cursor-pointer transition-all duration-200 hover:border-accent/50 hover:shadow-lg hover:shadow-accent/5"
                  style={{ animationDelay: `${idx * 60}ms`, animationFillMode: "both" }}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-accent/20 to-accent/5 flex items-center justify-center flex-shrink-0 overflow-hidden">
                      {hydratedDoc.brandLogoDataUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={hydratedDoc.brandLogoDataUrl} alt="Document logo" className="w-full h-full object-cover" />
                      ) : (
                        <FileText size={18} className="text-accent" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">{hydratedDoc.title}</span>
                        <Badge color={hydratedDoc.status === "approved" ? "ok" : hydratedDoc.status === "issued" ? "accent" : "warn"}>
                          {hydratedDoc.status.toUpperCase()}
                        </Badge>
                      </div>
                      <div className="flex gap-3 mt-1.5 text-[11px] text-txt-dim">
                        <span>{templateLabels[hydratedDoc.templateType]}</span>
                        <span>•</span>
                        <span>{hydratedDoc.referenceNo}</span>
                        <span>•</span>
                        <span>{hydratedDoc.date}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                            openDocumentPdf(hydratedDoc, project, linkedListProgress, linkedListCertificate, userSignatureProfile);
                      }}
                      className="p-1.5 rounded-md bg-transparent border-none text-txt-dim hover:text-accent hover:bg-accent/10 cursor-pointer transition-colors"
                      title="Print or save as PDF"
                    >
                      <Printer size={14} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteGeneratedDocument(doc.id);
                        if (activeDocumentId === doc.id) setActiveDocumentId(null);
                      }}
                      className="p-1.5 rounded-md bg-transparent border-none text-txt-dim hover:text-err hover:bg-err/10 cursor-pointer transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                    <ChevronRight size={16} className="text-txt-dim group-hover:text-accent transition-colors" />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Generate Professional Document" width={560}>
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
                {Object.entries(templateLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
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
                  title: title || templateLabels[templateType],
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

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Button size="sm" variant="ghost" onClick={() => { setActiveDocumentId(null); setIsEditMode(false); }}>
            <ArrowLeft size={14} /> Back
          </Button>
          <div className="h-5 w-px bg-border" />
          <div>
            <h2 className="text-lg font-bold">{activeDocument.title}</h2>
            <p className="text-xs text-txt-muted mt-0.5">
              {templateLabels[activeDocument.templateType]} • {activeDocument.referenceNo}
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
              onClick={() => openDocumentPdf(activeDocument, project, linkedProgress, linkedCertificate, userSignatureProfile)}
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

      <div className="grid grid-cols-4 gap-3 mb-5">
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
        <div className="rounded-2xl border border-border bg-bg-surface p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-txt-dim">Branding Source</div>
              <div className="mt-2 text-sm font-semibold text-txt">
                {brandingSource === "project" ? "Using project branding profile" : "Using document-specific branding"}
              </div>
              <p className="mt-1 max-w-[720px] text-xs leading-6 text-txt-muted">
                Project defaults come from the project information form. Switch to an override only when this single letter or certificate needs a different header.
              </p>
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
            <div className="flex h-[88px] w-[88px] items-center justify-center overflow-hidden rounded-[24px] border border-border bg-bg-input">
              {activeDocument.brandLogoDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={activeDocument.brandLogoDataUrl} alt="Brand logo" className="h-full w-full object-cover" />
              ) : (
                <span className="text-[11px] font-black uppercase tracking-[0.18em] text-txt-dim">
                  {documentInitials(activeDocument)}
                </span>
              )}
            </div>
            <div className="rounded-[20px] border border-border bg-bg-input/40 p-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-txt-dim">Resolved Header</div>
              <div className="mt-2 text-base font-semibold text-txt">{activeDocument.letterheadTitle}</div>
              <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
                {activeDocument.letterheadSubtitle}
              </div>
              <div className="mt-3 whitespace-pre-line text-sm leading-6 text-txt-muted">
                {activeDocument.letterheadAddress}
              </div>
            </div>
            <div className="rounded-[20px] border border-border bg-bg-input/40 p-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-txt-dim">Project Branding Profile</div>
              <div className="mt-2 text-sm font-semibold text-txt">{branding.issuerDisplayName}</div>
              <div className="mt-1 text-sm text-txt-muted">{branding.clientDisplayName}</div>
              <div className="mt-3 whitespace-pre-line text-xs leading-6 text-txt-dim">
                {[branding.issuerAddress, branding.clientAddress].filter(Boolean).join("\n\n")}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-bg-surface p-4">
          <div className="mb-4 text-[10px] font-bold uppercase tracking-[0.2em] text-txt-dim">
            Header and Recipient Metadata
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

        <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
          <div className="rounded-2xl border border-border bg-bg-surface p-4">
            <div className="mb-4 text-[10px] font-bold uppercase tracking-[0.2em] text-txt-dim">Print Assets</div>
            <div className={`grid gap-3 ${activeDocument.layoutStyle === "report" ? "xl:grid-cols-3" : "xl:grid-cols-2"}`}>
              <div className="rounded-xl border border-border bg-bg-input/40 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-medium uppercase tracking-wider text-txt-dim">Letterhead Logo</div>
                    <p className="mt-1 text-xs text-txt-muted">
                      Inherited from the project branding profile unless this document uses an override.
                    </p>
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
                    <p className="mt-1 text-xs text-txt-muted">
                      Upload once, then apply it to signatory or recipient blocks when issuing documents.
                    </p>
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
                    <p className="text-[11px] leading-5 text-txt-muted">
                      Linked documents pull the latest saved signature image at preview/export time.
                    </p>
                  </div>
                ) : null}
              </div>

              {activeDocument.layoutStyle === "report" ? (
                <div className="rounded-xl border border-border bg-bg-input/40 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-medium uppercase tracking-wider text-txt-dim">Cover Artwork</div>
                      <p className="mt-1 text-xs text-txt-muted">
                        Optional hero image for report covers. Letters and certificates stay formal and text-led.
                      </p>
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

          <div className="rounded-2xl border border-border bg-bg-surface p-4">
            <div className="mb-4 text-[10px] font-bold uppercase tracking-[0.2em] text-txt-dim">Content</div>
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-txt-dim">Footer Note</label>
            <input
              value={activeDocument.footerNote || ""}
              disabled={!isEditMode}
              onChange={(e) => updateGeneratedDocument(activeDocument.id, { footerNote: e.target.value })}
              className="mb-4 w-full rounded-lg border border-border bg-bg-input px-3 py-2.5 text-sm text-txt outline-none transition-colors focus:border-accent disabled:opacity-70"
              placeholder="Optional footer text for official issue notes, disclaimers, or record status"
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
                The preview below shows the final print-ready layout.
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
