// ------------------------------------------------------------------
// Fabric.js helpers for the editor: SVG ingest, title block, PDF out.
// ------------------------------------------------------------------

import type * as FabricNS from "fabric";
// jsPDF (~150 KB) is loaded on demand inside exportPagesToPDF so it doesn't
// ship in the drawing-studio route's first-load bundle.
import type { PaperSizeKey, Orientation } from "./paper";
import { TITLE_BLOCK_KEY, TB_FIELD_KEY, buildTitleBlock } from "./titleBlocks";

type FabricMod = typeof FabricNS;
type FabricCanvas = FabricNS.Canvas;
type FabricObject = FabricNS.FabricObject;

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
  opts?: { maxFitRatio?: number; ungroup?: boolean }
): Promise<FabricObject> {
  const group = await createSvgObject(fabric, svgString);

  // Add first so getBoundingRect() reflects the real rendered extent.
  canvas.add(group);
  group.setCoords();

  const maxRatio = opts?.maxFitRatio ?? 0.8;
  const cw = canvas.getWidth()  / (canvas.getZoom() || 1);
  const ch = canvas.getHeight() / (canvas.getZoom() || 1);

  // Fit + centre on the ACTUAL drawing bounds, not the SVG's declared
  // width/height. Real imported drawings often have a padded viewBox or an
  // offset origin, so the declared box doesn't match where the geometry sits —
  // centring on it would push the visible drawing off the sheet (blank canvas).
  // getBoundingRect() gives the true scene-space extent, so the fit and centre
  // always frame the geometry the user actually sees.
  let rect = group.getBoundingRect();
  const fit = Math.min((cw * maxRatio) / rect.width, (ch * maxRatio) / rect.height, 1);
  if (fit < 1) {
    group.scale((group.scaleX ?? 1) * fit);
    group.setCoords();
    rect = group.getBoundingRect();
  }

  // Shift so the geometry's bounding box is centred on the paper. Translating
  // left/top moves the bounding rect by the same delta regardless of the
  // group's origin, so this lands the real content dead-centre.
  group.set({
    left: (group.left ?? 0) + ((cw - rect.width) / 2 - rect.left),
    top:  (group.top  ?? 0) + ((ch - rect.height) / 2 - rect.top),
  });
  group.setCoords();

  if (opts?.ungroup) {
    const objects = ungroupSvgObjects(fabric, canvas, group);
    canvas.requestRenderAll();
    return objects[0] ?? group;
  }

  canvas.setActiveObject(group);
  canvas.requestRenderAll();
  return group;
}

// Dissolve a freshly-imported, already-positioned group into individual
// top-level objects, so a rubber-band drag selects exactly the portion the user
// dragged over (instead of grabbing the whole drawing), each label is directly
// clickable/editable, and any subset can be moved or re-grouped on its own. Each
// child's world transform is baked in first so nothing shifts. In Fabric v6 a
// grouped child's calcTransformMatrix() already includes the group's transform,
// so it's the full canvas-space matrix as-is.
export function ungroupSvgObjects(
  fabric: FabricMod,
  canvas: FabricCanvas,
  group: FabricObject,
): FabricObject[] {
  const container = group as unknown as {
    getObjects?: () => FabricObject[];
    removeAll?: () => FabricObject[];
  };
  const children = typeof container.getObjects === "function" ? [...container.getObjects()] : [];
  if (children.length === 0) {
    canvas.setActiveObject(group);
    return [group];
  }

  const placements = children.map((child) => ({
    child,
    decomp: fabric.util.qrDecompose(child.calcTransformMatrix()),
  }));

  canvas.remove(group);
  container.removeAll?.(); // detach children from the group

  for (const { child, decomp } of placements) {
    child.set({
      originX: "center",
      originY: "center",
      left: decomp.translateX,
      top: decomp.translateY,
      scaleX: decomp.scaleX,
      scaleY: decomp.scaleY,
      angle: decomp.angle,
      skewX: decomp.skewX,
      // Hit-test on actual line pixels, not the (often huge) bounding box of a
      // thin/diagonal stroke. Without this, a mousedown in the white space
      // between lines lands on some object's bbox and drags it, so a rubber-band
      // marquee can never start. Per-object (not canvas-wide) so a re-grouped
      // drawing stays easy to click anywhere.
      perPixelTargetFind: true,
    } as Partial<FabricObject>);
    child.setCoords();
    canvas.add(child);
  }
  // A few px of slack so clicking *near* a thin line still selects it.
  (canvas as unknown as { targetFindTolerance?: number }).targetFindTolerance = 5;
  canvas.discardActiveObject(); // start with nothing selected, ready to marquee
  return children;
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
  // Optional fields used by the richer bordered templates. Older saved pages
  // simply omit them and fall back to the minimal block.
  template?: "minimal" | "block" | "strip";
  logoDataUrl?: string;
  designedBy?: string;
  approvedBy?: string;
  jobNo?: string;
  status?: string;
  consultant?: string;
  projectDescription?: string;
  notes?: string;
}

