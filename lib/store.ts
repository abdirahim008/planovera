import { create } from "zustand";
import { persist } from "zustand/middleware";
import { temporal } from "zundo";
import { v4 as uuid } from "uuid";
import type {
  ConstructionWorkspacePayload,
  Program,
  ProjectCategory,
  Project,
  BOQSheet,
  BOQRow,
  PaymentCertificate,
  PaymentCertSheet,
  PaymentItem,
  WorkPlanActivity,
  WorkPlanSheet,
  BOQLibraryItem,
  SimpleItem,
  SavedBOQ,
  SavedWorkPlan,
  SavedSimpleItems,
  ProgressReport,
  ProgressSheet,
  ProgressItem,
  GeneratedDocument,
  CorrespondenceRecord,
  ChecklistItem,
  ChecklistStatus,
  SiteNote,
  SiteNoteCategory,
  SiteNotePhoto,
  ApprovalStep,
  MeetingAttendee,
  MeetingAttendeeGroup,
  MeetingAgendaItem,
  MeetingActionItem,
  MeetingMinute,
  UserSignatureProfile,
} from "./supabase";
import { normalizeConstructionWorkspacePayload } from "./supabase";
import type { Surp2ImportPayload } from "./surp2ImportTypes";
import { SURP2_IMPORT_ID } from "./surp2ImportTypes";
import { calculateBOQLineAmount, isPercentageUnit } from "./boq-calculations";
import { DEFAULT_PROJECT_CATEGORIES, categorySlug } from "./projectCategories";
import { sanitizeRichTextHtml } from "./richText";

// Helpers
export const emptyRow = (): BOQRow => ({
  id: uuid(),
  type: "item",
  itemNo: "",
  description: "",
  unit: "",
  qty: "",
  rate: "",
  amount: "",
});

export const headerRow = (desc = "Section Header"): BOQRow => ({
  id: uuid(),
  type: "header",
  itemNo: "",
  description: desc,
  unit: "",
  qty: "",
  rate: "",
  amount: "",
});

export const subtotalRow = (): BOQRow => ({
  id: uuid(),
  type: "subtotal",
  itemNo: "",
  description: "Sub Total",
  unit: "",
  qty: "",
  rate: "",
  amount: "0.00",
});

export const grandtotalRow = (): BOQRow => ({
  id: uuid(),
  type: "grandtotal",
  itemNo: "",
  description: "Grand Total",
  unit: "",
  qty: "",
  rate: "",
  amount: "0.00",
});

export const noteRow = (desc = "Note"): BOQRow => ({
  id: uuid(),
  type: "notes",
  itemNo: "",
  description: desc,
  unit: "",
  qty: "",
  rate: "",
  amount: "",
});

const evalArithmetic = (expr: string): number => {
  const cleaned = expr.trim();
  if (!cleaned) return 0;
  if (!/^[\d+\-*/().,\s]+$/.test(cleaned)) return 0;
  try {
    // Arithmetic-only evaluation after token sanitization.
    const result = Function(`"use strict"; return (${cleaned});`)();
    const num = typeof result === "number" ? result : Number(result);
    return Number.isFinite(num) ? num : 0;
  } catch {
    return 0;
  }
};

const evaluateFormulaExpression = (expr: string, allSheets: BOQSheet[], depth: number): number => {
  if (depth > 5) return 0;

  // Resolve references like 'Sheet 1'!<rowId>.<col>
  let resolvedExpr = expr.replace(
    /'([^']+)'!([a-f0-9-]+)\.(itemNo|description|unit|qty|rate|amount)/gi,
    (_full, sheetName, rowId, colKey) => {
      const sheet = allSheets.find((s) => s.name === sheetName);
      const row = sheet?.rows.find((r) => r.id === rowId);
      const rawVal = row ? String((row as any)[colKey] ?? "0") : "0";
      return String(resolveCellValue(rawVal, allSheets, depth + 1));
    }
  );

  // Resolve spreadsheet-like functions.
  const fnRegex = /(SUM|PRODUCT|SUBTRACT)\(([^()]*)\)/i;
  while (fnRegex.test(resolvedExpr)) {
    resolvedExpr = resolvedExpr.replace(fnRegex, (_full, fnName, argsRaw) => {
      const args = String(argsRaw)
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean)
        .map((a) => evalArithmetic(a));

      if (args.length === 0) return "0";
      if (fnName.toUpperCase() === "SUM") return String(args.reduce((s, n) => s + n, 0));
      if (fnName.toUpperCase() === "PRODUCT") return String(args.reduce((s, n) => s * n, 1));
      // SUBTRACT(a,b,c) => a-b-c
      return String(args.slice(1).reduce((s, n) => s - n, args[0]));
    });
  }

  return evalArithmetic(resolvedExpr);
};

export const resolveCellValue = (value: string, allSheets: BOQSheet[], depth = 0): number => {
  if (depth > 5) return 0; // Simple circularity/depth protection
  if (!value || !value.toString().startsWith("=")) {
    return parseFloat(value?.toString().replace(/,/g, "")) || 0;
  }

  try {
    const expression = value.toString().slice(1);
    return evaluateFormulaExpression(expression, allSheets, depth);
  } catch {
    return 0;
  }
};

export const recalcRows = (rows: BOQRow[], allSheets?: BOQSheet[]): BOQRow[] => {
  let sectionTotal = 0;
  const sheetsForResolution = allSheets || [];

  return rows.map((r) => {
    if (r.type === "item") {
      const q = resolveCellValue(r.qty, sheetsForResolution);
      const rate = resolveCellValue(r.rate, sheetsForResolution);
      
      // If amount is a formula itself, resolve it
      let amt = calculateBOQLineAmount(q, rate, r.unit);
      if (r.amount.startsWith("=")) {
        amt = resolveCellValue(r.amount, sheetsForResolution);
      }

      sectionTotal += amt;
      return { ...r, amount: r.amount.startsWith("=") ? r.amount : (amt ? amt.toFixed(2) : "") };
    }
    if (r.type === "subtotal") {
      const val = sectionTotal;
      sectionTotal = 0;
      return { ...r, amount: val.toFixed(2) };
    }
    if (r.type === "grandtotal") {
      const total = rows
        .filter((x) => x.type === "item")
        .reduce((s, x) => {
          const q = resolveCellValue(x.qty, sheetsForResolution);
          const rate = resolveCellValue(x.rate, sheetsForResolution);
          if (x.amount.startsWith("=")) return s + resolveCellValue(x.amount, sheetsForResolution);
          return s + calculateBOQLineAmount(q, rate, x.unit);
        }, 0);
      return { ...r, amount: total.toFixed(2) };
    }
    return r;
  });
};

export const currency = (v: string | number) => {
  const n = typeof v === "string" ? parseFloat(v.replace(/,/g, "")) : v;
  return isNaN(n) ? "" : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export const addDays = (dateStr: string, days: number) => {
  if (!dateStr || !days) return "";
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days - 1);
  return d.toISOString().split("T")[0];
};

const parseISODateLocal = (dateStr: string): Date | null => {
  if (!dateStr) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const dt = new Date(y, mo, d);
  return Number.isNaN(dt.getTime()) ? null : dt;
};

const inclusiveDaySpan = (startStr: string, endStr: string): string => {
  const s = parseISODateLocal(startStr);
  const e = parseISODateLocal(endStr);
  if (!s || !e) return "";
  const diffMs = e.getTime() - s.getTime();
  const days = Math.floor(diffMs / 86400000) + 1;
  return days > 0 ? String(days) : "";
};

const formatISODateLocal = (d: Date): string => {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
};

const activityEffectiveEndDate = (a: WorkPlanActivity): string => {
  if (a.endDate) return a.endDate;
  if (a.startDate && a.duration) return addDays(a.startDate, parseInt(a.duration, 10) || 0);
  return "";
};

const recalcWorkPlanSections = (activities: WorkPlanActivity[]): WorkPlanActivity[] => {
  const next = activities.map((a) => ({ ...a, rowType: a.rowType || "activity" }));

  const headerIdxs = next
    .map((a, idx) => (a.rowType === "section" ? idx : -1))
    .filter((idx) => idx !== -1);

  headerIdxs.forEach((hIdx) => {
    const start = hIdx + 1;
    let end = next.length;
    for (let i = start; i < next.length; i++) {
      if (next[i].rowType === "section") {
        end = i;
        break;
      }
    }

    let minStart: Date | null = null;
    let maxEnd: Date | null = null;

    for (let i = start; i < end; i++) {
      const child = next[i];
      if (child.rowType === "section") continue;
      const s = parseISODateLocal(child.startDate);
      const eStr = activityEffectiveEndDate(child);
      const e = parseISODateLocal(eStr);
      if (s && (!minStart || s < minStart)) minStart = s;
      if (e && (!maxEnd || e > maxEnd)) maxEnd = e;
    }

    if (!minStart || !maxEnd) {
      next[hIdx] = { ...next[hIdx], startDate: "", endDate: "", duration: "" };
      return;
    }

    const startStr = formatISODateLocal(minStart);
    const endStr = formatISODateLocal(maxEnd);
    next[hIdx] = {
      ...next[hIdx],
      startDate: startStr,
      endDate: endStr,
      duration: inclusiveDaySpan(startStr, endStr),
    };
  });

  return next;
};

// ─── Helper: map activities on a specific sheet ──────────────────
const mapActiveWPSheet = (
  sheets: WorkPlanSheet[],
  activeIdx: number,
  fn: (activities: WorkPlanActivity[]) => WorkPlanActivity[]
): WorkPlanSheet[] =>
  sheets.map((sh, i) => (i === activeIdx ? { ...sh, activities: fn(sh.activities) } : sh));

const parseNumber = (value: string | number | undefined | null): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  return parseFloat(String(value || "0").replace(/,/g, "")) || 0;
};

const deepClone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export type MeetingActionSnapshot = MeetingActionItem & {
  meetingMinuteId: string;
  meetingTitle: string;
  meetingDate: string;
};

const compareMinuteDates = (left: string, right: string) => left.localeCompare(right);

export const getLiveMeetingActionItems = (meetingMinutes: MeetingMinute[]): MeetingActionSnapshot[] => {
  const latestByActionKey = new Map<string, MeetingActionSnapshot>();

  meetingMinutes
    .slice()
    .sort((a, b) => {
      const dateCompare = compareMinuteDates(a.meetingDate, b.meetingDate);
      if (dateCompare !== 0) return dateCompare;
      return a.updatedAt.localeCompare(b.updatedAt);
    })
    .forEach((minute) => {
      minute.actionGroups.forEach((group) => {
        group.actionItems.forEach((actionItem) => {
          latestByActionKey.set(actionItem.actionKey, {
            ...actionItem,
            meetingMinuteId: minute.id,
            meetingTitle: minute.title,
            meetingDate: minute.meetingDate,
          });
        });
      });
    });

  return Array.from(latestByActionKey.values()).sort((a, b) => {
    const statusRank = (value: MeetingActionItem["status"]) =>
      value === "open" ? 0 : value === "in-progress" ? 1 : 2;
    const statusCompare = statusRank(a.status) - statusRank(b.status);
    if (statusCompare !== 0) return statusCompare;
    return a.deadline.localeCompare(b.deadline);
  });
};

const normalizeProgressStatus = (
  status: ProgressItem["status"],
  actualPercent: number
): ProgressItem["status"] => {
  if (status === "delayed" && actualPercent < 100) return "delayed";
  if (actualPercent <= 0) return "not-started";
  if (actualPercent >= 100) return "completed";
  return "in-progress";
};

const clampPercent = (value: number) => Math.max(0, Math.min(100, value));

const recalcProgressSheets = (
  sheets: ProgressSheet[],
  inputMode: ProgressReport["inputMode"] = "quantity",
  weightMode?: ProgressReport["weightMode"]
): ProgressSheet[] => {
  const allItems = sheets.flatMap((sheet) => sheet.items);
  const totalBoqAmount = sheets.reduce(
    (sum, sheet) =>
      sum +
      sheet.items.reduce((sheetSum, item) => sheetSum + Math.max(0, parseNumber(item.boqAmount)), 0),
    0
  );
  const resolvedWeightMode = weightMode || (totalBoqAmount > 0 ? "boq-amount" : "equal");
  const equalWeight = allItems.length > 0 ? 100 / allItems.length : 0;

  return sheets.map((sheet) => ({
    ...sheet,
    items: sheet.items.map((item) => {
      const boqQty = parseNumber(item.boqQty);
      const rate = parseNumber(item.boqRate);
      const boqAmount = parseNumber(item.boqAmount);
      const previousQty = parseNumber(item.previousQty);
      const currentQty = parseNumber(item.currentQty);
      const existingTotalQty = parseNumber(item.totalQty || previousQty + currentQty);
      const isPercentMode = inputMode === "percent";
      const actualPercent = isPercentMode
        ? clampPercent(parseNumber(item.actualPercent))
        : clampPercent(boqQty > 0 ? (existingTotalQty / boqQty) * 100 : 0);
      const totalQty = isPercentMode && boqQty > 0 ? (actualPercent / 100) * boqQty : existingTotalQty;
      const earnedAmount = isPercentMode
        ? (Math.max(0, boqAmount) * actualPercent) / 100
        : calculateBOQLineAmount(totalQty, rate, item.unit);
      const plannedPercent = parseNumber(item.plannedPercent);
      const variancePercent = actualPercent - plannedPercent;
      const weightPercent =
        resolvedWeightMode === "custom"
          ? parseNumber(item.weightPercent)
          : resolvedWeightMode === "boq-amount" && totalBoqAmount > 0
            ? (Math.max(0, boqAmount) / totalBoqAmount) * 100
            : equalWeight;

      return {
        ...item,
        totalQty: totalQty.toFixed(2),
        earnedAmount: earnedAmount.toFixed(2),
        weightPercent: weightPercent.toFixed(2),
        actualPercent: actualPercent.toFixed(2),
        variancePercent: variancePercent.toFixed(2),
        status: normalizeProgressStatus(item.status, actualPercent),
      };
    }),
  }));
};

