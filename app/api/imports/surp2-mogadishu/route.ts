import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import * as XLSX from "xlsx";
import { strFromU8, unzipSync } from "fflate";
import type {
  BOQRow,
  BOQSheet,
  PaymentCertificate,
  PaymentItem,
  Program,
  ProgressItem,
  Project,
  SavedBOQ,
  SavedWorkPlan,
  WorkPlanActivity,
} from "@/lib/supabase";
import {
  SURP2_IMPORT_ID,
  SURP2_PROGRAM_ID,
  type Surp2ImportPayload,
  type Surp2ImportPreview,
  type Surp2ImportPreviewPackage,
} from "@/lib/surp2ImportTypes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ParsedReport = {
  contractTitle: string;
  contractorName: string;
  contractReference: string;
  contractSum: number;
  startDate: string;
  commencementDate: string;
  completionDate: string;
  contractPeriod: string;
  actualProgress: number;
  plannedProgress: number;
  certifiedAmount: number;
  paidAmount: number;
  advancePayment: number;
  warnings: string[];
};

type PackageConfig = {
  packageNumber: number;
  projectName: string;
  projectCode: string;
  fileToken: string;
  reportToken: string;
  location: string;
  region: string;
  town: string;
  latitude: string;
  longitude: string;
  fallbackContractor: string;
  fallbackTitle: string;
};

const IMPORT_ROOT = path.join(process.cwd(), "imports", "surp2-mogadishu");
const BOQ_DIR = path.join(IMPORT_ROOT, "01-boqs");
const REPORT_DIR = path.join(IMPORT_ROOT, "02-progress-reports");

const PACKAGES: PackageConfig[] = [
  {
    packageNumber: 1,
    projectName: "Package 1 - Daynile Road",
    projectCode: "SURP2-MOG-PKG1",
    fileToken: "package 1",
    reportToken: "Package 1",
    location: "Daynile District, Mogadishu",
    region: "Banadir",
    town: "Mogadishu",
    latitude: "2.1160",
    longitude: "45.2882",
    fallbackContractor: "Kulmiye General Service Limited",
    fallbackTitle: "Rehabilitation of Main Road Package I: 2km dual carriageway Daynile Road",
  },
  {
    packageNumber: 2,
    projectName: "Package 2 - Madina Hospital, Kalkaal & Kahda Roads",
    projectCode: "SURP2-MOG-PKG2",
    fileToken: "package 2",
    reportToken: "Package 2",
    location: "Wadajir and Kahda Districts, Mogadishu",
    region: "Banadir",
    town: "Mogadishu",
    latitude: "2.0184",
    longitude: "45.2507",
    fallbackContractor: "Docol Construction, Rehabilitation and Trading Company Limited",
    fallbackTitle: "Upgrading to bitumen standard of Madina Hospital Road and Kalkaal Road",
  },
  {
    packageNumber: 3,
    projectName: "Package 3 - Saddexda Geed, Nasiib Buundo & Hamarweyne Roads",
    projectCode: "SURP2-MOG-PKG3",
    fileToken: "package 3",
    reportToken: "Saddexda",
    location: "Hamarweyne, Shangani, Shibis and Boondhere Districts, Mogadishu",
    region: "Banadir",
    town: "Mogadishu",
    latitude: "2.0390",
    longitude: "45.3420",
    fallbackContractor: "Buruuj Construction and Real Estate-BCRE",
    fallbackTitle: "Upgrading to bitumen standard of Saddexda Geed, Nasiib Buundo and Hamarweyne Roads",
  },
  {
    packageNumber: 4,
    projectName: "Package 4 - Keysaney Hospital Road",
    projectCode: "SURP2-MOG-PKG4",
    fileToken: "package 4",
    reportToken: "Package 4",
    location: "Kaaran District, Mogadishu",
    region: "Banadir",
    town: "Mogadishu",
    latitude: "2.0910",
    longitude: "45.3640",
    fallbackContractor: "DHIS Contracting Company Ltd",
    fallbackTitle: "Rehabilitation of Keysaney Hospital Road Package IV: 2.89km Road",
  },
];

