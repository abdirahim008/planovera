// Convert the project road drawings the user dropped in imports/roads/
// ("Pages from Kalkal Road.pdf", "Pages from Kaysaney Road.pdf") — vector A3
// sheets — into optimised SVG library blocks for the warehouse. Full sheets are
// kept (title blocks included); pages are split into one library item each.
//
//   node scripts/gen-project-roads.mjs
//
// Then upload with your service-role key:
//   $env:SUPABASE_SERVICE_ROLE_KEY="<key>"
//   node scripts/upload-roads-drawings.mjs roads-library-projects
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { optimize } from "svgo";

// Title-block / border / stamp removal (position based, run on the OPTIMISED svg
// so svgo has flattened transforms into absolute path coords). Identical strategy
// to scripts/gen-typical-roads.mjs: drop the sheet border, the right-edge title
// strip, and the bottom-left "FOR TENDER" stamp. Drawings sit left of the strip,
// so nothing in the cross sections / details is clipped.
const STRIP = 0.85; // title strip = rightmost (1 - STRIP) of the sheet width
const FRAME = 0.94;

function pathBBox(d) {
  let x = 0, y = 0, sx = 0, sy = 0, minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const ext = (px, py) => { if (px < minX) minX = px; if (py < minY) minY = py; if (px > maxX) maxX = px; if (py > maxY) maxY = py; };
  const re = /([MmLlHhVvCcSsQqTtAaZz])|(-?\d*\.?\d+(?:e[-+]?\d+)?)/gi;
  const toks = []; let m;
  while ((m = re.exec(d))) toks.push(m[1] || parseFloat(m[2]));
  let i = 0, cmd = null; const num = () => toks[i++];
  while (i < toks.length) {
    if (typeof toks[i] === "string") cmd = toks[i++];
    const rel = cmd === cmd?.toLowerCase();
    switch (cmd?.toUpperCase()) {
      case "M": { let nx = num(), ny = num(); if (rel) { nx += x; ny += y; } x = nx; y = ny; sx = x; sy = y; ext(x, y); cmd = rel ? "l" : "L"; break; }
      case "L": { let nx = num(), ny = num(); if (rel) { nx += x; ny += y; } x = nx; y = ny; ext(x, y); break; }
      case "H": { let nx = num(); if (rel) nx += x; x = nx; ext(x, y); break; }
      case "V": { let ny = num(); if (rel) ny += y; y = ny; ext(x, y); break; }
      case "C": { let a=num(),b=num(),c=num(),e=num(),nx=num(),ny=num(); if(rel){a+=x;b+=y;c+=x;e+=y;nx+=x;ny+=y;} ext(a,b);ext(c,e);ext(nx,ny); x=nx;y=ny; break; }
      case "S": case "Q": { let a=num(),b=num(),nx=num(),ny=num(); if(rel){a+=x;b+=y;nx+=x;ny+=y;} ext(a,b);ext(nx,ny); x=nx;y=ny; break; }
      case "T": { let nx=num(),ny=num(); if(rel){nx+=x;ny+=y;} ext(nx,ny); x=nx;y=ny; break; }
      case "A": { num();num();num();num();num(); let nx=num(),ny=num(); if(rel){nx+=x;ny+=y;} ext(nx,ny); x=nx;y=ny; break; }
      case "Z": { x = sx; y = sy; break; }
      default: i++;
    }
  }
  if (minX === Infinity) return null;
  return { minX, minY, maxX, maxY };
}

function cleanSvg(svg) {
  const vb = svg.match(/viewBox="([\d.\- ]+)"/);
  if (!vb) return { svg, removed: 0 };
  const [vx, vy, W, H] = vb[1].trim().split(/\s+/).map(Number);
  const stripLeft = vx + STRIP * W;
  const cornerR = vx + 0.13 * W;
  const cornerT = vy + 0.9 * H;
  let removed = 0;

  // pdftocairo places raster logos via <use transform="translate(e f)scale(s)">
  // and (for some elements) matrix(a,b,c,d,e,f); glyph text uses plain x=/y=.
  // Parse all three so strip-positioned logos are caught, not just x= text.
  const transT = (attrs) => {
    let mm = attrs.match(
      /transform="[^"]*matrix\(\s*[\d.eE+-]+[ ,]+[\d.eE+-]+[ ,]+[\d.eE+-]+[ ,]+[\d.eE+-]+[ ,]+([\d.eE+-]+)[ ,]+([\d.eE+-]+)/,
    );
    if (mm) return { x: parseFloat(mm[1]), y: parseFloat(mm[2]) };
    mm = attrs.match(/transform="[^"]*translate\(\s*([\d.eE+-]+)[ ,]+([\d.eE+-]+)?/);
    if (mm) return { x: parseFloat(mm[1]), y: mm[2] !== undefined ? parseFloat(mm[2]) : 0 };
    return null;
  };
  const attrX = (a) => { const mm = a.match(/\bx="(-?[\d.]+)"/); return mm ? parseFloat(mm[1]) : transT(a)?.x ?? 0; };
  const attrY = (a) => { const mm = a.match(/\by="(-?[\d.]+)"/); return mm ? parseFloat(mm[1]) : transT(a)?.y ?? 0; };
  const posKill = (a) => { const x = attrX(a), y = attrY(a); return x >= stripLeft - 1 || (x <= cornerR && y >= cornerT); };

  let out = svg.replace(/<path\b[^>]*\bd="([^"]*)"[^>]*\/>/g, (full, d) => {
    const b = pathBBox(d);
    if (!b) return full;
    const isBorder = b.maxX - b.minX >= FRAME * W && b.maxY - b.minY >= FRAME * H;
    const inStrip = b.minX >= stripLeft - 1;
    const inCorner = b.maxX <= cornerR && b.minY >= cornerT;
    if (isBorder || inStrip || inCorner) { removed++; return ""; }
    return full;
  });
  out = out.replace(/<use\b([^>]*?)\/>/g, (full, a) => (posKill(a) ? (removed++, "") : full));
  out = out.replace(/<image\b([^>]*?)\/>/g, (full, a) => (posKill(a) ? (removed++, "") : full));
  out = out.replace(/<image\b([^>]*?)>[\s\S]*?<\/image>/g, (full, a) => (posKill(a) ? (removed++, "") : full));
  return { svg: out, removed };
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const ROADS = join(root, "imports", "roads");
const OUT = join(root, "imports", "roads-library-projects");
const SVG_OUT = join(OUT, "svg");

