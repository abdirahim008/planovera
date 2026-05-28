import type {
  BOQRow,
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
  rows: Array<{
    itemNo: string;
    description: string;
    unit: string;
    qty: number;
    rate: number;
    currentPercent: number;
    plannedPercent: number;
  }>;
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
    rows: [
      { itemNo: "A.1", description: "Mobilization, site establishment, traffic management, and temporary facilities", unit: "LS", qty: 1, rate: 145000, currentPercent: 100, plannedPercent: 100 },
      { itemNo: "B.1", description: "Earthworks, excavation, formation preparation, and disposal of unsuitable material", unit: "m3", qty: 2200, rate: 18, currentPercent: 82, plannedPercent: 90 },
      { itemNo: "C.1", description: "Sub-base and base course pavement layers including compaction and testing", unit: "m3", qty: 1600, rate: 46, currentPercent: 52, plannedPercent: 64 },
      { itemNo: "D.1", description: "Asphalt surfacing, prime coat, tack coat, and road markings", unit: "m2", qty: 11800, rate: 16, currentPercent: 24, plannedPercent: 45 },
    ],
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
    rows: [
      { itemNo: "A.1", description: "General requirements, mobilization, engineer facilities, and health and safety provisions", unit: "LS", qty: 1, rate: 180000, currentPercent: 100, plannedPercent: 100 },
      { itemNo: "B.1", description: "Drainage excavation, culvert installation, side drains, and outfall connections", unit: "m", qty: 1850, rate: 92, currentPercent: 48, plannedPercent: 58 },
      { itemNo: "C.1", description: "Granular pavement layers including selected fill, sub-base, base course, and compaction", unit: "m3", qty: 2650, rate: 44, currentPercent: 36, plannedPercent: 46 },
      { itemNo: "D.1", description: "Bituminous surfacing, shoulders, kerbs, signage, and road furniture", unit: "m2", qty: 14600, rate: 17.5, currentPercent: 18, plannedPercent: 28 },
    ],
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
    rows: [
      { itemNo: "A.1", description: "Preliminaries, site management, temporary works, and stakeholder coordination", unit: "LS", qty: 1, rate: 210000, currentPercent: 100, plannedPercent: 100 },
      { itemNo: "B.1", description: "Road widening, demolition, scarification, and roadbed preparation", unit: "m2", qty: 21500, rate: 4.2, currentPercent: 75, plannedPercent: 82 },
      { itemNo: "C.1", description: "Drainage structures, manholes, chambers, and reinforced concrete culvert works", unit: "LS", qty: 1, rate: 320000, currentPercent: 42, plannedPercent: 56 },
      { itemNo: "D.1", description: "Asphalt concrete wearing course, road markings, safety barriers, and signs", unit: "m2", qty: 18600, rate: 18.4, currentPercent: 35, plannedPercent: 48 },
    ],
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
    rows: [
      { itemNo: "A.1", description: "Mobilization, site clearance, traffic diversions, and site offices", unit: "LS", qty: 1, rate: 132000, currentPercent: 100, plannedPercent: 100 },
      { itemNo: "B.1", description: "Drainage clearing, culvert reconstruction, and flood protection works", unit: "m", qty: 1240, rate: 115, currentPercent: 44, plannedPercent: 55 },
      { itemNo: "C.1", description: "Pavement rehabilitation including sub-base repairs, base course, and compaction", unit: "m2", qty: 14200, rate: 9.8, currentPercent: 25, plannedPercent: 34 },
      { itemNo: "D.1", description: "Asphalt surfacing, kerbs, road markings, street furniture, and handover works", unit: "m2", qty: 10800, rate: 17.2, currentPercent: 12, plannedPercent: 22 },
    ],
  },
];

const buildBoqRows = (seed: RoadPackageSeed): BOQRow[] => {
  const itemRows = seed.rows.map((row, index) => ({
    id: `${seed.id}-boq-row-${index + 1}`,
    type: "item" as const,
    itemNo: row.itemNo,
    description: row.description,
    unit: row.unit,
    qty: money(row.qty),
    rate: money(row.rate),
    amount: money(amount(row.qty, row.rate)),
  }));
  const total = itemRows.reduce((sum, row) => sum + Number(row.amount), 0);
  return [
    {
      id: `${seed.id}-boq-header-1`,
      type: "header",
      itemNo: "1",
      description: "Road rehabilitation works",
      unit: "",
      qty: "",
      rate: "",
      amount: "",
    },
    ...itemRows,
    {
      id: `${seed.id}-boq-subtotal-1`,
      type: "subtotal",
      itemNo: "",
      description: "Sub Total - Road rehabilitation works",
      unit: "",
      qty: "",
      rate: "",
      amount: money(total),
    },
    {
      id: `${seed.id}-boq-grandtotal`,
      type: "grandtotal",
      itemNo: "",
      description: "GRAND TOTAL",
      unit: "",
      qty: "",
      rate: "",
      amount: money(total),
    },
  ];
};

