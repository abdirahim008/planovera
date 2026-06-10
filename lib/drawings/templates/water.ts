// ------------------------------------------------------------------
// Water & sanitation parametric templates.
// Vertical sections through typical water/wastewater structures:
// manhole, septic tank, ground storage tank, and pipe trench bedding.
// All output is fabric-safe: plain lines/paths/rects/circles/text,
// no defs/patterns/markers/clipPaths/gradients/CSS.
// ------------------------------------------------------------------

import type { DrawingTemplate, TemplateParamValues } from "../templateRegistry";
import {
  CAD,
  svgDoc,
  line as lineRaw,
  rect,
  polygon,
  circle,
  text,
  dimH,
  dimV,
  leader,
  hatchRect,
  concreteHatchRect,
  earthTicks,
  gravelRect,
  drawingTitle,
  waterLevel,
  barDot,
  mmLabel,
} from "../cadPrimitives";

const num = (values: TemplateParamValues, key: string) => values[key] as number;

// `line`'s strokeWidth default is const-asserted (`CAD.thin`), which narrows the
// inferred parameter type to the literal `1`. Re-type it so real widths compile.
const line = lineRaw as (
  x1: number, y1: number, x2: number, y2: number,
  strokeWidth?: number, stroke?: string, dash?: string,
) => string;

/** White mask rectangle used to cut pipe openings through hatched walls. */
function openingMask(x: number, y: number, w: number, h: number) {
  return rect(x, y, w, h, { fill: CAD.white, stroke: CAD.white, strokeWidth: 0.5 });
}

/** Horizontal pipe stub: crown + invert lines with a square outer end cap. */
function pipeStubH(xFrom: number, xTo: number, yCrown: number, yInvert: number) {
  const cap = xFrom < xTo ? xTo : xTo; // outer end is xTo
  return [
    line(xFrom, yCrown, xTo, yCrown, CAD.medium),
    line(xFrom, yInvert, xTo, yInvert, CAD.medium),
    line(cap, yCrown, cap, yInvert, CAD.medium),
  ].join("");
}

