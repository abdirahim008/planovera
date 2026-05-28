import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import * as XLSX from "xlsx";
import type {
  BOQRow,
  BOQSheet,
  PaymentAdjustmentLine,
  PaymentCertificate,
  PaymentItem,
  Program,
  Project,
  SavedBOQ,
} from "@/lib/supabase";
import {
  FINAL_CERTIFICATE_ID_PREFIX,
  FINAL_CERTIFICATE_IMPORT_ID,
  FINAL_CERTIFICATE_PROGRAM_ID,
  type FinalCertificateImportPayload,
  type FinalCertificateImportPreview,
} from "@/lib/finalCertificateImportTypes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IMPORT_ROOT = path.join(process.cwd(), "imports", "final-certificate-test");
const BOQ_FILE = "01-boq.xlsx";
const IPC_FILE = "02-last-ipc.xlsx";
const TAKING_OVER_FILE = "taking over certificate -TARGET.pdf";

const PROJECT_ID = `${FINAL_CERTIFICATE_ID_PREFIX}project-target`;
const BOQ_ID = `${FINAL_CERTIFICATE_ID_PREFIX}boq-target`;
const IPC_ID = `${FINAL_CERTIFICATE_ID_PREFIX}ipc-005`;
const FINAL_CERT_ID = `${FINAL_CERTIFICATE_ID_PREFIX}final-certificate`;

const formatAmount = (value: number) => (Number.isFinite(value) ? value.toFixed(2) : "0.00");
const slugId = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 56);

const cell = (sheet: XLSX.WorkSheet, address: string) => sheet[address];
const cellRaw = (sheet: XLSX.WorkSheet, address: string) => cell(sheet, address)?.v;
const cellText = (sheet: XLSX.WorkSheet, address: string) => {
  const value = cell(sheet, address);
  return String(value?.w ?? value?.v ?? "").trim();
};
const cellNumber = (sheet: XLSX.WorkSheet, address: string) => {
  const value = cell(sheet, address);
  if (!value) return 0;
  if (typeof value.v === "number") return Number.isFinite(value.v) ? value.v : 0;
  return parseFloat(String(value.w ?? value.v ?? "0").replace(/[$,%\s,]/g, "")) || 0;
};
const rowValue = (row: unknown[], index: number) => row[index];
const rowText = (row: unknown[], index: number) => String(rowValue(row, index) ?? "").trim();
const rowNumber = (row: unknown[], index: number) => {
  const value = rowValue(row, index);
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  return parseFloat(String(value ?? "0").replace(/[$,%\s,]/g, "")) || 0;
};

const rowPercent = (row: unknown[], index: number) => {
  const value = rowValue(row, index);
  if (typeof value === "number") return value > 1 ? value / 100 : value;
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  const parsed = parseFloat(raw.replace(/[%\s,]/g, "")) || 0;
  return raw.includes("%") || parsed > 1 ? parsed / 100 : parsed;
};

const isProbablyHeader = (description: string, unit: string, amount: number) =>
  Boolean(description) && !unit && !amount;

const parseBoqSheet = (workbook: XLSX.WorkBook, sheetName: string): BOQSheet => {
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false });
  const boqRows: BOQRow[] = [];

  rows.forEach((row, index) => {
    if (index < 3) return;
    const itemNo = rowText(row, 0);
    const description = rowText(row, 1);
    const unit = rowText(row, 2);
    const qty = rowNumber(row, 6);
    const rate = rowNumber(row, 7);
    const amount = rowNumber(row, 8);
    const fallbackAmount = rowNumber(row, 5);
    const isSubtotal = /sub-?total/i.test(itemNo) || /sub-?total/i.test(description);

    if (!itemNo && !description && !unit && !amount && !fallbackAmount) return;

    if (isSubtotal) {
      boqRows.push({
        id: `${FINAL_CERTIFICATE_ID_PREFIX}boq-${slugId(sheetName)}-row-${index + 1}`,
        type: "subtotal",
        itemNo: "",
        description: description || itemNo || "Sub Total",
        unit: "",
        qty: "",
        rate: "",
        amount: formatAmount(amount || fallbackAmount),
      });
      return;
    }

    if (isProbablyHeader(description || itemNo, unit, amount || fallbackAmount)) {
      boqRows.push({
        id: `${FINAL_CERTIFICATE_ID_PREFIX}boq-${slugId(sheetName)}-row-${index + 1}`,
        type: "header",
        itemNo,
        description: description || itemNo,
        unit: "",
        qty: "",
        rate: "",
        amount: "",
      });
      return;
    }

    if (description && unit) {
      boqRows.push({
        id: `${FINAL_CERTIFICATE_ID_PREFIX}boq-${slugId(sheetName)}-row-${index + 1}`,
        type: "item",
        itemNo,
        description,
        unit,
        qty: formatAmount(qty || rowNumber(row, 3)),
        rate: formatAmount(rate || rowNumber(row, 4)),
        amount: formatAmount(amount || fallbackAmount),
      });
    }
  });

  return {
    id: `${FINAL_CERTIFICATE_ID_PREFIX}boq-sheet-${slugId(sheetName)}`,
    project_id: PROJECT_ID,
    name: sheetName,
    sort_order: 0,
    rows: boqRows,
  };
};