const buildDemoWorkspace = () => {
  const now = new Date().toISOString();
  const projectId = uuid();
  const demoCategoryId = "demo-category-buildings";
  const boqId = uuid();
  const workPlanId = uuid();
  const progressReport1Id = uuid();
  const progressReport2Id = uuid();
  const certificate1Id = uuid();
  const certificate2Id = uuid();

  const boqItemRow = (
    itemNo: string,
    description: string,
    unit: string,
    qty: number,
    rate: number
  ): BOQRow => ({
    id: uuid(),
    type: "item",
    itemNo,
    description,
    unit,
    qty: String(qty),
    rate: String(rate),
    amount: calculateBOQLineAmount(qty, rate, unit).toFixed(2),
  });

  const project: Project = {
    id: projectId,
    categoryId: demoCategoryId,
    categoryName: "Buildings",
    name: "Mogadishu Learning & Community Centre",
    type: "construction",
    role: "supervision",
    created_at: now,
    code: "PB-MLCC-026",
    contractNumber: "PB-MLCC-026",
    clientName: "Benadir Regional Administration",
    contractorName: "HornBuild Contractors Ltd",
    consultantName: "Civic Project Controls Consortium",
    location: "Mogadishu, Somalia",
    contractTitle: "Design Review and Construction of Learning & Community Centre",
    contractAmount: "460260.00",
    currency: "USD",
    start_date: "2026-01-15",
    end_date: "2026-11-30",
    documentBranding: {
      clientDisplayName: "Benadir Regional Administration",
      clientAddress: "Mogadishu, Somalia\nClient services desk\nplanning@benadir.gov.so",
      issuerDisplayName: "Civic Project Controls Consortium",
      issuerAddress: "Mogadishu, Somalia\nResident engineer office\ncontrols@civicpc.example",
      headerTagline: "Design review and construction of learning & community centre",
    },
  };

  const boqSheets: BOQSheet[] = [
    {
      id: uuid(),
      project_id: projectId,
      name: "Structures",
      sort_order: 0,
      rows: recalcRows([
        headerRow("A. PRELIMINARIES"),
        boqItemRow("A.1", "Mobilization and site establishment", "LS", 1, 120000),
        boqItemRow("A.2", "Temporary utilities and site office", "LS", 1, 45000),
        subtotalRow(),
        headerRow("B. BUILDING WORKS"),
        boqItemRow("B.1", "Excavation in normal soil", "m3", 420, 18),
        boqItemRow("B.2", "Reinforced concrete in foundations and frame", "m3", 180, 290),
        boqItemRow("B.3", "Blockwork walling", "m2", 980, 42),
        boqItemRow("B.4", "Roof sheeting and trusses", "m2", 680, 55),
        boqItemRow("B.5", "Internal and external finishes", "m2", 1250, 28),
        subtotalRow(),
        grandtotalRow(),
      ]),
    },
    {
      id: uuid(),
      project_id: projectId,
      name: "External Works",
      sort_order: 1,
      rows: recalcRows([
        headerRow("C. EXTERNAL INFRASTRUCTURE"),
        boqItemRow("C.1", "Concrete paving and walkways", "m2", 2400, 24),
        boqItemRow("C.2", "Stormwater drainage channels", "m", 620, 32),
        boqItemRow("C.3", "Water supply and storage connection", "LS", 1, 28000),
        boqItemRow("C.4", "Landscaping and external furniture", "LS", 1, 16500),
        subtotalRow(),
        grandtotalRow(),
      ]),
    },
  ];

  const savedBOQ: SavedBOQ = {
    id: boqId,
    project_id: projectId,
    name: "Contract BOQ Rev A",
    createdAt: now,
    updatedAt: now,
    sheets: boqSheets,
  };

  const structuresPlan: WorkPlanSheet = {
    id: uuid(),
    name: "Structures",
    sort_order: 0,
    activities: recalcWorkPlanSections([
      {
        id: uuid(),
        project_id: projectId,
        rowType: "section",
        description: "Site Setup & Early Works",
        duration: "",
        startDate: "",
        endDate: "",
        status: "in-progress",
      },
      {
        id: uuid(),
        project_id: projectId,
        rowType: "activity",
        description: "Mobilization and site establishment",
        duration: "21",
        startDate: "2026-01-15",
        endDate: "2026-02-04",
        status: "completed",
      },
      {
        id: uuid(),
        project_id: projectId,
        rowType: "activity",
        description: "Excavation and foundation preparation",
        duration: "28",
        startDate: "2026-02-05",
        endDate: "2026-03-04",
        status: "completed",
      },
      {
        id: uuid(),
        project_id: projectId,
        rowType: "section",
        description: "Superstructure",
        duration: "",
        startDate: "",
        endDate: "",
        status: "in-progress",
      },
      {
        id: uuid(),
        project_id: projectId,
        rowType: "activity",
        description: "Reinforced concrete frame",
        duration: "45",
        startDate: "2026-03-05",
        endDate: "2026-04-18",
        status: "in-progress",
      },
      {
        id: uuid(),
        project_id: projectId,
        rowType: "activity",
        description: "Blockwork and partitions",
        duration: "38",
        startDate: "2026-04-01",
        endDate: "2026-05-08",
        status: "in-progress",
      },
      {
        id: uuid(),
        project_id: projectId,
        rowType: "activity",
        description: "Roofing installation",
        duration: "24",
        startDate: "2026-05-09",
        endDate: "2026-06-01",
        status: "pending",
      },
      {
        id: uuid(),
        project_id: projectId,
        rowType: "activity",
        description: "Finishes and MEP second fix",
        duration: "60",
        startDate: "2026-06-02",
        endDate: "2026-07-31",
        status: "pending",
      },
    ]),
  };

  const externalPlan: WorkPlanSheet = {
    id: uuid(),
    name: "External Works",
    sort_order: 1,
    activities: recalcWorkPlanSections([
      {
        id: uuid(),
        project_id: projectId,
        rowType: "section",
        description: "External Utilities",
        duration: "",
        startDate: "",
        endDate: "",
        status: "pending",
      },
      {
        id: uuid(),
        project_id: projectId,
        rowType: "activity",
        description: "Stormwater drainage channels",
        duration: "18",
        startDate: "2026-06-15",
        endDate: "2026-07-02",
        status: "pending",
      },
      {
        id: uuid(),
        project_id: projectId,
        rowType: "activity",
        description: "Water supply and storage connection",
        duration: "12",
        startDate: "2026-07-03",
        endDate: "2026-07-14",
        status: "pending",
      },
      {
        id: uuid(),
        project_id: projectId,
        rowType: "section",
        description: "Site Completion",
        duration: "",
        startDate: "",
        endDate: "",
        status: "pending",
      },
      {
        id: uuid(),
        project_id: projectId,
        rowType: "activity",
        description: "Concrete paving and walkways",
        duration: "30",
        startDate: "2026-07-15",
        endDate: "2026-08-13",
        status: "pending",
      },
      {
        id: uuid(),
        project_id: projectId,
        rowType: "activity",
        description: "Landscaping and external furniture",
        duration: "20",
        startDate: "2026-08-14",
        endDate: "2026-09-02",
        status: "pending",
      },
    ]),
  };

  const savedWorkPlan: SavedWorkPlan = {
    id: workPlanId,
    project_id: projectId,
    name: "Baseline Programme",
    createdAt: now,
    updatedAt: now,
    sheets: [structuresPlan, externalPlan],
  };

  const progressItem = (
    billNo: string,
    description: string,
    unit: string,
    boqQty: number,
    rate: number,
    previousQty: number,
    currentQty: number,
    plannedPercent: number,
    status: ProgressItem["status"],
    remarks: string
  ): ProgressItem => ({
    id: uuid(),
    billNo,
    description,
    unit,
    boqQty: String(boqQty),
    boqRate: String(rate),
    boqAmount: calculateBOQLineAmount(boqQty, rate, unit).toFixed(2),
    previousQty: String(previousQty),
    currentQty: String(currentQty),
    totalQty: String(previousQty + currentQty),
    earnedAmount: "0.00",
    weightPercent: "0.00",
    plannedPercent: String(plannedPercent),
    actualPercent: "0.00",
    variancePercent: "0.00",
    status,
    remarks,
  });

  const progressSheetsMarch = recalcProgressSheets([
    {
      id: uuid(),
      name: "Structures",
      items: [
        progressItem("A.1", "Mobilization and site establishment", "LS", 1, 120000, 0, 1, 100, "completed", "Mobilization completed and supervision office operational."),
        progressItem("A.2", "Temporary utilities and site office", "LS", 1, 45000, 0, 1, 100, "completed", "Temporary water and site power connected."),
        progressItem("B.1", "Excavation in normal soil", "m3", 420, 18, 0, 260, 80, "in-progress", "Excavation advanced faster than baseline."),
        progressItem("B.2", "Reinforced concrete in foundations and frame", "m3", 180, 290, 0, 38, 30, "in-progress", "Foundation concrete and starter columns cast."),
        progressItem("B.3", "Blockwork walling", "m2", 980, 42, 0, 0, 5, "not-started", "Awaiting frame elevation to first-floor level."),
        progressItem("B.4", "Roof sheeting and trusses", "m2", 680, 55, 0, 0, 0, "not-started", "Not yet commenced."),
        progressItem("B.5", "Internal and external finishes", "m2", 1250, 28, 0, 0, 0, "not-started", "Not yet commenced."),
      ],
    },
    {
      id: uuid(),
      name: "External Works",
      items: [
        progressItem("C.1", "Concrete paving and walkways", "m2", 2400, 24, 0, 0, 0, "not-started", "Planned for later phase."),
        progressItem("C.2", "Stormwater drainage channels", "m", 620, 32, 0, 0, 0, "not-started", "Awaiting utility coordination."),
        progressItem("C.3", "Water supply and storage connection", "LS", 1, 28000, 0, 0, 10, "not-started", "Connection design under review."),
        progressItem("C.4", "Landscaping and external furniture", "LS", 1, 16500, 0, 0, 0, "not-started", "Final phase activity."),
      ],
    },
  ]);

  const progressSheetsApril = recalcProgressSheets([
    {
      id: uuid(),
      name: "Structures",
      items: [
        progressItem("A.1", "Mobilization and site establishment", "LS", 1, 120000, 1, 0, 100, "completed", "Completed."),
        progressItem("A.2", "Temporary utilities and site office", "LS", 1, 45000, 1, 0, 100, "completed", "Completed."),
        progressItem("B.1", "Excavation in normal soil", "m3", 420, 18, 260, 160, 100, "completed", "Excavation and trimming fully complete."),
        progressItem("B.2", "Reinforced concrete in foundations and frame", "m3", 180, 290, 38, 52, 60, "in-progress", "Ground floor frame and slab concrete completed."),
        progressItem("B.3", "Blockwork walling", "m2", 980, 42, 0, 310, 35, "in-progress", "Ground-floor blockwork progressing zone by zone."),
        progressItem("B.4", "Roof sheeting and trusses", "m2", 680, 55, 0, 0, 8, "not-started", "Procurement package submitted."),
        progressItem("B.5", "Internal and external finishes", "m2", 1250, 28, 0, 0, 3, "not-started", "Pending superstructure completion."),
      ],
    },
    {
      id: uuid(),
      name: "External Works",
      items: [
        progressItem("C.1", "Concrete paving and walkways", "m2", 2400, 24, 0, 0, 0, "not-started", "Not yet commenced."),
        progressItem("C.2", "Stormwater drainage channels", "m", 620, 32, 0, 0, 4, "not-started", "Survey pegs in progress."),
        progressItem("C.3", "Water supply and storage connection", "LS", 1, 28000, 0, 0, 15, "not-started", "Shop drawings returned with comments."),
        progressItem("C.4", "Landscaping and external furniture", "LS", 1, 16500, 0, 0, 0, "not-started", "Not yet commenced."),
      ],
    },
  ]);

  const progressReports: ProgressReport[] = [
    {
      id: progressReport1Id,
      project_id: projectId,
      number: 1,
      name: "Progress Report No. 1",
      date: "2026-03-31",
      status: "approved",
      sourceType: "boq",
      sourceId: boqId,
      sourceName: "Contract BOQ Rev A",
      createdAt: now,
      updatedAt: now,
      sheets: progressSheetsMarch,
    },
    {
      id: progressReport2Id,
      project_id: projectId,
      number: 2,
      name: "Progress Report No. 2",
      date: "2026-04-22",
      status: "submitted",
      sourceType: "boq",
      sourceId: boqId,
      sourceName: "Contract BOQ Rev A",
      createdAt: now,
      updatedAt: now,
      sheets: progressSheetsApril,
    },
  ];

  const paymentItem = (
    billNo: string,
    description: string,
    unit: string,
    boqQty: number,
    rate: number,
    previousAmount: number,
    currentAmount: number,
    totalQty: number
  ): PaymentItem => ({
    id: uuid(),
    billNo,
    description,
    unit,
    boqQty: String(boqQty),
    boqRate: String(rate),
    boqAmount: calculateBOQLineAmount(boqQty, rate, unit).toFixed(2),
    previousAmount: previousAmount.toFixed(2),
    currentAmount: currentAmount.toFixed(2),
    totalQty: totalQty.toFixed(2),
    totalAmount: (previousAmount + currentAmount).toFixed(2),
  });

  const certificates: PaymentCertificate[] = [
    {
      id: certificate1Id,
      project_id: projectId,
      boqId,
      boqName: "Contract BOQ Rev A",
      number: 1,
      type: "interim",
      date: "2026-03-31",
      status: "approved",
      contingenciesPercent: 0,
      governmentTaxPercent: 5,
      retentionPercent: 10,
      advancePaymentPercent: 5,
      withholdingTaxPercent: 3,
      contractorName: "Mahad Ahmed",
      contractorCompany: "HornBuild Contractors Ltd",
      contractorTitle: "Project Manager",
      engineerName: "Eng. Asha Warsame",
      engineerOrg: "Civic Project Controls Consortium",
      engineerTitle: "Resident Engineer",
      employerName: "Abdirahman Ali",
      employerOrg: "Benadir Regional Administration",
      employerTitle: "Project Coordinator",
      sheets: [
        {
          id: uuid(),
          name: "Structures",
          items: [
            paymentItem("A.1", "Mobilization and site establishment", "LS", 1, 120000, 0, 120000, 1),
            paymentItem("A.2", "Temporary utilities and site office", "LS", 1, 45000, 0, 45000, 1),
            paymentItem("B.1", "Excavation in normal soil", "m3", 420, 18, 0, 4680, 260),
            paymentItem("B.2", "Reinforced concrete in foundations and frame", "m3", 180, 290, 0, 11020, 38),
          ],
        },
      ],
    },
    {
      id: certificate2Id,
      project_id: projectId,
      boqId,
      boqName: "Contract BOQ Rev A",
      number: 2,
      type: "interim",
      date: "2026-04-22",
      status: "submitted",
      contingenciesPercent: 0,
      governmentTaxPercent: 5,
      retentionPercent: 10,
      advancePaymentPercent: 5,
      withholdingTaxPercent: 3,
      contractorName: "Mahad Ahmed",
      contractorCompany: "HornBuild Contractors Ltd",
      contractorTitle: "Project Manager",
      engineerName: "Eng. Asha Warsame",
      engineerOrg: "Civic Project Controls Consortium",
      engineerTitle: "Resident Engineer",
      employerName: "Abdirahman Ali",
      employerOrg: "Benadir Regional Administration",
      employerTitle: "Project Coordinator",
      sheets: [
        {
          id: uuid(),
          name: "Structures",
          items: [
            paymentItem("A.1", "Mobilization and site establishment", "LS", 1, 120000, 120000, 0, 1),
            paymentItem("A.2", "Temporary utilities and site office", "LS", 1, 45000, 45000, 0, 1),
            paymentItem("B.1", "Excavation in normal soil", "m3", 420, 18, 4680, 2880, 420),
            paymentItem("B.2", "Reinforced concrete in foundations and frame", "m3", 180, 290, 11020, 15080, 90),
            paymentItem("B.3", "Blockwork walling", "m2", 980, 42, 0, 13020, 310),
          ],
        },
      ],
    },
  ];

  const generatedDocuments: GeneratedDocument[] = [
    {
      id: uuid(),
      project_id: projectId,
      title: "Commencement Letter",
      templateType: "commencement-letter",
      referenceNo: "PB-MLCC-026/CORR/001",
      date: "2026-01-14",
      status: "issued",
      layoutStyle: "letter",
      letterheadTitle: project.consultantName,
      letterheadSubtitle: project.contractTitle,
      letterheadAddress: project.location,
      recipientName: project.contractorName,
      recipientRole: "Main Contractor",
      signatoryName: "Eng. Asha Warsame",
      signatoryRole: "Resident Engineer",
      footerNote: "This letter forms part of the official contract correspondence register.",
      content:
        "Purpose\nFormal notice to commence the works under the contract.\n\nInstruction\nYou are instructed to mobilize and commence the works on site in accordance with the approved programme, drawings, specifications, and contract conditions.\n\nRequired Actions\n- confirm staffing and mobilization within seven days\n- submit updated insurance and method statements\n- commence site safety induction and daily reporting arrangements\n\nClosing\nPlease acknowledge receipt of this commencement letter and confirm readiness to proceed.",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uuid(),
      project_id: projectId,
      title: "Progress Report No. 2",
      templateType: "progress-report",
      referenceNo: "PB-MLCC-026/PR/002",
      date: "2026-04-22",
      status: "issued",
      layoutStyle: "report",
      letterheadTitle: project.consultantName,
      letterheadSubtitle: project.contractTitle,
      letterheadAddress: project.location,
      coverTitle: "Monthly Progress Report",
      coverSubtitle: "April 2026 reporting cycle covering structure, commercial, and approval status.",
      recipientName: project.clientName,
      recipientRole: "Employer",
      signatoryName: "Eng. Asha Warsame",
      signatoryRole: "Resident Engineer",
      footerNote: "Prepared for monthly project controls review and circulation to project stakeholders.",
      content:
        "Executive Summary\n- planned weighted progress: 58.0%\n- actual weighted progress: 54.4%\n- variance: -3.6%\n- earned value: USD 250,920.00\n\nHighlights\n- excavation completed and ground-floor concrete frame substantially advanced\n- blockwork started in the administration wing and classroom block\n- procurement of roofing trusses is slightly behind the approved look-ahead plan\n\nRecommended Actions\n- close structural shop drawing comments within five working days\n- secure roofing material delivery slots before the next reporting period\n- accelerate blockwork resources to recover current variance",
      linkedProgressReportId: progressReport2Id,
      linkedCertificateId: certificate2Id,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uuid(),
      project_id: projectId,
      title: "IPC No. 2 Commercial Summary",
      templateType: "payment-certificate-summary",
      referenceNo: "PB-MLCC-026/IPC/002",
      date: "2026-04-22",
      status: "draft",
      layoutStyle: "report",
      letterheadTitle: project.consultantName,
      letterheadSubtitle: "Commercial Certification Summary",
      letterheadAddress: project.location,
      coverTitle: "Interim Payment Certificate Summary",
      coverSubtitle: "Commercial position and deductions applicable to IPC No. 2.",
      recipientName: project.clientName,
      recipientRole: "Approving Authority",
      signatoryName: "Eng. Asha Warsame",
      signatoryRole: "Resident Engineer",
      footerNote: "Subject to final measurement verification and employer approval.",
      content:
        "Commercial Summary\n- certificate: IPC 02\n- status: SUBMITTED\n- net certified amount: USD 218,025.98\n- retention percentage: 10%\n- advance recovery percentage: 5%\n- withholding tax percentage: 3%\n\nNotes\nMeasurements are based on the April 2026 site valuation and supporting progress records.\n\nRecommendation\nProceed with verification of deductions and finalize payment processing after approval.",
      linkedProgressReportId: progressReport2Id,
      linkedCertificateId: certificate2Id,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uuid(),
      project_id: projectId,
      title: "Instruction Letter - Roofing Procurement Recovery",
      templateType: "instruction-letter",
      referenceNo: "PB-MLCC-026/SI/004",
      date: "2026-04-18",
      status: "issued",
      layoutStyle: "letter",
      letterheadTitle: project.consultantName,
      letterheadSubtitle: project.contractTitle,
      letterheadAddress: project.location,
      recipientName: project.contractorName,
      recipientRole: "Main Contractor",
      signatoryName: "Eng. Asha Warsame",
      signatoryRole: "Resident Engineer",
      footerNote: "Issued under the project correspondence and instruction register.",
      content:
        "Purpose\nThis instruction addresses delayed procurement of roofing trusses and sheeting.\n\nInstruction\nYou are directed to submit an immediate recovery plan showing procurement commitments, supplier lead times, and revised delivery milestones.\n\nCommercial and Time Implications\nAny claim for cost or time impact shall be notified strictly in accordance with the contract and supported with contemporaneous records.\n\nClosing\nPlease acknowledge receipt and submit your recovery plan within three working days.",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uuid(),
      project_id: projectId,
      title: "Completion Certificate Template",
      templateType: "completion-certificate",
      referenceNo: "PB-MLCC-026/CC/TEMPLATE",
      date: "2026-11-30",
      status: "draft",
      layoutStyle: "certificate",
      letterheadTitle: project.clientName,
      letterheadSubtitle: project.contractTitle,
      letterheadAddress: project.location,
      recipientName: project.contractorName,
      recipientRole: "Contractor",
      signatoryName: "Abdirahman Ali",
      signatoryRole: "Authorized Employer Representative",
      footerNote: "Draft certificate for future project close-out and handover use.",
      content:
        "Certification\nThis certifies that the works have reached substantial completion in accordance with the contract requirements, subject to any outstanding minor defects.\n\nConditions\nThe contractor remains responsible for completing outstanding items and attending to any defects during the liability period.\n\nHandover\nFinal records, manuals, testing certificates, and training logs shall be submitted before final handover.",
      createdAt: now,
      updatedAt: now,
    },
  ];

  const approvalSteps = (overseerStatus: ApprovalStep["status"], clientStatus: ApprovalStep["status"]): ApprovalStep[] => [
    {
      id: uuid(),
      role: "Resident Engineer",
      reviewer: "Eng. Asha Warsame",
      status: overseerStatus,
      date: overseerStatus === "pending" ? "" : "2026-04-20",
      comments: overseerStatus === "approved" ? "Reviewed against progress and drawings." : "Awaiting internal review.",
    },
    {
      id: uuid(),
      role: "Client Representative",
      reviewer: "Abdirahman Ali",
      status: clientStatus,
      date: clientStatus === "pending" ? "" : "2026-04-22",
      comments: clientStatus === "approved" ? "Approved for implementation." : "Pending client concurrence.",
    },
  ];

  const correspondenceRecords: CorrespondenceRecord[] = [
    {
      id: uuid(),
      project_id: projectId,
      number: 1,
      type: "instruction",
      referenceNo: "PB-MLCC-026/SI/004",
      subject: "Recover roofing procurement slippage",
      date: "2026-04-18",
      dueDate: "2026-04-23",
      from: project.consultantName || "",
      to: project.contractorName || "",
      status: "open",
      body: "Submit a procurement recovery plan for roofing materials and demonstrate mitigation for the current schedule slippage.",
      linkedDocumentId: generatedDocuments[3].id,
      linkedProgressReportId: progressReport2Id,
      approvalSteps: approvalSteps("approved", "pending"),
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uuid(),
      project_id: projectId,
      number: 2,
      type: "variation-order",
      referenceNo: "PB-MLCC-026/VO/002",
      subject: "Additional drainage outfall and catchpit revision",
      date: "2026-04-16",
      dueDate: "2026-04-28",
      from: project.consultantName || "",
      to: project.clientName || "",
      status: "pending-approval",
      body: "Variation proposed to improve stormwater discharge due to revised site levels observed after excavation.",
      linkedProgressReportId: progressReport2Id,
      estimatedValue: "14500.00",
      approvedValue: "0.00",
      timeImpactDays: "7",
      approvalSteps: approvalSteps("approved", "pending"),
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uuid(),
      project_id: projectId,
      number: 3,
      type: "rfi",
      referenceNo: "PB-MLCC-026/RFI/007",
      subject: "Clarification on roof truss connection detail",
      date: "2026-04-12",
      dueDate: "2026-04-19",
      from: project.contractorName || "",
      to: project.consultantName || "",
      status: "approved",
      body: "Request for clarification on bolt spacing and plate thickness at the roof truss-to-ring beam connection.",
      linkedProgressReportId: progressReport2Id,
      approvalSteps: approvalSteps("approved", "approved"),
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uuid(),
      project_id: projectId,
      number: 4,
      type: "meeting-minute",
      referenceNo: "PB-MLCC-026/MM/005",
      subject: "Weekly site coordination meeting",
      date: "2026-04-21",
      dueDate: "2026-04-24",
      from: project.consultantName || "",
      to: `${project.clientName} / ${project.contractorName}`,
      status: "closed",
      body: "Weekly coordination minutes covering progress variance, outstanding approvals, procurement risks, and look-ahead actions for the next two weeks.",
      linkedProgressReportId: progressReport2Id,
      linkedCertificateId: certificate2Id,
      approvalSteps: approvalSteps("approved", "approved"),
      createdAt: now,
      updatedAt: now,
    },
  ];

  const attendeeGroups: MeetingAttendeeGroup[] = [
    {
      id: uuid(),
      name: "Bi-weekly meeting package",
      members: [
        { id: uuid(), name: "Abdirahim Ibrahim", designation: "Admin", organization: "BRA" },
        { id: uuid(), name: "Abdirahim Mohamed Ibrahim", designation: "PIU Engineer", organization: "BRA" },
        { id: uuid(), name: "Omar Hussein", designation: "PIU Coordinator", organization: "BRA" },
        { id: uuid(), name: "Alemayehu Gessesse", designation: "Resident Engineer", organization: "UNOPS" },
        { id: uuid(), name: "Anteneh Samuel", designation: "Materials Engineer", organization: "UNOPS" },
        { id: uuid(), name: "Abdullahi Jama", designation: "Safeguards Officer", organization: "UNOPS" },
      ],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uuid(),
      name: "Commercial review core team",
      members: [
        { id: uuid(), name: "Eng. Asha Warsame", designation: "Resident Engineer", organization: "CPCC" },
        { id: uuid(), name: "Mahad Ahmed", designation: "Project Manager", organization: "HornBuild" },
        { id: uuid(), name: "Abdirahman Ali", designation: "Project Coordinator", organization: "BRA" },
      ],
      createdAt: now,
      updatedAt: now,
    },
  ];

  const paymentActionKey = uuid();
  const blockworkActionKey = uuid();
  const drainageActionKey = uuid();
  const meetingMinute1Id = uuid();
  const meetingMinute2Id = uuid();

  const meetingMinutes: MeetingMinute[] = [
    {
      id: meetingMinute1Id,
      title: "Project Review Meeting - 15 Apr 2026",
      meetingDate: "2026-04-15",
      status: "final",
      referenceNo: "PB-MLCC-026/MM/006",
      attendees: attendeeGroups[0].members.map((member) => ({ ...member, id: uuid() })),
      agendas: [
        {
          id: uuid(),
          title: "Review physical progress",
          discussion:
            "Ground floor frame progress was reviewed against the approved look-ahead plan. Blockwork started in the admin wing but resource levels remain below the recovery target.",
        },
        {
          id: uuid(),
          title: "Commercial and certification follow-up",
          discussion:
            "IPC No. 2 support documents were checked. The client requested a clearer deduction breakdown and confirmation of retention and advance recovery values.",
        },
      ],
      actionGroups: [
        {
          id: uuid(),
          project_id: projectId,
          actionItems: [
            {
              id: uuid(),
              actionKey: paymentActionKey,
              project_id: projectId,
              description: "Submit revised IPC No. 2 supporting breakdown with deductions clearly reconciled.",
              responsiblePerson: "Mahad Ahmed",
              deadline: "2026-04-19",
              status: "open",
              priority: "high",
              notes: "Client needs reconciliation note before approval.",
            },
            {
              id: uuid(),
              actionKey: blockworkActionKey,
              project_id: projectId,
              description: "Increase blockwork crew allocation to recover the classroom wing sequence.",
              responsiblePerson: "HornBuild Site Team",
              deadline: "2026-04-20",
              status: "in-progress",
              priority: "medium",
              notes: "Recovery to be reflected in the two-week look-ahead.",
            },
          ],
        },
      ],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: meetingMinute2Id,
      title: "Weekly Site Coordination Meeting - 22 Apr 2026",
      meetingDate: "2026-04-22",
      status: "final",
      referenceNo: "PB-MLCC-026/MM/007",
      attendees: attendeeGroups[0].members.map((member) => ({ ...member, id: uuid() })),
      agendas: [
        {
          id: uuid(),
          title: "Follow-up on prior action points",
          discussion:
            "Previous action points were reviewed. The blockwork recovery is progressing, while the IPC support pack remains outstanding and requires immediate closure.",
        },
        {
          id: uuid(),
          title: "Drainage and external works readiness",
          discussion:
            "A field review confirmed that external drainage outfall setting-out needs confirmation before the next pouring sequence.",
        },
      ],
      actionGroups: [
        {
          id: uuid(),
          project_id: projectId,
          actionItems: [
            {
              id: uuid(),
              actionKey: paymentActionKey,
              project_id: projectId,
              description: "Submit revised IPC No. 2 supporting breakdown with deductions clearly reconciled.",
              responsiblePerson: "Mahad Ahmed",
              deadline: "2026-04-24",
              status: "open",
              priority: "high",
              notes: "Still pending client-ready reconciliation.",
              carriedForwardFromMinuteId: meetingMinute1Id,
            },
            {
              id: uuid(),
              actionKey: blockworkActionKey,
              project_id: projectId,
              description: "Increase blockwork crew allocation to recover the classroom wing sequence.",
              responsiblePerson: "HornBuild Site Team",
              deadline: "2026-04-23",
              status: "closed",
              priority: "medium",
              notes: "Additional masons mobilized and production improved.",
              carriedForwardFromMinuteId: meetingMinute1Id,
            },
            {
              id: uuid(),
              actionKey: drainageActionKey,
              project_id: projectId,
              description: "Confirm drainage outfall levels and issue the revised setting-out sketch.",
              responsiblePerson: "Eng. Asha Warsame",
              deadline: "2026-04-25",
              status: "open",
              priority: "medium",
              notes: "Required before the next external works sequence.",
            },
          ],
        },
      ],
      createdAt: now,
      updatedAt: now,
    },
  ];

  const checklistItems: ChecklistItem[] = [
    makeChecklistItem(projectId, {
      title: "Signed contract agreement",
      category: "Contract Documents",
      responsiblePerson: "Abdirahman Ali",
      dueDate: "2026-01-20",
      status: "verified",
      documentUrl: "https://example.com/contract-agreement",
      submittedDate: "2026-01-16",
      verifiedBy: "Eng. Asha Warsame",
      verifiedDate: "2026-01-18",
      notes: "Verified against the contract register.",
      createdAt: now,
      updatedAt: now,
    }),
    makeChecklistItem(projectId, {
      title: "Contractor all-risk insurance",
      category: "Insurances",
      responsiblePerson: "Mahad Ahmed",
      dueDate: "2026-01-25",
      status: "submitted",
      documentUrl: "",
      submittedDate: "2026-01-24",
      notes: "Submitted status needs a document link before verification.",
      createdAt: now,
      updatedAt: now,
    }),
    makeChecklistItem(projectId, {
      title: "Concrete cube test reports",
      category: "Test Reports",
      responsiblePerson: "Site laboratory",
      dueDate: "2026-04-30",
      status: "pending",
      notes: "Required for foundation concrete pours.",
      createdAt: now,
      updatedAt: now,
    }),
  ];

  const siteNotes: SiteNote[] = [
    makeSiteNote(projectId, {
      title: "Classroom wing blockwork progress",
      category: "progress",
      noteDate: "2026-04-22",
      authorName: "Eng. Asha Warsame",
      weather: "Clear morning, light wind",
      locationNote: "Classroom wing - grid B to D",
      observationText:
        "Blockwork crews were active on the classroom wing. Production improved after additional masons were mobilized, but material stacking needs better housekeeping around the access route.",
      createdAt: now,
      updatedAt: now,
    }),
  ];

  return {
    categories: DEFAULT_PROJECT_CATEGORIES.map((category) => ({
      id: `demo-category-${categorySlug(category.name)}`,
      name: category.name,
      code: category.code,
      description: category.description,
      color: category.color,
      status: "active" as const,
      created_at: now,
      updated_at: now,
    })),
    projects: [project],
    project: null,
    activeModule: "dashboard",
    savedBOQs: [savedBOQ],
    activeBOQId: savedBOQ.id,
    boqSheets: savedBOQ.sheets.map((sheet) => ({ ...sheet, rows: sheet.rows.map((row) => ({ ...row })) })),
    activeSheetIndex: 0,
    savedWorkPlans: [savedWorkPlan],
    activeWorkPlanId: savedWorkPlan.id,
    workPlanSheets: savedWorkPlan.sheets.map((sheet) => ({
      ...sheet,
      activities: sheet.activities.map((activity) => ({ ...activity })),
    })),
    activeWorkPlanSheetIndex: 0,
    savedSimpleItemSets: [],
    activeSimpleItemsId: null,
    simpleItems: [],
    certificates,
    progressReports,
    generatedDocuments,
    correspondenceRecords,
    checklistItems,
    siteNotes,
    attendeeGroups,
    meetingMinutes,
    formulaLinking: null,
  };
};

