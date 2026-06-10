// ------------------------------------------------------------------
// Structural parametric templates (registry-driven).
// The legacy beam/column/footing section generators live in
// parametricBlocks.ts; these templates add the remaining details.
// ------------------------------------------------------------------

import type { DrawingTemplate, TemplateParamValues } from "../templateRegistry";
import {
  CAD,
  svgDoc,
  line,
  rect,
  text,
  dimH,
  dimV,
  leader,
  concreteHatchRect,
  earthTicks,
  gravelRect,
  drawingTitle,
  barDot,
  mmLabel,
} from "../cadPrimitives";

const num = (values: TemplateParamValues, key: string) => values[key] as number;

// ------------------------------------------------------------------
// One-way slab section
// ------------------------------------------------------------------
function buildSlabSection(values: TemplateParamValues) {
  const thk = num(values, "thicknessMm");
  const mainDia = num(values, "mainBarDiaMm");
  const mainSpacing = num(values, "mainSpacingMm");
  const distDia = num(values, "distBarDiaMm");
  const distSpacing = num(values, "distSpacingMm");
  const cover = num(values, "coverMm");

  const s = 0.9; // px per mm vertical
  const x = 120;
  const w = 520;
  const y = 130;
  const h = Math.max(thk * s, 70);
  const coverPx = Math.max(cover * s, 10);

  const parts: string[] = [];
  parts.push(rect(x, y, w, h, { fill: CAD.white, strokeWidth: CAD.thick }));
  parts.push(concreteHatchRect(x + 1.5, y + 1.5, w - 3, h - 3, 13));

  // Bottom main bars (section dots) at spacing
  const spacingPx = Math.max(mainSpacing * 0.42, 26);
  const barY = y + h - coverPx;
  const dots: number[] = [];
  for (let bx = x + 36; bx < x + w - 30; bx += spacingPx) dots.push(bx);
  for (const bx of dots) parts.push(barDot(bx, barY, mainDia * 0.8));
  // Distribution bar (longitudinal line just above main bars)
  parts.push(line(x + 22, barY - Math.max(distDia * 0.5, 5) - 4, x + w - 22, barY - Math.max(distDia * 0.5, 5) - 4, 2.4));

  // Dimensions
  parts.push(dimV(y, y + h, x, x - 36, mmLabel(thk)));
  if (dots.length >= 2) {
    parts.push(dimH(dots[0], dots[1], y + h, y + h + 40, mmLabel(mainSpacing)));
  }

  // Leaders
  const lx = x + w + 70;
  parts.push(leader(dots[Math.max(dots.length - 2, 0)] ?? x + w - 60, barY, lx, y + h - 6, [`T${mmLabel(mainDia)} @ ${mmLabel(mainSpacing)} C/C`, "MAIN BARS (BOTTOM)"]));
  parts.push(leader(x + w - 40, barY - Math.max(distDia * 0.5, 5) - 4, lx, y + 26, [`T${mmLabel(distDia)} @ ${mmLabel(distSpacing)} C/C`, "DISTRIBUTION BARS"]));
  parts.push(text(x + 8, y + h + 22, `COVER ${mmLabel(cover)} mm`, { size: 10.5, anchor: "start" }));

  const titleY = y + h + 96;
  parts.push(drawingTitle(x + w / 2 + 40, titleY, "ONE-WAY SLAB SECTION", "SCALE: NTS"));
  return svgDoc(lx + 190, titleY + 46, parts.join(""));
}

