// Convert the 20-page "typical drawings roads.pdf" (vector A3 landscape sheets)
// into optimised SVG library blocks for the warehouse, stripping the right-edge
// title-block strip + sheet border. Outputs imports/roads-library-typical/.
//
//   node scripts/gen-typical-roads.mjs [--strip 0.85] [--pages 1,2,20]
//
// Upload with: node scripts/upload-roads-drawings.mjs roads-library-typical
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { optimize } from "svgo";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const PDF = join(root, "imports", "roads", "typical drawings roads.pdf");
const OUT = join(root, "imports", "roads-library-typical");
const SVG_OUT = join(OUT, "svg");

const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i !== -1 ? process.argv[i + 1] : d;
};
const STRIP = Number(arg("--strip", "0.80")); // title-block band = rightmost (1-STRIP)
const FRAME = 0.94;
const pagesArg = arg("--pages", "");
const onlyPages = pagesArg ? pagesArg.split(",").map(Number) : null;

// page → metadata (names from visual review; text isn't extractable)
const META = [
  { name: "Typical Road Cross Section", tags: ["cross section", "carriageway", "pavement", "typical section"] },
  { name: "Kerb, Channel & Concrete Sidewalk Details", tags: ["kerb", "channel", "sidewalk", "concrete", "joint"] },
  { name: "Island, Median & Sidewalk Ramp Details", tags: ["island", "median", "sidewalk ramp", "traffic island", "flume"] },
  { name: "Catch Basin Details", tags: ["catch basin", "drainage", "junction box", "gully"] },
  { name: "Precast Manhole Details", tags: ["manhole", "precast", "drainage", "cover"] },
  { name: "Manhole Types & Drop Steps Details", tags: ["manhole", "drop steps", "drainage"] },
  { name: "Speed Hump & Raised Crossing Details", tags: ["speed hump", "speed bump", "raised crossing", "traffic calming"] },
  { name: "Traffic Signs Chart (Regulatory, Warning, Information)", tags: ["traffic signs", "road signs", "regulatory", "warning", "signage"] },
  { name: "Road Sign Installation Details", tags: ["sign post", "sign installation", "mounting", "signage"] },
  { name: "Road Marking Details", tags: ["road marking", "lane marking", "arrows", "road studs", "pavement marking"] },
  { name: "Directional & Information Signage Details", tags: ["signage", "directional sign", "gantry", "information sign"] },
  { name: "Retaining Wall Details", tags: ["retaining wall", "wall", "structural"] },
  { name: "Solar Street Lighting Details", tags: ["solar", "street lighting", "lighting pole", "pv", "footing"] },
  { name: "Typical Pipe Culvert & Headwall Details", tags: ["culvert", "pipe culvert", "headwall", "wingwall", "drainage"] },
  { name: "Wing Wall Details", tags: ["wing wall", "headwall", "retaining", "drainage structure"] },
  { name: "Box Culvert Details", tags: ["box culvert", "culvert", "reinforced concrete", "drainage"] },
  { name: "Pipe Trench & Bedding Details", tags: ["trench", "pipe bedding", "backfill", "drainage"] },
  { name: "Roadside Drainage Ditch Details", tags: ["ditch", "drainage", "side drain", "channel", "superelevation"] },
  { name: "Road Works Traffic Control & Temporary Signs", tags: ["traffic control", "work zone", "temporary signs", "cones", "safety"] },
  { name: "Septic Tank Details", tags: ["septic tank", "sanitation", "wastewater", "soakaway"] },
];

// --- accurate absolute path bbox (svgo emits relative commands) ---
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

