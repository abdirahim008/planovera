// ------------------------------------------------------------------
// Fabric.js helpers for the editor: SVG ingest, title block, PDF out.
// ------------------------------------------------------------------

import type * as FabricNS from "fabric";
import { jsPDF } from "jspdf";
import type { PaperSizeKey, Orientation } from "./paper";

type FabricMod = typeof FabricNS;
type FabricCanvas = FabricNS.Canvas;
type FabricObject = FabricNS.FabricObject;

// -----------------------------------------------------------------
// Custom flag we stamp on the title-block group so we can find/replace it.
// -----------------------------------------------------------------
const TITLE_BLOCK_KEY = "__isTitleBlock";
const TB_FIELD_KEY    = "__tbField";

export async function createSvgObject(
  fabric: FabricMod,
  svgString: string,
): Promise<FabricObject> {
  if (!svgString.trim()) throw new Error("Empty SVG input");

  const result = await fabric.loadSVGFromString(svgString);
  const objects = (result.objects ?? []).filter(Boolean) as FabricObject[];
  if (objects.length === 0) throw new Error("No drawable elements found in SVG");

  // Convert static Text to editable IText
  const processed = objects.map((obj) => {
    if (obj.type === "text" || obj.type === "text-node") {
      const t = obj as any;
      return new fabric.IText(t.text || "", {
        left: t.left,
        top: t.top,
        fontSize: t.fontSize,
        fontFamily: t.fontFamily,
        fontWeight: t.fontWeight,
        fontStyle: t.fontStyle,
        fill: t.fill,
        stroke: t.stroke,
        strokeWidth: t.strokeWidth,
        textAlign: t.textAlign,
        originX: t.originX,
        originY: t.originY,
        angle: t.angle,
        scaleX: t.scaleX,
        scaleY: t.scaleY,
        flipX: t.flipX,
        flipY: t.flipY,
        opacity: t.opacity,
        shadow: t.shadow,
        visible: t.visible,
      });
    }
    return obj;
  });

  return fabric.util.groupSVGElements(processed, result.options);
}

// -----------------------------------------------------------------
// Add an SVG string as a single selectable/scalable group on the canvas.
// Throws if parsing fails.
// -----------------------------------------------------------------
export async function addSvgToCanvas(
  fabric: FabricMod,
  canvas: FabricCanvas,
  svgString: string,
  opts?: { maxFitRatio?: number }
): Promise<FabricObject> {
  const group = await createSvgObject(fabric, svgString);

  // Scale the imported drawing so it never exceeds ~80 % of the canvas
  // (only shrinks if it's larger than the paper — never enlarges small icons).
  const maxRatio = opts?.maxFitRatio ?? 0.8;
  const cw = canvas.getWidth()  / (canvas.getZoom() || 1);
  const ch = canvas.getHeight() / (canvas.getZoom() || 1);
  const gw = (group.width  ?? 1) * (group.scaleX ?? 1);
  const gh = (group.height ?? 1) * (group.scaleY ?? 1);
  const fit = Math.min((cw * maxRatio) / gw, (ch * maxRatio) / gh, 1);
  if (fit < 1) {
    group.scale(fit * (group.scaleX ?? 1));
  }

  // Centre it
  group.set({
    left: (cw - (group.width  ?? 0) * (group.scaleX ?? 1)) / 2,
    top:  (ch - (group.height ?? 0) * (group.scaleY ?? 1)) / 2,
  });

  canvas.add(group);
  canvas.setActiveObject(group);
  canvas.requestRenderAll();
  return group;
}

// -----------------------------------------------------------------
// Title-block data model.
// -----------------------------------------------------------------
export interface TitleBlockData {
  projectTitle: string;
  client: string;
  drawingTitle: string;
  drawingNo: string;
  revision: string;
  scale: string;
  date: string;
  drawnBy: string;
  checkedBy: string;
  sheet: string;
}

