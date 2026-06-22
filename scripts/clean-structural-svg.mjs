// Strip the bottom title-block strip (project/drawing-title bar + logos) and the
// outer sheet border from a pdftocairo-converted structural-drawing SVG, keeping
// the drawing, notes and tables.
//
// Unlike the flat roadway SVGs (clean-roads-svg.mjs), these sheets keep live
// text as <use> glyph references and embed raster logos as <image>, and every
// stroke <path> carries its own affine transform. So removal is transform-aware:
//   • <image>            → always dropped (logos only ever sit in the title block)
//   • <use x= y=>        → dropped when its baseline y is in the bottom band
//                          (use coordinates are already in viewBox space)
//   • <path d= transform>→ dropped when its transform-mapped bbox is either the
//                          outer border (≥ FRAME of both axes) or wholly inside
//                          the bottom band (the title strip's rules/tables)
// Glyph <defs> are left untouched so the surviving <use>s still resolve.
//
// Exported as cleanStructuralSvg(svg, opts) for the generator; runs standalone:
//   node scripts/clean-structural-svg.mjs in.svg out.svg [bandFraction]
import { readFileSync, writeFileSync } from "node:fs";

const FRAME = 0.94; // bbox ≥ 94% of sheet in both axes ⇒ outer border frame

// --- minimal absolute path walker → local bounding box -----------------------
function pathBBox(d) {
  let x = 0, y = 0, sx = 0, sy = 0;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const ext = (px, py) => {
    if (px < minX) minX = px;
    if (py < minY) minY = py;
    if (px > maxX) maxX = px;
    if (py > maxY) maxY = py;
  };
  const re = /([MmLlHhVvCcSsQqTtAaZz])|(-?\d*\.?\d+(?:e[-+]?\d+)?)/gi;
  const toks = [];
  let m;
  while ((m = re.exec(d))) toks.push(m[1] || parseFloat(m[2]));
  let i = 0;
  let cmd = null;
  const num = () => toks[i++];
  while (i < toks.length) {
    if (typeof toks[i] === "string") cmd = toks[i++];
    const rel = cmd === cmd?.toLowerCase();
    switch (cmd?.toUpperCase()) {
      case "M": { let nx = num(), ny = num(); if (rel) { nx += x; ny += y; } x = nx; y = ny; sx = x; sy = y; ext(x, y); cmd = rel ? "l" : "L"; break; }
      case "L": { let nx = num(), ny = num(); if (rel) { nx += x; ny += y; } x = nx; y = ny; ext(x, y); break; }
      case "H": { let nx = num(); if (rel) nx += x; x = nx; ext(x, y); break; }
      case "V": { let ny = num(); if (rel) ny += y; y = ny; ext(x, y); break; }
      case "C": { let x1 = num(), y1 = num(), x2 = num(), y2 = num(), nx = num(), ny = num(); if (rel) { x1 += x; y1 += y; x2 += x; y2 += y; nx += x; ny += y; } ext(x1, y1); ext(x2, y2); ext(nx, ny); x = nx; y = ny; break; }
      case "S": case "Q": { let x1 = num(), y1 = num(), nx = num(), ny = num(); if (rel) { x1 += x; y1 += y; nx += x; ny += y; } ext(x1, y1); ext(nx, ny); x = nx; y = ny; break; }
      case "T": { let nx = num(), ny = num(); if (rel) { nx += x; ny += y; } ext(nx, ny); x = nx; y = ny; break; }
      case "A": { num(); num(); num(); num(); num(); let nx = num(), ny = num(); if (rel) { nx += x; ny += y; } ext(nx, ny); x = nx; y = ny; break; }
      case "Z": { x = sx; y = sy; break; }
      default: i++;
    }
  }
  if (minX === Infinity) return null;
  return { minX, minY, maxX, maxY };
}

// Parse a transform="matrix(a,b,c,d,e,f)" (the only form pdftocairo emits per
// path); default to identity. Returns [a,b,c,d,e,f].
function parseMatrix(attr) {
  if (!attr) return [1, 0, 0, 1, 0, 0];
  const m = attr.match(/matrix\(\s*([-\d.eE,\s]+)\)/);
  if (!m) return [1, 0, 0, 1, 0, 0];
  const n = m[1].split(/[\s,]+/).map(Number).filter((v) => Number.isFinite(v));
  return n.length === 6 ? n : [1, 0, 0, 1, 0, 0];
}

