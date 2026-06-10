// ------------------------------------------------------------------
// Drainage & earth-retention parametric templates.
// Cross sections in monochrome issued-drawing style: heavy object
// linework, thin arrowed dimensions, concrete hatch, earth ticks,
// uppercase leader notes. All output is fabric-safe (no defs/patterns).
// ------------------------------------------------------------------

import type { DrawingTemplate, TemplateParamValues } from "../templateRegistry";
import {
  CAD,
  svgDoc,
  line,
  rect,
  polygon,
  circle,
  text,
  dimH,
  dimV,
  leader,
  concreteHatchRect,
  earthTicks,
  gravelRect,
  centerline,
  barDot,
  drawingTitle,
  waterLevel,
  mmLabel,
} from "../cadPrimitives";

/** Clamped numeric read — params arrive normalized, but stay safe anyway. */
const val = (values: TemplateParamValues, key: string, min: number, max: number, fallback: number): number => {
  const raw = values[key];
  const num = typeof raw === "number" ? raw : typeof raw === "string" ? parseFloat(raw) : NaN;
  return Number.isFinite(num) ? Math.min(Math.max(num, min), max) : fallback;
};

// ------------------------------------------------------------------
// 1. Box culvert section
// ------------------------------------------------------------------
function buildBoxCulvert(values: TemplateParamValues): string {
  const spanMm = val(values, "spanMm", 900, 4000, 2000);
  const heightMm = val(values, "heightMm", 900, 3500, 1800);
  const wallMm = val(values, "wallThkMm", 200, 500, 300);
  const slabMm = val(values, "slabThkMm", 200, 500, 300);
  const cells = Math.round(val(values, "cells", 1, 3, 1));

  const totalWmm = cells * spanMm + (cells + 1) * wallMm;
  const totalHmm = heightMm + 2 * slabMm;
  const s = Math.min(540 / totalWmm, 330 / totalHmm);

  const x0 = 132;
  const y0 = 118;
  const W = totalWmm * s;
  const H = totalHmm * s;
  const t = wallMm * s;
  const st = slabMm * s;
  const spanPx = spanMm * s;
  const openH = H - 2 * st;
  const bh = Math.max(75 * s, 9); // blinding

  const parts: string[] = [];

  // Earth fill + ground line above the culvert
  const yG = y0 - 42;
  parts.push(line(x0 - 54, yG, x0 + W + 54, yG, 1.3));
  parts.push(earthTicks({ x: x0 + W + 54, y: yG }, { x: x0 - 54, y: yG }, { spacing: 13, length: 9 }));
  parts.push(text(x0 + W / 2, yG - 10, "COMPACTED FILL", { size: 10.5 }));

  // Outer concrete box
  parts.push(rect(x0, y0, W, H, { fill: CAD.white, strokeWidth: CAD.thick }));

  // Concrete hatch in slabs and walls
  parts.push(concreteHatchRect(x0, y0, W, st, 10)); // top slab
  parts.push(concreteHatchRect(x0, y0 + H - st, W, st, 10)); // bottom slab
  for (let i = 0; i <= cells; i += 1) {
    const wx = x0 + i * (spanPx + t);
    parts.push(concreteHatchRect(wx, y0 + st, t, openH, 10));
  }

  // Cell openings + 45° haunches
  const hz = Math.max(Math.min(t, st) * 0.55, 7);
  const tri = (pts: Array<{ x: number; y: number }>) =>
    polygon(pts, { fill: CAD.concreteFill, strokeWidth: CAD.thin });
  for (let c = 0; c < cells; c += 1) {
    const ox = x0 + t + c * (spanPx + t);
    const oy = y0 + st;
    const ib = oy + openH;
    parts.push(rect(ox, oy, spanPx, openH, { fill: CAD.white, strokeWidth: CAD.medium }));
    parts.push(tri([{ x: ox, y: oy }, { x: ox + hz, y: oy }, { x: ox, y: oy + hz }]));
    parts.push(tri([{ x: ox + spanPx, y: oy }, { x: ox + spanPx - hz, y: oy }, { x: ox + spanPx, y: oy + hz }]));
    parts.push(tri([{ x: ox, y: ib }, { x: ox + hz, y: ib }, { x: ox, y: ib - hz }]));
    parts.push(tri([{ x: ox + spanPx, y: ib }, { x: ox + spanPx - hz, y: ib }, { x: ox + spanPx, y: ib - hz }]));
  }

  // Rebar dots along inner faces of top/bottom slabs
  const dotStep = Math.max(26, W / 18);
  for (let xx = x0 + 12; xx <= x0 + W - 12; xx += dotStep) {
    parts.push(barDot(xx, y0 + st - 6, 13));
    parts.push(barDot(xx, y0 + H - st + 6, 13));
  }

  // Blinding layer under base
  parts.push(rect(x0 - 12, y0 + H, W + 24, bh, { strokeWidth: CAD.thin }));
  parts.push(gravelRect(x0 - 12, y0 + H, W + 24, bh, 11));

  // Dimensions — chain along the bottom, heights on the left
  const yObjB = y0 + H + bh;
  const yDim1 = yObjB + 36;
  const yDim2 = yDim1 + 34;
  let cxx = x0;
  for (let c = 0; c < cells; c += 1) {
    parts.push(dimH(cxx, cxx + t, yObjB, yDim1, mmLabel(wallMm)));
    parts.push(dimH(cxx + t, cxx + t + spanPx, yObjB, yDim1, mmLabel(spanMm)));
    cxx += t + spanPx;
  }
  parts.push(dimH(cxx, cxx + t, yObjB, yDim1, mmLabel(wallMm)));
  parts.push(dimH(x0, x0 + W, yObjB, yDim2, mmLabel(totalWmm)));

  const xd1 = x0 - 46;
  const xd2 = x0 - 92;
  parts.push(dimV(y0, y0 + st, x0, xd1, mmLabel(slabMm)));
  parts.push(dimV(y0 + st, y0 + H - st, x0, xd1, mmLabel(heightMm)));
  parts.push(dimV(y0 + H - st, y0 + H, x0, xd1, mmLabel(slabMm)));
  parts.push(dimV(y0, y0 + H, x0, xd2, mmLabel(totalHmm)));

  // Leader notes (right side)
  const lx = x0 + W + 62;
  parts.push(leader(x0 + W - 16, y0 + st - 6, lx, y0 - 8, ["T16 @ 200 C/C"]));
  parts.push(leader(x0 + W - t * 0.5, y0 + H * 0.5, lx, y0 + H * 0.22, ["C30 CONCRETE"]));
  parts.push(leader(x0 + W - 8, y0 + H + bh * 0.5, lx, y0 + H + bh + 22, ["75 mm BLINDING"]));

  const titleY = yDim2 + 50;
  parts.push(drawingTitle(x0 + W / 2, titleY, "BOX CULVERT SECTION", "SCALE: NTS"));
  return svgDoc(x0 + W + 230, titleY + 48, parts.join(""));
}

