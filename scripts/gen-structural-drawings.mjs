// Convert the two structural-drawing PDF sets under imports/structural/ into
// editable SVG library blocks for the drawing studio — with the bottom title
// block (project/drawing-title bar + logos) and the sheet border stripped — plus
// small PNG thumbnails, written under imports/structural-library/.
//
// Each sheet:
//   • pdftocairo -svg  → vector SVG, then svgo (floatPrecision 2)
//   • cleanStructuralSvg → drop the title strip (transform-aware), keep the drawing
//   • pdftocairo -png (top-cropped, title strip excluded) → ~300px thumbnail
//
// These PDFs have no text layer, so names are curated below (read off the sheets).
// Page 1 of the A3 set is a cover sheet and is skipped.
//
// Output: imports/structural-library/svg/<CODE>.svg + manifest.json
// Upload:  node scripts/upload-roads-drawings.mjs structural-library   (needs key)
//
// Optional first arg filters by source prefix: `node ... mpc` or `... fro`.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { optimize } from "svgo";
import { cleanStructuralSvg, boostStrokeWidths } from "./clean-structural-svg.mjs";

const require = createRequire(import.meta.url);
const pdfjs = require("pdfjs-dist/legacy/build/pdf.js");

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const OUT = join(root, "imports", "structural-library");
const SVG_OUT = join(OUT, "svg");

// ── Curated sheets (names read off the rendered sheets; no PDF text layer). ────
const SOURCES = [
  {
    key: "fro",
    prefix: "FRO",
    pdf: join(root, "imports", "structural", "STRUCTURAL DRAWINGS.pdf"),
    band: 0.14, // bottom title-strip height (fraction of A3 sheet)
    note: "STCBL Fuel Retail Outlet structural set",
    sheets: [
      // page (1-based), name, extra tags  — page 1 is the cover sheet (skipped)
      { page: 2, name: "Ground Floor Plan", tags: ["ground floor", "plan", "layout"] },
      { page: 3, name: "Foundation Details", tags: ["foundation", "footing", "plinth beam"] },
      { page: 4, name: "Beam Details", tags: ["beam", "reinforcement"] },
      { page: 5, name: "Truss Layout Details", tags: ["truss", "roof", "steel", "layout"] },
      { page: 6, name: "Truss Details", tags: ["truss", "steel", "connection"] },
      { page: 7, name: "Truss Details II", tags: ["truss", "steel", "connection"] },
      { page: 8, name: "Canopy Foundation Details", tags: ["canopy", "foundation", "footing"] },
      { page: 9, name: "Pylon Foundation Details", tags: ["pylon", "foundation", "footing"] },
      { page: 10, name: "Yard Light Foundation", tags: ["yard light", "foundation", "footing"] },
      { page: 11, name: "Island Details", tags: ["island", "forecourt", "fuel"] },
      { page: 12, name: "Kerb Stone Details", tags: ["kerb", "curb", "roadway"] },
      { page: 13, name: "Boundary Fencing Details", tags: ["fence", "boundary", "wall"] },
      { page: 14, name: "Underground Tank 35KL", tags: ["underground tank", "tank", "fuel storage"] },
      { page: 15, name: "Underground Tank 70KL", tags: ["underground tank", "tank", "fuel storage"] },
    ],
  },
  {
    key: "mpc",
    prefix: "MPC",
    pdf: join(root, "imports", "structural", "Drawings-Structural.pdf"),
    band: 0.13, // bottom title-strip height (fraction of A1 sheet)
    note: "RNFA / IOM-UNHCR Multi-Purpose Center structural set",
    sheets: [
      { page: 1, name: "Structural General Notes", tags: ["general notes", "specifications", "design criteria"] },
      { page: 2, name: "Structural Symbols & Abbreviations", tags: ["general notes", "symbols", "abbreviations"] },
      { page: 3, name: "Typical Construction Details", tags: ["typical detail", "lintel", "chb wall", "construction joint"] },
      { page: 4, name: "Pipe Sleeve & Footing Schedule Details", tags: ["pipe sleeve", "footing schedule", "column"] },
      { page: 5, name: "Foundation & Floor Framing Plan", tags: ["foundation", "framing plan", "floor"] },
      { page: 6, name: "Floor Framing Plans", tags: ["framing plan", "floor"] },
      { page: 7, name: "Roof Framing Plan", tags: ["framing plan", "roof"] },
      { page: 8, name: "Footing & Grade Beam Details", tags: ["footing", "grade beam", "foundation"] },
      { page: 9, name: "Beam Details & Schedule", tags: ["beam", "schedule", "reinforcement"] },
      { page: 10, name: "Column Schedule & Details", tags: ["column", "schedule", "splice"] },
      { page: 11, name: "Slab & Wall Footing Details", tags: ["slab", "wall footing", "reinforcement"] },
      { page: 12, name: "Concrete Stair & Ramp Details", tags: ["stair", "ramp", "reinforcement"] },
      { page: 13, name: "Steel Truss & Connection Details", tags: ["truss", "steel", "connection", "gusset"] },
    ],
  },
];

