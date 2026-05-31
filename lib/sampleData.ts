import { v4 as uuid } from "uuid";
import type {
  BOQRow,
  PaymentCertificate,
  PaymentItem,
  Program,
  ProgressItem,
  ProgressReport,
  Project,
  ProjectCategory,
  SavedBOQ,
  SavedWorkPlan,
  WorkPlanActivity,
} from "@/lib/supabase";
import { DEFAULT_PROJECT_CATEGORIES, categorySlug } from "@/lib/projectCategories";
import {
  FINAL_CERTIFICATE_ID_PREFIX,
  FINAL_CERTIFICATE_IMPORT_ID,
  FINAL_CERTIFICATE_PROGRAM_ID,
  type FinalCertificateImportPayload,
  type FinalCertificateImportPreview,
} from "@/lib/finalCertificateImportTypes";
import {
  SURP2_IMPORT_ID,
  SURP2_PROGRAM_ID,
  type Surp2ImportPayload,
  type Surp2ImportPreview,
  type Surp2ImportPreviewPackage,
} from "@/lib/surp2ImportTypes";

const roadsCategoryId = "default-category-roads";
const drainageCategoryId = "default-category-drainage";

const amount = (qty: number, rate: number) => qty * rate;
const money = (value: number) => value.toFixed(2);
const pct = (value: number) => value.toFixed(2);

type RoadPackageSeed = {
  packageNumber: number;
  id: string;
  name: string;
  code: string;
  contractNumber: string;
  contractorName: string;
  location: string;
  latitude: string;
  longitude: string;
  plannedProgress: number;
  actualProgress: number;
  /** Scales the base bill quantities/lump sums so each package has a distinct contract value. */
  scale: number;
};

// Percentage added on the BOQ summary page, mirroring a real FIDIC-style bill of quantities.
const CONTINGENCY_PERCENT = 15;
const GOVERNMENT_TAX_PERCENT = 8;

type BillItemTemplate = {
  description: string;
  unit: string;
  qty: number;
  rate: number;
};

type BillTemplate = {
  billNo: string;
  title: string;
  /** Which detail sheet the bill is printed on. */
  sheet: "prelim" | "road";
  items: BillItemTemplate[];
};

// Reusable road-rehabilitation bill structure, modelled on a typical Mogadishu urban-roads
// contract BOQ (Preliminary & General + measured road and drainage bills). Quantities are the
// base values for scale = 1.0 and are scaled per package below.
const ROAD_BILL_TEMPLATES: BillTemplate[] = [
  {
    billNo: "1",
    title: "Preliminary & General",
    sheet: "prelim",
    items: [
      { description: "Mobilisation, site establishment and demobilisation", unit: "LS", qty: 1, rate: 45000 },
      { description: "Provision and maintenance of Engineer's site office and facilities", unit: "Month", qty: 6, rate: 2500 },
      { description: "Material testing and quality control (Provisional Sum)", unit: "PC Sum", qty: 1, rate: 40000 },
      { description: "Environmental, Social, Health & Safety (ESHS) management", unit: "LS", qty: 1, rate: 22000 },
      { description: "SEA/GBV prevention and community awareness training", unit: "LS", qty: 1, rate: 8000 },
      { description: "Traffic management, diversions and temporary signage", unit: "LS", qty: 1, rate: 18000 },
      { description: "As-built drawings and project close-out documentation", unit: "LS", qty: 1, rate: 6000 },
    ],
  },
  {
    billNo: "4",
    title: "Site Clearance",
    sheet: "road",
    items: [
      { description: "Clearing and grubbing of road reserve", unit: "m2", qty: 18000, rate: 1.2 },
      { description: "Removal and disposal of existing pavement and structures", unit: "m3", qty: 1200, rate: 9.5 },
      { description: "Relocation of existing services and utilities (Provisional)", unit: "LS", qty: 1, rate: 15000 },
    ],
  },
  {
    billNo: "5",
    title: "Earthworks",
    sheet: "road",
    items: [
      { description: "Excavation to formation level in all materials", unit: "m3", qty: 9500, rate: 7.5 },
      { description: "Fill and compaction with approved imported material", unit: "m3", qty: 7200, rate: 9.0 },
      { description: "Preparation and compaction of subgrade", unit: "m2", qty: 16000, rate: 1.8 },
    ],
  },
  {
    billNo: "8",
    title: "Culverts & Drainage",
    sheet: "road",
    items: [
      { description: "Excavation for drainage structures and pipe trenches", unit: "m3", qty: 1600, rate: 8.5 },
      { description: "Reinforced concrete box culverts, headwalls and wingwalls", unit: "m3", qty: 320, rate: 280 },
      { description: "Lined side drains and U-channels", unit: "m", qty: 2400, rate: 38 },
      { description: "Precast concrete pipe culverts, 600mm diameter", unit: "m", qty: 180, rate: 95 },
    ],
  },
  {
    billNo: "12",
    title: "Natural Gravel Sub-base & Base",
    sheet: "road",
    items: [
      { description: "Natural gravel sub-base, placed and compacted", unit: "m3", qty: 4200, rate: 28 },
      { description: "Crushed stone base course, placed and compacted", unit: "m3", qty: 3100, rate: 42 },
    ],
  },
  {
    billNo: "15",
    title: "Bituminous Surface Treatment",
    sheet: "road",
    items: [
      { description: "Prime coat to base course", unit: "m2", qty: 21000, rate: 1.6 },
      { description: "Tack coat between bituminous layers", unit: "m2", qty: 21000, rate: 0.9 },
    ],
  },
  {
    billNo: "16",
    title: "Bituminous Mix (Asphalt Concrete)",
    sheet: "road",
    items: [
      { description: "Asphalt concrete wearing course, 50mm compacted", unit: "m2", qty: 20500, rate: 22 },
      { description: "Asphalt concrete binder course, 60mm compacted", unit: "m2", qty: 20500, rate: 18 },
    ],
  },
  {
    billNo: "17",
    title: "Concrete Works",
    sheet: "road",
    items: [
      { description: "Precast concrete kerbs and channels", unit: "m", qty: 4200, rate: 16 },
      { description: "Reinforced concrete slabs, aprons and inlets", unit: "m3", qty: 140, rate: 240 },
    ],
  },
  {
    billNo: "20",
    title: "Road Furniture & Markings",
    sheet: "road",
    items: [
      { description: "Thermoplastic road markings and studs", unit: "m2", qty: 1800, rate: 22 },
      { description: "Road signs, posts and gantries", unit: "No.", qty: 60, rate: 380 },
      { description: "Steel guardrails and safety barriers", unit: "m", qty: 900, rate: 65 },
      { description: "Concrete walkways and pedestrian facilities", unit: "m2", qty: 3600, rate: 28 },
    ],
  },
  {
    billNo: "25",
    title: "Street Lighting (Provisional)",
    sheet: "road",
    items: [
      { description: "Supply and install solar street lighting (Provisional Sum)", unit: "No.", qty: 80, rate: 850 },
    ],
  },
  {
    billNo: "26",
    title: "Road Safety & Day Works",
    sheet: "road",
    items: [
      { description: "Community road safety awareness campaign", unit: "LS", qty: 1, rate: 12000 },
      { description: "Day works and contingency labour (Provisional)", unit: "Ps", qty: 1, rate: 15000 },
    ],
  },
];