// ------------------------------------------------------------------
// Strip footing detail
// ------------------------------------------------------------------
function buildStripFooting(values: TemplateParamValues) {
  const width = num(values, "widthMm");
  const thk = num(values, "thicknessMm");
  const wallThk = num(values, "wallThkMm");
  const founding = num(values, "foundingMm");

  const s = 0.36; // px per mm
  const cx = 360;
  const ftgW = width * s;
  const ftgH = Math.max(thk * s, 56);
  const wallW = Math.max(wallThk * s, 36);
  const yGround = 120;
  const foundingPx = Math.min(Math.max(founding * s, 130), 320);
  const yFtgTop = yGround + foundingPx - ftgH;
  const xFtg = cx - ftgW / 2;
  const xWall = cx - wallW / 2;

  const parts: string[] = [];

  // Ground line + earth
  parts.push(line(cx - 300, yGround, cx + 300, yGround, 1.3));
  parts.push(earthTicks({ x: cx + 300, y: yGround }, { x: cx - 300, y: yGround }, { spacing: 13, length: 9 }));
  parts.push(text(cx - 250, yGround - 10, "GL", { size: 10.5 }));

  // Wall stem from ground (slightly above) to footing
  parts.push(rect(xWall, yGround - 40, wallW, foundingPx - ftgH + 40, { fill: CAD.white, strokeWidth: CAD.thick }));
  parts.push(concreteHatchRect(xWall + 1.5, yGround - 38, wallW - 3, foundingPx - ftgH + 36, 11));

  // Footing
  parts.push(rect(xFtg, yFtgTop, ftgW, ftgH, { fill: CAD.white, strokeWidth: CAD.thick }));
  parts.push(concreteHatchRect(xFtg + 1.5, yFtgTop + 1.5, ftgW - 3, ftgH - 3, 12));

  // Bottom mat bars with end hooks
  const barY = yFtgTop + ftgH - 13;
  parts.push(line(xFtg + 16, barY, xFtg + ftgW - 16, barY, 2.6));
  parts.push(line(xFtg + 16, barY, xFtg + 16, barY - 14, 2.6));
  parts.push(line(xFtg + ftgW - 16, barY, xFtg + ftgW - 16, barY - 14, 2.6));
  for (let bx = xFtg + 34; bx < xFtg + ftgW - 24; bx += 34) parts.push(barDot(bx, barY - 8, 12));

  // Blinding
  parts.push(rect(xFtg - 14, yFtgTop + ftgH, ftgW + 28, 16, { strokeWidth: CAD.thin }));
  parts.push(gravelRect(xFtg - 14, yFtgTop + ftgH, ftgW + 28, 16, 10));

  // Dims
  parts.push(dimH(xFtg, xFtg + ftgW, yFtgTop + ftgH + 16, yFtgTop + ftgH + 58, mmLabel(width)));
  parts.push(dimV(yFtgTop, yFtgTop + ftgH, xFtg + ftgW, xFtg + ftgW + 44, mmLabel(thk)));
  parts.push(dimV(yGround, yFtgTop + ftgH, xFtg, xFtg - 52, mmLabel(founding)));
  parts.push(dimH(xWall, xWall + wallW, yGround - 40, yGround - 70, mmLabel(wallThk)));

  // Leaders
  parts.push(leader(xFtg + ftgW - 50, barY - 4, xFtg + ftgW + 96, barY - 36, ["T12 @ 200 C/C", "BOTH WAYS"]));
  parts.push(leader(xFtg + 30, yFtgTop + ftgH + 8, xFtg - 80, yFtgTop + ftgH + 44, ["75 mm BLINDING", "C10 CONCRETE"], { anchor: "end" }));

  const titleY = yFtgTop + ftgH + 116;
  parts.push(drawingTitle(cx, titleY, "STRIP FOOTING DETAIL", "SCALE: NTS"));
  return svgDoc(760, titleY + 46, parts.join(""));
}