const cleanText = (value: unknown) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

const parseAmount = (value: unknown) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const text = cleanText(value)
    .replace(/USD/gi, "")
    .replace(/\$/g, "")
    .replace(/,/g, "")
    .replace(/[()]/g, "")
    .replace(/[^\d.-]/g, "");
  const parsed = Number.parseFloat(text);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatAmount = (value: number) => value.toFixed(2);

const findMatchingFile = (dir: string, token: string, extension: string) => {
  const normalizedToken = token.toLowerCase();
  return fs
    .readdirSync(dir)
    .filter((file) => file.toLowerCase().endsWith(extension))
    .find((file) => file.toLowerCase().includes(normalizedToken));
};

const firstNumericFromRight = (row: unknown[]) => {
  for (let index = row.length - 1; index >= 0; index -= 1) {
    const parsed = parseAmount(row[index]);
    if (parsed) return parsed;
  }
  return 0;
};

const excelSerialDateToIso = (value: number) => {
  const parsed = XLSX.SSF.parse_date_code(value);
  if (!parsed) return "";
  const month = String(parsed.m).padStart(2, "0");
  const day = String(parsed.d).padStart(2, "0");
  return `${parsed.y}-${month}-${day}`;
};

const parseDate = (value: unknown) => {
  if (typeof value === "number") return excelSerialDateToIso(value);
  const raw = cleanText(value).replace(/\s*\/\s*/g, "/");
  if (!raw || raw === "-" || /n\/?a/i.test(raw)) return "";

  const numeric = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (numeric) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]);
    const year = Number(numeric[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  const monthNames: Record<string, string> = {
    jan: "01",
    january: "01",
    feb: "02",
    february: "02",
    mar: "03",
    march: "03",
    apr: "04",
    april: "04",
    may: "05",
    jun: "06",
    june: "06",
    jul: "07",
    july: "07",
    aug: "08",
    august: "08",
    sep: "09",
    sept: "09",
    september: "09",
    oct: "10",
    october: "10",
    nov: "11",
    november: "11",
    dec: "12",
    december: "12",
  };
  const named = raw.match(/(\d{1,2})\/?([A-Za-z]+)\/?(\d{4})/);
  if (named) {
    const month = monthNames[named[2].toLowerCase()];
    if (month) return `${named[3]}-${month}-${String(Number(named[1])).padStart(2, "0")}`;
  }

  return "";
};

const normalizeXmlText = (xml: string) =>
  xml
    .replace(/<w:tab\/>/g, " ")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .split(/\r?\n/)
    .map(cleanText)
    .filter(Boolean);

const extractDocxLines = (filePath: string) => {
  const archive = unzipSync(new Uint8Array(fs.readFileSync(filePath)));
  const documentXml = archive["word/document.xml"];
  if (!documentXml) return [];
  return normalizeXmlText(strFromU8(documentXml));
};

const firstValueAfter = (lines: string[], labels: string[]) => {
  for (const label of labels) {
    const index = lines.findIndex((line) => line.toLowerCase().includes(label.toLowerCase()));
    if (index >= 0) {
      const sameLine = lines[index].split(":").slice(1).join(":").trim();
      if (sameLine) return sameLine;
      const next = lines.slice(index + 1, index + 5).find((line) => !labels.some((item) => line.toLowerCase().includes(item.toLowerCase())));
      if (next) return next;
    }
  }
  return "";
};

const firstPercentAfter = (lines: string[], labels: string[]) => {
  const value = firstValueAfter(lines, labels);
  const match = value.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
};

const firstMoneyAfter = (lines: string[], labels: string[]) => parseAmount(firstValueAfter(lines, labels));

const parseReport = (filePath: string, config: PackageConfig): ParsedReport => {
  const warnings: string[] = [];
  let lines: string[] = [];
  try {
    lines = extractDocxLines(filePath);
  } catch (error) {
    warnings.push(`Could not read DOCX report: ${error instanceof Error ? error.message : "unknown error"}`);
  }

  const contractTitle =
    lines.find((line) => /Rehabilitation|UPGRADING|PROPOSED/i.test(line) && line.length > 40) ||
    config.fallbackTitle;
  const extractedContractor = firstValueAfter(lines, ["Name of Contractor", "Contractor"]);
  const contractorName =
    !extractedContractor ||
    /physical|progress|planned|actual|^\d|\bsection\b/i.test(extractedContractor)
      ? config.fallbackContractor
      : extractedContractor;
  const contractReference = firstValueAfter(lines, ["Contract number", "Contract No", "Contract Reference"]);
  const contractSum = firstMoneyAfter(lines, ["Contract Sum", "Contract amount"]);
  const startDate =
    parseDate(firstValueAfter(lines, ["Start Date"])) ||
    parseDate(firstValueAfter(lines, ["Commencement date"]));
  const commencementDate = parseDate(firstValueAfter(lines, ["Commencement date"]));
  const completionDate = parseDate(firstValueAfter(lines, ["Date of Completion", "Completion Date"]));
  const contractPeriod = firstValueAfter(lines, ["Original Contract period", "Contract period"]);
  const actualProgress = firstPercentAfter(lines, ["Actual Work Progress", "Actual progress", "Physical progress to date"]);
  const plannedProgress = firstPercentAfter(lines, ["Planned Work Progress", "Planned progress"]);
  const certifiedAmount = Math.max(
    0,
    firstMoneyAfter(lines, ["Total Amount certified to date", "Total certified to date", "certified to date"])
  );
  const paidAmount = Math.max(0, firstMoneyAfter(lines, ["Amount paid", "Paid to date"]));
  const advancePayment = Math.max(0, firstMoneyAfter(lines, ["Advance Payment", "Advance payment"]));

  if (!contractSum) warnings.push("Report contract sum was not detected.");
  if (!actualProgress) warnings.push("Actual progress percentage was not detected.");
  if (!plannedProgress) warnings.push("Planned progress percentage was not detected.");
  if (!startDate) warnings.push("Start date was not detected or was invalid.");
  if (!completionDate) warnings.push("Completion date was not detected.");

  return {
    contractTitle,
    contractorName,
    contractReference,
    contractSum,
    startDate,
    commencementDate,
    completionDate,
    contractPeriod,
    actualProgress,
    plannedProgress,
    certifiedAmount,
    paidAmount,
    advancePayment,
    warnings,
  };
};

const classifyBoqRow = (itemNo: string, description: string, unit: string, qty: string, rate: string, amount: string): BOQRow["type"] => {
  const lower = description.toLowerCase();
  if (lower.includes("grand total") || lower.includes("form of bid")) return "grandtotal";
  if (lower.includes("subtotal") || lower.includes("sub total") || lower.includes("total carried") || lower === "total") {
    return "subtotal";
  }
  if (unit || qty || rate || amount || /^[a-z]?\d+(?:\.\d+)*$/i.test(itemNo)) return "item";
  return "header";
};

const parseWorkbook = (filePath: string, config: PackageConfig) => {
  const workbook = XLSX.read(fs.readFileSync(filePath), { type: "buffer", cellDates: false });
  const warnings: string[] = [];
  const sheets: BOQSheet[] = workbook.SheetNames.map((sheetName, sheetIndex) => {
    const rawRows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
      header: 1,
      defval: "",
      blankrows: false,
    });

    const rows: BOQRow[] = rawRows
      .map((row, rowIndex) => {
        const cells = row.map((cell) => (typeof cell === "number" ? cell : cleanText(cell)));
        const descriptionText = cells.map(cleanText).filter(Boolean).join(" ");
        if (!descriptionText) return null;

        const itemNo = cleanText(cells[0]);
        const description = cleanText(cells[1]) || descriptionText;
        const unit = cleanText(cells[2]);
        const qty = cleanText(cells[3]);
        const rate = cleanText(cells[4]);
        const amount = cleanText(cells[5]);
        const rowType = sheetName.toLowerCase().includes("summary")
          ? classifyBoqRow("", descriptionText, "", "", "", cleanText(cells.at(-1)))
          : classifyBoqRow(itemNo, description, unit, qty, rate, amount);

        return {
          id: `surp2-pkg-${config.packageNumber}-boq-${sheetIndex}-row-${rowIndex}`,
          type: rowType,
          itemNo: sheetName.toLowerCase().includes("summary") ? itemNo : itemNo,
          description: sheetName.toLowerCase().includes("summary") ? descriptionText : description,
          unit,
          qty,
          rate,
          amount: amount || (rowType !== "item" ? cleanText(cells.at(-1)) : ""),
        };
      })
      .filter(Boolean) as BOQRow[];

    return {
      id: `surp2-pkg-${config.packageNumber}-boq-sheet-${sheetIndex}`,
      project_id: `surp2-project-package-${config.packageNumber}`,
      name: sheetName,
      sort_order: sheetIndex,
      rows,
      showSummary: true,
      summaryGrandTotalTitle: "Sheet total",
    };
  });

  const summaryRows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets["Summary Page"] || workbook.Sheets[workbook.SheetNames[0]], {
    header: 1,
    defval: "",
    blankrows: false,
  });
  const totalRow = summaryRows.find((row) =>
    row.map(cleanText).join(" ").toLowerCase().includes("total carried forward to form of bid")
  );
  const boqTotal = totalRow ? firstNumericFromRight(totalRow) : 0;
  if (!boqTotal) warnings.push("BOQ total carried forward to Form of Bid was not detected.");

  return { sheets, boqTotal, warnings };
};

