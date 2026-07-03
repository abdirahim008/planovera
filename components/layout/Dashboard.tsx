"use client";

import { type Dispatch, type SetStateAction, useEffect, useMemo, useRef, useState } from "react";
import { compressImageFile } from "@/lib/imageCompression";
import { useRouter } from "next/navigation";
import { v4 as uuid } from "uuid";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BarChart3,
  Building2,
  CheckCircle2,
  ClipboardList,
  Coins,
  DatabaseZap,
  DollarSign,
  FileText,
  Flag,
  LayoutGrid,
  Lock,
  Mail,
  MapPin,
  Maximize2,
  MoreVertical,
  PenTool,
  Plus,
  Table,
  Trash2,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";
import { currency, getLiveMeetingActionItems, type MeetingActionSnapshot, useAppStore } from "@/lib/store";
import {
  collectAchievedMilestones,
  countFlaggedMilestones,
  type AchievedMilestone,
} from "@/lib/work-plan-milestones";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import CompactKpiList, { type CompactKpiRow } from "@/components/ui/CompactKpiList";
import ContextMenu from "@/components/ui/ContextMenu";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase-browser";
import { SOMALIA_REGIONS, findSomaliaTown } from "@/lib/somaliaLocations";
import {
  emptyConstructionWorkspacePayload,
  mapProgramRecord,
  mapProjectCategoryRecord,
  mapProjectRecord,
  toProgramRecord,
  toProjectCategoryRecord,
  toProjectRecord,
} from "@/lib/supabase";
import type {
  ChecklistItem,
  ChecklistStatus,
  CorrespondenceRecord,
  GeneratedDocument,
  MeetingMinute,
  PaymentCertificate,
  Program,
  ProjectCategory,
  ProjectCategoryRecord,
  ProgramRecord,
  ProjectRecord,
  ProgressReport,
  Project,
  SavedBOQ,
  SavedWorkPlan,
} from "@/lib/supabase";
import {
  buildFinalCertificateDemoPayload,
  buildRoadPackagesDemoPayload,
  remintAdoptableWorkspace,
  type AdoptableWorkspace,
} from "@/lib/sampleData";
import { DEFAULT_PROJECT_CATEGORIES, categorySlug } from "@/lib/projectCategories";
import { PROJECT_PRESETS, getProjectPreset } from "@/lib/project-presets";
import { paymentCertificateCalcs } from "@/lib/payment-calculations";

type Tone = "accent" | "ok" | "warn" | "err";

type ProjectFormData = {
  name: string;
  programId: string;
  newProgramName: string;
  newProgramCode: string;
  categoryId: string;
  newCategoryName: string;
  newCategoryCode: string;
  /** Preset id chosen via the create-project card picker. */
  preset: string;
  type: Project["type"];
  role: Project["role"];
  code: string;
  contractNumber: string;
  clientName: string;
  contractorName: string;
  consultantName: string;
  location: string;
  region: string;
  town: string;
  useExactCoordinates: boolean;
  latitude: string;
  longitude: string;
  contractTitle: string;
  contractAmount: string;
  currency: string;
  start_date: string;
  /** Project duration in whole months; drives the auto-calculated end date. */
  durationMonths: string;
  end_date: string;
  documentClientLogoDataUrl: string;
  documentClientDisplayName: string;
  documentClientAddress: string;
  documentIssuerDisplayName: string;
  documentIssuerAddress: string;
  documentHeaderTagline: string;
  documentIssuerPhone: string;
  documentIssuerEmail: string;
  documentIssuerWebsite: string;
  documentAccentPrimary: string;
  documentAccentSecondary: string;
};

/** Default letterhead accents (kept in sync with the documents module). */
const DEFAULT_ACCENT_PRIMARY = "#1b9cd8";
const DEFAULT_ACCENT_SECONDARY = "#f5821f";

const defaultProjectFormData = (): ProjectFormData => ({
  name: "",
  programId: "",
  newProgramName: "",
  newProgramCode: "",
  categoryId: "",
  newCategoryName: "",
  newCategoryCode: "",
  preset: "construction",
  type: "construction",
  role: "supervision",
  code: "",
  contractNumber: "",
  clientName: "",
  contractorName: "",
  consultantName: "",
  location: "",
  region: "",
  town: "",
  useExactCoordinates: false,
  latitude: "",
  longitude: "",
  contractTitle: "",
  contractAmount: "",
  currency: "USD",
  start_date: "",
  durationMonths: "",
  end_date: "",
  documentClientLogoDataUrl: "",
  documentClientDisplayName: "",
  documentClientAddress: "",
  documentIssuerDisplayName: "",
  documentIssuerAddress: "",
  documentHeaderTagline: "",
  documentIssuerPhone: "",
  documentIssuerEmail: "",
  documentIssuerWebsite: "",
  documentAccentPrimary: "",
  documentAccentSecondary: "",
});

const projectToFormData = (project: Project): ProjectFormData => ({
  name: project.name || "",
  programId: project.programId || "",
  newProgramName: "",
  newProgramCode: "",
  categoryId: project.categoryId || (project.categoryName ? `default:${categorySlug(project.categoryName)}` : ""),
  newCategoryName: "",
  newCategoryCode: "",
  // Falls back to the type-based inference when editing a legacy project that pre-dates presets.
  preset: project.preset || (project.type === "construction" ? "construction" : "other"),
  type: project.type,
  role: project.role,
  code: project.code || "",
  contractNumber: project.contractNumber || "",
  clientName: project.clientName || "",
  contractorName: project.contractorName || "",
  consultantName: project.consultantName || "",
  location: project.location || "",
  region: project.region || "",
  town: project.town || "",
  useExactCoordinates: Boolean(project.latitude && project.longitude),
  latitude: project.latitude || "",
  longitude: project.longitude || "",
  contractTitle: project.contractTitle || "",
  contractAmount: project.contractAmount || "",
  currency: project.currency || "USD",
  start_date: project.start_date || "",
  durationMonths: monthsBetweenIso(project.start_date || "", project.end_date || ""),
  end_date: project.end_date || "",
  documentClientLogoDataUrl: project.documentBranding?.clientLogoDataUrl || "",
  documentClientDisplayName: project.documentBranding?.clientDisplayName || "",
  documentClientAddress: project.documentBranding?.clientAddress || "",
  documentIssuerDisplayName: project.documentBranding?.issuerDisplayName || "",
  documentIssuerAddress: project.documentBranding?.issuerAddress || "",
  documentHeaderTagline: project.documentBranding?.headerTagline || "",
  documentIssuerPhone: project.documentBranding?.issuerPhone || "",
  documentIssuerEmail: project.documentBranding?.issuerEmail || "",
  documentIssuerWebsite: project.documentBranding?.issuerWebsite || "",
  documentAccentPrimary: project.documentBranding?.accentPrimary || "",
  documentAccentSecondary: project.documentBranding?.accentSecondary || "",
});

/**
 * Add a whole number of months to an ISO date (YYYY-MM-DD), clamping the day so
 * e.g. Jan 31 + 1 month becomes Feb 28/29 rather than rolling into March.
 * Returns "" when the inputs are invalid.
 */
function addMonthsIso(startIso: string, months: number): string {
  if (!startIso || !Number.isFinite(months)) return "";
  const date = new Date(`${startIso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  const targetMonth = date.getMonth() + months;
  const result = new Date(date);
  result.setDate(1);
  result.setMonth(targetMonth);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(date.getDate(), lastDay));
  return result.toISOString().slice(0, 10);
}

/**
 * Whole months between two ISO dates, used to seed the duration field when
 * editing a project that only has start/end dates stored. Returns "" if the
 * span isn't a positive whole-month-ish value.
 */
function monthsBetweenIso(startIso: string, endIso: string): string {
  if (!startIso || !endIso) return "";
  const start = new Date(`${startIso}T00:00:00`);
  const end = new Date(`${endIso}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "";
  let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  if (end.getDate() < start.getDate()) months -= 1;
  return months > 0 ? String(months) : "";
}

function readFileAsDataUrl(file: File) {
  // Compress large images on the way in so they don't blow the localStorage
  // quota or bloat sync payloads (falls back to the original on failure).
  return compressImageFile(file);
}

type ProgressSnapshot = {
  planned: number;
  actual: number;
  variance: number;
  earned: number;
};

type CommercialSnapshot = {
  approved: number;
  submitted: number;
  paid: number;
  retentionHeld: number;
};

type ChecklistMetrics = {
  total: number;
  overdue: number;
  pending: number;
  submitted: number;
  verified: number;
};

type WorkPlanSnapshot = {
  total: number;
  completed: number;
  inProgress: number;
  delayed: number;
  pending: number;
  /** Activities needing attention next: delayed first, then in-progress, then upcoming pending. */
  next: Array<{
    description: string;
    startDate: string;
    endDate: string;
    status: "pending" | "in-progress" | "completed" | "delayed";
  }>;
  /** Achieved milestones, most recent first. */
  milestones: AchievedMilestone[];
  /** Total flagged milestones (achieved or not) for "X of Y" copy. */
  milestonesFlagged: number;
};

type ProjectSummary = {
  project: Project;
  physical: number;
  financial: number;
  progress: ProgressSnapshot;
  commercial: CommercialSnapshot;
  documents: number;
  correspondence: number;
  pendingApprovals: number;
  meetingCount: number;
  openActionPoints: number;
  overdueActionPoints: number;
  actionItems: MeetingActionSnapshot[];
  checklistItems: ChecklistItem[];
  checklistMetrics: ChecklistMetrics;
  workPlan: WorkPlanSnapshot;
  timeline: ReturnType<typeof getTimelineProgress>;
  progressHistory: Array<{ label: string; planned: number; actual: number; earned: number }>;
  commercialHistory: Array<{ label: string; net: number }>;
};

type PortfolioFilters = {
  programId: string;
  categoryId: string;
  location: string;
  client: string;
};

const toneStyles: Record<Tone, { hex: string; soft: string; glow: string }> = {
  accent: { hex: "#3b82f6", soft: "rgba(59, 130, 246, 0.12)", glow: "rgba(59, 130, 246, 0.32)" },
  ok: { hex: "#22c55e", soft: "rgba(34, 197, 94, 0.12)", glow: "rgba(34, 197, 94, 0.32)" },
  warn: { hex: "#f59e0b", soft: "rgba(245, 158, 11, 0.12)", glow: "rgba(245, 158, 11, 0.32)" },
  err: { hex: "#ef4444", soft: "rgba(239, 68, 68, 0.12)", glow: "rgba(239, 68, 68, 0.32)" },
};

const statusBadge = (status: "open" | "in-progress" | "closed") =>
  status === "closed" ? "ok" : status === "in-progress" ? "accent" : "warn";

const checklistStatusLabels: Record<ChecklistStatus, string> = {
  pending: "Pending",
  submitted: "Submitted",
  verified: "Verified",
  rejected: "Rejected",
  waived: "Waived",
};

const checklistStatusTone: Record<ChecklistStatus, Tone> = {
  pending: "warn",
  submitted: "accent",
  verified: "ok",
  rejected: "err",
  waived: "accent",
};

const todayISO = () => new Date().toISOString().split("T")[0];

const isChecklistItemOverdue = (item: ChecklistItem) =>
  item.status === "pending" && Boolean(item.dueDate) && item.dueDate < todayISO();

const computeChecklistMetrics = (items: ChecklistItem[]): ChecklistMetrics => ({
  total: items.length,
  overdue: items.filter(isChecklistItemOverdue).length,
  pending: items.filter((item) => item.status === "pending").length,
  submitted: items.filter((item) => item.status === "submitted" || item.status === "verified").length,
  verified: items.filter((item) => item.status === "verified").length,
});

const normalizeChecklistDocumentUrl = (url: string) => {
  const trimmed = url.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

const clamp = (value: number, min = 0, max = 100) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : 0));

const parseAmount = (value: string | number | undefined | null) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  return parseFloat(String(value || "0").replace(/,/g, "")) || 0;
};

// Compact USD label for tight mobile rows, e.g. 1,264,440 -> "USD 1.26M".
const compactUsd = (value: number) => {
  const amount = Number.isFinite(value) ? value : 0;
  if (Math.abs(amount) >= 1_000_000) return `USD ${(amount / 1_000_000).toFixed(2)}M`;
  if (Math.abs(amount) >= 1_000) return `USD ${(amount / 1_000).toFixed(1)}K`;
  return `USD ${currency(amount)}`;
};

const normalizeFilterValue = (value?: string | null) => (value || "").trim().toLowerCase();

const uniqueFilterValues = (values: Array<string | undefined | null>) =>
  Array.from(new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])).sort((a, b) =>
    a.localeCompare(b)
  );

const programLabel = (programs: Program[], programId?: string) =>
  programs.find((program) => program.id === programId)?.name || "Unassigned";

const categoryLabel = (categories: ProjectCategory[], project: Project) =>
  categories.find((category) => category.id === project.categoryId)?.name || project.categoryName || "";

/** Join lock reasons into natural English: ["a BOQ","payment certificates"] → "a BOQ and payment certificates". */
const formatLockReasons = (reasons: string[]) => {
  if (reasons.length <= 1) return reasons[0] || "";
  if (reasons.length === 2) return `${reasons[0]} and ${reasons[1]}`;
  return `${reasons.slice(0, -1).join(", ")}, and ${reasons[reasons.length - 1]}`;
};

const categoryFilterValue = (categories: ProjectCategory[], project: Project) => {
  if (project.categoryId) return project.categoryId;
  const label = categoryLabel(categories, project);
  return label ? `default:${categorySlug(label)}` : "";
};

const categoryFilterLabel = (categories: ProjectCategory[], filterValue: string) => {
  if (filterValue === "__uncategorized__") return "Uncategorized";
  if (filterValue.startsWith("default:")) {
    const defaultCategory = DEFAULT_PROJECT_CATEGORIES.find(
      (category) => `default:${categorySlug(category.name)}` === filterValue,
    );
    return defaultCategory?.name || filterValue.replace("default:", "");
  }
  return categories.find((category) => category.id === filterValue)?.name || filterValue;
};

const projectLocationLabel = (project: Project) =>
  [project.town, project.region].filter(Boolean).join(", ") || project.location || "";

const projectLocationFilterValue = (project: Project) => projectLocationLabel(project);

const parseCoordinate = (value?: string | null) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const resolveProjectCoordinates = (project: Project) => {
  const latitude = parseCoordinate(project.latitude);
  const longitude = parseCoordinate(project.longitude);

  if (latitude !== null && longitude !== null) {
    return {
      latitude,
      longitude,
      source: "Exact coordinates" as const,
    };
  }

  const town = findSomaliaTown(project.region, project.town);
  if (!town) return null;

  return {
    latitude: town.latitude,
    longitude: town.longitude,
    source: "Town fallback" as const,
  };
};