// ------------------------------------------------------------------
// 1. Manhole section
// ------------------------------------------------------------------
function buildManholeSection(values: TemplateParamValues) {
  const dia = num(values, "internalDiaMm");
  const depth = num(values, "depthMm");
  const wallThk = num(values, "wallThkMm");
  const pipeDia = num(values, "pipeDiaMm");

  const s = Math.min(0.14, 380 / depth); // vertical px per mm
  const sh = Math.max(s, 150 / dia); // horizontal px per mm (legibility floor)

  const halfIn = (dia / 2) * sh;
  const wallPx = Math.max(wallThk * sh, 14);
  const xOutL = 130;
  const xInL = xOutL + wallPx;
  const cx = xInL + halfIn;
  const xInR = cx + halfIn;
  const xOutR = xInR + wallPx;

  const yGL = 120;
  const yInv = yGL + depth * s;
  const slabT = Math.max(150 * s, 15);
  const basePx = Math.max(200 * s, 20);
  const blindPx = Math.max(150 * s, 14);
  const toePx = Math.min(100 * sh, 18);
  const pipePx = Math.max(pipeDia * s, 12);
  const benchH = Math.max(pipePx, 14);
  const chHalf = Math.max(Math.min((pipeDia / 2) * sh, halfIn * 0.4), 10);
  const opHalf = Math.min(300 * sh, halfIn - 10);

  const yBaseBot = yInv + basePx;
  const yBlindBot = yBaseBot + blindPx;
  const yInletInv = yInv - Math.max(75 * s, 8); // inlet invert (outlet slightly lower)

  const parts: string[] = [];

  // Shaft walls
  parts.push(rect(xOutL, yGL + slabT, wallPx, yInv - yGL - slabT, { strokeWidth: CAD.medium }));
  parts.push(concreteHatchRect(xOutL, yGL + slabT, wallPx, yInv - yGL - slabT, 9));
  parts.push(rect(xInR, yGL + slabT, wallPx, yInv - yGL - slabT, { strokeWidth: CAD.medium }));
  parts.push(concreteHatchRect(xInR, yGL + slabT, wallPx, yInv - yGL - slabT, 9));

  // Pipe openings cut through walls (mask after hatch)
  parts.push(openingMask(xOutL - 1, yInletInv - pipePx, wallPx + 2, pipePx)); // inlet (left)
  parts.push(openingMask(xInR - 1, yInv - pipePx, wallPx + 2, pipePx)); // outlet (right)

  // Cover / reducing slab at ground level with central opening
  parts.push(rect(xOutL, yGL, cx - opHalf - xOutL, slabT, { strokeWidth: CAD.medium }));
  parts.push(concreteHatchRect(xOutL, yGL, cx - opHalf - xOutL, slabT, 9));
  parts.push(rect(cx + opHalf, yGL, xOutR - (cx + opHalf), slabT, { strokeWidth: CAD.medium }));
  parts.push(concreteHatchRect(cx + opHalf, yGL, xOutR - (cx + opHalf), slabT, 9));
  // CI frame blocks + cover plate
  parts.push(rect(cx - opHalf - 10, yGL - 8, 10, 8, { fill: CAD.concreteFill, strokeWidth: CAD.medium }));
  parts.push(rect(cx + opHalf, yGL - 8, 10, 8, { fill: CAD.concreteFill, strokeWidth: CAD.medium }));
  parts.push(rect(cx - opHalf, yGL - 7, opHalf * 2, 7, { fill: "#1f2937", strokeWidth: CAD.thin }));

  // Base slab + blinding
  parts.push(rect(xOutL - toePx, yInv, xOutR - xOutL + toePx * 2, basePx, { strokeWidth: CAD.medium }));
  parts.push(concreteHatchRect(xOutL - toePx, yInv, xOutR - xOutL + toePx * 2, basePx, 10));
  parts.push(rect(xOutL - toePx - 6, yBaseBot, xOutR - xOutL + toePx * 2 + 12, blindPx, { strokeWidth: CAD.thin }));
  parts.push(gravelRect(xOutL - toePx - 6, yBaseBot, xOutR - xOutL + toePx * 2 + 12, blindPx, 11));

  // Benching with central channel
  const benchL = [
    { x: xInL, y: yInv },
    { x: xInL, y: yInv - benchH - 8 },
    { x: cx - chHalf, y: yInv - benchH },
    { x: cx - chHalf, y: yInv },
  ];
  const benchR = [
    { x: cx + chHalf, y: yInv },
    { x: cx + chHalf, y: yInv - benchH },
    { x: xInR, y: yInv - benchH - 8 },
    { x: xInR, y: yInv },
  ];
  parts.push(polygon(benchL, { strokeWidth: CAD.medium }));
  parts.push(polygon(benchR, { strokeWidth: CAD.medium }));
  parts.push(hatchRect(xInL + 2, yInv - benchH + 3, cx - chHalf - xInL - 4, benchH - 4, { spacing: 8 }));
  parts.push(hatchRect(cx + chHalf + 2, yInv - benchH + 3, xInR - (cx + chHalf) - 4, benchH - 4, { spacing: 8 }));

  // Pipes
  parts.push(pipeStubH(xInL, xOutL - 42, yInletInv - pipePx, yInletInv)); // inlet stub left
  parts.push(pipeStubH(xInR, xOutR + 22, yInv - pipePx, yInv)); // outlet stub right

  // Step irons on inside face of right wall
  const stepGap = Math.max(300 * s, 18);
  const steps: number[] = [];
  for (let y = yGL + slabT + 26; y < yInv - benchH - 18; y += stepGap) {
    parts.push(rect(xInR - 12, y, 12, 4, { fill: CAD.ink, strokeWidth: 0.8 }));
    steps.push(y);
  }

  // Ground line + earth ticks both sides
  parts.push(line(xOutL - 70, yGL, xOutL, yGL, 1.3));
  parts.push(line(xOutR, yGL, xOutR + 70, yGL, 1.3));
  parts.push(earthTicks({ x: xOutL, y: yGL }, { x: xOutL - 70, y: yGL }, { spacing: 13, length: 8 }));
  parts.push(earthTicks({ x: xOutR + 70, y: yGL }, { x: xOutR, y: yGL }, { spacing: 13, length: 8 }));

  // Dimensions: chain across bottom + depth on the right
  const yDim = yBlindBot + 42;
  parts.push(dimH(xOutL, xInL, yBlindBot, yDim, mmLabel(wallThk)));
  parts.push(dimH(xInL, xInR, yBlindBot, yDim, mmLabel(dia)));
  parts.push(dimH(xInR, xOutR, yBlindBot, yDim, mmLabel(wallThk)));
  parts.push(dimV(yGL, yInv, xOutR, xOutR + 42, mmLabel(depth)));

  // Leaders (right side)
  const lx = xOutR + 96;
  parts.push(leader(cx + opHalf + 4, yGL - 5, lx, yGL - 26, "CI COVER AND FRAME"));
  const stepTargetY = steps.length > 1 ? steps[1] + 2 : yGL + slabT + 30;
  parts.push(leader(xInR - 6, stepTargetY, lx, yGL + 64, "STEP IRONS @ 300 C/C"));
  parts.push(leader(cx + chHalf + 8, yInv - benchH * 0.5, lx, yInv - 64, "CLASS B BENCHING"));
  parts.push(leader(xOutR + 16, yInv - pipePx / 2, lx, yInv + 10, `OUTLET Ø${mmLabel(pipeDia)}`));
  parts.push(leader(xOutR + toePx - 4, yBaseBot + blindPx / 2, xOutR + 110, yBlindBot + 50, "150 BLINDING"));

  // Inlet label (left side)
  parts.push(text(xOutL - 8, yInletInv - pipePx - 6, `INLET Ø${mmLabel(pipeDia)}`, { size: 10.5, anchor: "end" }));

  const width = lx + 210;
  const titleY = yDim + 56;
  parts.push(drawingTitle(width / 2, titleY, "TYPICAL MANHOLE SECTION", "SCALE: NTS"));
  return svgDoc(width, titleY + 46, parts.join(""));
}

