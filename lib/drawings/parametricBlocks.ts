// ------------------------------------------------------------------
// Parametric drawing blocks.
//
// Two families share one dispatch surface:
// 1. Legacy structural kinds (beam/column/footing/openings) with typed
//    params and hand-built editors — generators rebuilt in proper CAD
//    monochrome style using cadPrimitives.
// 2. Registry templates (roads, drainage, water, structural details)
//    defined declaratively in lib/drawings/templates/* — their editor
//    UI is generated from the parameter schema.
// ------------------------------------------------------------------

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
  hatchRect,
  earthTicks,
  gravelRect,
  drawingTitle,
  barDot,
  mmLabel,
} from "./cadPrimitives";
import {
  DRAWING_TEMPLATES,
  TEMPLATE_REGISTRY,
  createTemplateSvg,
  normalizeTemplateValues,
  type TemplateParamValues,
} from "./templateRegistry";

export type LegacyParametricBlockKind =
  | "beam-detail"
  | "column-detail"
  | "footing-detail"
  | "wall-opening"
  | "door-opening"
  | "window-opening";

/** Any parametric kind — legacy structural kinds or a registry template kind. */
export type ParametricBlockKind = string;

export type OpeningType = "door" | "window" | "opening";
export type StructuralView = "plan" | "section";
export type StoreyMode = "single" | "multi";

export type BeamDetailParams = {
  widthMm: number;
  depthMm: number;
  topBars: number;
  bottomBars: number;
  barDiaMm: number;
  stirrupDiaMm: number;
  stirrupSpacingMm: number;
};

export type ColumnDetailParams = {
  view: StructuralView;
  widthMm: number;
  depthMm: number;
  mainBars: number;
  barDiaMm: number;
  tieDiaMm: number;
  tieSpacingMm: number;
  storeyMode: StoreyMode;
};

export type FootingDetailParams = {
  view: StructuralView;
  footingWidthMm: number;
  footingLengthMm: number;
  footingDepthMm: number;
  columnWidthMm: number;
  columnDepthMm: number;
  barDiaMm: number;
  barCountX: number;
  barCountY: number;
};

export type WallOpeningParams = {
  wallLengthMm: number;
  wallThicknessMm: number;
  openingType: OpeningType;
  openingWidthMm: number;
  openingOffsetMm: number;
};

export type ParametricBlockParams =
  | BeamDetailParams
  | ColumnDetailParams
  | FootingDetailParams
  | WallOpeningParams
  | TemplateParamValues;

