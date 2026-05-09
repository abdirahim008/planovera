import type { Page, TitleBlockData } from "./fabricHelpers";

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
  source: "seed" | "admin";
  author: string;
  updatedAt: string;
}

export interface SavedProject {
  id: string;
  ownerId?: string;
  name: string;
  owner: string;
  updatedAt: string;
  pages: Page[];
}

export interface ProjectRecord {
  id: string;
  owner_id: string;
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
  source?: "seed" | "admin";
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
    return parsed;
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