type SeedBillItem = BillItemTemplate & { itemNo: string; lineAmount: number };

type SeedBill = {
  billNo: string;
  title: string;
  sheet: "prelim" | "road";
  items: SeedBillItem[];
  subtotal: number;
  currentPercent: number;
  plannedPercent: number;
};

const clampPercent = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

// Earlier bills (clearance, earthworks) are further along than later finishing trades
// (asphalt, furniture, lighting). Spread the package-level progress across the bills so the
// demo progress reports and certificates read like a real mid-contract snapshot.
const billProgress = (index: number, count: number, actualBase: number, plannedBase: number) => {
  const lead = count > 1 ? (count - 1 - index) / (count - 1) : 1; // 1 = first bill, 0 = last bill
  const offset = lead - 0.5; // +0.5 .. -0.5
  return {
    currentPercent: clampPercent(actualBase + offset * 55),
    plannedPercent: clampPercent(plannedBase + offset * 48),
  };
};

const buildSeedBills = (seed: RoadPackageSeed): SeedBill[] =>
  ROAD_BILL_TEMPLATES.map((template, billIndex) => {
    const items: SeedBillItem[] = template.items.map((item, itemIndex) => {
      const isLumpSum = item.qty <= 1;
      const qty = isLumpSum ? item.qty : Math.max(1, Math.round(item.qty * seed.scale));
      const rate = isLumpSum ? Math.round(item.rate * seed.scale) : item.rate;
      return {
        ...item,
        itemNo: `${template.billNo}.${String(itemIndex + 1).padStart(2, "0")}`,
        qty,
        rate,
        lineAmount: amount(qty, rate),
      };
    });
    const subtotal = items.reduce((sum, item) => sum + item.lineAmount, 0);
    const { currentPercent, plannedPercent } = billProgress(
      billIndex,
      ROAD_BILL_TEMPLATES.length,
      seed.actualProgress,
      seed.plannedProgress,
    );
    return { billNo: template.billNo, title: template.title, sheet: template.sheet, items, subtotal, currentPercent, plannedPercent };
  });

const packageBillSubtotal = (seed: RoadPackageSeed) =>
  buildSeedBills(seed).reduce((sum, bill) => sum + bill.subtotal, 0);

// Sub-total + 15% contingency + 8% government tax = "Total carried to Form of Bid".
const packageContractSum = (seed: RoadPackageSeed) => {
  const subtotal = packageBillSubtotal(seed);
  const afterContingency = subtotal * (1 + CONTINGENCY_PERCENT / 100);
  return afterContingency * (1 + GOVERNMENT_TAX_PERCENT / 100);
};