// ------------------------------------------------------------------
// 2. Pipe culvert section
// ------------------------------------------------------------------
function buildPipeCulvert(values: TemplateParamValues): string {
  const diaMm = val(values, "diaMm", 300, 1800, 900);
  const beddingMm = val(values, "beddingMm", 100, 300, 150);
  const coverMm = val(values, "coverMm", 300, 1500, 600);
  const surroundMm = val(values, "surroundThkMm", 100, 300, 150);

  const wallMm = Math.max(diaMm / 12, 40);
  const outerMm = diaMm + 2 * wallMm;
  const surrMm = outerMm + 2 * surroundMm;
  const totalHmm = coverMm + surrMm + beddingMm;
  const s = Math.min(370 / totalHmm, 300 / surrMm);

  const cx = 360;
  const yRoad = 86;
  const coverPx = coverMm * s;
  const surrPx = surrMm * s;
  const surTk = surroundMm * s;
  const bedPx = Math.max(beddingMm * s, 9);
  const innerR = (diaMm * s) / 2;
  const outerR = (outerMm * s) / 2;
  const halfS = surrPx / 2;
  const ySurr = yRoad + coverPx;
  const cy = ySurr + halfS;
  const yBed = ySurr + surrPx;
  const yFound = yBed + bedPx;
  const xL = cx - Math.max(halfS + 140, 240);
  const xR = 2 * cx - xL;
  const ov = Math.max(50 * s, 14); // bedding overhang

  const parts: string[] = [];

  // Road surface + embankment fill
  parts.push(line(xL, yRoad, xR, yRoad, 2.4));
  parts.push(earthTicks({ x: xR, y: yRoad }, { x: xL, y: yRoad }, { spacing: 13, length: 9 }));
  parts.push(text(xL + 90, yRoad - 12, "ROAD SURFACE", { size: 10.5 }));
  if (coverPx >= 40) {
    parts.push(text((xL + cx - halfS) / 2, yRoad + coverPx * 0.5 + 4, "COMPACTED FILL", { size: 10.5 }));
  }

  // Concrete surround (hatched) then pipe annulus painted over it
  parts.push(rect(cx - halfS, ySurr, surrPx, surrPx, { fill: CAD.white, strokeWidth: CAD.thick }));
  parts.push(concreteHatchRect(cx - halfS, ySurr, surrPx, surrPx, 10));
  parts.push(circle(cx, cy, outerR, { fill: CAD.white, strokeWidth: CAD.thick }));
  parts.push(circle(cx, cy, innerR, { fill: CAD.white, strokeWidth: CAD.medium }));

  // Granular bedding + founding level
  parts.push(rect(cx - halfS - ov, yBed, surrPx + 2 * ov, bedPx, { strokeWidth: CAD.thin }));
  parts.push(gravelRect(cx - halfS - ov, yBed, surrPx + 2 * ov, bedPx, 11));
  parts.push(line(cx - halfS - ov - 30, yFound, cx + halfS + ov + 30, yFound, 1.2));
  parts.push(
    earthTicks(
      { x: cx + halfS + ov + 30, y: yFound },
      { x: cx - halfS - ov - 30, y: yFound },
      { spacing: 13, length: 8 },
    ),
  );

  parts.push(centerline(cx, yRoad - 18, cx, yFound + 14));

  // Dimensions — cover + bedding left, surround thickness right
  parts.push(dimV(yRoad, ySurr, xL, xL - 40, `${mmLabel(coverMm)} COVER`));
  parts.push(dimV(yBed, yFound, cx - halfS - ov, cx - halfS - ov - 36, mmLabel(beddingMm)));
  parts.push(dimV(ySurr, ySurr + surTk, cx + halfS, cx + halfS + 34, mmLabel(surroundMm)));
  parts.push(dimH(cx - halfS, cx + halfS, yFound, yFound + 42, mmLabel(surrMm)));

  // Leader notes (right side)
  const lx = cx + halfS + 96;
  parts.push(leader(cx + innerR * 0.45, cy - innerR * 0.45, lx, cy - 24, [`${mmLabel(diaMm)} DIA CONCRETE PIPE`]));
  parts.push(leader(cx + halfS - 10, yBed - surTk * 0.5, lx, cy + 44, ["C20 CONCRETE SURROUND"]));
  parts.push(leader(cx + halfS * 0.5, yBed + bedPx * 0.5, lx, yFound + 30, ["GRANULAR BEDDING"]));

  const titleY = yFound + 94;
  parts.push(drawingTitle(cx, titleY, "PIPE CULVERT SECTION", "SCALE: NTS"));
  return svgDoc(cx + halfS + 270, titleY + 48, parts.join(""));
}