function computeProgressMetrics(report: ProgressReport | null | undefined): ProgressSnapshot {
  if (!report) return { planned: 0, actual: 0, variance: 0, earned: 0 };
  const items = report.sheets.flatMap((sheet) => sheet.items);
  const planned = items.reduce(
    (sum, item) => sum + (parseAmount(item.weightPercent) * parseAmount(item.plannedPercent)) / 100,
    0
  );
  const actual = items.reduce(
    (sum, item) => sum + (parseAmount(item.weightPercent) * parseAmount(item.actualPercent)) / 100,
    0
  );
  const earned = items.reduce((sum, item) => sum + parseAmount(item.earnedAmount), 0);
  return { planned, actual, variance: actual - planned, earned };
}

function getTimelineProgress(project: Project | null) {
  if (!project?.start_date || !project?.end_date) return null;

  const start = new Date(project.start_date);
  const end = new Date(project.end_date);
  const today = new Date();

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return null;
  }

  const totalDays = Math.max(
    1,
    Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  );
  const elapsedDays = clamp(
    Math.ceil((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)),
    0,
    totalDays
  );

  return {
    totalDays,
    elapsedDays,
    remainingDays: Math.max(totalDays - elapsedDays, 0),
    percent: clamp((elapsedDays / totalDays) * 100),
  };
}

function computePhysicalProgress(projectId: string, savedWorkPlans: SavedWorkPlan[]) {
  const activities = savedWorkPlans
    .filter((workPlan) => workPlan.project_id === projectId)
    .flatMap((workPlan) => workPlan.sheets.flatMap((sheet) => sheet.activities))
    .filter((activity) => (activity.rowType || "activity") !== "section");

  if (activities.length === 0) return 0;
  const completed = activities.filter((activity) => activity.status === "completed").length;
  return Math.round((completed / activities.length) * 100);
}

function computeWorkPlanSnapshot(projectId: string, savedWorkPlans: SavedWorkPlan[]): WorkPlanSnapshot {
  const activities = savedWorkPlans
    .filter((workPlan) => workPlan.project_id === projectId)
    .flatMap((workPlan) => workPlan.sheets.flatMap((sheet) => sheet.activities))
    .filter((activity) => (activity.rowType || "activity") !== "section");

  const countByStatus = (status: WorkPlanSnapshot["next"][number]["status"]) =>
    activities.filter((activity) => activity.status === status).length;

  // Surface what needs attention now: delayed activities first, then what's
  // running, then the next pending ones in start-date order.
  const attentionRank = { delayed: 0, "in-progress": 1, pending: 2, completed: 3 } as const;
  const next = activities
    .filter((activity) => activity.status !== "completed")
    .sort(
      (a, b) =>
        attentionRank[a.status] - attentionRank[b.status] ||
        (a.startDate || "9999-12-31").localeCompare(b.startDate || "9999-12-31")
    )
    .slice(0, 3)
    .map((activity) => ({
      description: activity.description,
      startDate: activity.startDate,
      endDate: activity.endDate,
      status: activity.status,
    }));

  return {
    total: activities.length,
    completed: countByStatus("completed"),
    inProgress: countByStatus("in-progress"),
    delayed: countByStatus("delayed"),
    pending: countByStatus("pending"),
    next,
    milestones: collectAchievedMilestones(savedWorkPlans, projectId),
    milestonesFlagged: countFlaggedMilestones(savedWorkPlans, projectId),
  };
}

function computeCommercialSnapshot(projectId: string, certificates: PaymentCertificate[]): CommercialSnapshot {
  const projectCertificates = certificates.filter((certificate) => certificate.project_id === projectId);
  if (projectCertificates.length === 0) {
    return { approved: 0, submitted: 0, paid: 0, retentionHeld: 0 };
  }

  // Interim certificates are cumulative — each IPC's totals already include the
  // earlier ones. So the to-date figure for a status is the furthest-along
  // certificate of that status (max cumulative net), NOT the sum, which would
  // double-count earlier IPCs. Use the shared FIDIC math for accuracy.
  const calcs = projectCertificates.map((certificate) => ({
    status: certificate.status,
    ...paymentCertificateCalcs(certificate),
  }));

  const maxNetForStatus = (status: PaymentCertificate["status"]) =>
    calcs
      .filter((entry) => entry.status === status)
      .reduce((max, entry) => Math.max(max, entry.total.net), 0);

  // Retention held to date is whatever the furthest-along certificate overall
  // (the one covering the most cumulative work) currently holds back.
  const latest = calcs.reduce((furthest, entry) =>
    entry.totalSubTotal > furthest.totalSubTotal ? entry : furthest
  );

  return {
    approved: maxNetForStatus("approved"),
    submitted: maxNetForStatus("submitted"),
    paid: maxNetForStatus("paid"),
    retentionHeld: Math.max(0, latest.total.retentionHeld),
  };
}

function computeFinancialProgress(
  projectId: string,
  savedBOQs: SavedBOQ[],
  certificates: PaymentCertificate[],
  project: Project
) {
  // Denominator: the total contract amount. Fall back to the BOQ total only
  // when no contract amount has been entered for the project.
  const contractAmount = parseAmount(project.contractAmount);
  const boqAmount = savedBOQs
    .filter((boq) => boq.project_id === projectId)
    .flatMap((boq) => boq.sheets)
    .reduce(
      (sum, sheet) =>
        sum +
        sheet.rows
          .filter((row) => row.type === "item")
          .reduce((rowSum, row) => rowSum + parseAmount(row.qty) * parseAmount(row.rate), 0),
      0
    );

  const baselineAmount = contractAmount > 0 ? contractAmount : boqAmount;
  if (baselineAmount <= 0) return 0;

  // Amount paid to date = the cumulative net of the furthest-along *paid*
  // certificate. Interim certificates are cumulative, so we take the maximum
  // cumulative net rather than summing (summing would double-count earlier IPCs).
  const paidToDate = certificates
    .filter((certificate) => certificate.project_id === projectId && certificate.status === "paid")
    .reduce((max, certificate) => Math.max(max, paymentCertificateCalcs(certificate).total.net), 0);

  return clamp(Math.round((paidToDate / baselineAmount) * 100));
}

function buildProjectSummary(
  currentProject: Project,
  savedBOQs: SavedBOQ[],
  certificates: PaymentCertificate[],
  savedWorkPlans: SavedWorkPlan[],
  progressReports: ProgressReport[],
  generatedDocuments: GeneratedDocument[],
  correspondenceRecords: CorrespondenceRecord[],
  meetingMinutes: MeetingMinute[],
  checklistItems: ChecklistItem[]
): ProjectSummary {
  const projectReports = progressReports
    .filter((report) => report.project_id === currentProject.id)
    .sort((a, b) => a.date.localeCompare(b.date));
  const latestReport = projectReports.at(-1) || null;

  const projectProgress = computeProgressMetrics(latestReport);
  const projectCommercial = computeCommercialSnapshot(currentProject.id, certificates);
  const projectActionItems = getLiveMeetingActionItems(meetingMinutes).filter(
    (action) => action.project_id === currentProject.id
  );
  const openActionPoints = projectActionItems.filter((action) => action.status !== "closed");
  const overdueActionPoints = openActionPoints.filter(
    (action) => action.deadline && action.deadline < new Date().toISOString().split("T")[0]
  );
  const projectChecklistItems = checklistItems.filter((item) => item.project_id === currentProject.id);

  return {
    project: currentProject,
    physical: computePhysicalProgress(currentProject.id, savedWorkPlans),
    financial: computeFinancialProgress(currentProject.id, savedBOQs, certificates, currentProject),
    progress: projectProgress,
    commercial: projectCommercial,
    documents: generatedDocuments.filter((document) => document.project_id === currentProject.id).length,
    correspondence: correspondenceRecords.filter((record) => record.project_id === currentProject.id).length,
    pendingApprovals: correspondenceRecords.filter(
      (record) => record.project_id === currentProject.id && record.status === "pending-approval"
    ).length,
    meetingCount: meetingMinutes.filter((minute) =>
      minute.actionGroups.some((group) => group.project_id === currentProject.id)
    ).length,
    openActionPoints: openActionPoints.length,
    overdueActionPoints: overdueActionPoints.length,
    actionItems: projectActionItems,
    checklistItems: projectChecklistItems,
    checklistMetrics: computeChecklistMetrics(projectChecklistItems),
    workPlan: computeWorkPlanSnapshot(currentProject.id, savedWorkPlans),
    timeline: getTimelineProgress(currentProject),
    progressHistory: projectReports.map((report) => ({
      label: report.name,
      ...computeProgressMetrics(report),
    })),
    commercialHistory: certificates
      .filter((certificate) => certificate.project_id === currentProject.id)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((certificate) => {
        const allItems = certificate.sheets.flatMap((sheet) => sheet.items);
        const subTotal = allItems.reduce((sum, item) => sum + parseAmount(item.totalAmount), 0);
        // Gross valuation is the certified BOQ subtotal; contingency/government
        // tax belong in the BOQ, not the certificate.
        const gross = subTotal;
        const net =
          gross -
          (gross * certificate.retentionPercent) / 100 -
          (gross * certificate.advancePaymentPercent) / 100 -
          (gross * certificate.withholdingTaxPercent) / 100;

        return { label: `IPC ${certificate.number}`, net };
      }),
  };
}

