// ------------------------------------------------------------------
// Title block templates for the drawing studio.
//
// Each template is a builder that draws a removable, tagged title block onto
// the Fabric canvas. Two of them also draw a full page border, matching the
// consultant-style sheets engineers import as PDFs. A template can carry a
// user-supplied logo image (uploaded or re-used from saved logos).
// ------------------------------------------------------------------

import type * as FabricNS from "fabric";
import type { TitleBlockData } from "./fabricHelpers";

type FabricMod = typeof FabricNS;
type FabricCanvas = FabricNS.Canvas;
type FabricObject = FabricNS.FabricObject;

// Stamped on every title-block / border object so we can find + replace them.
export const TITLE_BLOCK_KEY = "__isTitleBlock";
export const TB_FIELD_KEY = "__tbField";

export type TitleBlockTemplateId = "minimal" | "block" | "strip";

export const TITLE_BLOCK_TEMPLATES: Array<{
  id: TitleBlockTemplateId;
  label: string;
  description: string;
  thumbnail: string;
}> = [
  {
    id: "minimal",
    label: "Minimal",
    description: "Compact bottom-right block. No page border.",
    thumbnail:
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 84"><rect width="120" height="84" fill="#fff"/>` +
      `<rect x="70" y="58" width="46" height="22" fill="#fff" stroke="#0f172a" stroke-width="1.4"/>` +
      `<line x1="70" y1="65" x2="116" y2="65" stroke="#94a3b8"/><line x1="70" y1="72" x2="116" y2="72" stroke="#94a3b8"/>` +
      `<line x1="93" y1="58" x2="93" y2="80" stroke="#94a3b8"/></svg>`,
  },
  {
    id: "block",
    label: "Bordered block",
    description: "Page border + bottom-right block with logo and full details.",
    thumbnail:
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 84"><rect width="120" height="84" fill="#fff"/>` +
      `<rect x="4" y="4" width="112" height="76" fill="none" stroke="#0f172a" stroke-width="1.2"/>` +
      `<rect x="6" y="6" width="108" height="72" fill="none" stroke="#0f172a" stroke-width="0.6"/>` +
      `<rect x="62" y="52" width="50" height="24" fill="#fff" stroke="#0f172a" stroke-width="1.2"/>` +
      `<rect x="64" y="54" width="14" height="9" fill="#e2e8f0"/>` +
      `<line x1="62" y1="66" x2="112" y2="66" stroke="#94a3b8"/><line x1="62" y1="71" x2="112" y2="71" stroke="#94a3b8"/>` +
      `<line x1="88" y1="66" x2="88" y2="76" stroke="#94a3b8"/></svg>`,
  },
  {
    id: "strip",
    label: "Consultant strip",
    description: "Page border + vertical right-edge strip with logo, client, revisions and notes.",
    thumbnail:
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 84"><rect width="120" height="84" fill="#fff"/>` +
      `<rect x="4" y="4" width="112" height="76" fill="none" stroke="#0f172a" stroke-width="1.2"/>` +
      `<rect x="6" y="6" width="108" height="72" fill="none" stroke="#0f172a" stroke-width="0.6"/>` +
      `<rect x="92" y="6" width="22" height="72" fill="#fff" stroke="#0f172a" stroke-width="1.2"/>` +
      `<rect x="95" y="10" width="16" height="10" fill="#e2e8f0"/>` +
      `<line x1="92" y1="34" x2="114" y2="34" stroke="#94a3b8"/><line x1="92" y1="50" x2="114" y2="50" stroke="#94a3b8"/>` +
      `<line x1="92" y1="64" x2="114" y2="64" stroke="#94a3b8"/></svg>`,
  },
];

const STROKE = "#000000";

function removeExisting(canvas: FabricCanvas): void {
  canvas
    .getObjects()
    .filter((o) => (o as unknown as Record<string, unknown>)[TITLE_BLOCK_KEY] === true)
    .forEach((o) => canvas.remove(o));
}

function tag(obj: FabricObject, opts: { lock?: boolean } = {}): FabricObject {
  (obj as unknown as Record<string, unknown>)[TITLE_BLOCK_KEY] = true;
  if (opts.lock) {
    obj.set({ selectable: false, evented: false } as Partial<FabricObject>);
  }
  return obj;
}

