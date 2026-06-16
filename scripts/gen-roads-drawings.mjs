// Convert a curated set of Tennessee-DOT "Standard Roadway Drawings" PDF sheets
// into optimised, editable SVG library blocks for the drawing studio, plus small
// PNG thumbnails, and write them under imports/roads-library/ (gitignored).
//
// Each sheet:
//   • pdftotext  → official title-block name + drawing number (auto-naming)
//   • pdftocairo → vector SVG, then svgo (floatPrecision 2) ≈ 0.8 MB, ~0.1 MB gz
//   • pdftocairo → 240 px PNG thumbnail (data URL, ~20 KB) for the library grid
//
// The full SVG is heavy to build (svgo ≈ 60–80 s/sheet), so this supports shards:
//   node scripts/gen-roads-drawings.mjs --shard 0/6   (run 0..5 in parallel)
// then merge:
//   node scripts/gen-roads-drawings.mjs --merge
//
// Output: imports/roads-library/svg/<CODE>.svg  +  imports/roads-library/manifest.json
// Upload with scripts/upload-roads-drawings.mjs (needs your service-role key).
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { optimize } from "svgo";
import { cleanSvg } from "./clean-roads-svg.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const SRC = join(root, "imports", "roads", "Standard Roadway Drawings 08-08-2023");
const OUT = join(root, "imports", "roads-library");
const SVG_OUT = join(OUT, "svg");

