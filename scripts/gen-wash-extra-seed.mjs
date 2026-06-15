// Parses the 12 Cowork-sourced WASH BOQ workbooks (priced — keeps qty/rate as
// entered) and emits supabase/seed-wash-boq-library-extra.sql, ready to run in
// the Supabase SQL editor. Requires the `subcategory` and `tags` columns
// (run supabase/add-boq-subcategory.sql + supabase/add-boq-tags.sql first —
// already in place if the first WASH seed was applied).
//
// These workbooks share one clean layout:
//   row 0  "BILL OF QUANTITIES — <title>"
//   row 1  "Indicative priced BOQ — Somalia / East Africa, 2026"
//   row 2  Item No. | Description | Unit | Quantity | Rate (USD) | Amount (USD)
//   then   lettered section headers (A, B …), A.1 items, "Subtotal — …",
//          a final "GRAND TOTAL", and a "Rates indicative — verify locally" foot.
//
// Run: node scripts/gen-wash-extra-seed.mjs
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import * as XLSX from "xlsx";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const SRC_DIR =
  "C:/Users/zewo1/OneDrive - brasurp.gov.so/Desktop/my projects/BOQ library";

// ── Per-file metadata (name shown in library, plus searchable tags) ──────────
const COMMON = ["wash", "water", "sanitation"];
const META = {
  "elevated-rc-tank-20m3.xlsx": {
    name: "Elevated RC Water Tank (20 m³)",
    description: "Reinforced-concrete elevated water storage tank (20 m³): substructure, columns, tank slab/walls, finishes, testing and transport.",
    subcategory: "Storage Tanks",
    tags: ["water tank", "elevated tank", "reinforced concrete", "storage", "rc tank", "20m3"],
  },
  "elevated-rc-tank-30m3.xlsx": {
    name: "Elevated RC Water Tank (30 m³)",
    description: "Reinforced-concrete elevated water storage tank (30 m³): substructure, columns, tank slab/walls, finishes, testing and transport.",
    subcategory: "Storage Tanks",
    tags: ["water tank", "elevated tank", "reinforced concrete", "storage", "rc tank", "30m3"],
  },
  "elevated-steel-tower-tank-10m3.xlsx": {
    name: "Elevated Steel-Tower Water Tank (10 m³)",
    description: "Elevated steel-tower water tank (10 m³): pad foundations, fabricated steel tower, pressed-steel/poly tank, pipework, testing and transport.",
    subcategory: "Storage Tanks",
    tags: ["water tank", "elevated tank", "steel tower", "storage", "10m3", "pressed steel tank"],
  },
  "ground-masonry-reservoir-50m3.xlsx": {
    name: "Ground-Level Masonry Reservoir (50 m³)",
    description: "Ground-level masonry water reservoir (50 m³): earthworks, RC base slab, masonry walls, cover, finishes, testing and transport.",
    subcategory: "Storage Tanks",
    tags: ["reservoir", "masonry", "ground tank", "storage", "50m3", "water reservoir"],
  },
  "ground-rc-reservoir-100m3.xlsx": {
    name: "Ground-Level RC Reservoir (100 m³)",
    description: "Ground-level reinforced-concrete water reservoir (100 m³): earthworks, RC base slab and walls, cover slab, finishes, testing and transport.",
    subcategory: "Storage Tanks",
    tags: ["reservoir", "reinforced concrete", "ground tank", "storage", "100m3", "rc reservoir"],
  },
  "berkad-lined-cistern-100m3.xlsx": {
    name: "Berkad — Lined Rainwater Cistern (100 m³)",
    description: "Traditional Somali berkad: lined underground rainwater-harvesting cistern (~100 m³) with bulk excavation, masonry/RC lining, partial cover slab, catchment and silt control.",
    subcategory: "Storage Tanks",
    tags: ["berkad", "cistern", "rainwater harvesting", "underground tank", "lined", "storage", "100m3"],
  },
  "hand-dug-well-lined-handpump.xlsx": {
    name: "Hand-Dug Well (Lined) with Hand Pump",
    description: "Shallow / hand-dug well: lined shaft with caisson rings, gravel pack, sanitary seal, apron, headwall and hand pump including testing and water-quality sampling.",
    subcategory: "Boreholes & Wells",
    tags: ["hand-dug well", "shallow well", "hand pump", "caisson", "apron", "headwall", "well"],
  },
  "solar-borehole-pumping-system.xlsx": {
    name: "Solar Borehole Pumping System",
    description: "Solar-powered borehole pumping system: submersible pump & motor, rising main, PV array and mounting, controller/inverter, cabling, testing, commissioning and training.",
    subcategory: "Boreholes & Wells",
    tags: ["solar", "borehole", "submersible pump", "pv array", "pumping", "controller", "rising main"],
  },
  "water-kiosk-tap-stand.xlsx": {
    name: "Water Kiosk / Communal Tap Stand",
    description: "Water kiosk / communal tap stand: foundation and floor slab, masonry structure and roof, taps and fittings, apron and drainage, testing and commissioning.",
    subcategory: "Water Supply Networks",
    tags: ["water kiosk", "tap stand", "communal water point", "water supply", "apron", "taps"],
  },
  "cattle-trough-livestock-point.xlsx": {
    name: "Cattle Trough / Livestock Watering Point",
    description: "Livestock watering point: RC cattle trough (~6 m), hardcore base and apron, supply pipework and float valve, fencing, drainage, testing and transport.",
    subcategory: "Water Supply Networks",
    tags: ["cattle trough", "livestock", "watering point", "trough", "apron", "water supply"],
  },
  "vip-latrine-institutional-4stance.xlsx": {
    name: "VIP Latrine — Institutional Block (4 Stance)",
    description: "Institutional ventilated-improved-pit latrine block (4 stance): lined pits, RC cover slab, masonry superstructure, roofing, vents, doors, handwashing and drainage.",
    subcategory: "Sewerage & Sanitation",
    tags: ["vip latrine", "latrine", "toilet", "sanitation", "institutional", "4 stance", "ablution"],
  },
  "septic-tank-soak-pit.xlsx": {
    name: "Septic Tank + Soak Pit",
    description: "Septic tank with soak pit: excavation, RC tank base/walls/cover, baffles, soak-pit fill and lining, connecting drains, vent, testing and transport.",
    subcategory: "Sewerage & Sanitation",
    tags: ["septic tank", "soak pit", "soakaway", "sanitation", "sewerage", "wastewater"],
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
  const rounded = Math.round(n * 1000) / 1000; // kill 877.49999… noise
  return String(rounded);
};

const GRANDTOTAL_RE = /\bgrand\s*total\b/i;
const SUBTOTAL_RE = /\b(sub[\s-]*total|collection)\b/i;
const FOOTER_RE = /\brates?\s+indicative\b/i;

function classifyRows(aoa) {
  // Locate the column-header row (first cell starts with "Item No").
  let headerIdx = aoa.findIndex((r) => /^item\s*no/i.test(cleanText(r[0])));
  if (headerIdx === -1) headerIdx = 2;

  const rows = [];
  for (let i = headerIdx + 1; i < aoa.length; i++) {
    const r = aoa[i];
    const itemNo = cleanText(r[0]);
    const desc = cleanText(r[1]);
    const unit = cleanText(r[2]);
    const qty = numStr(r[3]);
    const rate = numStr(r[4]);
    const amount = numStr(r[5]);

    // Skip completely empty rows and the closing disclaimer line.
    if (!itemNo && !desc && !unit && !qty && !rate && !amount) continue;
    if (FOOTER_RE.test(desc) && !qty && !rate) continue;

    const hasNumbers = !!qty || !!rate;

    // No qty/rate → heading or total line.
    if (!hasNumbers) {
      if (GRANDTOTAL_RE.test(desc)) {
        rows.push({ type: "grandtotal", itemNo: "", description: desc, unit: "", qty: "", rate: "", amount: "0.00" });
        continue;
      }
      if (SUBTOTAL_RE.test(desc)) {
        rows.push({ type: "subtotal", itemNo: "", description: desc, unit: "", qty: "", rate: "", amount: "0.00" });
        continue;
      }
      // Lettered section heading (drop the redundant "A" item number — the
      // description already carries "A. <title>").
      rows.push({ type: "header", itemNo: "", description: desc, unit: "", qty: "", rate: "", amount: "" });
      continue;
    }

    // Priced line item — keep qty + rate + amount exactly as captured.
    rows.push({ type: "item", itemNo, description: desc, unit, qty, rate, amount });
  }

  // Trim any dangling trailing heading.
  while (rows.length && rows[rows.length - 1].type === "header") rows.pop();

  return rows;
}

// ── Build ────────────────────────────────────────────────────────────────────
const present = readdirSync(SRC_DIR).filter(
  (f) => f.endsWith(".xlsx") && !f.startsWith("~$") && !f.startsWith(".~"),
);

const sqlEscape = (s) => s.replace(/'/g, "''");

const items = [];
for (const file of Object.keys(META)) {
  if (!present.includes(file)) {
    throw new Error(`Expected workbook missing: ${file}`);
  }
  const meta = META[file];
  const wb = XLSX.read(readFileSync(join(SRC_DIR, file)), { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
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
lines.push("-- seed-wash-boq-library-extra.sql  — GENERATED by scripts/gen-wash-extra-seed.mjs.");
lines.push("-- Do not edit by hand.");
lines.push(`-- Seeds ${items.length} additional priced WASH BOQ templates into public.boq_library_items`);
lines.push("-- (elevated/ground tanks, berkad, hand-dug well, solar pumping, kiosk, latrine, etc.).");
lines.push("-- Prerequisites (already applied if seed-wash-boq-library.sql was run):");
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

writeFileSync(join(root, "supabase", "seed-wash-boq-library-extra.sql"), lines.join("\n"), "utf8");
console.log(`Wrote supabase/seed-wash-boq-library-extra.sql with ${items.length} templates.`);
for (const t of items) {
  console.log(`  • ${t.name}  [${t.subcategory}]  ${t.itemCount} items, ${t.tags.length} tags`);
}