// ------------------------------------------------------------------
// 2. Septic tank longitudinal section
// ------------------------------------------------------------------
function buildSepticTank(values: TemplateParamValues) {
  const length = num(values, "lengthMm");
  const depth = num(values, "depthMm");
  const wallThk = num(values, "wallThkMm");
  const chambers = num(values, "chambers");

  const s = Math.min(0.13, 540 / length, 250 / depth);
  const lenPx = length * s;
  const depthPx = depth * s;
  const wallPx = Math.max(wallThk * s, 14);
  const slabT = Math.max(150 * s, 13);
  const basePx = Math.max(wallThk * s, 16);
  const pipeH = Math.max(110 * s, 10);

  const x0 = 160;
  const yGL = 150;
  const xInL = x0 + wallPx;
  const xInR = xInL + lenPx;
  const xOutR = xInR + wallPx;
  const yTopIn = yGL + slabT;
  const yBotIn = yTopIn + depthPx;
  const yBaseBot = yBotIn + basePx;

  // Chamber layout
  const bafPx = Math.max(150 * s, 12);
  const clearPx = lenPx - (chambers - 1) * bafPx;
  const fractions = chambers === 1 ? [1] : chambers === 2 ? [2 / 3, 1 / 3] : [0.5, 0.25, 0.25];
  const chamberW = fractions.map((f) => f * clearPx);
  const clearMm = length - (chambers - 1) * 150;
  const chamberMm = fractions.map((f) => f * clearMm);

  // x of each chamber [start, end] and baffles [start, end]
  const chamberX: Array<[number, number]> = [];
  const baffleX: Array<[number, number]> = [];
  let xc = xInL;
  for (let i = 0; i < chambers; i += 1) {
    chamberX.push([xc, xc + chamberW[i]]);
    xc += chamberW[i];
    if (i < chambers - 1) {
      baffleX.push([xc, xc + bafPx]);
      xc += bafPx;
    }
  }

  const parts: string[] = [];

  // Walls
  parts.push(rect(x0, yTopIn, wallPx, depthPx, { strokeWidth: CAD.medium }));
  parts.push(concreteHatchRect(x0, yTopIn, wallPx, depthPx, 9));
  parts.push(rect(xInR, yTopIn, wallPx, depthPx, { strokeWidth: CAD.medium }));
  parts.push(concreteHatchRect(xInR, yTopIn, wallPx, depthPx, 9));
  // Base slab
  parts.push(rect(x0, yBotIn, xOutR - x0, basePx, { strokeWidth: CAD.medium }));
  parts.push(concreteHatchRect(x0, yBotIn, xOutR - x0, basePx, 10));

  // Pipe levels
  const yIn = yTopIn + Math.max(200 * s, 16); // inlet invert
  const yOut = yIn + Math.max(75 * s, 7); // outlet invert (slightly lower)
  const yWL = yOut; // working water level

  // Pipe openings through walls
  parts.push(openingMask(x0 - 1, yIn - pipeH, wallPx + 2, pipeH));
  parts.push(openingMask(xInR - 1, yOut - pipeH, wallPx + 2, pipeH));

  // Top slab segments with access openings above each chamber
  parts.push(rect(x0, yGL, xOutR - x0, slabT, { strokeWidth: CAD.medium }));
  parts.push(concreteHatchRect(x0, yGL, xOutR - x0, slabT, 9));
  const coverInfo: Array<{ cx: number; op: number }> = [];
  for (let i = 0; i < chambers; i += 1) {
    const ccx = (chamberX[i][0] + chamberX[i][1]) / 2;
    const op = Math.max(Math.min(600 * s, chamberW[i] - 16), 20);
    coverInfo.push({ cx: ccx, op });
    parts.push(openingMask(ccx - op / 2, yGL - 1, op, slabT + 2));
    parts.push(line(ccx - op / 2, yGL, ccx - op / 2, yTopIn, CAD.medium));
    parts.push(line(ccx + op / 2, yGL, ccx + op / 2, yTopIn, CAD.medium));
    parts.push(rect(ccx - op / 2 - 5, yGL - 7, op + 10, 7, { fill: CAD.concreteFill, strokeWidth: CAD.medium }));
  }

  // Baffle walls
  for (const [bx1, bx2] of baffleX) {
    const bTop = yTopIn + Math.max(100 * s, 10); // scum gap below slab
    parts.push(rect(bx1, bTop, bx2 - bx1, yBotIn - bTop, { strokeWidth: CAD.medium }));
    parts.push(hatchRect(bx1, bTop, bx2 - bx1, yBotIn - bTop, { spacing: 7 }));
  }

  // Water level line + symbol
  parts.push(line(xInL + 2, yWL, xInR - 2, yWL, 0.9, CAD.faint));
  parts.push(waterLevel(xInL + clearPx * 0.3, yWL));

  // Inlet tee (left)
  const xTeeIn = xInL + Math.max(150 * s, 16);
  const teeTopIn = yTopIn + 5;
  const teeBotIn = yIn + Math.max(450 * s, 40);
  parts.push(pipeStubH(xTeeIn - pipeH / 2, x0 - 50, yIn - pipeH, yIn));
  parts.push(line(xTeeIn - pipeH / 2, teeTopIn, xTeeIn - pipeH / 2, teeBotIn, CAD.medium));
  parts.push(line(xTeeIn + pipeH / 2, teeTopIn, xTeeIn + pipeH / 2, teeBotIn, CAD.medium));
  parts.push(line(xTeeIn - pipeH / 2, teeTopIn, xTeeIn + pipeH / 2, teeTopIn, CAD.medium));
  parts.push(line(xTeeIn - pipeH / 2, teeBotIn, xTeeIn + pipeH / 2, teeBotIn, CAD.medium));

  // Outlet tee (right, slightly deeper draw-off)
  const xTeeOut = xInR - Math.max(150 * s, 16);
  const teeTopOut = yTopIn + 5;
  const teeBotOut = yOut + Math.max(depthPx * 0.3, 50);
  parts.push(pipeStubH(xTeeOut + pipeH / 2, xOutR + 50, yOut - pipeH, yOut));
  parts.push(line(xTeeOut - pipeH / 2, teeTopOut, xTeeOut - pipeH / 2, teeBotOut, CAD.medium));
  parts.push(line(xTeeOut + pipeH / 2, teeTopOut, xTeeOut + pipeH / 2, teeBotOut, CAD.medium));
  parts.push(line(xTeeOut - pipeH / 2, teeTopOut, xTeeOut + pipeH / 2, teeTopOut, CAD.medium));
  parts.push(line(xTeeOut - pipeH / 2, teeBotOut, xTeeOut + pipeH / 2, teeBotOut, CAD.medium));

  // Vent pipe on top slab near inlet
  const xVent = xInL + 38;
  parts.push(line(xVent - 3, yGL, xVent - 3, yGL - 26, CAD.medium));
  parts.push(line(xVent + 3, yGL, xVent + 3, yGL - 26, CAD.medium));
  parts.push(line(xVent - 7, yGL - 26, xVent + 7, yGL - 26, CAD.medium));

  // Ground line + earth ticks both sides
  parts.push(line(x0 - 70, yGL, x0, yGL, 1.3));
  parts.push(line(xOutR, yGL, xOutR + 70, yGL, 1.3));
  parts.push(earthTicks({ x: x0, y: yGL }, { x: x0 - 70, y: yGL }, { spacing: 13, length: 8 }));
  parts.push(earthTicks({ x: xOutR + 70, y: yGL }, { x: xOutR, y: yGL }, { spacing: 13, length: 8 }));

  // Dimensions: chamber chain + overall internal length + depth
  const yDim1 = yBaseBot + 44;
  const yDim2 = yDim1 + 36;
  parts.push(dimH(x0, xInL, yBaseBot, yDim1, mmLabel(wallThk)));
  for (let i = 0; i < chambers; i += 1) {
    parts.push(dimH(chamberX[i][0], chamberX[i][1], yBaseBot, yDim1, mmLabel(chamberMm[i])));
  }
  parts.push(dimH(xInR, xOutR, yBaseBot, yDim1, mmLabel(wallThk)));
  parts.push(dimH(xInL, xInR, yBaseBot, yDim2, `${mmLabel(length)} INTERNAL`));
  parts.push(dimV(yTopIn, yBotIn, x0, x0 - 55, mmLabel(depth)));

  // Leaders
  parts.push(leader(x0 - 30, yIn - pipeH, x0 - 38, yGL - 26, "INLET 110 DIA", { anchor: "end" }));
  parts.push(leader(xOutR + 35, yOut - pipeH, xOutR + 45, yGL - 50, "OUTLET 110 DIA", { anchor: "start" }));
  parts.push(leader(xVent, yGL - 22, xVent - 40, yGL - 40, "VENT", { anchor: "end" }));
  const slabTargetX = coverInfo[0].cx - coverInfo[0].op / 2 - 12;
  parts.push(leader(slabTargetX, yGL + slabT * 0.5, slabTargetX - 30, yGL - 62, "RC COVER SLAB", { anchor: "end" }));
  if (baffleX.length > 0) {
    const bafC = (baffleX[0][0] + baffleX[0][1]) / 2;
    parts.push(leader(bafC, yTopIn + 56, bafC + 50, yGL - 30, "BAFFLE 150 THK", { anchor: "start" }));
  }

  const width = xOutR + 215;
  const titleY = yDim2 + 50;
  parts.push(drawingTitle((x0 + xOutR) / 2 + 30, titleY, "SEPTIC TANK SECTION", "SCALE: NTS"));
  return svgDoc(width, titleY + 46, parts.join(""));
}