// Remove any existing title block.
function removeExistingTitleBlock(canvas: FabricCanvas): void {
  const existing = canvas
    .getObjects()
    .filter((o) => (o as any)[TITLE_BLOCK_KEY] === true);
  existing.forEach((o) => canvas.remove(o));
}

// -----------------------------------------------------------------
// Build an AutoCAD-style title block in the bottom-right corner.
// `paperWidth` / `paperHeight` are in canvas pixels.
// -----------------------------------------------------------------
export function createOrUpdateTitleBlock(
  fabric: FabricMod,
  canvas: FabricCanvas,
  data: TitleBlockData,
  paperWidth: number,
  paperHeight: number
): void {
  removeExistingTitleBlock(canvas);

  // Tune these to taste — they're in canvas pixels (1 px ≈ 0.2645 mm at 96 DPI).
  const TB_W = Math.min(Math.max(paperWidth * 0.30, 260), 520);
  const TB_H = 130;
  const PADDING = 24;

  const x = paperWidth  - TB_W - PADDING;
  const y = paperHeight - TB_H - PADDING;

  const stroke = "#000000";
  const thin = 0.8;
  const thick = 1.5;

  // Outer rectangle
  const rect = new fabric.Rect({
    left: 0, top: 0, width: TB_W, height: TB_H,
    fill: "#ffffff", stroke, strokeWidth: thick,
  });

  // Row separators (y positions in local coords)
  const row1 = 24;      // between project / drawing
  const row2 = 50;      // between drawing / details
  const row3 = 78;      // details header row
  const row4 = 104;     // second details row
  const colMid = TB_W * 0.55;
  const colR   = TB_W * 0.78;

  const lines: FabricObject[] = [
    new fabric.Line([0, row1, TB_W, row1],      { stroke, strokeWidth: thin }),
    new fabric.Line([0, row2, TB_W, row2],      { stroke, strokeWidth: thin }),
    new fabric.Line([0, row3, TB_W, row3],      { stroke, strokeWidth: thin }),
    new fabric.Line([0, row4, TB_W, row4],      { stroke, strokeWidth: thin }),
    new fabric.Line([colMid, row2, colMid, TB_H], { stroke, strokeWidth: thin }),
    new fabric.Line([colR,   row2, colR,   TB_H], { stroke, strokeWidth: thin }),
  ];

  const mkText = (
    text: string,
    lx: number, ly: number,
    size: number, bold = false,
    color = "#111",
    fieldName?: keyof TitleBlockData
  ) =>
    new fabric.Textbox(text, {
      left: lx, top: ly,
      width: TB_W - lx - 4,
      fontSize: size,
      fontFamily: "Arial",
      fontWeight: bold ? "bold" : "normal",
      fill: color,
      editable: !!fieldName,
      splitByGrapheme: false,
      [TB_FIELD_KEY]: fieldName,
    } as any);

  const texts: FabricObject[] = [
    // Row 0 — project
    mkText("PROJECT",       4, 3, 7, true, "#666"),
    mkText(data.projectTitle || "—", 4, 11, 11, true, "#111", "projectTitle"),

    // Row 1 — drawing title
    mkText("DRAWING TITLE", 4, row1 + 3, 7, true, "#666"),
    mkText(data.drawingTitle || "—", 4, row1 + 11, 10, true, "#111", "drawingTitle"),

    // Row 2 — client
    mkText("CLIENT",        4, row2 + 3, 7, true, "#666"),
    mkText(data.client || "—", 4, row2 + 11, 9, false, "#111", "client"),

    // Row 3 — labels
    mkText("DRAWING No.",   4, row3 + 3, 7, true, "#666"),
    mkText("SCALE",         colMid + 4, row3 + 3, 7, true, "#666"),
    mkText("DATE",          colR   + 4, row3 + 3, 7, true, "#666"),
    mkText(data.drawingNo || "—", 4, row3 + 11, 9, false, "#111", "drawingNo"),
    mkText(data.scale     || "—", colMid + 4, row3 + 11, 9, false, "#111", "scale"),
    mkText(data.date      || "—", colR   + 4, row3 + 11, 9, false, "#111", "date"),

    // Row 4 — drawn / checked / sheet + rev
    mkText("DRAWN BY",      4, row4 + 3, 7, true, "#666"),
    mkText("CHECKED",       colMid + 4, row4 + 3, 7, true, "#666"),
    mkText("SHEET / REV",   colR   + 4, row4 + 3, 7, true, "#666"),
    mkText(data.drawnBy   || "—", 4, row4 + 11, 9, false, "#111", "drawnBy"),
    mkText(data.checkedBy || "—", colMid + 4, row4 + 11, 9, false, "#111", "checkedBy"),
    mkText(
      data.sheet || "1 of 1",
      colR + 4, row4 + 11, 9, true, "#111", "sheet"
    ),
  ];

  const group = new fabric.Group([rect, ...lines, ...texts], {
    left: x, top: y,
    selectable: true,
    subTargetCheck: false,
    lockRotation: true,
  });

  // Tag it so we can find/replace later.
  (group as any)[TITLE_BLOCK_KEY] = true;
  group.set({ [TITLE_BLOCK_KEY]: true } as any);

  canvas.add(group);
  // Put it on top so it's always visible
  canvas.bringObjectToFront(group);
  canvas.requestRenderAll();
}