// ── Curated sheets: representative standard details per subfolder. ────────────
// path is relative to SRC; tags are merged with auto-derived ones.
const SHEETS = [
  // 03 — Pipe Culverts & Endwalls
  ["03 Pipe Culverts and Endwalls/01 PIPE CULVERTS AND FLUME/DFLU1.pdf", ["culvert", "flume", "ditch paving", "drainage"]],
  ["03 Pipe Culverts and Endwalls/01 PIPE CULVERTS AND FLUME/DPB1.pdf", ["culvert", "pipe", "bedding", "drainage"]],
  ["03 Pipe Culverts and Endwalls/01 PIPE CULVERTS AND FLUME/DPG3.pdf", ["culvert", "pipe", "drainage"]],
  ["03 Pipe Culverts and Endwalls/01 PIPE CULVERTS AND FLUME/DPO1.pdf", ["culvert", "pipe outlet", "drainage"]],
  ["03 Pipe Culverts and Endwalls/01 PIPE CULVERTS AND FLUME/DPS1.pdf", ["culvert", "pipe", "drainage"]],
  ["03 Pipe Culverts and Endwalls/02 SAFETY CROSS DRAIN ENDWALLS/DPE15A.pdf", ["endwall", "cross drain", "culvert", "drainage"]],
  ["03 Pipe Culverts and Endwalls/02 SAFETY CROSS DRAIN ENDWALLS/DPE24A.pdf", ["endwall", "cross drain", "culvert", "drainage"]],
  ["03 Pipe Culverts and Endwalls/02 SAFETY CROSS DRAIN ENDWALLS/DPE36A.pdf", ["endwall", "cross drain", "culvert", "drainage"]],
  ["03 Pipe Culverts and Endwalls/03 SAFETY SIDE DRAIN ENDWALLS/DSEW1A.pdf", ["endwall", "side drain", "culvert", "drainage"]],
  ["03 Pipe Culverts and Endwalls/03 SAFETY SIDE DRAIN ENDWALLS/SDMSE1.pdf", ["endwall", "side drain", "drainage"]],
  ["03 Pipe Culverts and Endwalls/04 PROTECTED ENDWALLS/DPEW1.pdf", ["endwall", "protected", "culvert", "drainage"]],
  ["03 Pipe Culverts and Endwalls/04 PROTECTED ENDWALLS/DPE4.pdf", ["endwall", "protected", "drainage"]],

  // 04 — Catch Basins & Manholes
  ["04 Catch Basins and Manholes/01 CATCH BASINS/DCB10S.pdf", ["catch basin", "drainage", "precast concrete"]],
  ["04 Catch Basins and Manholes/01 CATCH BASINS/DCB12P.pdf", ["catch basin", "drainage", "precast concrete"]],
  ["04 Catch Basins and Manholes/01 CATCH BASINS/DCB12S.pdf", ["catch basin", "drainage", "precast concrete"]],
  ["04 Catch Basins and Manholes/02 JUNCTION BOXES/DJBS1.pdf", ["junction box", "drainage", "precast concrete"]],
  ["04 Catch Basins and Manholes/03 MANHOLES/DMH2.pdf", ["manhole", "drainage", "precast concrete"]],
  ["04 Catch Basins and Manholes/03 MANHOLES/DMH4.pdf", ["manhole", "drainage", "precast concrete"]],
  ["04 Catch Basins and Manholes/04 PRECAST RISERS/DRF1.pdf", ["riser", "manhole", "precast concrete"]],
  ["04 Catch Basins and Manholes/05 SPRING DRAIN BOXES/DSDS1.pdf", ["spring drain", "drainage box", "drainage"]],
  ["04 Catch Basins and Manholes/06 SLOTTED AND TRENCH DRAINS/DSLD1.pdf", ["slotted drain", "drainage"]],
  ["04 Catch Basins and Manholes/06 SLOTTED AND TRENCH DRAINS/DTD1.pdf", ["trench drain", "drainage"]],

  // 02 — Roadway Design Standards (typical sections)
  ["02 Roadway Design Standards/04 RD11 TYPICAL SECTION AND DESIGN CRITERIA/RD11TS1.pdf", ["typical section", "cross section", "roadway", "pavement"]],
  ["02 Roadway Design Standards/04 RD11 TYPICAL SECTION AND DESIGN CRITERIA/RD11TS2.pdf", ["typical section", "cross section", "roadway"]],
  ["02 Roadway Design Standards/04 RD11 TYPICAL SECTION AND DESIGN CRITERIA/RD11SE1.pdf", ["superelevation", "typical section", "roadway"]],
  ["02 Roadway Design Standards/05 RD11 SLOPE DEVELOPMENT AND RUNOFF LENGTHS/RD11S11.pdf", ["slope", "runoff", "roadway"]],
  ["02 Roadway Design Standards/06 RD11 INTERSECTION SIGHT DISTANCE/RD11SD1.pdf", ["sight distance", "intersection", "roadway"]],
  ["02 Roadway Design Standards/07 RD01 TYPICAL SECTIONS AND DESIGN CRITERIA/RD01TS1.pdf", ["typical section", "cross section", "roadway"]],
  ["02 Roadway Design Standards/10 UNDERDRAINS/RDUD3.pdf", ["underdrain", "subsurface drainage", "drainage"]],
  ["02 Roadway Design Standards/10 UNDERDRAINS/RDUD6.pdf", ["underdrain", "subsurface drainage", "drainage"]],
  ["02 Roadway Design Standards/01 RD18 TYPICAL SECTIONS AND DESIGN CRITERIA/RD18RTS1.pdf", ["typical section", "cross section", "roadway"]],

  // 06 — Roadway, Pavement Appurtenances & Fences
  ["06 Roadway, Pavement Appurtenances, and Fences/01 CONCRETE PAVEMENT/RPCS1.pdf", ["concrete pavement", "pavement", "roadway"]],
  ["06 Roadway, Pavement Appurtenances, and Fences/01 CONCRETE PAVEMENT/RPJ1.pdf", ["concrete pavement", "joint", "pavement"]],
  ["06 Roadway, Pavement Appurtenances, and Fences/02 INTERSECTIONS/RPI5.pdf", ["intersection", "pavement", "roadway"]],
  ["06 Roadway, Pavement Appurtenances, and Fences/02 INTERSECTIONS/RPR1.pdf", ["intersection", "ramp", "roadway"]],
  ["06 Roadway, Pavement Appurtenances, and Fences/03 CURBS/RPSC1.pdf", ["curb", "curb and gutter", "roadway"]],
  ["06 Roadway, Pavement Appurtenances, and Fences/03 CURBS/RPVC10.pdf", ["curb", "valley gutter", "roadway"]],
  ["06 Roadway, Pavement Appurtenances, and Fences/04 WALLS/WCIP1.pdf", ["retaining wall", "cast in place", "structural"]],
  ["06 Roadway, Pavement Appurtenances, and Fences/04 WALLS/WMSE1.pdf", ["retaining wall", "mse wall", "structural"]],
  ["06 Roadway, Pavement Appurtenances, and Fences/05 FENCES AND RIGHT-OF-WAY MARKERS/SF1.pdf", ["fence", "right of way", "boundary"]],
  ["06 Roadway, Pavement Appurtenances, and Fences/05 FENCES AND RIGHT-OF-WAY MARKERS/SFG11.pdf", ["fence", "gate", "boundary"]],
  ["06 Roadway, Pavement Appurtenances, and Fences/05 FENCES AND RIGHT-OF-WAY MARKERS/SRP2.pdf", ["right of way marker", "boundary"]],

  // 08 — Safety Design & Guardrails
  ["08 Safety Design and Guardrails/01 CLEAR ZONE AND SAFETY PLANS/SCZ1.pdf", ["clear zone", "safety", "roadway"]],
  ["08 Safety Design and Guardrails/02 CABLE BARRIER/SCB1.pdf", ["cable barrier", "safety barrier", "guardrail"]],
  ["08 Safety Design and Guardrails/03 CRASH CUSHIONS/SCC1.pdf", ["crash cushion", "safety", "guardrail"]],
  ["08 Safety Design and Guardrails/04 GUARDRAIL DETAILS/SGR311.pdf", ["guardrail", "w-beam", "safety"]],
  ["08 Safety Design and Guardrails/05 GUARDRAIL CONNECTIONS/SGRC4.pdf", ["guardrail", "connection", "safety"]],
  ["08 Safety Design and Guardrails/07 GUARDRAIL TERMINALS/SGRT1.pdf", ["guardrail", "terminal", "end treatment", "safety"]],
  ["08 Safety Design and Guardrails/08 GUARDRAIL ANCHORS/SGRA1.pdf", ["guardrail", "anchor", "safety"]],
  ["08 Safety Design and Guardrails/09 CONCRETE MEDIAN BARRIERS/SSSMB1.pdf", ["median barrier", "concrete barrier", "safety"]],
  ["08 Safety Design and Guardrails/09 CONCRETE MEDIAN BARRIERS/SSSMB7.pdf", ["median barrier", "concrete barrier", "safety"]],
];