const roadPackages: RoadPackageSeed[] = [
  {
    packageNumber: 1,
    id: "surp2-project-package-1-daynile",
    name: "Package 1 - Daynile Road",
    code: "SURP2-MOG-PKG1",
    contractNumber: "SURP2/MOG/P1",
    contractorName: "Kulmiye General Service Limited",
    location: "Daynile District, Mogadishu",
    latitude: "2.1160",
    longitude: "45.2882",
    plannedProgress: 58,
    actualProgress: 47,
    scale: 0.8,
  },
  {
    packageNumber: 2,
    id: "surp2-project-package-2-madina-kahda",
    name: "Package 2 - Madina Hospital, Kalkaal & Kahda Roads",
    code: "SURP2-MOG-PKG2",
    contractNumber: "SURP2/MOG/P2",
    contractorName: "Docol Construction and Trading Company Limited",
    location: "Wadajir and Kahda Districts, Mogadishu",
    latitude: "2.0184",
    longitude: "45.2507",
    plannedProgress: 42,
    actualProgress: 35,
    scale: 1.05,
  },
  {
    packageNumber: 3,
    id: "surp2-project-package-3-hamarweyne",
    name: "Package 3 - Saddexda Geed, Nasiib Buundo & Hamarweyne Roads",
    code: "SURP2-MOG-PKG3",
    contractNumber: "SURP2/MOG/P3",
    contractorName: "Buruuj Construction and Real Estate",
    location: "Hamarweyne, Shangani, Shibis and Boondhere Districts, Mogadishu",
    latitude: "2.0390",
    longitude: "45.3420",
    plannedProgress: 61,
    actualProgress: 54,
    scale: 1.3,
  },
  {
    packageNumber: 4,
    id: "surp2-project-package-4-keysaney",
    name: "Package 4 - Keysaney Hospital Road",
    code: "SURP2-MOG-PKG4",
    contractNumber: "SURP2/MOG/P4",
    contractorName: "DHIS Contracting Company Ltd",
    location: "Kaaran District, Mogadishu",
    latitude: "2.0910",
    longitude: "45.3640",
    plannedProgress: 38,
    actualProgress: 30,
    scale: 1.0,
  },
];

// BOQ is split across three sheets: a summary page, the Preliminary & General bill, and the
// measured road & drainage bills (each with a header, line items and a bill sub-total).
const buildBoqSheets = (seed: RoadPackageSeed) => {
  const bills = buildSeedBills(seed);
  const billSubtotal = bills.reduce((sum, bill) => sum + bill.subtotal, 0);
  const contingency = (billSubtotal * CONTINGENCY_PERCENT) / 100;
  const afterContingency = billSubtotal + contingency;
  const governmentTax = (afterContingency * GOVERNMENT_TAX_PERCENT) / 100;
  const totalToBid = afterContingency + governmentTax;

  const summaryRows: BOQRow[] = [
    { id: `${seed.id}-sum-header`, type: "header", itemNo: "", description: "Bill of Quantities — Summary", unit: "", qty: "", rate: "", amount: "" },
    ...bills.map((bill) => ({
      id: `${seed.id}-sum-${bill.billNo}`,
      type: "item" as const,
      itemNo: bill.billNo,
      description: `Bill ${bill.billNo} — ${bill.title}`,
      unit: "",
      qty: "",
      rate: "",
      amount: money(bill.subtotal),
    })),
    { id: `${seed.id}-sum-subtotal-1`, type: "subtotal", itemNo: "", description: "Sub-Total (Carried from Bills)", unit: "", qty: "", rate: "", amount: money(billSubtotal) },
    { id: `${seed.id}-sum-contingency`, type: "item", itemNo: "", description: `Add: ${CONTINGENCY_PERCENT}% Contingency / Provisional Sums`, unit: "%", qty: "", rate: "", amount: money(contingency) },
    { id: `${seed.id}-sum-subtotal-2`, type: "subtotal", itemNo: "", description: "Sub-Total (after Contingency)", unit: "", qty: "", rate: "", amount: money(afterContingency) },
    { id: `${seed.id}-sum-tax`, type: "item", itemNo: "", description: `Add: ${GOVERNMENT_TAX_PERCENT}% Government Tax`, unit: "%", qty: "", rate: "", amount: money(governmentTax) },
    { id: `${seed.id}-sum-grandtotal`, type: "grandtotal", itemNo: "", description: "TOTAL CARRIED TO FORM OF BID", unit: "", qty: "", rate: "", amount: money(totalToBid) },
  ];

  const billToRows = (bill: SeedBill, prefix: string): BOQRow[] => [
    { id: `${seed.id}-${prefix}-${bill.billNo}-header`, type: "header", itemNo: bill.billNo, description: bill.title, unit: "", qty: "", rate: "", amount: "" },
    ...bill.items.map((item) => ({
      id: `${seed.id}-${prefix}-${item.itemNo}`,
      type: "item" as const,
      itemNo: item.itemNo,
      description: item.description,
      unit: item.unit,
      qty: money(item.qty),
      rate: money(item.rate),
      amount: money(item.lineAmount),
    })),
    { id: `${seed.id}-${prefix}-${bill.billNo}-subtotal`, type: "subtotal", itemNo: "", description: `Total — Bill ${bill.billNo} (${bill.title})`, unit: "", qty: "", rate: "", amount: money(bill.subtotal) },
  ];

  const prelimBills = bills.filter((bill) => bill.sheet === "prelim");
  const roadBills = bills.filter((bill) => bill.sheet === "road");
  const roadSubtotal = roadBills.reduce((sum, bill) => sum + bill.subtotal, 0);

  const prelimRows: BOQRow[] = prelimBills.flatMap((bill) => billToRows(bill, "prelim"));
  const roadRows: BOQRow[] = [
    ...roadBills.flatMap((bill) => billToRows(bill, "road")),
    { id: `${seed.id}-road-grandtotal`, type: "grandtotal", itemNo: "", description: "TOTAL — ROAD & DRAINAGE WORKS (to Summary)", unit: "", qty: "", rate: "", amount: money(roadSubtotal) },
  ];

  return [
    { id: `${seed.id}-boq-sheet-summary`, project_id: seed.id, name: "Summary", sort_order: 0, rows: summaryRows },
    { id: `${seed.id}-boq-sheet-prelim`, project_id: seed.id, name: "Bill 1 - Preliminary & General", sort_order: 1, rows: prelimRows },
    { id: `${seed.id}-boq-sheet-road`, project_id: seed.id, name: "Road & Drainage Works", sort_order: 2, rows: roadRows },
  ];
};

