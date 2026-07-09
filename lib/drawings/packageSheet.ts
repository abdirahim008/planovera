// ------------------------------------------------------------------
// Drawing-package sheet rendering: one HTML generator shared by the
// on-screen preview and the print/PDF export, so what the engineer
// sees is exactly what prints. No canvas, no Fabric — a framed sheet
// with the library SVG, part overlays, and a title-block strip, in
// plain HTML/CSS.
// ------------------------------------------------------------------

import type { DrawingErasure, DrawingPackage, DrawingPackageItem } from "@/lib/supabase";
import { sanitizeSvgMarkup } from "./svgSanitize";

const esc = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export interface SvgViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Read the root <svg> tag's viewBox, falling back to width/height attrs. */
export function parseSvgViewBox(svg: string): SvgViewBox | null {
  const tag = svg.match(/<svg[^>]*>/i)?.[0];
  if (!tag) return null;
  const vb = tag.match(
    /viewBox\s*=\s*["']\s*([-\d.eE+]+)[\s,]+([-\d.eE+]+)[\s,]+([-\d.eE+]+)[\s,]+([-\d.eE+]+)\s*["']/i,
  );
  if (vb) {
    const parsed = { x: +vb[1], y: +vb[2], width: +vb[3], height: +vb[4] };
    if (parsed.width > 0 && parsed.height > 0) return parsed;
  }
  const w = tag.match(/\swidth\s*=\s*["']([\d.]+)(?:px)?["']/i);
  const h = tag.match(/\sheight\s*=\s*["']([\d.]+)(?:px)?["']/i);
  if (w && h && +w[1] > 0 && +h[1] > 0) return { x: 0, y: 0, width: +w[1], height: +h[1] };
  return null;
}

/**
 * Crop an SVG by rewriting its root viewBox to the given window (source
 * viewBox units) and dropping any fixed width/height so CSS sizing follows
 * the crop's aspect ratio. The geometry itself is untouched — everything
 * outside the window simply falls outside the canvas.
 */
export function cropSvgToRegion(svg: string, crop: SvgViewBox): string {
  return svg.replace(/<svg[^>]*>/i, (tag) => {
    const stripped = tag
      .replace(/\sviewBox\s*=\s*["'][^"']*["']/gi, "")
      .replace(/\swidth\s*=\s*["'][^"']*["']/gi, "")
      .replace(/\sheight\s*=\s*["'][^"']*["']/gi, "");
    return stripped.replace(
      /<svg/i,
      `<svg viewBox="${crop.x} ${crop.y} ${crop.width} ${crop.height}"`,
    );
  });
}

/**
 * "Erase" unwanted content (labels, dimensions, stray text) by appending
 * white rects inside the SVG, in its own coordinate units — they ride along
 * with the drawing through zoom/pan/crop and print identically. The source
 * geometry is untouched, so removing an erasure restores the content.
 */
export function injectErasures(svg: string, erasures?: DrawingErasure[]): string {
  if (!erasures || erasures.length === 0) return svg;
  const rects = erasures
    .map(
      (patch) =>
        `<rect x="${patch.x}" y="${patch.y}" width="${patch.width}" height="${patch.height}" fill="#ffffff" stroke="none"/>`,
    )
    .join("");
  return svg.replace(/<\/svg>\s*$/i, `${rects}</svg>`);
}

/**
 * Layout CSS shared by preview and print. The sheet is fully
 * percentage-based so the same markup renders at any size; the caller
 * decides the physical dimensions (preview: aspect-ratio box, print:
 * 297mm x 210mm A4 landscape page).
 */
export const PACKAGE_SHEET_CSS = `
.dp-sheet { position: relative; width: 100%; height: 100%; background: #ffffff; color: #0f172a; font-family: Arial, Helvetica, sans-serif; box-sizing: border-box; overflow: hidden; }
.dp-sheet * { box-sizing: border-box; }
.dp-frame { position: absolute; inset: 3.2% 2.4%; border: 2px solid #0f172a; display: flex; flex-direction: column; }
.dp-drawing { position: relative; flex: 1 1 auto; min-height: 0; padding: 1.5%; display: flex; align-items: center; justify-content: center; overflow: hidden; }
.dp-zoom { width: 100%; height: 100%; transform-origin: center center; }
.dp-zoom svg { width: 100%; height: 100%; }
.dp-overlay { position: absolute; }
.dp-overlay svg { display: block; width: 100%; height: auto; }
.dp-overlay-selected { outline: 2px dashed #3b82f6; outline-offset: 2px; }
.dp-overlay-missing { border: 1px dashed #94a3b8; color: #94a3b8; font-size: 0.7em; padding: 4% 6%; text-align: center; background: rgba(255,255,255,0.85); }
.dp-missing { font-size: 1.1em; color: #94a3b8; text-align: center; padding: 8%; }
.dp-tb { flex: 0 0 auto; border-top: 2px solid #0f172a; display: grid; grid-template-columns: repeat(6, 1fr); }
.dp-tb-cell { border-right: 1px solid #0f172a; border-top: 1px solid #0f172a; padding: 0.45em 0.6em 0.5em; min-width: 0; }
.dp-tb-cell:nth-child(-n+6) { border-top: none; }
.dp-tb-cell:nth-child(6n) { border-right: none; }
.dp-tb-label { display: block; font-size: 0.62em; font-weight: 700; letter-spacing: 0.08em; color: #64748b; text-transform: uppercase; }
.dp-tb-value { display: block; font-size: 0.92em; font-weight: 600; margin-top: 0.15em; min-height: 1.1em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dp-tb-cell.dp-wide { grid-column: span 2; }
`;

/**
 * One framed sheet: drawing area + part overlays + title block. SVGs are
 * looked up by library item id (base drawing and overlays alike). Values
 * render blank when unset.
 */
export function renderPackageSheetHtml(
  item: DrawingPackageItem,
  svgByLibraryId: Record<string, string | null | undefined>,
  sheetIndex: number,
  sheetCount: number,
  opts?: { selectedOverlayId?: string | null },
): string {
  const tb = item.titleBlock;
  const baseSvg = svgByLibraryId[item.libraryItemId] ?? null;
  // Per-sheet drawing size + offset: zoom >1 fills the frame by cropping the
  // SVG's own baked-in margins; pan (set by dragging the preview) picks which
  // part sits in the frame. Clamped so bad stored values can't blow up the
  // layout. translate is the outer transform, so a pan of 10% shifts the
  // drawing by 10% of the drawing area regardless of zoom.
  const zoom = Math.min(Math.max(item.zoom ?? 1, 0.5), 3);
  const panX = Math.min(Math.max(item.panX ?? 0, -80), 80);
  const panY = Math.min(Math.max(item.panY ?? 0, -80), 80);
  const drawing = baseSvg
    ? `<div class="dp-zoom" style="transform: translate(${panX.toFixed(1)}%, ${panY.toFixed(1)}%) scale(${zoom.toFixed(2)})">${injectErasures(sanitizeSvgMarkup(baseSvg), item.erasures)}</div>`
    : `<div class="dp-missing">Drawing unavailable — it may have been removed from the library.</div>`;

  // Part overlays: cropped library details stamped on top of the drawing.
  // Their SVGs carry a tight viewBox, so width alone sizes them (height
  // follows the part's own aspect ratio).
  const overlays = (item.overlays ?? [])
    .map((overlay) => {
      const x = Math.min(Math.max(overlay.x, -20), 95).toFixed(1);
      const y = Math.min(Math.max(overlay.y, -20), 95).toFixed(1);
      const width = Math.min(Math.max(overlay.width, 3), 100).toFixed(1);
      const svg = svgByLibraryId[overlay.libraryItemId];
      const selected = opts?.selectedOverlayId === overlay.id ? " dp-overlay-selected" : "";
      const body = svg
        ? injectErasures(
            overlay.crop
              ? cropSvgToRegion(sanitizeSvgMarkup(svg), overlay.crop)
              : sanitizeSvgMarkup(svg),
            overlay.erasures,
          )
        : `<div class="dp-overlay-missing">${esc(overlay.name || "Part")}</div>`;
      return `<div class="dp-overlay${selected}" data-overlay-id="${esc(overlay.id)}" style="left:${x}%;top:${y}%;width:${width}%">${body}</div>`;
    })
    .join("");

  const cell = (label: string, value: string, wide = false) =>
    `<div class="dp-tb-cell${wide ? " dp-wide" : ""}"><span class="dp-tb-label">${esc(label)}</span><span class="dp-tb-value">${esc(value) || "&nbsp;"}</span></div>`;

  return `<div class="dp-sheet"><div class="dp-frame">
<div class="dp-drawing">${drawing}${overlays}</div>
<div class="dp-tb">
${cell("Project", tb.projectTitle, true)}
${cell("Client", tb.client, true)}
${cell("Consultant", tb.consultant, true)}
${cell("Drawing title", tb.drawingTitle, true)}
${cell("Drawing no", tb.drawingNo)}
${cell("Scale", tb.scale)}
${cell("Date", tb.date)}
${cell("Drawn by", tb.drawnBy)}
${cell("Checked by", tb.checkedBy)}
${cell("Approved by", tb.approvedBy)}
${cell("Revision", tb.revision)}
${cell("Status", tb.status)}
${cell("Sheet", `${sheetIndex + 1} of ${sheetCount}`)}
</div>
</div></div>`;
}

/** Every library id a sheet needs rendered: the base drawing + its parts. */
export function packageSheetLibraryIds(item: DrawingPackageItem): string[] {
  return [item.libraryItemId, ...(item.overlays ?? []).map((overlay) => overlay.libraryItemId)];
}

/** Full standalone print document: one A4-landscape page per drawing. */
export function buildPackagePrintHtml(
  pkg: DrawingPackage,
  svgByLibraryId: Record<string, string | null | undefined>,
): string {
  const sheets = pkg.items
    .map(
      (item, index) =>
        `<div class="dp-page">${renderPackageSheetHtml(item, svgByLibraryId, index, pkg.items.length)}</div>`,
    )
    .join("\n");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${esc(pkg.name)}</title>
<style>
@page { size: A4 landscape; margin: 0; }
html, body { margin: 0; padding: 0; }
.dp-page { width: 297mm; height: 210mm; page-break-after: always; font-size: 11px; }
.dp-page:last-child { page-break-after: auto; }
${PACKAGE_SHEET_CSS}
</style>
</head>
<body>
${sheets}
</body>
</html>`;
}
