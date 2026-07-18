// Read-only snapshot of the active project, fed to the assistant so it can
// answer factual questions ("what's my certified-to-date?", "which activities
// are delayed?") without any write path.
//
// The figures here intentionally mirror the dashboard's KPI math so the
// assistant never contradicts what the user sees on screen. The financially
// critical numbers reuse the SAME shared helper the dashboard uses
// (paymentCertificateCalcs); the rest replicate the dashboard's short, pure
// formulas. Keep these in lockstep with components/layout/Dashboard.tsx.

import { paymentCertificateCalcs } from "@/lib/payment-calculations";
import { getLiveMeetingActionItems } from "@/lib/store";
import type {
  Project,
  PaymentCertificate,
  ProgressReport,
} from "@/lib/supabase";

const parseAmount = (value: unknown): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string") return 0;
  const n = parseFloat(value.replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};

const clamp = (value: number, min = 0, max = 100) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : 0));

const round2 = (n: number) => Math.round(n * 100) / 100;
const round1 = (n: number) => Math.round(n * 10) / 10; // matches dashboard's 1-dp % cards
const today = () => new Date().toISOString().split("T")[0];

// Structural view of the store state we read. Accepting this shape (rather than
// the full AppState) keeps the module decoupled; useAppStore.getState() satisfies it.
interface SnapshotState {
  project: Project | null;
  projects: Project[];
  savedBOQs: Array<{ project_id: string; sheets: Array<{ rows: Array<{ type: string; qty?: string; rate?: string; description?: string }> }> }>;
  certificates: PaymentCertificate[];
  savedWorkPlans: Array<{
    project_id: string;
    sheets: Array<{ activities: Array<{ rowType?: string; description: string; status: string; startDate?: string; endDate?: string; isMilestone?: boolean }> }>;
  }>;
  progressReports: ProgressReport[];
  generatedDocuments: Array<{ project_id: string }>;
  correspondenceRecords: Array<{ project_id: string; status?: string }>;
  checklistItems: Array<{ project_id: string; status?: string }>;
  meetingMinutes: Parameters<typeof getLiveMeetingActionItems>[0];
}

export interface ProjectSnapshot {
  project: Record<string, string>;
  financial: Record<string, number | string | null>;
  progress: Record<string, number | string | null>;
  workPlanCompletionPercent: number;
  timeline: Record<string, number | string> | null;
  workPlan: {
    total: number;
    completed: number;
    inProgress: number;
    delayed: number;
    pending: number;
    delayedActivities: string[];
    upcoming: Array<{ description: string; startDate: string; endDate: string; status: string }>;
    milestones: string[];
  };
  boq: { sheetCount: number; itemCount: number; grandTotal: number };
  counts: Record<string, number>;
}

