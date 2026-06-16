// Strip the TDOT title block (bottom-right corner) and the outer sheet border
// from a converted roadway-drawing SVG, keeping the drawing, notes and tables.
//
// Strategy (robust to the few sheet-size variants — works in normalised coords):
//   • parse the viewBox → sheet box (minX,minY,W,H)
//   • compute every top-level <path> bbox with a real path walker (svgo emits
//     relative commands, so naive number-scraping is wrong)
//   • DROP a path if either:
//       – border  : its bbox covers ≥ FRAME of both sheet width & height
//       – titleblk : its bbox lies ENTIRELY inside the bottom-right corner box
//                    [ (1-CX)·W , W ] × [ (1-CY)·H , H ]
//     "entirely inside" means a table/notes block that only pokes into the
//     corner is kept — only elements wholly within the corner (the title block)
//     are removed.
//
// Exported as cleanSvg(svg, opts) for the generator; runs standalone for tests:
//   node scripts/clean-roads-svg.mjs in.svg out.svg [CX] [CY]
import { readFileSync, writeFileSync } from "node:fs";

const FRAME = 0.94; // bbox ≥ 94% of sheet in both axes ⇒ border frame
const CORNER_X = 0.235; // title-block band width  (fraction of sheet width)
const CORNER_Y = 0.205; // title-block band height (fraction of sheet height)

// --- minimal absolute path walker → bounding box -----------------------------
function pathBBox(d) {
  let x = 0, y = 0, sx = 0, sy = 0;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const ext = (px, py) => {
    if (px < minX) minX = px;
    if (py < minY) minY = py;
    if (px > maxX) maxX = px;
    if (py > maxY) maxY = py;
  };
  // tokenize into [command, ...numbers]
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
      case "M": {
        let nx = num(), ny = num();
        if (rel) { nx += x; ny += y; }
        x = nx; y = ny; sx = x; sy = y; ext(x, y);
        cmd = rel ? "l" : "L"; // subsequent pairs are implicit lineto
        break;
      }
      case "L": {
        let nx = num(), ny = num();
        if (rel) { nx += x; ny += y; }
        x = nx; y = ny; ext(x, y);
        break;
      }
      case "H": {
        let nx = num();
        if (rel) nx += x;
        x = nx; ext(x, y);
        break;
      }
      case "V": {
        let ny = num();
        if (rel) ny += y;
        y = ny; ext(x, y);
        break;
      }
      case "C": {
        let x1 = num(), y1 = num(), x2 = num(), y2 = num(), nx = num(), ny = num();
        if (rel) { x1 += x; y1 += y; x2 += x; y2 += y; nx += x; ny += y; }
        ext(x1, y1); ext(x2, y2); ext(nx, ny);
        x = nx; y = ny;
        break;
      }
      case "S": case "Q": {
        let x1 = num(), y1 = num(), nx = num(), ny = num();
        if (rel) { x1 += x; y1 += y; nx += x; ny += y; }
        ext(x1, y1); ext(nx, ny);
        x = nx; y = ny;
        break;
      }
      case "T": {
        let nx = num(), ny = num();
        if (rel) { nx += x; ny += y; }
        ext(nx, ny); x = nx; y = ny;
        break;
      }
      case "A": {
        num(); num(); num(); num(); num(); // rx ry rot large sweep
        let nx = num(), ny = num();
        if (rel) { nx += x; ny += y; }
        ext(nx, ny); x = nx; y = ny;
        break;
      }
      case "Z": { x = sx; y = sy; break; }
      default: i++; // safety
    }
  }
  if (minX === Infinity) return null;
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

export function cleanSvg(svg, opts = {}) {
  const cx = opts.cornerX ?? CORNER_X;
  const cy = opts.cornerY ?? CORNER_Y;
  const vb = svg.match(/viewBox="([\d.\- ]+)"/);
  if (!vb) return { svg, removed: 0, total: 0 };
  const [vx, vy, W, H] = vb[1].trim().split(/\s+/).map(Number);
  const cornerLeft = vx + (1 - cx) * W;
  const cornerTop = vy + (1 - cy) * H;

  let removed = 0;
  let total = 0;
  // Operate only on <path d="…"/> elements (the flat pdftocairo output).
  const out = svg.replace(/<path\b[^>]*\bd="([^"]*)"[^>]*\/>/g, (full, d) => {
    total++;
    const b = pathBBox(d);
    if (!b) return full;
    const isBorder = b.w >= FRAME * W && b.h >= FRAME * H;
    // Title block: element centred in the bottom-right corner AND title-block-
    // sized. This catches the frame box + its text, while sparing wide tables /
    // bottom-centre note panels that merely reach toward the corner.
    const cxC = b.minX + b.w / 2;
    const cyC = b.minY + b.h / 2;
    const inCorner =
      cxC >= cornerLeft && cyC >= cornerTop && b.w <= 0.34 * W && b.h <= 0.3 * H;
    if (isBorder || inCorner) {
      removed++;
      return "";
    }
    return full;
  });
  return { svg: out, removed, total };
}

// --- standalone test ----------------------------------------------------------
if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("clean-roads-svg.mjs")) {
  const [, , inFile, outFile, cxArg, cyArg] = process.argv;
  const svg = readFileSync(inFile, "utf8");
  const r = cleanSvg(svg, {
    cornerX: cxArg ? Number(cxArg) : undefined,
    cornerY: cyArg ? Number(cyArg) : undefined,
  });
  writeFileSync(outFile, r.svg);
  console.log(`${inFile}: removed ${r.removed}/${r.total} paths → ${outFile}`);
}