const resetProjectWorkspace = () => ({
  activeModule: "dashboard",
  activeBOQId: null,
  boqSheets: [],
  activeSheetIndex: 0,
  activeWorkPlanId: null,
  workPlanSheets: [],
  activeWorkPlanSheetIndex: 0,
  activeSimpleItemsId: null,
  simpleItems: [],
  formulaLinking: null,
});

const makeChecklistItem = (
  projectId: string,
  item?: Partial<ChecklistItem>,
): ChecklistItem => {
  const now = new Date().toISOString();
  return {
    id: item?.id || uuid(),
    project_id: item?.project_id || projectId,
    title: item?.title || "",
    category: item?.category || "General",
    responsiblePerson: item?.responsiblePerson || "",
    dueDate: item?.dueDate || "",
    status: item?.status || "pending",
    documentUrl: item?.documentUrl || "",
    submittedDate: item?.submittedDate || "",
    verifiedBy: item?.verifiedBy || "",
    verifiedDate: item?.verifiedDate || "",
    notes: item?.notes || "",
    createdAt: item?.createdAt || now,
    updatedAt: item?.updatedAt || now,
  };
};

const makeSiteNote = (
  projectId: string,
  note?: Partial<SiteNote>,
): SiteNote => {
  const now = new Date().toISOString();
  const today = now.split("T")[0];
  return {
    id: note?.id || uuid(),
    project_id: note?.project_id || projectId,
    title: note?.title || "Site observation",
    category: note?.category || "observation",
    noteDate: note?.noteDate || today,
    authorName: note?.authorName || "",
    weather: note?.weather || "",
    locationNote: note?.locationNote || "",
    observationText: note?.observationText || "",
    photos: (note?.photos || []).map((photo, index) => ({
      id: photo.id || uuid(),
      dataUrl: photo.dataUrl || "",
      caption: photo.caption || "",
      takenAt: photo.takenAt || note?.noteDate || today,
      sortOrder: typeof photo.sortOrder === "number" ? photo.sortOrder : index,
    })),
    createdAt: note?.createdAt || now,
    updatedAt: note?.updatedAt || now,
  };
};

export type SiteVisitReportSectionKey =
  | "projectName"
  | "contractReference"
  | "client"
  | "contractor"
  | "consultant"
  | "location"
  | "visitDate"
  | "author"
  | "weather"
  | "observation"
  | "photos"
  | "contractTitle"
  | "projectAmount"
  | "startEndDate"
  | "programCategory"
  | "progressSummary"
  | "checklistSummary";

export type SiteVisitReportOptions = Record<SiteVisitReportSectionKey, boolean>;

export const DEFAULT_SITE_VISIT_REPORT_OPTIONS: SiteVisitReportOptions = {
  projectName: true,
  contractReference: true,
  client: true,
  contractor: true,
  consultant: true,
  location: true,
  visitDate: true,
  author: true,
  weather: true,
  observation: true,
  photos: true,
  contractTitle: false,
  projectAmount: false,
  startEndDate: false,
  programCategory: false,
  progressSummary: false,
  checklistSummary: false,
};