export function buildProjectSnapshot(state: SnapshotState): ProjectSnapshot | null {
  const p = state.project;
  if (!p) return null;
  const id = p.id;
  const currency = p.currency || "USD";

  // ── BOQ totals ─────────────────────────────────────────────────────────────
  const projectBOQs = state.savedBOQs.filter((b) => b.project_id === id);
  let itemCount = 0;
  const boqAmount = projectBOQs
    .flatMap((b) => b.sheets)
    .reduce((sum, sheet) => {
      const items = sheet.rows.filter((r) => r.type === "item");
      itemCount += items.length;
      return sum + items.reduce((s, r) => s + parseAmount(r.qty) * parseAmount(r.rate), 0);
    }, 0);

  // ── Commercial (mirrors computeCommercialSnapshot) ──────────────────────────
  const projectCerts = state.certificates.filter((c) => c.project_id === id);
  const calcs = projectCerts.map((c) => ({ status: c.status, ...paymentCertificateCalcs(c) }));
  const maxNetForStatus = (status: PaymentCertificate["status"]) =>
    calcs.filter((e) => e.status === status).reduce((m, e) => Math.max(m, e.total.net), 0);
  const approved = maxNetForStatus("approved");
  const submitted = maxNetForStatus("submitted");
  const paid = maxNetForStatus("paid");
  const retentionHeld = calcs.length
    ? Math.max(0, calcs.reduce((f, e) => (e.totalSubTotal > f.totalSubTotal ? e : f)).total.retentionHeld)
    : 0;

  const contractValue = parseAmount(p.contractAmount);
  const baseline = contractValue > 0 ? contractValue : boqAmount;
  const certifiedToDate = Math.max(approved, paid);
  const contractRemaining = Math.max(0, contractValue - certifiedToDate);
  const financialProgressPercent = baseline > 0 ? clamp(Math.round((paid / baseline) * 100)) : 0;
  const latestCert = projectCerts.slice().sort((a, b) => a.date.localeCompare(b.date)).at(-1) || null;

  // ── Progress (mirrors computeProgressMetrics on latest report) ──────────────
  const reports = state.progressReports
    .filter((r) => r.project_id === id)
    .sort((a, b) => a.date.localeCompare(b.date));
  const latestReport = reports.at(-1) || null;
  const progItems = latestReport ? latestReport.sheets.flatMap((s) => s.items) : [];
  const planned = progItems.reduce(
    (sum, it: { weightPercent?: string; plannedPercent?: string }) =>
      sum + (parseAmount(it.weightPercent) * parseAmount(it.plannedPercent)) / 100,
    0,
  );
  const actual = progItems.reduce(
    (sum, it: { weightPercent?: string; actualPercent?: string }) =>
      sum + (parseAmount(it.weightPercent) * parseAmount(it.actualPercent)) / 100,
    0,
  );

  // ── Work plan (mirrors computeWorkPlanSnapshot / computePhysicalProgress) ───
  const activities = state.savedWorkPlans
    .filter((w) => w.project_id === id)
    .flatMap((w) => w.sheets.flatMap((s) => s.activities))
    .filter((a) => (a.rowType || "activity") !== "section");
  const byStatus = (s: string) => activities.filter((a) => a.status === s).length;
  const attentionRank: Record<string, number> = { delayed: 0, "in-progress": 1, pending: 2, completed: 3 };
  const upcoming = activities
    .filter((a) => a.status !== "completed")
    .sort(
      (a, b) =>
        (attentionRank[a.status] ?? 9) - (attentionRank[b.status] ?? 9) ||
        (a.startDate || "9999-12-31").localeCompare(b.startDate || "9999-12-31"),
    )
    .slice(0, 5)
    .map((a) => ({ description: a.description, startDate: a.startDate || "", endDate: a.endDate || "", status: a.status }));
  const workPlanCompletionPercent = activities.length
    ? Math.round((byStatus("completed") / activities.length) * 100)
    : 0;

  // ── Timeline (mirrors getTimelineProgress) ──────────────────────────────────
  let timeline: ProjectSnapshot["timeline"] = null;
  if (p.start_date && p.end_date) {
    const start = new Date(p.start_date);
    const end = new Date(p.end_date);
    const now = new Date();
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end > start) {
      const totalDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000));
      const elapsedDays = clamp(Math.ceil((now.getTime() - start.getTime()) / 86400000), 0, totalDays);
      timeline = {
        startDate: p.start_date,
        endDate: p.end_date,
        totalDays,
        elapsedDays,
        remainingDays: Math.max(totalDays - elapsedDays, 0),
        percent: clamp((elapsedDays / totalDays) * 100),
      };
    }
  }

  // ── Counts ──────────────────────────────────────────────────────────────────
  const actionItems = getLiveMeetingActionItems(state.meetingMinutes).filter(
    (a: { project_id?: string }) => a.project_id === id,
  );
  const openActions = actionItems.filter((a: { status?: string }) => a.status !== "closed");
  const overdueActions = openActions.filter(
    (a: { deadline?: string }) => a.deadline && a.deadline < today(),
  );
  const checklist = state.checklistItems.filter((c) => c.project_id === id);

  return {
    project: {
      name: p.name,
      type: p.type,
      role: p.role || "",
      location: p.location || "",
      client: p.clientName || "",
      contractor: p.contractorName || "",
      consultant: p.consultantName || "",
      contractNumber: p.contractNumber || "",
      contractTitle: p.contractTitle || "",
      currency,
      contractAmount: p.contractAmount || "",
      startDate: p.start_date || "",
      endDate: p.end_date || "",
    },
    financial: {
      currency,
      contractValue: round2(contractValue),
      certifiedToDate: round2(certifiedToDate),
      submittedPending: round2(submitted),
      paidToDate: round2(paid),
      retentionHeld: round2(retentionHeld),
      contractRemaining: round2(contractRemaining),
      financialProgressPercent,
      certificateCount: projectCerts.length,
      latestCertificate: latestCert
        ? `IPC ${latestCert.number} (${latestCert.type}, ${latestCert.status})`
        : null,
    },
    progress: {
      reportCount: reports.length,
      latestReport: latestReport ? `${latestReport.name} (${latestReport.date}, ${latestReport.status})` : null,
      plannedPercent: round1(planned),
      actualPercent: round1(actual),
      variancePercent: round1(actual - planned),
    },
    workPlanCompletionPercent,
    timeline,
    workPlan: {
      total: activities.length,
      completed: byStatus("completed"),
      inProgress: byStatus("in-progress"),
      delayed: byStatus("delayed"),
      pending: byStatus("pending"),
      delayedActivities: activities.filter((a) => a.status === "delayed").map((a) => a.description).slice(0, 20),
      upcoming,
      milestones: activities.filter((a) => a.isMilestone).map((a) => a.description).slice(0, 20),
    },
    boq: { sheetCount: projectBOQs.reduce((n, b) => n + b.sheets.length, 0), itemCount, grandTotal: round2(boqAmount) },
    counts: {
      documents: state.generatedDocuments.filter((d) => d.project_id === id).length,
      correspondence: state.correspondenceRecords.filter((r) => r.project_id === id).length,
      pendingApprovals: state.correspondenceRecords.filter((r) => r.project_id === id && r.status === "pending-approval").length,
      openActionPoints: openActions.length,
      overdueActionPoints: overdueActions.length,
      checklistItems: checklist.length,
      checklistPending: checklist.filter((c) => c.status === "pending").length,
    },
  };
}