// Map a local bbox through an affine matrix → axis-aligned viewBox bbox.
function mapBBox(b, [a, bb, c, d, e, f]) {
  const xs = [b.minX, b.maxX];
  const ys = [b.minY, b.maxY];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const lx of xs) for (const ly of ys) {
    const X = a * lx + c * ly + e;
    const Y = bb * lx + d * ly + f;
    if (X < minX) minX = X;
    if (Y < minY) minY = Y;
    if (X > maxX) maxX = X;
    if (Y > maxY) maxY = Y;
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

export function cleanStructuralSvg(svg, opts = {}) {
  const band = opts.band ?? 0.1; // bottom title-strip height (fraction of sheet)
  const vb = svg.match(/viewBox="([\d.\- ]+)"/);
  if (!vb) return { svg, removedPaths: 0, removedUses: 0, removedImages: 0 };
  const [vx, vy, W, H] = vb[1].trim().split(/\s+/).map(Number);
  const bandTop = vy + (1 - band) * H;

  let removedImages = 0;
  let removedUses = 0;
  let removedPaths = 0;

  // 1. Drop every embedded raster (title-block logos) wherever they live —
  // pdftocairo defines them in <defs> and places them with a transform <use>.
  svg = svg
    .replace(/<image\b[^>]*?\/>/g, () => { removedImages++; return ""; })
    .replace(/<image\b[^>]*?>[\s\S]*?<\/image>/g, () => { removedImages++; return ""; });

  // Keep glyph <defs> verbatim; only clean the rendered content after them.
  const defsEnd = svg.indexOf("</defs>");
  const head = defsEnd >= 0 ? svg.slice(0, defsEnd + 7) : "";
  let body = defsEnd >= 0 ? svg.slice(defsEnd + 7) : svg;

  // 2. Drop title-strip text (and the now-orphaned logo <use>): a <use> whose
  // baseline y is in the band — y comes from the y attribute, or, when the glyph
  // is placed by a transform, from the matrix translate (f component).
  body = body.replace(/<use\b[^>]*?\/>/g, (tag) => {
    let y = null;
    const my = tag.match(/\by=["']([-\d.]+)["']/);
    if (my) y = parseFloat(my[1]);
    else {
      const mt = tag.match(/transform="matrix\(\s*([-\d.eE,\s]+)\)"/);
      if (mt) {
        const n = mt[1].split(/[\s,]+/).map(Number).filter((v) => Number.isFinite(v));
        if (n.length >= 6) y = n[5];
      }
    }
    if (y !== null && y >= bandTop) { removedUses++; return ""; }
    return tag;
  });

  // 3. Drop border + title-strip rules/tables: transform-mapped path bboxes.
  body = body.replace(/<path\b([^>]*?)\/>/g, (tag, attrs) => {
    const dm = attrs.match(/\bd="([^"]*)"/);
    if (!dm) return tag;
    const local = pathBBox(dm[1]);
    if (!local) return tag;
    const tm = attrs.match(/\btransform="([^"]*)"/);
    const box = mapBBox(local, parseMatrix(tm ? tm[1] : null));
    // Border frame: the full rectangle, or any single full-span thin rule (the
    // sheet edges are drawn as separate top/bottom/left/right lines, and the
    // title strip is divided by full-width rules). Drawing geometry is inset and
    // never spans ≥94% of the whole sheet as one hairline, so this is safe.
    const isFrame =
      (box.w >= FRAME * W && box.h >= FRAME * H) ||
      (box.w >= FRAME * W && box.h <= 0.015 * H) ||
      (box.h >= FRAME * H && box.w <= 0.015 * W);
    const inBand = box.minY >= bandTop;
    if (isFrame || inBand) { removedPaths++; return ""; }
    return tag;
  });

  return { svg: head + body, removedPaths, removedUses, removedImages };
}

// Boost hairline strokes so the drawing reads crisply on screen. The source
// PDFs use print-weight hairlines (e.g. 0.12 / 0.72 units in a ~1191-wide
// viewBox) which fall well under a pixel once the sheet is scaled to fit the
// canvas, so the drawing looks faint. We scale every stroke and floor it at a
// fraction of the sheet width — viewBox-relative so larger sheets (which get
// shrunk more to fit) land at the same on-screen weight. Existing heavier
// strokes are only ever raised, never thinned, so the line-weight hierarchy is
// preserved.
export function boostStrokeWidths(svg, opts = {}) {
  const scale = opts.scale ?? 1.8;
  const minFrac = opts.minFrac ?? 0.00035;
  const vb = svg.match(/viewBox="([\d.\- ]+)"/);
  const W = vb ? parseFloat(vb[1].trim().split(/\s+/)[2]) : 1191;
  const min = W * minFrac;
  return svg.replace(/stroke-width="([\d.]+)"/g, (_m, w) => {
    const next = Math.max(min, parseFloat(w) * scale);
    return `stroke-width="${Number(next.toFixed(2))}"`;
  });
}

// --- standalone test ----------------------------------------------------------
if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("clean-structural-svg.mjs")) {
  const [, , inFile, outFile, bandArg] = process.argv;
  const svg = readFileSync(inFile, "utf8");
  const r = cleanStructuralSvg(svg, { band: bandArg ? Number(bandArg) : undefined });
  writeFileSync(outFile, r.svg);
  console.log(`${inFile}: removed ${r.removedPaths} paths, ${r.removedUses} use, ${r.removedImages} image → ${outFile}`);
}
