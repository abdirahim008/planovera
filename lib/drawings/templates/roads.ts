// ------------------------------------------------------------------
// Roads & highways parametric templates.
// Typical cross-sections use an exaggerated vertical scale, as is
// standard practice for road typical sections.
// ------------------------------------------------------------------

import type { DrawingTemplate, TemplateParamValues } from "../templateRegistry";
import {
  CAD,
  svgDoc,
  line,
  rect,
  polygon,
  text,
  dimH,
  dimV,
  leader,
  concreteHatchRect,
  earthTicks,
  gravelRect,
  centerline,
  drawingTitle,
  slopeMark,
  mmLabel,
} from "../cadPrimitives";

const num = (values: TemplateParamValues, key: string) => values[key] as number;

// Vertical scale for pavement build-up on cross sections (px per mm).
const V = 0.16;

type SurfaceBand = {
  /** Top-edge polyline of the band, left to right. */
  top: Array<{ x: number; y: number }>;
  thicknessPx: number;
};

/** Fill a sloped band (parallelogram chain) with deterministic gravel circles. */
function bandGravel(band: SurfaceBand, step = 13, rBase = 1.7) {
  const parts: string[] = [];
  for (let i = 0; i < band.top.length - 1; i += 1) {
    const a = band.top[i];
    const b = band.top[i + 1];
    const segW = b.x - a.x;
    if (segW < step) continue;
    const rows = Math.max(Math.floor((band.thicknessPx - 4) / step), 1);
    for (let row = 0; row < rows; row += 1) {
      const depth = (row + 0.6) * (band.thicknessPx / (rows + 0.2));
      const shift = (row % 2) * step * 0.5;
      for (let x = a.x + step / 2 + shift; x < b.x - step / 3; x += step) {
        const t = (x - a.x) / segW;
        const y = a.y + (b.y - a.y) * t + depth;
        const r = rBase + ((row + Math.round(x)) % 3) * 0.4;
        parts.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" stroke="${CAD.faint}" stroke-width="0.8" fill="none"/>`);
      }
    }
  }
  return parts.join("");
}

/** Band outline: top polyline, bottom polyline (offset down), closed ends. */
function bandOutline(band: SurfaceBand, opts: { fill?: string; strokeWidth?: number } = {}) {
  const top = band.top;
  const bottom = [...top].reverse().map((p) => ({ x: p.x, y: p.y + band.thicknessPx }));
  return polygon([...top, ...bottom], { fill: opts.fill, strokeWidth: opts.strokeWidth ?? CAD.thin });
}