const withSiteVisitReportDefaults = (
  options?: Partial<SiteVisitReportOptions>,
): SiteVisitReportOptions => ({
  ...DEFAULT_SITE_VISIT_REPORT_OPTIONS,
  ...(options || {}),
});

const progressReportMetrics = (report: ProgressReport | null | undefined) => {
  if (!report) return null;
  const items = report.sheets.flatMap((sheet) => sheet.items);
  const planned = items.reduce(
    (sum, item) => sum + ((parseFloat(item.weightPercent || "0") || 0) * (parseFloat(item.plannedPercent || "0") || 0)) / 100,
    0,
  );
  const actual = items.reduce(
    (sum, item) => sum + ((parseFloat(item.weightPercent || "0") || 0) * (parseFloat(item.actualPercent || "0") || 0)) / 100,
    0,
  );
  const earned = items.reduce((sum, item) => sum + (parseFloat(item.earnedAmount || "0") || 0), 0);
  return { planned, actual, variance: actual - planned, earned, itemCount: items.length };
};

const buildSiteVisitReportContent = (
  project: Project | null,
  note: SiteNote,
  options?: Partial<SiteVisitReportOptions>,
  context?: {
    programName?: string;
    categoryName?: string;
    latestProgressReport?: ProgressReport | null;
    checklistItems?: ChecklistItem[];
  },
) => {
  const selected = withSiteVisitReportDefaults(options);
  const locationLine = note.locationNote || project?.location || "Project site";
  const weatherLine = note.weather || "Not recorded";
  const authorLine = note.authorName || "Field team";
  const photoSummary =
    note.photos.length > 0
      ? `${note.photos.length} captioned photo${note.photos.length === 1 ? "" : "s"} attached below.`
      : "No photos were attached to this site note.";
  const metaLines: string[] = [];

  if (selected.projectName) metaLines.push(`- project: ${project?.name || "Project"}`);
  if (selected.contractReference) metaLines.push(`- contract reference: ${project?.contractNumber || project?.code || "Not set"}`);
  if (selected.client) metaLines.push(`- client: ${project?.clientName || "Not set"}`);
  if (selected.contractor) metaLines.push(`- contractor: ${project?.contractorName || "Not set"}`);
  if (selected.consultant) metaLines.push(`- consultant: ${project?.consultantName || "Not set"}`);
  if (selected.location) metaLines.push(`- site area / location: ${locationLine}`);
  if (selected.visitDate) metaLines.push(`- visit date: ${note.noteDate}`);
  if (selected.author) metaLines.push(`- prepared by: ${authorLine}`);
  if (selected.weather) metaLines.push(`- weather: ${weatherLine}`);
  if (selected.contractTitle) metaLines.push(`- contract title: ${project?.contractTitle || "Not set"}`);
  if (selected.projectAmount) {
    metaLines.push(`- contract amount: ${project?.currency || "USD"} ${currency(project?.contractAmount || "0") || "Not set"}`);
  }
  if (selected.startEndDate) {
    metaLines.push(`- contract period: ${project?.start_date || "Start not set"} to ${project?.end_date || "Completion not set"}`);
  }
  if (selected.programCategory) {
    const programCategory = [context?.programName, context?.categoryName || project?.categoryName].filter(Boolean).join(" / ");
    metaLines.push(`- program / category: ${programCategory || "Not set"}`);
  }

  const sections: string[] = [];
  if (metaLines.length > 0) sections.push(`Visit Summary\n${metaLines.join("\n")}`);

  if (selected.progressSummary) {
    const progress = progressReportMetrics(context?.latestProgressReport);
    sections.push(
      progress
        ? `Progress Summary\n- progress report: ${context?.latestProgressReport?.name || "Latest progress report"}\n- planned weighted: ${progress.planned.toFixed(1)}%\n- actual weighted: ${progress.actual.toFixed(1)}%\n- variance: ${progress.variance.toFixed(1)}%\n- earned value: ${project?.currency || "USD"} ${currency(progress.earned)}`
        : "Progress Summary\nNo progress report was available for this project.",
    );
  }

  if (selected.checklistSummary) {
    const checklist = context?.checklistItems || [];
    const verified = checklist.filter((item) => item.status === "verified").length;
    const submitted = checklist.filter((item) => item.status === "submitted" || item.status === "verified").length;
    const pending = checklist.filter((item) => item.status === "pending").length;
    sections.push(
      `Checklist / Compliance Summary\n- required items: ${checklist.length}\n- submitted or verified: ${submitted}\n- verified: ${verified}\n- pending: ${pending}`,
    );
  }

  if (selected.observation) {
    sections.push(`Observation\n${note.observationText || "Record the site observation, instruction, issue, or progress note here."}`);
  }

  if (selected.photos) {
    sections.push(`Photo Record\n${photoSummary}`);
  }

  return sections.length > 0 ? sections.join("\n\n") : "Site Visit Report\nNo report sections were selected.";
};

// Store
interface AppState {
  programs: Program[];
  categories: ProjectCategory[];
  projects: Project[];
  project: Project | null;
  setPrograms: (programs: Program[]) => void;
  createProgram: (program: Program) => void;
  setCategories: (categories: ProjectCategory[]) => void;
  createCategory: (category: ProjectCategory) => void;
  setProjects: (projects: Project[]) => void;
  hydrateWorkspaceSnapshot: (payload: ConstructionWorkspacePayload | null | undefined) => void;
  clearWorkspaceData: () => void;
  setProject: (p: Project | null) => void;
  clearProjectSelection: () => void;
  selectProject: (projectId: string) => void;
  createNewProject: (p: Project) => void;
  updateProject: (projectId: string, updates: Partial<Project>) => void;
  loadDemoWorkspace: () => void;
  importLocalTestData: (payload: Surp2ImportPayload) => void;

  activeModule: string;
  setActiveModule: (m: string) => void;

  // ─── Saved Collections ───────────────────────────────────────────
  savedBOQs: SavedBOQ[];
  activeBOQId: string | null;
  createBOQ: (name: string) => void;
  openBOQ: (id: string) => void;
  saveBOQ: () => void;
  deleteBOQ: (id: string) => void;
  duplicateBOQ: (id: string) => void;

  savedWorkPlans: SavedWorkPlan[];
  activeWorkPlanId: string | null;
  createWorkPlan: (name: string) => void;
  openWorkPlan: (id: string) => void;
  saveWorkPlan: () => void;
  deleteWorkPlan: (id: string) => void;
  duplicateWorkPlan: (id: string) => void;

  savedSimpleItemSets: SavedSimpleItems[];
  activeSimpleItemsId: string | null;
  createSimpleItemSet: (name: string) => void;
  openSimpleItemSet: (id: string) => void;
  saveSimpleItemSet: () => void;
  deleteSimpleItemSet: (id: string) => void;
  duplicateSimpleItemSet: (id: string) => void;

  // ─── BOQ Working State ───────────────────────────────────────────
  boqSheets: BOQSheet[];
  activeSheetIndex: number;
  setActiveSheetIndex: (i: number) => void;
  setBoqSheets: (sheets: BOQSheet[]) => void;
  updateSheetRows: (sheetIndex: number, rows: BOQRow[]) => void;
  addSheet: () => void;
  duplicateSheet: (idx: number) => void;
  moveSheet: (fromIndex: number, toIndex: number) => void;
  deleteSheet: (idx: number) => void;
  renameSheet: (idx: number, name: string) => void;
  toggleSheetSummary: (idx: number) => void;
  updateSheetSummaryLabel: (idx: number, label: string) => void;
  loadBOQFromLibrary: (sheets: BOQSheet[]) => void;
  pasteBOQRows: (sheetIndex: number, startRowIndex: number, startColKey: string, rawData: string) => void;
  clearBOQRange: (sheetIndex: number, r1: number, r2: number, c1: string, c2: string) => void;
  // Formula Linking
  formulaLinking: { 
    active: boolean; 
    targetSheetIndex?: number; 
    targetRowId?: string; 
    targetColKey?: string; 
    currentFormula: string; 
  } | null;
  startFormulaLinking: (sheetIdx: number, rowId: string, colKey: string, initialFormula?: string) => void;
  selectFormulaSource: (sheetIdx: number, rowId: string, colKey: string) => void;
  cancelFormulaLinking: () => void;
  completeFormulaLinking: () => void;

  // ─── Payment ─────────────────────────────────────────────────────
  certificates: PaymentCertificate[];
  setCertificates: (c: PaymentCertificate[]) => void;
  addCertificate: (type: "interim" | "final", boqId: string, prevCertId?: string | null) => void;
  updateCertItem: (certId: string, sheetId: string, itemId: string, key: string, value: string) => void;
  updateCertSettings: (certId: string, settings: Partial<PaymentCertificate>) => void;
  deleteCertificate: (certId: string) => void;

  // ─── Progress ────────────────────────────────────────────────────
  progressReports: ProgressReport[];
  createProgressReport: (
    name: string,
    sourceType: "boq" | "items",
    sourceId: string,
    prevReportId?: string | null,
    inputMode?: ProgressReport["inputMode"]
  ) => void;
  updateProgressReport: (reportId: string, updates: Partial<ProgressReport>) => void;
  updateProgressItem: (reportId: string, sheetId: string, itemId: string, key: keyof ProgressItem, value: string) => void;
  duplicateProgressReport: (reportId: string) => void;
  deleteProgressReport: (reportId: string) => void;

  // ─── Documents ───────────────────────────────────────────────────
  generatedDocuments: GeneratedDocument[];
  userSignatureProfile: UserSignatureProfile | null;
  setUserSignatureProfile: (profile: UserSignatureProfile) => void;
  clearUserSignatureProfile: () => void;
  addGeneratedDocument: (doc: GeneratedDocument) => void;
  updateGeneratedDocument: (id: string, updates: Partial<GeneratedDocument>) => void;
  deleteGeneratedDocument: (id: string) => void;

  // ─── Correspondence / Approvals ─────────────────────────────────
  correspondenceRecords: CorrespondenceRecord[];
  addCorrespondenceRecord: (record: CorrespondenceRecord) => void;
  updateCorrespondenceRecord: (id: string, updates: Partial<CorrespondenceRecord>) => void;
  deleteCorrespondenceRecord: (id: string) => void;
  duplicateCorrespondenceRecord: (id: string) => void;
  updateApprovalStep: (recordId: string, stepId: string, updates: Partial<ApprovalStep>) => void;

  checklistItems: ChecklistItem[];
  addChecklistItem: (item?: Partial<ChecklistItem>) => void;
  addChecklistItems: (items: Partial<ChecklistItem>[]) => void;
  updateChecklistItem: (id: string, updates: Partial<ChecklistItem>) => void;
  deleteChecklistItem: (id: string) => void;
  duplicateChecklistItem: (id: string) => void;
  setChecklistStatus: (id: string, status: ChecklistStatus) => void;

  siteNotes: SiteNote[];
  addSiteNote: (note?: Partial<SiteNote>) => void;
  updateSiteNote: (id: string, updates: Partial<SiteNote>) => void;
  deleteSiteNote: (id: string) => void;
  duplicateSiteNote: (id: string) => void;
  addSiteNotePhoto: (noteId: string, photo: Omit<SiteNotePhoto, "id" | "sortOrder"> & Partial<SiteNotePhoto>) => void;
  updateSiteNotePhoto: (noteId: string, photoId: string, updates: Partial<SiteNotePhoto>) => void;
  deleteSiteNotePhoto: (noteId: string, photoId: string) => void;
  createSiteVisitReportFromNote: (noteId: string, options?: Partial<SiteVisitReportOptions>) => void;

  attendeeGroups: MeetingAttendeeGroup[];
  saveAttendeeGroup: (group: MeetingAttendeeGroup) => void;
  deleteAttendeeGroup: (id: string) => void;

  meetingMinutes: MeetingMinute[];
  saveMeetingMinute: (minute: MeetingMinute) => void;
  deleteMeetingMinute: (id: string) => void;
  duplicateMeetingMinute: (id: string) => void;

  // ─── Work Plan Working State (multi-sheet) ───────────────────────
  workPlanSheets: WorkPlanSheet[];
  activeWorkPlanSheetIndex: number;
  setActiveWorkPlanSheetIndex: (i: number) => void;
  addWorkPlanSheet: () => void;
  duplicateWorkPlanSheet: (idx: number) => void;
  deleteWorkPlanSheet: (idx: number) => void;
  renameWorkPlanSheet: (idx: number, name: string) => void;
  addActivity: () => void;
  updateActivity: (id: string, key: string, value: string) => void;
  deleteActivity: (id: string) => void;
  deleteActivities: (ids: string[]) => void;
  insertActivityAt: (anchorId: string, position: "above" | "below") => void;
  moveActivity: (id: string, dir: "up" | "down") => void;
  pasteActivityAt: (anchorId: string, position: "above" | "below", clipboard: WorkPlanActivity[]) => void;
  fetchActivitiesFromBOQ: (boqId: string) => void;
  pasteWorkPlanRows: (startRowIndex: number, startColKey: string, rawData: string) => void;
  clearWorkPlanRange: (r1: number, r2: number, c1: string, c2: string) => void;

  // ─── Simple Items Working State ──────────────────────────────────
  simpleItems: SimpleItem[];
  setSimpleItems: (items: SimpleItem[]) => void;
  updateSimpleItem: (id: string, key: string, value: string) => void;
  addSimpleItem: () => void;
  deleteSimpleItem: (id: string) => void;
  insertSimpleItemAt: (anchorId: string, position: "above" | "below") => void;
  moveSimpleItem: (id: string, dir: "up" | "down") => void;
  pasteSimpleItemAt: (anchorId: string, position: "above" | "below", clipboard: SimpleItem[]) => void;

  // ─── BOQ Library ─────────────────────────────────────────────────
  boqLibrary: BOQLibraryItem[];
  setBOQLibrary: (items: BOQLibraryItem[]) => void;
  addToLibrary: (name: string, description: string, category: string) => void;
  deleteFromLibrary: (id: string) => void;

  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
}