function makeText(
  fabric: FabricMod,
  text: string,
  left: number,
  top: number,
  size: number,
  opts: { bold?: boolean; color?: string; field?: keyof TitleBlockData; width?: number } = {},
): FabricObject {
  return new fabric.Textbox(text, {
    left,
    top,
    width: opts.width ?? 200,
    fontSize: size,
    fontFamily: "Arial",
    fontWeight: opts.bold ? "bold" : "normal",
    fill: opts.color ?? "#111111",
    editable: !!opts.field,
    splitByGrapheme: false,
    [TB_FIELD_KEY]: opts.field,
  } as unknown as Partial<FabricObject>);
}

// A double page border, inset from the sheet edge.
function addPageBorder(fabric: FabricMod, canvas: FabricCanvas, w: number, h: number): void {
  const m = Math.max(14, Math.min(w, h) * 0.02);
  const gap = 4;
  const outer = new fabric.Rect({ left: m, top: m, width: w - 2 * m, height: h - 2 * m, fill: "transparent", stroke: STROKE, strokeWidth: 1.4 });
  const inner = new fabric.Rect({ left: m + gap, top: m + gap, width: w - 2 * (m + gap), height: h - 2 * (m + gap), fill: "transparent", stroke: STROKE, strokeWidth: 0.6 });
  canvas.add(tag(outer, { lock: true }));
  canvas.add(tag(inner, { lock: true }));
}

async function addLogo(
  fabric: FabricMod,
  canvas: FabricCanvas,
  dataUrl: string | undefined,
  box: { left: number; top: number; w: number; h: number },
): Promise<void> {
  const frame = new fabric.Rect({ left: box.left, top: box.top, width: box.w, height: box.h, fill: "#ffffff", stroke: STROKE, strokeWidth: 0.6 });
  canvas.add(tag(frame, { lock: true }));
  if (!dataUrl) return;
  try {
    const img = await fabric.Image.fromURL(dataUrl, { crossOrigin: "anonymous" } as never);
    const iw = img.width || box.w;
    const ih = img.height || box.h;
    const scale = Math.min((box.w - 6) / iw, (box.h - 6) / ih);
    img.set({
      left: box.left + (box.w - iw * scale) / 2,
      top: box.top + (box.h - ih * scale) / 2,
      scaleX: scale,
      scaleY: scale,
    } as Partial<FabricObject>);
    canvas.add(tag(img, { lock: true }));
  } catch {
    /* a broken logo just leaves the empty frame */
  }
}

const v = (s: string | undefined, fallback = "—") => (s && s.trim() ? s : fallback);

