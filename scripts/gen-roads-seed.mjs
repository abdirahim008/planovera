// Parses the asphalt-concrete road workbook and emits
// supabase/seed-roads-asphalt.sql — one priced "Asphalt Concrete Road"
// starter template for the BOQ library, with three sheets:
//   1. "Bill 1 — Preliminaries & General"
//   2. "Road Works"   (every bill as a section header + per-bill subtotal)
//   3. "Summary"      (Sub-Total → 15% contingency → 8% tax → Grand Total,
//                      all live-linked via =SHEETTOTAL('<sheet>') so the
//                      figures recompute from the two data sheets and survive
//                      the id re-minting that happens on library load)
//
// Requires the `subcategory` and `tags` columns
// (run supabase/add-boq-subcategory.sql + supabase/add-boq-tags.sql first).
//
// Run from the repo root:  node scripts/gen-roads-seed.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import * as XLSX from "xlsx";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const SRC =
  "C:\\Users\\zewo1\\OneDrive - brasurp.gov.so\\Desktop\\my projects\\BOQ library\\roads\\asphalt road\\asphalt concrete road.xlsx";

// ── Sheet names (referenced verbatim by the Summary formulas) ────────────────
const BILL1_SHEET = "Bill 1 — Preliminaries & General";
const ROAD_SHEET = "Road Works";
const SUMMARY_SHEET = "Summary";

const CONTINGENCY = 0.15; // 15% provisional sum for contingencies
const GOV_TAX = 0.08; //     8% government tax

// ── Helpers ──────────────────────────────────────────────────────────────────
const isBlank = (v) => v === "" || v === null || v === undefined;

const cleanText = (v) =>
  String(v ?? "")
    .replace(/\r\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// Format a numeric cell back to a clean string, dropping float noise. A bare
// "-" placeholder is treated as empty.
const numStr = (v) => {
  if (isBlank(v)) return "";
  const raw = String(v).trim();
  if (raw === "-" || raw === "—") return "";
  const n = typeof v === "number" ? v : Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(n)) return "";
  const rounded = Math.round(n * 1000) / 1000; // kill 330.749999… noise
  return String(rounded);
};

const num = (v) => {
  const n = Number(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};

const COL_HEADER_RE = /^ITEM$/i;
const BILL_TITLE_RE = /^BILL\b/i;
const BILL_TOTAL_RE = /^total of bill\b/i;
const INNER_SUBTOTAL_RE = /sub\s*total\s+sum\s+of\s+bill/i;
const TAIL_SUMMARY_RE = /^summary\s+bills?\s+of\s+quantities/i;

// Normalise a "%" line to the app convention: amount = qty × rate ÷ 100.
// The workbook stores the percentage as a decimal fraction (0.2, 0.15, …) in
// whichever of qty/rate is < 1, and the base in the other — so pick the
// smaller as the fraction and the larger as the base.
function normalizePercentRow(row) {
  if (cleanText(row.unit) !== "%") return row;
  const q = num(row.qty);
  const r = num(row.rate);
  if (q === 0 || r === 0) return row;
  const base = Math.max(q, r);
  const pct = Math.min(q, r);
  return { ...row, qty: numStr(base), rate: numStr(pct * 100), unit: "%" };
}

// Classify one worksheet (array-of-arrays) into typed BOQ rows.
// `stopAtTailSummary` breaks before the duplicate summary block on the road
// sheet so per-bill totals are not counted twice.
function classifyRows(aoa, { stopAtTailSummary }) {
  const rows = [];
  let subtotalSum = 0; // running sum of per-bill subtotal amounts

  for (const r of aoa) {
    const c0 = cleanText(r[0]); // ITEM column — holds the item no. OR a section/total label
    const desc = cleanText(r[1]);
    const unit = cleanText(r[2]);
    const qty = numStr(r[3]);
    const rate = numStr(r[4]);
    const amount = numStr(r[5]);

    if (!c0 && !desc && !unit && !qty && !rate && !amount) continue; // blank
    if (COL_HEADER_RE.test(c0)) continue; // "ITEM | DESCRIPTION | …" column header

    // Section titles / carried-forward totals put their text in col 0 with an
    // empty description column; ordinary items keep a real description in col 1.
    const isLabelRow = !desc && !!c0 && !qty && !rate;
    const label = desc || c0;

    // End of the bill area — a duplicate summary block follows; stop here so the
    // per-bill totals are not counted twice.
    if (isLabelRow && TAIL_SUMMARY_RE.test(label)) {
      if (stopAtTailSummary) break;
      continue;
    }

    // Bill section title → heading.
    if (isLabelRow && BILL_TITLE_RE.test(label)) {
      rows.push({ type: "header", itemNo: "", description: label, unit: "", qty: "", rate: "", amount: "" });
      continue;
    }

    // Per-bill carried-forward total → a real subtotal row.
    if (BILL_TOTAL_RE.test(label)) {
      subtotalSum += num(amount);
      rows.push({ type: "subtotal", itemNo: "", description: label, unit: "", qty: "", rate: "", amount: amount || "0" });
      continue;
    }

    // Nested "Sub Total sum of bill 22" inside bill 22 — demote to a heading so
    // it is not added on top of the individual plant/labour/material items.
    if (INNER_SUBTOTAL_RE.test(label)) {
      rows.push({ type: "header", itemNo: "", description: label, unit: "", qty: "", rate: "", amount: "" });
      continue;
    }

    // Priced / numbered line item (parents with no numbers come through here
    // too and simply carry blank quantities).
    if (c0 || qty || rate || amount) {
      rows.push(normalizePercentRow({ type: "item", itemNo: c0, description: desc, unit, qty, rate, amount }));
      continue;
    }

    // Plain descriptive line (NOTE / PLANT / LABOUR / MATERIALS sub-heads).
    rows.push({ type: "header", itemNo: "", description: label, unit: "", qty: "", rate: "", amount: "" });
  }

  while (rows.length && rows[rows.length - 1].type === "header") rows.pop();
  return { rows, subtotalSum };
}

// ── Parse workbook ───────────────────────────────────────────────────────────
const wb = XLSX.read(readFileSync(SRC), { type: "buffer" });
const toAoa = (name) =>
  XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: "" });

