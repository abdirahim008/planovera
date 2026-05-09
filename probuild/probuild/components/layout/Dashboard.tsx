"use client";

import { type Dispatch, type SetStateAction, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { v4 as uuid } from "uuid";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BarChart3,
  Building2,
  CalendarRange,
  ClipboardList,
  DatabaseZap,
  DollarSign,
  FileText,
  LayoutGrid,
  Mail,
  MapPin,
  Maximize2,
  PenTool,
  Plus,
  Table,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";
import { currency, getLiveMeetingActionItems, type MeetingActionSnapshot, useAppStore } from "@/lib/store";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase-browser";
import { SOMALIA_REGIONS, findSomaliaTown } from "@/lib/somaliaLocations";
import {
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
import { SURP2_PROGRAM_ID, type Surp2ImportPreview } from "@/lib/surp2ImportTypes";
import { DEFAULT_PROJECT_CATEGORIES, categorySlug } from "@/lib/projectCategories";

type Tone = "accent" | "ok" | "warn" | "err";

type ProjectFormData = {
  name: string;
  programId: string;
  newProgramName: string;
  newProgramCode: string;
  categoryId: string;
  newCategoryName: string;
  newCategoryCode: string;
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
  end_date: string;
  documentClientLogoDataUrl: string;
  documentClientDisplayName: string;
  documentClientAddress: string;
  documentIssuerDisplayName: string;
  documentIssuerAddress: string;
  documentHeaderTagline: string;
};

const defaultProjectFormData = (): ProjectFormData => ({
  name: "",
  programId: "",
  newProgramName: "",
  newProgramCode: "",
  categoryId: "",
  newCategoryName: "",
  newCategoryCode: "",
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
  end_date: "",
  documentClientLogoDataUrl: "",
  documentClientDisplayName: "",
  documentClientAddress: "",
  documentIssuerDisplayName: "",
  documentIssuerAddress: "",
  documentHeaderTagline: "",
});

const projectToFormData = (project: Project): ProjectFormData => ({
  name: project.name || "",
  programId: project.programId || "",
  newProgramName: "",
  newProgramCode: "",
  categoryId: project.categoryId || (project.categoryName ? `default:${categorySlug(project.categoryName)}` : ""),
  newCategoryName: "",
  newCategoryCode: "",
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
  end_date: project.end_date || "",
  documentClientLogoDataUrl: project.documentBranding?.clientLogoDataUrl || "",
  documentClientDisplayName: project.documentBranding?.clientDisplayName || "",
  documentClientAddress: project.documentBranding?.clientAddress || "",
  documentIssuerDisplayName: project.documentBranding?.issuerDisplayName || "",
  documentIssuerAddress: project.documentBranding?.issuerAddress || "",
  documentHeaderTagline: project.documentBranding?.headerTagline || "",
});

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("Unable to read file"));
    reader.readAsDataURL(file);
  });
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

const normalizeFilterValue = (value?: string | null) => (value || "").trim().toLowerCase();

const uniqueFilterValues = (values: Array<string | undefined | null>) =>
  Array.from(new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])).sort((a, b) =>
    a.localeCompare(b)
  );

const programLabel = (programs: Program[], programId?: string) =>
  programs.find((program) => program.id === programId)?.name || "Unassigned";

const categoryLabel = (categories: ProjectCategory[], project: Project) =>
  categories.find((category) => category.id === project.categoryId)?.name || project.categoryName || "";

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

function computeCommercialSnapshot(projectId: string, certificates: PaymentCertificate[]): CommercialSnapshot {
  const projectCertificates = certificates.filter((certificate) => certificate.project_id === projectId);

  return projectCertificates.reduce<CommercialSnapshot>(
    (totals, certificate) => {
      const allItems = certificate.sheets.flatMap((sheet) => sheet.items);
      const subTotal = allItems.reduce((sum, item) => sum + parseAmount(item.totalAmount), 0);
      const contingencies = (subTotal * certificate.contingenciesPercent) / 100;
      const afterCont = subTotal + contingencies;
      const govTax = (afterCont * certificate.governmentTaxPercent) / 100;
      const gross = afterCont + govTax;
      const net =
        gross -
        (gross * certificate.retentionPercent) / 100 -
        (gross * certificate.advancePaymentPercent) / 100 -
        (gross * certificate.withholdingTaxPercent) / 100;

      if (certificate.status === "approved") totals.approved += net;
      if (certificate.status === "submitted") totals.submitted += net;
      if (certificate.status === "paid") totals.paid += net;
      totals.retentionHeld += (gross * certificate.retentionPercent) / 100;
      return totals;
    },
    { approved: 0, submitted: 0, paid: 0, retentionHeld: 0 }
  );
}