// ------------------------------------------------------------------
// Shared carriageway cross-section builder (single + dual).
// ------------------------------------------------------------------
function buildCrossSection(values: TemplateParamValues, dual: boolean) {
  const lanes = num(values, "lanes");
  const laneW = num(values, "laneWidthM");
  const shoulderM = num(values, "shoulderWidthM");
  const medianM = dual ? num(values, "medianWidthM") : 0;
  const crossfall = num(values, "crossfallPct");
  const wearingMm = num(values, "wearingMm");
  const baseMm = num(values, "baseMm");
  const subbaseMm = num(values, "subbaseMm");

  const carW = dual ? lanes * laneW : (lanes * laneW) / 2; // metres per side of centre
  const halfM = carW + shoulderM + medianM / 2;
  const totalM = halfM * 2;

  const drawW = 740;
  const hs = drawW / totalM; // px per metre
  const margin = 70;
  const cx = margin + drawW / 2;

  const ySurf = 210; // surface at crown / median edge (high point)
  const dropPx = carW * 1000 * (crossfall / 100) * V;
  const wearPx = Math.max(wearingMm * V, 5);
  const basePx = Math.max(baseMm * V, 10);
  const subbasePx = Math.max(subbaseMm * V, 12);
  const stackPx = wearPx + basePx + subbasePx;

  const xMedL = cx - (medianM / 2) * hs;
  const xMedR = cx + (medianM / 2) * hs;
  const xCarL = xMedL - carW * hs;
  const xCarR = xMedR + carW * hs;
  const xShL = xCarL - shoulderM * hs;
  const xShR = xCarR + shoulderM * hs;

  const yCarL = ySurf + dropPx;
  const yCarR = ySurf + dropPx;
  const shoulderDrop = shoulderM * 1000 * ((crossfall + 1.5) / 100) * V;
  const yShL = yCarL + shoulderDrop;
  const yShR = yCarR + shoulderDrop;

  // Embankment 1:2 down to existing ground
  const embH = 110;
  const toeRun = embH * 2 * 0.55; // foreshortened for drawing
  const xToeL = xShL - toeRun;
  const xToeR = xShR + toeRun;
  const yToeL = yShL + stackPx + embH - stackPx;
  const yToeR = yShR + stackPx + embH - stackPx;
  const yGround = Math.max(yToeL, yToeR) + 4;

  const parts: string[] = [];

  // Surface polyline (left to right)
  const surface: Array<{ x: number; y: number }> = dual
    ? [
        { x: xShL, y: yShL },
        { x: xCarL, y: yCarL },
        { x: xMedL, y: ySurf },
      ]
    : [
        { x: xShL, y: yShL },
        { x: xCarL, y: yCarL },
        { x: cx, y: ySurf },
      ];
  const surfaceR: Array<{ x: number; y: number }> = dual
    ? [
        { x: xMedR, y: ySurf },
        { x: xCarR, y: yCarR },
        { x: xShR, y: yShR },
      ]
    : [
        { x: cx, y: ySurf },
        { x: xCarR, y: yCarR },
        { x: xShR, y: yShR },
      ];

  // Continuous top polyline across the full formation (flat segment under the
  // median for dual carriageways — the median island is drawn over it later).
  const wholeTop = dual ? [...surface, ...surfaceR] : [...surface, ...surfaceR.slice(1)];

  const bands: Array<{ band: SurfaceBand; kind: "wearing" | "base" | "subbase" }> = [];
  const makeBands = (top: Array<{ x: number; y: number }>) => {
    bands.push({ band: { top, thicknessPx: wearPx }, kind: "wearing" });
    bands.push({ band: { top: top.map((p) => ({ x: p.x, y: p.y + wearPx })), thicknessPx: basePx }, kind: "base" });
    bands.push({
      band: { top: top.map((p) => ({ x: p.x, y: p.y + wearPx + basePx })), thicknessPx: subbasePx },
      kind: "subbase",
    });
  };
  makeBands(wholeTop);

  for (const { band, kind } of bands) {
    if (kind === "wearing") {
      parts.push(bandOutline(band, { fill: "#1f2937", strokeWidth: CAD.thin }));
    } else {
      parts.push(bandOutline(band));
      parts.push(bandGravel(band, kind === "base" ? 13 : 10, kind === "base" ? 1.8 : 1.2));
    }
  }

  // Embankment slopes + ground
  const yBotL = yShL + stackPx;
  const yBotR = yShR + stackPx;
  parts.push(line(xShL, yShL, xToeL, yGround, CAD.medium));
  parts.push(line(xShR, yShR, xToeR, yGround, CAD.medium));
  parts.push(line(xShL, yBotL, xShL, yShL, CAD.thin));
  parts.push(line(xShR, yBotR, xShR, yShR, CAD.thin));
  parts.push(line(xToeL - 56, yGround, xToeR + 56, yGround, 1.2));
  parts.push(earthTicks({ x: xToeR + 56, y: yGround }, { x: xToeL - 56, y: yGround }, { spacing: 14, length: 9 }));
  parts.push(earthTicks({ x: xToeL, y: yGround }, { x: xShL, y: yShL }, { spacing: 15, length: 8 }));
  parts.push(earthTicks({ x: xShR, y: yShR }, { x: xToeR, y: yGround }, { spacing: 15, length: 8 }));
  parts.push(slopeMark(xToeL + 6, yGround - 16, 34, 17, "1:2"));
  parts.push(slopeMark(xToeR - 40, yGround - 16, 34, 17, "1:2"));

  // Median island (dual) or centre crown line
  if (dual) {
    const kerbH = 150 * V * 1.6;
    parts.push(rect(xMedL, ySurf - kerbH, xMedR - xMedL, kerbH + wearPx + 4, { fill: CAD.concreteFill, strokeWidth: CAD.medium }));
    parts.push(concreteHatchRect(xMedL, ySurf - kerbH, xMedR - xMedL, kerbH + wearPx + 4, 9));
    parts.push(text((xMedL + xMedR) / 2, ySurf - kerbH - 8, "MEDIAN", { size: 10.5 }));
  }
  parts.push(centerline(cx, ySurf - 64, cx, yGround + 22));
  parts.push(text(cx + 5, ySurf - 68, "CL", { size: 11, anchor: "start" }));

  // Crossfall arrows + labels on surface
  const fallLabel = `${crossfall.toFixed(1)}%`;
  const midL = { x: (xCarL + (dual ? xMedL : cx)) / 2, y: (yCarL + ySurf) / 2 };
  const midR = { x: (xCarR + (dual ? xMedR : cx)) / 2, y: (yCarR + ySurf) / 2 };
  parts.push(text(midL.x, midL.y - 10, fallLabel, { size: 10.5 }));
  parts.push(text(midR.x, midR.y - 10, fallLabel, { size: 10.5 }));

  // Layer leaders (right side)
  const lx = xShR + 86;
  parts.push(leader(xCarR - 26, yCarR + wearPx / 2 + 1, lx, yCarR - 26, [`WEARING COURSE ${mmLabel(wearingMm)} THK`]));
  parts.push(leader(xCarR - 60, yCarR + wearPx + basePx / 2, lx, yCarR + 12, [`BASE COURSE ${mmLabel(baseMm)} THK`]));
  parts.push(leader(xCarR - 96, yCarR + wearPx + basePx + subbasePx / 2, lx, yCarR + 50, [`SUB-BASE ${mmLabel(subbaseMm)} THK`]));
  parts.push(leader(xCarR - 130, yCarR + stackPx + 12, lx, yCarR + 88, ["COMPACTED SUBGRADE"]));

  // Dimension chain along the bottom
  const yDim = yGround + 46;
  const laneText = dual
    ? `${lanes} LANES @ ${laneW.toFixed(2)} = ${(lanes * laneW).toFixed(2)} m`
    : `${Math.round(lanes / 2)} LANE @ ${laneW.toFixed(2)} m`;
  parts.push(dimH(xShL, xCarL, yGround, yDim, `${shoulderM.toFixed(2)} m`, { textAbove: true }));
  parts.push(dimH(xCarR, xShR, yGround, yDim, `${shoulderM.toFixed(2)} m`, { textAbove: true }));
  if (dual) {
    parts.push(dimH(xCarL, xMedL, yGround, yDim, laneText));
    parts.push(dimH(xMedR, xCarR, yGround, yDim, laneText));
    parts.push(dimH(xMedL, xMedR, yGround, yDim, `${medianM.toFixed(2)} m`));
  } else {
    parts.push(dimH(xCarL, cx, yGround, yDim, laneText));
    parts.push(dimH(cx, xCarR, yGround, yDim, laneText));
  }
  parts.push(dimH(xShL, xShR, yGround, yDim + 36, `TOTAL ROAD FORMATION = ${totalM.toFixed(2)} m`));

  // Title
  const titleY = yDim + 86;
  parts.push(
    drawingTitle(
      cx,
      titleY,
      dual ? "TYPICAL CROSS SECTION - DUAL CARRIAGEWAY" : "TYPICAL CROSS SECTION - SINGLE CARRIAGEWAY",
      "SCALE: NTS (VERTICAL SCALE EXAGGERATED)",
    ),
  );

  const width = margin * 2 + drawW + 300;
  const height = titleY + 46;
  return svgDoc(width, height, parts.join(""));
}