// ------------------------------------------------------------------
// RC beam elevation (span between two supports)
// ------------------------------------------------------------------
function buildBeamElevation(values: TemplateParamValues) {
  const span = num(values, "spanMm");
  const depth = num(values, "depthMm");
  const support = num(values, "supportWidthMm");
  const stirrupSpacing = num(values, "stirrupSpacingMm");
  const barDia = num(values, "barDiaMm");

  const drawW = 560;
  const s = drawW / (span + support * 2);
  const beamH = Math.max(depth * s * 2.2, 86); // mild vertical exaggeration for clarity
  const supW = Math.max(support * s, 26);
  const x0 = 110;
  const y0 = 150;
  const xs1 = x0 + supW; // clear span start
  const xs2 = x0 + supW + span * s;

  const parts: string[] = [];

  // Supports (columns)
  parts.push(rect(x0, y0, supW, beamH + 96, { fill: CAD.white, strokeWidth: CAD.thick }));
  parts.push(rect(xs2, y0, supW, beamH + 96, { fill: CAD.white, strokeWidth: CAD.thick }));
  parts.push(concreteHatchRect(x0 + 1.5, y0 + beamH + 2, supW - 3, 92, 11));
  parts.push(concreteHatchRect(xs2 + 1.5, y0 + beamH + 2, supW - 3, 92, 11));

  // Beam outline
  parts.push(line(x0 - 24, y0, xs2 + supW + 24, y0, CAD.thick));
  parts.push(line(x0 - 24, y0 + beamH, xs1, y0 + beamH, CAD.thick));
  parts.push(line(xs2, y0 + beamH, xs2 + supW + 24, y0 + beamH, CAD.thick));
  parts.push(line(xs1, y0 + beamH, xs2, y0 + beamH, CAD.thick));

  // Longitudinal bars (dashed, top + bottom)
  parts.push(line(x0 - 10, y0 + 12, xs2 + supW + 10, y0 + 12, 2, CAD.ink, "16 6"));
  parts.push(line(x0 - 10, y0 + beamH - 12, xs2 + supW + 10, y0 + beamH - 12, 2, CAD.ink, "16 6"));

  // Stirrups — denser within d/2 zones near supports (drawn at scaled spacing)
  const spacingPx = Math.max(stirrupSpacing * s, 9);
  const dense = spacingPx * 0.55;
  const zone = Math.min(span * s * 0.25, 120);
  const drawStirrups = (from: number, to: number, step: number) => {
    for (let sx = from; sx <= to; sx += step) {
      parts.push(line(sx, y0 + 7, sx, y0 + beamH - 7, 1.1));
    }
  };
  drawStirrups(xs1 + 8, xs1 + zone, dense);
  drawStirrups(xs1 + zone + dense, xs2 - zone - dense, spacingPx);
  drawStirrups(xs2 - zone, xs2 - 6, dense);

  // Dims
  parts.push(dimH(xs1, xs2, y0 + beamH + 96, y0 + beamH + 130, `CLEAR SPAN ${(span / 1000).toFixed(2)} m`));
  parts.push(dimV(y0, y0 + beamH, x0 - 24, x0 - 56, mmLabel(depth)));

  // Leaders
  const lx = xs2 + supW + 50;
  parts.push(leader(xs2 - zone / 2, y0 + beamH / 2, lx, y0 - 18, [`R8 @ ${mmLabel(stirrupSpacing * 0.5)} C/C`, "AT SUPPORT ZONES"]));
  parts.push(leader((xs1 + xs2) / 2, y0 + beamH - 12, (xs1 + xs2) / 2 - 30, y0 + beamH + 52, [`T${mmLabel(barDia)} MAIN BARS`], { anchor: "start" }));
  parts.push(leader((xs1 + xs2) / 2 + 60, y0 + 12, (xs1 + xs2) / 2 + 96, y0 - 28, [`T${mmLabel(barDia)} TOP BARS`]));
  parts.push(leader((xs1 + xs2) / 2 - 90, y0 + 30, lx, y0 + 30, [`R8 @ ${mmLabel(stirrupSpacing)} C/C`, "MID-SPAN"]));

  const titleY = y0 + beamH + 188;
  parts.push(drawingTitle((x0 + xs2 + supW) / 2, titleY, "BEAM REINFORCEMENT ELEVATION", "SCALE: NTS"));
  return svgDoc(lx + 170, titleY + 46, parts.join(""));
}