const buildProgressItems = (seed: RoadPackageSeed): ProgressItem[] => {
  const total = seed.rows.reduce((sum, row) => sum + amount(row.qty, row.rate), 0);
  return seed.rows.map((row, index) => {
    const boqAmount = amount(row.qty, row.rate);
    const totalQty = (row.qty * row.currentPercent) / 100;
    return {
      id: `${seed.id}-progress-item-${index + 1}`,
      billNo: row.itemNo,
      description: row.description,
      unit: row.unit,
      boqQty: money(row.qty),
      boqRate: money(row.rate),
      boqAmount: money(boqAmount),
      previousQty: "0.00",
      currentQty: money(totalQty),
      totalQty: money(totalQty),
      earnedAmount: money(totalQty * row.rate),
      weightPercent: pct((boqAmount / total) * 100),
      plannedPercent: pct(row.plannedPercent),
      actualPercent: pct(row.currentPercent),
      variancePercent: pct(row.currentPercent - row.plannedPercent),
      status: row.currentPercent >= 95 ? "completed" : row.currentPercent > 0 ? "in-progress" : "not-started",
      remarks: row.currentPercent >= row.plannedPercent ? "Tracking to plan." : "Behind current planned progress.",
    };
  });
};

const buildCertificateItems = (seed: RoadPackageSeed): PaymentItem[] =>
  seed.rows.map((row, index) => {
    const boqAmount = amount(row.qty, row.rate);
    const totalQty = (row.qty * row.currentPercent) / 100;
    const totalAmount = totalQty * row.rate;
    return {
      id: `${seed.id}-payment-item-${index + 1}`,
      billNo: row.itemNo,
      description: row.description,
      unit: row.unit,
      boqQty: money(row.qty),
      boqRate: money(row.rate),
      boqAmount: money(boqAmount),
      previousQty: "0.00",
      currentQty: money(totalQty),
      previousAmount: "0.00",
      currentAmount: money(totalAmount),
      totalQty: money(totalQty),
      totalAmount: money(totalAmount),
      balanceQty: money(Math.max(0, row.qty - totalQty)),
      warningStatus: "ok",
      overrideNote: "",
    };
  });

const buildWorkPlanActivities = (seed: RoadPackageSeed): WorkPlanActivity[] => [
  {
    id: `${seed.id}-wp-section`,
    project_id: seed.id,
    rowType: "section",
    description: "Road rehabilitation works",
    duration: "120",
    startDate: "2026-01-15",
    endDate: "2026-05-14",
    status: "in-progress",
  },
  ...seed.rows.map((row, index) => ({
    id: `${seed.id}-wp-${index + 1}`,
    project_id: seed.id,
    rowType: "activity" as const,
    description: row.description,
    duration: String(20 + index * 14),
    startDate: `2026-0${Math.min(index + 1, 5)}-15`,
    endDate: `2026-0${Math.min(index + 2, 6)}-14`,
    status: row.currentPercent >= 95 ? "completed" as const : "in-progress" as const,
  })),
];

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
    budgetAmount: money(
      roadPackages.reduce(
        (sum, seed) => sum + seed.rows.reduce((rowSum, row) => rowSum + amount(row.qty, row.rate), 0),
        0,
      ),
    ),
    start_date: "2026-01-15",
    end_date: "2026-07-31",
    status: "active",
    created_at: importedAt,
    updated_at: importedAt,
  };

  const projects: Project[] = roadPackages.map((seed) => {
    const contractAmount = seed.rows.reduce((sum, row) => sum + amount(row.qty, row.rate), 0);
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
    sheets: [
      {
        id: `${seed.id}-boq-sheet`,
        project_id: seed.id,
        name: "Road Works",
        sort_order: 0,
        rows: buildBoqRows(seed),
      },
    ],
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
    const boqTotal = seed.rows.reduce((sum, row) => sum + amount(row.qty, row.rate), 0);
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
