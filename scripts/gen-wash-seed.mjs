// Parses the 9 WASH BOQ workbooks (priced — keeps qty/rate as entered) and
// emits supabase/seed-wash-boq-library.sql, ready to run in the Supabase SQL
// editor. Requires the `subcategory` and `tags` columns
// (run supabase/add-boq-subcategory.sql + supabase/add-boq-tags.sql first).
//
// Run: node scripts/gen-wash-seed.mjs
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import * as XLSX from "xlsx";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const SRC_DIR =
  "C:\\Users\\zewo1\\OneDrive - brasurp.gov.so\\Desktop\\my projects\\BOQ library\\WASH";

// ── Per-file metadata (name shown in library, plus searchable tags) ──────────
const COMMON = ["wash", "water", "sanitation"];
const META = {
  "NEW BORHEOLE.xlsx": {
    name: "New Borehole — Drilling & Equipping (320 m)",
    description: "Deep borehole drilling, casing/screen installation, test pumping, submersible pump, generator and commissioning.",
    subcategory: "Boreholes & Wells",
    tags: ["borehole", "drilling", "submersible pump", "generator", "casing", "screen", "test pumping", "well"],
  },
  "Elevated RC Water tank 108M3.xlsx": {
    name: "Elevated RC Water Tank (108 m³)",
    description: "Reinforced-concrete elevated water storage tank including substructure, columns, tank and finishes.",
    subcategory: "Storage Tanks",
    tags: ["water tank", "elevated tank", "reinforced concrete", "storage", "reservoir", "rc tank"],
  },
  "Distribution pipes PVC.xlsx": {
    name: "Distribution Pipes (uPVC)",
    description: "Water distribution pipeline: trench excavation, bedding, uPVC pipes, fittings, chambers and testing.",
    subcategory: "Water Supply Networks",
    tags: ["pipeline", "uPVC", "distribution", "trenching", "fittings", "water supply", "pvc pipe"],
  },
  "Covered communal Water Point.xlsx": {
    name: "Covered Communal Water Point",
    description: "Communal water point / tap stand with covered structure, apron and fittings.",
    subcategory: "Water Supply Networks",
    tags: ["water point", "kiosk", "tap stand", "communal", "water supply"],
  },
  "Borehole latrine.xlsx": {
    name: "Borehole Latrine",
    description: "Latrine / ablution block serving a borehole site, including substructure, superstructure and sanitary fittings.",
    subcategory: "Sewerage & Sanitation",
    tags: ["latrine", "toilet", "sanitation", "ablution", "wc"],
  },
  "Construction of borehole fence.xlsx": {
    name: "Borehole Fence (Chainlink)",
    description: "Chainlink perimeter fence with precast concrete posts and gate to secure a borehole compound.",
    subcategory: "Ancillary Works",
    tags: ["fence", "chainlink", "security", "perimeter", "gate", "borehole"],
  },
  "Caretakers room.xlsx": {
    name: "Caretaker's Room",
    description: "Single-room caretaker building: substructure, masonry superstructure, roofing and finishes.",
    subcategory: "Ancillary Works",
    tags: ["caretaker", "building", "room", "masonry", "guard house"],
  },
  "Single Generator room.xlsx": {
    name: "Single Generator Room",
    description: "Generator housing room: substructure, masonry walls, roofing and finishes for a single genset.",
    subcategory: "Ancillary Works",
    tags: ["generator room", "genset housing", "building", "powerhouse"],
  },
  "Solar Panel Stand.xlsx": {
    name: "Solar Panel Stand",
    description: "Steel mounting stand / structure for ground-mounted solar PV panels at a water-supply site.",
    subcategory: "Ancillary Works",
    tags: ["solar", "panel stand", "steel structure", "mounting", "pv"],
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────
const isBlank = (v) => v === "" || v === null || v === undefined;

const cleanText = (v) =>
  String(v ?? "")
    .replace(/\r\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// Format a numeric cell back to a clean string, dropping float noise.
const numStr = (v) => {
  if (isBlank(v)) return "";
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
  if (!Number.isFinite(n)) return cleanText(v);
  const rounded = Math.round(n * 1000) / 1000; // kill 330.749999… noise
  return String(rounded);
};

const SUBTOTAL_RE = /\b(sub[\s-]*total|total from page|collection)\b/i;
const GRANDTOTAL_RE = /\b(grand total|total cost|total for|unit cost|total\b)/i;

function classifyRows(aoa) {
  // Locate the column-header row (the one whose first cell is "ITEM").
  let headerIdx = aoa.findIndex((r) => cleanText(r[0]).toUpperCase() === "ITEM");
  if (headerIdx === -1) headerIdx = 1;

  const rows = [];
  for (let i = headerIdx + 1; i < aoa.length; i++) {
    const r = aoa[i];
    const itemNo = cleanText(r[0]);
    const desc = cleanText(r[1]);
    const unit = cleanText(r[2]);
    const qty = numStr(r[3]);
    const rate = numStr(r[4]);
    const amount = numStr(r[5]);

    // Skip completely empty rows.
    if (!itemNo && !desc && !unit && !qty && !rate && !amount) continue;

    const hasItemNo = !!itemNo;
    const hasNumbers = !!qty || !!rate;

    // Total / subtotal lines: description present, no item number, usually
    // only an amount in the last column.
    if (!hasItemNo && desc && !qty && !rate) {
      if (GRANDTOTAL_RE.test(desc) && !SUBTOTAL_RE.test(desc)) {
        rows.push({ type: "grandtotal", itemNo: "", description: desc, unit: "", qty: "", rate: "", amount: "0.00" });
        continue;
      }
      if (SUBTOTAL_RE.test(desc)) {
        rows.push({ type: "subtotal", itemNo: "", description: desc, unit: "", qty: "", rate: "", amount: "0.00" });
        continue;
      }
      // Plain heading / sub-heading / descriptive line.
      rows.push({ type: "header", itemNo: "", description: desc, unit: "", qty: "", rate: "", amount: "" });
      continue;
    }

    // Priced line item — keep qty + rate exactly as captured.
    if (hasItemNo || hasNumbers) {
      rows.push({ type: "item", itemNo, description: desc, unit, qty, rate, amount });
      continue;
    }

    // Fallback: treat as a heading.
    rows.push({ type: "header", itemNo: "", description: desc, unit: "", qty: "", rate: "", amount: "" });
  }

  // Trim trailing non-item rows (stray blanks classified away already, but a
  // dangling heading at the very end adds nothing).
  while (rows.length && rows[rows.length - 1].type === "header") rows.pop();

  return rows;
}

// ── Build ────────────────────────────────────────────────────────────────────
const present = readdirSync(SRC_DIR).filter((f) => f.endsWith(".xlsx") && !f.startsWith("~$"));

const sqlEscape = (s) => s.replace(/'/g, "''");

const items = [];
for (const file of Object.keys(META)) {
  if (!present.includes(file)) {
    throw new Error(`Expected workbook missing: ${file}`);
  }
  const meta = META[file];
  const wb = XLSX.read(readFileSync(join(SRC_DIR, file)), { type: "buffer" });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" });
  const rows = classifyRows(aoa).map((r) => ({ id: randomUUID(), ...r }));

  const itemCount = rows.filter((r) => r.type === "item").length;
  if (itemCount === 0) throw new Error(`No item rows parsed from ${file}`);

  const sheet = {
    id: randomUUID(),
    project_id: "",
    name: meta.name,
    sort_order: 0,
    rows,
  };

  items.push({
    name: meta.name,
    description: meta.description,
    category: "Water & Sanitation",
    subcategory: meta.subcategory,
    tags: Array.from(new Set([...meta.tags, ...COMMON])),
    sheets: [sheet],
    itemCount,
  });
}

// ── Emit SQL ─────────────────────────────────────────────────────────────────
const lines = [];
lines.push("-- ============================================================================");
lines.push("-- seed-wash-boq-library.sql  — GENERATED by scripts/gen-wash-seed.mjs. Do not edit by hand.");
lines.push("-- Seeds 9 priced WASH starter BOQ templates into public.boq_library_items.");
lines.push("-- Prerequisites (run once, in order):");
lines.push("--   1. supabase/add-boq-subcategory.sql   (adds subcategory column)");
lines.push("--   2. supabase/add-boq-tags.sql          (adds tags column + GIN index)");
lines.push("-- Safe to re-run: existing copies (matched by exact name) are removed first.");
lines.push("-- ============================================================================");
lines.push("");
const names = items.map((t) => `'${sqlEscape(t.name)}'`).join(", ");
lines.push(`delete from public.boq_library_items where name in (${names});`);
lines.push("");

for (const t of items) {
  const sheetsJson = JSON.stringify(t.sheets);
  const tagsArray = `array[${t.tags.map((tag) => `'${sqlEscape(tag)}'`).join(", ")}]::text[]`;
  lines.push(`-- ${t.name}  (${t.itemCount} priced items)`);
  lines.push(`insert into public.boq_library_items (name, description, category, subcategory, tags, sheets)`);
  lines.push(`values (`);
  lines.push(`  '${sqlEscape(t.name)}',`);
  lines.push(`  '${sqlEscape(t.description)}',`);
  lines.push(`  '${sqlEscape(t.category)}',`);
  lines.push(`  '${sqlEscape(t.subcategory)}',`);
  lines.push(`  ${tagsArray},`);
  lines.push(`  '${sqlEscape(sheetsJson)}'::jsonb`);
  lines.push(`);`);
  lines.push("");
}

lines.push("select category, subcategory, name, array_length(tags, 1) as tag_count");
lines.push("from public.boq_library_items");
lines.push("where category = 'Water & Sanitation'");
lines.push("order by subcategory, name;");
lines.push("");

writeFileSync(join(root, "supabase", "seed-wash-boq-library.sql"), lines.join("\n"), "utf8");
console.log(`Wrote supabase/seed-wash-boq-library.sql with ${items.length} templates.`);
for (const t of items) {
  console.log(`  • ${t.name}  [${t.subcategory}]  ${t.itemCount} items, ${t.tags.length} tags`);
}