// ------------------------------------------------------------------
// Pavement layers detail
// ------------------------------------------------------------------
function buildPavementDetail(values: TemplateParamValues) {
  const wearingMm = num(values, "wearingMm");
  const binderMm = num(values, "binderMm");
  const baseMm = num(values, "baseMm");
  const subbaseMm = num(values, "subbaseMm");

  const vs = 0.5; // px per mm — detail scale
  const x = 120;
  const w = 380;
  let y = 90;
  const lx = x + w + 80;
  const parts: string[] = [];

  const layers: Array<{ name: string; mm: number; kind: "asphalt" | "asphalt2" | "gravel" | "gravel2" }> = [
    { name: "ASPHALT WEARING COURSE", mm: wearingMm, kind: "asphalt" },
    { name: "ASPHALT BINDER COURSE", mm: binderMm, kind: "asphalt2" },
    { name: "GRANULAR BASE COURSE", mm: baseMm, kind: "gravel" },
    { name: "GRANULAR SUB-BASE", mm: subbaseMm, kind: "gravel2" },
  ];

  for (const layer of layers) {
    if (layer.mm <= 0) continue;
    const h = Math.max(layer.mm * vs, 16);
    if (layer.kind === "asphalt") {
      parts.push(rect(x, y, w, h, { fill: "#1f2937", strokeWidth: CAD.thin }));
    } else if (layer.kind === "asphalt2") {
      parts.push(rect(x, y, w, h, { fill: "#4b5563", strokeWidth: CAD.thin }));
    } else {
      parts.push(rect(x, y, w, h, { strokeWidth: CAD.thin }));
      parts.push(gravelRect(x, y, w, h, layer.kind === "gravel" ? 15 : 11));
    }
    parts.push(leader(x + w - 30, y + h / 2, lx, y + h / 2, [`${layer.name}`, `${mmLabel(layer.mm)} mm THK`]));
    parts.push(dimV(y, y + h, x, x - 28, `${mmLabel(layer.mm)}`));
    y += h;
  }

  // Subgrade
  parts.push(line(x - 36, y, x + w + 36, y, 1.4));
  parts.push(earthTicks({ x: x + w + 36, y }, { x: x - 36, y }, { spacing: 13, length: 9 }));
  parts.push(leader(x + w - 60, y + 14, lx, y + 34, ["COMPACTED SUBGRADE", "(95% MDD AASHTO T180)"]));

  const total = wearingMm + binderMm + baseMm + subbaseMm;
  parts.push(dimV(90, y, x, x - 64, `TOTAL ${mmLabel(total)}`));

  const titleY = y + 84;
  parts.push(drawingTitle((x + lx) / 2, titleY, "PAVEMENT STRUCTURE DETAIL", "SCALE: NTS"));
  return svgDoc(lx + 220, titleY + 46, parts.join(""));
}

