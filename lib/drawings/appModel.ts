import type { Page, TitleBlockData } from "./fabricHelpers";
import {
  createBeamDetailSvg,
  createDoorBlockSvg,
  createWallOpeningSvg,
  createWindowBlockSvg,
} from "./parametricBlocks";

export type UserRole = "admin" | "engineer";

export interface UserSession {
  id?: string;
  email?: string;
  name: string;
  company: string;
  role: UserRole;
}

export interface ProfileRecord {
  id: string;
  email: string;
  full_name: string | null;
  company: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export type LibraryCategory =
  | "layouts"
  | "structural"
  | "mechanical"
  | "electrical"
  | "civil"
  | "details";

export interface LibraryItem {
  id: string;
  name: string;
  category: LibraryCategory;
  description: string;
  tags: string[];
  svg: string;
  source: "seed" | "admin" | "personal";
  assetType?: "object" | "drawing";
  author: string;
  updatedAt: string;
}

export interface SavedProject {
  id: string;
  ownerId?: string;
  linkedProjectId?: string | null;
  linkedProjectName?: string | null;
  name: string;
  owner: string;
  updatedAt: string;
  pages: Page[];
}

export interface ProjectRecord {
  id: string;
  owner_id: string;
  linked_project_id?: string | null;
  linked_project_name?: string | null;
  name: string;
  pages: Page[];
  created_at: string;
  updated_at: string;
}

export interface LibraryItemRecord {
  id: string;
  name: string;
  category: LibraryCategory;
  description: string;
  tags: string[] | null;
  svg: string;
  author_id: string | null;
  author_name: string | null;
  updated_at: string;
}

export interface SvgTemplate {
  id: string;
  name: string;
  category: LibraryCategory;
  description: string;
  svg: string;
}

export const LIBRARY_CATEGORIES: Array<{
  id: LibraryCategory;
  label: string;
}> = [
  { id: "layouts", label: "Layouts" },
  { id: "structural", label: "Structural" },
  { id: "mechanical", label: "Mechanical" },
  { id: "electrical", label: "Electrical" },
  { id: "civil", label: "Civil" },
  { id: "details", label: "Details" },
];

export const STORAGE_KEYS = {
  session: "drawflow-session",
  library: "drawflow-library",
  projects: "drawflow-projects",
} as const;

const nowIso = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);