// ------------------------------------------------------------------
// 3. Trapezoidal side ditch
// ------------------------------------------------------------------
function buildSideDitch(values: TemplateParamValues): string {
  const bMm = val(values, "bottomWidthMm", 300, 1500, 600);
  const dMm = val(values, "depthMm", 300, 1500, 600);
  const slope = val(values, "sideSlopeRun", 1, 3, 1.5);
  const tMm = val(values, "liningThkMm", 0, 150, 75);

  const topWmm = bMm + 2 * slope * dMm;
  const s = Math.min(500 / topWmm, 270 / dMm);
  const dpx = dMm * s;
  const bpx = bMm * s;
  const topW = topWmm * s;
  const tpx = tMm * s;

  const cx = topW / 2 + 170;
  const yg = 132;
  const yb = yg + dpx;
  const xtl = cx - topW / 2;
  const xtr = cx + topW / 2;
  const xbl = cx - bpx / 2;
  const xbr = cx + bpx / 2;

  const parts: string[] = [];

  // Ground lines both sides, earth ticks below
  parts.push(line(xtl - 116, yg, xtl, yg, 1.4));
  parts.push(line(xtr, yg, xtr + 116, yg, 1.4));
  parts.push(earthTicks({ x: xtl, y: yg }, { x: xtl - 116, y: yg }, { spacing: 13, length: 9 }));
  parts.push(earthTicks({ x: xtr + 116, y: yg }, { x: xtr, y: yg }, { spacing: 13, length: 9 }));

  const hasLining = tpx > 0.5;
  const hOff = tpx * Math.sqrt(1 + slope * slope);
  const innerTL = { x: xtl + hOff, y: yg };
  const innerTR = { x: xtr - hOff, y: yg };
  const innerBL = { x: xtl + hOff + (xbl - xtl) * (1 - tpx / dpx), y: yb - tpx };
  const innerBR = { x: xtr - hOff + (xbr - xtr) * (1 - tpx / dpx), y: yb - tpx };

  if (hasLining) {
    // Lining band between excavated face and inner face
    parts.push(
      polygon(
        [{ x: xtl, y: yg }, { x: xbl, y: yb }, { x: xbr, y: yb }, { x: xtr, y: yg }, innerTR, innerBR, innerBL, innerTL],
        { fill: CAD.concreteFill, strokeWidth: CAD.thin },
      ),
    );
    parts.push(concreteHatchRect(innerBL.x, yb - tpx, innerBR.x - innerBL.x, tpx, 8));
    // Perpendicular rungs across the sloped lining bands
    const segL = Math.hypot(xbl - xtl, dpx);
    const dd0 = (Math.abs(xbl - xtl) * tpx) / dpx + 8;
    for (let dd = dd0; dd < segL - 6; dd += 13) {
      const lxx = xtl + ((xbl - xtl) / segL) * dd;
      const lyy = yg + (dpx / segL) * dd;
      parts.push(line(lxx, lyy, lxx + (dpx / segL) * tpx, lyy - ((xbl - xtl) / segL) * tpx, 0.9, CAD.faint));
      const rxx = xtr + ((xbr - xtr) / segL) * dd;
      parts.push(line(rxx, lyy, rxx - (dpx / segL) * tpx, lyy + ((xbr - xtr) / segL) * tpx, 0.9, CAD.faint));
    }
    parts.push(polygon([innerTL, innerBL, innerBR, innerTR], { close: false, strokeWidth: CAD.medium }));
  }

  // Excavated face
  parts.push(
    polygon([{ x: xtl, y: yg }, { x: xbl, y: yb }, { x: xbr, y: yb }, { x: xtr, y: yg }], {
      close: false,
      strokeWidth: CAD.thick,
    }),
  );

  // Water level at ~60% depth of the (lined) channel
  const yW = yb - tpx - 0.6 * (dpx - tpx);
  const frac = (yW - yg) / dpx;
  const xLw = xtl + (xbl - xtl) * frac + (hasLining ? hOff : 0);
  const xRw = xtr + (xbr - xtr) * frac - (hasLining ? hOff : 0);
  parts.push(line(xLw + 2, yW, xRw - 2, yW, 0.9));
  parts.push(waterLevel(cx, yW));

  // Slope marks (mirrored pair, labels above)
  const slopeLabel = `${slope % 1 === 0 ? slope.toFixed(0) : slope.toFixed(1)}:1`;
  const run = 24;
  const rise = run / slope;
  const aL = { x: xtl + (xbl - xtl) * 0.12 + 26, y: yg + dpx * 0.12 };
  parts.push(line(aL.x, aL.y, aL.x + run, aL.y, 1));
  parts.push(line(aL.x + run, aL.y, aL.x + run, aL.y + rise, 1));
  parts.push(line(aL.x, aL.y, aL.x + run, aL.y + rise, 0.9));
  parts.push(text(aL.x + run / 2, aL.y - 7, slopeLabel, { size: 10.5 }));
  const aR = { x: xtr + (xbr - xtr) * 0.12 - 26, y: yg + dpx * 0.12 };
  parts.push(line(aR.x, aR.y, aR.x - run, aR.y, 1));
  parts.push(line(aR.x - run, aR.y, aR.x - run, aR.y + rise, 1));
  parts.push(line(aR.x, aR.y, aR.x - run, aR.y + rise, 0.9));
  parts.push(text(aR.x - run / 2, aR.y - 7, slopeLabel, { size: 10.5 }));

  // Dimensions
  parts.push(dimH(xbl, xbr, yb, yb + 40, mmLabel(bMm)));
  parts.push(dimH(xtl, xtr, yg, yg - 48, mmLabel(topWmm)));
  parts.push(dimV(yg, yb, xtr + 120, xtr + 152, mmLabel(dMm)));

  if (hasLining) {
    const segL = Math.hypot(xbr - xtr, dpx);
    const tgt = {
      x: xtr + ((xbr - xtr) / segL) * (segL * 0.55) - ((dpx / segL) * tpx) / 2,
      y: yg + (dpx / segL) * (segL * 0.55) + (((xbr - xtr) / segL) * tpx) / 2,
    };
    parts.push(leader(tgt.x, tgt.y, xtr + 60, yb + 46, [`${mmLabel(tMm)} THK CONCRETE LINING`]));
  }

  const titleY = yb + 96;
  parts.push(drawingTitle(cx, titleY, "SIDE DITCH SECTION", "SCALE: NTS"));
  return svgDoc(cx + topW / 2 + 240, titleY + 48, parts.join(""));
}