// ─── Portfolio summary (all projects) ────────────────────────────────────────
// One slim row per project so the assistant can answer cross-project questions
// ("which projects are behind schedule?", "list my projects with status"). Uses
// the same commercial/progress/timeline math as the dashboard.

export interface PortfolioRow {
  name: string;
  type: string;
  role: string;
  location: string;
  currency: string;
  contractValue: number;
  certifiedToDate: number;
  financialProgressPercent: number;
  actualProgressPercent: number | null;
  timeElapsedPercent: number | null;
  scheduleStatus: "behind" | "on-track" | "ahead" | "no-baseline";
  delayedActivities: number;
  startDate: string;
  endDate: string;
}

function summarizeProject(state: SnapshotState, p: Project): PortfolioRow {
  const id = p.id;

  const projectCerts = state.certificates.filter((c) => c.project_id === id);
  const calcs = projectCerts.map((c) => ({ status: c.status, ...paymentCertificateCalcs(c) }));
  const maxNet = (status: PaymentCertificate["status"]) =>
    calcs.filter((e) => e.status === status).reduce((m, e) => Math.max(m, e.total.net), 0);
  const paid = maxNet("paid");
  const certifiedToDate = Math.max(maxNet("approved"), paid);

  const contractValue = parseAmount(p.contractAmount);
  const boqAmount = state.savedBOQs
    .filter((b) => b.project_id === id)
    .flatMap((b) => b.sheets)
    .reduce(
      (sum, sheet) =>
        sum + sheet.rows.filter((r) => r.type === "item").reduce((s, r) => s + parseAmount(r.qty) * parseAmount(r.rate), 0),
      0,
    );
  const baseline = contractValue > 0 ? contractValue : boqAmount;
  const financialProgressPercent = baseline > 0 ? clamp(Math.round((paid / baseline) * 100)) : 0;

  // Actual physical progress from the latest progress report (weighted).
  const reports = state.progressReports
    .filter((r) => r.project_id === id)
    .sort((a, b) => a.date.localeCompare(b.date));
  const latest = reports.at(-1) || null;
  const actualProgressPercent = latest
    ? round1(
        latest.sheets
          .flatMap((s) => s.items)
          .reduce(
            (sum, it: { weightPercent?: string; actualPercent?: string }) =>
              sum + (parseAmount(it.weightPercent) * parseAmount(it.actualPercent)) / 100,
            0,
          ),
      )
    : null;

  // Time elapsed % from the contract dates.
  let timeElapsedPercent: number | null = null;
  if (p.start_date && p.end_date) {
    const start = new Date(p.start_date);
    const end = new Date(p.end_date);
    const now = new Date();
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end > start) {
      const total = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000));
      const elapsed = clamp(Math.ceil((now.getTime() - start.getTime()) / 86400000), 0, total);
      timeElapsedPercent = round1((elapsed / total) * 100);
    }
  }

  // Behind/ahead is progress vs elapsed time; needs both a report and dates.
  let scheduleStatus: PortfolioRow["scheduleStatus"] = "no-baseline";
  if (actualProgressPercent !== null && timeElapsedPercent !== null) {
    const diff = actualProgressPercent - timeElapsedPercent;
    scheduleStatus = diff < -5 ? "behind" : diff > 5 ? "ahead" : "on-track";
  }

  const delayedActivities = state.savedWorkPlans
    .filter((w) => w.project_id === id)
    .flatMap((w) => w.sheets.flatMap((s) => s.activities))
    .filter((a) => (a.rowType || "activity") !== "section" && a.status === "delayed").length;

  return {
    name: p.name,
    type: p.type,
    role: p.role || "",
    location: p.location || "",
    currency: p.currency || "USD",
    contractValue: round2(contractValue),
    certifiedToDate: round2(certifiedToDate),
    financialProgressPercent,
    actualProgressPercent,
    timeElapsedPercent,
    scheduleStatus,
    delayedActivities,
    startDate: p.start_date || "",
    endDate: p.end_date || "",
  };
}

export function buildPortfolioSnapshot(state: SnapshotState): PortfolioRow[] {
  // Cap to keep the prompt bounded; portfolios beyond this are rare.
  return state.projects.slice(0, 60).map((p) => summarizeProject(state, p));
}