export interface Page {
  id: string;
  name: string;
  json?: any; // Fabric JSON
  paperSize: PaperSizeKey;
  orientation: Orientation;
  titleBlockData: TitleBlockData;
}

// -----------------------------------------------------------------
// Export multiple pages to a single PDF.
// -----------------------------------------------------------------
export async function exportPagesToPDF(
  fabric: FabricMod,
  pages: Page[],
  getPaperDimensions: (size: PaperSizeKey, orientation: Orientation) => any,
  filename: string = "drawing.pdf"
): Promise<void> {
  if (pages.length === 0) return;

  // Create document with first page settings
  const pdf = new jsPDF({
    orientation: pages[0].orientation,
    unit: "mm",
    format: pages[0].paperSize,
    compress: true,
  });

  // We'll use a hidden canvas to render each page
  const tempCanvasEl = document.createElement("canvas");
  const tempCanvas = new fabric.Canvas(tempCanvasEl, {
    enableRetinaScaling: false,
  });

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const { mmWidth, mmHeight, width, height } = getPaperDimensions(
      page.paperSize,
      page.orientation
    );

    if (i > 0) {
      pdf.addPage(page.paperSize, page.orientation);
    }

    // Prepare temp canvas for this page size
    tempCanvas.setDimensions({ width, height });
    tempCanvas.clear();

    if (page.json) {
      await tempCanvas.loadFromJSON(page.json);
    }

    // Capturing result
    const dataUrl = tempCanvas.toDataURL({
      format: "png",
      multiplier: 3, // High quality for print (~288 DPI)
      enableRetinaScaling: false,
    });

    pdf.addImage(dataUrl, "PNG", 0, 0, mmWidth, mmHeight, undefined, "FAST");
  }

  pdf.save(filename);
  tempCanvas.dispose();
}

export { TITLE_BLOCK_KEY, TB_FIELD_KEY };