// ------------------------------------------------------------------
// Kerb and channel detail
// ------------------------------------------------------------------
function buildKerbDetail(values: TemplateParamValues) {
  const kerbHeightMm = num(values, "kerbHeightMm");
  const kerbWidthMm = num(values, "kerbWidthMm");
  const channelWidthMm = num(values, "channelWidthMm");
  const channelThkMm = num(values, "channelThkMm");

  const s = 0.62; // px per mm
  const x0 = 250;
  const yRoad = 250; // road surface level
  const kerbW = kerbWidthMm * s;
  const kerbH = kerbHeightMm * s;
  const chW = channelWidthMm * s;
  const chT = channelThkMm * s;
  const batter = kerbH * 0.18;

  const parts: string[] = [];

  // Channel slab (left of kerb, at road level, falls toward kerb)
  const chXL = x0;
  const chXR = x0 + chW;
  const chFall = 12;
  // Kerb block (battered front face)
  const kXL = chXR;
  const kXR = chXR + kerbW;
  const kerbTop = yRoad - kerbH + chFall;

  const kerbPoly = [
    { x: kXL, y: yRoad + chFall },          // toe at channel
    { x: kXL + batter, y: kerbTop },        // battered face
    { x: kXR, y: kerbTop },
    { x: kXR, y: yRoad + chFall + chT + 26 },
    { x: kXL, y: yRoad + chFall + chT + 26 },
  ];
  const channelPoly = [
    { x: chXL, y: yRoad },
    { x: chXR, y: yRoad + chFall },
    { x: chXR, y: yRoad + chFall + chT },
    { x: chXL, y: yRoad + chT },
  ];

  parts.push(polygon(channelPoly, { fill: CAD.concreteFill, strokeWidth: CAD.thick }));
  parts.push(polygon(kerbPoly, { fill: CAD.concreteFill, strokeWidth: CAD.thick }));
  // Concrete hatch (approximate with rects inside shapes)
  parts.push(concreteHatchRect(chXL + 3, yRoad + chFall * 0.5 + 3, chW - 6, chT - 5, 10));
  parts.push(concreteHatchRect(kXL + batter + 2, kerbTop + 3, kerbW - batter - 5, kerbH + chT + 20, 10));

  // Road surface to the left
  parts.push(rect(x0 - 120, yRoad - 9, 120, 9, { fill: "#1f2937", strokeWidth: CAD.thin }));
  parts.push(text(x0 - 60, yRoad - 18, "ROAD SURFACE", { size: 10 }));
  // Backfill behind kerb
  parts.push(line(kXR, kerbTop, kXR + 110, kerbTop, 1.2));
  parts.push(earthTicks({ x: kXR + 110, y: kerbTop }, { x: kXR, y: kerbTop }, { spacing: 12, length: 8 }));
  parts.push(text(kXR + 56, kerbTop - 10, "FOOTPATH / VERGE", { size: 10 }));

  // Bedding
  const bedY = yRoad + chFall + chT + 26;
  parts.push(rect(chXL - 18, Math.max(yRoad + chT, bedY - 20), kXR - chXL + 36, 20 + (bedY - Math.max(yRoad + chT, bedY - 20)) * 0 + 0, { strokeWidth: CAD.thin }));
  parts.push(gravelRect(chXL - 18, Math.max(yRoad + chT, bedY - 20), kXR - chXL + 36, 20, 11));
  parts.push(leader(chXL + 30, Math.max(yRoad + chT, bedY - 20) + 10, chXL - 60, bedY + 30, ["CONCRETE BEDDING", "CLASS C15"], { anchor: "end" }));

  // Dimensions
  parts.push(dimH(chXL, chXR, yRoad + chT, yRoad + chT + 78, mmLabel(channelWidthMm)));
  parts.push(dimH(kXL, kXR, yRoad + chT, yRoad + chT + 78, mmLabel(kerbWidthMm)));
  parts.push(dimV(kerbTop, yRoad + chFall, kXR, kXR + 150, mmLabel(kerbHeightMm)));
  parts.push(dimV(yRoad + chFall, yRoad + chFall + chT, chXR + 0, kXR + 186, mmLabel(channelThkMm)));
  parts.push(leader(kXL + batter / 2 + 2, (yRoad + chFall + kerbTop) / 2, kXL - 70, kerbTop - 24, ["PRECAST CONCRETE KERB", "BATTERED FACE"], { anchor: "end" }));

  const titleY = yRoad + chT + 134;
  parts.push(drawingTitle(x0 + (kXR + 180 - x0) / 2, titleY, "KERB AND CHANNEL DETAIL", "SCALE: NTS"));
  return svgDoc(kXR + 260, titleY + 46, parts.join(""));
}