// ------------------------------------------------------------------
// 4. Cantilever retaining wall
// ------------------------------------------------------------------
function buildRetainingWall(values: TemplateParamValues): string {
  const Hmm = val(values, "wallHeightMm", 1000, 6000, 3000);
  const stemTopMm = val(values, "stemTopMm", 200, 400, 250);
  const stemBotRaw = val(values, "stemBotMm", 250, 700, 400);
  const stemBotMm = Math.max(stemBotRaw, stemTopMm);
  const baseThkMm = Math.min(val(values, "baseThkMm", 300, 800, 450), Hmm - 200);
  const toeMm = val(values, "toeMm", 300, 1500, 700);
  const heelMm = val(values, "heelMm", 500, 2500, 1500);

  const baseWmm = toeMm + stemBotMm + heelMm;
  const s = Math.min(350 / Hmm, 400 / baseWmm);

  const x0 = 210;
  const yTop = 112;
  const Hpx = Hmm * s;
  const baseW = baseWmm * s;
  const bt = baseThkMm * s;
  const yBase = yTop + Hpx;
  const yBT = yBase - bt; // top of base slab
  const xF = x0 + toeMm * s; // front (vertical) face of stem
  const stp = stemTopMm * s;
  const sbp = stemBotMm * s;
  const xHeelEnd = x0 + baseW;

  const parts: string[] = [];

  // Stem (battered back face) + base slab, concrete hatched
  parts.push(
    polygon([{ x: xF, y: yBT }, { x: xF, y: yTop }, { x: xF + stp, y: yTop }, { x: xF + sbp, y: yBT }], {
      fill: CAD.concreteFill,
      strokeWidth: CAD.thick,
    }),
  );
  parts.push(rect(x0, yBT, baseW, bt, { fill: CAD.concreteFill, strokeWidth: CAD.thick }));
  parts.push(concreteHatchRect(x0, yBT, baseW, bt, 10));
  parts.push(concreteHatchRect(xF, yTop, stp, yBT - yTop, 10));

  // Granular filter column behind stem
  const gw = Math.max(300 * s, 16);
  const yFillTop = yTop + 12;
  const xbAtFill = xF + stp + ((sbp - stp) * (yFillTop - yTop)) / (yBT - yTop);
  parts.push(
    polygon(
      [
        { x: xbAtFill, y: yFillTop },
        { x: xF + sbp, y: yBT },
        { x: xF + sbp + gw, y: yBT },
        { x: xF + sbp + gw, y: yFillTop },
      ],
      { strokeWidth: CAD.thin },
    ),
  );
  parts.push(gravelRect(xF + sbp, yFillTop, gw, yBT - yFillTop, 12));

  // Retained earth: backfill surface sloping gently up, ticks below
  parts.push(line(xF + stp, yTop, xHeelEnd + 64, yTop - 10, 1.4));
  parts.push(earthTicks({ x: xHeelEnd + 64, y: yTop - 10 }, { x: xF + stp, y: yTop }, { spacing: 14, length: 9 }));

  // Ground line in front of the toe
  const yFG = Math.min(yBase - 600 * s, yBT - 12);
  parts.push(line(x0 - 56, yFG, xF, yFG, 1.4));
  parts.push(earthTicks({ x: xF, y: yFG }, { x: x0 - 56, y: yFG }, { spacing: 13, length: 8 }));

  // Weephole through stem just above front ground
  const cyW = yFG - Math.max(10, 100 * s);
  const xbAtW = xF + stp + ((sbp - stp) * (cyW - yTop)) / (yBT - yTop);
  const cxW = (xF + xbAtW) / 2;
  const rW = Math.max(75 * s * 0.5, 3.5);
  parts.push(circle(cxW, cyW, rW, { fill: CAD.white, strokeWidth: 1.4 }));

  // Leader notes — left for wall items, right for filter
  parts.push(leader(xF + stp * 0.5, yTop + (yBT - yTop) * 0.25, xF - 64, yTop + 26, ["C30 CONCRETE"], { anchor: "end" }));
  parts.push(leader(cxW - rW, cyW, xF - 64, cyW - 56, ["75 DIA WEEPHOLES", "@ 1500 C/C"], { anchor: "end" }));
  parts.push(
    leader(xF + sbp + gw * 0.5, yTop + (yBT - yTop) * 0.4, xF + sbp + gw + 110, yTop - 34, ["GRANULAR FILTER"], {
      anchor: "start",
    }),
  );

  // Dimensions
  parts.push(dimH(xF, xF + stp, yTop, yTop - 32, mmLabel(stemTopMm)));
  parts.push(dimV(yTop, yBase, xHeelEnd, xHeelEnd + 100, mmLabel(Hmm)));
  parts.push(dimV(yBT, yBase, x0, x0 - 44, mmLabel(baseThkMm)));
  parts.push(dimH(x0, xF, yBase, yBase + 40, mmLabel(toeMm)));
  parts.push(dimH(xF, xF + sbp, yBase, yBase + 40, mmLabel(stemBotMm)));
  parts.push(dimH(xF + sbp, xHeelEnd, yBase, yBase + 40, mmLabel(heelMm)));
  parts.push(dimH(x0, xHeelEnd, yBase, yBase + 76, mmLabel(baseWmm)));

  const titleY = yBase + 122;
  parts.push(drawingTitle(x0 + baseW / 2, titleY, "CANTILEVER RETAINING WALL SECTION", "SCALE: NTS"));
  const width = Math.max(x0 + baseW + 190, xF + sbp + gw + 300);
  return svgDoc(width, titleY + 48, parts.join(""));
}