// Progress and payment are tracked at bill level (one line per bill) so the totals tie back to
// the BOQ bill sub-totals exactly.
const buildProgressItems = (seed: RoadPackageSeed): ProgressItem[] => {
  const bills = buildSeedBills(seed);
  const total = bills.reduce((sum, bill) => sum + bill.subtotal, 0);
  return bills.map((bill, index) => {
    const earned = (bill.subtotal * bill.currentPercent) / 100;
    return {
      id: `${seed.id}-progress-item-${index + 1}`,
      billNo: bill.billNo,
      description: `Bill ${bill.billNo} — ${bill.title}`,
      unit: "Sum",
      boqQty: "1.00",
      boqRate: money(bill.subtotal),
      boqAmount: money(bill.subtotal),
      previousQty: "0.00",
      currentQty: money(bill.currentPercent / 100),
      totalQty: money(bill.currentPercent / 100),
      earnedAmount: money(earned),
      weightPercent: total > 0 ? pct((bill.subtotal / total) * 100) : "0.00",
      plannedPercent: pct(bill.plannedPercent),
      actualPercent: pct(bill.currentPercent),
      variancePercent: pct(bill.currentPercent - bill.plannedPercent),
      status: bill.currentPercent >= 95 ? "completed" : bill.currentPercent > 0 ? "in-progress" : "not-started",
      remarks: bill.currentPercent >= bill.plannedPercent ? "Tracking to plan." : "Behind current planned progress.",
    };
  });
};

const buildCertificateItems = (seed: RoadPackageSeed): PaymentItem[] => {
  const bills = buildSeedBills(seed);
  return bills.map((bill, index) => {
    const totalAmount = (bill.subtotal * bill.currentPercent) / 100;
    return {
      id: `${seed.id}-payment-item-${index + 1}`,
      billNo: bill.billNo,
      description: `Bill ${bill.billNo} — ${bill.title}`,
      unit: "Sum",
      boqQty: "1.00",
      boqRate: money(bill.subtotal),
      boqAmount: money(bill.subtotal),
      previousQty: "0.00",
      currentQty: money(bill.currentPercent / 100),
      previousAmount: "0.00",
      currentAmount: money(totalAmount),
      totalQty: money(bill.currentPercent / 100),
      totalAmount: money(totalAmount),
      balanceQty: money(Math.max(0, 1 - bill.currentPercent / 100)),
      warningStatus: "ok",
      overrideNote: "",
    };
  });
};

const buildWorkPlanActivities = (seed: RoadPackageSeed): WorkPlanActivity[] => {
  const bills = buildSeedBills(seed);
  return [
    {
      id: `${seed.id}-wp-section`,
      project_id: seed.id,
      rowType: "section",
      description: "Road rehabilitation works",
      duration: "180",
      startDate: "2026-01-15",
      endDate: "2026-07-13",
      status: "in-progress",
    },
    ...bills.map((bill, index) => {
      const startMonth = Math.min(index + 1, 6);
      const endMonth = Math.min(index + 2, 7);
      return {
        id: `${seed.id}-wp-${index + 1}`,
        project_id: seed.id,
        rowType: "activity" as const,
        description: `Bill ${bill.billNo} — ${bill.title}`,
        duration: String(25 + index * 10),
        startDate: `2026-${String(startMonth).padStart(2, "0")}-15`,
        endDate: `2026-${String(endMonth).padStart(2, "0")}-14`,
        status: bill.currentPercent >= 95 ? ("completed" as const) : "in-progress" as const,
      };
    }),
  ];
};