const bill1Aoa = toAoa(wb.SheetNames[1]); // "Bill 1 Prelim & Gen "
const roadAoa = toAoa(wb.SheetNames[2]); //  "Daynille Road Works"

const bill1 = classifyRows(bill1Aoa, { stopAtTailSummary: false });
const road = classifyRows(roadAoa, { stopAtTailSummary: true });

// Close the road sheet with a grand-total mirroring the workbook's carried sum.
road.rows.push({
  type: "grandtotal",
  itemNo: "",
  description: "Sub-Total — Daynille Road Works (carried to Summary)",
  unit: "",
  qty: "",
  rate: "",
  amount: numStr(road.subtotalSum) || "0",
});

const bill1Items = bill1.rows.filter((r) => r.type === "item").length;
const roadItems = road.rows.filter((r) => r.type === "item").length;
if (!bill1Items || !roadItems) throw new Error("Parsed zero item rows — check the workbook layout.");

// ── Summary sheet — all figures live-linked by sheet name ────────────────────
const sref = (name) => name.replace(/'/g, "''");
const B = `SHEETTOTAL('${sref(BILL1_SHEET)}')`;
const R = `SHEETTOTAL('${sref(ROAD_SHEET)}')`;
const BASE = `(${B} + ${R})`;

const summaryRows = [
  { type: "header", itemNo: "", description: "SUMMARY — BILLS OF QUANTITIES", unit: "", qty: "", rate: "", amount: "" },
  { type: "item", itemNo: "1", description: "General — Bill No. 1: Preliminaries & General Items", unit: "", qty: "", rate: "", amount: `=${B}` },
  { type: "item", itemNo: "2", description: "Daynille Road — Bills No. 4–26: Road Works", unit: "", qty: "", rate: "", amount: `=${R}` },
  { type: "subtotal", itemNo: "", description: "Sub-Total 1", unit: "", qty: "", rate: "", amount: `=${BASE}` },
  {
    type: "item",
    itemNo: "",
    description:
      "Add 15% of Sub-Total 1 of Bills as a Provisional Sum for contingencies, to be expended in whole or in part or deleted as directed by the Project Manager.",
    unit: "",
    qty: "",
    rate: "",
    amount: `=${BASE} * ${CONTINGENCY}`,
  },
  { type: "subtotal", itemNo: "", description: "Sub-Total 2", unit: "", qty: "", rate: "", amount: `=${BASE} * ${1 + CONTINGENCY}` },
  {
    type: "item",
    itemNo: "",
    description: "Add 8% of Sub-Total 2 for Government Tax",
    unit: "",
    qty: "",
    rate: "",
    amount: `=${BASE} * ${1 + CONTINGENCY} * ${GOV_TAX}`,
  },
  {
    type: "grandtotal",
    itemNo: "",
    description: "Total Carried Forward to Form of Bid",
    unit: "",
    qty: "",
    rate: "",
    amount: `=${BASE} * ${1 + CONTINGENCY} * ${1 + GOV_TAX}`,
  },
];

// ── Assemble the library item ────────────────────────────────────────────────
const mkSheet = (name, rows, sort) => ({
  id: randomUUID(),
  project_id: "",
  name,
  sort_order: sort,
  rows: rows.map((r) => ({ id: randomUUID(), ...r })),
});

const item = {
  name: "Asphalt Concrete Road",
  description:
    "Full asphalt-concrete road package: preliminaries, site clearance, earthworks, drainage and culverts, gravel base/sub-base, cement-treated layers, bituminous surfacing and asphalt wearing course, concrete works, road furniture, street lighting, day works and a road-safety campaign — with a summary page carrying 15% contingencies and 8% government tax.",
  category: "Roads & Highways",
  subcategory: "Pavement & Surfacing",
  tags: [
    "road", "asphalt", "asphalt concrete", "pavement", "surfacing", "bitumen",
    "bituminous", "carriageway", "highway", "earthworks", "drainage", "culvert",
    "gravel base", "sub-base", "road furniture", "kerb", "street lighting",
    "day works", "road marking", "boq",
  ],
  sheets: [
    mkSheet(BILL1_SHEET, bill1.rows, 0),
    mkSheet(ROAD_SHEET, road.rows, 1),
    mkSheet(SUMMARY_SHEET, summaryRows, 2),
  ],
};

// ── Emit SQL ─────────────────────────────────────────────────────────────────
const sqlEscape = (s) => String(s).replace(/'/g, "''");
const tagsArray = `array[${item.tags.map((t) => `'${sqlEscape(t)}'`).join(", ")}]::text[]`;
const sheetsJson = JSON.stringify(item.sheets);

const lines = [
  "-- ============================================================================",
  "-- seed-roads-asphalt.sql — GENERATED by scripts/gen-roads-seed.mjs. Do not edit by hand.",
  '-- Seeds the priced "Asphalt Concrete Road" starter BOQ into public.boq_library_items.',
  "-- Prerequisites (run once, in order):",
  "--   1. supabase/add-boq-subcategory.sql   (adds subcategory column)",
  "--   2. supabase/add-boq-tags.sql          (adds tags column + GIN index)",
  "-- Safe to re-run: the existing copy (matched by exact name) is removed first.",
  "-- ============================================================================",
  "",
  `delete from public.boq_library_items where name = '${sqlEscape(item.name)}';`,
  "",
  `-- ${item.name}  (Bill 1: ${bill1Items} items, Road Works: ${roadItems} items)`,
  "insert into public.boq_library_items (name, description, category, subcategory, tags, sheets)",
  "values (",
  `  '${sqlEscape(item.name)}',`,
  `  '${sqlEscape(item.description)}',`,
  `  '${sqlEscape(item.category)}',`,
  `  '${sqlEscape(item.subcategory)}',`,
  `  ${tagsArray},`,
  `  '${sqlEscape(sheetsJson)}'::jsonb`,
  ");",
  "",
  "select category, subcategory, name, array_length(tags, 1) as tag_count",
  "from public.boq_library_items",
  "where name = '" + sqlEscape(item.name) + "';",
  "",
];

writeFileSync(join(root, "supabase", "seed-roads-asphalt.sql"), lines.join("\n"), "utf8");

// ── Report ───────────────────────────────────────────────────────────────────
const bill1Total = bill1.rows.filter((r) => r.type === "item").reduce((s, r) => {
  const q = num(r.qty), rt = num(r.rate);
  return s + (r.unit === "%" ? (q * rt) / 100 : q * rt);
}, 0);
const roadTotal = road.rows.filter((r) => r.type === "item").reduce((s, r) => {
  const q = num(r.qty), rt = num(r.rate);
  return s + (r.unit === "%" ? (q * rt) / 100 : q * rt);
}, 0);
const base = bill1Total + roadTotal;

console.log("Wrote supabase/seed-roads-asphalt.sql");
console.log(`  Bill 1 — Preliminaries & General : ${bill1Items} items, total ${bill1Total.toFixed(2)}`);
console.log(`  Road Works                       : ${roadItems} items, total ${roadTotal.toFixed(2)}`);
console.log(`  Sub-Total 1                      : ${base.toFixed(4)}`);
console.log(`  + 15% contingency                : ${(base * CONTINGENCY).toFixed(4)}`);
console.log(`  Sub-Total 2                      : ${(base * (1 + CONTINGENCY)).toFixed(4)}`);
console.log(`  + 8% government tax              : ${(base * (1 + CONTINGENCY) * GOV_TAX).toFixed(4)}`);
console.log(`  Grand Total                      : ${(base * (1 + CONTINGENCY) * (1 + GOV_TAX)).toFixed(4)}`);