// ------------------------------------------------------------------
// 5. Gabion retaining wall
// ------------------------------------------------------------------
function buildGabionWall(values: TemplateParamValues): string {
  const courses = Math.round(val(values, "courses", 2, 5, 3));
  const boxHMm = val(values, "boxHeightMm", 500, 1000, 1000);
  const boxWMm = val(values, "boxWidthMm", 1000, 2000, 1000);
  const stepMm = val(values, "stepMm", 250, 750, 500);

  const totalHmm = courses * boxHMm;
  const bottomWmm = boxWMm + (courses - 1) * stepMm;
  const s = Math.min(330 / totalHmm, 360 / bottomWmm);

  const x0 = 168;
  const yTop = 118;
  const bhPx = boxHMm * s;
  const bwPx = boxWMm * s;
  const stepPx = stepMm * s;
  const totalH = totalHmm * s;
  const bottomW = bottomWmm * s;
  const yBase = yTop + totalH;
  const xBack = x0 + bottomW;
  const bedH = Math.max(200 * s, 13);
  const yFound = yBase + bedH;

  const parts: string[] = [];

  // Bedding strip + founding level line
  parts.push(rect(x0 - 24, yBase, bottomW + 48, bedH, { strokeWidth: CAD.thin }));
  parts.push(gravelRect(x0 - 24, yBase, bottomW + 48, bedH, 11));
  parts.push(line(x0 - 70, yFound, xBack + 88, yFound, 1.3));
  parts.push(earthTicks({ x: xBack + 88, y: yFound }, { x: x0 - 70, y: yFound }, { spacing: 13, length: 8 }));

  // Gabion boxes, front face stepping back each course, X mesh cross
  for (let i = 0; i < courses; i += 1) {
    const w = (boxWMm + (courses - 1 - i) * stepMm) * s;
    const bx = xBack - w;
    const by = yBase - (i + 1) * bhPx;
    parts.push(rect(bx, by, w, bhPx, { fill: CAD.white, strokeWidth: CAD.medium }));
    parts.push(line(bx, by, bx + w, by + bhPx, 0.8, CAD.faint));
    parts.push(line(bx + w, by, bx, by + bhPx, 0.8, CAD.faint));
  }

  // Retained earth behind the wall
  parts.push(line(xBack, yTop, xBack + 128, yTop, 1.3));
  parts.push(earthTicks({ x: xBack + 128, y: yTop }, { x: xBack, y: yTop }, { spacing: 13, length: 9 }));
  parts.push(earthTicks({ x: xBack, y: yTop }, { x: xBack, y: yBase }, { spacing: 16, length: 8 }));

  // Dimensions
  parts.push(dimV(yTop, yBase, x0, x0 - 54, mmLabel(totalHmm)));
  parts.push(dimH(xBack - bwPx, xBack, yTop, yTop - 36, mmLabel(boxWMm)));
  parts.push(dimV(yTop, yTop + bhPx, xBack - bwPx, xBack - bwPx - 40, mmLabel(boxHMm)));
  if (courses > 1) {
    parts.push(dimH(x0, x0 + stepPx, yBase - bhPx, yBase - bhPx - 28, mmLabel(stepMm)));
  }
  parts.push(dimH(x0, xBack, yFound, yFound + 40, mmLabel(bottomWmm)));

  // Leader notes
  parts.push(
    leader(xBack - bwPx * 0.5, yTop + bhPx * 0.5, xBack - bwPx - 70, yTop - 40, ["GABION BOXES PVC-COATED", "MESH, ROCK FILL"], {
      anchor: "end",
    }),
  );
  parts.push(leader(xBack - 40, yBase + bedH * 0.5, xBack + 96, yFound + 34, ["GRANULAR BEDDING"], { anchor: "start" }));

  const titleY = yFound + 90;
  parts.push(drawingTitle((x0 + xBack) / 2, titleY, "GABION WALL SECTION", "SCALE: NTS"));
  return svgDoc(xBack + 250, titleY + 48, parts.join(""));
}