function computeFinancialProgress(
  projectId: string,
  savedBOQs: SavedBOQ[],
  certificates: PaymentCertificate[],
  project: Project
) {
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

  const baselineAmount = boqAmount > 0 ? boqAmount : parseAmount(project.contractAmount);
  if (baselineAmount <= 0) return 0;

  const commercial = computeCommercialSnapshot(projectId, certificates);
  const certified = Math.max(commercial.approved, commercial.paid, commercial.submitted);
  return clamp(Math.round((certified / baselineAmount) * 100));
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
        const contingencies = (subTotal * certificate.contingenciesPercent) / 100;
        const afterCont = subTotal + contingencies;
        const govTax = (afterCont * certificate.governmentTaxPercent) / 100;
        const gross = afterCont + govTax;
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

function DualTrendChart({
  planned,
  actual,
}: {
  planned: number[];
  actual: number[];
}) {
  const maxCount = Math.max(planned.length, actual.length, 2);
  const plannedValues = planned.length ? planned : [0, 0];
  const actualValues = actual.length ? actual : [0, 0];
  const maxValue = Math.max(...plannedValues, ...actualValues, 1);

  const lineFor = (values: number[]) =>
    values
      .map((value, index) => {
        const x = (index / Math.max(maxCount - 1, 1)) * 220;
        const y = 110 - (clamp(value, 0, maxValue) / maxValue) * 78;
        return `${x},${y}`;
      })
      .join(" ");

  return (
    <div className="rounded-2xl border border-border bg-black/10 p-4">
      <div className="mb-4 flex items-center gap-4 text-[11px] uppercase tracking-[0.18em] text-txt-dim">
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-accent" />
          Planned
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-ok" />
          Actual
        </span>
      </div>
      <svg viewBox="0 0 220 118" className="h-36 w-full">
        {[18, 56, 94].map((y) => (
          <line key={y} x1="0" x2="220" y1={y} y2={y} stroke="rgba(124, 135, 158, 0.12)" />
        ))}
        <polyline
          fill="none"
          stroke="#3b82f6"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={lineFor(plannedValues)}
        />
        <polyline
          fill="none"
          stroke="#22c55e"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={lineFor(actualValues)}
        />
      </svg>
    </div>
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
          <div className="text-sm font-semibold text-white">
            {clamp(value).toFixed(1)}
            {suffix}
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full rounded-full"
              style={{
                width: `${clamp(value)}%`,
                background: `linear-gradient(90deg, ${style.hex} 0%, ${style.glow} 100%)`,
              }}
            />
          </div>
          <div className="mt-3 text-xs leading-5 text-txt-muted">
            {value >= 75
              ? "Strong control position"
              : value >= 45
              ? "Steady progress with room to improve"
              : "Needs focused recovery and follow-up"}
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
          <div className="mt-3 text-3xl font-black tracking-tight text-white">{value}</div>
          <div className="mt-2 text-xs text-txt-muted">{subtitle}</div>
        </div>
        <div
          className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/5"
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

function CompactGauge({
  value,
  label,
  tone = "accent",
}: {
  value: number;
  label: string;
  tone?: Tone;
}) {
  const style = toneStyles[tone];
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - clamp(value) / 100);

  return (
    <div className="flex flex-col items-center justify-center rounded-[22px] border border-border bg-black/10 p-4 text-center">
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
          <div className="text-2xl font-black" style={{ color: style.hex }}>
            {clamp(value).toFixed(0)}
          </div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-txt-dim">%</div>
        </div>
      </div>
      <div className="mt-2 text-[11px] font-bold uppercase tracking-[0.16em] text-txt-muted">{label}</div>
    </div>
  );
}

function ReferenceMetricTile({
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
    <div className="relative overflow-hidden rounded-[22px] border border-border bg-bg-surface p-[18px]">
      <div
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${style.glow}, transparent)` }}
      />
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-txt-dim">{title}</div>
          <div className="mt-2 truncate text-[26px] font-black leading-tight tracking-tight text-white">{value}</div>
          <div className="mt-1.5 line-clamp-2 text-[11px] leading-5 text-txt-muted">{subtitle}</div>
        </div>
        <div
          className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[11px]"
          style={{ background: style.soft, color: style.hex }}
        >
          <Icon size={17} />
        </div>
      </div>
      <div className="mt-3">
        <MiniTrendChart values={trend} tone={tone} height={34} />
      </div>
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
        <span className="text-white">{clamp(value).toFixed(1)}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/5">
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
    importLocalTestData,
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
  const [surp2Preview, setSurp2Preview] = useState<Surp2ImportPreview | null>(null);
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

  const handleImportSurp2 = async () => {
    setSurp2Importing(true);
    setSurp2ImportError(null);
    try {
      const response = await fetch("/api/imports/surp2-mogadishu", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Could not import SURP2 files.");
      }
      importLocalTestData(data.payload);
      setSurp2Preview(data.preview);
      setPortfolioFilters({ programId: SURP2_PROGRAM_ID, categoryId: "", location: "", client: "" });
      setActiveModule("dashboard");
    } catch (error) {
      setSurp2ImportError(error instanceof Error ? error.message : "Could not import SURP2 files.");
    } finally {
      setSurp2Importing(false);
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
          onImportSurp2={handleImportSurp2}
          importingSurp2={surp2Importing}
          surp2Preview={surp2Preview}
          surp2ImportError={surp2ImportError}
        />
      )}

      <CreateProjectModal
        open={isModalOpen}
        onClose={() => {
          if (isSubmitting) return;
          setIsModalOpen(false);
          setCreateError(null);
          setEditingProject(null);
        }}
        mode={editingProject ? "edit" : "create"}
        formData={formData}
        setFormData={setFormData}
        programs={programs}
        categories={categories}
        onSubmit={handleSaveProject}
        submitting={isSubmitting}
        errorMessage={createError}
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
  onImportSurp2,
  importingSurp2,
  surp2Preview,
  surp2ImportError,
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
  onImportSurp2: () => void;
  importingSurp2: boolean;
  surp2Preview: Surp2ImportPreview | null;
  surp2ImportError: string | null;
}) {
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
  const averagePhysical =
    summaries.length > 0 ? summaries.reduce((sum, summary) => sum + summary.physical * getWeight(summary), 0) : 0;
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
      title: "Physical Avg",
      value: `${averagePhysical.toFixed(0)}%`,
      subtitle: "Average physical progress across all projects",
      icon: Activity,
      tone: "ok" as Tone,
      trend: summaries.map((summary) => summary.physical),
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

  return (
    <>
      <div className="mb-5 border-b border-border pb-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-txt-dim">
              Planovera - Portfolio
            </div>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-white">
              Overall Project Control Centre
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-txt-muted">
              Track programs, projects, locations, and clients from one command surface with live progress,
              commercial position, and action items.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" onClick={onImportSurp2} disabled={importingSurp2}>
              <DatabaseZap size={14} /> {importingSurp2 ? "Importing..." : "Import SURP2 Test Data"}
            </Button>
            <Button variant="primary" size="sm" onClick={onCreateProject}>
              <Plus size={14} /> New Project
            </Button>
          </div>
        </div>
      </div>

      {surp2ImportError ? (
        <div className="mb-5 rounded-[20px] border border-err/40 bg-err/10 p-4 text-sm text-err">
          {surp2ImportError}
        </div>
      ) : null}

      {surp2Preview ? (
        <div className="mb-5 rounded-[24px] border border-accent/30 bg-accent/10 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-accent">
                Local test import complete
              </div>
              <div className="mt-1 text-lg font-black text-white">{surp2Preview.programName}</div>
              <p className="mt-1 text-sm text-txt-muted">
                {surp2Preview.packageCount} packages imported with USD {currency(surp2Preview.totalBoqValue)} BOQ value.
                Supabase cloud data was not changed.
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-black/15 px-4 py-3 text-right">
              <div className="text-[10px] uppercase tracking-[0.18em] text-txt-dim">Parser warnings</div>
              <div className="mt-1 text-2xl font-black text-warn">{surp2Preview.warningCount}</div>
            </div>
          </div>
          <div className="mt-4 grid gap-2 xl:grid-cols-4">
            {surp2Preview.packages.map((item) => (
              <div key={item.packageNumber} className="rounded-2xl border border-border bg-black/10 p-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-txt-dim">
                  Package {item.packageNumber}
                </div>
                <div className="mt-1 line-clamp-2 text-sm font-bold text-white">{item.projectName}</div>
                <div className="mt-2 text-xs text-txt-muted">
                  BOQ USD {currency(item.boqTotal)} · Actual {item.actualProgress.toFixed(1)}%
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

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
          <span className="rounded-full border border-border bg-black/10 px-3 py-1">
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

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <div className="relative overflow-hidden rounded-[24px] border border-border bg-bg-surface p-6">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent" />
          <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-accent/10 blur-3xl" />
          <div className="relative">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-txt-dim">
              Portfolio Commercial Position
            </div>
            <div className="mt-3 text-4xl font-black tracking-tight text-white">
              USD {currency(totalApprovedCommercial)}
            </div>
            <p className="mt-2 text-sm text-txt-muted">Approved or paid certificates across active projects.</p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-border bg-black/10 p-4">
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-txt-dim">Contract Value</div>
                <div className="mt-2 text-2xl font-black text-white">USD {currency(filteredProjectValue)}</div>
              </div>
              <div className="rounded-2xl border border-border bg-black/10 p-4">
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-txt-dim">Balance</div>
                <div className="mt-2 text-2xl font-black text-warn">USD {currency(balance)}</div>
              </div>
              <div className="rounded-2xl border border-border bg-black/10 p-4">
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-txt-dim">Avg Physical</div>
                <div className="mt-2 text-2xl font-black text-ok">{averagePhysical.toFixed(0)}%</div>
              </div>
              <div className="rounded-2xl border border-border bg-black/10 p-4">
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-txt-dim">Avg Financial</div>
                <div className="mt-2 text-2xl font-black text-accent">{averageFinancial.toFixed(0)}%</div>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-[24px] border border-border bg-bg-surface p-6">
          <div className="mb-5 text-[10px] font-bold uppercase tracking-[0.18em] text-txt-dim">
            Portfolio Averages
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <CompactGauge value={averagePhysical} label="Physical Progress" tone="ok" />
            <CompactGauge value={averageFinancial} label="Financial Progress" tone="accent" />
          </div>
          <div className="mt-5">
            <DualTrendChart
              planned={summaries.map((summary) => summary.progress.planned)}
              actual={summaries.map((summary) => summary.progress.actual)}
            />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-border bg-black/10 p-3">
              <div className="text-[10px] uppercase tracking-[0.16em] text-txt-dim">Planned Avg</div>
              <div className="mt-2 text-xl font-black text-white">{averagePlanned.toFixed(1)}%</div>
            </div>
            <div className="rounded-2xl border border-border bg-black/10 p-3">
              <div className="text-[10px] uppercase tracking-[0.16em] text-txt-dim">Actual Avg</div>
              <div className="mt-2 text-xl font-black text-white">{averageActual.toFixed(1)}%</div>
            </div>
            <div className="rounded-2xl border border-border bg-black/10 p-3">
              <div className="text-[10px] uppercase tracking-[0.16em] text-txt-dim">Approvals</div>
              <div className="mt-2 text-xl font-black text-white">{totalPendingApprovals}</div>
            </div>
          </div>
        </div>
      </div>

      <ProjectLocationsCard summaries={summaries} />

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {metricCards.map((card) => (
          <ReferenceMetricTile key={card.title} {...card} />
        ))}
      </div>

      <div className="mt-5 overflow-hidden rounded-[24px] border border-border bg-bg-surface">
        <div className="border-b border-border px-5 py-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-txt-dim">
                Projects Register
              </div>
              <div className="mt-1 text-lg font-black text-white">
                Project list with physical and financial progress
              </div>
            </div>
            <span className="rounded-full border border-border bg-black/10 px-3 py-1 text-xs text-txt-muted">
              {summaries.length} projects
            </span>
          </div>
        </div>

        <div className="space-y-3 p-4 xl:hidden">
          {summaries.length === 0 ? (
            <div className="rounded-2xl border border-border bg-black/10 p-8 text-center text-sm text-txt-muted">
              No projects yet. Create a project to begin.
            </div>
          ) : (
            summaries.map((summary) => (
              <div key={`${summary.project.id}-mobile`} className="rounded-2xl border border-border bg-black/10 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <button
                      className="bg-transparent p-0 text-left text-base font-black text-accent transition hover:underline"
                      onClick={() => onOpenProject(summary.project.id)}
                    >
                      {summary.project.name}
                    </button>
                    <div className="mt-2 text-[11px] leading-5 text-txt-dim">
                      {[programLabel(programs, summary.project.programId), categoryLabel(categories, summary.project), summary.project.contractNumber, summary.project.code, projectLocationLabel(summary.project)]
                        .filter(Boolean)
                        .join(" - ") || "Project controls workspace"}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => onEditProject(summary.project)}>
                    <PenTool size={14} /> Edit
                  </Button>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-border bg-bg-surface/60 p-3">
                    <div className="mb-2 text-[10px] uppercase tracking-[0.16em] text-txt-dim">Planned vs actual</div>
                    <div className="space-y-2">
                      <ProgressStrip label="Plan" value={summary.progress.planned} tone="accent" />
                      <ProgressStrip label="Actual" value={summary.progress.actual} tone={summary.progress.variance >= 0 ? "ok" : "warn"} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl border border-border bg-bg-surface/60 p-3">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-txt-dim">Physical</div>
                      <div className="mt-1 text-xl font-black text-white">{summary.physical}%</div>
                    </div>
                    <div className="rounded-xl border border-border bg-bg-surface/60 p-3">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-txt-dim">Financial</div>
                      <div className="mt-1 text-xl font-black text-white">{summary.financial}%</div>
                    </div>
                  </div>
                </div>
                <div className="mt-3 inline-flex rounded-full border border-border bg-black/15 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-txt-muted">
                  {summary.project.type === "construction" ? "Construction" : "Non-construction"}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="hidden overflow-x-auto xl:block">
          <table className="w-full min-w-[1040px] border-collapse">
            <thead>
              <tr>
                <th className="px-4 py-3 text-left text-[11px] uppercase tracking-[0.18em] text-txt-dim">Project</th>
                <th className="px-4 py-3 text-left text-[11px] uppercase tracking-[0.18em] text-txt-dim">Planned vs Actual</th>
                <th className="px-4 py-3 text-left text-[11px] uppercase tracking-[0.18em] text-txt-dim">Physical</th>
                <th className="px-4 py-3 text-left text-[11px] uppercase tracking-[0.18em] text-txt-dim">Financial</th>
                <th className="px-4 py-3 text-left text-[11px] uppercase tracking-[0.18em] text-txt-dim">Type</th>
                <th className="px-4 py-3 text-left text-[11px] uppercase tracking-[0.18em] text-txt-dim">Actions</th>
              </tr>
            </thead>
            <tbody>
              {summaries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-14 text-center text-sm text-txt-muted">
                    No projects yet. Create a project to begin.
                  </td>
                </tr>
              ) : (
                summaries.map((summary) => (
                  <tr key={summary.project.id} className="border-t border-border/80 align-top">
                    <td className="px-4 py-4">
                      <button
                        className="bg-transparent p-0 text-left text-lg font-bold text-accent transition hover:underline"
                        onClick={() => onOpenProject(summary.project.id)}
                      >
                        {summary.project.name}
                      </button>
                      <div className="mt-2 text-[11px] text-txt-dim">
                        {[programLabel(programs, summary.project.programId), categoryLabel(categories, summary.project), summary.project.contractNumber, summary.project.code, projectLocationLabel(summary.project), summary.project.contractTitle]
                          .filter(Boolean)
                          .join(" - ") || "Project controls workspace"}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="space-y-2">
                        <ProgressStrip label="Plan" value={summary.progress.planned} tone="accent" />
                        <ProgressStrip
                          label="Actual"
                          value={summary.progress.actual}
                          tone={summary.progress.variance >= 0 ? "ok" : "warn"}
                        />
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="mb-3 text-2xl font-black text-white">{summary.physical}%</div>
                      <ProgressStrip label="Delivery" value={summary.physical} tone="ok" />
                    </td>
                    <td className="px-4 py-4">
                      <div className="mb-3 text-2xl font-black text-white">{summary.financial}%</div>
                      <ProgressStrip label="Commercial" value={summary.financial} tone="accent" />
                    </td>
                    <td className="px-4 py-4">
                      <div className="inline-flex rounded-full border border-border bg-black/15 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-txt-muted">
                        {summary.project.type === "construction" ? "Construction" : "Non-construction"}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <Button variant="ghost" size="sm" onClick={() => onEditProject(summary.project)}>
                        <PenTool size={14} /> Edit
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
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

function ProjectLocationsCard({ summaries }: { summaries: ProjectSummary[] }) {
  const [open, setOpen] = useState(false);
  const points = useMemo(() => buildProjectMapPoints(summaries), [summaries]);
  const plottedCount = points.reduce((sum, point) => sum + point.count, 0);
  const missingCount = Math.max(summaries.length - plottedCount, 0);

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") setOpen(true);
        }}
        className="mt-5 w-full overflow-hidden rounded-[24px] border border-border bg-bg-surface text-left shadow-soft transition hover:border-accent/50"
      >
        <div className="grid gap-0 lg:grid-cols-[0.72fr_1.28fr]">
          <div className="border-b border-border p-5 lg:border-b-0 lg:border-r">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-txt-dim">
                  <MapPin size={14} className="text-accent" /> Project Locations
                </div>
                <div className="mt-2 text-xl font-black text-white">Portfolio map</div>
                <p className="mt-2 text-sm leading-6 text-txt-muted">
                  Location dots update with the current program, client, and location filters.
                </p>
              </div>
              <span className="rounded-xl border border-border bg-black/15 p-2 text-txt-muted">
                <Maximize2 size={16} />
              </span>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-3">
              <div className="rounded-2xl border border-border bg-black/10 p-3">
                <div className="text-[10px] uppercase tracking-[0.16em] text-txt-dim">Dots</div>
                <div className="mt-1 text-2xl font-black text-white">{points.length}</div>
              </div>
              <div className="rounded-2xl border border-border bg-black/10 p-3">
                <div className="text-[10px] uppercase tracking-[0.16em] text-txt-dim">Projects</div>
                <div className="mt-1 text-2xl font-black text-ok">{plottedCount}</div>
              </div>
              <div className="rounded-2xl border border-border bg-black/10 p-3">
                <div className="text-[10px] uppercase tracking-[0.16em] text-txt-dim">Missing</div>
                <div className="mt-1 text-2xl font-black text-warn">{missingCount}</div>
              </div>
            </div>
          </div>
          <ProjectLocationMap points={points} missingCount={missingCount} />
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Project Locations" width={1080}>
        <div className="space-y-4">
          <ProjectLocationMap points={points} missingCount={missingCount} large />
          <div className="grid gap-3 md:grid-cols-2">
            {points.length === 0 ? (
              <div className="rounded-2xl border border-border bg-black/10 p-4 text-sm text-txt-muted">
                No projects in the current filter have region/town or exact coordinates yet.
              </div>
            ) : (
              points.map((point) => (
                <div key={point.id} className="rounded-2xl border border-border bg-black/10 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-bold text-white">{point.label}</div>
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

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
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
    <div className={`relative ${height} overflow-hidden bg-[#0b1424]`}>
      <div ref={mapContainerRef} className="h-full w-full" />

      <div className="pointer-events-none absolute left-5 top-5 rounded-2xl border border-white/10 bg-[#0f172a]/85 px-4 py-3 shadow-soft backdrop-blur">
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-txt-dim">
          Somalia Project Map
        </div>
        <div className="mt-1 text-sm font-bold text-white">
          {points.reduce((sum, point) => sum + point.count, 0)} plotted projects
        </div>
      </div>

      {missingCount > 0 ? (
        <div className="pointer-events-none absolute right-5 top-5 rounded-full border border-warn/30 bg-[#0f172a]/85 px-3 py-1 text-xs font-bold text-warn backdrop-blur">
          {missingCount} missing location
        </div>
      ) : null}

      {mapError ? (
        <div className="absolute inset-x-5 bottom-5 rounded-2xl border border-warn/30 bg-[#0f172a]/90 px-4 py-3 text-sm text-warn shadow-soft backdrop-blur">
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
    physical,
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
      value: `${physical}%`,
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
    {
      title: "Open Actions",
      value: String(openActionPoints),
      subtitle: `${overdueActionPoints} overdue from ${meetingCount} meeting minutes`,
      icon: ClipboardList,
      tone: overdueActionPoints > 0 ? ("warn" as Tone) : ("ok" as Tone),
      trend: [meetingCount, openActionPoints, overdueActionPoints, pendingApprovals],
    },
  ];

  return (
    <>
      <div className="mb-5 border-b border-border pb-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-txt-dim">
              {[project.contractNumber, project.code || "Project", project.role].filter(Boolean).join(" - ")}
            </div>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-white">{project.name}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-txt-muted">
              {[project.contractTitle, projectLocationLabel(project), project.clientName].filter(Boolean).join(" - ") ||
                "Project controls workspace"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-border bg-bg-surface px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-txt-muted">
              {project.type === "construction" ? "Construction" : "Non-construction"}
            </span>
            <span className="rounded-full border border-ok/20 bg-ok/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-ok">
              Active
            </span>
            <Button variant="ghost" size="sm" onClick={() => onEditProject(project)}>
              <PenTool size={14} /> Edit Project
            </Button>
            <Button variant="primary" size="sm" onClick={onCreateProject}>
              <Plus size={14} /> New Project
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metricCards.map((card) => (
          <ReferenceMetricTile key={card.title} {...card} />
        ))}
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-[24px] border border-border bg-bg-surface p-5">
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-txt-dim">
                Progress Summary
              </div>
              <div className="mt-1 text-lg font-black text-white">Planned, actual, earned, and commercial position</div>
            </div>
            <span
              className={`rounded-full border px-3 py-1 text-xs font-bold ${
                progress.variance >= 0
                  ? "border-ok/20 bg-ok/10 text-ok"
                  : "border-warn/20 bg-warn/10 text-warn"
              }`}
            >
              {progress.variance >= 0 ? "+" : ""}
              {progress.variance.toFixed(1)}% variance
            </span>
          </div>

          <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <CompactGauge value={physical} label="Physical" tone="ok" />
              <CompactGauge value={financial} label="Financial" tone="accent" />
            </div>
            <div className="space-y-4">
              <ProgressStrip label="Planned Progress" value={progress.planned} tone="accent" />
              <ProgressStrip label="Actual Progress" value={progress.actual} tone={progress.variance >= 0 ? "ok" : "warn"} />
              <ProgressStrip label="Physical Completion" value={physical} tone="ok" />
              <ProgressStrip label="Financial Completion" value={financial} tone="accent" />
              <div className="grid gap-3 pt-1 sm:grid-cols-2">
                <div className="rounded-2xl border border-border bg-black/10 p-4">
                  <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-txt-dim">Earned Value</div>
                  <div className="mt-2 text-xl font-black text-white">
                    {project.currency || "USD"} {currency(progress.earned)}
                  </div>
                </div>
                <div className="rounded-2xl border border-border bg-black/10 p-4">
                  <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-txt-dim">Approved Commercial</div>
                  <div className="mt-2 text-xl font-black text-white">
                    {project.currency || "USD"} {currency(commercial.approved)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-[24px] border border-border bg-bg-surface p-5">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-txt-dim">
                Contract Timeline
              </div>
              <div className="mt-1 text-lg font-black text-white">Time elapsed against contract period</div>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-warn/10 text-warn">
              <CalendarRange size={18} />
            </div>
          </div>

          {timeline ? (
            <>
              <CompactGauge value={timeline.percent} label="Time Elapsed" tone="warn" />
              <div className="mt-5">
                <ProgressStrip label={`${timeline.elapsedDays} of ${timeline.totalDays} days`} value={timeline.percent} tone="warn" />
              </div>
              <div className="mt-5 grid gap-3 text-xs sm:grid-cols-3">
                <div className="rounded-2xl border border-border bg-black/10 p-3">
                  <div className="uppercase tracking-[0.16em] text-txt-dim">Start</div>
                  <div className="mt-1 font-bold text-white">{project.start_date}</div>
                </div>
                <div className="rounded-2xl border border-border bg-black/10 p-3">
                  <div className="uppercase tracking-[0.16em] text-txt-dim">Remaining</div>
                  <div className="mt-1 font-bold text-white">{timeline.remainingDays} days</div>
                </div>
                <div className="rounded-2xl border border-border bg-black/10 p-3">
                  <div className="uppercase tracking-[0.16em] text-txt-dim">Finish</div>
                  <div className="mt-1 font-bold text-white">{project.end_date}</div>
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-txt-muted">
              Set project start and finish dates to activate timeline tracking.
            </div>
          )}
        </div>
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-[260px_260px]">
        <button
          type="button"
          onClick={() => setShowChecklistModal(true)}
          className={`rounded-[24px] border bg-bg-surface p-5 text-left transition ${
            checklistMetrics.overdue > 0 ? "border-err/30 hover:border-err/60" : "border-border hover:border-ok/35"
          }`}
          aria-label={`Open checklist compliance register. ${checklistMetrics.overdue} overdue checklist items.`}
        >
          <div className="flex items-start justify-between gap-4">
            <div
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${
                checklistMetrics.overdue > 0 ? "bg-err/10 text-err" : "bg-ok/10 text-ok"
              }`}
            >
              <FileText size={20} />
            </div>
            <div className={`text-4xl font-black leading-none ${checklistMetrics.overdue > 0 ? "text-err" : "text-white"}`}>
              {checklistMetrics.overdue}
            </div>
          </div>
          <div className="mt-5 text-[10px] font-bold uppercase tracking-[0.18em] text-txt-dim">Checklist</div>
          <div className="mt-1 text-sm font-bold text-white">Overdue items</div>
          <div className="mt-3 text-xs text-txt-muted">Click to review the full checklist register.</div>
        </button>

        <button
          type="button"
          onClick={() => setShowActionModal(true)}
          className={`rounded-[24px] border bg-bg-surface p-5 text-left transition ${
            overdueActionPoints > 0 ? "border-err/30 hover:border-err/60" : "border-border hover:border-ok/35"
          }`}
          aria-label={`Open action point register. ${overdueActionPoints} overdue action points not done.`}
        >
          <div className="flex items-start justify-between gap-4">
            <div
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${
                overdueActionPoints > 0 ? "bg-err/10 text-err" : "bg-ok/10 text-ok"
              }`}
            >
              <ClipboardList size={20} />
            </div>
            <div className={`text-4xl font-black leading-none ${overdueActionPoints > 0 ? "text-err" : "text-white"}`}>
              {overdueActionPoints}
            </div>
          </div>
          <div className="mt-5 text-[10px] font-bold uppercase tracking-[0.18em] text-txt-dim">Action Points</div>
          <div className="mt-1 text-sm font-bold text-white">Overdue not done</div>
          <div className="mt-3 text-xs text-txt-muted">Click to review the full action register.</div>
        </button>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-3">
        <div className="rounded-[24px] border border-border bg-bg-surface p-5 xl:col-span-2">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent">
              <TrendingUp size={18} />
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-txt-dim">
                Progress Trend
              </div>
              <div className="mt-1 text-lg font-black text-white">Planned vs actual movement</div>
            </div>
          </div>
          <DualTrendChart
            planned={progressHistory.map((item) => item.planned)}
            actual={progressHistory.map((item) => item.actual)}
          />
        </div>

        <div className="rounded-[24px] border border-border bg-bg-surface p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ok/10 text-ok">
              <Wallet size={18} />
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-txt-dim">
                Commercial Position
              </div>
              <div className="mt-1 text-lg font-black text-white">Submitted, approved, paid, and retention</div>
            </div>
          </div>

          <div className="space-y-3">
            {[
              ["Submitted", commercial.submitted],
              ["Approved", commercial.approved],
              ["Paid", commercial.paid],
              ["Retention Held", commercial.retentionHeld],
            ].map(([label, amount]) => (
              <div key={label} className="flex items-center justify-between rounded-2xl border border-border bg-black/10 px-4 py-3">
                <span className="text-sm text-txt-muted">{label}</span>
                <span className="text-base font-black text-white">
                  {project.currency || "USD"} {currency(amount as number)}
                </span>
              </div>
            ))}
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
              ["Required", checklistMetrics.total, "text-white"],
              ["Overdue", checklistMetrics.overdue, checklistMetrics.overdue > 0 ? "text-err" : "text-white"],
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
              <div className="text-lg font-black text-white">No checklist items added yet</div>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-txt-muted">
                Open the Checklist module to add required project documents, deadlines, responsible people, and verification status.
              </p>
              <Button
                variant="primary"
                className="mt-5"
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
                  <thead className="bg-white/5 text-[10px] uppercase tracking-[0.16em] text-txt-dim">
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
                            <div className="font-bold text-white">{item.title || "Untitled checklist item"}</div>
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
                          <div className="font-black text-white">{item.title || "Untitled checklist item"}</div>
                          <div className="mt-1 text-xs text-txt-dim">{item.category || "Uncategorized"}</div>
                        </div>
                        <Badge color={overdue ? "err" : checklistStatusTone[item.status]}>
                          {overdue ? "Overdue" : checklistStatusLabels[item.status]}
                        </Badge>
                      </div>
                      <div className="mt-4 grid gap-3 text-sm">
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-txt-dim">Due / Expiry</span>
                          <span className={`font-bold ${overdue ? "text-err" : "text-white"}`}>
                            {item.dueDate || "Not set"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-txt-dim">Responsible</span>
                          <span className="text-right font-bold text-white">{item.responsiblePerson || "Not assigned"}</span>
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
              <div className="mt-2 text-2xl font-black text-white">{meetingCount}</div>
            </div>
            <div className="rounded-2xl border border-border bg-bg-raised p-4">
              <div className="text-[10px] uppercase tracking-[0.16em] text-txt-dim">Open Actions</div>
              <div className="mt-2 text-2xl font-black text-white">{openActionPoints}</div>
            </div>
            <div className="rounded-2xl border border-border bg-bg-raised p-4">
              <div className="text-[10px] uppercase tracking-[0.16em] text-txt-dim">Overdue</div>
              <div className={`mt-2 text-2xl font-black ${overdueActionPoints > 0 ? "text-err" : "text-white"}`}>
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
                      <div className="text-sm font-bold text-white">{action.description}</div>
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
  formData,
  setFormData,
  programs,
  categories,
  onSubmit,
  submitting,
  errorMessage,
}: {
  open: boolean;
  onClose: () => void;
  mode: "create" | "edit";
  formData: ProjectFormData;
  setFormData: Dispatch<SetStateAction<ProjectFormData>>;
  programs: Program[];
  categories: ProjectCategory[];
  onSubmit: () => void | Promise<void>;
  submitting: boolean;
  errorMessage: string | null;
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
          <div className="space-y-2">
            <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-txt-muted">
              Classification
            </label>
            <select
              className="w-full appearance-none rounded-xl border border-border bg-bg-input px-3 py-3 text-sm font-semibold text-txt outline-none transition-all focus:border-accent focus:ring-4 focus:ring-accent/10"
              value={formData.type}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, type: e.target.value as Project["type"] }))
              }
            >
              <option value="construction">Construction</option>
              <option value="non-construction">Service Ops</option>
            </select>
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
                <div className="text-sm font-bold text-white">Use exact coordinates</div>
                <p className="mt-1 text-xs text-txt-dim">
                  Optional for precise site pins. Leave off to use the town’s approximate map position.
                </p>
              </div>
              <span
                className={`rounded-full border px-3 py-1 text-xs font-bold ${
                  formData.useExactCoordinates
                    ? "border-accent/40 bg-accent/15 text-accent"
                    : "border-border bg-black/10 text-txt-muted"
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
                  placeholder="Optional short line below the main issuer name"
                  value={formData.documentHeaderTagline}
                  onChange={(e) => setFormData((prev) => ({ ...prev, documentHeaderTagline: e.target.value }))}
                />
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
          <div className="grid grid-cols-1 gap-4 md:col-span-2 md:grid-cols-2">
            <div className="space-y-2">
              <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-txt-muted">
                Start Date
              </label>
              <input
                type="date"
                className="w-full rounded-xl border border-border bg-bg-input px-4 py-3 text-sm font-medium text-txt outline-none transition-all focus:border-accent focus:ring-4 focus:ring-accent/10"
                value={formData.start_date}
                onChange={(e) => setFormData((prev) => ({ ...prev, start_date: e.target.value }))}
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
                onChange={(e) => setFormData((prev) => ({ ...prev, end_date: e.target.value }))}
              />
            </div>
          </div>
        </div>
        {errorMessage ? (
          <div className="rounded-2xl border border-err/30 bg-err/10 px-4 py-3 text-sm text-err">
            {errorMessage}
          </div>
        ) : null}
        <div className="mt-6 flex flex-col-reverse gap-3 border-t border-white/5 pt-6 sm:flex-row sm:justify-end">
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