// ── Helpers ──────────────────────────────────────────────────────────────────
const DATE_RE = /(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})|(\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*\.?\s+\d{4}\b)|(NOT TO SCALE)/i;
const DWGNO_RE = /^[A-Z][A-Z0-9]*-[A-Z0-9-]+$/;

const titleCase = (s) =>
  s
    .toLowerCase()
    .replace(/\b([a-z])/g, (_, c) => c.toUpperCase())
    .replace(/\bNo\.?\s*(\d)/gi, "No. $1")
    .replace(/\bMse\b/g, "MSE")
    .replace(/\bFhwa\b/g, "FHWA")
    .replace(/\bTdot\b/g, "TDOT")
    .replace(/\bRc\b/g, "RC");

function extractTitle(pdfPath, code) {
  let text = "";
  try {
    text = execFileSync("pdftotext", ["-f", "1", "-l", "1", pdfPath, "-"], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    return { name: code, drawingNo: code };
  }
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  // Drawing number: last line that looks like a TDOT code (e.g. D-FLU-1).
  let drawingNo = code;
  for (let i = lines.length - 1; i >= 0 && i >= lines.length - 4; i--) {
    if (DWGNO_RE.test(lines[i])) { drawingNo = lines[i]; break; }
  }

  // Title: lines after the last "DEPARTMENT OF TRANSPORTATION", up to the date/
  // scale line, skipping revision/approval noise.
  const anchor = lines.map((l) => l.toUpperCase()).lastIndexOf("DEPARTMENT OF TRANSPORTATION");
  const titleParts = [];
  if (anchor !== -1) {
    for (let i = anchor + 1; i < lines.length; i++) {
      const l = lines[i];
      if (DATE_RE.test(l)) break;
      if (DWGNO_RE.test(l)) break;
      if (/^\(?(replaced|minor revision|approved by|all others)/i.test(l)) continue;
      if (/^[A-Z]$/.test(l)) continue; // stray note bullets
      titleParts.push(l);
    }
  }
  const raw = titleParts.join(" ").replace(/\s+/g, " ").trim();
  const name = raw ? titleCase(raw) : code;
  return { name, drawingNo };
}

function pdfToOptimisedSvg(pdfPath) {
  const tmp = join(tmpdir(), `rd-${process.pid}-${Math.abs(hashStr(pdfPath))}.svg`);
  execFileSync("pdftocairo", ["-svg", pdfPath, tmp], { stdio: ["ignore", "ignore", "ignore"] });
  const raw = readFileSync(tmp, "utf8");
  const { data } = optimize(raw, {
    multipass: false,
    floatPrecision: 2,
    plugins: [{ name: "preset-default", params: { overrides: { removeViewBox: false } } }],
  });
  // Strip the TDOT title block + outer sheet border (keep drawing/notes/tables).
  return cleanSvg(data).svg;
}

function pdfToThumbDataUrl(pdfPath) {
  const base = join(tmpdir(), `rd-thumb-${process.pid}-${Math.abs(hashStr(pdfPath))}`);
  execFileSync("pdftocairo", ["-png", "-singlefile", "-scale-to", "240", pdfPath, base], {
    stdio: ["ignore", "ignore", "ignore"],
  });
  const png = readFileSync(base + ".png");
  return "data:image/png;base64," + png.toString("base64");
}

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

// ── Modes ────────────────────────────────────────────────────────────────────
const arg = (k) => {
  const i = process.argv.indexOf(k);
  return i !== -1 ? process.argv[i + 1] : undefined;
};

mkdirSync(SVG_OUT, { recursive: true });

if (process.argv.includes("--merge")) {
  const parts = readdirSync(OUT).filter((f) => /^manifest\.\d+\.json$/.test(f));
  const all = [];
  for (const p of parts) all.push(...JSON.parse(readFileSync(join(OUT, p), "utf8")));
  all.sort((a, b) => a.code.localeCompare(b.code));
  writeFileSync(join(OUT, "manifest.json"), JSON.stringify(all, null, 2));
  console.log(`Merged ${parts.length} shards → manifest.json with ${all.length} items.`);
  for (const it of all) console.log(`  • ${it.name}  [${it.drawingNo}]`);
  process.exit(0);
}

let indices = SHEETS.map((_, i) => i);
const shard = arg("--shard");
if (shard) {
  const [k, n] = shard.split("/").map(Number);
  indices = indices.filter((i) => i % n === k);
}

const out = [];
for (const i of indices) {
  const [rel, extraTags] = SHEETS[i];
  const pdfPath = join(SRC, rel);
  if (!existsSync(pdfPath)) {
    console.error(`MISSING: ${rel}`);
    continue;
  }
  const code = rel.split("/").pop().replace(/\.pdf$/i, "");
  const { name, drawingNo } = extractTitle(pdfPath, code);
  const t0 = Date.now();
  const svg = pdfToOptimisedSvg(pdfPath);
  const thumbnail = pdfToThumbDataUrl(pdfPath);
  writeFileSync(join(SVG_OUT, `${code}.svg`), svg);
  out.push({
    code,
    drawingNo,
    name,
    category: "civil",
    description: `${name} — Tennessee DOT standard roadway drawing (${drawingNo}). Reference detail; adapt units and specifications to local standards.`,
    tags: Array.from(new Set([...extraTags, "roadway", "standard detail", "tdot"])),
    svgFile: `svg/${code}.svg`,
    svgKB: Math.round(svg.length / 1024),
    thumbnail,
  });
  console.log(`✓ ${code}  "${name}"  ${Math.round(svg.length / 1024)}KB  ${Date.now() - t0}ms`);
}

const manifestName = shard ? `manifest.${shard.split("/")[0]}.json` : "manifest.json";
writeFileSync(join(OUT, manifestName), JSON.stringify(out, null, 2));
console.log(`Wrote ${OUT}/${manifestName} (${out.length} items).`);