// ------------------------------------------------------------------
// Template definitions
// ------------------------------------------------------------------
export const DRAINAGE_TEMPLATES: DrawingTemplate[] = [
  {
    kind: "box-culvert",
    label: "Box culvert section",
    category: "civil",
    description:
      "Reinforced concrete box culvert cross section with haunches, rebar, earth fill, blinding layer, and full dimension chains. Supports 1-3 cells.",
    tags: ["culvert", "box culvert", "drainage", "concrete", "cross section", "hydraulic structure"],
    assetType: "drawing",
    params: [
      { key: "spanMm", label: "Clear span (per cell)", type: "number", unit: "mm", min: 900, max: 4000, step: 100, default: 2000 },
      { key: "heightMm", label: "Clear height", type: "number", unit: "mm", min: 900, max: 3500, step: 100, default: 1800 },
      { key: "wallThkMm", label: "Wall thickness", type: "number", unit: "mm", min: 200, max: 500, step: 25, default: 300 },
      { key: "slabThkMm", label: "Slab thickness", type: "number", unit: "mm", min: 200, max: 500, step: 25, default: 300 },
      { key: "cells", label: "Number of cells", type: "number", unit: "no.", min: 1, max: 3, integer: true, default: 1 },
    ],
    generate: buildBoxCulvert,
    presets: [
      {
        id: "drainage-box-culvert-2000",
        name: "Box Culvert 2.0 x 1.8 m Section",
        description: "Single-cell RC box culvert, 300 mm walls and slabs, haunched corners, on 75 mm blinding.",
        tags: ["culvert", "box culvert", "drainage", "concrete"],
      },
    ],
  },
  {
    kind: "pipe-culvert",
    label: "Pipe culvert section",
    category: "civil",
    description:
      "Concrete pipe culvert through embankment: pipe with concrete surround, granular bedding, cover depth, and road surface line.",
    tags: ["culvert", "pipe", "drainage", "embankment", "cross section", "concrete surround"],
    assetType: "drawing",
    params: [
      { key: "diaMm", label: "Pipe internal diameter", type: "number", unit: "mm", min: 300, max: 1800, step: 75, default: 900 },
      { key: "beddingMm", label: "Bedding thickness", type: "number", unit: "mm", min: 100, max: 300, step: 25, default: 150 },
      { key: "coverMm", label: "Cover depth", type: "number", unit: "mm", min: 300, max: 1500, step: 100, default: 600 },
      { key: "surroundThkMm", label: "Surround thickness", type: "number", unit: "mm", min: 100, max: 300, step: 25, default: 150 },
    ],
    generate: buildPipeCulvert,
    presets: [
      {
        id: "drainage-pipe-culvert-900",
        name: "900 DIA Pipe Culvert Section",
        description: "900 mm concrete pipe with 150 mm concrete surround and granular bedding under 600 mm cover.",
        tags: ["culvert", "pipe", "drainage"],
      },
    ],
  },
  {
    kind: "side-ditch",
    label: "Trapezoidal side ditch",
    category: "civil",
    description:
      "Trapezoidal roadside drainage channel with side slopes, optional concrete lining, water level symbol, and slope marks.",
    tags: ["ditch", "channel", "drainage", "trapezoidal", "lining", "side drain"],
    assetType: "drawing",
    params: [
      { key: "bottomWidthMm", label: "Bottom width", type: "number", unit: "mm", min: 300, max: 1500, step: 100, default: 600 },
      { key: "depthMm", label: "Depth", type: "number", unit: "mm", min: 300, max: 1500, step: 100, default: 600 },
      { key: "sideSlopeRun", label: "Side slope", type: "number", unit: "H:1V", min: 1, max: 3, step: 0.5, default: 1.5 },
      { key: "liningThkMm", label: "Lining thickness (0 = unlined)", type: "number", unit: "mm", min: 0, max: 150, step: 25, default: 75 },
    ],
    generate: buildSideDitch,
    presets: [
      {
        id: "drainage-side-ditch-600",
        name: "Lined Side Ditch 600 x 600 Section",
        description: "Trapezoidal side drain, 1.5:1 slopes with 75 mm concrete lining and water level shown.",
        tags: ["ditch", "side drain", "drainage", "channel"],
      },
    ],
  },
  {
    kind: "retaining-wall",
    label: "Cantilever retaining wall",
    category: "civil",
    description:
      "RC cantilever retaining wall section: tapered stem, base slab with toe and heel, granular filter, weepholes, and retained fill.",
    tags: ["retaining wall", "cantilever", "concrete", "earth retention", "section", "weephole"],
    assetType: "drawing",
    params: [
      { key: "wallHeightMm", label: "Total wall height", type: "number", unit: "mm", min: 1000, max: 6000, step: 250, default: 3000 },
      { key: "stemTopMm", label: "Stem thickness (top)", type: "number", unit: "mm", min: 200, max: 400, step: 25, default: 250 },
      { key: "stemBotMm", label: "Stem thickness (bottom)", type: "number", unit: "mm", min: 250, max: 700, step: 25, default: 400 },
      { key: "baseThkMm", label: "Base slab thickness", type: "number", unit: "mm", min: 300, max: 800, step: 50, default: 450 },
      { key: "toeMm", label: "Toe length", type: "number", unit: "mm", min: 300, max: 1500, step: 100, default: 700 },
      { key: "heelMm", label: "Heel length", type: "number", unit: "mm", min: 500, max: 2500, step: 100, default: 1500 },
    ],
    generate: buildRetainingWall,
    presets: [
      {
        id: "drainage-retaining-wall-3000",
        name: "Cantilever Retaining Wall 3.0 m Section",
        description: "3.0 m RC cantilever wall with battered stem, weepholes at 1500 c/c, and granular filter drain.",
        tags: ["retaining wall", "cantilever", "concrete"],
      },
    ],
  },
  {
    kind: "gabion-wall",
    label: "Gabion retaining wall",
    category: "civil",
    description:
      "Stepped gabion box retaining wall on granular bedding with retained fill, mesh crosses, and stack dimensions.",
    tags: ["gabion", "retaining wall", "rock fill", "mesh", "earth retention", "section"],
    assetType: "drawing",
    params: [
      { key: "courses", label: "Number of courses", type: "number", unit: "no.", min: 2, max: 5, integer: true, default: 3 },
      { key: "boxHeightMm", label: "Box height", type: "number", unit: "mm", min: 500, max: 1000, step: 100, default: 1000 },
      { key: "boxWidthMm", label: "Box width (top course)", type: "number", unit: "mm", min: 1000, max: 2000, step: 250, default: 1000 },
      { key: "stepMm", label: "Step per course", type: "number", unit: "mm", min: 250, max: 750, step: 50, default: 500 },
    ],
    generate: buildGabionWall,
    presets: [
      {
        id: "drainage-gabion-wall-3",
        name: "Gabion Wall 3-Course Section",
        description: "Three-course stepped gabion wall, 1.0 m boxes stepping 500 mm per course on granular bedding.",
        tags: ["gabion", "retaining wall", "rock fill"],
      },
    ],
  },
];