export type ParametricBlockState = {
  kind: ParametricBlockKind;
  label: string;
  params: ParametricBlockParams;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const roundClamp = (value: number, min: number, max: number) => clamp(Math.round(value), min, max);

const LEGACY_LABELS: Record<LegacyParametricBlockKind, string> = {
  "beam-detail": "Beam detailing",
  "column-detail": "Column detailing",
  "footing-detail": "Footing detailing",
  "wall-opening": "Wall opening",
  "door-opening": "Door opening",
  "window-opening": "Window opening",
};

/** Labels for every known parametric kind (legacy + registry templates). */
export const PARAMETRIC_BLOCK_LABELS: Record<string, string> = {
  ...LEGACY_LABELS,
  ...Object.fromEntries(DRAWING_TEMPLATES.map((template) => [template.kind, template.label])),
};

export const DEFAULT_BEAM_DETAIL_PARAMS: BeamDetailParams = {
  widthMm: 400,
  depthMm: 400,
  topBars: 2,
  bottomBars: 3,
  barDiaMm: 16,
  stirrupDiaMm: 8,
  stirrupSpacingMm: 150,
};

export const DEFAULT_COLUMN_DETAIL_PARAMS: ColumnDetailParams = {
  view: "plan",
  widthMm: 300,
  depthMm: 300,
  mainBars: 8,
  barDiaMm: 16,
  tieDiaMm: 8,
  tieSpacingMm: 150,
  storeyMode: "single",
};

export const DEFAULT_FOOTING_DETAIL_PARAMS: FootingDetailParams = {
  view: "plan",
  footingWidthMm: 1800,
  footingLengthMm: 1800,
  footingDepthMm: 500,
  columnWidthMm: 300,
  columnDepthMm: 300,
  barDiaMm: 16,
  barCountX: 7,
  barCountY: 7,
};

export const DEFAULT_WALL_OPENING_PARAMS: WallOpeningParams = {
  wallLengthMm: 3600,
  wallThicknessMm: 200,
  openingType: "door",
  openingWidthMm: 900,
  openingOffsetMm: 1350,
};

function normalizeBeamDetailParams(input: Partial<BeamDetailParams> = {}): BeamDetailParams {
  return {
    widthMm: clamp(input.widthMm ?? DEFAULT_BEAM_DETAIL_PARAMS.widthMm, 100, 2000),
    depthMm: clamp(input.depthMm ?? DEFAULT_BEAM_DETAIL_PARAMS.depthMm, 100, 2000),
    topBars: roundClamp(input.topBars ?? DEFAULT_BEAM_DETAIL_PARAMS.topBars, 0, 12),
    bottomBars: roundClamp(input.bottomBars ?? DEFAULT_BEAM_DETAIL_PARAMS.bottomBars, 0, 12),
    barDiaMm: clamp(input.barDiaMm ?? DEFAULT_BEAM_DETAIL_PARAMS.barDiaMm, 6, 50),
    stirrupDiaMm: clamp(input.stirrupDiaMm ?? DEFAULT_BEAM_DETAIL_PARAMS.stirrupDiaMm, 6, 20),
    stirrupSpacingMm: clamp(input.stirrupSpacingMm ?? DEFAULT_BEAM_DETAIL_PARAMS.stirrupSpacingMm, 50, 400),
  };
}

function normalizeColumnDetailParams(input: Partial<ColumnDetailParams> = {}): ColumnDetailParams {
  return {
    view: input.view === "section" ? "section" : "plan",
    widthMm: clamp(input.widthMm ?? DEFAULT_COLUMN_DETAIL_PARAMS.widthMm, 150, 1200),
    depthMm: clamp(input.depthMm ?? DEFAULT_COLUMN_DETAIL_PARAMS.depthMm, 150, 1200),
    mainBars: roundClamp(input.mainBars ?? DEFAULT_COLUMN_DETAIL_PARAMS.mainBars, 4, 20),
    barDiaMm: clamp(input.barDiaMm ?? DEFAULT_COLUMN_DETAIL_PARAMS.barDiaMm, 8, 40),
    tieDiaMm: clamp(input.tieDiaMm ?? DEFAULT_COLUMN_DETAIL_PARAMS.tieDiaMm, 6, 20),
    tieSpacingMm: clamp(input.tieSpacingMm ?? DEFAULT_COLUMN_DETAIL_PARAMS.tieSpacingMm, 75, 400),
    storeyMode: input.storeyMode === "multi" ? "multi" : "single",
  };
}

function normalizeFootingDetailParams(input: Partial<FootingDetailParams> = {}): FootingDetailParams {
  return {
    view: input.view === "section" ? "section" : "plan",
    footingWidthMm: clamp(input.footingWidthMm ?? DEFAULT_FOOTING_DETAIL_PARAMS.footingWidthMm, 600, 5000),
    footingLengthMm: clamp(input.footingLengthMm ?? DEFAULT_FOOTING_DETAIL_PARAMS.footingLengthMm, 600, 5000),
    footingDepthMm: clamp(input.footingDepthMm ?? DEFAULT_FOOTING_DETAIL_PARAMS.footingDepthMm, 250, 1500),
    columnWidthMm: clamp(input.columnWidthMm ?? DEFAULT_FOOTING_DETAIL_PARAMS.columnWidthMm, 150, 1200),
    columnDepthMm: clamp(input.columnDepthMm ?? DEFAULT_FOOTING_DETAIL_PARAMS.columnDepthMm, 150, 1200),
    barDiaMm: clamp(input.barDiaMm ?? DEFAULT_FOOTING_DETAIL_PARAMS.barDiaMm, 8, 32),
    barCountX: roundClamp(input.barCountX ?? DEFAULT_FOOTING_DETAIL_PARAMS.barCountX, 3, 16),
    barCountY: roundClamp(input.barCountY ?? DEFAULT_FOOTING_DETAIL_PARAMS.barCountY, 3, 16),
  };
}

function normalizeWallOpeningParams(
  kind: ParametricBlockKind,
  input: Partial<WallOpeningParams> = {},
): WallOpeningParams {
  const defaultOpeningType =
    kind === "door-opening" ? "door" : kind === "window-opening" ? "window" : DEFAULT_WALL_OPENING_PARAMS.openingType;
  const wallLengthMm = clamp(input.wallLengthMm ?? DEFAULT_WALL_OPENING_PARAMS.wallLengthMm, 900, 12000);
  const wallThicknessMm = clamp(input.wallThicknessMm ?? DEFAULT_WALL_OPENING_PARAMS.wallThicknessMm, 75, 500);
  const openingWidthMm = clamp(input.openingWidthMm ?? DEFAULT_WALL_OPENING_PARAMS.openingWidthMm, 300, wallLengthMm - 300);
  const openingOffsetMm = clamp(
    input.openingOffsetMm ?? (wallLengthMm - openingWidthMm) / 2,
    120,
    Math.max(120, wallLengthMm - openingWidthMm - 120),
  );
  const requestedType = input.openingType ?? defaultOpeningType;

  return {
    wallLengthMm,
    wallThicknessMm,
    openingType: kind === "door-opening" ? "door" : kind === "window-opening" ? "window" : requestedType,
    openingWidthMm,
    openingOffsetMm,
  };
}

export function normalizeParametricParams(
  kind: ParametricBlockKind,
  params?: Partial<ParametricBlockParams>,
): ParametricBlockParams {
  const template = TEMPLATE_REGISTRY[kind];
  if (template) return normalizeTemplateValues(template, params as Partial<TemplateParamValues>);
  if (kind === "beam-detail") return normalizeBeamDetailParams(params as Partial<BeamDetailParams>);
  if (kind === "column-detail") return normalizeColumnDetailParams(params as Partial<ColumnDetailParams>);
  if (kind === "footing-detail") return normalizeFootingDetailParams(params as Partial<FootingDetailParams>);
  return normalizeWallOpeningParams(kind, params as Partial<WallOpeningParams>);
}

export function getDefaultParametricParams(kind: ParametricBlockKind): ParametricBlockParams {
  return normalizeParametricParams(kind);
}

// ------------------------------------------------------------------
// Beam section — CAD monochrome
// ------------------------------------------------------------------
export function createBeamDetailSvg(input: Partial<BeamDetailParams> = {}) {
  const { widthMm, depthMm, topBars, bottomBars, barDiaMm, stirrupDiaMm, stirrupSpacingMm } =
    normalizeBeamDetailParams(input);

  const s = Math.min(0.55, 220 / Math.max(widthMm, depthMm));
  const w = Math.max(widthMm * s, 120);
  const h = Math.max(depthMm * s, 120);
  const x = 116;
  const y = 76;
  const coverPx = Math.max(30 * s * 1.6, 14);

  const parts: string[] = [];

  // Section outline + concrete hatch
  parts.push(rect(x, y, w, h, { fill: CAD.white, strokeWidth: CAD.thick }));
  parts.push(concreteHatchRect(x + 1.5, y + 1.5, w - 3, h - 3, 13));

  // Stirrup (closed link)
  const sw = Math.max(stirrupDiaMm * 0.3, 2);
  parts.push(
    `<rect x="${x + coverPx}" y="${y + coverPx}" width="${w - coverPx * 2}" height="${h - coverPx * 2}" rx="7" fill="none" stroke="${CAD.ink}" stroke-width="${sw}"/>`,
  );

  // Bars
  const barR = Math.max(barDiaMm * 0.28, 3.4);
  const bx1 = x + coverPx + barR + 2;
  const bx2 = x + w - coverPx - barR - 2;
  const topY = y + coverPx + barR + 2;
  const botY = y + h - coverPx - barR - 2;
  const placeRow = (count: number, rowY: number) => {
    if (count <= 0) return;
    if (count === 1) {
      parts.push(barDot((bx1 + bx2) / 2, rowY, barDiaMm));
      return;
    }
    for (let index = 0; index < count; index += 1) {
      const t = index / (count - 1);
      parts.push(barDot(bx1 + (bx2 - bx1) * t, rowY, barDiaMm));
    }
  };
  placeRow(topBars, topY);
  placeRow(bottomBars, botY);

  // Dimensions
  parts.push(dimH(x, x + w, y, y - 34, mmLabel(widthMm)));
  parts.push(dimV(y, y + h, x, x - 38, mmLabel(depthMm)));

  // Leaders
  const lx = x + w + 64;
  parts.push(leader(bx2 - 4, topY, lx, y + 8, [`${topBars}T${mmLabel(barDiaMm)} TOP`]));
  parts.push(leader(bx2 - 4, botY, lx, y + h - 4, [`${bottomBars}T${mmLabel(barDiaMm)} BOTTOM`]));
  parts.push(leader(x + w - coverPx, y + h / 2, lx, y + h / 2 - 4, [`R${mmLabel(stirrupDiaMm)} @ ${mmLabel(stirrupSpacingMm)} C/C`, "STIRRUPS"]));

  const titleY = y + h + 64;
  parts.push(drawingTitle(x + w / 2 + 40, titleY, "BEAM SECTION", `${mmLabel(widthMm)} x ${mmLabel(depthMm)} — SCALE: NTS`));

  return svgDoc(lx + 196, titleY + 52, parts.join(""));
}

// ------------------------------------------------------------------
// Column — plan section & elevation, CAD monochrome
// ------------------------------------------------------------------
function getColumnPerimeterBars(count: number) {
  const perimeterBars = Math.max(count, 4);
  const extra = perimeterBars - 4;
  const sideEach = Math.floor(extra / 2);
  const remainder = extra % 2;
  return { leftSide: sideEach, rightSide: sideEach, topSide: remainder };
}

function createColumnPlanSvg(input: ColumnDetailParams) {
  const s = Math.min(0.62, 230 / Math.max(input.widthMm, input.depthMm));
  const w = Math.max(input.widthMm * s, 110);
  const h = Math.max(input.depthMm * s, 110);
  const x = 116;
  const y = 76;
  const coverPx = Math.max(30 * s * 1.6, 13);

  const parts: string[] = [];
  parts.push(rect(x, y, w, h, { fill: CAD.white, strokeWidth: CAD.thick }));
  parts.push(concreteHatchRect(x + 1.5, y + 1.5, w - 3, h - 3, 12));

  const tw = Math.max(input.tieDiaMm * 0.3, 1.8);
  parts.push(
    `<rect x="${x + coverPx}" y="${y + coverPx}" width="${w - coverPx * 2}" height="${h - coverPx * 2}" rx="7" fill="none" stroke="${CAD.ink}" stroke-width="${tw}"/>`,
  );

  const barR = Math.max(input.barDiaMm * 0.26, 3.2);
  const left = x + coverPx + barR + 2;
  const right = x + w - coverPx - barR - 2;
  const top = y + coverPx + barR + 2;
  const bottom = y + h - coverPx - barR - 2;
  const dist = getColumnPerimeterBars(input.mainBars);

  parts.push(barDot(left, top, input.barDiaMm));
  parts.push(barDot(right, top, input.barDiaMm));
  parts.push(barDot(left, bottom, input.barDiaMm));
  parts.push(barDot(right, bottom, input.barDiaMm));
  for (let index = 1; index <= dist.leftSide; index += 1) {
    const ratio = index / (dist.leftSide + 1);
    const yy = top + (bottom - top) * ratio;
    parts.push(barDot(left, yy, input.barDiaMm));
    parts.push(barDot(right, yy, input.barDiaMm));
  }
  for (let index = 1; index <= dist.topSide; index += 1) {
    const ratio = index / (dist.topSide + 1);
    const xx = left + (right - left) * ratio;
    parts.push(barDot(xx, top, input.barDiaMm));
  }

  parts.push(dimH(x, x + w, y, y - 34, mmLabel(input.widthMm)));
  parts.push(dimV(y, y + h, x, x - 38, mmLabel(input.depthMm)));

  const lx = x + w + 64;
  parts.push(leader(right, top, lx, y + 10, [`${input.mainBars}T${mmLabel(input.barDiaMm)}`, "MAIN BARS"]));
  parts.push(leader(x + w - coverPx, y + h / 2 + 8, lx, y + h / 2 + 18, [`R${mmLabel(input.tieDiaMm)} @ ${mmLabel(input.tieSpacingMm)} C/C`, "TIES"]));

  const titleY = y + h + 64;
  parts.push(drawingTitle(x + w / 2 + 40, titleY, "COLUMN SECTION", `${mmLabel(input.widthMm)} x ${mmLabel(input.depthMm)} — SCALE: NTS`));
  return svgDoc(lx + 186, titleY + 52, parts.join(""));
}

function createColumnSectionSvg(input: ColumnDetailParams) {
  const storeyH = input.storeyMode === "multi" ? 330 : 250;
  const w = Math.max(input.widthMm * 0.42, 96);
  const x = 150;
  const y = 84;
  const floorY = y + storeyH;

  const parts: string[] = [];

  // Floor slab at base
  parts.push(rect(x - 96, floorY, w + 192, 34, { fill: CAD.white, strokeWidth: CAD.thick }));
  parts.push(concreteHatchRect(x - 94, floorY + 1.5, w + 188, 31, 12));

  // Column shaft
  parts.push(rect(x, y, w, storeyH, { fill: CAD.white, strokeWidth: CAD.thick }));

  // Main bars (vertical, near faces)
  const inset = Math.max(w * 0.16, 12);
  parts.push(line(x + inset, y - (input.storeyMode === "multi" ? 34 : 0), x + inset, floorY + 30, 2.6));
  parts.push(line(x + w - inset, y - (input.storeyMode === "multi" ? 34 : 0), x + w - inset, floorY + 30, 2.6));

  // Ties at spacing
  const tieStep = Math.max(input.tieSpacingMm * 0.24, 13);
  for (let ty = y + 12; ty < floorY - 8; ty += tieStep) {
    parts.push(line(x + 7, ty, x + w - 7, ty, 1.2));
  }

  // Lap / starter note
  const lapNote =
    input.storeyMode === "multi"
      ? ["BARS CONTINUE TO", "UPPER STOREY — LAP 40Ø"]
      : ["STARTER BARS", "FROM FOUNDATION"];
  parts.push(leader(x + inset, y + 14, x + w + 72, y + 6, lapNote));
  parts.push(leader(x + w - 10, y + storeyH * 0.45, x + w + 72, y + storeyH * 0.42, [`R${mmLabel(input.tieDiaMm)} @ ${mmLabel(input.tieSpacingMm)} C/C TIES`]));
  parts.push(leader(x + w - inset, floorY - 26, x + w + 72, floorY - 40, [`${input.mainBars}T${mmLabel(input.barDiaMm)} MAIN BARS`]));

  // Dimensions
  parts.push(dimV(y, floorY, x, x - 44, input.storeyMode === "multi" ? "3200" : "2800"));
  parts.push(dimH(x, x + w, floorY + 34, floorY + 70, mmLabel(input.widthMm)));

  const titleY = floorY + 122;
  parts.push(drawingTitle(x + w / 2 + 50, titleY, "COLUMN ELEVATION", "SCALE: NTS"));
  return svgDoc(x + w + 280, titleY + 52, parts.join(""));
}

export function createColumnDetailSvg(input: Partial<ColumnDetailParams> = {}) {
  const normalized = normalizeColumnDetailParams(input);
  return normalized.view === "plan" ? createColumnPlanSvg(normalized) : createColumnSectionSvg(normalized);
}

// ------------------------------------------------------------------
// Isolated footing — plan & section, CAD monochrome
// ------------------------------------------------------------------
function createFootingPlanSvg(input: FootingDetailParams) {
  const s = Math.min(0.15, 300 / Math.max(input.footingWidthMm, input.footingLengthMm));
  const fw = Math.max(input.footingWidthMm * s, 170);
  const fl = Math.max(input.footingLengthMm * s, 170);
  const cw = Math.min(Math.max(input.columnWidthMm * s, 30), fw - 40);
  const cl = Math.min(Math.max(input.columnDepthMm * s, 30), fl - 40);
  const x = 118;
  const y = 84;
  const colX = x + fw / 2 - cw / 2;
  const colY = y + fl / 2 - cl / 2;

  const parts: string[] = [];
  parts.push(rect(x, y, fw, fl, { fill: CAD.white, strokeWidth: CAD.thick }));

  // Reinforcement mesh
  for (let index = 0; index < input.barCountX; index += 1) {
    const ratio = index / Math.max(input.barCountX - 1, 1);
    const xx = x + 16 + ratio * (fw - 32);
    parts.push(line(xx, y + 14, xx, y + fl - 14, 1.6));
  }
  for (let index = 0; index < input.barCountY; index += 1) {
    const ratio = index / Math.max(input.barCountY - 1, 1);
    const yy = y + 16 + ratio * (fl - 32);
    parts.push(line(x + 14, yy, x + fw - 14, yy, 1.6));
  }

  // Column over mesh
  parts.push(rect(colX, colY, cw, cl, { fill: CAD.white, strokeWidth: CAD.thick }));
  parts.push(concreteHatchRect(colX + 1.5, colY + 1.5, cw - 3, cl - 3, 9));

  // Dimensions
  parts.push(dimH(x, x + fw, y, y - 34, mmLabel(input.footingWidthMm)));
  parts.push(dimV(y, y + fl, x, x - 38, mmLabel(input.footingLengthMm)));
  parts.push(dimH(colX, colX + cw, colY, y - 8, mmLabel(input.columnWidthMm), { size: 10 }));

  // Leaders
  const lx = x + fw + 62;
  parts.push(leader(x + fw - 30, y + 24, lx, y + 12, [`${input.barCountX}T${mmLabel(input.barDiaMm)} DIR. X`]));
  parts.push(leader(x + fw - 22, y + fl - 30, lx, y + fl - 36, [`${input.barCountY}T${mmLabel(input.barDiaMm)} DIR. Y`]));

  const titleY = y + fl + 62;
  parts.push(drawingTitle(x + fw / 2 + 40, titleY, "ISOLATED FOOTING PLAN", "SCALE: NTS"));
  return svgDoc(lx + 180, titleY + 52, parts.join(""));
}

function createFootingSectionSvg(input: FootingDetailParams) {
  const s = Math.min(0.16, 330 / input.footingWidthMm);
  const fw = Math.max(input.footingWidthMm * s, 220);
  const fh = Math.max(input.footingDepthMm * s * 1.3, 54);
  const pw = Math.min(Math.max(input.columnWidthMm * s * 1.3, 52), fw - 60);
  const x = 130;
  const yGround = 96;
  const pedestalH = 96;
  const yFtg = yGround + pedestalH;
  const colX = x + fw / 2 - pw / 2;

  const parts: string[] = [];

  // Ground line + earth ticks
  parts.push(line(x - 84, yGround, x + fw + 84, yGround, 1.3));
  parts.push(earthTicks({ x: x + fw + 84, y: yGround }, { x: x - 84, y: yGround }, { spacing: 13, length: 9 }));
  parts.push(text(x - 66, yGround - 9, "GL", { size: 10.5 }));

  // Pedestal / column
  parts.push(rect(colX, yGround - 40, pw, pedestalH + 40, { fill: CAD.white, strokeWidth: CAD.thick }));
  parts.push(concreteHatchRect(colX + 1.5, yGround - 38, pw - 3, pedestalH + 36, 11));

  // Footing block
  parts.push(rect(x, yFtg, fw, fh, { fill: CAD.white, strokeWidth: CAD.thick }));
  parts.push(concreteHatchRect(x + 1.5, yFtg + 1.5, fw - 3, fh - 3, 12));

  // Bottom mat with end hooks
  const barY = yFtg + fh - 12;
  parts.push(line(x + 16, barY, x + fw - 16, barY, 2.6));
  parts.push(line(x + 16, barY, x + 16, barY - 14, 2.6));
  parts.push(line(x + fw - 16, barY, x + fw - 16, barY - 14, 2.6));
  for (let bx = x + 34; bx < x + fw - 24; bx += 30) parts.push(barDot(bx, barY - 7, input.barDiaMm));

  // Starter bars into pedestal
  parts.push(line(colX + 12, yGround - 40, colX + 12, barY - 4, 2.2));
  parts.push(line(colX + pw - 12, yGround - 40, colX + pw - 12, barY - 4, 2.2));
  parts.push(line(colX + 12, barY - 4, colX + 12 + 22, barY - 4, 2.2));
  parts.push(line(colX + pw - 12, barY - 4, colX + pw - 12 - 22, barY - 4, 2.2));

  // Blinding
  parts.push(rect(x - 14, yFtg + fh, fw + 28, 15, { strokeWidth: CAD.thin }));
  parts.push(gravelRect(x - 14, yFtg + fh, fw + 28, 15, 10));

  // Dimensions
  parts.push(dimH(x, x + fw, yFtg + fh + 15, yFtg + fh + 56, mmLabel(input.footingWidthMm)));
  parts.push(dimV(yFtg, yFtg + fh, x + fw, x + fw + 46, mmLabel(input.footingDepthMm)));
  parts.push(dimH(colX, colX + pw, yGround - 40, yGround - 68, mmLabel(input.columnWidthMm)));

  // Leaders
  parts.push(leader(x + fw - 56, barY - 5, x + fw + 100, barY - 32, [`${input.barCountX} / ${input.barCountY} T${mmLabel(input.barDiaMm)}`, "BOTTOM MAT E.W."]));
  parts.push(leader(x + fw - 30, yFtg + fh + 8, x + fw + 100, yFtg + fh + 34, ["75 mm BLINDING"]));

  const titleY = yFtg + fh + 112;
  parts.push(drawingTitle(x + fw / 2 + 30, titleY, "ISOLATED FOOTING SECTION", "SCALE: NTS"));
  return svgDoc(x + fw + 230, titleY + 52, parts.join(""));
}

export function createFootingDetailSvg(input: Partial<FootingDetailParams> = {}) {
  const normalized = normalizeFootingDetailParams(input);
  return normalized.view === "plan" ? createFootingPlanSvg(normalized) : createFootingSectionSvg(normalized);
}

// ------------------------------------------------------------------
// Wall opening (plan), CAD monochrome with dimension chain
// ------------------------------------------------------------------
export function createWallOpeningSvg(input: Partial<WallOpeningParams> = {}) {
  const { wallLengthMm, wallThicknessMm, openingType, openingWidthMm, openingOffsetMm } =
    normalizeWallOpeningParams("wall-opening", input);

  const s = Math.min(0.17, 620 / wallLengthMm);
  const wallW = wallLengthMm * s;
  const wallH = Math.max(wallThicknessMm * s * 1.4, 30);
  const x = 96;
  const y = 110;
  const oX = x + openingOffsetMm * s;
  const oW = openingWidthMm * s;

  const parts: string[] = [];

  // Wall segments with masonry hatch
  parts.push(rect(x, y, oX - x, wallH, { fill: CAD.white, strokeWidth: CAD.thick }));
  parts.push(hatchRect(x + 1.5, y + 1.5, oX - x - 3, wallH - 3, { spacing: 8 }));
  parts.push(rect(oX + oW, y, x + wallW - oX - oW, wallH, { fill: CAD.white, strokeWidth: CAD.thick }));
  parts.push(hatchRect(oX + oW + 1.5, y + 1.5, x + wallW - oX - oW - 3, wallH - 3, { spacing: 8 }));

  // Opening (dashed reveal lines)
  parts.push(line(oX, y, oX + oW, y, 1, CAD.faint, "7 6"));
  parts.push(line(oX, y + wallH, oX + oW, y + wallH, 1, CAD.faint, "7 6"));

  if (openingType === "door") {
    // Door leaf + swing
    parts.push(line(oX, y + wallH, oX, y + wallH + oW, 2.4));
    parts.push(
      `<path d="M${oX} ${y + wallH + oW} A${oW} ${oW} 0 0 0 ${oX + oW} ${y + wallH}" stroke="${CAD.ink}" stroke-width="1" fill="none" stroke-dasharray="3 4"/>`,
    );
  } else if (openingType === "window") {
    const mid = y + wallH / 2;
    parts.push(line(oX, mid - 5, oX + oW, mid - 5, 1.4));
    parts.push(line(oX, mid, oX + oW, mid, 2.2));
    parts.push(line(oX, mid + 5, oX + oW, mid + 5, 1.4));
    parts.push(line(oX, y, oX, y + wallH, 1.4));
    parts.push(line(oX + oW, y, oX + oW, y + wallH, 1.4));
  }

  // Dimension chain below: offset | opening | remainder, total above
  const yDim = y + wallH + (openingType === "door" ? oW + 26 : 38);
  parts.push(dimH(x, oX, y + wallH, yDim, mmLabel(openingOffsetMm)));
  parts.push(dimH(oX, oX + oW, y + wallH, yDim, mmLabel(openingWidthMm)));
  parts.push(dimH(oX + oW, x + wallW, y + wallH, yDim, mmLabel(wallLengthMm - openingOffsetMm - openingWidthMm)));
  parts.push(dimH(x, x + wallW, y, y - 38, mmLabel(wallLengthMm)));
  parts.push(dimV(y, y + wallH, x, x - 34, mmLabel(wallThicknessMm), { size: 10 }));

  const label = openingType === "door" ? "DOOR" : openingType === "window" ? "WINDOW" : "OPENING";
  const titleY = yDim + 56;
  parts.push(drawingTitle(x + wallW / 2, titleY, `WALL PLAN — ${mmLabel(openingWidthMm)} ${label}`, "SCALE: NTS"));
  return svgDoc(x * 2 + wallW, titleY + 52, parts.join(""));
}

export function createDoorBlockSvg(widthMm = 900) {
  return createWallOpeningSvg({
    wallLengthMm: 2400,
    wallThicknessMm: 200,
    openingType: "door",
    openingWidthMm: widthMm,
    openingOffsetMm: 750,
  });
}

export function createWindowBlockSvg(widthMm = 1200) {
  return createWallOpeningSvg({
    wallLengthMm: 3000,
    wallThicknessMm: 200,
    openingType: "window",
    openingWidthMm: widthMm,
    openingOffsetMm: 900,
  });
}

// ------------------------------------------------------------------
// Dispatch — registry templates first, then legacy kinds.
// ------------------------------------------------------------------
export function createParametricBlockSvg(kind: ParametricBlockKind, params?: Partial<ParametricBlockParams>) {
  if (TEMPLATE_REGISTRY[kind]) {
    return createTemplateSvg(kind, params as Partial<TemplateParamValues>);
  }
  const normalized = normalizeParametricParams(kind, params);
  if (kind === "beam-detail") return createBeamDetailSvg(normalized as BeamDetailParams);
  if (kind === "column-detail") return createColumnDetailSvg(normalized as ColumnDetailParams);
  if (kind === "footing-detail") return createFootingDetailSvg(normalized as FootingDetailParams);
  return createWallOpeningSvg(normalized as WallOpeningParams);
}

// Re-export for consumers that need template metadata alongside blocks.
export { TEMPLATE_REGISTRY, DRAWING_TEMPLATES, normalizeTemplateValues, createTemplateSvg };
export type { TemplateParamValues };