const makeWorkPlan = (config: PackageConfig, report: ParsedReport, importedAt: string): SavedWorkPlan => {
  const completed = Math.round(Math.max(0, Math.min(100, report.actualProgress)));
  const activities: WorkPlanActivity[] = Array.from({ length: 100 }, (_, index) => ({
    id: `surp2-workplan-package-${config.packageNumber}-activity-${index + 1}`,
    project_id: `surp2-project-package-${config.packageNumber}`,
    rowType: "activity",
    description: `Imported progress unit ${index + 1}`,
    duration: "",
    startDate: report.startDate || report.commencementDate || "2025-04-03",
    endDate: report.completionDate || "2026-06-02",
    status: index < completed ? "completed" : index === completed && completed < 100 ? "in-progress" : "pending",
  }));

  return {
    id: `surp2-workplan-package-${config.packageNumber}`,
    project_id: `surp2-project-package-${config.packageNumber}`,
    name: "Imported progress summary work plan",
    createdAt: importedAt,
    updatedAt: importedAt,
    sheets: [
      {
        id: `surp2-workplan-package-${config.packageNumber}-sheet-1`,
        name: "Progress Summary",
        sort_order: 0,
        activities,
      },
    ],
  };
};

const makeProgressReport = (
  config: PackageConfig,
  report: ParsedReport,
  boqId: string,
  boqName: string,
  boqTotal: number,
  importedAt: string
) => {
  const actual = Math.max(0, Math.min(100, report.actualProgress));
  const planned = Math.max(0, Math.min(100, report.plannedProgress));
  const item: ProgressItem = {
    id: `surp2-progress-package-${config.packageNumber}-item-1`,
    billNo: `PKG-${config.packageNumber}`,
    description: config.projectName,
    unit: "%",
    boqQty: "100",
    boqRate: formatAmount(boqTotal / 100),
    boqAmount: formatAmount(boqTotal),
    previousQty: "0",
    currentQty: actual.toFixed(2),
    totalQty: actual.toFixed(2),
    earnedAmount: formatAmount((boqTotal * actual) / 100),
    weightPercent: "100.00",
    plannedPercent: planned.toFixed(2),
    actualPercent: actual.toFixed(2),
    variancePercent: (actual - planned).toFixed(2),
    status: actual >= 100 ? "completed" : actual + 5 < planned ? "delayed" : "in-progress",
    remarks: "Imported from SURP2 monthly progress report.",
  };

  return {
    id: `surp2-progress-package-${config.packageNumber}`,
    project_id: `surp2-project-package-${config.packageNumber}`,
    number: 1,
    name: "Imported February 2026 Progress Report",
    date: "2026-02-28",
    status: "approved" as const,
    sourceType: "boq" as const,
    inputMode: "percent" as const,
    weightMode: "boq-amount" as const,
    sourceId: boqId,
    sourceName: boqName,
    createdAt: importedAt,
    updatedAt: importedAt,
    sheets: [
      {
        id: `surp2-progress-package-${config.packageNumber}-sheet-1`,
        name: "Progress Summary",
        items: [item],
      },
    ],
  };
};