const parseSummarySheet = (workbook: XLSX.WorkBook, sheetName: string): BOQSheet => {
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false });
  const boqRows: BOQRow[] = [];

  rows.forEach((row, index) => {
    if (index < 2) return;
    const itemNo = rowText(row, 0);
    const description = rowText(row, 1) || itemNo;
    const amount = rowNumber(row, 2);
    if (!description && !amount) return;
    const isGrand = /grand total/i.test(description);
    const isSubtotal = /sub-?total/i.test(description);
    boqRows.push({
      id: `${FINAL_CERTIFICATE_ID_PREFIX}boq-summary-row-${index + 1}`,
      type: isGrand ? "grandtotal" : isSubtotal ? "subtotal" : "item",
      itemNo: isGrand || isSubtotal ? "" : itemNo,
      description,
      unit: "",
      qty: amount ? "1.00" : "",
      rate: amount ? formatAmount(amount) : "",
      amount: amount ? formatAmount(amount) : "",
    });
  });

  return {
    id: `${FINAL_CERTIFICATE_ID_PREFIX}boq-sheet-summary`,
    project_id: PROJECT_ID,
    name: sheetName,
    sort_order: 1,
    rows: boqRows,
  };
};

const parsePaymentItems = (workbook: XLSX.WorkBook): PaymentItem[] => {
  const sheet = workbook.Sheets["BILL 1&2"];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false });

  return rows.flatMap((row, index) => {
    if (index < 3) return [];
    const description = rowText(row, 1);
    const unit = rowText(row, 2);
    if (!description || !unit) return [];

    const boqQty = rowNumber(row, 6) || rowNumber(row, 3);
    const boqRate = rowNumber(row, 7) || rowNumber(row, 4);
    const boqAmount = rowNumber(row, 8) || rowNumber(row, 5);
    const previousAmount = rowNumber(row, 10);
    const totalAmount = rowNumber(row, 12);
    const currentAmount = rowNumber(row, 14);
    const previousQty = boqQty * rowPercent(row, 9);
    const totalQty = boqQty * rowPercent(row, 11);
    const currentQty = Math.max(0, totalQty - previousQty);

    return [
      {
        id: `${FINAL_CERTIFICATE_ID_PREFIX}payment-item-${index + 1}`,
        billNo: rowText(row, 0),
        description,
        unit,
        boqQty: formatAmount(boqQty),
        boqRate: formatAmount(boqRate),
        boqAmount: formatAmount(boqAmount),
        previousQty: formatAmount(previousQty),
        currentQty: formatAmount(currentQty),
        previousAmount: formatAmount(previousAmount),
        currentAmount: formatAmount(currentAmount),
        totalQty: formatAmount(totalQty),
        totalAmount: formatAmount(totalAmount),
        balanceQty: formatAmount(Math.max(0, boqQty - totalQty)),
        warningStatus: totalAmount > boqAmount + 0.01 ? "overridden" : "ok",
        overrideNote:
          totalAmount > boqAmount + 0.01
            ? "Imported IPC cumulative amount exceeds revised BOQ amount in source workbook."
            : "",
      },
    ];
  });
};

