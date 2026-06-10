import type { Page, TitleBlockData } from "./fabricHelpers";
import {
  DRAWING_TEMPLATES,
  createBeamDetailSvg,
  createColumnDetailSvg,
  createDoorBlockSvg,
  createFootingDetailSvg,
  createTemplateSvg,
  createWallOpeningSvg,
  createWindowBlockSvg,
  normalizeTemplateValues,
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
  /**
   * When set, inserting this item creates an editable parametric block of
   * this kind (legacy structural kind or registry template kind) instead of
   * a static SVG group — the user can edit its dimensions after insert.
   */
  parametricKind?: string;
  parametricParams?: Record<string, number | string>;
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
  favorites: "drawflow-favorites",
  recents: "drawflow-recents",
} as const;

export const MAX_RECENTS = 8;

const nowIso = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);

const svgDoc = (viewBox: string, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" fill="none">${body}</svg>`;

const SEED_DATE = "2026-06-10T09:00:00.000Z";

/**
 * Library items generated from the parametric template registry presets.
 * Every entry inserts as an editable parametric block — the admin grows
 * this list by adding presets to lib/drawings/templates/*.
 */
const TEMPLATE_SEED_ITEMS: LibraryItem[] = DRAWING_TEMPLATES.flatMap((template) =>
  (template.presets ?? []).map((preset) => ({
    id: `seed-${preset.id}`,
    name: preset.name,
    category: template.category as LibraryCategory,
    description: preset.description,
    tags: preset.tags ?? template.tags,
    svg: createTemplateSvg(template.kind, preset.values),
    source: "seed" as const,
    assetType: template.assetType,
    author: "System Library",
    updatedAt: SEED_DATE,
    parametricKind: template.kind,
    parametricParams: normalizeTemplateValues(template, preset.values),
  })),
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
    name: "RC Beam Section 400 x 400",
    category: "structural",
    description: "Parametric beam section with editable size, bars, and stirrups — CAD style with hatch and dimensions.",
    tags: ["beam", "reinforcement", "rebar", "stirrups", "concrete", "section"],
    svg: createBeamDetailSvg({ widthMm: 400, depthMm: 400, topBars: 2, bottomBars: 3, barDiaMm: 16, stirrupDiaMm: 8, stirrupSpacingMm: 150 }),
    source: "seed",
    assetType: "object",
    author: "System Library",
    updatedAt: SEED_DATE,
    parametricKind: "beam-detail",
    parametricParams: { widthMm: 400, depthMm: 400, topBars: 2, bottomBars: 3, barDiaMm: 16, stirrupDiaMm: 8, stirrupSpacingMm: 150 },
  },
  {
    id: "seed-rc-beam-230x450",
    name: "RC Beam Section 230 x 450",
    category: "structural",
    description: "Common rectangular beam preset — regenerate with any dimensions after insert.",
    tags: ["beam", "reinforcement", "rebar", "230x450", "concrete"],
    svg: createBeamDetailSvg({ widthMm: 230, depthMm: 450, topBars: 2, bottomBars: 3, barDiaMm: 16, stirrupDiaMm: 8, stirrupSpacingMm: 150 }),
    source: "seed",
    assetType: "object",
    author: "System Library",
    updatedAt: SEED_DATE,
    parametricKind: "beam-detail",
    parametricParams: { widthMm: 230, depthMm: 450, topBars: 2, bottomBars: 3, barDiaMm: 16, stirrupDiaMm: 8, stirrupSpacingMm: 150 },
  },
  {
    id: "seed-rc-column-300",
    name: "RC Column Section 300 x 300",
    category: "structural",
    description: "Column section with 8T16 perimeter bars, ties, hatch, and dimensions. Editable after insert.",
    tags: ["column", "rebar", "ties", "section", "concrete", "structural"],
    svg: createColumnDetailSvg({ view: "plan", widthMm: 300, depthMm: 300, mainBars: 8, barDiaMm: 16, tieDiaMm: 8, tieSpacingMm: 150, storeyMode: "single" }),
    source: "seed",
    assetType: "object",
    author: "System Library",
    updatedAt: SEED_DATE,
    parametricKind: "column-detail",
    parametricParams: { view: "plan", widthMm: 300, depthMm: 300, mainBars: 8, barDiaMm: 16, tieDiaMm: 8, tieSpacingMm: 150, storeyMode: "single" },
  },
  {
    id: "seed-rc-column-elevation",
    name: "RC Column Elevation",
    category: "structural",
    description: "Column elevation with ties, main bars, and lap note — switch between single and multi-storey.",
    tags: ["column", "elevation", "rebar", "ties", "structural"],
    svg: createColumnDetailSvg({ view: "section", widthMm: 300, depthMm: 300, mainBars: 8, barDiaMm: 16, tieDiaMm: 8, tieSpacingMm: 150, storeyMode: "single" }),
    source: "seed",
    assetType: "drawing",
    author: "System Library",
    updatedAt: SEED_DATE,
    parametricKind: "column-detail",
    parametricParams: { view: "section", widthMm: 300, depthMm: 300, mainBars: 8, barDiaMm: 16, tieDiaMm: 8, tieSpacingMm: 150, storeyMode: "single" },
  },
  {
    id: "seed-isolated-footing-plan",
    name: "Isolated Footing Plan 1800 x 1800",
    category: "structural",
    description: "Pad footing plan with two-way reinforcement mesh and full dimensions. Editable after insert.",
    tags: ["footing", "foundation", "plan", "rebar", "pad footing"],
    svg: createFootingDetailSvg({ view: "plan" }),
    source: "seed",
    assetType: "object",
    author: "System Library",
    updatedAt: SEED_DATE,
    parametricKind: "footing-detail",
    parametricParams: { view: "plan", footingWidthMm: 1800, footingLengthMm: 1800, footingDepthMm: 500, columnWidthMm: 300, columnDepthMm: 300, barDiaMm: 16, barCountX: 7, barCountY: 7 },
  },
  {
    id: "seed-isolated-footing-section",
    name: "Isolated Footing Section",
    category: "structural",
    description: "Footing section with pedestal, starter bars, bottom mat, blinding, and ground line.",
    tags: ["footing", "foundation", "section", "rebar", "blinding"],
    svg: createFootingDetailSvg({ view: "section" }),
    source: "seed",
    assetType: "drawing",
    author: "System Library",
    updatedAt: SEED_DATE,
    parametricKind: "footing-detail",
    parametricParams: { view: "section", footingWidthMm: 1800, footingLengthMm: 1800, footingDepthMm: 500, columnWidthMm: 300, columnDepthMm: 300, barDiaMm: 16, barCountX: 7, barCountY: 7 },
  },
  {
    id: "seed-wall-door-900",
    name: "Wall With 900 Door Opening",
    category: "layouts",
    description: "Wall plan with hosted door opening, swing, and dimension chain. Editable after insert.",
    tags: ["wall", "door", "opening", "architectural", "plan"],
    svg: createWallOpeningSvg({ wallLengthMm: 3600, wallThicknessMm: 200, openingType: "door", openingWidthMm: 900, openingOffsetMm: 1350 }),
    source: "seed",
    assetType: "object",
    author: "System Library",
    updatedAt: SEED_DATE,
    parametricKind: "wall-opening",
    parametricParams: { wallLengthMm: 3600, wallThicknessMm: 200, openingType: "door", openingWidthMm: 900, openingOffsetMm: 1350 },
  },
  {
    id: "seed-wall-window-1200",
    name: "Wall With 1200 Window",
    category: "layouts",
    description: "Wall plan with hosted window opening and dimension chain. Editable after insert.",
    tags: ["wall", "window", "opening", "architectural", "plan"],
    svg: createWallOpeningSvg({ wallLengthMm: 4200, wallThicknessMm: 200, openingType: "window", openingWidthMm: 1200, openingOffsetMm: 1500 }),
    source: "seed",
    assetType: "object",
    author: "System Library",
    updatedAt: SEED_DATE,
    parametricKind: "wall-opening",
    parametricParams: { wallLengthMm: 4200, wallThicknessMm: 200, openingType: "window", openingWidthMm: 1200, openingOffsetMm: 1500 },
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
    updatedAt: SEED_DATE,
    parametricKind: "door-opening",
    parametricParams: { wallLengthMm: 2400, wallThicknessMm: 200, openingType: "door", openingWidthMm: 900, openingOffsetMm: 750 },
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
    updatedAt: SEED_DATE,
    parametricKind: "window-opening",
    parametricParams: { wallLengthMm: 3000, wallThicknessMm: 200, openingType: "window", openingWidthMm: 1200, openingOffsetMm: 900 },
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
  // Parametric template presets (roads, drainage, water, structural details)
  // — all insert as editable parametric blocks.
  ...TEMPLATE_SEED_ITEMS,
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

export function loadFavoriteIds(): string[] {
  if (typeof window === "undefined") return [];
  const stored = window.localStorage.getItem(STORAGE_KEYS.favorites);
  if (!stored) return [];
  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function persistFavoriteIds(ids: string[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEYS.favorites, JSON.stringify(ids));
}

export function loadRecentIds(): string[] {
  if (typeof window === "undefined") return [];
  const stored = window.localStorage.getItem(STORAGE_KEYS.recents);
  if (!stored) return [];
  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function persistRecentIds(ids: string[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEYS.recents, JSON.stringify(ids.slice(0, MAX_RECENTS)));
}

export function persistSession(session: UserSession | null) {
  if (typeof window === "undefined") return;
  if (!session) {
    window.localStorage.removeItem(STORAGE_KEYS.session);
    return;
  }

  window.localStorage.setItem(STORAGE_KEYS.session, JSON.stringify(session));
}