const makeCertificate = (
  config: PackageConfig,
  report: ParsedReport,
  boqId: string,
  boqName: string,
  boqTotal: number,
  importedAt: string
): PaymentCertificate => {
  const commercialAmount = report.paidAmount || report.certifiedAmount || 0;
  const item: PaymentItem = {
    id: `surp2-payment-package-${config.packageNumber}-item-1`,
    billNo: `PKG-${config.packageNumber}`,
    description: "Imported certified or paid amount from progress report",
    unit: "Sum",
    boqQty: "1",
    boqRate: formatAmount(boqTotal),
    boqAmount: formatAmount(boqTotal),
    previousAmount: "0.00",
    currentAmount: formatAmount(commercialAmount),
    totalQty: "1",
    totalAmount: formatAmount(commercialAmount),
  };

  return {
    id: `surp2-payment-package-${config.packageNumber}`,
    project_id: `surp2-project-package-${config.packageNumber}`,
    boqId,
    boqName,
    number: 1,
    type: "interim",
    date: "2026-02-28",
    status: commercialAmount > 0 ? "paid" : "draft",
    sheets: [
      {
        id: `surp2-payment-package-${config.packageNumber}-sheet-1`,
        name: "Imported Payment Summary",
        items: [item],
      },
    ],
    contingenciesPercent: 0,
    governmentTaxPercent: 0,
    retentionPercent: 0,
    advancePaymentPercent: 0,
    withholdingTaxPercent: 0,
    contractorName: report.contractorName || config.fallbackContractor,
    contractorCompany: report.contractorName || config.fallbackContractor,
    contractorTitle: "Contractor",
    engineerName: "Planovera imported test data",
    engineerOrg: "Project Engineer",
    engineerTitle: "Engineer",
    employerName: "Mogadishu Municipality",
    employerOrg: "Mogadishu Municipality",
    employerTitle: "Employer",
  };
};