// ---- Minimal: the original compact bottom-right block (no border) ----------
function buildMinimal(fabric: FabricMod, canvas: FabricCanvas, d: TitleBlockData, w: number, h: number): void {
  const TB_W = Math.min(Math.max(w * 0.3, 260), 520);
  const TB_H = 130;
  const PAD = 24;
  const x = w - TB_W - PAD;
  const y = h - TB_H - PAD;
  const objs: FabricObject[] = [new fabric.Rect({ left: 0, top: 0, width: TB_W, height: TB_H, fill: "#ffffff", stroke: STROKE, strokeWidth: 1.5 })];
  const rows = [24, 50, 78, 104];
  const colMid = TB_W * 0.55;
  const colR = TB_W * 0.78;
  rows.forEach((r) => objs.push(new fabric.Line([0, r, TB_W, r], { stroke: STROKE, strokeWidth: 0.8 })));
  objs.push(new fabric.Line([colMid, rows[1], colMid, TB_H], { stroke: STROKE, strokeWidth: 0.8 }));
  objs.push(new fabric.Line([colR, rows[1], colR, TB_H], { stroke: STROKE, strokeWidth: 0.8 }));
  const t = (text: string, lx: number, ly: number, size: number, o: Parameters<typeof makeText>[5] = {}) =>
    objs.push(makeText(fabric, text, lx, ly, size, { width: TB_W - lx - 4, ...o }));
  t("PROJECT", 4, 3, 7, { bold: true, color: "#666" });
  t(v(d.projectTitle), 4, 11, 11, { bold: true, field: "projectTitle" });
  t("DRAWING TITLE", 4, rows[0] + 3, 7, { bold: true, color: "#666" });
  t(v(d.drawingTitle), 4, rows[0] + 11, 10, { bold: true, field: "drawingTitle" });
  t("CLIENT", 4, rows[1] + 3, 7, { bold: true, color: "#666" });
  t(v(d.client), 4, rows[1] + 11, 9, { field: "client" });
  t("DRAWING No.", 4, rows[2] + 3, 7, { bold: true, color: "#666" });
  t("SCALE", colMid + 4, rows[2] + 3, 7, { bold: true, color: "#666" });
  t("DATE", colR + 4, rows[2] + 3, 7, { bold: true, color: "#666" });
  t(v(d.drawingNo), 4, rows[2] + 11, 9, { field: "drawingNo" });
  t(v(d.scale), colMid + 4, rows[2] + 11, 9, { field: "scale" });
  t(v(d.date), colR + 4, rows[2] + 11, 9, { field: "date" });
  t("DRAWN BY", 4, rows[3] + 3, 7, { bold: true, color: "#666" });
  t("CHECKED", colMid + 4, rows[3] + 3, 7, { bold: true, color: "#666" });
  t("SHEET / REV", colR + 4, rows[3] + 3, 7, { bold: true, color: "#666" });
  t(v(d.drawnBy), 4, rows[3] + 11, 9, { field: "drawnBy" });
  t(v(d.checkedBy), colMid + 4, rows[3] + 11, 9, { field: "checkedBy" });
  t(v(d.sheet, "1 of 1"), colR + 4, rows[3] + 11, 9, { bold: true, field: "sheet" });
  const group = new fabric.Group(objs, { left: x, top: y, subTargetCheck: false, lockRotation: true });
  canvas.add(tag(group));
  canvas.bringObjectToFront(group);
}

// ---- Bordered block: page border + richer bottom-right block + logo --------
async function buildBlock(fabric: FabricMod, canvas: FabricCanvas, d: TitleBlockData, w: number, h: number): Promise<void> {
  addPageBorder(fabric, canvas, w, h);
  const m = Math.max(14, Math.min(w, h) * 0.02) + 4;
  const TB_W = Math.min(Math.max(w * 0.34, 320), 460);
  const TB_H = 176;
  const x = w - m - TB_W;
  const y = h - m - TB_H;

  const frame = new fabric.Rect({ left: x, top: y, width: TB_W, height: TB_H, fill: "#ffffff", stroke: STROKE, strokeWidth: 1.4 });
  canvas.add(tag(frame, { lock: true }));

  // Logo box (top-left of the block)
  const logoW = 96;
  const headerH = 52;
  await addLogo(fabric, canvas, d.logoDataUrl, { left: x, top: y, w: logoW, h: headerH });

  const rows = [headerH, headerH + 26, headerH + 26 + 22, headerH + 26 + 44, headerH + 26 + 66, headerH + 26 + 88];
  const lines: FabricObject[] = [];
  const col2 = TB_W * 0.5;
  // horizontal separators
  [headerH, rows[1], rows[2], rows[3], rows[4], rows[5]].forEach((r) =>
    lines.push(new fabric.Line([0, r, TB_W, r], { stroke: STROKE, strokeWidth: 0.6 })),
  );
  lines.push(new fabric.Line([logoW, 0, logoW, headerH], { stroke: STROKE, strokeWidth: 0.6 }));
  [rows[2], rows[3], rows[4], rows[5]].forEach((r) =>
    lines.push(new fabric.Line([col2, r, col2, r + 22], { stroke: STROKE, strokeWidth: 0.6 })),
  );

  const texts: FabricObject[] = [];
  const t = (text: string, lx: number, ly: number, size: number, o: Parameters<typeof makeText>[5] = {}) =>
    texts.push(makeText(fabric, text, lx, ly, size, { width: o.width ?? col2 - lx - 4, ...o }));
  // header
  t("CONSULTANT", logoW + 6, 4, 7, { bold: true, color: "#666", width: TB_W - logoW - 10 });
  t(v(d.consultant, "Consultant"), logoW + 6, 13, 9, { bold: true, field: "consultant", width: TB_W - logoW - 10 });
  t(v(d.client, ""), logoW + 6, 32, 8, { field: "client", width: TB_W - logoW - 10 });
  // project
  t("PROJECT", 4, headerH + 3, 7, { bold: true, color: "#666", width: TB_W - 8 });
  t(v(d.projectDescription || d.projectTitle), 4, headerH + 12, 8, { bold: true, field: "projectDescription", width: TB_W - 8 });
  // drawing title
  t("DRAWING TITLE", 4, rows[1] + 3, 7, { bold: true, color: "#666", width: TB_W - 8 });
  t(v(d.drawingTitle), 4, rows[1] + 11, 9, { bold: true, field: "drawingTitle", width: TB_W - 8 });
  // grid rows: label/value pairs in two columns
  const cell = (label: string, value: string, field: keyof TitleBlockData | undefined, rowTop: number, right: boolean) => {
    const lx = right ? col2 + 4 : 4;
    t(label, lx, rowTop + 2, 6.5, { bold: true, color: "#666", width: col2 - 8 });
    t(value, lx, rowTop + 9, 8.5, { field, width: col2 - 8 });
  };
  cell("DRAWING No.", v(d.drawingNo), "drawingNo", rows[2], false);
  cell("REV", v(d.revision), "revision", rows[2], true);
  cell("SCALE", v(d.scale), "scale", rows[3], false);
  cell("DATE", v(d.date), "date", rows[3], true);
  cell("DESIGNED", v(d.designedBy), "designedBy", rows[4], false);
  cell("DRAWN", v(d.drawnBy), "drawnBy", rows[4], true);
  cell("CHECKED", v(d.checkedBy), "checkedBy", rows[5], false);
  cell("APPROVED", v(d.approvedBy), "approvedBy", rows[5], true);

  const group = new fabric.Group([...lines, ...texts], { left: x, top: y, subTargetCheck: false, lockRotation: true });
  canvas.add(tag(group));
  canvas.bringObjectToFront(group);
}