const svgDoc = (viewBox: string, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" fill="none">${body}</svg>`;

const createRcColumnDetailSvg = (input: {
  title: string;
  widthMm: number;
  depthMm: number;
  cornerBarDiaMm: number;
  cornerBarCount: number;
  sideBarCount?: number;
  tieDiaMm: number;
}) => {
  const width = 164;
  const height = Math.max(164, Math.round((input.depthMm / Math.max(input.widthMm, 1)) * 164));
  const offsetX = 78;
  const offsetY = 54;
  const tieInset = 16;
  const barRadius = 7;
  const bars: string[] = [];
  const sideBarCount = input.sideBarCount ?? 0;
  const left = offsetX + 18;
  const right = offsetX + width - 18;
  const top = offsetY + 18;
  const bottom = offsetY + height - 18;

  bars.push(`<circle cx="${left}" cy="${top}" r="${barRadius}" fill="#0f172a"/>`);
  bars.push(`<circle cx="${right}" cy="${top}" r="${barRadius}" fill="#0f172a"/>`);
  bars.push(`<circle cx="${left}" cy="${bottom}" r="${barRadius}" fill="#0f172a"/>`);
  bars.push(`<circle cx="${right}" cy="${bottom}" r="${barRadius}" fill="#0f172a"/>`);

  if (sideBarCount > 0) {
    for (let index = 1; index <= sideBarCount; index += 1) {
      const ratio = index / (sideBarCount + 1);
      const sideY = top + (bottom - top) * ratio;
      bars.push(`<circle cx="${left}" cy="${sideY}" r="${barRadius - 1}" fill="#ef4444"/>`);
      bars.push(`<circle cx="${right}" cy="${sideY}" r="${barRadius - 1}" fill="#ef4444"/>`);
    }
  }

  return svgDoc(
    `0 0 360 ${Math.max(330, offsetY + height + 110)}`,
    `
      <line x1="${offsetX}" y1="${offsetY - 20}" x2="${offsetX + width}" y2="${offsetY - 20}" stroke="#ff4fa3" stroke-width="3"/>
      <line x1="${offsetX}" y1="${offsetY - 34}" x2="${offsetX}" y2="${offsetY - 6}" stroke="#ff4fa3" stroke-width="3"/>
      <line x1="${offsetX + width}" y1="${offsetY - 34}" x2="${offsetX + width}" y2="${offsetY - 6}" stroke="#ff4fa3" stroke-width="3"/>
      <text x="${offsetX + width / 2}" y="${offsetY - 28}" text-anchor="middle" font-family="Arial" font-size="12" fill="#ff4fa3">${(input.widthMm / 1000).toFixed(2)}</text>
      <line x1="${offsetX - 24}" y1="${offsetY}" x2="${offsetX - 24}" y2="${offsetY + height}" stroke="#ff4fa3" stroke-width="3"/>
      <line x1="${offsetX - 38}" y1="${offsetY}" x2="${offsetX - 10}" y2="${offsetY}" stroke="#ff4fa3" stroke-width="3"/>
      <line x1="${offsetX - 38}" y1="${offsetY + height}" x2="${offsetX - 10}" y2="${offsetY + height}" stroke="#ff4fa3" stroke-width="3"/>
      <text x="${offsetX - 30}" y="${offsetY + height / 2}" transform="rotate(-90 ${offsetX - 30} ${offsetY + height / 2})" text-anchor="middle" font-family="Arial" font-size="12" fill="#ff4fa3">${(input.depthMm / 1000).toFixed(2)}</text>
      <rect x="${offsetX}" y="${offsetY}" width="${width}" height="${height}" fill="#f8fafc" stroke="#0f172a" stroke-width="4"/>
      <rect x="${offsetX + tieInset}" y="${offsetY + tieInset}" width="${width - tieInset * 2}" height="${height - tieInset * 2}" rx="12" stroke="#111827" stroke-width="4"/>
      ${bars.join("")}
      <text x="${offsetX + width + 28}" y="${offsetY + 56}" font-family="Arial" font-size="12" fill="#0f172a">${input.cornerBarCount} No. ${input.cornerBarDiaMm}</text>
      <text x="${offsetX + width + 28}" y="${offsetY + 74}" font-family="Arial" font-size="12" fill="#0f172a">ties ${input.tieDiaMm} dia</text>
      <text x="${180}" y="${offsetY + height + 34}" text-anchor="middle" font-family="Arial" font-size="16" font-weight="700" fill="#0f172a">${input.title}</text>
      <text x="${180}" y="${offsetY + height + 52}" text-anchor="middle" font-family="Arial" font-size="12" fill="#0f172a">DETAIL</text>
    `,
  );
};

const createStripFootingDetailSvg = () =>
  svgDoc(
    "0 0 520 340",
    `
      <line x1="86" y1="48" x2="434" y2="48" stroke="#ff4fa3" stroke-width="3"/>
      <line x1="86" y1="34" x2="86" y2="62" stroke="#ff4fa3" stroke-width="3"/>
      <line x1="434" y1="34" x2="434" y2="62" stroke="#ff4fa3" stroke-width="3"/>
      <text x="260" y="40" text-anchor="middle" font-family="Arial" font-size="12" fill="#ff4fa3">0.80</text>
      <rect x="86" y="188" width="348" height="72" fill="#f8fafc" stroke="#0f172a" stroke-width="4"/>
      <rect x="196" y="108" width="128" height="80" fill="#ffffff" stroke="#0f172a" stroke-width="4"/>
      <path d="M122 230 H398" stroke="#ef4444" stroke-width="4"/>
      <path d="M122 246 H398" stroke="#f59e0b" stroke-width="4"/>
      <path d="M196 188 L168 258 M324 188 L352 258" stroke="#0f172a" stroke-width="3"/>
      <text x="346" y="132" font-family="Arial" font-size="12" fill="#0f172a">pedestal</text>
      <text x="346" y="150" font-family="Arial" font-size="12" fill="#0f172a">starter bars</text>
      <text x="260" y="304" text-anchor="middle" font-family="Arial" font-size="16" font-weight="700" fill="#0f172a">STRIP FOOTING DETAIL</text>
    `,
  );

const createGradeBeamSectionSvg = () =>
  svgDoc(
    "0 0 420 300",
    `
      <line x1="104" y1="40" x2="316" y2="40" stroke="#ff4fa3" stroke-width="3"/>
      <line x1="104" y1="26" x2="104" y2="54" stroke="#ff4fa3" stroke-width="3"/>
      <line x1="316" y1="26" x2="316" y2="54" stroke="#ff4fa3" stroke-width="3"/>
      <text x="210" y="32" text-anchor="middle" font-family="Arial" font-size="12" fill="#ff4fa3">0.30</text>
      <line x1="80" y1="64" x2="80" y2="236" stroke="#ff4fa3" stroke-width="3"/>
      <line x1="66" y1="64" x2="94" y2="64" stroke="#ff4fa3" stroke-width="3"/>
      <line x1="66" y1="236" x2="94" y2="236" stroke="#ff4fa3" stroke-width="3"/>
      <text x="72" y="150" transform="rotate(-90 72 150)" text-anchor="middle" font-family="Arial" font-size="12" fill="#ff4fa3">0.60</text>
      <rect x="104" y="64" width="212" height="172" fill="#f8fafc" stroke="#0f172a" stroke-width="4"/>
      <rect x="126" y="86" width="168" height="128" rx="14" stroke="#0f172a" stroke-width="4"/>
      <circle cx="148" cy="108" r="8" fill="#ef4444"/>
      <circle cx="272" cy="108" r="8" fill="#ef4444"/>
      <circle cx="148" cy="192" r="8" fill="#ef4444"/>
      <circle cx="272" cy="192" r="8" fill="#ef4444"/>
      <circle cx="210" cy="108" r="7" fill="#111827"/>
      <circle cx="210" cy="192" r="7" fill="#111827"/>
      <text x="210" y="274" text-anchor="middle" font-family="Arial" font-size="16" font-weight="700" fill="#0f172a">GRADE BEAM SECTION</text>
    `,
  );

const createRebarElevationSvg = () =>
  svgDoc(
    "0 0 660 280",
    `
      <rect x="180" y="46" width="56" height="176" fill="#ffffff" stroke="#0f172a" stroke-width="4"/>
      <rect x="424" y="46" width="56" height="176" fill="#ffffff" stroke="#0f172a" stroke-width="4"/>
      <line x1="208" y1="58" x2="208" y2="210" stroke="#0f172a" stroke-width="5"/>
      <line x1="452" y1="58" x2="452" y2="210" stroke="#0f172a" stroke-width="5"/>
      <line x1="226" y1="80" x2="434" y2="80" stroke="#ef4444" stroke-width="4"/>
      <line x1="226" y1="110" x2="434" y2="110" stroke="#ef4444" stroke-width="4"/>
      <line x1="226" y1="140" x2="434" y2="140" stroke="#ef4444" stroke-width="4"/>
      <line x1="226" y1="170" x2="434" y2="170" stroke="#ef4444" stroke-width="4"/>
      <line x1="226" y1="200" x2="434" y2="200" stroke="#ef4444" stroke-width="4"/>
      <line x1="160" y1="46" x2="160" y2="222" stroke="#ff4fa3" stroke-width="3"/>
      <line x1="146" y1="46" x2="174" y2="46" stroke="#ff4fa3" stroke-width="3"/>
      <line x1="146" y1="222" x2="174" y2="222" stroke="#ff4fa3" stroke-width="3"/>
      <text x="152" y="134" transform="rotate(-90 152 134)" text-anchor="middle" font-family="Arial" font-size="12" fill="#ff4fa3">1.80</text>
      <text x="330" y="252" text-anchor="middle" font-family="Arial" font-size="16" font-weight="700" fill="#0f172a">REBAR ELEVATION DETAIL</text>
      <text x="500" y="92" font-family="Arial" font-size="12" fill="#0f172a">5 links @ 150 c/c</text>
      <text x="500" y="112" font-family="Arial" font-size="12" fill="#0f172a">4Y16 longitudinal</text>
    `,
  );

export function createDefaultTitleBlockData(index = 1): TitleBlockData {
  return {
    projectTitle: "ENGINEERING PACKAGE",
    client: "CLIENT / EMPLOYER",
    drawingTitle: "GENERAL ARRANGEMENT",
    drawingNo: `DRW-${String(index).padStart(3, "0")}`,
    revision: "A",
    scale: "AS SHOWN",
    date: today(),
    drawnBy: "",
    checkedBy: "",
    sheet: `${index} of ${index}`,
  };
}

export function createBlankPage(index = 1): Page {
  return {
    id: `page-${Math.random().toString(36).slice(2, 10)}`,
    name: `Sheet ${index}`,
    paperSize: "a3",
    orientation: "landscape",
    titleBlockData: createDefaultTitleBlockData(index),
  };
}

export const DETAIL_BLOCKS: SvgTemplate[] = [
  {
    id: "north-arrow",
    name: "North Arrow",
    category: "details",
    description: "Site plan north arrow marker.",
    svg: svgDoc(
      "0 0 120 120",
      `
        <circle cx="60" cy="60" r="42" stroke="#0f172a" stroke-width="4"/>
        <path d="M60 18 L78 72 L60 60 L42 72 Z" fill="#0f172a"/>
        <line x1="60" y1="24" x2="60" y2="92" stroke="#0f172a" stroke-width="4"/>
        <text x="60" y="108" text-anchor="middle" font-family="Arial" font-size="16" fill="#0f172a">N</text>
      `,
    ),
  },
  {
    id: "grid-bubble",
    name: "Grid Bubble",
    category: "details",
    description: "Grid reference marker for plans and sections.",
    svg: svgDoc(
      "0 0 140 60",
      `
        <line x1="12" y1="30" x2="128" y2="30" stroke="#0f172a" stroke-width="3"/>
        <circle cx="32" cy="30" r="18" fill="#ffffff" stroke="#0f172a" stroke-width="3"/>
        <circle cx="108" cy="30" r="18" fill="#ffffff" stroke="#0f172a" stroke-width="3"/>
        <text x="32" y="36" text-anchor="middle" font-family="Arial" font-size="18" fill="#0f172a">A</text>
        <text x="108" y="36" text-anchor="middle" font-family="Arial" font-size="18" fill="#0f172a">1</text>
      `,
    ),
  },
  {
    id: "section-callout",
    name: "Section Callout",
    category: "details",
    description: "Section or detail cut symbol.",
    svg: svgDoc(
      "0 0 180 90",
      `
        <line x1="24" y1="44" x2="156" y2="44" stroke="#0f172a" stroke-width="3" stroke-dasharray="12 6"/>
        <path d="M48 18 L24 44 L48 70" stroke="#0f172a" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="132" cy="44" r="22" fill="#ffffff" stroke="#0f172a" stroke-width="3"/>
        <text x="132" y="51" text-anchor="middle" font-family="Arial" font-size="18" fill="#0f172a">A-A</text>
      `,
    ),
  },
  {
    id: "room-tag",
    name: "Room Tag",
    category: "details",
    description: "Quick room or equipment tag label.",
    svg: svgDoc(
      "0 0 200 90",
      `
        <rect x="16" y="16" width="168" height="58" rx="10" fill="#ffffff" stroke="#0f172a" stroke-width="3"/>
        <text x="100" y="42" text-anchor="middle" font-family="Arial" font-size="16" fill="#334155">ROOM</text>
        <text x="100" y="62" text-anchor="middle" font-family="Arial" font-size="20" font-weight="700" fill="#0f172a">R-101</text>
      `,
    ),
  },
];

export const ADMIN_SVG_TEMPLATES: SvgTemplate[] = [
  {
    id: "process-skid",
    name: "Process Skid",
    category: "mechanical",
    description: "Packaged equipment skid with pipework and pump set.",
    svg: svgDoc(
      "0 0 600 320",
      `
        <rect x="52" y="60" width="496" height="184" rx="10" stroke="#0f172a" stroke-width="4"/>
        <rect x="82" y="88" width="132" height="96" rx="12" fill="#e2e8f0" stroke="#0f172a" stroke-width="3"/>
        <circle cx="148" cy="138" r="28" fill="#cbd5e1" stroke="#0f172a" stroke-width="3"/>
        <rect x="254" y="90" width="108" height="88" rx="8" fill="#e2e8f0" stroke="#0f172a" stroke-width="3"/>
        <rect x="396" y="90" width="112" height="118" rx="8" fill="#f8fafc" stroke="#0f172a" stroke-width="3"/>
        <path d="M214 138 H254 M362 138 H396" stroke="#0f172a" stroke-width="8" stroke-linecap="round"/>
        <path d="M508 138 H548" stroke="#0f172a" stroke-width="8" stroke-linecap="round"/>
        <path d="M548 138 V208 H480" stroke="#0f172a" stroke-width="8" stroke-linecap="round"/>
        <circle cx="478" cy="208" r="16" fill="#ffffff" stroke="#0f172a" stroke-width="4"/>
        <text x="300" y="278" text-anchor="middle" font-family="Arial" font-size="24" font-weight="700" fill="#0f172a">PROCESS SKID</text>
      `,
    ),
  },
  {
    id: "office-layout",
    name: "Office Layout",
    category: "layouts",
    description: "Starter plan with rooms, circulation, and furniture blocks.",
    svg: svgDoc(
      "0 0 720 420",
      `
        <rect x="28" y="28" width="664" height="364" fill="#ffffff" stroke="#0f172a" stroke-width="6"/>
        <line x1="240" y1="28" x2="240" y2="392" stroke="#0f172a" stroke-width="4"/>
        <line x1="470" y1="28" x2="470" y2="392" stroke="#0f172a" stroke-width="4"/>
        <line x1="28" y1="180" x2="692" y2="180" stroke="#0f172a" stroke-width="4"/>
        <path d="M240 276 H322 M322 276 A42 42 0 0 1 280 318" stroke="#0f172a" stroke-width="4" stroke-linecap="round"/>
        <path d="M470 110 H552 M552 110 A42 42 0 0 1 510 152" stroke="#0f172a" stroke-width="4" stroke-linecap="round"/>
        <rect x="86" y="76" width="98" height="56" rx="6" fill="#e2e8f0" stroke="#0f172a" stroke-width="3"/>
        <rect x="308" y="76" width="88" height="56" rx="6" fill="#e2e8f0" stroke="#0f172a" stroke-width="3"/>
        <rect x="542" y="238" width="84" height="110" rx="6" fill="#f1f5f9" stroke="#0f172a" stroke-width="3"/>
        <circle cx="584" cy="288" r="24" fill="#ffffff" stroke="#0f172a" stroke-width="3"/>
        <text x="130" y="166" text-anchor="middle" font-family="Arial" font-size="20" fill="#0f172a">OFFICE</text>
        <text x="354" y="166" text-anchor="middle" font-family="Arial" font-size="20" fill="#0f172a">MEETING</text>
        <text x="580" y="166" text-anchor="middle" font-family="Arial" font-size="20" fill="#0f172a">STORE</text>
        <text x="354" y="340" text-anchor="middle" font-family="Arial" font-size="20" fill="#0f172a">OPEN WORKSPACE</text>
      `,
    ),
  },
  {
    id: "structural-bay",
    name: "Structural Bay",
    category: "structural",
    description: "Steel frame bay with columns, beam line, and bracing.",
    svg: svgDoc(
      "0 0 620 360",
      `
        <line x1="110" y1="296" x2="110" y2="74" stroke="#0f172a" stroke-width="12" stroke-linecap="round"/>
        <line x1="510" y1="296" x2="510" y2="74" stroke="#0f172a" stroke-width="12" stroke-linecap="round"/>
        <line x1="98" y1="86" x2="522" y2="86" stroke="#0f172a" stroke-width="12" stroke-linecap="round"/>
        <line x1="136" y1="272" x2="484" y2="110" stroke="#1d4ed8" stroke-width="8" stroke-linecap="round"/>
        <line x1="484" y1="272" x2="136" y2="110" stroke="#1d4ed8" stroke-width="8" stroke-linecap="round"/>
        <rect x="72" y="296" width="76" height="26" fill="#cbd5e1" stroke="#0f172a" stroke-width="3"/>
        <rect x="472" y="296" width="76" height="26" fill="#cbd5e1" stroke="#0f172a" stroke-width="3"/>
        <text x="310" y="336" text-anchor="middle" font-family="Arial" font-size="24" font-weight="700" fill="#0f172a">FRAME BAY</text>
      `,
    ),
  },
];

export const SEED_LIBRARY_ITEMS: LibraryItem[] = [
  {
    id: "seed-office-layout",
    name: "Office Layout Starter",
    category: "layouts",
    description: "General arrangement starter for office and facilities planning.",
    tags: ["plan", "layout", "rooms", "office"],
    svg: ADMIN_SVG_TEMPLATES[1].svg,
    source: "seed",
    author: "System Library",
    updatedAt: "2026-04-24T09:00:00.000Z",
  },
  {
    id: "seed-process-skid",
    name: "Process Skid Block",
    category: "mechanical",
    description: "Editable mechanical package with pipe route and equipment bay.",
    tags: ["mechanical", "pump", "equipment", "process"],
    svg: ADMIN_SVG_TEMPLATES[0].svg,
    source: "seed",
    author: "System Library",
    updatedAt: "2026-04-24T09:00:00.000Z",
  },
  {
    id: "seed-structural-bay",
    name: "Structural Bay",
    category: "structural",
    description: "Structural framing bay for general arrangement and detailing.",
    tags: ["steel", "frame", "bay", "bracing"],
    svg: ADMIN_SVG_TEMPLATES[2].svg,
    source: "seed",
    author: "System Library",
    updatedAt: "2026-04-24T09:00:00.000Z",
  },
  {
    id: "seed-road-crossing",
    name: "Road Crossing Detail",
    category: "civil",
    description: "Trench, sleeve, and carriageway crossing starter detail.",
    tags: ["civil", "road", "trench", "crossing"],
    svg: svgDoc(
      "0 0 660 260",
      `
        <rect x="28" y="66" width="604" height="92" fill="#e2e8f0" stroke="#0f172a" stroke-width="4"/>
        <path d="M66 112 H592" stroke="#475569" stroke-width="4" stroke-dasharray="18 12"/>
        <rect x="214" y="158" width="232" height="58" fill="#f8fafc" stroke="#0f172a" stroke-width="4"/>
        <rect x="240" y="178" width="180" height="18" rx="8" fill="#cbd5e1" stroke="#0f172a" stroke-width="3"/>
        <path d="M180 158 L180 224 M480 158 L480 224" stroke="#0f172a" stroke-width="3" stroke-dasharray="10 8"/>
        <text x="330" y="44" text-anchor="middle" font-family="Arial" font-size="24" fill="#0f172a">ROAD CROSSING DETAIL</text>
      `,
    ),
    source: "seed",
    author: "System Library",
    updatedAt: "2026-04-24T09:00:00.000Z",
  },
  {
    id: "seed-single-line",
    name: "Electrical Single Line Starter",
    category: "electrical",
    description: "Single line starter with source, protection, and feeder branches.",
    tags: ["electrical", "sld", "switchboard", "power"],
    svg: svgDoc(
      "0 0 660 320",
      `
        <circle cx="92" cy="160" r="40" fill="#ffffff" stroke="#0f172a" stroke-width="4"/>
        <text x="92" y="168" text-anchor="middle" font-family="Arial" font-size="18" fill="#0f172a">GEN</text>
        <line x1="132" y1="160" x2="250" y2="160" stroke="#0f172a" stroke-width="6"/>
        <rect x="250" y="128" width="106" height="64" fill="#f8fafc" stroke="#0f172a" stroke-width="4"/>
        <text x="303" y="168" text-anchor="middle" font-family="Arial" font-size="16" fill="#0f172a">MAIN MDB</text>
        <line x1="356" y1="160" x2="528" y2="160" stroke="#0f172a" stroke-width="6"/>
        <line x1="430" y1="160" x2="430" y2="92" stroke="#0f172a" stroke-width="4"/>
        <line x1="430" y1="160" x2="430" y2="232" stroke="#0f172a" stroke-width="4"/>
        <rect x="380" y="48" width="100" height="42" fill="#ffffff" stroke="#0f172a" stroke-width="3"/>
        <rect x="380" y="230" width="100" height="42" fill="#ffffff" stroke="#0f172a" stroke-width="3"/>
        <rect x="528" y="138" width="92" height="44" fill="#ffffff" stroke="#0f172a" stroke-width="3"/>
        <text x="430" y="75" text-anchor="middle" font-family="Arial" font-size="14" fill="#0f172a">LDB-A</text>
        <text x="430" y="257" text-anchor="middle" font-family="Arial" font-size="14" fill="#0f172a">LDB-B</text>
        <text x="574" y="165" text-anchor="middle" font-family="Arial" font-size="14" fill="#0f172a">MCC</text>
      `,
    ),
    source: "seed",
    author: "System Library",
    updatedAt: "2026-04-24T09:00:00.000Z",
  },
  {
    id: "seed-rc-beam-400",
    name: "RC Beam Detail 400 x 400",
    category: "structural",
    description: "Parametric reinforced concrete beam with editable bars and stirrup callout.",
    tags: ["beam", "reinforcement", "rebar", "stirrups", "concrete"],
    svg: createBeamDetailSvg({
      widthMm: 400,
      depthMm: 400,
      topBars: 2,
      bottomBars: 3,
      barDiaMm: 16,
      stirrupDiaMm: 8,
      stirrupSpacingMm: 150,
    }),
    source: "seed",
    assetType: "object",
    author: "System Library",
    updatedAt: "2026-04-24T09:00:00.000Z",
  },
  {
    id: "seed-rc-beam-200",
    name: "RC Beam Detail 200 x 200",
    category: "structural",
    description: "Compact beam detail preset that can be regenerated with new dimensions.",
    tags: ["beam", "reinforcement", "rebar", "200x200", "concrete"],
    svg: createBeamDetailSvg({
      widthMm: 200,
      depthMm: 200,
      topBars: 2,
      bottomBars: 2,
      barDiaMm: 12,
      stirrupDiaMm: 8,
      stirrupSpacingMm: 150,
    }),
    source: "seed",
    assetType: "object",
    author: "System Library",
    updatedAt: "2026-04-24T09:00:00.000Z",
  },
  {
    id: "seed-wall-door-900",
    name: "Wall With 900 Door Opening",
    category: "layouts",
    description: "Wall segment with hosted door opening and swing already aligned.",
    tags: ["wall", "door", "opening", "architectural", "plan"],
    svg: createWallOpeningSvg({
      wallLengthMm: 3600,
      wallThicknessMm: 200,
      openingType: "door",
      openingWidthMm: 900,
      openingOffsetMm: 1350,
    }),
    source: "seed",
    assetType: "object",
    author: "System Library",
    updatedAt: "2026-04-24T09:00:00.000Z",
  },
  {
    id: "seed-wall-window-1200",
    name: "Wall With 1200 Window",
    category: "layouts",
    description: "Wall segment with hosted window opening placed into the wall run.",
    tags: ["wall", "window", "opening", "architectural", "plan"],
    svg: createWallOpeningSvg({
      wallLengthMm: 4200,
      wallThicknessMm: 200,
      openingType: "window",
      openingWidthMm: 1200,
      openingOffsetMm: 1500,
    }),
    source: "seed",
    assetType: "object",
    author: "System Library",
    updatedAt: "2026-04-24T09:00:00.000Z",
  },
  {
    id: "seed-door-block-900",
    name: "Door Block 900",
    category: "layouts",
    description: "Standard single door block with wall cut and swing symbol.",
    tags: ["door", "wall", "opening", "architectural"],
    svg: createDoorBlockSvg(900),
    source: "seed",
    assetType: "object",
    author: "System Library",
    updatedAt: "2026-04-24T09:00:00.000Z",
  },
  {
    id: "seed-window-block-1200",
    name: "Window Block 1200",
    category: "layouts",
    description: "Standard window block embedded in a wall segment.",
    tags: ["window", "wall", "opening", "architectural"],
    svg: createWindowBlockSvg(1200),
    source: "seed",
    assetType: "object",
    author: "System Library",
    updatedAt: "2026-04-24T09:00:00.000Z",
  },
  {
    id: "seed-column-tie-detail",
    name: "RC Column Tie Detail",
    category: "structural",
    description: "Column section with corner bars, side bars, and closed tie.",
    tags: ["column", "rebar", "ties", "concrete", "structural"],
    svg: svgDoc(
      "0 0 360 360",
      `
        <rect x="70" y="54" width="220" height="220" fill="#ffffff" stroke="#0f172a" stroke-width="5"/>
        <rect x="96" y="80" width="168" height="168" rx="14" stroke="#64748b" stroke-width="8" stroke-dasharray="14 10"/>
        <circle cx="112" cy="96" r="14" fill="#0f172a"/>
        <circle cx="248" cy="96" r="14" fill="#0f172a"/>
        <circle cx="112" cy="232" r="14" fill="#0f172a"/>
        <circle cx="248" cy="232" r="14" fill="#0f172a"/>
        <circle cx="180" cy="96" r="11" fill="#0f172a"/>
        <circle cx="180" cy="232" r="11" fill="#0f172a"/>
        <text x="180" y="318" text-anchor="middle" font-family="Arial" font-size="20" font-weight="700" fill="#0f172a">300 x 300 COLUMN</text>
      `,
    ),
    source: "seed",
    assetType: "object",
    author: "System Library",
    updatedAt: "2026-04-24T09:00:00.000Z",
  },
  {
    id: "seed-column-c1-150x300",
    name: "RC Column C1 150 x 300",
    category: "structural",
    description: "Ready-to-use narrow reinforced concrete column detail with ties and bar note.",
    tags: ["column", "rebar", "c1", "150x300", "detail", "concrete"],
    svg: createRcColumnDetailSvg({
      title: "COLUMNA C1",
      widthMm: 150,
      depthMm: 300,
      cornerBarDiaMm: 12,
      cornerBarCount: 4,
      sideBarCount: 1,
      tieDiaMm: 8,
    }),
    source: "seed",
    assetType: "object",
    author: "System Library",
    updatedAt: "2026-04-29T11:00:00.000Z",
  },
  {
    id: "seed-column-c2-150x150",
    name: "RC Column C2 150 x 150",
    category: "structural",
    description: "Compact square column block for quick structural layout and section callouts.",
    tags: ["column", "rebar", "c2", "150x150", "square", "detail"],
    svg: createRcColumnDetailSvg({
      title: "COLUMNA C2",
      widthMm: 150,
      depthMm: 150,
      cornerBarDiaMm: 12,
      cornerBarCount: 4,
      tieDiaMm: 8,
    }),
    source: "seed",
    assetType: "object",
    author: "System Library",
    updatedAt: "2026-04-29T11:00:00.000Z",
  },
  {
    id: "seed-grade-beam-section-300x600",
    name: "Grade Beam Section 300 x 600",
    category: "structural",
    description: "Starter grade beam section with closed link and longitudinal bars.",
    tags: ["beam", "grade beam", "rebar", "section", "300x600", "concrete"],
    svg: createGradeBeamSectionSvg(),
    source: "seed",
    assetType: "object",
    author: "System Library",
    updatedAt: "2026-04-29T11:00:00.000Z",
  },
  {
    id: "seed-isolated-footing",
    name: "Isolated Footing Detail",
    category: "structural",
    description: "Footing and pedestal section with bottom reinforcement mat.",
    tags: ["footing", "foundation", "rebar", "concrete", "section"],
    svg: svgDoc(
      "0 0 620 360",
      `
        <rect x="80" y="226" width="460" height="72" fill="#e2e8f0" stroke="#0f172a" stroke-width="5"/>
        <rect x="245" y="86" width="130" height="140" fill="#ffffff" stroke="#0f172a" stroke-width="5"/>
        <line x1="112" y1="258" x2="508" y2="258" stroke="#0f172a" stroke-width="4" stroke-dasharray="18 12"/>
        <line x1="122" y1="280" x2="498" y2="280" stroke="#0f172a" stroke-width="4" stroke-dasharray="18 12"/>
        <path d="M245 226 L204 298 M375 226 L416 298" stroke="#64748b" stroke-width="4"/>
        <text x="310" y="44" text-anchor="middle" font-family="Arial" font-size="22" font-weight="700" fill="#0f172a">ISOLATED FOOTING</text>
      `,
    ),
    source: "seed",
    assetType: "drawing",
    author: "System Library",
    updatedAt: "2026-04-24T09:00:00.000Z",
  },
  {
    id: "seed-strip-footing-detail",
    name: "Strip Footing Detail",
    category: "structural",
    description: "Continuous footing section with pedestal and two bottom reinforcement runs.",
    tags: ["footing", "strip footing", "foundation", "rebar", "section", "concrete"],
    svg: createStripFootingDetailSvg(),
    source: "seed",
    assetType: "drawing",
    author: "System Library",
    updatedAt: "2026-04-29T11:00:00.000Z",
  },
  {
    id: "seed-slab-rebar-zone",
    name: "Slab Rebar Zone",
    category: "structural",
    description: "Editable slab panel reinforcement zone with two-way bars.",
    tags: ["slab", "mesh", "rebar", "concrete", "layout"],
    svg: svgDoc(
      "0 0 520 360",
      `
        <rect x="56" y="48" width="408" height="244" fill="#ffffff" stroke="#0f172a" stroke-width="5"/>
        <path d="M96 72 V268 M146 72 V268 M196 72 V268 M246 72 V268 M296 72 V268 M346 72 V268 M396 72 V268" stroke="#2563eb" stroke-width="4"/>
        <path d="M80 96 H440 M80 146 H440 M80 196 H440 M80 246 H440" stroke="#0f172a" stroke-width="3" stroke-dasharray="14 10"/>
        <text x="260" y="326" text-anchor="middle" font-family="Arial" font-size="20" font-weight="700" fill="#0f172a">SLAB REBAR ZONE</text>
      `,
    ),
    source: "seed",
    assetType: "object",
    author: "System Library",
    updatedAt: "2026-04-24T09:00:00.000Z",
  },
  {
    id: "seed-rebar-elevation-detail",
    name: "Rebar Elevation Detail",
    category: "structural",
    description: "Vertical reinforcement elevation block with links and longitudinal bar note.",
    tags: ["rebar", "elevation", "stirrups", "links", "structural", "detail"],
    svg: createRebarElevationSvg(),
    source: "seed",
    assetType: "drawing",
    author: "System Library",
    updatedAt: "2026-04-29T11:00:00.000Z",
  },
  {
    id: "seed-drainage-channel",
    name: "Drainage Channel Section",
    category: "civil",
    description: "Open concrete channel section with side slopes and water level.",
    tags: ["civil", "drainage", "channel", "section", "water"],
    svg: svgDoc(
      "0 0 560 300",
      `
        <path d="M98 70 L188 236 H372 L462 70" fill="#f8fafc" stroke="#0f172a" stroke-width="5" stroke-linejoin="round"/>
        <path d="M162 160 H398" stroke="#2563eb" stroke-width="4" stroke-dasharray="16 10"/>
        <path d="M188 236 H372" stroke="#64748b" stroke-width="8"/>
        <text x="280" y="44" text-anchor="middle" font-family="Arial" font-size="22" font-weight="700" fill="#0f172a">DRAINAGE CHANNEL</text>
      `,
    ),
    source: "seed",
    assetType: "drawing",
    author: "System Library",
    updatedAt: "2026-04-24T09:00:00.000Z",
  },
  {
    id: "seed-manhole-section",
    name: "Manhole Section",
    category: "civil",
    description: "Inspection chamber with cover slab, wall, benching, and pipe inverts.",
    tags: ["manhole", "chamber", "civil", "pipe", "section"],
    svg: svgDoc(
      "0 0 520 380",
      `
        <rect x="152" y="72" width="216" height="238" fill="#ffffff" stroke="#0f172a" stroke-width="5"/>
        <rect x="126" y="48" width="268" height="34" fill="#e2e8f0" stroke="#0f172a" stroke-width="4"/>
        <path d="M152 260 Q260 314 368 260" fill="#e2e8f0" stroke="#0f172a" stroke-width="4"/>
        <circle cx="130" cy="248" r="26" fill="#ffffff" stroke="#0f172a" stroke-width="4"/>
        <circle cx="390" cy="248" r="26" fill="#ffffff" stroke="#0f172a" stroke-width="4"/>
        <line x1="46" y1="248" x2="104" y2="248" stroke="#0f172a" stroke-width="8"/>
        <line x1="416" y1="248" x2="474" y2="248" stroke="#0f172a" stroke-width="8"/>
        <text x="260" y="350" text-anchor="middle" font-family="Arial" font-size="21" font-weight="700" fill="#0f172a">MANHOLE SECTION</text>
      `,
    ),
    source: "seed",
    assetType: "drawing",
    author: "System Library",
    updatedAt: "2026-04-24T09:00:00.000Z",
  },
  {
    id: "seed-valve-chamber",
    name: "Valve Chamber Plan",
    category: "mechanical",
    description: "Plan block for chamber, flanged valve, pipe centerline, and access cover.",
    tags: ["valve", "chamber", "pipe", "mechanical", "water"],
    svg: svgDoc(
      "0 0 560 320",
      `
        <rect x="72" y="58" width="416" height="204" fill="#ffffff" stroke="#0f172a" stroke-width="5"/>
        <line x1="42" y1="160" x2="518" y2="160" stroke="#0f172a" stroke-width="9"/>
        <circle cx="280" cy="160" r="42" fill="#ffffff" stroke="#0f172a" stroke-width="5"/>
        <path d="M244 132 L316 188 M316 132 L244 188" stroke="#2563eb" stroke-width="6"/>
        <rect x="112" y="88" width="96" height="56" rx="8" fill="#e2e8f0" stroke="#0f172a" stroke-width="4"/>
        <text x="280" y="296" text-anchor="middle" font-family="Arial" font-size="21" font-weight="700" fill="#0f172a">VALVE CHAMBER PLAN</text>
      `,
    ),
    source: "seed",
    assetType: "drawing",
    author: "System Library",
    updatedAt: "2026-04-24T09:00:00.000Z",
  },
  {
    id: "seed-electrical-lighting-grid",
    name: "Lighting Layout Starter",
    category: "electrical",
    description: "Room lighting grid with switch drop and circuit path.",
    tags: ["lighting", "electrical", "layout", "switch", "ceiling"],
    svg: svgDoc(
      "0 0 600 380",
      `
        <rect x="56" y="52" width="488" height="260" fill="#ffffff" stroke="#0f172a" stroke-width="5"/>
        <circle cx="170" cy="130" r="24" fill="#ffffff" stroke="#0f172a" stroke-width="4"/>
        <circle cx="300" cy="130" r="24" fill="#ffffff" stroke="#0f172a" stroke-width="4"/>
        <circle cx="430" cy="130" r="24" fill="#ffffff" stroke="#0f172a" stroke-width="4"/>
        <circle cx="170" cy="236" r="24" fill="#ffffff" stroke="#0f172a" stroke-width="4"/>
        <circle cx="300" cy="236" r="24" fill="#ffffff" stroke="#0f172a" stroke-width="4"/>
        <circle cx="430" cy="236" r="24" fill="#ffffff" stroke="#0f172a" stroke-width="4"/>
        <path d="M170 130 H430 V236 H170 Z" stroke="#2563eb" stroke-width="3" stroke-dasharray="12 10"/>
        <rect x="68" y="174" width="34" height="40" fill="#ffffff" stroke="#0f172a" stroke-width="3"/>
        <text x="300" y="352" text-anchor="middle" font-family="Arial" font-size="21" font-weight="700" fill="#0f172a">LIGHTING LAYOUT</text>
      `,
    ),
    source: "seed",
    assetType: "drawing",
    author: "System Library",
    updatedAt: "2026-04-24T09:00:00.000Z",
  },
  {
    id: "seed-pipe-support",
    name: "Pipe Support Detail",
    category: "mechanical",
    description: "Pipe saddle support with base plate and anchor bolts.",
    tags: ["pipe", "support", "saddle", "mechanical", "detail"],
    svg: svgDoc(
      "0 0 520 320",
      `
        <circle cx="260" cy="104" r="54" fill="#ffffff" stroke="#0f172a" stroke-width="6"/>
        <path d="M202 166 Q260 214 318 166" fill="#e2e8f0" stroke="#0f172a" stroke-width="5"/>
        <rect x="214" y="202" width="92" height="54" fill="#ffffff" stroke="#0f172a" stroke-width="5"/>
        <rect x="156" y="256" width="208" height="26" fill="#e2e8f0" stroke="#0f172a" stroke-width="4"/>
        <circle cx="190" cy="269" r="8" fill="#0f172a"/>
        <circle cx="330" cy="269" r="8" fill="#0f172a"/>
        <text x="260" y="42" text-anchor="middle" font-family="Arial" font-size="21" font-weight="700" fill="#0f172a">PIPE SUPPORT</text>
      `,
    ),
    source: "seed",
    assetType: "object",
    author: "System Library",
    updatedAt: "2026-04-24T09:00:00.000Z",
  },
];

export function parseTags(input: string): string[] {
  return input
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

export function createLibraryItem(input: {
  name: string;
  category: LibraryCategory;
  description: string;
  tags: string[];
  svg: string;
  source?: "seed" | "admin" | "personal";
  assetType?: "object" | "drawing";
  author?: string;
}): LibraryItem {
  return {
    id: `lib-${Math.random().toString(36).slice(2, 10)}`,
    name: input.name,
    category: input.category,
    description: input.description,
    tags: input.tags,
    svg: input.svg,
    source: input.source ?? "admin",
    assetType: input.assetType,
    author: input.author ?? "Admin",
    updatedAt: nowIso(),
  };
}

export function mapProfileToSession(profile: ProfileRecord): UserSession {
  return {
    id: profile.id,
    email: profile.email,
    name: profile.full_name || profile.email,
    company: profile.company || "",
    role: profile.role,
  };
}

export function mapProjectRecord(record: ProjectRecord, ownerName: string): SavedProject {
  return {
    id: record.id,
    ownerId: record.owner_id,
    linkedProjectId: record.linked_project_id ?? null,
    linkedProjectName: record.linked_project_name ?? null,
    name: record.name,
    owner: ownerName,
    updatedAt: record.updated_at,
    pages: Array.isArray(record.pages) ? record.pages : [createBlankPage(1)],
  };
}

export function mapLibraryRecord(record: LibraryItemRecord): LibraryItem {
  return {
    id: record.id,
    name: record.name,
    category: record.category,
    description: record.description,
    tags: record.tags ?? [],
    svg: record.svg,
    source: "admin",
    author: record.author_name || "Admin",
    updatedAt: record.updated_at,
  };
}

export function loadLibraryItems(): LibraryItem[] {
  if (typeof window === "undefined") return SEED_LIBRARY_ITEMS;
  const stored = window.localStorage.getItem(STORAGE_KEYS.library);
  if (!stored) return SEED_LIBRARY_ITEMS;

  try {
    const parsed = JSON.parse(stored) as LibraryItem[];
    if (!Array.isArray(parsed) || parsed.length === 0) return SEED_LIBRARY_ITEMS;
    const seedIds = new Set(SEED_LIBRARY_ITEMS.map((item) => item.id));
    const customItems = parsed.filter((item) => item.source !== "seed" && !seedIds.has(item.id));
    return [...SEED_LIBRARY_ITEMS, ...customItems];
  } catch {
    return SEED_LIBRARY_ITEMS;
  }
}

export function persistLibraryItems(items: LibraryItem[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEYS.library, JSON.stringify(items));
}

export function loadSavedProjects(): SavedProject[] {
  if (typeof window === "undefined") return [];
  const stored = window.localStorage.getItem(STORAGE_KEYS.projects);
  if (!stored) return [];

  try {
    const parsed = JSON.parse(stored) as SavedProject[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function persistSavedProjects(projects: SavedProject[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEYS.projects, JSON.stringify(projects));
}

export function loadSession(): UserSession | null {
  if (typeof window === "undefined") return null;
  const stored = window.localStorage.getItem(STORAGE_KEYS.session);
  if (!stored) return null;

  try {
    return JSON.parse(stored) as UserSession;
  } catch {
    return null;
  }
}

export function persistSession(session: UserSession | null) {
  if (typeof window === "undefined") return;
  if (!session) {
    window.localStorage.removeItem(STORAGE_KEYS.session);
    return;
  }

  window.localStorage.setItem(STORAGE_KEYS.session, JSON.stringify(session));
}