export const useAppStore = create<AppState>()(
  temporal(
    persist(
      (set, get) => ({
      programs: [],
      categories: [],
      projects: [],
      project: null,
      setPrograms: (programs) => set({ programs }),
      createProgram: (program) =>
        set((state) => ({
          programs: state.programs.some((item) => item.id === program.id)
            ? state.programs.map((item) => (item.id === program.id ? program : item))
            : [...state.programs, program],
        })),
      setCategories: (categories) => set({ categories }),
      createCategory: (category) =>
        set((state) => ({
          categories: state.categories.some((item) => item.id === category.id)
            ? state.categories.map((item) => (item.id === category.id ? category : item))
            : [...state.categories, category],
        })),
      setProjects: (projects) =>
        set((state) => {
          const selectedProject = state.project
            ? projects.find((item) => item.id === state.project?.id) || null
            : null;

          if (state.project && !selectedProject) {
            return {
              projects,
              project: null,
              ...resetProjectWorkspace(),
            };
          }

          return {
            projects,
            project: selectedProject,
          };
        }),
      hydrateWorkspaceSnapshot: (payload) => {
        const next = normalizeConstructionWorkspacePayload(payload);
        set({
          savedBOQs: deepClone(next.savedBOQs),
          activeBOQId: next.activeBOQId,
          boqSheets: deepClone(next.boqSheets),
          activeSheetIndex: next.activeSheetIndex,
          savedWorkPlans: deepClone(next.savedWorkPlans),
          activeWorkPlanId: next.activeWorkPlanId,
          workPlanSheets: deepClone(next.workPlanSheets),
          activeWorkPlanSheetIndex: next.activeWorkPlanSheetIndex,
          savedSimpleItemSets: deepClone(next.savedSimpleItemSets),
          activeSimpleItemsId: next.activeSimpleItemsId,
          simpleItems: deepClone(next.simpleItems),
          certificates: deepClone(next.certificates),
          progressReports: deepClone(next.progressReports),
          generatedDocuments: deepClone(next.generatedDocuments),
          userSignatureProfile: next.userSignatureProfile ? deepClone(next.userSignatureProfile) : null,
          correspondenceRecords: deepClone(next.correspondenceRecords),
          checklistItems: deepClone(next.checklistItems),
          siteNotes: deepClone(next.siteNotes),
          attendeeGroups: deepClone(next.attendeeGroups),
          meetingMinutes: deepClone(next.meetingMinutes),
          formulaLinking: null,
        });
      },
      clearWorkspaceData: () => {
        const next = normalizeConstructionWorkspacePayload(null);
        set({
          savedBOQs: next.savedBOQs,
          activeBOQId: next.activeBOQId,
          boqSheets: next.boqSheets,
          activeSheetIndex: next.activeSheetIndex,
          savedWorkPlans: next.savedWorkPlans,
          activeWorkPlanId: next.activeWorkPlanId,
          workPlanSheets: next.workPlanSheets,
          activeWorkPlanSheetIndex: next.activeWorkPlanSheetIndex,
          savedSimpleItemSets: next.savedSimpleItemSets,
          activeSimpleItemsId: next.activeSimpleItemsId,
          simpleItems: next.simpleItems,
          certificates: next.certificates,
          progressReports: next.progressReports,
          generatedDocuments: next.generatedDocuments,
          userSignatureProfile: next.userSignatureProfile ?? null,
          correspondenceRecords: next.correspondenceRecords,
          checklistItems: next.checklistItems,
          siteNotes: next.siteNotes,
          attendeeGroups: next.attendeeGroups,
          meetingMinutes: next.meetingMinutes,
          formulaLinking: null,
        });
      },
      setProject: (p) => set({ project: p }),
      clearProjectSelection: () =>
        set({
          project: null,
          ...resetProjectWorkspace(),
        }),
      selectProject: (projectId) =>
        set((s) => ({
          project: s.projects.find((p) => p.id === projectId) || null,
          ...resetProjectWorkspace(),
        })),
      createNewProject: (p) =>
        set((s) => ({
          projects: [...s.projects, p],
          project: p,
          ...resetProjectWorkspace(),
        })),
      updateProject: (projectId, updates) =>
        set((s) => {
          const projects = s.projects.map((item) =>
            item.id === projectId ? { ...item, ...updates } : item
          );
          const updatedProject = projects.find((item) => item.id === projectId) || null;

          return {
            projects,
            project: s.project?.id === projectId ? updatedProject : s.project,
          };
        }),
      loadDemoWorkspace: () => set(() => buildDemoWorkspace()),
      importLocalTestData: (payload) =>
        set((s) => {
          if (payload.importId !== SURP2_IMPORT_ID) return s;
          const isSurp2Id = (id?: string | null) => Boolean(id?.startsWith("surp2-"));
          const importedProjectIds = new Set(payload.projects.map((item) => item.id));

          return {
            programs: [
              ...s.programs.filter((program) => !isSurp2Id(program.id)),
              ...deepClone(payload.programs),
            ],
            categories:
              s.categories.length > 0
                ? s.categories
                : DEFAULT_PROJECT_CATEGORIES.map((category) => ({
                    id: `default-category-${categorySlug(category.name)}`,
                    name: category.name,
                    code: category.code,
                    description: category.description,
                    color: category.color,
                    status: "active" as const,
                    created_at: new Date().toISOString(),
                  })),
            projects: [
              ...s.projects.filter((project) => !isSurp2Id(project.id)),
              ...deepClone(payload.projects),
            ],
            project: null,
            savedBOQs: [
              ...s.savedBOQs.filter(
                (boq) => !isSurp2Id(boq.id) && !importedProjectIds.has(boq.project_id)
              ),
              ...deepClone(payload.savedBOQs),
            ],
            savedWorkPlans: [
              ...s.savedWorkPlans.filter(
                (workPlan) => !isSurp2Id(workPlan.id) && !importedProjectIds.has(workPlan.project_id)
              ),
              ...deepClone(payload.savedWorkPlans),
            ],
            certificates: [
              ...s.certificates.filter(
                (certificate) =>
                  !isSurp2Id(certificate.id) && !importedProjectIds.has(certificate.project_id)
              ),
              ...deepClone(payload.certificates),
            ],
            progressReports: [
              ...s.progressReports.filter(
                (report) => !isSurp2Id(report.id) && !importedProjectIds.has(report.project_id)
              ),
              ...deepClone(payload.progressReports),
            ],
            generatedDocuments: s.generatedDocuments.filter(
              (document) => !isSurp2Id(document.id) && !importedProjectIds.has(document.project_id)
            ),
            correspondenceRecords: s.correspondenceRecords.filter(
              (record) => !isSurp2Id(record.id) && !importedProjectIds.has(record.project_id)
            ),
            checklistItems: s.checklistItems.filter(
              (item) => !isSurp2Id(item.id) && !importedProjectIds.has(item.project_id)
            ),
            siteNotes: s.siteNotes.filter(
              (note) => !isSurp2Id(note.id) && !importedProjectIds.has(note.project_id)
            ),
            meetingMinutes: s.meetingMinutes.filter(
              (minute) =>
                !isSurp2Id(minute.id) &&
                !minute.actionGroups.some((group) => importedProjectIds.has(group.project_id))
            ),
            ...resetProjectWorkspace(),
          };
        }),

      activeModule: "dashboard",
      setActiveModule: (m) => set({ activeModule: m }),

      formulaLinking: null,

      // ═══════════════════════════════════════════════════════════════
      // ─── Saved BOQs ────────────────────────────────────────────────
      // ═══════════════════════════════════════════════════════════════
      savedBOQs: [],
      activeBOQId: null,

      createBOQ: (name) => {
        const now = new Date().toISOString();
        const newBOQ: SavedBOQ = {
          project_id: get().project?.id || "",
          id: uuid(), name, createdAt: now, updatedAt: now,
          sheets: [{
            id: uuid(), project_id: get().project?.id || "", name: "Sheet 1", sort_order: 0,
            rows: Array.from({ length: 8 }, () => emptyRow()),
          }],
        };
        set({
          savedBOQs: [...get().savedBOQs, newBOQ],
          activeBOQId: newBOQ.id,
          boqSheets: newBOQ.sheets.map((s) => ({ ...s, rows: s.rows.map((r) => ({ ...r })) })),
          activeSheetIndex: 0,
        });
      },
      openBOQ: (id) => {
        const boq = get().savedBOQs.find((b) => b.id === id);
        if (!boq) return;
        set({
          activeBOQId: id,
          boqSheets: boq.sheets.map((s) => ({ ...s, rows: s.rows.map((r) => ({ ...r })) })),
          activeSheetIndex: 0,
        });
      },
      saveBOQ: () => {
        const { activeBOQId, boqSheets } = get();
        if (!activeBOQId) return;
        set({
          savedBOQs: get().savedBOQs.map((b) =>
            b.id === activeBOQId
              ? { ...b, sheets: boqSheets.map((s) => ({ ...s, rows: s.rows.map((r) => ({ ...r })) })), updatedAt: new Date().toISOString() }
              : b
          ),
        });
      },
      deleteBOQ: (id) => {
        set((s) => ({
          savedBOQs: s.savedBOQs.filter((b) => b.id !== id),
          ...(s.activeBOQId === id ? { activeBOQId: null, boqSheets: [], activeSheetIndex: 0 } : {}),
        }));
      },
      duplicateBOQ: (id) => {
        const boq = get().savedBOQs.find((b) => b.id === id);
        if (!boq) return;
        const now = new Date().toISOString();
        const dup: SavedBOQ = {
          project_id: boq.project_id || get().project?.id || "",
          id: uuid(), name: `${boq.name} (Copy)`, createdAt: now, updatedAt: now,
          sheets: boq.sheets.map((s) => ({ ...s, id: uuid(), rows: s.rows.map((r) => ({ ...r, id: uuid() })) })),
        };
        set({ savedBOQs: [...get().savedBOQs, dup] });
      },

      // ═══════════════════════════════════════════════════════════════
      // ─── Saved Work Plans ──────────────────────────────────────────
      // ═══════════════════════════════════════════════════════════════
      savedWorkPlans: [],
      activeWorkPlanId: null,

      createWorkPlan: (name) => {
        const now = new Date().toISOString();
        const initialSheet: WorkPlanSheet = { id: uuid(), name: "Sheet 1", sort_order: 0, activities: [] };
        const newWP: SavedWorkPlan = { id: uuid(), project_id: get().project?.id || "", name, createdAt: now, updatedAt: now, sheets: [initialSheet] };
        set({
          savedWorkPlans: [...get().savedWorkPlans, newWP],
          activeWorkPlanId: newWP.id,
          workPlanSheets: [{ ...initialSheet }],
          activeWorkPlanSheetIndex: 0,
        });
      },
      openWorkPlan: (id) => {
        const wp = get().savedWorkPlans.find((w) => w.id === id);
        if (!wp) return;
        set({
          activeWorkPlanId: id,
          workPlanSheets: wp.sheets.map((sh) => ({
            ...sh,
            activities: recalcWorkPlanSections(sh.activities.map((a) => ({ ...a, rowType: a.rowType || "activity" }))),
          })),
          activeWorkPlanSheetIndex: 0,
        });
      },
      saveWorkPlan: () => {
        const { activeWorkPlanId, workPlanSheets } = get();
        if (!activeWorkPlanId) return;
        set({
          savedWorkPlans: get().savedWorkPlans.map((w) =>
            w.id === activeWorkPlanId
              ? { ...w, sheets: workPlanSheets.map((sh) => ({ ...sh, activities: sh.activities.map((a) => ({ ...a })) })), updatedAt: new Date().toISOString() }
              : w
          ),
        });
      },
      deleteWorkPlan: (id) => {
        set((s) => ({
          savedWorkPlans: s.savedWorkPlans.filter((w) => w.id !== id),
          ...(s.activeWorkPlanId === id ? { activeWorkPlanId: null, workPlanSheets: [], activeWorkPlanSheetIndex: 0 } : {}),
        }));
      },
      duplicateWorkPlan: (id) => {
        const wp = get().savedWorkPlans.find((w) => w.id === id);
        if (!wp) return;
        const now = new Date().toISOString();
        const dup: SavedWorkPlan = {
          project_id: wp.project_id || get().project?.id || "",
          id: uuid(), name: `${wp.name} (Copy)`, createdAt: now, updatedAt: now,
          sheets: wp.sheets.map((sh) => ({ ...sh, id: uuid(), activities: sh.activities.map((a) => ({ ...a, id: uuid() })) })),
        };
        set({ savedWorkPlans: [...get().savedWorkPlans, dup] });
      },

      // ═══════════════════════════════════════════════════════════════
      // ─── Saved Simple Item Sets ────────────────────────────────────
      // ═══════════════════════════════════════════════════════════════
      savedSimpleItemSets: [],
      activeSimpleItemsId: null,

      createSimpleItemSet: (name) => {
        const now = new Date().toISOString();
        const newSet: SavedSimpleItems = {
          project_id: get().project?.id || "",
          id: uuid(), name, createdAt: now, updatedAt: now,
          items: Array.from({ length: 5 }, () => ({ id: uuid(), sn: "", description: "", unit: "", qty: "", rate: "", amount: "" })),
        };
        set({
          savedSimpleItemSets: [...get().savedSimpleItemSets, newSet],
          activeSimpleItemsId: newSet.id,
          simpleItems: newSet.items.map((i) => ({ ...i })),
        });
      },
      openSimpleItemSet: (id) => {
        const sis = get().savedSimpleItemSets.find((s) => s.id === id);
        if (!sis) return;
        set({ activeSimpleItemsId: id, simpleItems: sis.items.map((i) => ({ ...i })) });
      },
      saveSimpleItemSet: () => {
        const { activeSimpleItemsId, simpleItems } = get();
        if (!activeSimpleItemsId) return;
        set({
          savedSimpleItemSets: get().savedSimpleItemSets.map((s) =>
            s.id === activeSimpleItemsId
              ? { ...s, items: simpleItems.map((i) => ({ ...i })), updatedAt: new Date().toISOString() }
              : s
          ),
        });
      },
      deleteSimpleItemSet: (id) => {
        set((s) => ({
          savedSimpleItemSets: s.savedSimpleItemSets.filter((si) => si.id !== id),
          ...(s.activeSimpleItemsId === id ? { activeSimpleItemsId: null, simpleItems: [] } : {}),
        }));
      },
      duplicateSimpleItemSet: (id) => {
        const sis = get().savedSimpleItemSets.find((s) => s.id === id);
        if (!sis) return;
        const now = new Date().toISOString();
        set({
          savedSimpleItemSets: [...get().savedSimpleItemSets, {
            project_id: sis.project_id || get().project?.id || "",
            id: uuid(), name: `${sis.name} (Copy)`, createdAt: now, updatedAt: now,
            items: sis.items.map((i) => ({ ...i, id: uuid() })),
          }],
        });
      },

      // ═══════════════════════════════════════════════════════════════
      // ─── BOQ Working State ─────────────────────────────────────────
      // ═══════════════════════════════════════════════════════════════
      boqSheets: [],
      activeSheetIndex: 0,
      setActiveSheetIndex: (i) => set({ activeSheetIndex: i }),
      setBoqSheets: (sheets) => set({ boqSheets: sheets }),
      updateSheetRows: (sheetIndex, rows) =>
        set((s) => ({
          boqSheets: s.boqSheets.map((sh, i) => (i === sheetIndex ? { ...sh, rows: recalcRows(rows, s.boqSheets) } : sh)),
        })),
      
      startFormulaLinking: (sheetIdx, rowId, colKey, initialFormula) =>
        set({
          formulaLinking: {
            active: true,
            targetSheetIndex: sheetIdx,
            targetRowId: rowId,
            targetColKey: colKey,
            currentFormula: initialFormula?.startsWith("=") ? initialFormula : "=",
          },
        }),
      
      selectFormulaSource: (sheetIdx, rowId, colKey) => {
        const { formulaLinking, boqSheets } = get();
        if (!formulaLinking) return;
        const sourceSheet = boqSheets[sheetIdx];
        const refToken = `'${sourceSheet.name}'!${rowId}.${colKey}`;
        const currentFormula = formulaLinking.currentFormula || "=";

        let nextFormula = currentFormula;
        const fnMatch = currentFormula.match(/^=(SUM|PRODUCT|SUBTRACT)\((.*)\)$/i);
        if (fnMatch) {
          const fnName = fnMatch[1];
          const existingArgs = fnMatch[2].trim();
          nextFormula = `=${fnName}(${existingArgs ? `${existingArgs},` : ""}${refToken})`;
        } else if (currentFormula.trim() === "=") {
          nextFormula = `=${refToken}`;
        } else if (/[+\-*/(,]\s*$/.test(currentFormula)) {
          nextFormula = `${currentFormula}${refToken}`;
        } else {
          nextFormula = `${currentFormula}+${refToken}`;
        }

        set({ formulaLinking: { ...formulaLinking, currentFormula: nextFormula } });
      },

      cancelFormulaLinking: () => set({ formulaLinking: null }),

      completeFormulaLinking: () => {
        const { formulaLinking, boqSheets } = get();
        if (!formulaLinking || !formulaLinking.targetRowId) {
          set({ formulaLinking: null });
          return;
        }

        const { targetSheetIndex, targetRowId, targetColKey, currentFormula } = formulaLinking;
        const sheet = boqSheets[targetSheetIndex!];
        const updatedRows = sheet.rows.map(r => 
          r.id === targetRowId ? { ...r, [targetColKey!]: currentFormula } : r
        );

        get().updateSheetRows(targetSheetIndex!, updatedRows);
        set({ formulaLinking: null });
      },
      addSheet: () =>
        set((s) => ({
          boqSheets: [
            ...s.boqSheets,
            { id: uuid(), project_id: s.project?.id || "", name: `Sheet ${s.boqSheets.length + 1}`, sort_order: s.boqSheets.length, rows: Array.from({ length: 5 }, () => emptyRow()) },
          ],
          activeSheetIndex: s.boqSheets.length,
        })),
      duplicateSheet: (idx) =>
        set((s) => {
          const src = s.boqSheets[idx];
          if (!src) return s;
          return {
            boqSheets: [
              ...s.boqSheets,
              { ...src, id: uuid(), name: `${src.name} (Copy)`, sort_order: s.boqSheets.length, rows: src.rows.map((r) => ({ ...r, id: uuid() })) },
            ],
            activeSheetIndex: s.boqSheets.length,
          };
        }),
      moveSheet: (fromIndex, toIndex) =>
        set((s) => {
          if (
            fromIndex === toIndex ||
            fromIndex < 0 ||
            toIndex < 0 ||
            fromIndex >= s.boqSheets.length ||
            toIndex >= s.boqSheets.length
          ) {
            return s;
          }
          const sheets = s.boqSheets.map((sheet) => ({ ...sheet }));
          const [moved] = sheets.splice(fromIndex, 1);
          sheets.splice(toIndex, 0, moved);
          return {
            boqSheets: sheets.map((sheet, index) => ({ ...sheet, sort_order: index })),
            activeSheetIndex: toIndex,
          };
        }),
      deleteSheet: (idx) =>
        set((s) => {
          if (s.boqSheets.length <= 1) return s;
          const sheets = s.boqSheets
            .filter((_, i) => i !== idx)
            .map((sheet, index) => ({ ...sheet, sort_order: index }));
          return { boqSheets: sheets, activeSheetIndex: Math.min(s.activeSheetIndex, sheets.length - 1) };
        }),
      renameSheet: (idx, name) =>
        set((s) => ({ boqSheets: s.boqSheets.map((sh, i) => (i === idx ? { ...sh, name } : sh)) })),
      toggleSheetSummary: (idx) =>
        set((s) => ({ boqSheets: s.boqSheets.map((sh, i) => (i === idx ? { ...sh, showSummary: !sh.showSummary } : sh)) })),
      updateSheetSummaryLabel: (idx, label) =>
        set((s) => ({ boqSheets: s.boqSheets.map((sh, i) => (i === idx ? { ...sh, summaryGrandTotalTitle: label } : sh)) })),
      loadBOQFromLibrary: (sheets) =>
        set({
          boqSheets: sheets.map((s, i) => ({ ...s, id: uuid(), sort_order: i, rows: s.rows.map((r) => ({ ...r, id: uuid() })) })),
          activeSheetIndex: 0,
        }),
      pasteBOQRows: (sheetIdx, startRowIdx, startColKey, rawData) => {
        const lines = rawData.split(/\r?\n/).filter((l) => l.trim());
        if (lines.length === 0) return;
        const boqCols = ["itemNo", "description", "unit", "qty", "rate", "amount"];
        const startColIdx = boqCols.indexOf(startColKey);
        if (startColIdx === -1) return;
        set((s) => {
          const sheet = s.boqSheets[sheetIdx];
          if (!sheet) return s;
          let rows = [...sheet.rows];
          lines.forEach((line, lineIdx) => {
            const cells = line.split("\t");
            const targetRowIdx = startRowIdx + lineIdx;
            while (rows.length <= targetRowIdx) rows.push(emptyRow());
            const row = { ...rows[targetRowIdx] };
            if (row.type !== "item") return;
            const nonEmpties = cells.filter((c) => c.trim().length > 0);
            const isRowEmpty = !row.itemNo && !row.description && !row.unit && !row.qty && !row.rate && !row.amount;
            if (nonEmpties.length === 1 && isRowEmpty) {
              row.type = "header";
              row.description = nonEmpties[0].trim();
              rows[targetRowIdx] = row;
              return;
            }
            cells.forEach((cellText, cellOffset) => {
              const colIdx = startColIdx + cellOffset;
              if (colIdx < boqCols.length) {
                const key = boqCols[colIdx];
                if (key !== "amount") (row as any)[key] = cellText.trim();
              }
            });
            rows[targetRowIdx] = row;
          });
          return { boqSheets: s.boqSheets.map((sh, idx) => (idx === sheetIdx ? { ...sh, rows: recalcRows(rows) } : sh)) };
        });
      },
      clearBOQRange: (sheetIdx, r1, r2, c1, c2) => {
        const boqCols = ["itemNo", "description", "unit", "qty", "rate", "amount"];
        const colIdx1 = boqCols.indexOf(c1);
        const colIdx2 = boqCols.indexOf(c2);
        const minR = Math.min(r1, r2), maxR = Math.max(r1, r2);
        const minC = Math.min(colIdx1, colIdx2), maxC = Math.max(colIdx1, colIdx2);
        set((s) => {
          const sheet = s.boqSheets[sheetIdx];
          if (!sheet) return s;
          const newRows = sheet.rows.map((row, ri) => {
            if (ri < minR || ri > maxR || row.type !== "item") return row;
            const upd = { ...row };
            boqCols.forEach((key, ci) => { if (ci >= minC && ci <= maxC && key !== "amount") (upd as any)[key] = ""; });
            return upd;
          });
          return { boqSheets: s.boqSheets.map((sh, idx) => (idx === sheetIdx ? { ...sh, rows: recalcRows(newRows) } : sh)) };
        });
      },

      // ═══════════════════════════════════════════════════════════════
      // ─── Payment ───────────────────────────────────────────────────
      // ═══════════════════════════════════════════════════════════════
      certificates: [],
      setCertificates: (c) => set({ certificates: c }),

      addCertificate: (type, boqId, prevCertId) =>
        set((s) => {
          const selectedBOQ = s.savedBOQs.find((b) => b.id === boqId);
          if (!selectedBOQ) return s;
          const certSheets: PaymentCertSheet[] = [];
          const prevCert = prevCertId ? s.certificates.find((c) => c.id === prevCertId) : null;

          selectedBOQ.sheets.forEach((boqSheet) => {
            const items: PaymentItem[] = boqSheet.rows
              .filter((r) => r.type === "item" && r.description)
              .map((r) => {
                const q = parseFloat((r.qty || "0").toString().replace(/,/g, "")) || 0;
                const rate = parseFloat((r.rate || "0").toString().replace(/,/g, "")) || 0;
                const resolvedAmount = r.amount ? resolveCellValue(r.amount, selectedBOQ.sheets) : 0;
                const boqAmountValue = resolvedAmount || calculateBOQLineAmount(q, rate, r.unit);

                // Carry forward from selected previous certificate
                const prevSheet = prevCert?.sheets.find((ps) => ps.name === boqSheet.name);
                const prevItem = prevSheet?.items.find((pi) => pi.description === r.description && pi.billNo === (r.itemNo || ""));
                
                const prevAmount = parseFloat(prevItem?.totalAmount || "0") || 0;
                const prevQty = parseFloat(prevItem?.totalQty || "0") || 0;

                return {
                  id: uuid(),
                  billNo: r.itemNo || "",
                  description: r.description,
                  unit: r.unit || "",
                  boqQty: q.toFixed(2),
                  boqRate: rate.toFixed(2),
                  boqAmount: boqAmountValue.toFixed(2),
                  previousAmount: prevAmount.toFixed(2),
                  currentAmount: "0.00",
                  totalQty: prevQty.toFixed(2),
                  totalAmount: prevAmount.toFixed(2),
                };
              });

            if (items.length > 0) {
              certSheets.push({ id: uuid(), name: boqSheet.name, items });
            }
          });

          const cert: PaymentCertificate = {
            id: uuid(),
            project_id: s.project?.id || "",
            boqId: selectedBOQ.id,
            boqName: selectedBOQ.name,
            number: s.certificates.length + 1,
            type,
            date: new Date().toISOString().split("T")[0],
            status: "draft",
            sheets: certSheets,
            contingenciesPercent: 15,
            governmentTaxPercent: 8,
            retentionPercent: 10,
            advancePaymentPercent: 30,
            withholdingTaxPercent: 5,
            contractorName: "",
            contractorCompany: "",
            contractorTitle: "Site Agent",
            engineerName: "",
            engineerOrg: "",
            engineerTitle: "Resident Engineer",
            employerName: "",
            employerOrg: "",
            employerTitle: "Project Coordinator",
          };
          return { certificates: [...s.certificates, cert] };
        }),

      updateCertItem: (certId, sheetId, itemId, key, value) =>
        set((s) => ({
          certificates: s.certificates.map((c) => {
            if (c.id !== certId) return c;
            return {
              ...c,
              sheets: c.sheets.map((sh) => {
                if (sh.id !== sheetId) return sh;
                return {
                  ...sh,
                  items: sh.items.map((item) => {
                    if (item.id !== itemId) return item;
                    const upd = { ...item, [key]: value };
                    const rate = parseFloat(upd.boqRate) || 0;
                    const prevAmount = parseFloat(upd.previousAmount) || 0;

                    if (key === "totalQty") {
                      const tQty = parseFloat(upd.totalQty) || 0;
                      upd.totalAmount = calculateBOQLineAmount(tQty, rate, upd.unit).toFixed(2);
                      upd.currentAmount = (parseFloat(upd.totalAmount) - prevAmount).toFixed(2);
                    } else if (key === "totalAmount") {
                      // Fallback for manual total amount entry if needed (though usually driven by qty now)
                      const tAmt = parseFloat(upd.totalAmount) || 0;
                      upd.currentAmount = (tAmt - prevAmount).toFixed(2);
                      if (rate > 0) upd.totalQty = (isPercentageUnit(upd.unit) ? (tAmt * 100) / rate : tAmt / rate).toFixed(2);
                    }
                    return upd;
                  }),
                };
              }),
            };
          }),
        })),
      updateCertSettings: (certId, settings) =>
        set((s) => ({
          certificates: s.certificates.map((c) => (c.id === certId ? { ...c, ...settings } : c)),
        })),
      deleteCertificate: (certId) =>
        set((s) => ({ certificates: s.certificates.filter((c) => c.id !== certId) })),

      // ═══════════════════════════════════════════════════════════════
      // ─── Progress ──────────────────────────────────────────────────
      // ═══════════════════════════════════════════════════════════════
      progressReports: [],
      createProgressReport: (name, sourceType, sourceId, prevReportId, inputMode = "quantity") =>
        set((s) => {
          const now = new Date().toISOString();
          const today = now.split("T")[0];
          const prevReport = prevReportId ? s.progressReports.find((r) => r.id === prevReportId) : null;
          const reportCount = s.progressReports.filter((r) => r.project_id === s.project?.id).length;
          const resolvedInputMode = inputMode || "quantity";

          const createProgressItem = (
            billNo: string,
            description: string,
            unit: string,
            boqQty: number,
            boqRate: number,
            boqAmount: number,
            prevItem?: ProgressItem
          ): ProgressItem => {
            const previousQty = parseNumber(prevItem?.totalQty);
            const plannedPercent = parseNumber(prevItem?.plannedPercent);
            return {
              id: uuid(),
              billNo,
              description,
              unit,
              boqQty: boqQty.toFixed(2),
              boqRate: boqRate.toFixed(2),
              boqAmount: boqAmount.toFixed(2),
              previousQty: previousQty.toFixed(2),
              currentQty: "0.00",
              totalQty: previousQty.toFixed(2),
              earnedAmount: calculateBOQLineAmount(previousQty, boqRate, unit).toFixed(2),
              weightPercent: "0.00",
              plannedPercent: plannedPercent.toFixed(2),
              actualPercent: boqQty > 0 ? ((previousQty / boqQty) * 100).toFixed(2) : "0.00",
              variancePercent: boqQty > 0 ? (((previousQty / boqQty) * 100) - plannedPercent).toFixed(2) : (0 - plannedPercent).toFixed(2),
              status: prevItem?.status || "not-started",
              remarks: "",
            };
          };

          let sheets: ProgressSheet[] = [];
          let sourceName = "";

          if (sourceType === "boq") {
            const selectedBOQ = s.savedBOQs.find((b) => b.id === sourceId);
            if (!selectedBOQ) return s;
            sourceName = selectedBOQ.name;
            sheets = selectedBOQ.sheets
              .map((boqSheet) => {
                const prevSheet = prevReport?.sheets.find((sheet) => sheet.name === boqSheet.name);
                const items = boqSheet.rows
                  .filter((row) => row.type === "item" && row.description)
                  .map((row) => {
                    const boqQty = parseNumber(row.qty);
                    const boqRate = parseNumber(row.rate);
                    const resolvedAmount = row.amount ? resolveCellValue(row.amount, selectedBOQ.sheets) : 0;
                    const boqAmount = resolvedAmount || calculateBOQLineAmount(boqQty, boqRate, row.unit);
                    const prevItem = prevSheet?.items.find(
                      (item) => item.billNo === (row.itemNo || "") && item.description === row.description
                    );
                    return createProgressItem(
                      row.itemNo || "",
                      row.description,
                      row.unit || "",
                      boqQty,
                      boqRate,
                      boqAmount,
                      prevItem
                    );
                  });
                return items.length ? { id: uuid(), name: boqSheet.name, items } : null;
              })
              .filter((sheet): sheet is ProgressSheet => Boolean(sheet));
          } else {
            const selectedSet = s.savedSimpleItemSets.find((itemSet) => itemSet.id === sourceId);
            if (!selectedSet) return s;
            sourceName = selectedSet.name;
            const prevSheet = prevReport?.sheets[0];
            const items = selectedSet.items
              .filter((item) => item.description)
              .map((item) => {
                const boqQty = parseNumber(item.qty);
                const boqRate = parseNumber(item.rate);
                const boqAmount = parseNumber(item.amount) || calculateBOQLineAmount(boqQty, boqRate, item.unit);
                const prevItem = prevSheet?.items.find(
                  (progressItem) => progressItem.billNo === (item.sn || "") && progressItem.description === item.description
                );
                return createProgressItem(
                  item.sn || "",
                  item.description,
                  item.unit || "",
                  boqQty,
                  boqRate,
                  boqAmount,
                  prevItem
                );
              });
            sheets = items.length ? [{ id: uuid(), name: selectedSet.name, items }] : [];
          }

          if (sheets.length === 0) return s;

          const report: ProgressReport = {
            id: uuid(),
            project_id: s.project?.id || "",
            number: reportCount + 1,
            name,
            date: today,
            status: "draft",
            sourceType,
            inputMode: resolvedInputMode,
            weightMode: sourceType === "boq" ? "boq-amount" : "equal",
            sourceId,
            sourceName,
            createdAt: now,
            updatedAt: now,
            sheets: recalcProgressSheets(sheets, resolvedInputMode, sourceType === "boq" ? "boq-amount" : "equal"),
          };

          return { progressReports: [...s.progressReports, report] };
        }),
      updateProgressReport: (reportId, updates) =>
        set((s) => ({
          progressReports: s.progressReports.map((report) => {
            if (report.id !== reportId) return report;
            const nextReport = { ...report, ...updates };
            return {
              ...nextReport,
              sheets: recalcProgressSheets(
                nextReport.sheets,
                nextReport.inputMode || "quantity",
                nextReport.weightMode
              ),
              updatedAt: new Date().toISOString(),
            };
          }),
        })),
      updateProgressItem: (reportId, sheetId, itemId, key, value) =>
        set((s) => ({
          progressReports: s.progressReports.map((report) => {
            if (report.id !== reportId) return report;
            const nextSheets = report.sheets.map((sheet) => {
              if (sheet.id !== sheetId) return sheet;
              return {
                ...sheet,
                items: sheet.items.map((item) => {
                  if (item.id !== itemId) return item;
                  const updated = { ...item, [key]: value };
                  const previousQty = parseNumber(updated.previousQty);
                  if (key === "currentQty" || key === "previousQty") {
                    const currentQty = parseNumber(updated.currentQty);
                    updated.totalQty = (previousQty + currentQty).toFixed(2);
                  } else if (key === "totalQty") {
                    const totalQty = parseNumber(updated.totalQty);
                    updated.currentQty = (totalQty - previousQty).toFixed(2);
                  }
                  return updated;
                }),
              };
            });
            return {
              ...report,
              sheets: recalcProgressSheets(nextSheets, report.inputMode || "quantity", report.weightMode),
              updatedAt: new Date().toISOString(),
            };
          }),
        })),
      duplicateProgressReport: (reportId) =>
        set((s) => {
          const report = s.progressReports.find((item) => item.id === reportId);
          if (!report) return s;
          const now = new Date().toISOString();
          const reportCount = s.progressReports.filter((item) => item.project_id === report.project_id).length;
          const duplicate: ProgressReport = {
            ...report,
            id: uuid(),
            number: reportCount + 1,
            name: `${report.name} (Copy)`,
            createdAt: now,
            updatedAt: now,
            sheets: report.sheets.map((sheet) => ({
              ...sheet,
              id: uuid(),
              items: sheet.items.map((item) => ({ ...item, id: uuid() })),
            })),
          };
          return { progressReports: [...s.progressReports, duplicate] };
        }),
      deleteProgressReport: (reportId) =>
        set((s) => ({ progressReports: s.progressReports.filter((report) => report.id !== reportId) })),

      // ═══════════════════════════════════════════════════════════════
      // ─── Documents ─────────────────────────────────────────────────
      // ═══════════════════════════════════════════════════════════════
      generatedDocuments: [],
      userSignatureProfile: null,
      setUserSignatureProfile: (profile) =>
        set(() => ({
          userSignatureProfile: {
            ...profile,
            updatedAt: profile.updatedAt || new Date().toISOString(),
          },
        })),
      clearUserSignatureProfile: () => set(() => ({ userSignatureProfile: null })),
      addGeneratedDocument: (doc) =>
        set((s) => ({ generatedDocuments: [...s.generatedDocuments, doc] })),
      updateGeneratedDocument: (id, updates) =>
        set((s) => ({
          generatedDocuments: s.generatedDocuments.map((doc) =>
            doc.id === id ? { ...doc, ...updates, updatedAt: new Date().toISOString() } : doc
          ),
        })),
      deleteGeneratedDocument: (id) =>
        set((s) => ({ generatedDocuments: s.generatedDocuments.filter((doc) => doc.id !== id) })),

      // ═══════════════════════════════════════════════════════════════
      // ─── Correspondence / Approvals ───────────────────────────────
      // ═══════════════════════════════════════════════════════════════
      correspondenceRecords: [],
      addCorrespondenceRecord: (record) =>
        set((s) => ({ correspondenceRecords: [...s.correspondenceRecords, record] })),
      updateCorrespondenceRecord: (id, updates) =>
        set((s) => ({
          correspondenceRecords: s.correspondenceRecords.map((record) =>
            record.id === id
              ? { ...record, ...updates, updatedAt: new Date().toISOString() }
              : record
          ),
        })),
      deleteCorrespondenceRecord: (id) =>
        set((s) => ({
          correspondenceRecords: s.correspondenceRecords.filter((record) => record.id !== id),
        })),
      duplicateCorrespondenceRecord: (id) =>
        set((s) => {
          const record = s.correspondenceRecords.find((item) => item.id === id);
          if (!record) return s;
          const now = new Date().toISOString();
          const recordCount = s.correspondenceRecords.filter((item) => item.project_id === record.project_id).length;
          const duplicate: CorrespondenceRecord = {
            ...record,
            id: uuid(),
            number: recordCount + 1,
            referenceNo: `${record.referenceNo}-COPY`,
            subject: `${record.subject} (Copy)`,
            approvalSteps: record.approvalSteps.map((step) => ({
              ...step,
              id: uuid(),
              status: "pending",
              date: "",
              comments: "",
            })),
            createdAt: now,
            updatedAt: now,
          };
          return { correspondenceRecords: [...s.correspondenceRecords, duplicate] };
        }),
      updateApprovalStep: (recordId, stepId, updates) =>
        set((s) => ({
          correspondenceRecords: s.correspondenceRecords.map((record) => {
            if (record.id !== recordId) return record;
            const approvalSteps = record.approvalSteps.map((step) =>
              step.id === stepId ? { ...step, ...updates } : step
            );
            const hasRejected = approvalSteps.some((step) => step.status === "rejected");
            const allApproved = approvalSteps.length > 0 && approvalSteps.every((step) => step.status === "approved");
            const nextStatus = hasRejected
              ? "open"
              : allApproved
              ? "approved"
              : approvalSteps.some((step) => step.status !== "pending")
              ? "pending-approval"
              : record.status;

            return {
              ...record,
              approvalSteps,
              status: nextStatus,
              updatedAt: new Date().toISOString(),
            };
          }),
        })),

      // ═══════════════════════════════════════════════════════════════
      // ─── Compliance Checklist ─────────────────────────────────────
      // ═══════════════════════════════════════════════════════════════
      checklistItems: [],
      addChecklistItem: (item) =>
        set((s) => {
          const projectId = item?.project_id || s.project?.id || "";
          if (!projectId) return s;
          return { checklistItems: [...s.checklistItems, makeChecklistItem(projectId, item)] };
        }),
      addChecklistItems: (items) =>
        set((s) => {
          const projectId = s.project?.id || "";
          if (!projectId || items.length === 0) return s;
          return {
            checklistItems: [
              ...s.checklistItems,
              ...items.map((item) => makeChecklistItem(projectId, item)),
            ],
          };
        }),
      updateChecklistItem: (id, updates) =>
        set((s) => ({
          checklistItems: s.checklistItems.map((item) =>
            item.id === id
              ? { ...item, ...updates, updatedAt: new Date().toISOString() }
              : item
          ),
        })),
      deleteChecklistItem: (id) =>
        set((s) => ({ checklistItems: s.checklistItems.filter((item) => item.id !== id) })),
      duplicateChecklistItem: (id) =>
        set((s) => {
          const item = s.checklistItems.find((entry) => entry.id === id);
          if (!item) return s;
          const duplicate = makeChecklistItem(item.project_id, {
            ...item,
            id: uuid(),
            title: `${item.title || "Checklist item"} (Copy)`,
            status: "pending",
            submittedDate: "",
            verifiedBy: "",
            verifiedDate: "",
          });
          return { checklistItems: [...s.checklistItems, duplicate] };
        }),
      setChecklistStatus: (id, status) =>
        set((s) => ({
          checklistItems: s.checklistItems.map((item) => {
            if (item.id !== id) return item;
            const now = new Date().toISOString();
            const today = now.split("T")[0];
            return {
              ...item,
              status,
              submittedDate:
                status === "submitted" || status === "verified"
                  ? item.submittedDate || today
                  : status === "pending"
                  ? ""
                  : item.submittedDate,
              verifiedDate: status === "verified" ? item.verifiedDate || today : "",
              verifiedBy: status === "verified" ? item.verifiedBy : "",
              updatedAt: now,
            };
          }),
        })),

      // ═══════════════════════════════════════════════════════════════
      // ─── Site Notes / Field Records ───────────────────────────────
      // ═══════════════════════════════════════════════════════════════
      siteNotes: [],
      addSiteNote: (note) =>
        set((s) => {
          const projectId = note?.project_id || s.project?.id || "";
          if (!projectId) return s;
          return { siteNotes: [makeSiteNote(projectId, note), ...s.siteNotes] };
        }),
      updateSiteNote: (id, updates) =>
        set((s) => ({
          siteNotes: s.siteNotes.map((note) =>
            note.id === id
              ? { ...note, ...updates, updatedAt: new Date().toISOString() }
              : note
          ),
        })),
      deleteSiteNote: (id) =>
        set((s) => ({ siteNotes: s.siteNotes.filter((note) => note.id !== id) })),
      duplicateSiteNote: (id) =>
        set((s) => {
          const note = s.siteNotes.find((item) => item.id === id);
          if (!note) return s;
          const duplicate = makeSiteNote(note.project_id, {
            ...note,
            id: uuid(),
            title: `${note.title || "Site note"} (Copy)`,
            photos: note.photos.map((photo) => ({ ...photo, id: uuid() })),
          });
          return { siteNotes: [duplicate, ...s.siteNotes] };
        }),
      addSiteNotePhoto: (noteId, photo) =>
        set((s) => ({
          siteNotes: s.siteNotes.map((note) => {
            if (note.id !== noteId) return note;
            const nextPhoto: SiteNotePhoto = {
              id: photo.id || uuid(),
              dataUrl: photo.dataUrl || "",
              caption: photo.caption || "",
              takenAt: photo.takenAt || note.noteDate || new Date().toISOString().split("T")[0],
              sortOrder:
                typeof photo.sortOrder === "number" ? photo.sortOrder : note.photos.length,
            };
            return {
              ...note,
              photos: [...note.photos, nextPhoto],
              updatedAt: new Date().toISOString(),
            };
          }),
        })),
      updateSiteNotePhoto: (noteId, photoId, updates) =>
        set((s) => ({
          siteNotes: s.siteNotes.map((note) =>
            note.id === noteId
              ? {
                  ...note,
                  photos: note.photos.map((photo) =>
                    photo.id === photoId ? { ...photo, ...updates } : photo
                  ),
                  updatedAt: new Date().toISOString(),
                }
              : note
          ),
        })),
      deleteSiteNotePhoto: (noteId, photoId) =>
        set((s) => ({
          siteNotes: s.siteNotes.map((note) =>
            note.id === noteId
              ? {
                  ...note,
                  photos: note.photos
                    .filter((photo) => photo.id !== photoId)
                    .map((photo, index) => ({ ...photo, sortOrder: index })),
                  updatedAt: new Date().toISOString(),
                }
              : note
          ),
        })),
      createSiteVisitReportFromNote: (noteId, options) =>
        set((s) => {
          const note = s.siteNotes.find((item) => item.id === noteId);
          const project = s.project;
          if (!note || !project) return s;
          const selectedOptions = withSiteVisitReportDefaults(options);
          const now = new Date().toISOString();
          const reportCount = s.generatedDocuments.filter(
            (doc) => doc.project_id === project.id && doc.templateType === "site-visit-report"
          ).length;
          const safeCode = project.code || project.contractNumber || "SITE";
          const latestProgressReport = s.progressReports
            .filter((report) => report.project_id === project.id)
            .sort((a, b) => b.date.localeCompare(a.date))[0] || null;
          const projectChecklistItems = s.checklistItems.filter((item) => item.project_id === project.id);
          const programName = s.programs.find((program) => program.id === project.programId)?.name;
          const categoryName =
            s.categories.find((category) => category.id === project.categoryId)?.name ||
            project.categoryName;
          const contentOptions = selectedOptions.observation
            ? { ...selectedOptions, observation: false }
            : selectedOptions;
          const observationHtml = selectedOptions.observation
            ? sanitizeRichTextHtml(
                note.observationText ||
                  "Record the site observation, instruction, issue, or progress note here.",
              )
            : "";
          const report: GeneratedDocument = {
            id: uuid(),
            project_id: project.id,
            title: `Site Visit Report - ${note.title || note.noteDate}`,
            templateType: "site-visit-report",
            referenceNo: `${safeCode}/SVR/${String(reportCount + 1).padStart(3, "0")}`,
            date: note.noteDate || now.split("T")[0],
            status: "draft",
            layoutStyle: "report",
            brandingMode: "project",
            coverTitle: "Site Visit Report",
            coverSubtitle: `${project.name}${note.locationNote ? ` • ${note.locationNote}` : ""}`,
            recipientName: project.clientName || "Project Team",
            recipientRole: "Project Stakeholders",
            signatoryName: note.authorName || project.consultantName || "Field Team",
            signatoryRole: "Prepared By",
            footerNote: "Prepared from field site notes and photo records stored in Planovera.",
            content: buildSiteVisitReportContent(project, note, contentOptions, {
              programName,
              categoryName,
              latestProgressReport,
              checklistItems: projectChecklistItems,
            }),
            linkedSiteNoteId: note.id,
            siteVisitObservationHtml: observationHtml || undefined,
            siteVisitPhotos: selectedOptions.photos
              ? note.photos
                  .slice()
                  .sort((a, b) => a.sortOrder - b.sortOrder)
                  .map((photo) => ({ ...photo }))
              : [],
            createdAt: now,
            updatedAt: now,
          };
          return { generatedDocuments: [report, ...s.generatedDocuments] };
        }),

      // ═══════════════════════════════════════════════════════════════
      // ─── Meeting Minutes / Action Points ──────────────────────────
      // ═══════════════════════════════════════════════════════════════
      attendeeGroups: [],
      saveAttendeeGroup: (group) =>
        set((s) => {
          const exists = s.attendeeGroups.some((item) => item.id === group.id);
          return {
            attendeeGroups: exists
              ? s.attendeeGroups.map((item) =>
                  item.id === group.id
                    ? { ...group, updatedAt: new Date().toISOString() }
                    : item
                )
              : [...s.attendeeGroups, group],
          };
        }),
      deleteAttendeeGroup: (id) =>
        set((s) => ({ attendeeGroups: s.attendeeGroups.filter((group) => group.id !== id) })),
      meetingMinutes: [],
      saveMeetingMinute: (minute) =>
        set((s) => {
          const exists = s.meetingMinutes.some((item) => item.id === minute.id);
          return {
            meetingMinutes: exists
              ? s.meetingMinutes.map((item) =>
                  item.id === minute.id
                    ? { ...minute, updatedAt: new Date().toISOString() }
                    : item
                )
              : [...s.meetingMinutes, minute],
          };
        }),
      deleteMeetingMinute: (id) =>
        set((s) => ({ meetingMinutes: s.meetingMinutes.filter((minute) => minute.id !== id) })),
      duplicateMeetingMinute: (id) =>
        set((s) => {
          const minute = s.meetingMinutes.find((item) => item.id === id);
          if (!minute) return s;
          const now = new Date().toISOString();
          const duplicate: MeetingMinute = {
            ...minute,
            id: uuid(),
            title: `${minute.title} (Copy)`,
            referenceNo: `${minute.referenceNo}-COPY`,
            status: "draft",
            attendees: minute.attendees.map((attendee) => ({ ...attendee, id: uuid() })),
            agendas: minute.agendas.map((agenda) => ({ ...agenda, id: uuid() })),
            actionGroups: minute.actionGroups.map((group) => ({
              ...group,
              id: uuid(),
              actionItems: group.actionItems.map((actionItem) => ({
                ...actionItem,
                id: uuid(),
                actionKey: uuid(),
                carriedForwardFromMinuteId: undefined,
                status: actionItem.status === "closed" ? "open" : actionItem.status,
              })),
            })),
            createdAt: now,
            updatedAt: now,
          };
          return { meetingMinutes: [...s.meetingMinutes, duplicate] };
        }),

      // ═══════════════════════════════════════════════════════════════
      // ─── Work Plan Working State (multi-sheet) ─────────────────────
      // ═══════════════════════════════════════════════════════════════
      workPlanSheets: [],
      activeWorkPlanSheetIndex: 0,
      setActiveWorkPlanSheetIndex: (i) => set({ activeWorkPlanSheetIndex: i }),

      addWorkPlanSheet: () =>
        set((s) => ({
          workPlanSheets: [
            ...s.workPlanSheets,
            { id: uuid(), name: `Sheet ${s.workPlanSheets.length + 1}`, sort_order: s.workPlanSheets.length, activities: [] },
          ],
          activeWorkPlanSheetIndex: s.workPlanSheets.length,
        })),

      duplicateWorkPlanSheet: (idx) =>
        set((s) => {
          const src = s.workPlanSheets[idx];
          return {
            workPlanSheets: [
              ...s.workPlanSheets,
              { ...src, id: uuid(), name: `${src.name} (Copy)`, sort_order: s.workPlanSheets.length, activities: src.activities.map((a) => ({ ...a, id: uuid() })) },
            ],
            activeWorkPlanSheetIndex: s.workPlanSheets.length,
          };
        }),

      deleteWorkPlanSheet: (idx) =>
        set((s) => {
          if (s.workPlanSheets.length <= 1) return s;
          const sheets = s.workPlanSheets.filter((_, i) => i !== idx);
          return { workPlanSheets: sheets, activeWorkPlanSheetIndex: Math.min(s.activeWorkPlanSheetIndex, sheets.length - 1) };
        }),

      renameWorkPlanSheet: (idx, name) =>
        set((s) => ({ workPlanSheets: s.workPlanSheets.map((sh, i) => (i === idx ? { ...sh, name } : sh)) })),

      addActivity: () =>
        set((s) => ({
          workPlanSheets: mapActiveWPSheet(s.workPlanSheets, s.activeWorkPlanSheetIndex, (acts) =>
            recalcWorkPlanSections([
              ...acts,
              { id: uuid(), project_id: s.project?.id || "", rowType: "activity", description: "", duration: "", startDate: "", endDate: "", status: "pending" as const },
            ])
          ),
        })),

      updateActivity: (id, key, value) =>
        set((s) => ({
          workPlanSheets: mapActiveWPSheet(s.workPlanSheets, s.activeWorkPlanSheetIndex, (acts) => {
            const mapped = acts.map((a) => {
              if (a.id !== id) return a;
              if (a.rowType === "section" && (key === "duration" || key === "startDate" || key === "endDate")) {
                return a;
              }
              if (key === "rowType") {
                const nextType = (value === "section" ? "section" : "activity") as NonNullable<WorkPlanActivity["rowType"]>;
                const base: WorkPlanActivity = { ...a, rowType: nextType };
                if (nextType === "section") {
                  return { ...base, duration: "", startDate: "", endDate: "" };
                }
                return base;
              }
              const upd = { ...a, [key]: value };
              if ((key === "startDate" || key === "duration") && upd.startDate && upd.duration) {
                upd.endDate = addDays(upd.startDate, parseInt(upd.duration));
              }
              return upd;
            });
            return recalcWorkPlanSections(mapped);
          }),
        })),

      deleteActivity: (id) =>
        set((s) => ({
          workPlanSheets: mapActiveWPSheet(s.workPlanSheets, s.activeWorkPlanSheetIndex, (acts) =>
            recalcWorkPlanSections(acts.filter((a) => a.id !== id))
          ),
        })),

      deleteActivities: (ids) =>
        set((s) => ({
          workPlanSheets: mapActiveWPSheet(s.workPlanSheets, s.activeWorkPlanSheetIndex, (acts) =>
            recalcWorkPlanSections(acts.filter((a) => !ids.includes(a.id)))
          ),
        })),

      insertActivityAt: (anchorId, position) =>
        set((s) => ({
          workPlanSheets: mapActiveWPSheet(s.workPlanSheets, s.activeWorkPlanSheetIndex, (acts) => {
            const idx = acts.findIndex((a) => a.id === anchorId);
            if (idx === -1) return acts;
            const newAct: WorkPlanActivity = { id: uuid(), project_id: s.project?.id || "", rowType: "activity", description: "", duration: "", startDate: "", endDate: "", status: "pending" };
            const newActs = [...acts];
            newActs.splice(position === "above" ? idx : idx + 1, 0, newAct);
            return recalcWorkPlanSections(newActs);
          }),
        })),

      moveActivity: (id, dir) =>
        set((s) => ({
          workPlanSheets: mapActiveWPSheet(s.workPlanSheets, s.activeWorkPlanSheetIndex, (acts) => {
            const idx = acts.findIndex((a) => a.id === id);
            if (idx === -1) return acts;
            if (dir === "up" && idx <= 0) return acts;
            if (dir === "down" && idx >= acts.length - 1) return acts;
            const swapIdx = dir === "up" ? idx - 1 : idx + 1;
            const newActs = [...acts];
            [newActs[idx], newActs[swapIdx]] = [newActs[swapIdx], newActs[idx]];
            return recalcWorkPlanSections(newActs);
          }),
        })),

      pasteActivityAt: (anchorId, position, clipboard) =>
        set((s) => ({
          workPlanSheets: mapActiveWPSheet(s.workPlanSheets, s.activeWorkPlanSheetIndex, (acts) => {
            if (!clipboard.length) return acts;
            const idx = acts.findIndex((a) => a.id === anchorId);
            if (idx === -1) return acts;
            const newActs = [...acts];
            newActs.splice(
              position === "above" ? idx : idx + 1,
              0,
              ...clipboard.map((a) => ({
                ...a,
                id: uuid(),
                rowType: a.rowType || "activity",
              }))
            );
            return recalcWorkPlanSections(newActs);
          }),
        })),

      fetchActivitiesFromBOQ: (boqId) =>
        set((s) => {
          // Create one work plan sheet per BOQ sheet
          const newSheets: WorkPlanSheet[] = [];
          const selectedBOQ = s.savedBOQs.find((b) => b.id === boqId);
          if (!selectedBOQ) return s;
          selectedBOQ.sheets.forEach((boqSheet) => {
            const activities: WorkPlanActivity[] = [];
            boqSheet.rows.forEach((r) => {
              if (r.type === "header" && r.description) {
                activities.push({
                  id: uuid(),
                  project_id: s.project?.id || "",
                  rowType: "section",
                  description: r.description,
                  duration: "",
                  startDate: "",
                  endDate: "",
                  status: "pending" as const,
                });
                return;
              }
              if (r.type === "item" && r.description) {
                activities.push({
                  id: uuid(),
                  project_id: s.project?.id || "",
                  rowType: "activity",
                  description: r.description,
                  duration: "",
                  startDate: "",
                  endDate: "",
                  status: "pending" as const,
                });
              }
            });
            if (activities.length > 0) {
              newSheets.push({
                id: uuid(),
                name: boqSheet.name,
                sort_order: s.workPlanSheets.length + newSheets.length,
                activities: recalcWorkPlanSections(activities),
              });
            }
          });
          return { workPlanSheets: [...s.workPlanSheets, ...newSheets] };
        }),

      pasteWorkPlanRows: (startRowIdx, startColKey, rawData) => {
        const lines = rawData.split(/\r?\n/).filter((l) => l.trim());
        if (lines.length === 0) return;
        const wpCols = ["description", "duration", "startDate", "status"];
        const startColIdx = wpCols.indexOf(startColKey);
        if (startColIdx === -1) return;
        set((s) => ({
          workPlanSheets: mapActiveWPSheet(s.workPlanSheets, s.activeWorkPlanSheetIndex, (acts) => {
            const activities = [...acts];
            lines.forEach((line, lineIdx) => {
              const cells = line.split("\t");
              const targetRowIdx = startRowIdx + lineIdx;
              while (activities.length <= targetRowIdx) {
                activities.push({ id: uuid(), project_id: s.project?.id || "", rowType: "activity", description: "", duration: "", startDate: "", endDate: "", status: "pending" });
              }
              const act = { ...activities[targetRowIdx], rowType: activities[targetRowIdx].rowType || "activity" };
              const isSection = act.rowType === "section";
              cells.forEach((cellText, cellOffset) => {
                const colIdx = startColIdx + cellOffset;
                if (colIdx < 0 || colIdx >= wpCols.length) return;
                const colKey = wpCols[colIdx];
                if (isSection && (colKey === "duration" || colKey === "startDate" || colKey === "status")) return;
                (act as any)[colKey] = cellText.trim();
              });
              if (!isSection) {
                if (act.startDate && act.duration) act.endDate = addDays(act.startDate, parseInt(act.duration));
              }
              activities[targetRowIdx] = act;
            });
            return recalcWorkPlanSections(activities);
          }),
        }));
      },

      clearWorkPlanRange: (r1, r2, c1, c2) => {
        const wpCols = ["description", "duration", "startDate", "status"];
        const colIdx1 = wpCols.indexOf(c1), colIdx2 = wpCols.indexOf(c2);
        const minR = Math.min(r1, r2), maxR = Math.max(r1, r2);
        const minC = Math.min(colIdx1, colIdx2), maxC = Math.max(colIdx1, colIdx2);
        set((s) => ({
          workPlanSheets: mapActiveWPSheet(s.workPlanSheets, s.activeWorkPlanSheetIndex, (acts) =>
            recalcWorkPlanSections(
              acts.map((act, ri) => {
                if (ri < minR || ri > maxR) return act;
                const upd = { ...act, rowType: act.rowType || "activity" };
                if (upd.rowType === "section") {
                  wpCols.forEach((key, ci) => {
                    if (ci < minC || ci > maxC) return;
                    if (key === "duration" || key === "startDate" || key === "status") return;
                    (upd as any)[key] = "";
                  });
                  return upd;
                }
                wpCols.forEach((key, ci) => {
                  if (ci >= minC && ci <= maxC) (upd as any)[key] = key === "status" ? "pending" : "";
                });
                if (upd.startDate && upd.duration) upd.endDate = addDays(upd.startDate, parseInt(upd.duration));
                else upd.endDate = "";
                return upd;
              })
            )
          ),
        }));
      },

      // ═══════════════════════════════════════════════════════════════
      // ─── Simple Items Working State ────────────────────────────────
      // ═══════════════════════════════════════════════════════════════
      simpleItems: [],
      setSimpleItems: (items) => set({ simpleItems: items }),
      updateSimpleItem: (id, key, value) => set((s) => ({
        simpleItems: s.simpleItems.map((item) => {
          if (item.id !== id) return item;
          const upd = { ...item, [key]: value };
          const q = parseFloat(upd.qty) || 0;
          const r = parseFloat(upd.rate) || 0;
          const amount = calculateBOQLineAmount(q, r, upd.unit);
          upd.amount = amount ? amount.toFixed(2) : "";
          return upd;
        }),
      })),
      addSimpleItem: () => set((s) => ({
        simpleItems: [...s.simpleItems, { id: uuid(), sn: "", description: "", unit: "", qty: "", rate: "", amount: "" }]
      })),
      deleteSimpleItem: (id) => set((s) => ({ simpleItems: s.simpleItems.filter((i) => i.id !== id) })),
      insertSimpleItemAt: (anchorId, position) => set((s) => {
        const idx = s.simpleItems.findIndex((r) => r.id === anchorId);
        const newItems = [...s.simpleItems];
        newItems.splice(position === "above" ? idx : idx + 1, 0, { id: uuid(), sn: "", description: "", unit: "", qty: "", rate: "", amount: "" });
        return { simpleItems: newItems };
      }),
      moveSimpleItem: (id, dir) => set((s) => {
        const idx = s.simpleItems.findIndex((r) => r.id === id);
        if (idx === -1) return s;
        if (dir === "up" && idx <= 0) return s;
        if (dir === "down" && idx >= s.simpleItems.length - 1) return s;
        const newItems = [...s.simpleItems];
        const swapIdx = dir === "up" ? idx - 1 : idx + 1;
        [newItems[idx], newItems[swapIdx]] = [newItems[swapIdx], newItems[idx]];
        return { simpleItems: newItems };
      }),
      pasteSimpleItemAt: (anchorId, position, clipboard) => set((s) => {
        if (!clipboard.length) return s;
        const idx = s.simpleItems.findIndex((r) => r.id === anchorId);
        if (idx === -1) return s;
        const newItems = [...s.simpleItems];
        newItems.splice(position === "above" ? idx : idx + 1, 0, ...clipboard.map((r) => ({ ...r, id: uuid() })));
        return { simpleItems: newItems };
      }),

      // ═══════════════════════════════════════════════════════════════
      // ─── BOQ Library ───────────────────────────────────────────────
      // ═══════════════════════════════════════════════════════════════
      boqLibrary: [
        {
          id: uuid(), name: "Standard Road Works BOQ",
          description: "Typical road construction BOQ with earthworks, base, sub-base, and asphalt items",
          category: "Roads", created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
          sheets: [{
            id: uuid(), project_id: "", name: "Road Works", sort_order: 0,
            rows: [
              { id: uuid(), type: "header", itemNo: "", description: "A. PRELIMINARY & GENERAL", unit: "", qty: "", rate: "", amount: "" },
              { id: uuid(), type: "item", itemNo: "A.1", description: "Mobilization and demobilization", unit: "LS", qty: "1", rate: "", amount: "" },
              { id: uuid(), type: "item", itemNo: "A.2", description: "Site establishment and clearance", unit: "LS", qty: "1", rate: "", amount: "" },
              { id: uuid(), type: "item", itemNo: "A.3", description: "Traffic management", unit: "LS", qty: "1", rate: "", amount: "" },
              { id: uuid(), type: "subtotal", itemNo: "", description: "Sub Total - Preliminaries", unit: "", qty: "", rate: "", amount: "0.00" },
              { id: uuid(), type: "header", itemNo: "", description: "B. EARTHWORKS", unit: "", qty: "", rate: "", amount: "" },
              { id: uuid(), type: "item", itemNo: "B.1", description: "Excavation to spoil in soft material", unit: "m³", qty: "", rate: "", amount: "" },
              { id: uuid(), type: "item", itemNo: "B.2", description: "Excavation to spoil in hard material", unit: "m³", qty: "", rate: "", amount: "" },
              { id: uuid(), type: "item", itemNo: "B.3", description: "Fill with approved material and compact", unit: "m³", qty: "", rate: "", amount: "" },
              { id: uuid(), type: "item", itemNo: "B.4", description: "Grading and shaping of formation", unit: "m²", qty: "", rate: "", amount: "" },
              { id: uuid(), type: "subtotal", itemNo: "", description: "Sub Total - Earthworks", unit: "", qty: "", rate: "", amount: "0.00" },
              { id: uuid(), type: "header", itemNo: "", description: "C. PAVEMENT LAYERS", unit: "", qty: "", rate: "", amount: "" },
              { id: uuid(), type: "item", itemNo: "C.1", description: "Sub-base course (150mm compacted gravel)", unit: "m³", qty: "", rate: "", amount: "" },
              { id: uuid(), type: "item", itemNo: "C.2", description: "Base course (200mm crushed stone)", unit: "m³", qty: "", rate: "", amount: "" },
              { id: uuid(), type: "item", itemNo: "C.3", description: "Prime coat (MC-30 cutback bitumen)", unit: "m²", qty: "", rate: "", amount: "" },
              { id: uuid(), type: "item", itemNo: "C.4", description: "Tack coat (SS-1 emulsion)", unit: "m²", qty: "", rate: "", amount: "" },
              { id: uuid(), type: "item", itemNo: "C.5", description: "Asphalt concrete wearing course (50mm)", unit: "m²", qty: "", rate: "", amount: "" },
              { id: uuid(), type: "subtotal", itemNo: "", description: "Sub Total - Pavement", unit: "", qty: "", rate: "", amount: "0.00" },
              { id: uuid(), type: "grandtotal", itemNo: "", description: "GRAND TOTAL", unit: "", qty: "", rate: "", amount: "0.00" },
            ],
          }],
        },
      ],
      setBOQLibrary: (items) => set({ boqLibrary: items }),
      addToLibrary: (name, description, category) =>
        set((s) => ({
          boqLibrary: [
            ...s.boqLibrary,
            { id: uuid(), name, description, category, sheets: s.boqSheets.map((sh) => ({ ...sh, rows: sh.rows.map((r) => ({ ...r })) })), created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
          ],
        })),
      deleteFromLibrary: (id) => set((s) => ({ boqLibrary: s.boqLibrary.filter((item) => item.id !== id) })),

      sidebarCollapsed: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
    }),
    {
      name: "probuild-storage",
        version: 11,
      migrate: (persistedState: unknown, version: number) => {
        const state = persistedState as Record<string, any>;
        if (version < 2) {
          const now = new Date().toISOString();
          if (!state.savedBOQs) state.savedBOQs = [];
          if (!state.savedWorkPlans) state.savedWorkPlans = [];
          if (!state.savedSimpleItemSets) state.savedSimpleItemSets = [];
          state.activeBOQId = null;
          state.activeWorkPlanId = null;
          state.activeSimpleItemsId = null;
          if (state.boqSheets?.length > 0) {
            const hasData = state.boqSheets.some((s: any) => s.rows?.some((r: any) => r.description || r.itemNo));
            if (hasData) {
              state.savedBOQs = [{ id: uuid(), project_id: state.project?.id || "", name: "Untitled BOQ", createdAt: now, updatedAt: now, sheets: state.boqSheets }];
            }
          }
          if (state.activities?.length > 0) {
            const hasData = state.activities.some((a: any) => a.description);
            if (hasData) {
              state.savedWorkPlans = [{ id: uuid(), project_id: state.project?.id || "", name: "Untitled Work Plan", createdAt: now, updatedAt: now, activities: state.activities }];
            }
          }
          if (state.simpleItems?.length > 0) {
            const hasData = state.simpleItems.some((i: any) => i.description);
            if (hasData) {
              state.savedSimpleItemSets = [{ id: uuid(), project_id: state.project?.id || "", name: "Untitled Items", createdAt: now, updatedAt: now, items: state.simpleItems }];
            }
          }
          state.boqSheets = [];
          state.simpleItems = [];
        }

        if (version < 3) {
          // Migrate WorkPlan: activities[] → sheets[]
          if (state.savedWorkPlans) {
            state.savedWorkPlans = state.savedWorkPlans.map((wp: any) => {
              if (wp.sheets) return wp; // already has sheets
              return {
                ...wp,
                sheets: [{ id: uuid(), name: "Sheet 1", sort_order: 0, activities: wp.activities || [] }],
              };
            });
            // Clean up legacy activities field
            state.savedWorkPlans.forEach((wp: any) => { delete wp.activities; });
          }

          // Migrate PaymentCertificate: items[] → sheets[]
          if (state.certificates) {
            state.certificates = state.certificates.map((cert: any) => {
              if (cert.sheets) return cert; // already has sheets
              return {
                ...cert,
                sheets: [{ id: uuid(), name: "Summary", items: cert.items || [] }],
              };
            });
            state.certificates.forEach((cert: any) => { delete cert.items; });
          }

          // Migrate working state: activities[] → workPlanSheets[]
          if (state.activities?.length > 0 && !state.workPlanSheets) {
            state.workPlanSheets = [{ id: uuid(), name: "Sheet 1", sort_order: 0, activities: state.activities }];
          } else if (!state.workPlanSheets) {
            state.workPlanSheets = [];
          }
          delete state.activities;
          state.activeWorkPlanSheetIndex = 0;
        }

        if (version < 4) {
          if (state.savedWorkPlans) {
            state.savedWorkPlans = state.savedWorkPlans.map((wp: any) => ({
              ...wp,
              sheets: (wp.sheets || []).map((sh: any) => ({
                ...sh,
                activities: recalcWorkPlanSections((sh.activities || []).map((a: any) => ({ ...a, rowType: a.rowType || "activity" }))),
              })),
            }));
          }
          if (state.workPlanSheets) {
            state.workPlanSheets = state.workPlanSheets.map((sh: any) => ({
              ...sh,
              activities: recalcWorkPlanSections((sh.activities || []).map((a: any) => ({ ...a, rowType: a.rowType || "activity" }))),
            }));
          }
        }

        if (!state.projects) {
          state.projects = state.project ? [state.project] : [];
        }

        if (version < 5) {
          if (state.savedBOQs) {
            state.savedBOQs = state.savedBOQs.map((b: any) => ({
              ...b,
              project_id: b.project_id || b.sheets?.[0]?.project_id || state.project?.id || "",
            }));
          }
          if (state.savedWorkPlans) {
            state.savedWorkPlans = state.savedWorkPlans.map((wp: any) => ({
              ...wp,
              project_id: wp.project_id || wp.sheets?.[0]?.activities?.[0]?.project_id || state.project?.id || "",
            }));
          }
          if (state.savedSimpleItemSets) {
            state.savedSimpleItemSets = state.savedSimpleItemSets.map((si: any) => ({
              ...si,
              project_id: si.project_id || state.project?.id || "",
            }));
          }
        }

        if (version < 6) {
          if (!state.progressReports) state.progressReports = [];
          if (!state.generatedDocuments) state.generatedDocuments = [];
        }

        if (version < 7) {
          if (!state.correspondenceRecords) state.correspondenceRecords = [];
        }

        if (version < 8) {
          if (!state.attendeeGroups) state.attendeeGroups = [];
          if (!state.meetingMinutes) state.meetingMinutes = [];
        }

        if (version < 9) {
          state.userSignatureProfile = state.userSignatureProfile ?? null;
        }

        if (version < 10) {
          if (!state.checklistItems) state.checklistItems = [];
        }

        if (version < 11) {
          if (!state.siteNotes) state.siteNotes = [];
        }

        return state as AppState;
      },
    }
  ),
  {
    partialize: (state) => {
      const { activeModule, activeSheetIndex, sidebarCollapsed, activeBOQId, activeWorkPlanId, activeSimpleItemsId, activeWorkPlanSheetIndex, ...rest } = state;
      return rest;
    },
  }
)
);