function MiniTrendChart({
  values,
  tone = "accent",
  height = 56,
}: {
  values: number[];
  tone?: Tone;
  height?: number;
}) {
  const style = toneStyles[tone];
  const safeValues = values.length > 1 ? values : [0, ...(values.length ? values : [0]), 0];
  const max = Math.max(...safeValues, 1);
  const min = Math.min(...safeValues, 0);
  const range = Math.max(max - min, 1);

  const points = safeValues
    .map((value, index) => {
      const x = (index / Math.max(safeValues.length - 1, 1)) * 120;
      const y = 36 - ((value - min) / range) * 28;
      return `${x},${y}`;
    })
    .join(" ");

  const area = `0,40 ${points} 120,40`;

  return (
    <svg viewBox="0 0 120 40" className="w-full" style={{ height }}>
      <defs>
        <linearGradient id={`spark-${tone}-${height}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={style.hex} stopOpacity="0.32" />
          <stop offset="100%" stopColor={style.hex} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`M ${area}`} fill={`url(#spark-${tone}-${height})`} />
      <polyline
        fill="none"
        stroke={style.hex}
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points}
      />
    </svg>
  );
}

function RadialGauge({
  value,
  label,
  tone = "accent",
  suffix = "%",
}: {
  value: number;
  label: string;
  tone?: Tone;
  suffix?: string;
}) {
  const style = toneStyles[tone];
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - clamp(value) / 100);

  return (
    <div className="rounded-[24px] border border-border bg-bg-surface p-4">
      <div className="text-[11px] uppercase tracking-[0.18em] text-txt-dim">{label}</div>
      <div className="mt-4 flex items-center justify-between gap-4">
        <div className="relative h-[104px] w-[104px]">
          <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
            <circle cx="50" cy="50" r={radius} stroke="rgba(124, 135, 158, 0.14)" strokeWidth="9" fill="none" />
            <circle
              cx="50"
              cy="50"
              r={radius}
              stroke={style.hex}
              strokeWidth="9"
              fill="none"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-2xl font-black">{clamp(value).toFixed(0)}</div>
            <div className="text-[10px] uppercase tracking-[0.16em] text-txt-dim">{suffix}</div>
          </div>
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold text-txt">
            {clamp(value).toFixed(1)}
            {suffix}
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/5">
            <div
              className="h-full rounded-full"
              style={{
                width: `${clamp(value)}%`,
                background: `linear-gradient(90deg, ${style.hex} 0%, ${style.glow} 100%)`,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  tone = "accent",
  trend,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: LucideIcon;
  tone?: Tone;
  trend: number[];
}) {
  const style = toneStyles[tone];

  return (
    <div className="relative overflow-hidden rounded-[24px] border border-border bg-bg-surface p-4">
      <div
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${style.glow}, transparent)` }}
      />
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-txt-dim">{title}</div>
          <div className="mt-3 text-3xl font-black tracking-tight text-txt">{value}</div>
          <div className="mt-2 text-xs text-txt-muted">{subtitle}</div>
        </div>
        <div
          className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border"
          style={{ background: style.soft, color: style.hex }}
        >
          <Icon size={18} />
        </div>
      </div>
      <div className="mt-4">
        <MiniTrendChart values={trend} tone={tone} />
      </div>
    </div>
  );
}

/**
 * S-curve style planned-vs-actual chart across progress reports. Both series
 * are anchored at 0 (project start) so even a single report draws a line.
 */
function ProgressTrendChart({
  history,
  tone = "ok",
}: {
  history: Array<{ label: string; planned: number; actual: number }>;
  tone?: Tone;
}) {
  const style = toneStyles[tone];
  const planned = [0, ...history.map((entry) => clamp(entry.planned))];
  const actual = [0, ...history.map((entry) => clamp(entry.actual))];
  const max = Math.max(...planned, ...actual, 10);

  const W = 240;
  const H = 88;
  const PAD_TOP = 6;
  const PAD_BOTTOM = 6;
  const plotHeight = H - PAD_TOP - PAD_BOTTOM;
  const x = (index: number) => (index / Math.max(planned.length - 1, 1)) * W;
  const y = (value: number) => PAD_TOP + plotHeight - (value / max) * plotHeight;
  const toPoints = (values: number[]) =>
    values.map((value, index) => `${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(" ");

  const latest = history.at(-1);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 96 }} preserveAspectRatio="none">
        {[0.25, 0.5, 0.75].map((fraction) => (
          <line
            key={fraction}
            x1="0"
            x2={W}
            y1={PAD_TOP + plotHeight * fraction}
            y2={PAD_TOP + plotHeight * fraction}
            stroke="rgba(124, 135, 158, 0.14)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <polygon
          points={`0,${y(0)} ${toPoints(actual)} ${W},${y(0)}`}
          fill={style.hex}
          opacity="0.1"
        />
        <polyline
          fill="none"
          stroke={toneStyles.accent.hex}
          strokeWidth="2"
          strokeDasharray="5 4"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          points={toPoints(planned)}
        />
        <polyline
          fill="none"
          stroke={style.hex}
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          points={toPoints(actual)}
        />
        <circle cx={x(planned.length - 1)} cy={y(planned.at(-1) || 0)} r="3" fill={toneStyles.accent.hex} />
        <circle cx={x(actual.length - 1)} cy={y(actual.at(-1) || 0)} r="3.5" fill={style.hex} />
      </svg>
      <div className="mt-1.5 flex items-center justify-between text-[11px] text-txt-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0 w-4 border-t-2 border-dashed border-accent" />
          Planned {(latest?.planned ?? 0).toFixed(1)}%
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0 w-4 border-t-2" style={{ borderColor: style.hex }} />
          Actual {(latest?.actual ?? 0).toFixed(1)}%
        </span>
      </div>
    </div>
  );
}

function ReferenceMetricTile({
  title,
  value,
  subtitle,
  icon: Icon,
  tone = "accent",
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: LucideIcon;
  tone?: Tone;
  trend?: number[];
}) {
  const style = toneStyles[tone];

  return (
    <div className="rounded-xl border border-border bg-bg-surface px-3.5 py-2.5">
      <div className="flex items-center gap-2.5">
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
          style={{ background: style.soft, color: style.hex }}
        >
          <Icon size={14} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-txt-dim">{title}</div>
          <div className="mt-0.5 truncate text-[13.5px] font-semibold leading-tight tracking-tight text-txt xl:text-base">
            {value}
          </div>
        </div>
      </div>
      <div className="mt-1 truncate text-[11px] leading-snug text-txt-muted">{subtitle}</div>
    </div>
  );
}

function ProgressStrip({
  label,
  value,
  tone = "accent",
}: {
  label: string;
  value: number;
  tone?: Tone;
}) {
  const style = toneStyles[tone];

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.16em] text-txt-dim">
        <span>{label}</span>
        <span className="text-txt">{clamp(value).toFixed(1)}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-black/5">
        <div
          className="h-full rounded-full"
          style={{
            width: `${clamp(value)}%`,
            background: `linear-gradient(90deg, ${style.hex} 0%, ${style.glow} 100%)`,
          }}
        />
      </div>
    </div>
  );
}

export default function Dashboard() {
  const router = useRouter();
  const authConfigured = isSupabaseConfigured();
  const {
    programs,
    categories,
    project,
    projects,
    savedBOQs,
    savedSimpleItemSets,
    certificates,
    savedWorkPlans,
    progressReports,
    generatedDocuments,
    correspondenceRecords,
    meetingMinutes,
    checklistItems,
    createProgram,
    createCategory,
    createNewProject,
    updateProject,
    deleteProject,
    mergeAdoptedWorkspace,
    selectProject,
    setActiveModule,
  } = useAppStore();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState<ProjectFormData>(defaultProjectFormData);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [surp2Importing, setSurp2Importing] = useState(false);
  const [surp2ImportError, setSurp2ImportError] = useState<string | null>(null);
  const [finalCertImporting, setFinalCertImporting] = useState(false);
  const [finalCertImportError, setFinalCertImportError] = useState<string | null>(null);
  const [portfolioFilters, setPortfolioFilters] = useState<PortfolioFilters>({
    programId: "",
    categoryId: "",
    location: "",
    client: "",
  });

  const projectSummaries = useMemo(
    () =>
      projects.map((currentProject) =>
        buildProjectSummary(
          currentProject,
          savedBOQs,
          certificates,
          savedWorkPlans,
          progressReports,
          generatedDocuments,
          correspondenceRecords,
          meetingMinutes,
          checklistItems
        )
      ),
    [
      projects,
      savedBOQs,
      certificates,
      savedWorkPlans,
      progressReports,
      generatedDocuments,
      correspondenceRecords,
      meetingMinutes,
      checklistItems,
    ]
  );

  const activeSummary = useMemo(
    () => projectSummaries.find((summary) => summary.project.id === project?.id) || null,
    [project, projectSummaries]
  );

  // Conditional lock for the project "type" (construction vs non-construction).
  // The type drives which modules render, and the BOQ / Payments / Items datasets
  // are mode-specific — switching type would hide whichever the project already
  // holds. So once a project has any of that mode-specific data, freeze the type
  // field (the project stays editable, just not its workflow kind). Brand-new and
  // still-empty projects remain freely switchable so a wrong pick is easy to fix.
  const editingTypeLock = useMemo(() => {
    if (!editingProject) return { locked: false, reasons: [] as string[] };
    const pid = editingProject.id;
    const reasons: string[] = [];
    if (savedBOQs.some((b) => b.project_id === pid)) reasons.push("a BOQ");
    if (certificates.some((c) => c.project_id === pid)) reasons.push("payment certificates");
    if (savedSimpleItemSets.some((s) => s.project_id === pid)) reasons.push("an items list");
    return { locked: reasons.length > 0, reasons };
  }, [editingProject, savedBOQs, certificates, savedSimpleItemSets]);

  const filteredProjectSummaries = useMemo(
    () =>
      projectSummaries.filter((summary) => {
        const matchesProgram =
          !portfolioFilters.programId ||
          (portfolioFilters.programId === "__unassigned__"
            ? !summary.project.programId
            : summary.project.programId === portfolioFilters.programId);
        const matchesCategory =
          !portfolioFilters.categoryId ||
          (portfolioFilters.categoryId === "__uncategorized__"
            ? !categoryFilterValue(categories, summary.project)
            : categoryFilterValue(categories, summary.project) === portfolioFilters.categoryId);
        const matchesLocation =
          !portfolioFilters.location ||
          normalizeFilterValue(projectLocationFilterValue(summary.project)) === normalizeFilterValue(portfolioFilters.location);
        const matchesClient =
          !portfolioFilters.client ||
          normalizeFilterValue(summary.project.clientName) === normalizeFilterValue(portfolioFilters.client);

        return matchesProgram && matchesCategory && matchesLocation && matchesClient;
      }),
    [categories, portfolioFilters, projectSummaries]
  );

  const openCreateProjectModal = () => {
    setEditingProject(null);
    setFormData(defaultProjectFormData());
    setCreateError(null);
    setIsModalOpen(true);
  };

  const openEditProjectModal = (projectToEdit: Project) => {
    setEditingProject(projectToEdit);
    setFormData(projectToFormData(projectToEdit));
    setCreateError(null);
    setIsModalOpen(true);
  };

  const handleDeleteProject = async (projectToDelete: Project) => {
    const confirmed = window.confirm(
      `Delete "${projectToDelete.name}"?\n\nThis permanently removes the project and all of its BOQs, certificates, reports, documents, checklist items, and site notes. This cannot be undone.`,
    );
    if (!confirmed) return;

    // In auth mode the project is a real Supabase row; delete it there first so
    // it doesn't get re-fetched on the next refresh. The projects FK cascade
    // (on delete cascade) cleans up all project-scoped tables server-side.
    if (authConfigured) {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        window.alert("Supabase environment variables are missing — cannot delete the project.");
        return;
      }
      const { error } = await supabase.from("projects").delete().eq("id", projectToDelete.id);
      if (error) {
        window.alert(`Could not delete the project: ${error.message}`);
        return;
      }
    }

    deleteProject(projectToDelete.id);
  };

  const handleSaveProject = async () => {
    if (!formData.name.trim()) return;

    let resolvedProgramId =
      formData.programId && formData.programId !== "__new__" ? formData.programId : "";
    const shouldCreateProgram = formData.programId === "__new__" && formData.newProgramName.trim();
    let resolvedCategoryId =
      formData.categoryId && !formData.categoryId.startsWith("default:") && formData.categoryId !== "__new__"
        ? formData.categoryId
        : "";
    const shouldCreateCategory = formData.categoryId === "__new__" && formData.newCategoryName.trim();
    const selectedProgramForProject = resolvedProgramId
      ? programs.find((program) => program.id === resolvedProgramId)
      : null;
    const selectedCategoryForProject = resolvedCategoryId
      ? categories.find((category) => category.id === resolvedCategoryId)
      : null;
    const defaultCategoryForProject = formData.categoryId.startsWith("default:")
      ? DEFAULT_PROJECT_CATEGORIES.find((category) => `default:${categorySlug(category.name)}` === formData.categoryId)
      : null;
    const now = new Date().toISOString();
    const projectId = editingProject?.id || uuid();
    const draftProject: Project = {
      id: projectId,
      programId: resolvedProgramId,
      categoryId: resolvedCategoryId,
      organizationId: selectedProgramForProject?.organizationId || editingProject?.organizationId || "",
      name: formData.name.trim(),
      type: formData.type,
      role: formData.role,
      preset: formData.preset || undefined,
      created_at: editingProject?.created_at || now,
      code: formData.code.trim(),
      categoryName:
        selectedCategoryForProject?.name ||
        defaultCategoryForProject?.name ||
        (shouldCreateCategory ? formData.newCategoryName.trim() : ""),
      contractNumber: formData.contractNumber.trim(),
      clientName: formData.clientName.trim(),
      contractorName: formData.contractorName.trim(),
      consultantName: formData.consultantName.trim(),
      location: formData.location.trim(),
      region: formData.region.trim(),
      town: formData.town.trim(),
      latitude: formData.useExactCoordinates ? formData.latitude.trim() : "",
      longitude: formData.useExactCoordinates ? formData.longitude.trim() : "",
      contractTitle: formData.contractTitle.trim(),
      contractAmount: formData.contractAmount.trim(),
      currency: formData.currency.trim() || "USD",
      start_date: formData.start_date,
      end_date: formData.end_date,
      documentBranding: {
        clientLogoDataUrl: formData.documentClientLogoDataUrl,
        clientDisplayName: formData.documentClientDisplayName.trim() || formData.clientName.trim(),
        clientAddress: formData.documentClientAddress.trim(),
        issuerDisplayName:
          formData.documentIssuerDisplayName.trim() || formData.consultantName.trim(),
        issuerAddress: formData.documentIssuerAddress.trim(),
        headerTagline: formData.documentHeaderTagline.trim(),
        issuerPhone: formData.documentIssuerPhone.trim(),
        issuerEmail: formData.documentIssuerEmail.trim(),
        issuerWebsite: formData.documentIssuerWebsite.trim(),
        accentPrimary: formData.documentAccentPrimary.trim(),
        accentSecondary: formData.documentAccentSecondary.trim(),
      },
    };

    if (authConfigured) {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        setCreateError("Supabase environment variables are missing for project creation.");
        return;
      }

      setIsSubmitting(true);
      setCreateError(null);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setIsSubmitting(false);
        router.replace("/login");
        router.refresh();
        return;
      }

      if (shouldCreateProgram) {
        const draftProgram: Program = {
          id: uuid(),
          name: formData.newProgramName.trim(),
          code: formData.newProgramCode.trim(),
          description: "",
          clientName: formData.clientName.trim(),
          location: projectLocationLabel(draftProject) || formData.location.trim(),
          currency: formData.currency.trim() || "USD",
          budgetAmount: "",
          start_date: formData.start_date,
          end_date: formData.end_date,
          status: "active",
          created_at: new Date().toISOString(),
        };
        const { data: programData, error: programError } = await supabase
          .from("programs")
          .insert(toProgramRecord(draftProgram, user.id))
          .select("*")
          .single();

        if (programError) {
          setCreateError(programError.message);
          setIsSubmitting(false);
          return;
        }

        const createdProgram = mapProgramRecord(programData as ProgramRecord);
        createProgram(createdProgram);
        resolvedProgramId = createdProgram.id;
        draftProject.programId = resolvedProgramId;
        draftProject.organizationId = createdProgram.organizationId || draftProject.organizationId;
      }

      if (shouldCreateCategory) {
        const draftCategory: ProjectCategory = {
          id: uuid(),
          name: formData.newCategoryName.trim(),
          code: formData.newCategoryCode.trim(),
          description: "",
          color: "#3b82f6",
          status: "active",
          created_at: new Date().toISOString(),
        };
        const { data: categoryData, error: categoryError } = await supabase
          .from("project_categories")
          .insert(toProjectCategoryRecord(draftCategory, user.id))
          .select("*")
          .single();

        if (categoryError) {
          setCreateError(categoryError.message);
          setIsSubmitting(false);
          return;
        }

        const createdCategory = mapProjectCategoryRecord(categoryData as ProjectCategoryRecord);
        createCategory(createdCategory);
        resolvedCategoryId = createdCategory.id;
        draftProject.categoryId = resolvedCategoryId;
        draftProject.categoryName = createdCategory.name;
      }

      const query = editingProject
        ? supabase
            .from("projects")
            .update(toProjectRecord(draftProject, user.id))
            .eq("id", draftProject.id)
            .select("*")
            .single()
        : supabase
            .from("projects")
            .insert(toProjectRecord(draftProject, user.id))
            .select("*")
            .single();

      const { data, error } = await query;

      if (error) {
        setCreateError(error.message);
        setIsSubmitting(false);
        return;
      }

      const savedProject = mapProjectRecord(data as ProjectRecord);
      if (editingProject) {
        updateProject(savedProject.id, savedProject);
      } else {
        createNewProject(savedProject);
      }
      setIsSubmitting(false);
    } else {
      if (shouldCreateProgram) {
        const draftProgram: Program = {
          id: uuid(),
          name: formData.newProgramName.trim(),
          code: formData.newProgramCode.trim(),
          description: "",
          clientName: formData.clientName.trim(),
          location: projectLocationLabel(draftProject) || formData.location.trim(),
          currency: formData.currency.trim() || "USD",
          budgetAmount: "",
          start_date: formData.start_date,
          end_date: formData.end_date,
          status: "active",
          created_at: new Date().toISOString(),
        };
        createProgram(draftProgram);
        resolvedProgramId = draftProgram.id;
        draftProject.programId = resolvedProgramId;
      }
      if (shouldCreateCategory) {
        const draftCategory: ProjectCategory = {
          id: uuid(),
          name: formData.newCategoryName.trim(),
          code: formData.newCategoryCode.trim(),
          description: "",
          color: "#3b82f6",
          status: "active",
          created_at: new Date().toISOString(),
        };
        createCategory(draftCategory);
        resolvedCategoryId = draftCategory.id;
        draftProject.categoryId = resolvedCategoryId;
        draftProject.categoryName = draftCategory.name;
      }
      if (editingProject) {
        updateProject(draftProject.id, draftProject);
      } else {
        createNewProject(draftProject);
      }
      setCreateError(null);
    }

    setIsModalOpen(false);
    setFormData(defaultProjectFormData());
    setEditingProject(null);
    setCreateError(null);
  };

  // Adopt a sample workspace as the user's own, persisted records. In auth
  // mode we write real owned rows to Supabase (categories → programs →
  // projects, respecting the FK order, then per-project scoped data via the
  // sync endpoint) so the sample survives a refresh and is fully editable. In
  // demo mode the merge into local state is itself persisted by Zustand.
  const adoptWorkspace = async (workspace: AdoptableWorkspace) => {
    if (!authConfigured) {
      mergeAdoptedWorkspace(workspace);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      throw new Error("Supabase environment variables are missing for project creation.");
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      router.replace("/login");
      router.refresh();
      throw new Error("You need to be signed in to adopt a sample project.");
    }

    if (workspace.categories.length > 0) {
      const { error } = await supabase
        .from("project_categories")
        .insert(workspace.categories.map((category) => toProjectCategoryRecord(category, user.id)));
      if (error) throw new Error(error.message);
    }

    if (workspace.programs.length > 0) {
      const { error } = await supabase
        .from("programs")
        .insert(workspace.programs.map((program) => toProgramRecord(program, user.id)));
      if (error) throw new Error(error.message);
    }

    if (workspace.projects.length > 0) {
      const { error } = await supabase
        .from("projects")
        .insert(workspace.projects.map((project) => toProjectRecord(project, user.id)));
      if (error) throw new Error(error.message);
    }

    // Project-scoped data (BOQ, work plans, certificates, progress reports) is
    // persisted through the workspace sync endpoint, which processes one active
    // project at a time and filters the payload by project_id.
    const syncPayload = {
      ...emptyConstructionWorkspacePayload(),
      savedBOQs: workspace.savedBOQs,
      savedWorkPlans: workspace.savedWorkPlans,
      certificates: workspace.certificates,
      progressReports: workspace.progressReports,
    };

    for (const project of workspace.projects) {
      const response = await fetch("/api/workspace/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payload: syncPayload,
          activeProjectId: project.id,
          activeModule: "dashboard",
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || "Could not save sample project data.");
      }
    }

    mergeAdoptedWorkspace(workspace);
  };

  const handleImportSurp2 = async () => {
    setSurp2Importing(true);
    setSurp2ImportError(null);
    try {
      const workspace = remintAdoptableWorkspace(buildRoadPackagesDemoPayload());
      await adoptWorkspace(workspace);
      setPortfolioFilters({
        programId: workspace.programs[0]?.id ?? "",
        categoryId: "",
        location: "",
        client: "",
      });
      setActiveModule("dashboard");
      setIsModalOpen(false);
    } catch (error) {
      setSurp2ImportError(error instanceof Error ? error.message : "Could not load road package demo data.");
    } finally {
      setSurp2Importing(false);
    }
  };

  const handleImportFinalCertificateTest = async () => {
    setFinalCertImporting(true);
    setFinalCertImportError(null);
    try {
      const workspace = remintAdoptableWorkspace(buildFinalCertificateDemoPayload());
      await adoptWorkspace(workspace);
      setPortfolioFilters({
        programId: workspace.programs[0]?.id ?? "",
        categoryId: "",
        location: "",
        client: "",
      });
      setActiveModule("dashboard");
      setIsModalOpen(false);
    } catch (error) {
      setFinalCertImportError(
        error instanceof Error ? error.message : "Could not load final certificate demo data."
      );
    } finally {
      setFinalCertImporting(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1360px] animate-fade-in">
      {project && activeSummary ? (
        <ProjectOverviewDashboard
          summary={activeSummary}
          onCreateProject={openCreateProjectModal}
          onEditProject={openEditProjectModal}
          onOpenChecklist={() => setActiveModule("checklist")}
        />
      ) : (
        <PortfolioDashboard
          summaries={filteredProjectSummaries}
          allSummaries={projectSummaries}
          programs={programs}
          categories={categories}
          filters={portfolioFilters}
          onFiltersChange={setPortfolioFilters}
          onOpenProject={(projectId) => {
            selectProject(projectId);
            setActiveModule("dashboard");
          }}
          onCreateProject={openCreateProjectModal}
          onEditProject={openEditProjectModal}
          onDeleteProject={handleDeleteProject}
        />
      )}

      <CreateProjectModal
        open={isModalOpen}
        onClose={() => {
          if (isSubmitting || surp2Importing || finalCertImporting) return;
          setIsModalOpen(false);
          setCreateError(null);
          setEditingProject(null);
        }}
        mode={editingProject ? "edit" : "create"}
        typeLock={editingTypeLock}
        formData={formData}
        setFormData={setFormData}
        programs={programs}
        categories={categories}
        onSubmit={handleSaveProject}
        submitting={isSubmitting}
        errorMessage={createError}
        onImportSurp2={handleImportSurp2}
        onImportFinalCertificateTest={handleImportFinalCertificateTest}
        importingSurp2={surp2Importing}
        importingFinalCertificateTest={finalCertImporting}
        sampleImportError={surp2ImportError || finalCertImportError}
      />
    </div>
  );
}