// ------------------------------------------------------------------
// 3. Ground water storage tank cross section
// ------------------------------------------------------------------
function buildWaterTank(values: TemplateParamValues) {
  const widthMm = num(values, "widthMm");
  const heightMm = num(values, "heightMm");
  const wallThk = num(values, "wallThkMm");
  const freeboard = num(values, "freeboardMm");

  const s = Math.min(0.12, 500 / widthMm, 250 / heightMm); // vertical px per mm
  const sw = Math.max(s, 220 / widthMm); // horizontal px per mm (legibility floor)
  const wPx = widthMm * sw;
  const hPx = heightMm * s;
  const wallPx = Math.max(wallThk * sw, 16);
  const basePx = Math.max(wallThk * s, 18);
  const roofPx = Math.max(150 * s, 13);
  const blindPx = 12;

  const x0 = 170;
  const yRoofTop = 120;
  const yRoofBot = yRoofTop + roofPx;
  const floorY = yRoofBot + hPx;
  const yG = floorY + basePx; // ground = underside of base
  const xInL = x0 + wallPx;
  const xInR = xInL + wPx;
  const xOutR = xInR + wallPx;
  const waterY = floorY - (heightMm - freeboard) * s;

  const parts: string[] = [];

  // Walls
  parts.push(rect(x0, yRoofBot, wallPx, hPx, { strokeWidth: CAD.medium }));
  parts.push(concreteHatchRect(x0, yRoofBot, wallPx, hPx, 9));
  parts.push(rect(xInR, yRoofBot, wallPx, hPx, { strokeWidth: CAD.medium }));
  parts.push(concreteHatchRect(xInR, yRoofBot, wallPx, hPx, 9));
  // Base slab
  parts.push(rect(x0, floorY, xOutR - x0, basePx, { strokeWidth: CAD.medium }));
  parts.push(concreteHatchRect(x0, floorY, xOutR - x0, basePx, 10));
  // Blinding under base
  parts.push(rect(x0 - 12, yG, xOutR - x0 + 24, blindPx, { strokeWidth: CAD.thin }));
  parts.push(gravelRect(x0 - 12, yG, xOutR - x0 + 24, blindPx, 10));

  // Pipe penetrations (mask wall hatch before drawing stubs)
  const yInletCrown = yRoofBot + 14;
  const phIn = 8;
  parts.push(openingMask(xInR - 1, yInletCrown, wallPx + 2, phIn)); // inlet, right top
  const yOverCrown = waterY - 8;
  parts.push(openingMask(x0 - 1, yOverCrown, wallPx + 2, 8)); // overflow, left at WL
  const outCrown = floorY - 12;
  const outInv = floorY - 2;
  parts.push(openingMask(xInR - 1, outCrown, wallPx + 2, outInv - outCrown)); // outlet, right bottom

  // Roof slab with access opening near left
  parts.push(rect(x0, yRoofTop, xOutR - x0, roofPx, { strokeWidth: CAD.medium }));
  parts.push(concreteHatchRect(x0, yRoofTop, xOutR - x0, roofPx, 9));
  const hatchC = xInL + 40;
  const hatchOp = Math.min(600 * s, 70);
  parts.push(openingMask(hatchC - hatchOp / 2, yRoofTop - 1, hatchOp, roofPx + 2));
  parts.push(line(hatchC - hatchOp / 2, yRoofTop, hatchC - hatchOp / 2, yRoofBot, CAD.medium));
  parts.push(line(hatchC + hatchOp / 2, yRoofTop, hatchC + hatchOp / 2, yRoofBot, CAD.medium));
  parts.push(rect(hatchC - hatchOp / 2 - 5, yRoofTop - 8, hatchOp + 10, 8, { fill: CAD.concreteFill, strokeWidth: CAD.medium }));

  // Rebar dots near inner faces of walls + top of base
  for (let y = yRoofBot + 12; y < floorY - 8; y += 28) {
    parts.push(barDot(xInL - 6, y, 12));
    parts.push(barDot(xInR + 6, y, 12));
  }
  for (let x = xInL + 12; x < xInR - 8; x += 30) {
    parts.push(barDot(x, floorY + 7, 12));
  }

  // Water level + symbol
  parts.push(line(xInL + 2, waterY, xInR - 2, waterY, 1));
  parts.push(waterLevel(xInL + 85, waterY));
  parts.push(text(xInL + 115, waterY - yRoofBot > 24 ? waterY - 10 : waterY + 16, "TWL", { size: 10, anchor: "start" }));

  // Ladder inside left wall (below access hatch)
  const ladX1 = xInL + 16;
  const ladX2 = xInL + 30;
  parts.push(line(ladX1, yRoofBot + 2, ladX1, floorY, 1.4));
  parts.push(line(ladX2, yRoofBot + 2, ladX2, floorY, 1.4));
  for (let y = yRoofBot + 14; y < floorY - 4; y += Math.max(300 * s, 18)) {
    parts.push(line(ladX1, y, ladX2, y, 1.1));
  }

  // Inlet (right, above TWL)
  parts.push(pipeStubH(xInR, xOutR + 50, yInletCrown, yInletCrown + phIn));
  parts.push(text(xOutR + 25, yInletCrown - 7, "INLET", { size: 10 }));

  // Overflow (left, at TWL)
  parts.push(pipeStubH(xInL, x0 - 45, yOverCrown, yOverCrown + 8));
  parts.push(text(x0 - 34, yOverCrown + 26, "OVERFLOW", { size: 9.5 }));

  // Outlet (right bottom) with valve symbol (bowtie)
  parts.push(pipeStubH(xInR, xOutR + 72, outCrown, outInv));
  const vx = xOutR + 38;
  const vy = (outCrown + outInv) / 2;
  parts.push(polygon(
    [{ x: vx - 9, y: vy - 8 }, { x: vx - 9, y: vy + 8 }, { x: vx, y: vy }],
    { fill: CAD.white, strokeWidth: CAD.medium },
  ));
  parts.push(polygon(
    [{ x: vx + 9, y: vy - 8 }, { x: vx + 9, y: vy + 8 }, { x: vx, y: vy }],
    { fill: CAD.white, strokeWidth: CAD.medium },
  ));
  parts.push(text(xOutR + 45, outCrown - 10, "OUTLET", { size: 10 }));

  // Ground line + earth ticks
  parts.push(line(x0 - 90, yG, x0, yG, 1.3));
  parts.push(line(xOutR, yG, xOutR + 90, yG, 1.3));
  parts.push(earthTicks({ x: x0, y: yG }, { x: x0 - 90, y: yG }, { spacing: 13, length: 8 }));
  parts.push(earthTicks({ x: xOutR + 90, y: yG }, { x: xOutR, y: yG }, { spacing: 13, length: 8 }));

  // Leaders
  parts.push(leader(hatchC + hatchOp / 2 - 4, yRoofTop - 6, hatchC + 95, yRoofTop - 30, "ACCESS COVER 600 SQ", { anchor: "start" }));
  const ladTargetY = Math.min(yRoofBot + (floorY - yRoofBot) * 0.55, floorY - 40);
  parts.push(leader(ladX2 - 2, ladTargetY, ladX2 + 65, Math.min(ladTargetY + 30, floorY - 14), "GI LADDER", { anchor: "start" }));
  parts.push(leader(x0 + 24, yG + 6, x0 - 46, yG + 30, "75 BLINDING", { anchor: "end" }));

  // Dimensions
  parts.push(dimH(x0, xInL, yRoofTop, yRoofTop - 35, mmLabel(wallThk)));
  parts.push(dimH(xInL, xInR, yG + blindPx, yG + blindPx + 44, `${mmLabel(widthMm)} INTERNAL`));
  parts.push(dimV(yRoofBot, floorY, x0, x0 - 64, mmLabel(heightMm)));
  parts.push(dimV(yRoofBot, waterY, xInR, xInR - 48, mmLabel(freeboard)));

  const width = xOutR + 160;
  const titleY = yG + blindPx + 44 + 56;
  parts.push(drawingTitle(width / 2, titleY, "WATER STORAGE TANK SECTION", "SCALE: NTS"));
  return svgDoc(width, titleY + 46, parts.join(""));
}