// -----------------------------------------------------------------
// Generate a CAD-style dimension group with extension lines,
// a main dimension line, architectural ticks, and editable text.
// All geometry is computed from exact vectors to guarantee
// perfectly straight, orthogonal lines at any angle.
// -----------------------------------------------------------------
export function createDimensionGroup(
  fabric: FabricMod,
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  offsetDist: number,
  opts?: { text?: string; color?: string; strokeWidth?: number; isPreview?: boolean }
): FabricNS.Group | null {
  let dx = p2.x - p1.x;
  let dy = p2.y - p1.y;
  const length = Math.hypot(dx, dy);

  if (length < 1) return null;

  // --- Snap near-axis lines to be perfectly orthogonal ---
  const snapThreshold = 8; // px
  if (Math.abs(dy) < snapThreshold) {
    // Near-horizontal → force perfectly horizontal
    dy = 0;
  } else if (Math.abs(dx) < snapThreshold) {
    // Near-vertical → force perfectly vertical
    dx = 0;
  }

  const snappedLength = Math.hypot(dx, dy) || length;

  const color = opts?.color || "#d32f2f";
  const strokeWidth = opts?.strokeWidth || 0.8;

  // Unit vector along the dimension direction
  const ux = dx / snappedLength;
  const uy = dy / snappedLength;

  // Normal vector (perpendicular — always exact)
  const nx = -uy;
  const ny = ux;

  // Offset points — the dimension line endpoints
  const p1_off = { x: p1.x + nx * offsetDist, y: p1.y + ny * offsetDist };
  const p2_off = { x: p2.x + nx * offsetDist, y: p2.y + ny * offsetDist };

  const dir = Math.sign(offsetDist) || 1;
  const gapPx = 3 * dir;         // Small gap between object and extension line start
  const overshootPx = 3 * dir;   // Extension line past the dimension line

  const commonOpt = {
    stroke: color,
    strokeWidth,
    selectable: false,
    evented: false,
    strokeLineCap: "round" as const,
  };

  // Extension lines (perpendicular to measurement)
  const ext1 = new fabric.Line(
    [
      p1.x + nx * gapPx, p1.y + ny * gapPx,
      p1_off.x + nx * overshootPx, p1_off.y + ny * overshootPx,
    ],
    commonOpt,
  );
  const ext2 = new fabric.Line(
    [
      p2.x + nx * gapPx, p2.y + ny * gapPx,
      p2_off.x + nx * overshootPx, p2_off.y + ny * overshootPx,
    ],
    commonOpt,
  );

  // Main dimension line (parallel to measurement)
  const mainLine = new fabric.Line(
    [p1_off.x, p1_off.y, p2_off.x, p2_off.y],
    commonOpt,
  );

  // Architectural ticks — rotated properly to the line angle
  const tickSize = 4;
  // Tick direction: 45° relative to the dimension direction
  const t45x = (ux + nx) * tickSize;
  const t45y = (uy + ny) * tickSize;

  const tick1 = new fabric.Line(
    [p1_off.x - t45x, p1_off.y - t45y, p1_off.x + t45x, p1_off.y + t45y],
    { ...commonOpt, strokeWidth: strokeWidth + 0.4 },
  );
  const tick2 = new fabric.Line(
    [p2_off.x - t45x, p2_off.y - t45y, p2_off.x + t45x, p2_off.y + t45y],
    { ...commonOpt, strokeWidth: strokeWidth + 0.4 },
  );

  // Text angle — keep readable (never upside-down)
  let textAngle = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (textAngle > 90 || textAngle < -90) textAngle += 180;

  const textVal = opts?.text || length.toFixed(1);
  const textGap = dir * 7;

  const textObj = new fabric.IText(textVal, {
    left: (p1_off.x + p2_off.x) / 2 + nx * textGap,
    top: (p1_off.y + p2_off.y) / 2 + ny * textGap,
    fontSize: 10,
    fontFamily: "Arial",
    fill: color,
    originX: "center",
    originY: "center",
    angle: textAngle,
    editable: true,
  });

  const groupOpts = {
    selectable: !opts?.isPreview,
    evented: !opts?.isPreview,
    hasControls: false,
    hoverCursor: opts?.isPreview ? "crosshair" : "default",
  };

  const group = new fabric.Group([ext1, ext2, mainLine, tick1, tick2, textObj], groupOpts);
  group.set({ _isDimension: true } as any);

  return group;
}