// ------------------------------------------------------------------
// Template definitions
// ------------------------------------------------------------------
export const ROAD_TEMPLATES: DrawingTemplate[] = [
  {
    kind: "road-dual-carriageway",
    label: "Dual carriageway cross section",
    category: "civil",
    description: "Typical dual carriageway cross section with median, shoulders, pavement build-up, embankment slopes, and full dimension chain.",
    tags: ["road", "highway", "dual carriageway", "cross section", "typical", "pavement"],
    assetType: "drawing",
    params: [
      { key: "lanes", label: "Lanes per carriageway", type: "number", unit: "no.", min: 1, max: 4, integer: true, default: 2 },
      { key: "laneWidthM", label: "Lane width", type: "number", unit: "m", min: 2.7, max: 3.65, step: 0.05, default: 3.5 },
      { key: "medianWidthM", label: "Median width", type: "number", unit: "m", min: 0.6, max: 10, step: 0.1, default: 2 },
      { key: "shoulderWidthM", label: "Shoulder width", type: "number", unit: "m", min: 0.5, max: 3, step: 0.25, default: 1.5 },
      { key: "crossfallPct", label: "Crossfall", type: "number", unit: "%", min: 1.5, max: 4, step: 0.5, default: 2.5 },
      { key: "wearingMm", label: "Wearing course", type: "number", unit: "mm", min: 30, max: 100, step: 5, default: 50 },
      { key: "baseMm", label: "Base course", type: "number", unit: "mm", min: 100, max: 300, step: 25, default: 150 },
      { key: "subbaseMm", label: "Sub-base", type: "number", unit: "mm", min: 100, max: 400, step: 25, default: 200 },
    ],
    generate: (values) => buildCrossSection(values, true),
    presets: [
      {
        id: "road-dual-2x2",
        name: "Dual Carriageway 2x2 Typical Section",
        description: "Two lanes per direction, 3.50 m lanes, 2.0 m median, 1.5 m shoulders. Edit lanes, widths, crossfall, and pavement build-up after insert.",
        tags: ["road", "dual carriageway", "typical section", "highway"],
      },
      {
        id: "road-dual-3x2",
        name: "Dual Carriageway 3x3 Typical Section",
        description: "Three lanes per direction with 4.5 m median for trunk highways.",
        tags: ["road", "dual carriageway", "trunk road", "highway"],
        values: { lanes: 3, medianWidthM: 4.5, shoulderWidthM: 2.5 },
      },
    ],
  },
  {
    kind: "road-single-carriageway",
    label: "Single carriageway cross section",
    category: "civil",
    description: "Typical two-way single carriageway with centre crown, shoulders, pavement layers, and embankment.",
    tags: ["road", "single carriageway", "cross section", "typical", "rural road"],
    assetType: "drawing",
    params: [
      { key: "lanes", label: "Total lanes (both ways)", type: "number", unit: "no.", min: 2, max: 4, integer: true, default: 2 },
      { key: "laneWidthM", label: "Lane width", type: "number", unit: "m", min: 2.7, max: 3.65, step: 0.05, default: 3.5 },
      { key: "shoulderWidthM", label: "Shoulder width", type: "number", unit: "m", min: 0.5, max: 3, step: 0.25, default: 1.5 },
      { key: "crossfallPct", label: "Crossfall", type: "number", unit: "%", min: 1.5, max: 4, step: 0.5, default: 2.5 },
      { key: "wearingMm", label: "Wearing course", type: "number", unit: "mm", min: 30, max: 100, step: 5, default: 50 },
      { key: "baseMm", label: "Base course", type: "number", unit: "mm", min: 100, max: 300, step: 25, default: 150 },
      { key: "subbaseMm", label: "Sub-base", type: "number", unit: "mm", min: 100, max: 400, step: 25, default: 200 },
    ],
    generate: (values) => buildCrossSection(values, false),
    presets: [
      {
        id: "road-single-7m",
        name: "Single Carriageway 7.0 m Typical Section",
        description: "Standard 2-lane two-way road, 3.50 m lanes with 1.5 m shoulders and crowned profile.",
        tags: ["road", "single carriageway", "typical section"],
      },
    ],
  },
  {
    kind: "road-pavement-layers",
    label: "Pavement structure detail",
    category: "civil",
    description: "Flexible pavement build-up detail with hatched layers, thickness dimensions, and specification leaders.",
    tags: ["pavement", "asphalt", "base", "sub-base", "road", "detail"],
    assetType: "object",
    params: [
      { key: "wearingMm", label: "Wearing course", type: "number", unit: "mm", min: 25, max: 100, step: 5, default: 50 },
      { key: "binderMm", label: "Binder course", type: "number", unit: "mm", min: 0, max: 120, step: 5, default: 60 },
      { key: "baseMm", label: "Base course", type: "number", unit: "mm", min: 100, max: 350, step: 25, default: 150 },
      { key: "subbaseMm", label: "Sub-base", type: "number", unit: "mm", min: 100, max: 450, step: 25, default: 200 },
    ],
    generate: buildPavementDetail,
    presets: [
      {
        id: "road-pavement-standard",
        name: "Flexible Pavement Build-Up Detail",
        description: "Asphalt wearing + binder over granular base and sub-base with thickness callouts.",
        tags: ["pavement", "asphalt", "detail", "road"],
      },
    ],
  },
  {
    kind: "road-kerb-channel",
    label: "Kerb and channel detail",
    category: "civil",
    description: "Precast kerb with channel, concrete bedding, batter face, and dimensioned profile.",
    tags: ["kerb", "channel", "road", "drainage", "detail", "precast"],
    assetType: "object",
    params: [
      { key: "kerbHeightMm", label: "Kerb height (exposed)", type: "number", unit: "mm", min: 75, max: 300, step: 25, default: 150 },
      { key: "kerbWidthMm", label: "Kerb width", type: "number", unit: "mm", min: 100, max: 300, step: 25, default: 150 },
      { key: "channelWidthMm", label: "Channel width", type: "number", unit: "mm", min: 150, max: 600, step: 50, default: 300 },
      { key: "channelThkMm", label: "Channel thickness", type: "number", unit: "mm", min: 75, max: 200, step: 25, default: 100 },
    ],
    generate: buildKerbDetail,
    presets: [
      {
        id: "road-kerb-standard",
        name: "Kerb & Channel Detail",
        description: "150 mm precast kerb with 300 mm channel on concrete bedding.",
        tags: ["kerb", "channel", "detail"],
      },
    ],
  },
];
