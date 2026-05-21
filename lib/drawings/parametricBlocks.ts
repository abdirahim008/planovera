export type ParametricBlockKind =
  | "beam-detail"
  | "column-detail"
  | "footing-detail"
  | "wall-opening"
  | "door-opening"
  | "window-opening";

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
  | WallOpeningParams;

export type ParametricBlockState = {
  kind: ParametricBlockKind;
  label: string;
  params: ParametricBlockParams;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const roundClamp = (value: number, min: number, max: number) => clamp(Math.round(value), min, max);

const svgDoc = (viewBox: string, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" fill="none">${body}</svg>`;

export const PARAMETRIC_BLOCK_LABELS: Record<ParametricBlockKind, string> = {
  "beam-detail": "Beam detailing",
  "column-detail": "Column detailing",
  "footing-detail": "Footing detailing",
  "wall-opening": "Wall opening",
  "door-opening": "Door opening",
  "window-opening": "Window opening",
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
  if (kind === "beam-detail") return normalizeBeamDetailParams(params as Partial<BeamDetailParams>);
  if (kind === "column-detail") return normalizeColumnDetailParams(params as Partial<ColumnDetailParams>);
  if (kind === "footing-detail") return normalizeFootingDetailParams(params as Partial<FootingDetailParams>);
  return normalizeWallOpeningParams(kind, params as Partial<WallOpeningParams>);
}

export function getDefaultParametricParams(kind: ParametricBlockKind): ParametricBlockParams {
  return normalizeParametricParams(kind);
}

function distributeBars(count: number, x1: number, x2: number, y: number, radius: number) {
  if (count <= 0) return "";
  if (count === 1) {
    return `<circle cx="${(x1 + x2) / 2}" cy="${y}" r="${radius}" fill="#0f172a"/>`;
  }
  return Array.from({ length: count }, (_, index) => {
    const t = index / (count - 1);
    const x = x1 + (x2 - x1) * t;
    return `<circle cx="${x}" cy="${y}" r="${radius}" fill="#0f172a"/>`;
  }).join("");
}

export function createBeamDetailSvg(input: Partial<BeamDetailParams> = {}) {
  const { widthMm, depthMm, topBars, bottomBars, barDiaMm, stirrupDiaMm, stirrupSpacingMm } =
    normalizeBeamDetailParams(input);
  const scale = 1.15;
  const beamW = Math.max(widthMm * scale, 180);
  const beamH = Math.max(depthMm * scale, 180);
  const pad = 78;
  const cover = 34;
  const barRadius = Math.max(barDiaMm * 0.9, 7);
  const stirrupStroke = Math.max(stirrupDiaMm * 0.55, 4);
  const topY = pad + cover;
  const bottomY = pad + beamH - cover;
  const x1 = pad + cover;
  const x2 = pad + beamW - cover;

  return svgDoc(
    `0 0 ${beamW + pad * 2} ${beamH + pad * 2 + 86}`,
    `
      <line x1="${pad}" y1="${pad - 26}" x2="${pad + beamW}" y2="${pad - 26}" stroke="#ff4fa3" stroke-width="3"/>
      <line x1="${pad}" y1="${pad - 40}" x2="${pad}" y2="${pad - 12}" stroke="#ff4fa3" stroke-width="3"/>
      <line x1="${pad + beamW}" y1="${pad - 40}" x2="${pad + beamW}" y2="${pad - 12}" stroke="#ff4fa3" stroke-width="3"/>
      <text x="${pad + beamW / 2}" y="${pad - 30}" text-anchor="middle" font-family="Arial" font-size="12" fill="#ff4fa3">${(widthMm / 1000).toFixed(2)}</text>
      <line x1="${pad - 28}" y1="${pad}" x2="${pad - 28}" y2="${pad + beamH}" stroke="#ff4fa3" stroke-width="3"/>
      <line x1="${pad - 42}" y1="${pad}" x2="${pad - 14}" y2="${pad}" stroke="#ff4fa3" stroke-width="3"/>
      <line x1="${pad - 42}" y1="${pad + beamH}" x2="${pad - 14}" y2="${pad + beamH}" stroke="#ff4fa3" stroke-width="3"/>
      <text x="${pad - 32}" y="${pad + beamH / 2}" transform="rotate(-90 ${pad - 32} ${pad + beamH / 2})" text-anchor="middle" font-family="Arial" font-size="12" fill="#ff4fa3">${(depthMm / 1000).toFixed(2)}</text>
      <rect x="${pad}" y="${pad}" width="${beamW}" height="${beamH}" fill="#ffffff" stroke="#0f172a" stroke-width="5"/>
      <rect x="${pad + cover / 2}" y="${pad + cover / 2}" width="${beamW - cover}" height="${beamH - cover}" rx="10" stroke="#0f172a" stroke-width="${stirrupStroke}"/>
      ${distributeBars(topBars, x1, x2, topY, barRadius)}
      ${distributeBars(bottomBars, x1, x2, bottomY, barRadius)}
      <text x="${pad + beamW / 2}" y="${pad + beamH + 42}" text-anchor="middle" font-family="Arial" font-size="19" font-weight="700" fill="#0f172a">BEAM DETAILING</text>
      <text x="${pad + beamW / 2}" y="${pad + beamH + 62}" text-anchor="middle" font-family="Arial" font-size="16" fill="#334155">${widthMm} x ${depthMm} / TOP ${topBars}T${barDiaMm} / BOT ${bottomBars}T${barDiaMm}</text>
      <text x="${pad + beamW / 2}" y="${pad + beamH + 80}" text-anchor="middle" font-family="Arial" font-size="14" fill="#475569">R${stirrupDiaMm} @ ${stirrupSpacingMm}</text>
    `,
  );
}

function getColumnPerimeterBars(count: number) {
  const perimeterBars = Math.max(count, 4);
  const extra = perimeterBars - 4;
  const sideEach = Math.floor(extra / 2);
  const remainder = extra % 2;
  return {
    leftSide: sideEach,
    rightSide: sideEach,
    topSide: remainder,
    bottomSide: 0,
  };
}

function createColumnPlanSvg(input: ColumnDetailParams) {
  const scale = 0.62;
  const width = Math.max(input.widthMm * scale, 120);
  const depth = Math.max(input.depthMm * scale, 120);
  const offsetX = 88;
  const offsetY = 70;
  const tieInset = 18;
  const barRadius = Math.max(input.barDiaMm * 0.45, 6);
  const left = offsetX + 16;
  const right = offsetX + width - 16;
  const top = offsetY + 16;
  const bottom = offsetY + depth - 16;
  const distribution = getColumnPerimeterBars(input.mainBars);
  const bars: string[] = [
    `<circle cx="${left}" cy="${top}" r="${barRadius}" fill="#0f172a"/>`,
    `<circle cx="${right}" cy="${top}" r="${barRadius}" fill="#0f172a"/>`,
    `<circle cx="${left}" cy="${bottom}" r="${barRadius}" fill="#0f172a"/>`,
    `<circle cx="${right}" cy="${bottom}" r="${barRadius}" fill="#0f172a"/>`,
  ];

  for (let index = 1; index <= distribution.leftSide; index += 1) {
    const ratio = index / (distribution.leftSide + 1);
    const y = top + (bottom - top) * ratio;
    bars.push(`<circle cx="${left}" cy="${y}" r="${barRadius - 1}" fill="#ef4444"/>`);
    bars.push(`<circle cx="${right}" cy="${y}" r="${barRadius - 1}" fill="#ef4444"/>`);
  }
  for (let index = 1; index <= distribution.topSide; index += 1) {
    const ratio = index / (distribution.topSide + 1);
    const x = left + (right - left) * ratio;
    bars.push(`<circle cx="${x}" cy="${top}" r="${barRadius - 1}" fill="#ef4444"/>`);
  }

  return svgDoc(
    `0 0 ${width + 240} ${depth + 170}`,
    `
      <line x1="${offsetX}" y1="${offsetY - 24}" x2="${offsetX + width}" y2="${offsetY - 24}" stroke="#ff4fa3" stroke-width="3"/>
      <line x1="${offsetX}" y1="${offsetY - 38}" x2="${offsetX}" y2="${offsetY - 10}" stroke="#ff4fa3" stroke-width="3"/>
      <line x1="${offsetX + width}" y1="${offsetY - 38}" x2="${offsetX + width}" y2="${offsetY - 10}" stroke="#ff4fa3" stroke-width="3"/>
      <text x="${offsetX + width / 2}" y="${offsetY - 28}" text-anchor="middle" font-family="Arial" font-size="12" fill="#ff4fa3">${(input.widthMm / 1000).toFixed(2)}</text>
      <line x1="${offsetX - 28}" y1="${offsetY}" x2="${offsetX - 28}" y2="${offsetY + depth}" stroke="#ff4fa3" stroke-width="3"/>
      <line x1="${offsetX - 42}" y1="${offsetY}" x2="${offsetX - 14}" y2="${offsetY}" stroke="#ff4fa3" stroke-width="3"/>
      <line x1="${offsetX - 42}" y1="${offsetY + depth}" x2="${offsetX - 14}" y2="${offsetY + depth}" stroke="#ff4fa3" stroke-width="3"/>
      <text x="${offsetX - 32}" y="${offsetY + depth / 2}" transform="rotate(-90 ${offsetX - 32} ${offsetY + depth / 2})" text-anchor="middle" font-family="Arial" font-size="12" fill="#ff4fa3">${(input.depthMm / 1000).toFixed(2)}</text>
      <rect x="${offsetX}" y="${offsetY}" width="${width}" height="${depth}" fill="#f8fafc" stroke="#0f172a" stroke-width="4"/>
      <rect x="${offsetX + tieInset}" y="${offsetY + tieInset}" width="${width - tieInset * 2}" height="${depth - tieInset * 2}" rx="12" stroke="#0f172a" stroke-width="4"/>
      ${bars.join("")}
      <text x="${offsetX + width + 26}" y="${offsetY + 48}" font-family="Arial" font-size="13" fill="#0f172a">${input.mainBars}T${input.barDiaMm}</text>
      <text x="${offsetX + width + 26}" y="${offsetY + 66}" font-family="Arial" font-size="13" fill="#0f172a">ties R${input.tieDiaMm}</text>
      <text x="${offsetX + width + 26}" y="${offsetY + 84}" font-family="Arial" font-size="13" fill="#0f172a">@ ${input.tieSpacingMm}</text>
      <text x="${offsetX + width / 2}" y="${offsetY + depth + 38}" text-anchor="middle" font-family="Arial" font-size="18" font-weight="700" fill="#0f172a">COLUMN DETAILING PLAN</text>
    `,
  );
}

function createColumnSectionSvg(input: ColumnDetailParams) {
  const height = input.storeyMode === "multi" ? 300 : 220;
  const width = Math.max(input.widthMm * 0.5, 120);
  const x = 120;
  const y = 52;
  const outerY = y + 24;
  const tieCount = Math.max(Math.round(height / Math.max(input.tieSpacingMm * 0.45, 26)), 4);
  const tieLines = Array.from({ length: tieCount }, (_, index) => {
    const ratio = index / Math.max(tieCount - 1, 1);
    const yy = outerY + ratio * (height - 48);
    return `<line x1="${x + 20}" y1="${yy}" x2="${x + width - 20}" y2="${yy}" stroke="#0f172a" stroke-width="3"/>`;
  }).join("");
  const continuation =
    input.storeyMode === "multi"
      ? `<path d="M${x + 22} ${y + 8} V${y - 18} M${x + width - 22} ${y + 8} V${y - 18}" stroke="#ef4444" stroke-width="4"/>
         <text x="${x + width + 40}" y="${y + 18}" font-family="Arial" font-size="12" fill="#0f172a">continues to upper storey</text>`
      : `<path d="M${x + 22} ${y + 8} V${y - 8} M${x + width - 22} ${y + 8} V${y - 8}" stroke="#ef4444" stroke-width="4"/>
         <text x="${x + width + 40}" y="${y + 18}" font-family="Arial" font-size="12" fill="#0f172a">starter bars / single storey</text>`;

  return svgDoc(
    `0 0 520 ${height + 150}`,
    `
      <line x1="${x - 28}" y1="${y}" x2="${x - 28}" y2="${y + height}" stroke="#ff4fa3" stroke-width="3"/>
      <line x1="${x - 42}" y1="${y}" x2="${x - 14}" y2="${y}" stroke="#ff4fa3" stroke-width="3"/>
      <line x1="${x - 42}" y1="${y + height}" x2="${x - 14}" y2="${y + height}" stroke="#ff4fa3" stroke-width="3"/>
      <text x="${x - 32}" y="${y + height / 2}" transform="rotate(-90 ${x - 32} ${y + height / 2})" text-anchor="middle" font-family="Arial" font-size="12" fill="#ff4fa3">${input.storeyMode === "multi" ? "3.20" : "2.80"}</text>
      <rect x="${x}" y="${y}" width="${width}" height="${height}" fill="#ffffff" stroke="#0f172a" stroke-width="4"/>
      ${tieLines}
      <line x1="${x + 22}" y1="${y}" x2="${x + 22}" y2="${y + height}" stroke="#ef4444" stroke-width="4"/>
      <line x1="${x + width - 22}" y1="${y}" x2="${x + width - 22}" y2="${y + height}" stroke="#ef4444" stroke-width="4"/>
      ${continuation}
      <text x="${x + width + 40}" y="${y + 54}" font-family="Arial" font-size="13" fill="#0f172a">${input.mainBars}T${input.barDiaMm}</text>
      <text x="${x + width + 40}" y="${y + 74}" font-family="Arial" font-size="13" fill="#0f172a">R${input.tieDiaMm} @ ${input.tieSpacingMm}</text>
      <text x="${x + width / 2}" y="${y + height + 42}" text-anchor="middle" font-family="Arial" font-size="18" font-weight="700" fill="#0f172a">COLUMN DETAILING SECTION</text>
    `,
  );
}

export function createColumnDetailSvg(input: Partial<ColumnDetailParams> = {}) {
  const normalized = normalizeColumnDetailParams(input);
  return normalized.view === "plan" ? createColumnPlanSvg(normalized) : createColumnSectionSvg(normalized);
}

function createFootingPlanSvg(input: FootingDetailParams) {
  const scale = 0.16;
  const footingW = Math.max(input.footingWidthMm * scale, 180);
  const footingL = Math.max(input.footingLengthMm * scale, 180);
  const columnW = Math.min(Math.max(input.columnWidthMm * scale, 40), footingW - 40);
  const columnL = Math.min(Math.max(input.columnDepthMm * scale, 40), footingL - 40);
  const x = 88;
  const y = 68;
  const colX = x + footingW / 2 - columnW / 2;
  const colY = y + footingL / 2 - columnL / 2;
  const rebarX = Array.from({ length: input.barCountX }, (_, index) => {
    const ratio = index / Math.max(input.barCountX - 1, 1);
    const xx = x + 18 + ratio * (footingW - 36);
    return `<line x1="${xx}" y1="${y + 18}" x2="${xx}" y2="${y + footingL - 18}" stroke="#ef4444" stroke-width="2.5"/>`;
  }).join("");
  const rebarY = Array.from({ length: input.barCountY }, (_, index) => {
    const ratio = index / Math.max(input.barCountY - 1, 1);
    const yy = y + 18 + ratio * (footingL - 36);
    return `<line x1="${x + 18}" y1="${yy}" x2="${x + footingW - 18}" y2="${yy}" stroke="#f59e0b" stroke-width="2.5"/>`;
  }).join("");

  return svgDoc(
    `0 0 ${footingW + 240} ${footingL + 170}`,
    `
      <line x1="${x}" y1="${y - 24}" x2="${x + footingW}" y2="${y - 24}" stroke="#ff4fa3" stroke-width="3"/>
      <line x1="${x}" y1="${y - 38}" x2="${x}" y2="${y - 10}" stroke="#ff4fa3" stroke-width="3"/>
      <line x1="${x + footingW}" y1="${y - 38}" x2="${x + footingW}" y2="${y - 10}" stroke="#ff4fa3" stroke-width="3"/>
      <text x="${x + footingW / 2}" y="${y - 28}" text-anchor="middle" font-family="Arial" font-size="12" fill="#ff4fa3">${(input.footingWidthMm / 1000).toFixed(2)}</text>
      <line x1="${x - 28}" y1="${y}" x2="${x - 28}" y2="${y + footingL}" stroke="#ff4fa3" stroke-width="3"/>
      <line x1="${x - 42}" y1="${y}" x2="${x - 14}" y2="${y}" stroke="#ff4fa3" stroke-width="3"/>
      <line x1="${x - 42}" y1="${y + footingL}" x2="${x - 14}" y2="${y + footingL}" stroke="#ff4fa3" stroke-width="3"/>
      <text x="${x - 32}" y="${y + footingL / 2}" transform="rotate(-90 ${x - 32} ${y + footingL / 2})" text-anchor="middle" font-family="Arial" font-size="12" fill="#ff4fa3">${(input.footingLengthMm / 1000).toFixed(2)}</text>
      <rect x="${x}" y="${y}" width="${footingW}" height="${footingL}" fill="#f8fafc" stroke="#0f172a" stroke-width="4"/>
      ${rebarX}
      ${rebarY}
      <rect x="${colX}" y="${colY}" width="${columnW}" height="${columnL}" fill="#ffffff" stroke="#0f172a" stroke-width="4"/>
      <text x="${x + footingW + 28}" y="${y + 48}" font-family="Arial" font-size="13" fill="#0f172a">${input.barCountX}T${input.barDiaMm} dir. X</text>
      <text x="${x + footingW + 28}" y="${y + 68}" font-family="Arial" font-size="13" fill="#0f172a">${input.barCountY}T${input.barDiaMm} dir. Y</text>
      <text x="${x + footingW / 2}" y="${y + footingL + 38}" text-anchor="middle" font-family="Arial" font-size="18" font-weight="700" fill="#0f172a">COLUMN FOOTING PLAN</text>
    `,
  );
}

function createFootingSectionSvg(input: FootingDetailParams) {
  const footingWidth = Math.max(input.footingWidthMm * 0.18, 220);
  const footingDepth = Math.max(input.footingDepthMm * 0.16, 56);
  const pedestalWidth = Math.max(input.columnWidthMm * 0.22, 70);
  const pedestalDepth = Math.max(input.columnDepthMm * 0.18, 70);
  const x = 88;
  const y = 176;
  const colX = x + footingWidth / 2 - pedestalWidth / 2;
  const colY = y - pedestalDepth;
  const barsTop = x + 26;
  const barsBottom = x + footingWidth - 26;

  return svgDoc(
    `0 0 ${footingWidth + 220} 360`,
    `
      <line x1="${x}" y1="${y + footingDepth + 28}" x2="${x + footingWidth}" y2="${y + footingDepth + 28}" stroke="#ff4fa3" stroke-width="3"/>
      <line x1="${x}" y1="${y + footingDepth + 14}" x2="${x}" y2="${y + footingDepth + 42}" stroke="#ff4fa3" stroke-width="3"/>
      <line x1="${x + footingWidth}" y1="${y + footingDepth + 14}" x2="${x + footingWidth}" y2="${y + footingDepth + 42}" stroke="#ff4fa3" stroke-width="3"/>
      <text x="${x + footingWidth / 2}" y="${y + footingDepth + 24}" text-anchor="middle" font-family="Arial" font-size="12" fill="#ff4fa3">${(input.footingWidthMm / 1000).toFixed(2)}</text>
      <line x1="${x + footingWidth + 36}" y1="${y}" x2="${x + footingWidth + 36}" y2="${y + footingDepth}" stroke="#ff4fa3" stroke-width="3"/>
      <line x1="${x + footingWidth + 22}" y1="${y}" x2="${x + footingWidth + 50}" y2="${y}" stroke="#ff4fa3" stroke-width="3"/>
      <line x1="${x + footingWidth + 22}" y1="${y + footingDepth}" x2="${x + footingWidth + 50}" y2="${y + footingDepth}" stroke="#ff4fa3" stroke-width="3"/>
      <text x="${x + footingWidth + 32}" y="${y + footingDepth / 2}" transform="rotate(-90 ${x + footingWidth + 32} ${y + footingDepth / 2})" text-anchor="middle" font-family="Arial" font-size="12" fill="#ff4fa3">${(input.footingDepthMm / 1000).toFixed(2)}</text>
      <rect x="${x}" y="${y}" width="${footingWidth}" height="${footingDepth}" fill="#e2e8f0" stroke="#0f172a" stroke-width="4"/>
      <rect x="${colX}" y="${colY}" width="${pedestalWidth}" height="${pedestalDepth}" fill="#ffffff" stroke="#0f172a" stroke-width="4"/>
      <line x1="${barsTop}" y1="${y + footingDepth - 18}" x2="${barsBottom}" y2="${y + footingDepth - 18}" stroke="#ef4444" stroke-width="4"/>
      <line x1="${barsTop}" y1="${y + footingDepth - 30}" x2="${barsBottom}" y2="${y + footingDepth - 30}" stroke="#f59e0b" stroke-width="4"/>
      <path d="M${colX} ${y} L${colX - 22} ${y + footingDepth} M${colX + pedestalWidth} ${y} L${colX + pedestalWidth + 22} ${y + footingDepth}" stroke="#0f172a" stroke-width="3"/>
      <text x="${x + footingWidth + 54}" y="${y - 38}" font-family="Arial" font-size="13" fill="#0f172a">${input.barCountX} / ${input.barCountY} T${input.barDiaMm}</text>
      <text x="${x + footingWidth + 54}" y="${y - 20}" font-family="Arial" font-size="13" fill="#0f172a">column ${input.columnWidthMm} x ${input.columnDepthMm}</text>
      <text x="${x + footingWidth / 2}" y="${y + footingDepth + 74}" text-anchor="middle" font-family="Arial" font-size="18" font-weight="700" fill="#0f172a">COLUMN FOOTING SECTION</text>
    `,
  );
}

export function createFootingDetailSvg(input: Partial<FootingDetailParams> = {}) {
  const normalized = normalizeFootingDetailParams(input);
  return normalized.view === "plan" ? createFootingPlanSvg(normalized) : createFootingSectionSvg(normalized);
}

export function createWallOpeningSvg(input: Partial<WallOpeningParams> = {}) {
  const { wallLengthMm, wallThicknessMm, openingType, openingWidthMm, openingOffsetMm } =
    normalizeWallOpeningParams("wall-opening", input);
  const wallW = wallLengthMm * 0.18;
  const wallH = Math.max(wallThicknessMm * 0.32, 42);
  const openingW = openingWidthMm * 0.18;
  const openingX = 46 + openingOffsetMm * 0.18;
  const hingeX = openingX;
  const latchX = openingX + openingW;
  const pad = 46;
  const doorSwing =
    openingType === "door"
      ? `<line x1="${hingeX}" y1="${pad + wallH}" x2="${hingeX}" y2="${pad + wallH + openingW}" stroke="#0f172a" stroke-width="4" stroke-linecap="round"/>
         <path d="M${hingeX} ${pad + wallH + openingW} A${openingW} ${openingW} 0 0 0 ${latchX} ${pad + wallH}" stroke="#2563eb" stroke-width="3"/>
         <line x1="${hingeX}" y1="${pad + wallH}" x2="${latchX}" y2="${pad + wallH}" stroke="#64748b" stroke-width="2" stroke-dasharray="8 7"/>`
      : "";
  const windowLine =
    openingType === "window"
      ? `<line x1="${openingX}" y1="${pad + wallH / 2}" x2="${openingX + openingW}" y2="${pad + wallH / 2}" stroke="#2563eb" stroke-width="5"/>
         <line x1="${openingX}" y1="${pad + wallH / 2 - 13}" x2="${openingX + openingW}" y2="${pad + wallH / 2 - 13}" stroke="#2563eb" stroke-width="2"/>
         <line x1="${openingX}" y1="${pad + wallH / 2 + 13}" x2="${openingX + openingW}" y2="${pad + wallH / 2 + 13}" stroke="#2563eb" stroke-width="2"/>`
      : "";

  return svgDoc(
    `0 0 ${wallW + pad * 2} ${wallH + pad * 2 + 104}`,
    `
      <rect x="${pad}" y="${pad}" width="${openingX - pad}" height="${wallH}" fill="#e2e8f0" stroke="#0f172a" stroke-width="3"/>
      <rect x="${openingX + openingW}" y="${pad}" width="${pad + wallW - openingX - openingW}" height="${wallH}" fill="#e2e8f0" stroke="#0f172a" stroke-width="3"/>
      <rect x="${openingX}" y="${pad}" width="${openingW}" height="${wallH}" fill="#ffffff" stroke="#94a3b8" stroke-width="2" stroke-dasharray="8 7"/>
      ${doorSwing}
      ${windowLine}
      <text x="${pad + wallW / 2}" y="${pad + wallH + 72}" text-anchor="middle" font-family="Arial" font-size="18" fill="#334155">${wallLengthMm} WALL / ${openingWidthMm} ${openingType.toUpperCase()}</text>
    `,
  );
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

export function createParametricBlockSvg(kind: ParametricBlockKind, params?: Partial<ParametricBlockParams>) {
  const normalized = normalizeParametricParams(kind, params);
  if (kind === "beam-detail") return createBeamDetailSvg(normalized as BeamDetailParams);
  if (kind === "column-detail") return createColumnDetailSvg(normalized as ColumnDetailParams);
  if (kind === "footing-detail") return createFootingDetailSvg(normalized as FootingDetailParams);
  return createWallOpeningSvg(normalized as WallOpeningParams);
}