// ------------------------------------------------------------------
// Template definitions
// ------------------------------------------------------------------
export const STRUCTURAL_TEMPLATES: DrawingTemplate[] = [
  {
    kind: "slab-section",
    label: "One-way slab section",
    category: "structural",
    description: "RC slab cross section with main and distribution reinforcement, cover note, and thickness dimensions.",
    tags: ["slab", "rebar", "section", "concrete", "reinforcement"],
    assetType: "object",
    params: [
      { key: "thicknessMm", label: "Slab thickness", type: "number", unit: "mm", min: 100, max: 400, step: 25, default: 150 },
      { key: "mainBarDiaMm", label: "Main bar diameter", type: "number", unit: "mm", min: 8, max: 20, step: 2, default: 12 },
      { key: "mainSpacingMm", label: "Main bar spacing", type: "number", unit: "mm", min: 100, max: 300, step: 25, default: 200 },
      { key: "distBarDiaMm", label: "Distribution bar dia", type: "number", unit: "mm", min: 8, max: 16, step: 2, default: 10 },
      { key: "distSpacingMm", label: "Distribution spacing", type: "number", unit: "mm", min: 150, max: 300, step: 25, default: 250 },
      { key: "coverMm", label: "Concrete cover", type: "number", unit: "mm", min: 15, max: 50, step: 5, default: 25 },
    ],
    generate: buildSlabSection,
    presets: [
      {
        id: "slab-150",
        name: "RC Slab Section 150 THK",
        description: "150 mm one-way slab, T12 @ 200 main bars with T10 @ 250 distribution.",
        tags: ["slab", "rebar", "section", "concrete"],
      },
    ],
  },
  {
    kind: "strip-footing",
    label: "Strip footing detail",
    category: "structural",
    description: "Continuous wall footing section with bottom mat, blinding layer, founding depth, and full dimensions.",
    tags: ["footing", "strip footing", "foundation", "rebar", "section"],
    assetType: "object",
    params: [
      { key: "widthMm", label: "Footing width", type: "number", unit: "mm", min: 500, max: 1500, step: 50, default: 800 },
      { key: "thicknessMm", label: "Footing thickness", type: "number", unit: "mm", min: 200, max: 500, step: 25, default: 300 },
      { key: "wallThkMm", label: "Wall thickness", type: "number", unit: "mm", min: 150, max: 400, step: 25, default: 200 },
      { key: "foundingMm", label: "Founding depth", type: "number", unit: "mm", min: 500, max: 2000, step: 100, default: 1000 },
    ],
    generate: buildStripFooting,
    presets: [
      {
        id: "strip-footing-800",
        name: "Strip Footing Detail 800 WIDE",
        description: "800 x 300 strip footing at 1.0 m founding depth with blinding and bottom mat.",
        tags: ["strip footing", "foundation", "detail"],
      },
    ],
  },
  {
    kind: "beam-elevation",
    label: "Beam reinforcement elevation",
    category: "structural",
    description: "Beam elevation between supports showing stirrup zones, longitudinal bars, and clear span dimension.",
    tags: ["beam", "elevation", "stirrups", "rebar", "reinforcement"],
    assetType: "drawing",
    params: [
      { key: "spanMm", label: "Clear span", type: "number", unit: "mm", min: 2000, max: 8000, step: 250, default: 4000 },
      { key: "depthMm", label: "Beam depth", type: "number", unit: "mm", min: 300, max: 900, step: 50, default: 500 },
      { key: "supportWidthMm", label: "Support width", type: "number", unit: "mm", min: 200, max: 400, step: 25, default: 300 },
      { key: "stirrupSpacingMm", label: "Stirrup spacing (mid-span)", type: "number", unit: "mm", min: 100, max: 300, step: 25, default: 150 },
      { key: "barDiaMm", label: "Main bar diameter", type: "number", unit: "mm", min: 12, max: 32, step: 2, default: 16 },
    ],
    generate: buildBeamElevation,
    presets: [
      {
        id: "beam-elevation-4m",
        name: "Beam Elevation 4.0 m Span",
        description: "Reinforcement elevation with dense stirrup zones at supports and T16 main bars.",
        tags: ["beam", "elevation", "rebar"],
      },
    ],
  },
];