// ------------------------------------------------------------------
// 4. Pipe trench bedding detail
// ------------------------------------------------------------------
function buildPipeTrench(values: TemplateParamValues) {
  const pipeDia = num(values, "pipeDiaMm");
  const trenchW = num(values, "trenchWidthMm");
  const bedding = num(values, "beddingMm");
  const cover = num(values, "coverMm");

  const depthTot = cover + pipeDia + bedding;
  const s = Math.min(0.24, 340 / depthTot, 300 / trenchW);

  const trenchWpx = trenchW * s;
  const xL = 250;
  const xR = xL + trenchWpx;
  const cx = (xL + xR) / 2;
  const yGL = 140;
  const yBot = yGL + depthTot * s;

  const bedPx = bedding * s;
  const rOut = Math.min((pipeDia / 2) * s, trenchWpx * 0.42);
  const rIn = rOut - Math.max(rOut * 0.14, 3.5);
  const cy = yBot - bedPx - rOut;
  const crownY = cy - rOut;
  const tapeY = crownY - 300 * s; // warning tape / top of selected backfill

  const parts: string[] = [];

  // Zone fills first (pipe masks them afterwards)
  parts.push(hatchRect(xL, yGL + 2, trenchWpx, tapeY - yGL - 4, { spacing: 24, strokeWidth: 0.7 })); // normal backfill
  parts.push(gravelRect(xL + 3, tapeY + 3, trenchWpx - 6, cy - tapeY - 3, 9)); // selected backfill (finer)
  parts.push(gravelRect(xL + 3, cy, trenchWpx - 6, yBot - cy - 3, 13)); // bedding (coarser)
  parts.push(line(xL, cy, xR, cy, 0.8, CAD.faint)); // springline / zone boundary
  parts.push(line(xL + 4, tapeY, xR - 4, tapeY, 1.6, CAD.ink, "8 5")); // warning tape (dashed)

  // Pipe (two concentric circles; outer masks zone fills)
  parts.push(circle(cx, cy, rOut, { fill: CAD.white, strokeWidth: CAD.thick }));
  parts.push(circle(cx, cy, rIn, { strokeWidth: CAD.medium }));

  // Trench outline
  parts.push(line(xL, yGL, xL, yBot, CAD.thick));
  parts.push(line(xR, yGL, xR, yBot, CAD.thick));
  parts.push(line(xL, yBot, xR, yBot, CAD.thick));

  // Ground lines + earth ticks (outside trench + along trench sides)
  parts.push(line(xL - 140, yGL, xL, yGL, 1.3));
  parts.push(line(xR, yGL, xR + 140, yGL, 1.3));
  parts.push(earthTicks({ x: xL, y: yGL }, { x: xL - 140, y: yGL }, { spacing: 13, length: 8 }));
  parts.push(earthTicks({ x: xR + 140, y: yGL }, { x: xR, y: yGL }, { spacing: 13, length: 8 }));
  parts.push(earthTicks({ x: xL, y: yBot }, { x: xL, y: yGL }, { spacing: 16, length: 8 }));
  parts.push(earthTicks({ x: xR, y: yGL }, { x: xR, y: yBot }, { spacing: 16, length: 8 }));

  // Dimensions
  parts.push(dimH(xL, xR, yGL, yGL - 42, mmLabel(trenchW)));
  parts.push(dimV(yGL, crownY, xL, xL - 55, `${mmLabel(cover)} COVER`));
  parts.push(dimV(yBot - bedPx, yBot, xL, xL - 55, mmLabel(bedding)));

  // Leaders (right side, staggered clear of each other)
  const lx = xR + 170;
  parts.push(leader(cx + 40, (yGL + tapeY) / 2, lx, yGL + 50, "BACKFILL IN 150 LAYERS"));
  parts.push(leader(cx + 55, tapeY, lx, (yGL + 50 + (tapeY + crownY) / 2 - 16) / 2 + 14, "WARNING TAPE"));
  parts.push(leader(cx + 50, (tapeY + crownY) / 2 + 4, lx, (tapeY + crownY) / 2 + 26, ["SELECTED BACKFILL", "HAND COMPACTED"]));
  parts.push(leader(cx + rOut * 0.7, cy + rOut * 0.7, lx, cy + rOut + 26, `Ø${mmLabel(pipeDia)} PIPE`));
  parts.push(leader(cx + 55, yBot - bedPx / 2 + 2, lx, yBot + 22, ["BEDDING:", "GRANULAR MATERIAL"]));

  const width = lx + 190;
  const titleY = yBot + 84;
  parts.push(drawingTitle(width / 2, titleY, "TYPICAL PIPE TRENCH DETAIL", "SCALE: NTS"));
  return svgDoc(width, titleY + 46, parts.join(""));
}