const buildIpcCertificate = (
  paymentItems: PaymentItem[],
  currentTax: number,
  currentRetention: number,
  currentAdvanceRecovery: number
): PaymentCertificate => {
  const adjustments: PaymentAdjustmentLine[] = [];
  if (currentTax) {
    adjustments.push({
      id: `${FINAL_CERTIFICATE_ID_PREFIX}ipc-tax`,
      label: "FGS tax from IPC 005",
      type: "addition",
      category: "other",
      amount: formatAmount(currentTax),
      note: "Imported from GRAND SUMMARY / THIS CERTIFICATE.",
    });
  }
  if (currentRetention) {
    adjustments.push({
      id: `${FINAL_CERTIFICATE_ID_PREFIX}ipc-retention`,
      label: "Retention deducted in IPC 005",
      type: "deduction",
      category: "other",
      amount: formatAmount(currentRetention),
      note: "Imported from IPC 005 summary deduction line.",
    });
  }

  return {
    id: IPC_ID,
    project_id: PROJECT_ID,
    boqId: BOQ_ID,
    boqName: "Target Revised Contract BOQ",
    number: 5,
    revision: 0,
    type: "interim",
    date: "2025-11-08",
    periodStart: "2024-09-15",
    periodEnd: "2024-11-30",
    status: "paid",
    previousCertificateId: null,
    locked: true,
    sheets: [
      {
        id: `${FINAL_CERTIFICATE_ID_PREFIX}ipc-sheet-1`,
        name: "BILL 1&2",
        items: paymentItems,
      },
    ],
    contingenciesPercent: 0,
    governmentTaxPercent: 0,
    retentionPercent: 0,
    advancePaymentPercent: 0,
    withholdingTaxPercent: 0,
    advancePaymentAmount: "0.00",
    advanceRecoveredPrevious: "0.00",
    advanceRecoveryCurrent: formatAmount(currentAdvanceRecovery),
    retentionReleaseAmount: "0.00",
    finalAccountNote: "Imported local test IPC 005 from source workbook.",
    adjustments,
    contractorName: "Target General Services Ltd",
    contractorCompany: "Target General Services Ltd",
    contractorTitle: "Contractor",
    engineerName: "PIU - Mogadishu",
    engineerOrg: "PIU - Mogadishu",
    engineerTitle: "Engineer",
    employerName: "Banadir Regional Administration",
    employerOrg: "Banadir Regional Administration",
    employerTitle: "Employer",
  };
};

const buildFinalCertificate = (previousItems: PaymentItem[], retentionRelease: number): PaymentCertificate => ({
  id: FINAL_CERT_ID,
  project_id: PROJECT_ID,
  boqId: BOQ_ID,
  boqName: "Target Revised Contract BOQ",
  number: 1,
  revision: 0,
  type: "final",
  date: "2026-03-31",
  periodStart: "2025-12-31",
  periodEnd: "2026-03-31",
  status: "draft",
  previousCertificateId: IPC_ID,
  locked: false,
  sheets: [
    {
      id: `${FINAL_CERTIFICATE_ID_PREFIX}final-sheet-1`,
      name: "Retention Release",
      items: previousItems.map((item, index) => ({
        ...item,
        id: `${FINAL_CERTIFICATE_ID_PREFIX}final-item-${index + 1}`,
        previousAmount: item.totalAmount,
        previousQty: item.totalQty,
        currentAmount: "0.00",
        currentQty: "0.00",
        totalAmount: item.totalAmount,
        totalQty: item.totalQty,
        warningStatus: item.warningStatus,
      })),
    },
  ],
  contingenciesPercent: 0,
  governmentTaxPercent: 0,
  retentionPercent: 0,
  advancePaymentPercent: 0,
  withholdingTaxPercent: 0,
  advancePaymentAmount: "0.00",
  advanceRecoveredPrevious: "0.00",
  advanceRecoveryCurrent: "0.00",
  retentionReleaseAmount: formatAmount(retentionRelease),
  finalAccountNote:
    "Local test final certificate generated after taking-over/DLP for release of remaining retention balance only.",
  adjustments: [],
  contractorName: "Target General Services Ltd",
  contractorCompany: "Target General Services Ltd",
  contractorTitle: "Contractor",
  engineerName: "PIU - Mogadishu",
  engineerOrg: "PIU - Mogadishu",
  engineerTitle: "Engineer",
  employerName: "Banadir Regional Administration",
  employerOrg: "Banadir Regional Administration",
  employerTitle: "Employer",
});