// Remove the sheet border + the right-edge title-block strip (elements WHOLLY
// inside the right band so drawings extending from the left are never clipped).
// Also drop <image> tags (the title-block logos).
// Run on the OPTIMISED svg (svgo flattens transforms into absolute path coords,
// so a flat bbox is reliable). Removes, by position only:
//   • the sheet border, the right-edge title-block strip,
//   • the bottom-left "FOR TENDER ONLY" stamp (vector or raster).
// Position-based (not colour/type), so it works whether content is <path>,
// <use> (glyph text) or <image> (logos / raster stamp), and never touches the
// page's own graphics (which are anchored left of the strip / above the corner).
function cleanSvg(svg) {
  const vb = svg.match(/viewBox="([\d.\- ]+)"/);
  if (!vb) return { svg, removed: 0 };
  const [vx, vy, W, H] = vb[1].trim().split(/\s+/).map(Number);
  const stripLeft = vx + STRIP * W;
  const cornerR = vx + 0.13 * W; // bottom-left corner: right edge
  const cornerT = vy + 0.9 * H; //  bottom-left corner: top edge
  let removed = 0;

  const matrixT = (attrs) => {
    const mm = attrs.match(
      /transform="matrix\(\s*[\d.eE+-]+[ ,]+[\d.eE+-]+[ ,]+[\d.eE+-]+[ ,]+[\d.eE+-]+[ ,]+([\d.eE+-]+)[ ,]+([\d.eE+-]+)/,
    );
    return mm ? { x: parseFloat(mm[1]), y: parseFloat(mm[2]) } : null;
  };
  const attrX = (a) => {
    const m = a.match(/\bx="(-?[\d.]+)"/);
    return m ? parseFloat(m[1]) : matrixT(a)?.x ?? 0;
  };
  const attrY = (a) => {
    const m = a.match(/\by="(-?[\d.]+)"/);
    return m ? parseFloat(m[1]) : matrixT(a)?.y ?? 0;
  };
  const posKill = (a) => {
    const x = attrX(a), y = attrY(a);
    return x >= stripLeft - 1 || (x <= cornerR && y >= cornerT);
  };

  // Paths: border (full sheet), strip (wholly right), or stamp (wholly corner).
  let out = svg.replace(/<path\b[^>]*\bd="([^"]*)"[^>]*\/>/g, (full, d) => {
    const b = pathBBox(d);
    if (!b) return full;
    const isBorder = b.maxX - b.minX >= FRAME * W && b.maxY - b.minY >= FRAME * H;
    const inStrip = b.minX >= stripLeft - 1;
    const inCorner = b.maxX <= cornerR && b.minY >= cornerT;
    if (isBorder || inStrip || inCorner) { removed++; return ""; }
    return full;
  });
  // Glyph text (<use>) and logos/raster stamp (<image>) by position.
  out = out.replace(/<use\b([^>]*?)\/>/g, (full, a) => (posKill(a) ? (removed++, "") : full));
  out = out.replace(/<image\b([^>]*?)\/>/g, (full, a) => (posKill(a) ? (removed++, "") : full));
  out = out.replace(/<image\b([^>]*?)>[\s\S]*?<\/image>/g, (full, a) => (posKill(a) ? (removed++, "") : full));
  return { svg: out, removed };
}

function run(cmd, args) {
  return execFileSync(cmd, args, { stdio: ["ignore", "pipe", "ignore"], maxBuffer: 256 * 1024 * 1024 });
}

mkdirSync(SVG_OUT, { recursive: true });
const out = [];
for (let p = 1; p <= META.length; p++) {
  if (onlyPages && !onlyPages.includes(p)) continue;
  const meta = META[p - 1];
  const code = `TDR-${String(p).padStart(2, "0")}`;
  const tmpSvg = join(tmpdir(), `tdr-${p}.svg`);
  run("pdftocairo", ["-svg", "-f", String(p), "-l", String(p), PDF, tmpSvg]);
  const raw = readFileSync(tmpSvg, "utf8");
  // Optimise first (svgo flattens transforms → reliable absolute bboxes), then
  // strip the title block / border / stamp by position.
  const { data: optimized } = optimize(raw, {
    multipass: false,
    floatPrecision: 2,
    plugins: [{ name: "preset-default", params: { overrides: { removeViewBox: false } } }],
  });
  const { svg, removed } = cleanSvg(optimized);
  writeFileSync(join(SVG_OUT, `${code}.svg`), svg);

  // Thumbnail: render the page at low res, cropping off the right title strip.
  const base = join(tmpdir(), `tdr-thumb-${p}`);
  const dpi = 20;
  const wpx = Math.round((1191 * dpi) / 72);
  const hpx = Math.round((842 * dpi) / 72);
  run("pdftocairo", [
    "-png", "-singlefile", "-f", String(p), "-l", String(p),
    "-r", String(dpi), "-x", "0", "-y", "0", "-W", String(Math.round(wpx * STRIP)), "-H", String(hpx),
    PDF, base,
  ]);
  const thumbnail = "data:image/png;base64," + readFileSync(base + ".png").toString("base64");

  out.push({
    code,
    name: meta.name,
    category: "civil",
    description: `${meta.name} — typical roadway standard detail (Mogadishu rehabilitation set). Title block and border removed.`,
    tags: Array.from(new Set([...meta.tags, "roadway", "standard detail", "typical drawing"])),
    svgFile: `svg/${code}.svg`,
    svgKB: Math.round(svg.length / 1024),
    thumbnail,
  });
  console.log(`✓ ${code} "${meta.name}"  ${Math.round(svg.length / 1024)}KB  removed ${removed}`);
}

writeFileSync(join(OUT, "manifest.json"), JSON.stringify(out, null, 2));
console.log(`Wrote ${OUT}/manifest.json (${out.length} items).`);