export function buildRoadPackagesDemoPayload(): Surp2ImportPayload {
  const importedAt = new Date().toISOString();
  const program: Program = {
    id: SURP2_PROGRAM_ID,
    name: "Road Package Demo - Mogadishu",
    code: "ROAD-DEMO",
    description: "Four sample road packages for exploring Planovera portfolio, BOQ, progress, payment, work plan, and map workflows.",
    clientName: "Mogadishu Municipality",
    location: "Mogadishu, Somalia",
    currency: "USD",
    budgetAmount: money(roadPackages.reduce((sum, seed) => sum + packageContractSum(seed), 0)),
    start_date: "2026-01-15",
    end_date: "2026-07-31",
    status: "active",
    created_at: importedAt,
    updated_at: importedAt,
  };

  const projects: Project[] = roadPackages.map((seed) => {
    const contractAmount = packageContractSum(seed);
    return {
      id: seed.id,
      programId: SURP2_PROGRAM_ID,
      categoryId: roadsCategoryId,
      categoryName: "Roads",
      name: seed.name,
      type: "construction",
      role: "supervision",
      created_at: importedAt,
      code: seed.code,
      contractNumber: seed.contractNumber,
      clientName: "Mogadishu Municipality",
      contractorName: seed.contractorName,
      consultantName: "Planovera Demo Supervision Team",
      location: seed.location,
      region: "Banadir",
      town: "Mogadishu",
      latitude: seed.latitude,
      longitude: seed.longitude,
      contractTitle: `Road rehabilitation works for ${seed.name}`,
      currency: "USD",
      contractAmount: money(contractAmount),
      start_date: "2026-01-15",
      end_date: "2026-07-31",
      documentBranding: {
        clientDisplayName: "Mogadishu Municipality",
        issuerDisplayName: "Planovera Demo Supervision Team",
        headerTagline: "Road package sample data",
      },
    };
  });

  const savedBOQs: SavedBOQ[] = roadPackages.map((seed) => ({
    id: `${seed.id}-boq`,
    project_id: seed.id,
    name: "Contract BOQ - Demo",
    createdAt: importedAt,
    updatedAt: importedAt,
    sheets: buildBoqSheets(seed),
  }));

  const savedWorkPlans: SavedWorkPlan[] = roadPackages.map((seed) => ({
    id: `${seed.id}-work-plan`,
    project_id: seed.id,
    name: "Demo Work Plan",
    createdAt: importedAt,
    updatedAt: importedAt,
    sheets: [
      {
        id: `${seed.id}-work-plan-sheet`,
        name: "Road Works",
        sort_order: 0,
        activities: buildWorkPlanActivities(seed),
      },
    ],
  }));

  const progressReports = roadPackages.map((seed) => ({
    id: `${seed.id}-progress-001`,
    project_id: seed.id,
    number: 1,
    name: "Progress Report No. 1 - Demo",
    date: "2026-03-31",
    status: "approved" as const,
    sourceType: "boq" as const,
    inputMode: "percent" as const,
    weightMode: "boq-amount" as const,
    sourceId: `${seed.id}-boq`,
    sourceName: "Contract BOQ - Demo",
    createdAt: importedAt,
    updatedAt: importedAt,
    sheets: [
      {
        id: `${seed.id}-progress-sheet`,
        name: "Road Works",
        items: buildProgressItems(seed),
      },
    ],
  }));

  const certificates: PaymentCertificate[] = roadPackages.map((seed) => ({
    id: `${seed.id}-ipc-001`,
    project_id: seed.id,
    boqId: `${seed.id}-boq`,
    boqName: "Contract BOQ - Demo",
    number: 1,
    revision: 0,
    type: "interim",
    date: "2026-03-31",
    periodStart: "2026-03-01",
    periodEnd: "2026-03-31",
    status: "approved",
    locked: true,
    sheets: [{ id: `${seed.id}-ipc-sheet`, name: "Road Works", items: buildCertificateItems(seed) }],
    contingenciesPercent: CONTINGENCY_PERCENT,
    governmentTaxPercent: GOVERNMENT_TAX_PERCENT,
    retentionPercent: 10,
    advancePaymentPercent: 0,
    withholdingTaxPercent: 0,
    advancePaymentAmount: "0.00",
    advanceRecoveredPrevious: "0.00",
    advanceRecoveryCurrent: "0.00",
    retentionReleaseAmount: "0.00",
    adjustments: [],
    contractorName: "Project Manager",
    contractorCompany: seed.contractorName,
    contractorTitle: "Contractor Representative",
    engineerName: "Resident Engineer",
    engineerOrg: "Planovera Demo Supervision Team",
    engineerTitle: "Engineer",
    employerName: "Municipal Engineer",
    employerOrg: "Mogadishu Municipality",
    employerTitle: "Employer Representative",
  }));

  const previewPackages: Surp2ImportPreviewPackage[] = roadPackages.map((seed) => {
    const boqTotal = packageContractSum(seed);
    return {
      packageNumber: seed.packageNumber,
      projectName: seed.name,
      boqFileName: "Built-in sample",
      reportFileName: "Built-in sample",
      boqTotal,
      reportContractSum: boqTotal,
      variance: 0,
      contractorName: seed.contractorName,
      plannedProgress: seed.plannedProgress,
      actualProgress: seed.actualProgress,
      warnings: [],
    };
  });
  const preview: Surp2ImportPreview = {
    importId: SURP2_IMPORT_ID,
    importedAt,
    programName: program.name,
    packageCount: roadPackages.length,
    totalBoqValue: previewPackages.reduce((sum, item) => sum + item.boqTotal, 0),
    warningCount: 0,
    packages: previewPackages,
  };

  return {
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
}

export function buildFinalCertificateDemoPayload(): FinalCertificateImportPayload {
  const importedAt = new Date().toISOString();
  const projectId = `${FINAL_CERTIFICATE_ID_PREFIX}project-target`;
  const boqId = `${FINAL_CERTIFICATE_ID_PREFIX}boq-target`;
  const rows = [
    { itemNo: "1.1", description: "Storm drainage cleaning, debris removal, disposal, and reinstatement", unit: "m", qty: 8200, rate: 20.5, pct: 100 },
    { itemNo: "1.2", description: "Condition assessment, inspection reporting, and technical recommendations", unit: "LS", qty: 1, rate: 46914.56, pct: 100 },
    { itemNo: "1.3", description: "Drainage cover slabs, safety gear, survey, and final close-out works", unit: "LS", qty: 1, rate: 101315.33, pct: 100 },
  ];
  const revisedContractSum = rows.reduce((sum, row) => sum + amount(row.qty, row.rate), 0);
  const retentionReleaseAmount = revisedContractSum * 0.05;
  const program: Program = {
    id: FINAL_CERTIFICATE_PROGRAM_ID,
    name: "Final Certificate Demo - Storm Drainage",
    code: "FINAL-DEMO",
    description: "Sample project for testing IPC carry-forward and final payment certificate retention release.",
    clientName: "Banadir Regional Administration",
    location: "Mogadishu, Somalia",
    currency: "USD",
    budgetAmount: money(revisedContractSum),
    start_date: "2024-09-15",
    end_date: "2026-03-31",
    status: "completed",
    created_at: importedAt,
    updated_at: importedAt,
  };
  const project: Project = {
    id: projectId,
    programId: FINAL_CERTIFICATE_PROGRAM_ID,
    categoryId: drainageCategoryId,
    categoryName: "Drainage",
    name: "Storm Drainage Cleaning and Condition Assessment",
    type: "construction",
    role: "supervision",
    created_at: importedAt,
    code: "DRAINAGE-FINAL-DEMO",
    contractNumber: "SO-MM-415200-CW-RFB",
    clientName: "Banadir Regional Administration",
    contractorName: "Target General Services Ltd",
    consultantName: "Planovera Demo Supervision Team",
    location: "Hamarweyne, Shangani, Hodan, Abdi Aziz, Hamar-Jajab and Bondhere Districts",
    region: "Banadir",
    town: "Mogadishu",
    latitude: "2.0469",
    longitude: "45.3182",
    contractTitle: "Clearing and conditional assessment for storm drainage lines",
    currency: "USD",
    contractAmount: money(revisedContractSum),
    start_date: "2024-09-15",
    end_date: "2026-03-31",
    documentBranding: {
      clientDisplayName: "Banadir Regional Administration",
      issuerDisplayName: "Planovera Demo Supervision Team",
      headerTagline: "Final certificate sample",
    },
  };
  const boqRows: BOQRow[] = [
    { id: `${projectId}-boq-header`, type: "header", itemNo: "1", description: "Storm drainage works", unit: "", qty: "", rate: "", amount: "" },
    ...rows.map((row, index) => ({
      id: `${projectId}-boq-row-${index + 1}`,
      type: "item" as const,
      itemNo: row.itemNo,
      description: row.description,
      unit: row.unit,
      qty: money(row.qty),
      rate: money(row.rate),
      amount: money(amount(row.qty, row.rate)),
    })),
    { id: `${projectId}-boq-grandtotal`, type: "grandtotal", itemNo: "", description: "GRAND TOTAL", unit: "", qty: "", rate: "", amount: money(revisedContractSum) },
  ];
  const paymentItems: PaymentItem[] = rows.map((row, index) => ({
    id: `${projectId}-payment-item-${index + 1}`,
    billNo: row.itemNo,
    description: row.description,
    unit: row.unit,
    boqQty: money(row.qty),
    boqRate: money(row.rate),
    boqAmount: money(amount(row.qty, row.rate)),
    previousQty: money(row.qty),
    currentQty: "0.00",
    previousAmount: money(amount(row.qty, row.rate)),
    currentAmount: "0.00",
    totalQty: money(row.qty),
    totalAmount: money(amount(row.qty, row.rate)),
    balanceQty: "0.00",
    warningStatus: "ok",
    overrideNote: "",
  }));
  const lastIpcNetDue = revisedContractSum * 0.85;
  const lastIpcThisCertificate = revisedContractSum * 0.2;
  const certificates: PaymentCertificate[] = [
    {
      id: `${FINAL_CERTIFICATE_ID_PREFIX}ipc-005`,
      project_id: projectId,
      boqId,
      boqName: "Revised Contract BOQ - Demo",
      number: 5,
      revision: 0,
      type: "interim",
      date: "2026-01-31",
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31",
      status: "paid",
      locked: true,
      sheets: [{ id: `${projectId}-ipc-sheet`, name: "Storm Drainage", items: paymentItems }],
      contingenciesPercent: 0,
      governmentTaxPercent: 0,
      retentionPercent: 10,
      advancePaymentPercent: 0,
      withholdingTaxPercent: 0,
      advancePaymentAmount: "0.00",
      advanceRecoveredPrevious: "0.00",
      advanceRecoveryCurrent: "0.00",
      retentionReleaseAmount: "0.00",
      adjustments: [],
      contractorName: "Authorized Representative",
      contractorCompany: "Target General Services Ltd",
      contractorTitle: "Contractor",
      engineerName: "Resident Engineer",
      engineerOrg: "Planovera Demo Supervision Team",
      engineerTitle: "Engineer",
      employerName: "Employer Representative",
      employerOrg: "Banadir Regional Administration",
      employerTitle: "Employer",
    },
    {
      id: `${FINAL_CERTIFICATE_ID_PREFIX}final-certificate`,
      project_id: projectId,
      boqId,
      boqName: "Revised Contract BOQ - Demo",
      number: 6,
      revision: 0,
      type: "final",
      date: "2026-03-31",
      periodStart: "2026-03-01",
      periodEnd: "2026-03-31",
      status: "draft",
      previousCertificateId: `${FINAL_CERTIFICATE_ID_PREFIX}ipc-005`,
      locked: false,
      sheets: [{ id: `${projectId}-final-sheet`, name: "Final Account", items: paymentItems.map((item) => ({ ...item, id: `${item.id}-final`, currentAmount: "0.00", currentQty: "0.00" })) }],
      contingenciesPercent: 0,
      governmentTaxPercent: 0,
      retentionPercent: 10,
      advancePaymentPercent: 0,
      withholdingTaxPercent: 0,
      advancePaymentAmount: "0.00",
      advanceRecoveredPrevious: "0.00",
      advanceRecoveryCurrent: "0.00",
      retentionReleaseAmount: money(retentionReleaseAmount),
      finalAccountNote: "Final certificate demo releases the remaining retention balance after completion.",
      adjustments: [
        {
          id: `${projectId}-retention-release`,
          label: "Release remaining retention",
          type: "addition",
          category: "other",
          amount: money(retentionReleaseAmount),
          note: "Released after taking-over and final account reconciliation.",
        },
      ],
      contractorName: "Authorized Representative",
      contractorCompany: "Target General Services Ltd",
      contractorTitle: "Contractor",
      engineerName: "Resident Engineer",
      engineerOrg: "Planovera Demo Supervision Team",
      engineerTitle: "Engineer",
      employerName: "Employer Representative",
      employerOrg: "Banadir Regional Administration",
      employerTitle: "Employer",
    },
  ];
  const savedBOQs: SavedBOQ[] = [
    {
      id: boqId,
      project_id: projectId,
      name: "Revised Contract BOQ - Demo",
      createdAt: importedAt,
      updatedAt: importedAt,
      sheets: [{ id: `${projectId}-boq-sheet`, project_id: projectId, name: "Storm Drainage", sort_order: 0, rows: boqRows }],
    },
  ];
  const savedWorkPlans: SavedWorkPlan[] = [
    {
      id: `${projectId}-work-plan`,
      project_id: projectId,
      name: "Final Close-Out Work Plan",
      createdAt: importedAt,
      updatedAt: importedAt,
      sheets: [
        {
          id: `${projectId}-work-plan-sheet`,
          name: "Close-Out",
          sort_order: 0,
          activities: [
            { id: `${projectId}-wp-1`, project_id: projectId, rowType: "section", description: "Taking-over, DLP, and final account", duration: "90", startDate: "2026-01-01", endDate: "2026-03-31", status: "completed" },
            { id: `${projectId}-wp-2`, project_id: projectId, rowType: "activity", description: "Complete final inspection, snag closure, and final account reconciliation", duration: "30", startDate: "2026-03-01", endDate: "2026-03-31", status: "completed" },
          ],
        },
      ],
    },
  ];
  const progressReports = [
    {
      id: `${projectId}-progress-final`,
      project_id: projectId,
      number: 5,
      name: "Final Progress Position",
      date: "2026-03-31",
      status: "approved" as const,
      sourceType: "boq" as const,
      inputMode: "percent" as const,
      weightMode: "boq-amount" as const,
      sourceId: boqId,
      sourceName: "Revised Contract BOQ - Demo",
      createdAt: importedAt,
      updatedAt: importedAt,
      sheets: [
        {
          id: `${projectId}-progress-sheet`,
          name: "Storm Drainage",
          items: rows.map((row, index) => ({
            id: `${projectId}-progress-item-${index + 1}`,
            billNo: row.itemNo,
            description: row.description,
            unit: row.unit,
            boqQty: money(row.qty),
            boqRate: money(row.rate),
            boqAmount: money(amount(row.qty, row.rate)),
            previousQty: "0.00",
            currentQty: money(row.qty),
            totalQty: money(row.qty),
            earnedAmount: money(amount(row.qty, row.rate)),
            weightPercent: pct((amount(row.qty, row.rate) / revisedContractSum) * 100),
            plannedPercent: "100.00",
            actualPercent: "100.00",
            variancePercent: "0.00",
            status: "completed" as const,
            remarks: "Works completed and ready for final certificate reconciliation.",
          })),
        },
      ],
    },
  ];
  const preview: FinalCertificateImportPreview = {
    importId: FINAL_CERTIFICATE_IMPORT_ID,
    importedAt,
    projectName: project.name,
    contractNumber: project.contractNumber || "",
    contractorName: project.contractorName || "",
    boqFileName: "Built-in sample",
    ipcFileName: "Built-in sample",
    takingOverFileName: "Built-in sample",
    revisedContractSum,
    boqGrandTotal: revisedContractSum,
    lastIpcThisCertificate,
    lastIpcNetDue,
    retentionReleaseAmount,
    finalNetPayable: retentionReleaseAmount,
    warnings: [],
  };

  return {
    importId: FINAL_CERTIFICATE_IMPORT_ID,
    importedAt,
    preview,
    programs: [program],
    projects: [project],
    savedBOQs,
    savedWorkPlans,
    progressReports,
    certificates,
  };
}

/**
 * A fully de-sentinelized copy of a sample workspace, ready to be persisted as
 * the signed-in user's own owned records (auth mode) or merged into local
 * Zustand state (demo mode). Every primary id is a fresh UUID and every
 * cross-reference (programId / project_id / previousCertificateId) is rewired
 * to match, so adopting the same sample twice never collides.
 */
export interface AdoptableWorkspace {
  programs: Program[];
  categories: ProjectCategory[];
  projects: Project[];
  savedBOQs: SavedBOQ[];
  savedWorkPlans: SavedWorkPlan[];
  progressReports: ProgressReport[];
  certificates: PaymentCertificate[];
}

/**
 * Convert a built-in sample payload (which uses stable sentinel ids like
 * `surp2-...` / `final-cert-...`) into adoptable records with fresh UUIDs.
 *
 * The sample payloads carry no category rows, so we synthesize one real
 * category per distinct `categoryName` on the projects — satisfying the
 * project's `category_id` FK when the project is written to Supabase.
 */
export function remintAdoptableWorkspace(
  payload: Surp2ImportPayload | FinalCertificateImportPayload,
): AdoptableWorkspace {
  const now = new Date().toISOString();

  // Consistent id remapping: the same original id always maps to the same
  // fresh UUID regardless of call order, which keeps cross-references intact.
  const idMap = new Map<string, string>();
  const remap = (id: string): string => {
    const existing = idMap.get(id);
    if (existing) return existing;
    const fresh = uuid();
    idMap.set(id, fresh);
    return fresh;
  };

  // Deep-clone (detaching from the shared sample object) while rewiring every
  // reference field. Nested entity ids (BOQ rows, work-plan activities, payment
  // items) live inside JSON payload columns and reference nothing, so they are
  // left untouched.
  const referenceKeys = new Set(["project_id", "programId", "previousCertificateId"]);
  const remapReferences = <T,>(value: T): T =>
    JSON.parse(
      JSON.stringify(value, (key, val) =>
        referenceKeys.has(key) && typeof val === "string" && val ? remap(val) : val,
      ),
    ) as T;

  // One synthesized category per distinct categoryName.
  const categoryByName = new Map<string, ProjectCategory>();
  const resolveCategoryId = (project: Project): string | undefined => {
    const name = (project.categoryName || "").trim();
    if (!name) return undefined;
    const key = name.toLowerCase();
    const existing = categoryByName.get(key);
    if (existing) return existing.id;
    const meta = DEFAULT_PROJECT_CATEGORIES.find(
      (category) => category.name.toLowerCase() === key,
    );
    const category: ProjectCategory = {
      id: uuid(),
      name,
      code: meta?.code || categorySlug(name).slice(0, 12).toUpperCase() || "GEN",
      description: meta?.description || "",
      color: meta?.color || "#3b82f6",
      status: "active",
      created_at: now,
    };
    categoryByName.set(key, category);
    return category.id;
  };

  const programs = payload.programs.map((program) => ({
    ...remapReferences(program),
    id: remap(program.id),
    created_at: now,
    updated_at: now,
  }));

  const projects = payload.projects.map((project) => {
    const categoryId = resolveCategoryId(project);
    return {
      ...remapReferences(project),
      id: remap(project.id),
      categoryId: categoryId ?? project.categoryId,
      created_at: now,
    };
  });

  const categories = Array.from(categoryByName.values());

  const savedBOQs = payload.savedBOQs.map((boq) => ({
    ...remapReferences(boq),
    id: remap(boq.id),
  }));

  const savedWorkPlans = payload.savedWorkPlans.map((workPlan) => ({
    ...remapReferences(workPlan),
    id: remap(workPlan.id),
  }));

  const progressReports = payload.progressReports.map((report) => ({
    ...remapReferences(report),
    id: remap(report.id),
  }));

  const certificates = payload.certificates.map((certificate) => ({
    ...remapReferences(certificate),
    id: remap(certificate.id),
  }));

  return {
    programs,
    categories,
    projects,
    savedBOQs,
    savedWorkPlans,
    progressReports,
    certificates,
  };
}