async function pdfToCleanSvg(pdf, page, band) {
  const tmp = join(tmpdir(), `st-${process.pid}-${page}.svg`);
  execFileSync("pdftocairo", ["-svg", "-f", String(page), "-l", String(page), pdf, tmp], { stdio: "ignore" });
  let raw = readFileSync(tmp, "utf8");

  // Recover real text from the PDF (empty for sheets whose text was flattened to
  // outlines in the original CAD export). When present, drop pdftocairo's
  // outlined glyph text — defs + <use> placements — so we can replace it with
  // editable <text>; sheets with no recoverable text keep their text-as-paths.
  const textParts = await extractEditableText(pdf, page, band);
  if (textParts.length > 0) {
    raw = raw.replace(/<g id="glyph-[^"]*">[\s\S]*?<\/g>/g, "").replace(/<use\b[^>]*\/>/g, "");
  }

  const { data } = optimize(raw, {
    multipass: false,
    floatPrecision: 2,
    plugins: ["preset-default"], // svgo v4 keeps viewBox by default
  });
  const cleaned = cleanStructuralSvg(data, { band });
  // Boost the source's print-weight hairlines so the drawing reads crisply on
  // the canvas instead of looking faint.
  let svg = boostStrokeWidths(cleaned.svg);
  // Inject the recovered text as editable <text> (Fabric turns these into
  // editable IText on the canvas). Title-block text is already skipped below.
  if (textParts.length > 0) {
    svg = svg.replace(/<\/svg>\s*$/, `${textParts.join("")}</svg>`);
  }
  return { ...cleaned, svg, textCount: textParts.length };
}

// Extract the PDF's real text as positioned, editable <text> elements, omitting
// anything inside the bottom title-block band. Returns [] when the page has no
// recoverable text (its text was outlined into vector curves).
async function extractEditableText(pdf, page, band) {
  const data = new Uint8Array(readFileSync(pdf));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true, verbosity: 0 }).promise;
  try {
    const pg = await doc.getPage(page);
    const { height: H } = pg.getViewport({ scale: 1 });
    const bandTop = H * (1 - band);
    const tc = await pg.getTextContent();
    const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const parts = [];
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue;
      const t = it.transform; // [a,b,c,d,e,f] in PDF space (y-up)
      const x = t[4];
      const y = H - t[5]; // → SVG viewBox space (y-down); viewBox matches PDF pts
      if (y >= bandTop) continue; // title-block text — omit
      const size = Math.hypot(t[0], t[1]) || Math.abs(t[3]);
      if (!(size > 0.5)) continue;
      const angle = -Math.atan2(t[1], t[0]) * (180 / Math.PI);
      const rot = Math.abs(angle) > 0.5 ? ` transform="rotate(${angle.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)})"` : "";
      parts.push(
        `<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" font-size="${size.toFixed(2)}" font-family="Arial, sans-serif" fill="#000"${rot}>${esc(it.str)}</text>`,
      );
    }
    return parts;
  } finally {
    await doc.destroy();
  }
}

// Thumbnail = the page rendered top-cropped (title strip excluded), ~300px wide.
function pdfToThumbDataUrl(pdf, page, band) {
  const base = join(tmpdir(), `st-thumb-${process.pid}-${page}`);
  // Resolution chosen so the cropped width lands near 300px regardless of sheet.
  const info = execFileSync("pdfinfo", ["-f", String(page), "-l", String(page), pdf], { encoding: "utf8" });
  const sz = info.match(/Page\s+\d+\s+size:\s+([\d.]+)\s+x\s+([\d.]+)/) || info.match(/Page size:\s+([\d.]+)\s+x\s+([\d.]+)/);
  const wPt = sz ? parseFloat(sz[1]) : 1191;
  const hPt = sz ? parseFloat(sz[2]) : 842;
  const r = (300 * 72) / wPt;
  const cropW = Math.round((wPt * r) / 72);
  const cropH = Math.round(((hPt * r) / 72) * (1 - band));
  execFileSync(
    "pdftocairo",
    ["-png", "-singlefile", "-r", String(r), "-x", "0", "-y", "0", "-W", String(cropW), "-H", String(cropH), "-f", String(page), "-l", String(page), pdf, base],
    { stdio: "ignore" },
  );
  return "data:image/png;base64," + readFileSync(base + ".png").toString("base64");
}

// ── Run ───────────────────────────────────────────────────────────────────────
mkdirSync(SVG_OUT, { recursive: true });
const only = (process.argv[2] || "").toLowerCase();

const out = [];
for (const src of SOURCES) {
  if (only && src.key !== only) continue;
  for (const sheet of src.sheets) {
    const code = `${src.prefix}-${String(sheet.page).padStart(2, "0")}`;
    const t0 = Date.now();
    const { svg, removedPaths, removedUses, removedImages, textCount } = await pdfToCleanSvg(src.pdf, sheet.page, src.band);
    const thumbnail = pdfToThumbDataUrl(src.pdf, sheet.page, src.band);
    writeFileSync(join(SVG_OUT, `${code}.svg`), svg);
    out.push({
      code,
      drawingNo: code,
      name: sheet.name,
      category: "structural",
      description: `${sheet.name} — structural reference drawing (${src.note}). Reference detail; adapt to project-specific loads and local codes.`,
      tags: Array.from(new Set([...sheet.tags, "structural", "reference"])),
      svgFile: `svg/${code}.svg`,
      svgKB: Math.round(svg.length / 1024),
      thumbnail,
    });
    console.log(
      `✓ ${code}  "${sheet.name}"  ${Math.round(svg.length / 1024)}KB  ` +
        `(−${removedPaths}p −${removedUses}u −${removedImages}i +${textCount}t)  ${Date.now() - t0}ms`,
    );
  }
}

// Merge with any existing manifest entries from the other source when filtering.
let manifest = out;
const manifestPath = join(OUT, "manifest.json");
if (only) {
  try {
    const existing = JSON.parse(readFileSync(manifestPath, "utf8"));
    const codes = new Set(out.map((o) => o.code));
    manifest = [...existing.filter((e) => !codes.has(e.code)), ...out].sort((a, b) => a.code.localeCompare(b.code));
  } catch {
    /* no existing manifest */
  }
}
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`\nWrote ${manifestPath} (${manifest.length} items).`);
