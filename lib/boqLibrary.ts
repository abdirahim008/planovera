import { v4 as uuid } from "uuid";

import type { BOQLibraryItem, BOQRow, BOQSheet } from "@/lib/supabase";

/**
 * Curated category → subcategory taxonomy for the BOQ library.
 * Admins pick a category + subcategory from these dropdowns, but the UI also
 * lets them type a brand-new category/subcategory ("curated list + custom").
 * Keep this list in sync with the SQL seed in supabase/seed-boq-library.sql.
 */
export const BOQ_LIBRARY_TAXONOMY: Record<string, string[]> = {
  "Solar Works": [
    "Ground-Mounted PV",
    "Rooftop PV",
    "Solar Water Pumping",
    "Solar Street Lighting",
  ],
  "Roads & Highways": [
    "Preliminaries",
    "Earthworks",
    "Pavement & Surfacing",
    "Road Furniture & Markings",
  ],
  Buildings: [
    "Substructure",
    "Superstructure",
    "Finishes",
    "MEP Services",
  ],
  "Water & Sanitation": [
    "Water Supply Networks",
    "Sewerage & Sanitation",
    "Boreholes & Wells",
    "Storage Tanks",
    "Ancillary Works",
  ],
  "Drainage & Structures": [
    "Culverts",
    "Lined Drains & Channels",
    "Retaining Walls",
    "Minor Bridges",
  ],
};

export const BOQ_LIBRARY_CATEGORIES = Object.keys(BOQ_LIBRARY_TAXONOMY);

export const subcategoriesForCategory = (category: string): string[] =>
  BOQ_LIBRARY_TAXONOMY[category] ?? [];

// ── Compact row builders ───────────────────────────────────────────────────
type RowSeed =
  | ["header", string]
  | ["item", string, string, string, string] // itemNo, description, unit, qty
  | ["subtotal", string]
  | ["grandtotal", string]
  | ["notes", string];

const seedToRow = (seed: RowSeed): BOQRow => {
  switch (seed[0]) {
    case "header":
      return { id: uuid(), type: "header", itemNo: "", description: seed[1], unit: "", qty: "", rate: "", amount: "" };
    case "item":
      return { id: uuid(), type: "item", itemNo: seed[1], description: seed[2], unit: seed[3], qty: seed[4], rate: "", amount: "" };
    case "subtotal":
      return { id: uuid(), type: "subtotal", itemNo: "", description: seed[1], unit: "", qty: "", rate: "", amount: "0.00" };
    case "grandtotal":
      return { id: uuid(), type: "grandtotal", itemNo: "", description: seed[1], unit: "", qty: "", rate: "", amount: "0.00" };
    case "notes":
      return { id: uuid(), type: "notes", itemNo: "", description: seed[1], unit: "", qty: "", rate: "", amount: "" };
  }
};

interface TemplateSeed {
  name: string;
  description: string;
  category: string;
  subcategory: string;
  tags?: string[];
  sheets: { name: string; rows: RowSeed[] }[];
}

const sheetFromSeed = (seed: { name: string; rows: RowSeed[] }, index: number): BOQSheet => ({
  id: uuid(),
  project_id: "",
  name: seed.name,
  sort_order: index,
  rows: seed.rows.map(seedToRow),
});

/** Materialize the curated template seeds into full BOQLibraryItem objects (fresh UUIDs). */
export const buildSeedLibraryItems = (): BOQLibraryItem[] => {
  const now = new Date().toISOString();
  return BOQ_LIBRARY_TEMPLATE_SEEDS.map((t) => ({
    id: uuid(),
    name: t.name,
    description: t.description,
    category: t.category,
    subcategory: t.subcategory,
    tags: t.tags ?? [],
    sheets: t.sheets.map(sheetFromSeed),
    created_at: now,
    updated_at: now,
  }));
};

/**
 * Genuine, structured starter BOQ templates across the five seeded sectors.
 * Quantities are left blank where project-specific; representative LS/units are
 * pre-filled where they are nearly always 1 (mobilization, etc.).
 */