// Build the selected title-block template (and page border, for the bordered
// templates) onto the canvas. Delegates to lib/drawings/titleBlocks.ts.
export async function createOrUpdateTitleBlock(
  fabric: FabricMod,
  canvas: FabricCanvas,
  data: TitleBlockData,
  paperWidth: number,
  paperHeight: number,
): Promise<void> {
  await buildTitleBlock(fabric, canvas, data, paperWidth, paperHeight);
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

  const { jsPDF } = await import("jspdf");

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

  // Honour an explicitly supplied label (including empty); only fall back to the
  // raw pixel length when no text was passed. Dimension values are typed by the
  // user, so the caller normally provides a real value here.
  const textVal = opts?.text !== undefined ? opts.text : length.toFixed(1);
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

// -----------------------------------------------------------------
// Leader / callout: an arrow from a label position pointing at an anchor,
// with an editable text label. `anchor` is where the arrowhead points (the
// feature being called out); `labelPos` is where the text sits.
// -----------------------------------------------------------------
export function createLeaderGroup(
  fabric: FabricMod,
  anchor: { x: number; y: number },
  labelPos: { x: number; y: number },
  text: string,
  opts?: { color?: string; strokeWidth?: number; fontSize?: number; isPreview?: boolean },
): FabricNS.Group {
  const color = opts?.color || "#0f172a";
  const strokeWidth = opts?.strokeWidth || 1;
  const fontSize = opts?.fontSize || 14;

  const dx = anchor.x - labelPos.x;
  const dy = anchor.y - labelPos.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;

  const head = 11; // arrowhead length
  const halfW = 4; // arrowhead half-width
  const baseX = anchor.x - ux * head;
  const baseY = anchor.y - uy * head;

  const line = new fabric.Line([labelPos.x, labelPos.y, baseX, baseY], {
    stroke: color,
    strokeWidth,
    selectable: false,
    evented: false,
    strokeLineCap: "round",
  });

  const arrow = new fabric.Polygon(
    [
      { x: anchor.x, y: anchor.y },
      { x: baseX + nx * halfW, y: baseY + ny * halfW },
      { x: baseX - nx * halfW, y: baseY - ny * halfW },
    ],
    { fill: color, stroke: color, strokeWidth: 0, selectable: false, evented: false },
  );

  // Text grows away from the arrow so it never overlaps the leader line.
  const rightward = ux >= 0;
  const textObj = new fabric.IText(text || "Label", {
    left: labelPos.x + (rightward ? -4 : 4),
    top: labelPos.y,
    fontSize,
    fontFamily: "Arial",
    fill: color,
    originX: rightward ? "right" : "left",
    originY: "center",
    editable: true,
  });

  const group = new fabric.Group([line, arrow, textObj], {
    selectable: !opts?.isPreview,
    evented: !opts?.isPreview,
    hasControls: !opts?.isPreview,
    hoverCursor: opts?.isPreview ? "crosshair" : "move",
  });
  group.set({ _isLeader: true } as any);

  return group;
}

// Just the leader arrow (line + arrowhead) as a group — no text. Paired with a
// standalone editable IText so the label can be typed inline on the canvas.
// Returns the arrow group plus where/how to place the label text.
export function createLeaderArrow(
  fabric: FabricMod,
  anchor: { x: number; y: number },
  labelPos: { x: number; y: number },
  opts?: { color?: string; strokeWidth?: number; fontSize?: number },
): { arrow: FabricNS.Group; label: { left: number; top: number; originX: "left" | "right"; fontSize: number; color: string } } {
  const color = opts?.color || "#0f172a";
  const strokeWidth = opts?.strokeWidth || 1;
  const fontSize = opts?.fontSize || 14;

  const dx = anchor.x - labelPos.x;
  const dy = anchor.y - labelPos.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;
  const head = 11;
  const halfW = 4;
  const baseX = anchor.x - ux * head;
  const baseY = anchor.y - uy * head;

  const line = new fabric.Line([labelPos.x, labelPos.y, baseX, baseY], {
    stroke: color,
    strokeWidth,
    selectable: false,
    evented: false,
    strokeLineCap: "round",
  });
  const arrow = new fabric.Polygon(
    [
      { x: anchor.x, y: anchor.y },
      { x: baseX + nx * halfW, y: baseY + ny * halfW },
      { x: baseX - nx * halfW, y: baseY - ny * halfW },
    ],
    { fill: color, stroke: color, strokeWidth: 0, selectable: false, evented: false },
  );
  const group = new fabric.Group([line, arrow], {
    hasControls: false,
    hoverCursor: "move",
  });
  group.set({ _isLeaderArrow: true } as any);

  const rightward = ux >= 0;
  return {
    arrow: group,
    label: { left: labelPos.x + (rightward ? -4 : 4), top: labelPos.y, originX: rightward ? "right" : "left", fontSize, color },
  };
}