// ------------------------------------------------------------------
// Template definitions
// ------------------------------------------------------------------
export const WATER_TEMPLATES: DrawingTemplate[] = [
  {
    kind: "manhole-section",
    label: "Manhole section",
    category: "civil",
    description: "Typical manhole vertical section with CI cover and frame, step irons, benching, base slab, blinding, and inlet/outlet pipes.",
    tags: ["manhole", "sewer", "drainage", "section", "chamber", "typical"],
    assetType: "drawing",
    params: [
      { key: "internalDiaMm", label: "Internal diameter", type: "number", unit: "mm", min: 900, max: 1800, step: 150, default: 1200 },
      { key: "depthMm", label: "Depth to invert", type: "number", unit: "mm", min: 1200, max: 6000, step: 250, default: 2500 },
      { key: "wallThkMm", label: "Wall thickness", type: "number", unit: "mm", min: 150, max: 300, step: 25, default: 200 },
      { key: "pipeDiaMm", label: "Pipe diameter", type: "number", unit: "mm", min: 150, max: 600, step: 75, default: 300 },
    ],
    generate: buildManholeSection,
    presets: [
      {
        id: "manhole-1200-typical",
        name: "Manhole 1200 Dia Typical Section",
        description: "1200 mm dia manhole, 2.5 m deep, 200 mm walls with Class B benching and 300 mm pipes. Edit diameter, depth, and pipe size after insert.",
        tags: ["manhole", "sewer", "drainage", "typical section"],
      },
    ],
  },
  {
    kind: "septic-tank",
    label: "Septic tank section",
    category: "civil",
    description: "Septic tank longitudinal section with chambers, baffle walls, inlet/outlet tees, water level, vent, and access covers.",
    tags: ["septic tank", "sanitation", "wastewater", "section", "chamber"],
    assetType: "drawing",
    params: [
      { key: "lengthMm", label: "Internal length", type: "number", unit: "mm", min: 2000, max: 6000, step: 250, default: 3000 },
      { key: "depthMm", label: "Internal depth", type: "number", unit: "mm", min: 1500, max: 3000, step: 250, default: 2000 },
      { key: "wallThkMm", label: "Wall thickness", type: "number", unit: "mm", min: 150, max: 300, step: 25, default: 200 },
      { key: "chambers", label: "Chambers", type: "number", unit: "no.", min: 1, max: 3, integer: true, default: 2 },
    ],
    generate: buildSepticTank,
    presets: [
      {
        id: "septic-2-chamber",
        name: "Two-Chamber Septic Tank Section",
        description: "3.0 m two-chamber septic tank with inlet/outlet tees, baffle, vent, and RC cover slab. Edit length, depth, and chamber count after insert.",
        tags: ["septic tank", "sanitation", "two chamber", "section"],
      },
    ],
  },
  {
    kind: "water-tank",
    label: "Ground water tank section",
    category: "civil",
    description: "RC ground water storage tank cross section with rebar, ladder, inlet, outlet with valve, overflow, freeboard, and access cover.",
    tags: ["water tank", "storage", "reservoir", "rc tank", "section"],
    assetType: "drawing",
    params: [
      { key: "widthMm", label: "Internal width", type: "number", unit: "mm", min: 2000, max: 8000, step: 500, default: 4000 },
      { key: "heightMm", label: "Internal height", type: "number", unit: "mm", min: 1500, max: 4000, step: 250, default: 2500 },
      { key: "wallThkMm", label: "Wall thickness", type: "number", unit: "mm", min: 200, max: 400, step: 25, default: 250 },
      { key: "freeboardMm", label: "Freeboard", type: "number", unit: "mm", min: 200, max: 500, step: 50, default: 300 },
    ],
    generate: buildWaterTank,
    presets: [
      {
        id: "water-tank-4000",
        name: "Ground Water Storage Tank Section",
        description: "4.0 m wide RC storage tank, 2.5 m high with 300 mm freeboard, ladder, and valved outlet. Edit size and freeboard after insert.",
        tags: ["water tank", "storage", "reservoir", "section"],
      },
    ],
  },
  {
    kind: "pipe-trench",
    label: "Pipe trench bedding detail",
    category: "civil",
    description: "Typical pipe trench cross section with granular bedding to springline, selected backfill, warning tape, and compacted backfill zones.",
    tags: ["pipe", "trench", "bedding", "backfill", "detail", "pipeline"],
    assetType: "drawing",
    params: [
      { key: "pipeDiaMm", label: "Pipe diameter", type: "number", unit: "mm", min: 100, max: 1200, step: 50, default: 300 },
      { key: "trenchWidthMm", label: "Trench width", type: "number", unit: "mm", min: 400, max: 2000, step: 50, default: 800 },
      { key: "beddingMm", label: "Bedding thickness", type: "number", unit: "mm", min: 100, max: 200, step: 25, default: 150 },
      { key: "coverMm", label: "Cover to crown", type: "number", unit: "mm", min: 600, max: 1500, step: 100, default: 900 },
    ],
    generate: buildPipeTrench,
    presets: [
      {
        id: "pipe-trench-300",
        name: "Pipe Trench Bedding Detail Ø300",
        description: "300 mm pipe in 800 mm trench with 150 mm granular bedding and 900 mm cover. Edit pipe size, trench width, and cover after insert.",
        tags: ["pipe trench", "bedding", "detail", "pipeline"],
      },
    ],
  },
];