// Each source page -> one library item. Codes keep them grouped + idempotent.
const SHEETS = [
  {
    code: "KALKAL-01",
    pdf: "Pages from Kalkal Road.pdf",
    page: 1,
    name: "Kalkal Road — Typical Cross Section",
    tags: ["cross section", "carriageway", "pavement", "kerb", "sidewalk", "typical section", "kalkal road"],
    description:
      "Typical roadway cross section for Kalkal Road (ST 0+000 to 3+000) — SURP II / NAGMD road rehabilitation, Mogadishu. Pavement build-up, curbs and sidewalks.",
  },
  {
    code: "KALKAL-02",
    pdf: "Pages from Kalkal Road.pdf",
    page: 2,
    name: "Kalkal Road — Curb, Sidewalk & Drainage Details",
    tags: ["kerb", "curb", "sidewalk", "median", "drainage gutter", "concrete details", "kalkal road"],
    description:
      "Curb, mountable curb, median, concrete sidewalk and drainage gutter details for Kalkal Road — SURP II / NAGMD road rehabilitation, Mogadishu.",
  },
  {
    code: "KEYSANEY-01",
    pdf: "Pages from Kaysaney Road.pdf",
    page: 1,
    name: "Keysaney Road — Typical Cross Sections",
    tags: ["cross section", "carriageway", "pavement", "kerb", "sidewalk", "typical section", "keysaney road", "marine junction"],
    description:
      "Typical roadway cross sections for the Marine Junction – Keysaney Hospital Road (multiple chainage ranges) — SURP II / NAGMD road rehabilitation, Mogadishu.",
  },
];

function run(cmd, args) {
  return execFileSync(cmd, args, { stdio: ["ignore", "pipe", "ignore"], maxBuffer: 256 * 1024 * 1024 });
}

mkdirSync(SVG_OUT, { recursive: true });
const manifest = [];

for (const s of SHEETS) {
  const pdf = join(ROADS, s.pdf);
  const tmpSvg = join(tmpdir(), `${s.code}.svg`);
  // pdftocairo honours the page /Rotate flag, so rotated sheets come out upright.
  run("pdftocairo", ["-svg", "-f", String(s.page), "-l", String(s.page), pdf, tmpSvg]);
  const raw = readFileSync(tmpSvg, "utf8");
  // preset-default keeps the viewBox in this svgo version; removeDimensions then
  // drops the root width/height so the sheet always scales to its viewBox aspect
  // (the rotated Keysaney page otherwise emits a malformed height="842pt").
  const { data: optimized } = optimize(raw, {
    multipass: false,
    floatPrecision: 2,
    plugins: ["preset-default", "removeDimensions"],
  });
  // Strip the title block / border / stamp by position (post-svgo).
  const { svg, removed } = cleanSvg(optimized);
  writeFileSync(join(SVG_OUT, `${s.code}.svg`), svg);

  // Thumbnail: low-res PNG of the (rotated) page, cropped to drop the right strip.
  const base = join(tmpdir(), `${s.code}-thumb`);
  const dpi = 22;
  const wpx = Math.round((1191 * dpi) / 72);
  const hpx = Math.round((842 * dpi) / 72);
  run("pdftocairo", [
    "-png", "-singlefile", "-f", String(s.page), "-l", String(s.page),
    "-r", String(dpi), "-x", "0", "-y", "0", "-W", String(Math.round(wpx * STRIP)), "-H", String(hpx),
    pdf, base,
  ]);
  const thumbnail = "data:image/png;base64," + readFileSync(base + ".png").toString("base64");

  manifest.push({
    code: s.code,
    name: s.name,
    category: "civil",
    description: s.description,
    tags: Array.from(new Set([...s.tags, "roadway", "road drawing", "mogadishu"])),
    drawingNo: s.code,
    svgFile: `svg/${s.code}.svg`,
    svgKB: Math.round(svg.length / 1024),
    thumbnail,
  });
  console.log(`✓ ${s.code} "${s.name}"  ${Math.round(svg.length / 1024)}KB  removed ${removed}`);
}

writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`\nWrote ${OUT}/manifest.json (${manifest.length} items).`);
console.log('Upload with:  node scripts/upload-roads-drawings.mjs roads-library-projects');