function PortfolioDashboard({
  summaries,
  allSummaries,
  programs,
  categories,
  filters,
  onFiltersChange,
  onOpenProject,
  onCreateProject,
  onEditProject,
  onDeleteProject,
}: {
  summaries: ProjectSummary[];
  allSummaries: ProjectSummary[];
  programs: Program[];
  categories: ProjectCategory[];
  filters: PortfolioFilters;
  onFiltersChange: Dispatch<SetStateAction<PortfolioFilters>>;
  onOpenProject: (projectId: string) => void;
  onCreateProject: () => void;
  onEditProject: (project: Project) => void;
  onDeleteProject: (project: Project) => void;
}) {
  const [rowMenu, setRowMenu] = useState<{ x: number; y: number; project: Project } | null>(null);
  const locations = uniqueFilterValues(allSummaries.map((summary) => projectLocationFilterValue(summary.project)));
  const clients = uniqueFilterValues(allSummaries.map((summary) => summary.project.clientName));
  const defaultCategoryOptions = DEFAULT_PROJECT_CATEGORIES.filter((category) =>
    allSummaries.some((summary) => categoryFilterValue(categories, summary.project) === `default:${categorySlug(category.name)}`)
  );
  const activeCategories = categories.filter((category) => category.status === "active");
  const hasUnassigned = allSummaries.some((summary) => !summary.project.programId);
  const hasUncategorized = allSummaries.some((summary) => !categoryFilterValue(categories, summary.project));
  const activeFilterCount = [filters.programId, filters.categoryId, filters.location, filters.client].filter(Boolean).length;
  const filteredProjectValue = summaries.reduce((sum, summary) => sum + parseAmount(summary.project.contractAmount), 0);
  const totalProjects = summaries.length;
  const totalProgressReports = summaries.reduce((sum, summary) => sum + summary.progressHistory.length, 0);
  const totalDocuments = summaries.reduce((sum, summary) => sum + summary.documents, 0);
  const totalCorrespondence = summaries.reduce((sum, summary) => sum + summary.correspondence, 0);
  const totalPendingApprovals = summaries.reduce((sum, summary) => sum + summary.pendingApprovals, 0);
  const totalMeetings = summaries.reduce((sum, summary) => sum + summary.meetingCount, 0);
  const totalOpenActions = summaries.reduce((sum, summary) => sum + summary.openActionPoints, 0);
  const totalApprovedCommercial = summaries.reduce(
    (sum, summary) => sum + Math.max(summary.commercial.approved, summary.commercial.paid),
    0
  );
  const totalCertifiedOrPaid = totalApprovedCommercial;
  const balance = Math.max(filteredProjectValue - totalCertifiedOrPaid, 0);
  const weightBase = filteredProjectValue || summaries.length;
  const getWeight = (summary: ProjectSummary) =>
    weightBase > 0
      ? (filteredProjectValue ? parseAmount(summary.project.contractAmount) : 1) / weightBase
      : 0;
  const averageFinancial =
    summaries.length > 0 ? summaries.reduce((sum, summary) => sum + summary.financial * getWeight(summary), 0) : 0;
  const averagePlanned =
    summaries.length > 0
      ? summaries.reduce((sum, summary) => sum + summary.progress.planned * getWeight(summary), 0)
      : 0;
  const averageActual =
    summaries.length > 0
      ? summaries.reduce((sum, summary) => sum + summary.progress.actual * getWeight(summary), 0)
      : 0;

  const metricCards = [
    {
      title: "Projects",
      value: String(totalProjects),
      subtitle: "Registered project workspaces across the portfolio",
      icon: Building2,
      tone: "accent" as Tone,
      trend: [0, Math.max(totalProjects - 1, 0), totalProjects, totalProjects],
    },
    {
      title: "Financial Avg",
      value: `${averageFinancial.toFixed(0)}%`,
      subtitle: "Average certified commercial progress",
      icon: Wallet,
      tone: "accent" as Tone,
      trend: summaries.map((summary) => summary.financial),
    },
    {
      title: "Open Actions",
      value: String(totalOpenActions),
      subtitle: `${totalMeetings} meeting minutes and ${totalCorrespondence} correspondence records`,
      icon: TrendingUp,
      tone: totalOpenActions > 0 ? ("warn" as Tone) : ("ok" as Tone),
      trend: summaries.map((summary) => summary.openActionPoints),
    },
    {
      title: "Approved Commercial",
      value: `USD ${currency(totalApprovedCommercial)}`,
      subtitle: `${totalDocuments} documents and ${totalProgressReports} progress reports`,
      icon: FileText,
      tone: "accent" as Tone,
      trend: summaries.map((summary) => Math.max(summary.commercial.approved, summary.commercial.paid)),
    },
  ];

  const kpiRows: CompactKpiRow[] = metricCards.map((card) => ({
    label: card.title,
    value: card.title === "Approved Commercial" ? compactUsd(totalApprovedCommercial) : card.value,
    icon: card.icon,
    tone: card.tone,
  }));

  return (
    <>
      <div className="mb-5 border-b border-border pb-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-txt">Portfolio</h2>
            <p className="mt-1 text-[13px] text-txt-muted">
              {totalProjects} {totalProjects === 1 ? "project" : "projects"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" size="sm" onClick={onCreateProject}>
              <Plus size={14} /> New Project
            </Button>
          </div>
        </div>
      </div>

      <div className="mb-5 rounded-[24px] border border-border bg-bg-surface p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
          <div className="grid flex-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="space-y-2">
              <span className="text-[10px] font-black uppercase tracking-[0.18em] text-txt-dim">
                Program
              </span>
              <select
                className="w-full rounded-xl border border-border bg-bg-input px-3 py-2.5 text-sm font-semibold text-txt outline-none focus:border-accent"
                value={filters.programId}
                onChange={(event) =>
                  onFiltersChange((prev) => ({ ...prev, programId: event.target.value }))
                }
              >
                <option value="">All programs</option>
                {programs.map((program) => (
                  <option key={program.id} value={program.id}>
                    {program.code ? `${program.code} - ${program.name}` : program.name}
                  </option>
                ))}
                {hasUnassigned ? <option value="__unassigned__">Unassigned projects</option> : null}
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-[10px] font-black uppercase tracking-[0.18em] text-txt-dim">
                Category
              </span>
              <select
                className="w-full rounded-xl border border-border bg-bg-input px-3 py-2.5 text-sm font-semibold text-txt outline-none focus:border-accent"
                value={filters.categoryId}
                onChange={(event) =>
                  onFiltersChange((prev) => ({ ...prev, categoryId: event.target.value }))
                }
              >
                <option value="">All categories</option>
                {activeCategories.length > 0 ? (
                  <optgroup label="Official / saved categories">
                    {activeCategories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.code ? `${category.code} - ${category.name}` : category.name}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                {defaultCategoryOptions.length > 0 ? (
                  <optgroup label="Default categories in use">
                    {defaultCategoryOptions.map((category) => (
                      <option key={category.name} value={`default:${categorySlug(category.name)}`}>
                        {category.name}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                {hasUncategorized ? <option value="__uncategorized__">Uncategorized projects</option> : null}
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-[10px] font-black uppercase tracking-[0.18em] text-txt-dim">
                Location
              </span>
              <select
                className="w-full rounded-xl border border-border bg-bg-input px-3 py-2.5 text-sm font-semibold text-txt outline-none focus:border-accent"
                value={filters.location}
                onChange={(event) =>
                  onFiltersChange((prev) => ({ ...prev, location: event.target.value }))
                }
              >
                <option value="">All locations</option>
                {locations.map((location) => (
                  <option key={location} value={location}>
                    {location}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-[10px] font-black uppercase tracking-[0.18em] text-txt-dim">
                Client
              </span>
              <select
                className="w-full rounded-xl border border-border bg-bg-input px-3 py-2.5 text-sm font-semibold text-txt outline-none focus:border-accent"
                value={filters.client}
                onChange={(event) =>
                  onFiltersChange((prev) => ({ ...prev, client: event.target.value }))
                }
              >
                <option value="">All clients</option>
                {clients.map((client) => (
                  <option key={client} value={client}>
                    {client}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <Button
            variant="ghost"
            size="sm"
            disabled={activeFilterCount === 0}
            onClick={() => onFiltersChange({ programId: "", categoryId: "", location: "", client: "" })}
          >
            <X size={14} /> Clear filters
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-txt-muted">
          <span className="rounded-full border border-border bg-bg px-3 py-1">
            Showing {summaries.length} of {allSummaries.length} projects
          </span>
          {filters.programId ? (
            <span className="rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-accent">
              Program: {filters.programId === "__unassigned__" ? "Unassigned" : programLabel(programs, filters.programId)}
            </span>
          ) : null}
          {filters.categoryId ? (
            <span className="rounded-full border border-ok/30 bg-ok/10 px-3 py-1 text-ok">
              Category: {categoryFilterLabel(categories, filters.categoryId)}
            </span>
          ) : null}
          {filters.location ? <span className="rounded-full border border-border px-3 py-1">{filters.location}</span> : null}
          {filters.client ? <span className="rounded-full border border-border px-3 py-1">{filters.client}</span> : null}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-bg-surface p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-txt">Portfolio summary</h3>
          <span className="text-[11px] text-txt-dim">
            Planned {averagePlanned.toFixed(1)}% · Actual {averageActual.toFixed(1)}%
          </span>
        </div>
        <CompactKpiList
          className="sm:hidden"
          rows={[
            {
              label: "Contract value",
              value: `USD ${currency(filteredProjectValue)}`,
              icon: FileText,
              tone: "accent",
            },
            {
              label: "Balance",
              value: `USD ${currency(balance)}`,
              icon: Wallet,
              tone: "warn",
            },
            {
              label: "Pending approvals",
              value: totalPendingApprovals,
              icon: ClipboardList,
              tone: "neutral",
            },
          ]}
        />
        <div className="hidden gap-2 sm:grid sm:grid-cols-3">
          <div className="rounded-lg border border-border border-t-2 border-t-accent bg-bg px-3 py-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-txt-dim">Contract value</div>
            <div className="mt-0.5 font-mono text-base font-semibold tabular-nums text-accent">
              USD {currency(filteredProjectValue)}
            </div>
          </div>
          <div className="rounded-lg border border-border border-t-2 border-t-ok bg-bg px-3 py-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-txt-dim">Balance</div>
            <div className="mt-0.5 font-mono text-base font-semibold tabular-nums text-ok">
              USD {currency(balance)}
            </div>
          </div>
          <div className="rounded-lg border border-border border-t-2 border-t-warn bg-bg px-3 py-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-txt-dim">Pending approvals</div>
            <div className="mt-0.5 font-mono text-base font-semibold tabular-nums text-warn">
              {totalPendingApprovals}
            </div>
          </div>
        </div>
      </div>

      <ProjectLocationsCard summaries={summaries} kpis={kpiRows} />

      <div className="mt-5 sm:hidden">
        <CompactKpiList header={{ label: "Portfolio KPIs", value: "Value" }} rows={kpiRows} />
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-border bg-bg-surface">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-txt">Projects</h3>
          <span className="rounded-full border border-border bg-bg px-2.5 py-0.5 text-[11px] text-txt-muted">
            {summaries.length}
          </span>
        </div>

        <div className="space-y-3 p-4 xl:hidden">
          {summaries.length === 0 ? (
            <div className="rounded-2xl border border-border bg-bg p-8 text-center text-sm text-txt-muted">
              No projects yet. Create a project to begin.
            </div>
          ) : (
            summaries.map((summary) => (
              <div key={`${summary.project.id}-mobile`} className="rounded-2xl border border-border bg-bg p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <button
                      className="bg-transparent p-0 text-left text-base font-black text-accent transition hover:underline"
                      onClick={() => onOpenProject(summary.project.id)}
                    >
                      {summary.project.name}
                    </button>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => onEditProject(summary.project)}>
                      <PenTool size={14} /> Edit
                    </Button>
                    <button
                      type="button"
                      onClick={() => onDeleteProject(summary.project)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-txt-dim transition hover:bg-rose-500/10 hover:text-rose-400"
                      aria-label={`Delete ${summary.project.name}`}
                      title="Delete project"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-border bg-bg-surface/60 p-3">
                    <div className="mb-2 text-[10px] uppercase tracking-[0.16em] text-txt-dim">Planned vs actual</div>
                    <div className="space-y-2">
                      <ProgressStrip label="Plan" value={summary.progress.planned} tone="accent" />
                      <ProgressStrip label="Actual" value={summary.progress.actual} tone={summary.progress.variance >= 0 ? "ok" : "warn"} />
                    </div>
                  </div>
                  <div className="rounded-xl border border-border bg-bg-surface/60 p-3">
                    <div className="text-[10px] uppercase tracking-[0.16em] text-txt-dim">Financial</div>
                    <div className="mt-1 text-xl font-black text-txt">{summary.financial}%</div>
                  </div>
                </div>
                <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-border bg-bg px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-txt-muted">
                  <span className="text-[12px] leading-none">{getProjectPreset(summary.project.preset || (summary.project.type === "construction" ? "construction" : "other")).marker}</span>
                  {getProjectPreset(summary.project.preset || (summary.project.type === "construction" ? "construction" : "other")).badgeLabel}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="hidden overflow-x-auto xl:block">
          <table className="w-full min-w-[920px] border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-txt-dim">Project</th>
                <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-txt-dim" style={{ width: 220 }}>Planned vs Actual</th>
                <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-txt-dim" style={{ width: 160 }}>Financial</th>
                <th className="px-2 py-2" style={{ width: 44 }} aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {summaries.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-14 text-center text-sm text-txt-muted">
                    No projects yet. Create a project to begin.
                  </td>
                </tr>
              ) : (
                summaries.map((summary) => {
                  const ahead = summary.progress.actual >= summary.progress.planned;
                  const meta = [projectLocationLabel(summary.project), summary.project.clientName]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <tr key={summary.project.id} className="border-t border-border/60 align-middle hover:bg-bg-hover/40">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <button
                            className="min-w-0 truncate bg-transparent p-0 text-left text-sm font-semibold text-accent transition hover:underline"
                            onClick={() => onOpenProject(summary.project.id)}
                          >
                            {summary.project.name}
                          </button>
                        </div>
                        {meta ? (
                          <div className="mt-0.5 truncate text-[11px] text-txt-dim">{meta}</div>
                        ) : null}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-between text-[11px] font-medium text-txt-muted">
                          <span><span className="text-txt-dim">Plan</span> {summary.progress.planned.toFixed(0)}%</span>
                          <span className={ahead ? "text-ok" : "text-warn"}>
                            <span className="text-txt-dim">Act</span> {summary.progress.actual.toFixed(0)}%
                          </span>
                        </div>
                        <div className="mt-1 space-y-0.5">
                          <div className="h-1 overflow-hidden rounded-full bg-black/5">
                            <div
                              className="h-full bg-accent"
                              style={{ width: `${clamp(summary.progress.planned)}%` }}
                            />
                          </div>
                          <div className="h-1 overflow-hidden rounded-full bg-black/5">
                            <div
                              className={`h-full ${ahead ? "bg-ok" : "bg-warn"}`}
                              style={{ width: `${clamp(summary.progress.actual)}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="w-10 font-mono text-sm font-semibold tabular-nums text-txt">
                            {summary.financial}%
                          </span>
                          <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-black/5">
                            <div
                              className="h-full bg-accent"
                              style={{ width: `${clamp(summary.financial)}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-2.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setRowMenu({
                              x: rect.right - 180,
                              y: rect.bottom + 4,
                              project: summary.project,
                            });
                          }}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-txt-dim transition hover:bg-bg-hover hover:text-txt"
                          aria-label={`Actions for ${summary.project.name}`}
                          title="Project actions"
                        >
                          <MoreVertical size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {rowMenu && (
        <ContextMenu
          x={rowMenu.x}
          y={rowMenu.y}
          onClose={() => setRowMenu(null)}
          items={[
            {
              label: "Edit",
              icon: <PenTool size={14} />,
              action: () => onEditProject(rowMenu.project),
            },
            {
              label: "Delete",
              icon: <Trash2 size={14} />,
              danger: true,
              action: () => onDeleteProject(rowMenu.project),
            },
          ]}
        />
      )}
    </>
  );
}

type ProjectMapPoint = {
  id: string;
  label: string;
  subtitle: string;
  latitude: number;
  longitude: number;
  source: string;
  count: number;
  projects: Array<{
    id: string;
    name: string;
    code: string;
    contractNumber: string;
    contractAmount: string;
    currency: string;
    physical: number;
    financial: number;
  }>;
};

function buildProjectMapPoints(summaries: ProjectSummary[]): ProjectMapPoint[] {
  const grouped = new Map<string, ProjectMapPoint>();

  summaries.forEach((summary) => {
    const coordinates = resolveProjectCoordinates(summary.project);
    if (!coordinates) return;

    const label = projectLocationLabel(summary.project) || summary.project.name;
    const key = `${coordinates.latitude.toFixed(3)}:${coordinates.longitude.toFixed(3)}:${label}`;
    const projectEntry = {
      id: summary.project.id,
      name: summary.project.name,
      code: summary.project.code || "",
      contractNumber: summary.project.contractNumber || "",
      contractAmount: summary.project.contractAmount || "",
      currency: summary.project.currency || "USD",
      physical: summary.physical,
      financial: summary.financial,
    };
    const existing = grouped.get(key);

    if (existing) {
      existing.count += 1;
      existing.subtitle = `${existing.count} projects in this location`;
      existing.projects.push(projectEntry);
      return;
    }

    grouped.set(key, {
      id: key,
      label,
      subtitle: summary.project.name,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      source: coordinates.source,
      count: 1,
      projects: [projectEntry],
    });
  });

  return Array.from(grouped.values());
}

function ProjectLocationsCard({
  summaries,
  kpis = [],
}: {
  summaries: ProjectSummary[];
  kpis?: CompactKpiRow[];
}) {
  const [open, setOpen] = useState(false);
  const points = useMemo(() => buildProjectMapPoints(summaries), [summaries]);
  const plottedCount = points.reduce((sum, point) => sum + point.count, 0);
  const missingCount = Math.max(summaries.length - plottedCount, 0);

  return (
    <>
      <div className="mt-5 hidden w-full overflow-hidden rounded-[24px] border border-border bg-bg-surface text-left shadow-soft sm:block">
        <div className="grid gap-0 lg:grid-cols-[0.72fr_1.28fr]">
          <div className="flex flex-col gap-4 border-b border-border p-5 lg:border-b-0 lg:border-r">
            <div
              role="button"
              tabIndex={0}
              onClick={() => setOpen(true)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") setOpen(true);
              }}
              className="flex items-start justify-between gap-3 rounded-lg transition hover:opacity-80"
            >
              <div>
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-txt-dim">
                  <MapPin size={14} className="text-accent" /> Locations
                </div>
                <div className="mt-1.5 text-lg font-semibold text-txt">Portfolio map</div>
              </div>
              <span className="rounded-xl border border-border bg-bg p-2 text-txt-muted">
                <Maximize2 size={16} />
              </span>
            </div>

            {kpis.length > 0 ? (
              <div className="mt-auto">
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-txt-dim">
                  Portfolio KPIs
                </div>
                <CompactKpiList rows={kpis} />
              </div>
            ) : null}
          </div>
          <ProjectLocationMap points={points} missingCount={missingCount} />
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Project Locations" width={1080}>
        <div className="space-y-4">
          <ProjectLocationMap points={points} missingCount={missingCount} large />
          <div className="grid gap-3 md:grid-cols-2">
            {points.length === 0 ? (
              <div className="rounded-2xl border border-border bg-bg p-4 text-sm text-txt-muted">
                No projects in the current filter have region/town or exact coordinates yet.
              </div>
            ) : (
              points.map((point) => (
                <div key={point.id} className="rounded-2xl border border-border bg-bg p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-bold text-txt">{point.label}</div>
                      <div className="mt-1 text-xs text-txt-muted">{point.subtitle}</div>
                    </div>
                    <span className="rounded-full border border-accent/30 bg-accent/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-accent">
                      {point.count}
                    </span>
                  </div>
                  <div className="mt-3 text-[11px] text-txt-dim">
                    {point.source} - {point.latitude.toFixed(4)}, {point.longitude.toFixed(4)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}

const escapeMapHtml = (value: string | number) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

function projectMapPopupHtml(point: ProjectMapPoint) {
  const projectRows = point.projects
    .map(
      (project) => `
        <div class="planovera-map-project">
          <div class="planovera-map-project-title">${escapeMapHtml(project.name)}</div>
          <div class="planovera-map-project-meta">
            ${escapeMapHtml(project.contractNumber || project.code || "No reference")} · ${escapeMapHtml(project.currency)} ${escapeMapHtml(currency(project.contractAmount || 0))}
          </div>
          <div class="planovera-map-project-meta">
            Physical ${escapeMapHtml(project.physical)}% · Financial ${escapeMapHtml(project.financial)}%
          </div>
        </div>
      `
    )
    .join("");

  return `
    <div class="planovera-map-popup">
      <div class="planovera-map-popup-label">${escapeMapHtml(point.label)}</div>
      <div class="planovera-map-popup-source">${escapeMapHtml(point.source)}</div>
      ${projectRows}
    </div>
  `;
}

function ProjectLocationMap({
  points,
  missingCount,
  large = false,
}: {
  points: ProjectMapPoint[];
  missingCount: number;
  large?: boolean;
}) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const markerLayerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const height = large ? "h-[560px]" : "h-[280px]";

  useEffect(() => {
    let cancelled = false;

    async function initMap() {
      if (!mapContainerRef.current) return;

      const L = await import("leaflet");
      if (cancelled || !mapContainerRef.current) return;

      if (!mapRef.current) {
        mapRef.current = L.map(mapContainerRef.current, {
          zoomControl: large,
          scrollWheelZoom: large,
          attributionControl: large,
        }).setView([5.15, 46.2], 5);

        L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
          maxZoom: 19,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        }).addTo(mapRef.current);

        markerLayerRef.current = L.layerGroup().addTo(mapRef.current);
      }

      const map = mapRef.current;
      const markerLayer = markerLayerRef.current;
      markerLayer?.clearLayers();

      const bounds: Array<[number, number]> = [];
      points.forEach((point) => {
        const marker = L.marker([point.latitude, point.longitude], {
          icon: L.divIcon({
            className: "planovera-map-marker",
            html: `<span>${point.count}</span>`,
            iconAnchor: [18, 18],
            iconSize: [36, 36],
          }),
          title: `${point.label} - ${point.subtitle}`,
        }).bindPopup(projectMapPopupHtml(point), {
          className: "planovera-map-popup-shell",
          maxWidth: large ? 340 : 280,
        });

        marker.addTo(markerLayer!);
        bounds.push([point.latitude, point.longitude]);
      });

      if (bounds.length > 0) {
        map.fitBounds(bounds, {
          padding: large ? [64, 64] : [36, 36],
          maxZoom: large ? 13 : 9,
        });
      } else {
        map.setView([5.15, 46.2], 5);
      }

      window.setTimeout(() => map.invalidateSize(), 0);
    }

    initMap().catch(() => {
      if (!cancelled) {
        setMapError("Map tiles could not be loaded. Project locations are still listed below.");
      }
    });

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerLayerRef.current = null;
      }
    };
  }, [large, points]);

  return (
    <div className={`relative ${height} overflow-hidden bg-bg-surface`}>
      <div ref={mapContainerRef} className="h-full w-full" />

      <div className="pointer-events-none absolute left-5 top-5 rounded-2xl border border-border bg-bg-surface/95 px-4 py-3 shadow-soft backdrop-blur">
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-txt-dim">
          Somalia Project Map
        </div>
        <div className="mt-1 text-sm font-bold text-txt">
          {points.reduce((sum, point) => sum + point.count, 0)} plotted projects
        </div>
      </div>

      {missingCount > 0 ? (
        <div className="pointer-events-none absolute right-5 top-5 rounded-full border border-warn/30 bg-bg-surface/95 px-3 py-1 text-xs font-bold text-warn backdrop-blur">
          {missingCount} missing location
        </div>
      ) : null}

      {mapError ? (
        <div className="absolute inset-x-5 bottom-5 rounded-2xl border border-warn/30 bg-bg-surface/95 px-4 py-3 text-sm text-warn shadow-soft backdrop-blur">
          {mapError}
        </div>
      ) : null}
    </div>
  );
}

function ProjectOverviewDashboard({
  summary,
  onCreateProject,
  onEditProject,
  onOpenChecklist,
}: {
  summary: ProjectSummary;
  onCreateProject: () => void;
  onEditProject: (project: Project) => void;
  onOpenChecklist: () => void;
}) {
  const {
    project,
    financial,
    progress,
    commercial,
    documents,
    correspondence,
    pendingApprovals,
    meetingCount,
    openActionPoints,
    overdueActionPoints,
    actionItems,
    checklistItems,
    checklistMetrics,
    workPlan,
    timeline,
    progressHistory,
    commercialHistory,
  } = summary;
  const [showActionModal, setShowActionModal] = useState(false);
  const [showChecklistModal, setShowChecklistModal] = useState(false);
  const sortedChecklistItems = useMemo(
    () =>
      [...checklistItems].sort((a, b) => {
        const overdueDelta = Number(isChecklistItemOverdue(b)) - Number(isChecklistItemOverdue(a));
        if (overdueDelta !== 0) return overdueDelta;
        return (a.dueDate || "9999-12-31").localeCompare(b.dueDate || "9999-12-31");
      }),
    [checklistItems]
  );
  const canPayment =
    project.type === "construction" &&
    (project.role === "supervision" || project.role === "employer");

  // Use elapsed-time percentage as the planned baseline (linear plan), then
  // compare it against the actual physical progress for the variance badge.
  const timePercent = timeline?.percent ?? 0;
  const timeVariance = progress.actual - timePercent;

  const metricCards = [
    {
      title: "Contract Value",
      value: `${project.currency || "USD"} ${currency(project.contractAmount || 0)}`,
      subtitle: project.clientName || "Client not set",
      icon: Wallet,
      tone: "accent" as Tone,
      trend: [1, 1, 1, 1],
    },
    {
      title: "Physical Progress",
      value: `${progress.actual.toFixed(1)}%`,
      subtitle: `Planned ${progress.planned.toFixed(1)}% vs actual ${progress.actual.toFixed(1)}%`,
      icon: Activity,
      tone: progress.variance >= 0 ? ("ok" as Tone) : ("warn" as Tone),
      trend: progressHistory.map((item) => item.actual),
    },
    {
      title: "Certified To Date",
      value: `${project.currency || "USD"} ${currency(Math.max(commercial.approved, commercial.paid))}`,
      subtitle: `${project.currency || "USD"} ${currency(commercial.submitted)} submitted and pending`,
      icon: DollarSign,
      tone: "accent" as Tone,
      trend: commercialHistory.map((item) => item.net),
    },
    (() => {
      const contractValue = parseAmount(project.contractAmount);
      const certifiedToDate = Math.max(commercial.approved, commercial.paid);
      const remaining = Math.max(0, contractValue - certifiedToDate);
      const percentLeft = contractValue > 0 ? (remaining / contractValue) * 100 : 0;
      return {
        title: "Contract Remaining",
        value: `${project.currency || "USD"} ${currency(remaining)}`,
        subtitle:
          contractValue > 0
            ? `${percentLeft.toFixed(1)}% of contract value left`
            : "Set contract amount to track remaining",
        icon: Coins,
        tone: (remaining <= 0 ? "ok" : percentLeft > 50 ? "accent" : "warn") as Tone,
        trend: [],
      };
    })(),
  ];

  return (
    <>
      <div className="mb-5 border-b border-border pb-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-txt">{project.name}</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" onClick={() => onEditProject(project)}>
              <PenTool size={14} /> Edit Project
            </Button>
            <Button variant="primary" size="sm" onClick={onCreateProject}>
              <Plus size={14} /> New Project
            </Button>
          </div>
        </div>
      </div>

      <div className="sm:hidden">
        <CompactKpiList
          rows={metricCards.map((card) => ({
            label: card.title,
            value: card.value,
            icon: card.icon,
            tone: card.tone,
          }))}
        />
      </div>
      <div className="hidden gap-3 sm:grid sm:grid-cols-2 md:grid-cols-4">
        {metricCards.map((card) => (
          <ReferenceMetricTile key={card.title} {...card} />
        ))}
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-2xl border border-border bg-bg-surface p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-txt">Progress</h3>
            <span
              className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                timeVariance >= 0
                  ? "border-ok/25 bg-ok/10 text-ok"
                  : "border-warn/25 bg-warn/10 text-warn"
              }`}
            >
              {timeVariance >= 0 ? "+" : ""}
              {timeVariance.toFixed(1)}% variance
            </span>
          </div>

          <div className="space-y-4">
            <div className="space-y-3">
              <ProgressStrip label="Planned (time)" value={timePercent} tone="accent" />
              <ProgressStrip label="Actual" value={progress.actual} tone={timeVariance >= 0 ? "ok" : "warn"} />
              <ProgressStrip label="Financial (paid vs contract)" value={financial} tone="accent" />
            </div>

            <div className="border-t border-border pt-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">
                  Progress reports — planned vs actual
                </span>
                <span className="text-[11px] text-txt-muted">
                  {progressHistory.length} report{progressHistory.length === 1 ? "" : "s"}
                </span>
              </div>
              {progressHistory.length > 0 ? (
                <ProgressTrendChart
                  history={progressHistory}
                  tone={timeVariance >= 0 ? "ok" : "warn"}
                />
              ) : (
                <div className="rounded-lg border border-dashed border-border px-4 py-5 text-center text-[12px] text-txt-muted">
                  Create progress reports to see the planned-vs-actual trend here.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-bg-surface p-5">
          <h3 className="mb-4 text-sm font-semibold text-txt">Timeline</h3>

          {timeline ? (
            <>
              <ProgressStrip label={`${timeline.elapsedDays} of ${timeline.totalDays} days`} value={timeline.percent} tone="warn" />
              <div className="mt-5 grid gap-2 text-xs sm:grid-cols-3">
                <div className="rounded-lg border border-border bg-bg px-3 py-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">Start</div>
                  <div className="mt-0.5 font-semibold text-txt">{project.start_date || "—"}</div>
                </div>
                <div className="rounded-lg border border-border bg-bg px-3 py-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">Remaining</div>
                  <div className="mt-0.5 font-semibold text-txt">{timeline.remainingDays} days</div>
                </div>
                <div className="rounded-lg border border-border bg-bg px-3 py-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">Finish</div>
                  <div className="mt-0.5 font-semibold text-txt">{project.end_date || "—"}</div>
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-lg border border-dashed border-border p-6 text-center text-[13px] text-txt-muted">
              Set project start and finish dates to activate timeline tracking.
            </div>
          )}

          <div className="mt-5 border-t border-border pt-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">Work plan</span>
              {workPlan.total > 0 ? (
                <span className="text-[11px] text-txt-muted">
                  {workPlan.completed}/{workPlan.total} activities done
                </span>
              ) : null}
            </div>

            {workPlan.total > 0 ? (
              <>
                <div className="flex h-2 overflow-hidden rounded-full bg-black/5">
                  {([
                    [workPlan.completed, "bg-ok"],
                    [workPlan.inProgress, "bg-accent"],
                    [workPlan.delayed, "bg-err"],
                  ] as const).map(([count, color], index) =>
                    count > 0 ? (
                      <div
                        key={index}
                        className={color}
                        style={{ width: `${(count / workPlan.total) * 100}%` }}
                      />
                    ) : null
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-txt-muted">
                  {([
                    ["Done", workPlan.completed, "bg-ok"],
                    ["In progress", workPlan.inProgress, "bg-accent"],
                    ["Delayed", workPlan.delayed, "bg-err"],
                    ["Pending", workPlan.pending, "bg-black/20"],
                  ] as const).map(([label, count, dot]) => (
                    <span key={label} className="inline-flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${dot}`} />
                      {label} <span className="font-semibold tabular-nums text-txt">{count}</span>
                    </span>
                  ))}
                </div>

                {workPlan.next.length > 0 ? (
                  <div className="mt-3 space-y-1.5">
                    {workPlan.next.map((activity, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-2.5 rounded-lg border border-border bg-bg px-3 py-1.5"
                      >
                        <span
                          className={`h-2 w-2 shrink-0 rounded-full ${
                            activity.status === "delayed"
                              ? "bg-err"
                              : activity.status === "in-progress"
                                ? "bg-accent"
                                : "bg-black/20"
                          }`}
                        />
                        <span className="min-w-0 flex-1 truncate text-[12px] text-txt">
                          {activity.description || "Untitled activity"}
                        </span>
                        <span className="shrink-0 text-[11px] tabular-nums text-txt-muted">
                          {activity.status === "pending"
                            ? activity.startDate || "—"
                            : activity.endDate || activity.startDate || "—"}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </>
            ) : (
              <div className="rounded-lg border border-dashed border-border px-4 py-5 text-center text-[12px] text-txt-muted">
                Create a work plan to see activity status and what&apos;s up next.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-border bg-bg-surface p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-txt">
            <Flag size={15} className="text-accent" /> Milestones
          </h3>
          {workPlan.milestonesFlagged > 0 ? (
            <span className="text-[11px] text-txt-muted">
              {workPlan.milestones.length} of {workPlan.milestonesFlagged} achieved
            </span>
          ) : null}
        </div>
        {workPlan.milestonesFlagged === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-4 py-5 text-center text-[12px] text-txt-muted">
            Flag key activities or sections as milestones in the Work Plan
            (right-click a row → <span className="font-medium text-txt">Mark as milestone</span>) to track them here.
          </div>
        ) : workPlan.milestones.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-4 py-5 text-center text-[12px] text-txt-muted">
            {workPlan.milestonesFlagged} milestone{workPlan.milestonesFlagged === 1 ? "" : "s"} flagged —
            none completed yet.
          </div>
        ) : (
          <>
            <ol className="space-y-1.5">
              {workPlan.milestones.slice(0, 5).map((milestone) => (
                <li
                  key={milestone.id}
                  className="flex items-center gap-3 rounded-lg border border-border bg-bg px-3 py-2"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ok/12 text-ok">
                    <CheckCircle2 size={15} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-txt" title={milestone.description}>
                    {milestone.description}
                    {milestone.isSection ? (
                      <span className="ml-1.5 rounded bg-bg-raised px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-txt-dim">
                        Section
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-[11px] tabular-nums text-txt-muted">
                    {milestone.date || "—"}
                  </span>
                </li>
              ))}
            </ol>
            {workPlan.milestones.length > 5 ? (
              <div className="mt-2 text-[11px] text-txt-dim">
                +{workPlan.milestones.length - 5} earlier milestone
                {workPlan.milestones.length - 5 === 1 ? "" : "s"} achieved
              </div>
            ) : null}
          </>
        )}
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {[
          {
            id: "checklist",
            label: "Checklist overdue",
            count: checklistMetrics.overdue,
            Icon: FileText,
            onClick: () => setShowChecklistModal(true),
            aria: `Open checklist register. ${checklistMetrics.overdue} overdue checklist items.`,
          },
          {
            id: "actions",
            label: "Action points overdue",
            count: overdueActionPoints,
            Icon: ClipboardList,
            onClick: () => setShowActionModal(true),
            aria: `Open action point register. ${overdueActionPoints} overdue action points.`,
          },
        ].map(({ id, label, count, Icon, onClick, aria }) => {
          const isAlert = count > 0;
          return (
            <button
              key={id}
              type="button"
              onClick={onClick}
              aria-label={aria}
              className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition ${
                isAlert
                  ? "border-err/25 bg-err/5 hover:border-err/45 hover:bg-err/10"
                  : "border-border bg-bg-surface hover:border-ok/30 hover:bg-bg-hover"
              }`}
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                  isAlert ? "bg-err/15 text-err" : "bg-ok/15 text-ok"
                }`}
              >
                <Icon size={14} />
              </span>
              <span className={`font-mono text-lg font-semibold tabular-nums ${isAlert ? "text-err" : "text-txt-muted"}`}>
                {count}
              </span>
              <span className="min-w-0 truncate text-[13px] font-medium text-txt">{label}</span>
              <span className="ml-auto text-txt-dim" aria-hidden>
                ›
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-4">
        <div className="rounded-2xl border border-border bg-bg-surface p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-txt">Commercial</h3>
            <span className="text-[11px] text-txt-muted">
              {commercialHistory.length} certificate{commercialHistory.length === 1 ? "" : "s"}
            </span>
          </div>

          {(() => {
            const contractValue = parseAmount(project.contractAmount);
            // The per-status figures are cumulative nets, so the bar segments
            // are the increments: paid, approved-not-yet-paid, submitted-not-
            // yet-approved — measured against the contract value.
            const paidSeg = commercial.paid;
            const approvedSeg = Math.max(0, commercial.approved - commercial.paid);
            const submittedSeg = Math.max(0, commercial.submitted - Math.max(commercial.approved, commercial.paid));
            const certified = paidSeg + approvedSeg + submittedSeg;
            const barBase = contractValue > 0 ? contractValue : Math.max(certified, 1);
            const pct = (value: number) => clamp((value / barBase) * 100);

            return (
              <>
                <div className="flex h-2.5 overflow-hidden rounded-full bg-black/5">
                  {([
                    [paidSeg, "bg-ok"],
                    [approvedSeg, "bg-accent"],
                    [submittedSeg, "bg-warn"],
                  ] as const).map(([amount, color], index) =>
                    amount > 0 ? (
                      <div key={index} className={color} style={{ width: `${pct(amount)}%` }} />
                    ) : null
                  )}
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[11px] text-txt-muted">
                  <span>
                    Certified {contractValue > 0 ? `${pct(certified).toFixed(1)}% of contract` : "to date"}
                  </span>
                  <span className="tabular-nums">
                    {project.currency || "USD"} {currency(certified)}
                    {contractValue > 0 ? ` / ${currency(contractValue)}` : ""}
                  </span>
                </div>
              </>
            );
          })()}

          <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_240px]">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
              {([
                ["Submitted", commercial.submitted, "bg-warn"],
                ["Approved", commercial.approved, "bg-accent"],
                ["Paid", commercial.paid, "bg-ok"],
                ["Retention Held", commercial.retentionHeld, "bg-err"],
              ] as const).map(([label, amount, dot]) => (
                <div key={label} className="rounded-lg border border-border bg-bg px-3 py-2">
                  <div className="flex items-center gap-1.5 text-[11px] text-txt-muted">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
                    <span className="truncate">{label}</span>
                  </div>
                  <div className="mt-0.5 truncate font-mono text-sm font-semibold tabular-nums text-txt">
                    {project.currency || "USD"} {currency(amount)}
                  </div>
                </div>
              ))}
            </div>

            {commercialHistory.length > 1 ? (
              <div className="rounded-lg border border-border bg-bg px-3 py-2">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-txt-dim">
                  Net per certificate
                </div>
                <MiniTrendChart values={commercialHistory.map((entry) => entry.net)} tone="ok" height={42} />
                <div className="truncate text-[11px] text-txt-muted">
                  {commercialHistory.at(-1)?.label}: {project.currency || "USD"}{" "}
                  {currency(commercialHistory.at(-1)?.net || 0)}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <Modal
        open={showChecklistModal}
        onClose={() => setShowChecklistModal(false)}
        title="Checklist Compliance"
        width={980}
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            {[
              ["Required", checklistMetrics.total, "text-txt"],
              ["Overdue", checklistMetrics.overdue, checklistMetrics.overdue > 0 ? "text-err" : "text-txt"],
              ["Submitted", checklistMetrics.submitted, "text-accent"],
              ["Verified", checklistMetrics.verified, "text-ok"],
            ].map(([label, value, color]) => (
              <div key={label} className="rounded-2xl border border-border bg-bg-raised p-4">
                <div className="text-[10px] uppercase tracking-[0.16em] text-txt-dim">{label}</div>
                <div className={`mt-2 text-2xl font-black ${color}`}>{value}</div>
              </div>
            ))}
          </div>

          {sortedChecklistItems.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-8 text-center">
              <div className="text-sm font-semibold text-txt">No checklist items yet</div>
              <Button
                variant="primary"
                className="mt-4"
                onClick={() => {
                  setShowChecklistModal(false);
                  onOpenChecklist();
                }}
              >
                Open Checklist
              </Button>
            </div>
          ) : (
            <>
              <div className="hidden overflow-hidden rounded-2xl border border-border md:block">
                <table className="w-full text-left text-sm">
                  <thead className="bg-black/5 text-[10px] uppercase tracking-[0.16em] text-txt-dim">
                    <tr>
                      <th className="px-4 py-3">Item</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Due / Expiry Date</th>
                      <th className="px-4 py-3">Responsible</th>
                      <th className="px-4 py-3">Document</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {sortedChecklistItems.map((item) => {
                      const overdue = isChecklistItemOverdue(item);
                      const documentUrl = normalizeChecklistDocumentUrl(item.documentUrl);
                      return (
                        <tr key={item.id} className={overdue ? "bg-err/5" : undefined}>
                          <td className="px-4 py-3">
                            <div className="font-bold text-txt">{item.title || "Untitled checklist item"}</div>
                            <div className="mt-1 text-xs text-txt-dim">{item.category || "Uncategorized"}</div>
                          </td>
                          <td className="px-4 py-3">
                            <Badge color={overdue ? "err" : checklistStatusTone[item.status]}>
                              {overdue ? "Overdue" : checklistStatusLabels[item.status]}
                            </Badge>
                          </td>
                          <td className={`px-4 py-3 font-semibold ${overdue ? "text-err" : "text-txt"}`}>
                            {item.dueDate || "Not set"}
                          </td>
                          <td className="px-4 py-3 text-txt-muted">{item.responsiblePerson || "Not assigned"}</td>
                          <td className="px-4 py-3">
                            {documentUrl ? (
                              <a
                                href={documentUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="font-bold text-accent hover:underline"
                              >
                                Open
                              </a>
                            ) : (
                              <span className="text-txt-dim">No link</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="space-y-3 md:hidden">
                {sortedChecklistItems.map((item) => {
                  const overdue = isChecklistItemOverdue(item);
                  const documentUrl = normalizeChecklistDocumentUrl(item.documentUrl);
                  return (
                    <div
                      key={item.id}
                      className={`rounded-2xl border p-4 ${
                        overdue ? "border-err/30 bg-err/5" : "border-border bg-bg-raised"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-black text-txt">{item.title || "Untitled checklist item"}</div>
                          <div className="mt-1 text-xs text-txt-dim">{item.category || "Uncategorized"}</div>
                        </div>
                        <Badge color={overdue ? "err" : checklistStatusTone[item.status]}>
                          {overdue ? "Overdue" : checklistStatusLabels[item.status]}
                        </Badge>
                      </div>
                      <div className="mt-4 grid gap-3 text-sm">
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-txt-dim">Due / Expiry</span>
                          <span className={`font-bold ${overdue ? "text-err" : "text-txt"}`}>
                            {item.dueDate || "Not set"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-txt-dim">Responsible</span>
                          <span className="text-right font-bold text-txt">{item.responsiblePerson || "Not assigned"}</span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-txt-dim">Document</span>
                          {documentUrl ? (
                            <a href={documentUrl} target="_blank" rel="noreferrer" className="font-bold text-accent">
                              Open
                            </a>
                          ) : (
                            <span className="text-txt-dim">No link</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setShowChecklistModal(false);
                    onOpenChecklist();
                  }}
                >
                  Open Checklist Module
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>

      <Modal
        open={showActionModal}
        onClose={() => setShowActionModal(false)}
        title="Project Action Points"
        width={980}
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-border bg-bg-raised p-4">
              <div className="text-[10px] uppercase tracking-[0.16em] text-txt-dim">Meetings</div>
              <div className="mt-2 text-2xl font-black text-txt">{meetingCount}</div>
            </div>
            <div className="rounded-2xl border border-border bg-bg-raised p-4">
              <div className="text-[10px] uppercase tracking-[0.16em] text-txt-dim">Open Actions</div>
              <div className="mt-2 text-2xl font-black text-txt">{openActionPoints}</div>
            </div>
            <div className="rounded-2xl border border-border bg-bg-raised p-4">
              <div className="text-[10px] uppercase tracking-[0.16em] text-txt-dim">Overdue</div>
              <div className={`mt-2 text-2xl font-black ${overdueActionPoints > 0 ? "text-err" : "text-txt"}`}>
                {overdueActionPoints}
              </div>
            </div>
          </div>

          {actionItems.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-txt-muted">
              No live action points for this project yet.
            </div>
          ) : (
            <div className="space-y-3">
              {actionItems.map((action) => (
                <div key={action.id} className="rounded-2xl border border-border bg-bg-raised p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="text-sm font-bold text-txt">{action.description}</div>
                      <div className="mt-2 text-xs text-txt-muted">
                        {action.meetingTitle} - {action.meetingDate}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge color={statusBadge(action.status)}>{action.status}</Badge>
                      <Badge color={action.priority === "critical" || action.priority === "high" ? "warn" : "accent"}>
                        {action.priority}
                      </Badge>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-3 text-xs text-txt-muted sm:grid-cols-2">
                    <div>Responsible: {action.responsiblePerson || "Not assigned"}</div>
                    <div>Deadline: {action.deadline || "Not set"}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
function CreateProjectModal({
  open,
  onClose,
  mode,
  typeLock,
  formData,
  setFormData,
  programs,
  categories,
  onSubmit,
  submitting,
  errorMessage,
  onImportSurp2,
  onImportFinalCertificateTest,
  importingSurp2,
  importingFinalCertificateTest,
  sampleImportError,
}: {
  open: boolean;
  onClose: () => void;
  mode: "create" | "edit";
  typeLock: { locked: boolean; reasons: string[] };
  formData: ProjectFormData;
  setFormData: Dispatch<SetStateAction<ProjectFormData>>;
  programs: Program[];
  categories: ProjectCategory[];
  onSubmit: () => void | Promise<void>;
  submitting: boolean;
  errorMessage: string | null;
  onImportSurp2: () => void;
  onImportFinalCertificateTest: () => void;
  importingSurp2: boolean;
  importingFinalCertificateTest: boolean;
  sampleImportError: string | null;
}) {
  const selectedRegion = SOMALIA_REGIONS.find((region) => region.name === formData.region);
  const townOptions = selectedRegion?.towns ?? [];
  const officialPrograms = programs.filter((program) => program.organizationId);
  const privatePrograms = programs.filter((program) => !program.organizationId);
  const officialCategories = categories.filter((category) => category.organizationId && category.status === "active");
  const privateCategories = categories.filter((category) => !category.organizationId && category.status === "active");
  const usedDefaultCategory = DEFAULT_PROJECT_CATEGORIES.find(
    (category) => `default:${categorySlug(category.name)}` === formData.categoryId,
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === "edit" ? "Edit Project Information" : "Create New Project"}
      width={760}
    >
      <div className="flex flex-col gap-5 p-2">
        {mode === "create" ? (
          <div className="rounded-2xl border border-border bg-bg-input/40 p-4">
            <div className="flex items-center gap-2">
              <DatabaseZap size={15} className="text-accent" />
              <span className="text-[11px] font-black uppercase tracking-[0.18em] text-txt-muted">
                Just exploring?
              </span>
            </div>
            <p className="mt-1.5 text-[13px] text-txt-muted">
              Load a ready-made trial workspace with sample projects, BOQs, progress and payment
              data — or fill in the form below to start your own project.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="ghost" size="sm" onClick={onImportSurp2} disabled={importingSurp2 || importingFinalCertificateTest}>
                <DatabaseZap size={14} /> {importingSurp2 ? "Adding samples..." : "Load 4 road package samples"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onImportFinalCertificateTest}
                disabled={importingSurp2 || importingFinalCertificateTest}
              >
                <DatabaseZap size={14} />{" "}
                {importingFinalCertificateTest ? "Adding sample..." : "Load final certificate sample"}
              </Button>
            </div>
            {sampleImportError ? (
              <div className="mt-3 rounded-xl border border-err/40 bg-err/10 p-3 text-xs text-err">
                {sampleImportError}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-txt-muted">
              Project Name
            </label>
            <input
              autoFocus
              className="w-full rounded-xl border border-border bg-bg-input px-4 py-3 text-sm font-medium text-txt outline-none transition-all focus:border-accent focus:ring-4 focus:ring-accent/10"
              placeholder="e.g. Skyline Heights Phase 2"
              value={formData.name}
              onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-txt-muted">
              Program
            </label>
            <select
              className="w-full appearance-none rounded-xl border border-border bg-bg-input px-3 py-3 text-sm font-semibold text-txt outline-none transition-all focus:border-accent focus:ring-4 focus:ring-accent/10"
              value={formData.programId}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  programId: e.target.value,
                  newProgramName: e.target.value === "__new__" ? prev.newProgramName : "",
                  newProgramCode: e.target.value === "__new__" ? prev.newProgramCode : "",
                }))
              }
            >
              <option value="">No program / standalone</option>
              {officialPrograms.length > 0 ? (
                <optgroup label="Official organization programs">
                  {officialPrograms.map((program) => (
                    <option key={program.id} value={program.id}>
                      {program.code ? `${program.code} - ${program.name}` : program.name}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              {privatePrograms.length > 0 ? (
                <optgroup label="My private programs">
                  {privatePrograms.map((program) => (
                    <option key={program.id} value={program.id}>
                      {program.code ? `${program.code} - ${program.name}` : program.name}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              <option value="__new__">Create private program...</option>
            </select>
            <p className="text-xs text-txt-dim">
              Official programs are managed by organization admins. Private programs are visible only to you.
            </p>
          </div>
          <div className="space-y-2">
            <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-txt-muted">
              Project Code
            </label>
            <input
              className="w-full rounded-xl border border-border bg-bg-input px-4 py-3 text-sm font-medium text-txt outline-none transition-all focus:border-accent focus:ring-4 focus:ring-accent/10"
              placeholder="e.g. PB-024"
              value={formData.code}
              onChange={(e) => setFormData((prev) => ({ ...prev, code: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-txt-muted">
              Contract Number
            </label>
            <input
              className="w-full rounded-xl border border-border bg-bg-input px-4 py-3 text-sm font-medium text-txt outline-none transition-all focus:border-accent focus:ring-4 focus:ring-accent/10"
              placeholder="e.g. SURP2-MOG-PKG-01"
              value={formData.contractNumber}
              onChange={(e) => setFormData((prev) => ({ ...prev, contractNumber: e.target.value }))}
            />
            <p className="text-xs text-txt-dim">
              Formal contract reference used in documents. Project code can remain a short internal code.
            </p>
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-txt-muted">
              Project Category
            </label>
            <select
              className="w-full appearance-none rounded-xl border border-border bg-bg-input px-3 py-3 text-sm font-semibold text-txt outline-none transition-all focus:border-accent focus:ring-4 focus:ring-accent/10"
              value={formData.categoryId}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  categoryId: e.target.value,
                  newCategoryName: e.target.value === "__new__" ? prev.newCategoryName : "",
                  newCategoryCode: e.target.value === "__new__" ? prev.newCategoryCode : "",
                }))
              }
            >
              <option value="">No category</option>
              {officialCategories.length > 0 ? (
                <optgroup label="Official organization categories">
                  {officialCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.code ? `${category.code} - ${category.name}` : category.name}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              {privateCategories.length > 0 ? (
                <optgroup label="My private categories">
                  {privateCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.code ? `${category.code} - ${category.name}` : category.name}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              <optgroup label="Default categories">
                {DEFAULT_PROJECT_CATEGORIES.map((category) => (
                  <option key={category.name} value={`default:${categorySlug(category.name)}`}>
                    {category.name}
                  </option>
                ))}
              </optgroup>
              <option value="__new__">Create private category...</option>
            </select>
            <p className="text-xs text-txt-dim">
              Categories power dashboard filters such as WASH, Roads, Buildings, Health, and Drainage.
              {usedDefaultCategory ? ` Selected default: ${usedDefaultCategory.name}.` : ""}
            </p>
          </div>
          {formData.programId === "__new__" ? (
            <div className="grid gap-4 md:col-span-2 md:grid-cols-[1fr_160px]">
              <div className="space-y-2">
                <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-txt-muted">
                  New Private Program Name
                </label>
                <input
                  className="w-full rounded-xl border border-border bg-bg-input px-4 py-3 text-sm font-medium text-txt outline-none transition-all focus:border-accent focus:ring-4 focus:ring-accent/10"
                  placeholder="e.g. My SURP2 tracking view"
                  value={formData.newProgramName}
                  onChange={(e) => setFormData((prev) => ({ ...prev, newProgramName: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-txt-muted">
                  Program Code
                </label>
                <input
                  className="w-full rounded-xl border border-border bg-bg-input px-4 py-3 text-sm font-medium text-txt outline-none transition-all focus:border-accent focus:ring-4 focus:ring-accent/10"
                  placeholder="SURP2"
                  value={formData.newProgramCode}
                  onChange={(e) => setFormData((prev) => ({ ...prev, newProgramCode: e.target.value }))}
                />
              </div>
            </div>
          ) : null}
          {formData.categoryId === "__new__" ? (
            <div className="grid gap-4 md:col-span-2 md:grid-cols-[1fr_160px]">
              <div className="space-y-2">
                <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-txt-muted">
                  New Private Category Name
                </label>
                <input
                  className="w-full rounded-xl border border-border bg-bg-input px-4 py-3 text-sm font-medium text-txt outline-none transition-all focus:border-accent focus:ring-4 focus:ring-accent/10"
                  placeholder="e.g. Municipal Roads"
                  value={formData.newCategoryName}
                  onChange={(e) => setFormData((prev) => ({ ...prev, newCategoryName: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-txt-muted">
                  Category Code
                </label>
                <input
                  className="w-full rounded-xl border border-border bg-bg-input px-4 py-3 text-sm font-medium text-txt outline-none transition-all focus:border-accent focus:ring-4 focus:ring-accent/10"
                  placeholder="ROADS"
                  value={formData.newCategoryCode}
                  onChange={(e) => setFormData((prev) => ({ ...prev, newCategoryCode: e.target.value }))}
                />
              </div>
            </div>
          ) : null}
          <div className="space-y-2">
            <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-txt-muted">
              Region / State
            </label>
            <select
              className="w-full appearance-none rounded-xl border border-border bg-bg-input px-3 py-3 text-sm font-semibold text-txt outline-none transition-all focus:border-accent focus:ring-4 focus:ring-accent/10"
              value={formData.region}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  region: e.target.value,
                  town: "",
                }))
              }
            >
              <option value="">Select region</option>
              {SOMALIA_REGIONS.map((region) => (
                <option key={region.name} value={region.name}>
                  {region.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-txt-muted">
              Town / City
            </label>
            <select
              className="w-full appearance-none rounded-xl border border-border bg-bg-input px-3 py-3 text-sm font-semibold text-txt outline-none transition-all focus:border-accent focus:ring-4 focus:ring-accent/10"
              value={formData.town}
              disabled={!formData.region}
              onChange={(e) => setFormData((prev) => ({ ...prev, town: e.target.value }))}
            >
              <option value="">{formData.region ? "Select town" : "Select region first"}</option>
              {townOptions.map((town) => (
                <option key={town.name} value={town.name}>
                  {town.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-txt-muted">
              What kind of project is this?
            </label>
            <select
              className="w-full appearance-none rounded-xl border border-border bg-bg-input px-3 py-3 text-sm font-semibold text-txt outline-none transition-all focus:border-accent focus:ring-4 focus:ring-accent/10 disabled:cursor-not-allowed disabled:opacity-60"
              value={formData.preset}
              disabled={typeLock.locked}
              onChange={(e) => {
                if (typeLock.locked) return;
                const next = getProjectPreset(e.target.value);
                setFormData((prev) => ({
                  ...prev,
                  preset: next.id,
                  type: next.type,
                  // Only nudge the role when it's still one of the known defaults —
                  // preserves a manual choice if the user re-opens the dropdown.
                  role:
                    prev.role === "supervision" || prev.role === "contractor" || prev.role === "employer"
                      ? next.defaultRole
                      : prev.role,
                }));
              }}
            >
              {PROJECT_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.marker} {preset.title} — {preset.blurb}
                </option>
              ))}
            </select>
            {typeLock.locked ? (
              <p className="flex items-start gap-1.5 text-[11px] text-txt-dim">
                <Lock size={12} className="mt-0.5 shrink-0 text-txt-muted" />
                <span>
                  Locked because this project already has {formatLockReasons(typeLock.reasons)}.
                  Switching the project type would hide that work. To change the type, remove it first
                  or create a new project.
                </span>
              </p>
            ) : (
              <p className="text-[11px] text-txt-dim">
                {getProjectPreset(formData.preset).helper}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-txt-muted">
              Authority Role
            </label>
            <select
              className="w-full appearance-none rounded-xl border border-border bg-bg-input px-3 py-3 text-sm font-semibold text-txt outline-none transition-all focus:border-accent focus:ring-4 focus:ring-accent/10"
              value={formData.role}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, role: e.target.value as Project["role"] }))
              }
            >
              <option value="supervision">Supervision</option>
              <option value="contractor">Contractor</option>
              <option value="employer">Owner/Client</option>
            </select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-txt-muted">
              Site Address / Location Notes
            </label>
            <input
              className="w-full rounded-xl border border-border bg-bg-input px-4 py-3 text-sm font-medium text-txt outline-none transition-all focus:border-accent focus:ring-4 focus:ring-accent/10"
              placeholder="e.g. Hodan district, near KM4 junction"
              value={formData.location}
              onChange={(e) => setFormData((prev) => ({ ...prev, location: e.target.value }))}
            />
            <p className="text-xs text-txt-dim">
              Optional. The dashboard map uses exact coordinates first, then the selected town coordinates.
            </p>
          </div>
          <div className="md:col-span-2 rounded-[20px] border border-border bg-bg-surface/60 p-4">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 text-left"
              onClick={() =>
                setFormData((prev) => ({
                  ...prev,
                  useExactCoordinates: !prev.useExactCoordinates,
                  latitude: prev.useExactCoordinates ? "" : prev.latitude,
                  longitude: prev.useExactCoordinates ? "" : prev.longitude,
                }))
              }
            >
              <div>
                <div className="text-sm font-bold text-txt">Use exact coordinates</div>
                <p className="mt-1 text-xs text-txt-dim">
                  Optional for precise site pins. Leave off to use the town’s approximate map position.
                </p>
              </div>
              <span
                className={`rounded-full border px-3 py-1 text-xs font-bold ${
                  formData.useExactCoordinates
                    ? "border-accent/40 bg-accent/15 text-accent"
                    : "border-border bg-bg text-txt-muted"
                }`}
              >
                {formData.useExactCoordinates ? "On" : "Off"}
              </span>
            </button>
            {formData.useExactCoordinates ? (
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-txt-muted">
                    Latitude
                  </label>
                  <input
                    type="number"
                    step="0.000001"
                    className="w-full rounded-xl border border-border bg-bg-input px-4 py-3 text-sm font-medium text-txt outline-none transition-all focus:border-accent focus:ring-4 focus:ring-accent/10"
                    placeholder="2.046934"
                    value={formData.latitude}
                    onChange={(e) => setFormData((prev) => ({ ...prev, latitude: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-txt-muted">
                    Longitude
                  </label>
                  <input
                    type="number"
                    step="0.000001"
                    className="w-full rounded-xl border border-border bg-bg-input px-4 py-3 text-sm font-medium text-txt outline-none transition-all focus:border-accent focus:ring-4 focus:ring-accent/10"
                    placeholder="45.318161"
                    value={formData.longitude}
                    onChange={(e) => setFormData((prev) => ({ ...prev, longitude: e.target.value }))}
                  />
                </div>
              </div>
            ) : null}
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-txt-muted">
              Contract Title
            </label>
            <input
              className="w-full rounded-xl border border-border bg-bg-input px-4 py-3 text-sm font-medium text-txt outline-none transition-all focus:border-accent focus:ring-4 focus:ring-accent/10"
              placeholder="e.g. Construction of Primary School Blocks"
              value={formData.contractTitle}
              onChange={(e) => setFormData((prev) => ({ ...prev, contractTitle: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-txt-muted">
              Client
            </label>
            <input
              className="w-full rounded-xl border border-border bg-bg-input px-4 py-3 text-sm font-medium text-txt outline-none transition-all focus:border-accent focus:ring-4 focus:ring-accent/10"
              placeholder="e.g. Ministry of Education"
              value={formData.clientName}
              onChange={(e) => setFormData((prev) => ({ ...prev, clientName: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-txt-muted">
              Contractor
            </label>
            <input
              className="w-full rounded-xl border border-border bg-bg-input px-4 py-3 text-sm font-medium text-txt outline-none transition-all focus:border-accent focus:ring-4 focus:ring-accent/10"
              placeholder="e.g. ABC Construction"
              value={formData.contractorName}
              onChange={(e) => setFormData((prev) => ({ ...prev, contractorName: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-txt-muted">
              Consultant
            </label>
            <input
              className="w-full rounded-xl border border-border bg-bg-input px-4 py-3 text-sm font-medium text-txt outline-none transition-all focus:border-accent focus:ring-4 focus:ring-accent/10"
              placeholder="e.g. Project Supervision Consultant"
              value={formData.consultantName}
              onChange={(e) => setFormData((prev) => ({ ...prev, consultantName: e.target.value }))}
            />
          </div>
          <div className="md:col-span-2 rounded-[20px] border border-border bg-bg-surface/60 p-4">
            <div className="mb-4">
              <div className="text-[10px] font-black uppercase tracking-[0.22em] text-txt-muted">
                Document Branding
              </div>
              <p className="mt-1 text-xs text-txt-dim">
                This profile feeds letters, certificates, and formal print layouts by default.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-txt-muted">
                  Client Logo
                </label>
                <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-bg-input px-4 py-3">
                  <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-border bg-bg-surface">
                    {formData.documentClientLogoDataUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={formData.documentClientLogoDataUrl} alt="Client logo" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-[10px] font-black uppercase tracking-[0.18em] text-txt-dim">
                        Logo
                      </span>
                    )}
                  </div>
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-bg-surface px-3 py-2 text-sm font-semibold text-txt transition-colors hover:border-accent/50">
                    Upload Logo
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const dataUrl = await readFileAsDataUrl(file);
                        setFormData((prev) => ({ ...prev, documentClientLogoDataUrl: dataUrl }));
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {formData.documentClientLogoDataUrl ? (
                    <button
                      type="button"
                      onClick={() => setFormData((prev) => ({ ...prev, documentClientLogoDataUrl: "" }))}
                      className="rounded-xl border border-border px-3 py-2 text-sm font-semibold text-txt-muted transition-colors hover:border-err/40 hover:text-err"
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="space-y-2">
                <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-txt-muted">
                  Client Display Name
                </label>
                <input
                  className="w-full rounded-xl border border-border bg-bg-input px-4 py-3 text-sm font-medium text-txt outline-none transition-all focus:border-accent focus:ring-4 focus:ring-accent/10"
                  placeholder="Defaults to client field"
                  value={formData.documentClientDisplayName}
                  onChange={(e) => setFormData((prev) => ({ ...prev, documentClientDisplayName: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-txt-muted">
                  Issuer / Consultant Display Name
                </label>
                <input
                  className="w-full rounded-xl border border-border bg-bg-input px-4 py-3 text-sm font-medium text-txt outline-none transition-all focus:border-accent focus:ring-4 focus:ring-accent/10"
                  placeholder="Defaults to consultant field"
                  value={formData.documentIssuerDisplayName}
                  onChange={(e) => setFormData((prev) => ({ ...prev, documentIssuerDisplayName: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-txt-muted">
                  Client Address Block
                </label>
                <textarea
                  className="min-h-[96px] w-full resize-y rounded-xl border border-border bg-bg-input px-4 py-3 text-sm font-medium text-txt outline-none transition-all focus:border-accent focus:ring-4 focus:ring-accent/10"
                  placeholder="Street, city, phone, email"
                  value={formData.documentClientAddress}
                  onChange={(e) => setFormData((prev) => ({ ...prev, documentClientAddress: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-txt-muted">
                  Issuer Address Block
                </label>
                <textarea
                  className="min-h-[96px] w-full resize-y rounded-xl border border-border bg-bg-input px-4 py-3 text-sm font-medium text-txt outline-none transition-all focus:border-accent focus:ring-4 focus:ring-accent/10"
                  placeholder="Office address, phone, email"
                  value={formData.documentIssuerAddress}
                  onChange={(e) => setFormData((prev) => ({ ...prev, documentIssuerAddress: e.target.value }))}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-txt-muted">
                  Header Tagline
                </label>
                <input
                  className="w-full rounded-xl border border-border bg-bg-input px-4 py-3 text-sm font-medium text-txt outline-none transition-all focus:border-accent focus:ring-4 focus:ring-accent/10"
                  placeholder='e.g. "Civil Engineering Consultancy" — shown top-right of the letterhead'
                  value={formData.documentHeaderTagline}
                  onChange={(e) => setFormData((prev) => ({ ...prev, documentHeaderTagline: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-txt-muted">
                  Phone
                </label>
                <input
                  className="w-full rounded-xl border border-border bg-bg-input px-4 py-3 text-sm font-medium text-txt outline-none transition-all focus:border-accent focus:ring-4 focus:ring-accent/10"
                  placeholder="+252 610 810 444"
                  value={formData.documentIssuerPhone}
                  onChange={(e) => setFormData((prev) => ({ ...prev, documentIssuerPhone: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-txt-muted">
                  Email
                </label>
                <input
                  className="w-full rounded-xl border border-border bg-bg-input px-4 py-3 text-sm font-medium text-txt outline-none transition-all focus:border-accent focus:ring-4 focus:ring-accent/10"
                  placeholder="info@company.com"
                  value={formData.documentIssuerEmail}
                  onChange={(e) => setFormData((prev) => ({ ...prev, documentIssuerEmail: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-txt-muted">
                  Website
                </label>
                <input
                  className="w-full rounded-xl border border-border bg-bg-input px-4 py-3 text-sm font-medium text-txt outline-none transition-all focus:border-accent focus:ring-4 focus:ring-accent/10"
                  placeholder="www.company.com"
                  value={formData.documentIssuerWebsite}
                  onChange={(e) => setFormData((prev) => ({ ...prev, documentIssuerWebsite: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-txt-muted">
                  Letterhead Colours
                </label>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-sm font-medium text-txt">
                    <input
                      type="color"
                      className="h-9 w-12 cursor-pointer rounded border border-border bg-bg-input"
                      value={formData.documentAccentPrimary || DEFAULT_ACCENT_PRIMARY}
                      onChange={(e) => setFormData((prev) => ({ ...prev, documentAccentPrimary: e.target.value }))}
                    />
                    Primary
                  </label>
                  <label className="flex items-center gap-2 text-sm font-medium text-txt">
                    <input
                      type="color"
                      className="h-9 w-12 cursor-pointer rounded border border-border bg-bg-input"
                      value={formData.documentAccentSecondary || DEFAULT_ACCENT_SECONDARY}
                      onChange={(e) => setFormData((prev) => ({ ...prev, documentAccentSecondary: e.target.value }))}
                    />
                    Accent
                  </label>
                  {(formData.documentAccentPrimary || formData.documentAccentSecondary) && (
                    <button
                      type="button"
                      onClick={() =>
                        setFormData((prev) => ({ ...prev, documentAccentPrimary: "", documentAccentSecondary: "" }))
                      }
                      className="text-xs font-semibold text-txt-muted underline-offset-2 hover:underline"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 md:col-span-2 md:grid-cols-2">
            <div className="space-y-2">
              <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-txt-muted">
                Contract Amount
              </label>
              <input
                className="w-full rounded-xl border border-border bg-bg-input px-4 py-3 text-sm font-medium text-txt outline-none transition-all focus:border-accent focus:ring-4 focus:ring-accent/10"
                placeholder="e.g. 2500000"
                value={formData.contractAmount}
                onChange={(e) => setFormData((prev) => ({ ...prev, contractAmount: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-txt-muted">
                Currency
              </label>
              <input
                className="w-full rounded-xl border border-border bg-bg-input px-4 py-3 text-sm font-medium text-txt outline-none transition-all focus:border-accent focus:ring-4 focus:ring-accent/10"
                placeholder="USD"
                value={formData.currency}
                onChange={(e) => setFormData((prev) => ({ ...prev, currency: e.target.value }))}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 md:col-span-2 md:grid-cols-3">
            <div className="space-y-2">
              <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-txt-muted">
                Start Date
              </label>
              <input
                type="date"
                className="w-full rounded-xl border border-border bg-bg-input px-4 py-3 text-sm font-medium text-txt outline-none transition-all focus:border-accent focus:ring-4 focus:ring-accent/10"
                value={formData.start_date}
                onChange={(e) =>
                  setFormData((prev) => {
                    const start = e.target.value;
                    const months = Number(prev.durationMonths);
                    const end =
                      start && prev.durationMonths && Number.isFinite(months) && months > 0
                        ? addMonthsIso(start, months)
                        : prev.end_date;
                    return { ...prev, start_date: start, end_date: end };
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-txt-muted">
                Duration (months)
              </label>
              <input
                type="number"
                min={0}
                inputMode="numeric"
                className="w-full rounded-xl border border-border bg-bg-input px-4 py-3 text-sm font-medium text-txt outline-none transition-all focus:border-accent focus:ring-4 focus:ring-accent/10"
                placeholder="e.g. 12"
                value={formData.durationMonths}
                onChange={(e) =>
                  setFormData((prev) => {
                    const raw = e.target.value;
                    const months = Number(raw);
                    const end =
                      prev.start_date && raw && Number.isFinite(months) && months > 0
                        ? addMonthsIso(prev.start_date, months)
                        : prev.end_date;
                    return { ...prev, durationMonths: raw, end_date: end };
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-txt-muted">
                End Date
              </label>
              <input
                type="date"
                className="w-full rounded-xl border border-border bg-bg-input px-4 py-3 text-sm font-medium text-txt outline-none transition-all focus:border-accent focus:ring-4 focus:ring-accent/10"
                value={formData.end_date}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    end_date: e.target.value,
                    // Manual end-date edit re-derives the duration to keep them in sync.
                    durationMonths: monthsBetweenIso(prev.start_date, e.target.value),
                  }))
                }
              />
              <p className="text-[11px] text-txt-dim">
                Auto-filled from start date + duration. You can still adjust it directly.
              </p>
            </div>
          </div>
        </div>
        {errorMessage ? (
          <div className="rounded-2xl border border-err/30 bg-err/10 px-4 py-3 text-sm text-err">
            {errorMessage}
          </div>
        ) : null}
        <div className="mt-6 flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:justify-end">
          <Button
            variant="ghost"
            className="rounded-xl px-6 font-bold"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            className="glow-accent rounded-xl px-8 font-bold"
            disabled={
              !formData.name.trim() ||
              (formData.programId === "__new__" && !formData.newProgramName.trim()) ||
              (formData.categoryId === "__new__" && !formData.newCategoryName.trim()) ||
              submitting
            }
            onClick={onSubmit}
          >
            {submitting ? "Saving Project..." : mode === "edit" ? "Save Changes" : "Initiate Project"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