export const BOQ_LIBRARY_TEMPLATE_SEEDS: TemplateSeed[] = [
  // ── Roads & Highways ──────────────────────────────────────────────────────
  {
    name: "Asphalt Road Works BOQ",
    description: "Typical flexible-pavement road: preliminaries, earthworks, pavement layers and surfacing.",
    category: "Roads & Highways",
    subcategory: "Pavement & Surfacing",
    sheets: [
      {
        name: "Road Works",
        rows: [
          ["header", "A. PRELIMINARY & GENERAL"],
          ["item", "A.1", "Mobilization and demobilization", "LS", "1"],
          ["item", "A.2", "Site establishment and clearance", "LS", "1"],
          ["item", "A.3", "Traffic management and diversions", "LS", "1"],
          ["item", "A.4", "Setting out and survey works", "LS", "1"],
          ["subtotal", "Sub Total - Preliminaries"],
          ["header", "B. EARTHWORKS"],
          ["item", "B.1", "Clearing and grubbing", "m²", ""],
          ["item", "B.2", "Excavation to spoil in soft material", "m³", ""],
          ["item", "B.3", "Excavation to spoil in hard/rock material", "m³", ""],
          ["item", "B.4", "Fill with approved material and compact", "m³", ""],
          ["item", "B.5", "Grading and shaping of formation", "m²", ""],
          ["subtotal", "Sub Total - Earthworks"],
          ["header", "C. PAVEMENT LAYERS"],
          ["item", "C.1", "Sub-base course (150mm compacted gravel)", "m³", ""],
          ["item", "C.2", "Base course (200mm crushed stone)", "m³", ""],
          ["item", "C.3", "Prime coat (MC-30 cutback bitumen)", "m²", ""],
          ["item", "C.4", "Tack coat (SS-1 emulsion)", "m²", ""],
          ["item", "C.5", "Asphalt concrete binder course (60mm)", "m²", ""],
          ["item", "C.6", "Asphalt concrete wearing course (50mm)", "m²", ""],
          ["subtotal", "Sub Total - Pavement"],
          ["header", "D. ROAD FURNITURE & MARKINGS"],
          ["item", "D.1", "Thermoplastic road marking lines", "m", ""],
          ["item", "D.2", "Road signs on posts", "No", ""],
          ["item", "D.3", "Guardrail (W-beam) including posts", "m", ""],
          ["subtotal", "Sub Total - Road Furniture"],
          ["grandtotal", "GRAND TOTAL"],
        ],
      },
    ],
  },
  {
    name: "Gravel/Earth Road BOQ",
    description: "Unpaved access road with earthworks, gravel wearing course and minor drainage.",
    category: "Roads & Highways",
    subcategory: "Earthworks",
    sheets: [
      {
        name: "Gravel Road",
        rows: [
          ["header", "A. PRELIMINARIES"],
          ["item", "A.1", "Mobilization and demobilization", "LS", "1"],
          ["item", "A.2", "Setting out", "LS", "1"],
          ["subtotal", "Sub Total - Preliminaries"],
          ["header", "B. EARTHWORKS"],
          ["item", "B.1", "Bush clearing and grubbing", "m²", ""],
          ["item", "B.2", "Cut to fill / cart to spoil", "m³", ""],
          ["item", "B.3", "Formation compaction to 95% MDD", "m²", ""],
          ["subtotal", "Sub Total - Earthworks"],
          ["header", "C. WEARING COURSE"],
          ["item", "C.1", "Natural gravel wearing course (150mm)", "m³", ""],
          ["item", "C.2", "Watering and compaction", "m²", ""],
          ["subtotal", "Sub Total - Wearing Course"],
          ["header", "D. DRAINAGE"],
          ["item", "D.1", "Side drains - excavation and shaping", "m", ""],
          ["item", "D.2", "Mitre/turnout drains", "m", ""],
          ["subtotal", "Sub Total - Drainage"],
          ["grandtotal", "GRAND TOTAL"],
        ],
      },
    ],
  },

  // ── Buildings ─────────────────────────────────────────────────────────────
  {
    name: "Single-Storey Building BOQ",
    description: "Masonry building shell: substructure, superstructure, roofing and finishes.",
    category: "Buildings",
    subcategory: "Superstructure",
    sheets: [
      {
        name: "Substructure",
        rows: [
          ["header", "A. SUBSTRUCTURE"],
          ["item", "A.1", "Site clearance and excavation for foundations", "m³", ""],
          ["item", "A.2", "Plain concrete (1:3:6) in blinding", "m³", ""],
          ["item", "A.3", "Reinforced concrete (1:2:4) in foundations", "m³", ""],
          ["item", "A.4", "Foundation masonry in natural stone", "m³", ""],
          ["item", "A.5", "Hardcore filling and compaction under floor", "m³", ""],
          ["item", "A.6", "Damp proof membrane (1000 gauge)", "m²", ""],
          ["item", "A.7", "RC ground floor slab (150mm)", "m²", ""],
          ["subtotal", "Sub Total - Substructure"],
        ],
      },
      {
        name: "Superstructure & Finishes",
        rows: [
          ["header", "B. SUPERSTRUCTURE"],
          ["item", "B.1", "200mm hollow block walling", "m²", ""],
          ["item", "B.2", "RC columns, beams and ring beam", "m³", ""],
          ["item", "B.3", "Timber roof structure", "m²", ""],
          ["item", "B.4", "Roofing - galvanized corrugated iron sheets", "m²", ""],
          ["subtotal", "Sub Total - Superstructure"],
          ["header", "C. FINISHES"],
          ["item", "C.1", "Internal and external plaster (1:4)", "m²", ""],
          ["item", "C.2", "Floor screed and ceramic tiles", "m²", ""],
          ["item", "C.3", "Painting - emulsion and gloss", "m²", ""],
          ["item", "C.4", "Doors and windows (supply and fix)", "No", ""],
          ["subtotal", "Sub Total - Finishes"],
          ["grandtotal", "GRAND TOTAL"],
        ],
      },
    ],
  },

  // ── Water & Sanitation ─────────────────────────────────────────────────────
  {
    name: "Borehole & Solar Pumping BOQ",
    description: "Borehole drilling, test pumping, submersible pump and elevated storage tank.",
    category: "Water & Sanitation",
    subcategory: "Boreholes & Wells",
    sheets: [
      {
        name: "Borehole Works",
        rows: [
          ["header", "A. DRILLING & DEVELOPMENT"],
          ["item", "A.1", "Mobilization of drilling rig", "LS", "1"],
          ["item", "A.2", "Drilling 8\" borehole in overburden", "m", ""],
          ["item", "A.3", "Drilling 8\" borehole in hard rock", "m", ""],
          ["item", "A.4", "Supply and install uPVC casing and screen", "m", ""],
          ["item", "A.5", "Gravel pack and well development", "LS", "1"],
          ["item", "A.6", "Test pumping (72 hours) and water analysis", "LS", "1"],
          ["subtotal", "Sub Total - Drilling"],
          ["header", "B. PUMPING & STORAGE"],
          ["item", "B.1", "Submersible pump and motor", "No", "1"],
          ["item", "B.2", "Solar PV array and controller for pump", "LS", "1"],
          ["item", "B.3", "Rising main and fittings", "m", ""],
          ["item", "B.4", "Elevated steel tank (10 m³) on tower", "No", "1"],
          ["item", "B.5", "Distribution pipework and tap stands", "m", ""],
          ["subtotal", "Sub Total - Pumping & Storage"],
          ["grandtotal", "GRAND TOTAL"],
        ],
      },
    ],
  },

  // ── Drainage & Structures ───────────────────────────────────────────────────
  {
    name: "Box Culvert & Lined Drain BOQ",
    description: "Reinforced-concrete box culvert with wing walls and stone-pitched lined drains.",
    category: "Drainage & Structures",
    subcategory: "Culverts",
    sheets: [
      {
        name: "Culvert & Drainage",
        rows: [
          ["header", "A. EXCAVATION & FOUNDATION"],
          ["item", "A.1", "Excavation for culvert in any material", "m³", ""],
          ["item", "A.2", "Plain concrete blinding (1:3:6)", "m³", ""],
          ["subtotal", "Sub Total - Excavation"],
          ["header", "B. CONCRETE WORKS"],
          ["item", "B.1", "Reinforced concrete (Class 25) in culvert", "m³", ""],
          ["item", "B.2", "High-yield steel reinforcement", "kg", ""],
          ["item", "B.3", "Formwork to soffits and walls", "m²", ""],
          ["item", "B.4", "Wing walls and head walls", "m³", ""],
          ["subtotal", "Sub Total - Concrete"],
          ["header", "C. LINED DRAINS"],
          ["item", "C.1", "Excavation and shaping of drain", "m", ""],
          ["item", "C.2", "Stone pitching to drain bed and sides", "m²", ""],
          ["item", "C.3", "Mortar pointing to stone pitching", "m²", ""],
          ["subtotal", "Sub Total - Lined Drains"],
          ["grandtotal", "GRAND TOTAL"],
        ],
      },
    ],
  },

  // ── Solar Works ─────────────────────────────────────────────────────────────
  {
    name: "Ground-Mounted Solar PV Plant BOQ",
    description: "Utility/institutional ground-mounted PV: modules, mounting, inverters, balance of system.",
    category: "Solar Works",
    subcategory: "Ground-Mounted PV",
    sheets: [
      {
        name: "Solar PV Plant",
        rows: [
          ["header", "A. PV MODULES & MOUNTING"],
          ["item", "A.1", "Supply PV modules (mono-crystalline)", "Wp", ""],
          ["item", "A.2", "Hot-dip galvanized mounting structure", "kg", ""],
          ["item", "A.3", "Concrete foundations for mounting", "m³", ""],
          ["subtotal", "Sub Total - Modules & Mounting"],
          ["header", "B. POWER CONVERSION"],
          ["item", "B.1", "Grid-tie / hybrid inverters", "No", ""],
          ["item", "B.2", "Battery bank (lithium-ion)", "kWh", ""],
          ["item", "B.3", "Charge controllers (MPPT)", "No", ""],
          ["subtotal", "Sub Total - Power Conversion"],
          ["header", "C. BALANCE OF SYSTEM"],
          ["item", "C.1", "DC cabling and connectors", "m", ""],
          ["item", "C.2", "AC cabling and distribution board", "m", ""],
          ["item", "C.3", "Combiner boxes and surge protection", "No", ""],
          ["item", "C.4", "Earthing and lightning protection", "LS", "1"],
          ["item", "C.5", "Testing, commissioning and monitoring", "LS", "1"],
          ["subtotal", "Sub Total - Balance of System"],
          ["grandtotal", "GRAND TOTAL"],
        ],
      },
    ],
  },
  {
    name: "Solar Street Lighting BOQ",
    description: "All-in-one and split solar street lights with poles and foundations.",
    category: "Solar Works",
    subcategory: "Solar Street Lighting",
    sheets: [
      {
        name: "Street Lighting",
        rows: [
          ["header", "A. SOLAR STREET LIGHTS"],
          ["item", "A.1", "Solar street light (60W LED, integrated)", "No", ""],
          ["item", "A.2", "Galvanized steel pole (6m) with bracket", "No", ""],
          ["item", "A.3", "Concrete foundation and anchor bolts", "No", ""],
          ["item", "A.4", "Installation, testing and commissioning", "No", ""],
          ["subtotal", "Sub Total - Street Lighting"],
          ["grandtotal", "GRAND TOTAL"],
        ],
      },
    ],
  },
];