export async function GET() {
  if (!fs.existsSync(BOQ_DIR) || !fs.existsSync(REPORT_DIR)) {
    return NextResponse.json(
      {
        error: `Import folders were not found under ${IMPORT_ROOT}.`,
      },
      { status: 404 }
    );
  }

  const importedAt = new Date().toISOString();
  const program: Program = {
    id: SURP2_PROGRAM_ID,
    name: "SURP2 - Mogadishu Municipality",
    code: "SURP2",
    description: "Local imported SURP2 Mogadishu road packages for workflow validation.",
    clientName: "Mogadishu Municipality",
    location: "Mogadishu, Banadir, Somalia",
    currency: "USD",
    budgetAmount: "",
    start_date: "2025-04-03",
    end_date: "2026-06-02",
    status: "active",
    created_at: importedAt,
    updated_at: importedAt,
  };

  const projects: Project[] = [];
  const savedBOQs: SavedBOQ[] = [];
  const savedWorkPlans: SavedWorkPlan[] = [];
  const progressReports = [];
  const certificates: PaymentCertificate[] = [];
  const previewPackages: Surp2ImportPreviewPackage[] = [];

  for (const config of PACKAGES) {
    const boqFileName = findMatchingFile(BOQ_DIR, config.fileToken, ".xlsx");
    const reportFileName = findMatchingFile(REPORT_DIR, config.reportToken, ".docx");
    const warnings: string[] = [];

    if (!boqFileName) warnings.push(`BOQ file containing "${config.fileToken}" was not found.`);
    if (!reportFileName) warnings.push(`Progress report containing "${config.reportToken}" was not found.`);

    const workbook = boqFileName
      ? parseWorkbook(path.join(BOQ_DIR, boqFileName), config)
      : { sheets: [], boqTotal: 0, warnings: ["BOQ workbook missing."] };
    const report = reportFileName
      ? parseReport(path.join(REPORT_DIR, reportFileName), config)
      : {
          contractTitle: config.fallbackTitle,
          contractorName: config.fallbackContractor,
          contractReference: "",
          contractSum: 0,
          startDate: "",
          commencementDate: "",
          completionDate: "",
          contractPeriod: "",
          actualProgress: 0,
          plannedProgress: 0,
          certifiedAmount: 0,
          paidAmount: 0,
          advancePayment: 0,
          warnings: ["Progress report missing."],
        };

    warnings.push(...workbook.warnings, ...report.warnings);

    const projectId = `surp2-project-package-${config.packageNumber}`;
    const boqId = `surp2-boq-package-${config.packageNumber}`;
    const boqName = `SURP2 Package ${config.packageNumber} Contractor BOQ`;

    projects.push({
      id: projectId,
      programId: SURP2_PROGRAM_ID,
      name: config.projectName,
      type: "construction",
      role: "supervision",
      created_at: importedAt,
      code: config.projectCode,
      categoryName: "Roads",
      contractNumber: report.contractReference || config.projectCode,
      clientName: "Mogadishu Municipality",
      contractorName: report.contractorName || config.fallbackContractor,
      consultantName: "UNOPS / SURP2 supervision team",
      location: config.location,
      region: config.region,
      town: config.town,
      latitude: config.latitude,
      longitude: config.longitude,
      contractTitle: report.contractTitle || config.fallbackTitle,
      contractAmount: formatAmount(workbook.boqTotal),
      currency: "USD",
      start_date: report.startDate || report.commencementDate || "2025-04-03",
      end_date: report.completionDate || "2026-06-02",
      documentBranding: {
        clientDisplayName: "Mogadishu Municipality",
        clientAddress: "Benadir Regional Administration\nMogadishu, Somalia",
        issuerDisplayName: "SURP2 Project Controls",
        issuerAddress: "Mogadishu, Somalia",
        headerTagline: "Somali Urban Resilience Project Phase II",
      },
    });

    savedBOQs.push({
      id: boqId,
      project_id: projectId,
      name: boqName,
      createdAt: importedAt,
      updatedAt: importedAt,
      sheets: workbook.sheets,
    });

    savedWorkPlans.push(makeWorkPlan(config, report, importedAt));
    progressReports.push(makeProgressReport(config, report, boqId, boqName, workbook.boqTotal, importedAt));
    certificates.push(makeCertificate(config, report, boqId, boqName, workbook.boqTotal, importedAt));

    previewPackages.push({
      packageNumber: config.packageNumber,
      projectName: config.projectName,
      boqFileName: boqFileName || "Missing",
      reportFileName: reportFileName || "Missing",
      boqTotal: workbook.boqTotal,
      reportContractSum: report.contractSum,
      variance: workbook.boqTotal - report.contractSum,
      contractorName: report.contractorName || config.fallbackContractor,
      plannedProgress: report.plannedProgress,
      actualProgress: report.actualProgress,
      warnings,
    });
  }

  const preview: Surp2ImportPreview = {
    importId: SURP2_IMPORT_ID,
    importedAt,
    programName: program.name,
    packageCount: previewPackages.length,
    totalBoqValue: previewPackages.reduce((sum, item) => sum + item.boqTotal, 0),
    warningCount: previewPackages.reduce((sum, item) => sum + item.warnings.length, 0),
    packages: previewPackages,
  };

  const payload: Surp2ImportPayload = {
    importId: SURP2_IMPORT_ID,
    importedAt,
    preview,
    programs: [program],
    projects,
    savedBOQs,
    savedWorkPlans,
    progressReports,
    certificates,
  };

  return NextResponse.json({ preview, payload });
}