// ---- Consultant strip: page border + vertical right-edge strip + logo ------
// Laid out as a fully ruled title block: a generously-spaced identity grid is
// pinned to the bottom (each datum in its own bordered cell) and the upper
// sections (notes / revisions / client / consultant) share the remaining
// height. Every section and grid row is divided by a horizontal rule so the
// block reads cleanly instead of crowding the text into one corner.
async function buildStrip(fabric: FabricMod, canvas: FabricCanvas, d: TitleBlockData, w: number, h: number): Promise<void> {
  addPageBorder(fabric, canvas, w, h);
  const m = Math.max(14, Math.min(w, h) * 0.02) + 4;
  const SW = 182;
  const x = w - m - SW;
  const top = m;
  const SH = h - 2 * m;
  const PAD = 6;
  const col = SW * 0.5;

  const frame = new fabric.Rect({ left: x, top, width: SW, height: SH, fill: "#ffffff", stroke: STROKE, strokeWidth: 1.4 });
  canvas.add(tag(frame, { lock: true }));

  // --- Vertical geometry --------------------------------------------------
  // Identity grid (5 label/value rows) pinned to the bottom, with a title cell
  // above it. Heights are derived so rows always fill the block exactly.
  const ID_ROWS = 5;
  const idTop = Math.max(SH * 0.42, SH - 168);
  const titleH = Math.max(30, Math.min(46, SH - idTop - ID_ROWS * 24));
  const gridTop = idTop + titleH;
  const rowH = (SH - gridTop) / ID_ROWS;

  // Upper sections share everything above the identity block.
  const upper = idTop;
  const consH = Math.max(40, upper * 0.16);
  const clientH = Math.max(86, upper * 0.34);
  const revH = Math.max(50, upper * 0.2);
  const notesH = Math.max(44, upper - consH - clientH - revH);
  const yRev = notesH;
  const yClient = notesH + revH;
  const yCons = notesH + revH + clientH;

  // --- Rules (separators) -------------------------------------------------
  const lines: FabricObject[] = [];
  const hr = (yy: number) => lines.push(new fabric.Line([0, yy, SW, yy], { stroke: STROKE, strokeWidth: 0.6 }));
  [yRev, yClient, yCons, idTop, gridTop].forEach(hr);
  for (let i = 1; i < ID_ROWS; i += 1) hr(gridTop + i * rowH);
  // Vertical divider down the two-column identity grid.
  lines.push(new fabric.Line([col, gridTop, col, SH], { stroke: STROKE, strokeWidth: 0.6 }));

  const texts: FabricObject[] = [];
  const t = (text: string, lx: number, ly: number, size: number, o: Parameters<typeof makeText>[5] = {}) =>
    texts.push(makeText(fabric, text, lx, ly, size, { width: o.width ?? SW - lx - PAD, ...o }));

  // --- Notes --------------------------------------------------------------
  t("NOTES", PAD, 6, 7.5, { bold: true, color: "#555" });
  t(
    "All dimensions are in millimetres unless noted otherwise. Refer to the general notes and the standard details manual.",
    PAD,
    19,
    8,
    { color: "#333" },
  );
  // --- Revisions ----------------------------------------------------------
  t("REVISIONS", PAD, yRev + 6, 7.5, { bold: true, color: "#555" });
  t("REV     BY     CHK     DATE", PAD, yRev + 18, 7.5, { color: "#444" });
  // --- Client (with logo) -------------------------------------------------
  t("CLIENT", PAD, yClient + 6, 7.5, { bold: true, color: "#555" });
  // The logo is added in absolute canvas coords (outside the group) so it scales correctly.
  await addLogo(fabric, canvas, d.logoDataUrl, { left: x + PAD, top: top + yClient + 18, w: 58, h: 34 });
  t(v(d.client, "Client"), 70, yClient + 20, 9.5, { bold: true, field: "client", width: SW - 70 - PAD });
  t(v(d.projectDescription || d.projectTitle), PAD, yClient + 58, 8, { field: "projectDescription", width: SW - 2 * PAD });
  // --- Consultant ---------------------------------------------------------
  t("CONSULTANT", PAD, yCons + 6, 7.5, { bold: true, color: "#555" });
  t(v(d.consultant, "Consulting Engineers"), PAD, yCons + 18, 9.5, { bold: true, field: "consultant", width: SW - 2 * PAD });
  // --- Identity: drawing title cell --------------------------------------
  t("DRAWING TITLE", PAD, idTop + 6, 7.5, { bold: true, color: "#555" });
  t(v(d.drawingTitle), PAD, idTop + 18, 10, { bold: true, field: "drawingTitle", width: SW - 2 * PAD });
  // --- Identity: ruled label/value grid ----------------------------------
  const cell = (label: string, value: string, field: keyof TitleBlockData | undefined, rowIdx: number, right: boolean) => {
    const lx = right ? col + PAD : PAD;
    const cw = col - PAD - 3;
    const ry = gridTop + rowIdx * rowH;
    t(label, lx, ry + 4, 6.8, { bold: true, color: "#666", width: cw });
    t(value, lx, ry + 13, 9, { field, width: cw });
  };
  cell("DRAWING No.", v(d.drawingNo), "drawingNo", 0, false);
  cell("REV", v(d.revision), "revision", 0, true);
  cell("SCALE", v(d.scale), "scale", 1, false);
  cell("DATE", v(d.date), "date", 1, true);
  cell("DESIGNED", v(d.designedBy), "designedBy", 2, false);
  cell("DRAWN", v(d.drawnBy), "drawnBy", 2, true);
  cell("CHECKED", v(d.checkedBy), "checkedBy", 3, false);
  cell("APPROVED", v(d.approvedBy), "approvedBy", 3, true);
  cell("JOB No.", v(d.jobNo), "jobNo", 4, false);
  cell("STATUS", v(d.status), "status", 4, true);

  const group = new fabric.Group([...lines, ...texts], { left: x, top, subTargetCheck: false, lockRotation: true });
  canvas.add(tag(group));
  canvas.bringObjectToFront(group);
}

export async function buildTitleBlock(
  fabric: FabricMod,
  canvas: FabricCanvas,
  data: TitleBlockData,
  paperWidth: number,
  paperHeight: number,
): Promise<void> {
  removeExisting(canvas);
  const template = (data.template ?? "minimal") as TitleBlockTemplateId;
  if (template === "block") await buildBlock(fabric, canvas, data, paperWidth, paperHeight);
  else if (template === "strip") await buildStrip(fabric, canvas, data, paperWidth, paperHeight);
  else buildMinimal(fabric, canvas, data, paperWidth, paperHeight);
  canvas.requestRenderAll();
}