export async function GET() {
  const boqPath = path.join(IMPORT_ROOT, BOQ_FILE);
  const ipcPath = path.join(IMPORT_ROOT, IPC_FILE);
  const takingOverPath = path.join(IMPORT_ROOT, TAKING_OVER_FILE);

  if (!fs.existsSync(boqPath) || !fs.existsSync(ipcPath)) {
    return NextResponse.json(
      { error: `Expected ${BOQ_FILE} and ${IPC_FILE} under ${IMPORT_ROOT}.` },
      { status: 404 }
    );
  }

  const importedAt = new Date().toISOString();
  const boqWorkbook = XLSX.read(fs.readFileSync(boqPath), { cellDates: true });
  const ipcWorkbook = XLSX.read(fs.readFileSync(ipcPath), { cellDates: true });
  const ipcSummary = ipcWorkbook.Sheets["IPC 005"];
  const grandSummary = ipcWorkbook.Sheets["GRAND SUMMARY"];
  const warnings: string[] = [];

  if (!ipcSummary) warnings.push("IPC 005 summary sheet was not found.");
  if (!grandSummary) warnings.push("GRAND SUMMARY sheet was not found in last IPC workbook.");
  if (!fs.existsSync(takingOverPath)) warnings.push(`${TAKING_OVER_FILE} was not found.`);

  const boqSheets = [
    parseBoqSheet(boqWorkbook, "BILL 1&2"),
    parseSummarySheet(boqWorkbook, "GRAND SUMMARY"),
  ];
  const paymentItems = parsePaymentItems(ipcWorkbook);
  const revisedContractSum = ipcSummary ? cellNumber(ipcSummary, "H10") : 456329.89;
  const boqGrandTotal = grandSummary ? cellNumber(grandSummary, "E11") : 456184.35;
  const lastIpcThisCertificate = grandSummary ? cellNumber(grandSummary, "H11") : 100875.24;
  const lastIpcNetDue = ipcSummary ? cellNumber(ipcSummary, "H25") : 88474.65;
  const currentTax = grandSummary ? cellNumber(grandSummary, "H10") : 7472.24;
  const currentRetention = ipcSummary ? cellNumber(ipcSummary, "G15") : 12171.84;
  const currentAdvanceRecovery = ipcSummary ? cellNumber(ipcSummary, "G16") : 228.75;
  const retentionReleaseAmount = grandSummary ? cellNumber(grandSummary, "G12") : 36014.67;

  const program: Program = {
    id: FINAL_CERTIFICATE_PROGRAM_ID,
    name: "Final Certificate Test",
    code: "FCT",
    description: "Local test program for validating IPC and final certificate workflow.",
    clientName: "Banadir Regional Administration",
    location: "Mogadishu, Banadir, Somalia",
    currency: "USD",
    budgetAmount: formatAmount(revisedContractSum),
    start_date: "2024-09-15",
    end_date: "2026-03-31",
    status: "active",
    created_at: importedAt,
    updated_at: importedAt,
  };

  const project: Project = {
    id: PROJECT_ID,
    programId: FINAL_CERTIFICATE_PROGRAM_ID,
    name: "Storm Drainage Cleaning and Condition Assessment - Target",
    type: "construction",
    role: "supervision",
    code: "TARGET-DRAINAGE",
    contractNumber: "SO-MM-415200-CW-RFB",
    categoryName: "Drainage",
    clientName: "Banadir Regional Administration",
    contractorName: "Target General Services Ltd",
    consultantName: "PIU - Mogadishu",
    location: "Hamarweyn, Shangani, Hodan, Abdiaziz, Hamar-Jajab and Bondhere Districts",
    region: "Banadir",
    town: "Mogadishu",
    latitude: "2.0469",
    longitude: "45.3182",
    contractTitle:
      "Clearing and condition assessment for storm drainage lines, Hamarweyn, Shangani, Hodan, Abdiaziz, Hamar-Jajab and Bondhere Districts",
    contractAmount: formatAmount(revisedContractSum),
    currency: "USD",
    start_date: "2024-09-15",
    end_date: "2026-03-31",
    created_at: importedAt,
    documentBranding: {
      clientDisplayName: "Banadir Regional Administration",
      clientAddress: "Mogadishu, Somalia",
      issuerDisplayName: "PIU - Mogadishu",
      issuerAddress: "Mogadishu, Somalia",
      headerTagline: "Somalia Urban Resilience Project Phase Two (SURP-II)",
    },
  };

  const savedBOQ: SavedBOQ = {
    id: BOQ_ID,
    project_id: PROJECT_ID,
    name: "Target Revised Contract BOQ",
    createdAt: importedAt,
    updatedAt: importedAt,
    sheets: boqSheets,
  };

  const lastIpc = buildIpcCertificate(paymentItems, currentTax, currentRetention, currentAdvanceRecovery);
  const finalCertificate = buildFinalCertificate(paymentItems, retentionReleaseAmount);

  const preview: FinalCertificateImportPreview = {
    importId: FINAL_CERTIFICATE_IMPORT_ID,
    importedAt,
    projectName: project.name,
    contractNumber: project.contractNumber || "",
    contractorName: project.contractorName || "",
    boqFileName: BOQ_FILE,
    ipcFileName: IPC_FILE,
    takingOverFileName: fs.existsSync(takingOverPath) ? TAKING_OVER_FILE : "Missing",
    revisedContractSum,
    boqGrandTotal,
    lastIpcThisCertificate,
    lastIpcNetDue,
    retentionReleaseAmount,
    finalNetPayable: retentionReleaseAmount,
    warnings,
  };

  const payload: FinalCertificateImportPayload = {
    importId: FINAL_CERTIFICATE_IMPORT_ID,
    importedAt,
    preview,
    programs: [program],
    projects: [project],
    savedBOQs: [savedBOQ],
    savedWorkPlans: [],
    progressReports: [],
    certificates: [lastIpc, finalCertificate],
  };

  return NextResponse.json({ preview, payload });
}
