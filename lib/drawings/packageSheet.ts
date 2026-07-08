// ------------------------------------------------------------------
// Drawing-package sheet rendering: one HTML generator shared by the
// on-screen preview and the print/PDF export, so what the engineer
// sees is exactly what prints. No canvas, no Fabric — a framed sheet
// with the library SVG and a title-block strip, in plain HTML/CSS.
// ------------------------------------------------------------------

import type { DrawingPackage, DrawingPackageItem } from "@/lib/supabase";
import { sanitizeSvgMarkup } from "./svgSanitize";

const esc = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

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
.dp-drawing { flex: 1 1 auto; min-height: 0; padding: 1.5%; display: flex; align-items: center; justify-content: center; overflow: hidden; }
.dp-zoom { width: 100%; height: 100%; transform-origin: center center; }
.dp-zoom svg { width: 100%; height: 100%; }
.dp-missing { font-size: 1.1em; color: #94a3b8; text-align: center; padding: 8%; }
.dp-tb { flex: 0 0 auto; border-top: 2px solid #0f172a; display: grid; grid-template-columns: repeat(6, 1fr); }
.dp-tb-cell { border-right: 1px solid #0f172a; border-top: 1px solid #0f172a; padding: 0.45em 0.6em 0.5em; min-width: 0; }
.dp-tb-cell:nth-child(-n+6) { border-top: none; }
.dp-tb-cell:nth-child(6n) { border-right: none; }
.dp-tb-label { display: block; font-size: 0.62em; font-weight: 700; letter-spacing: 0.08em; color: #64748b; text-transform: uppercase; }
.dp-tb-value { display: block; font-size: 0.92em; font-weight: 600; margin-top: 0.15em; min-height: 1.1em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dp-tb-cell.dp-wide { grid-column: span 2; }
`;

/** One framed sheet: drawing area + title block. Values render blank when unset. */
export function renderPackageSheetHtml(
  item: DrawingPackageItem,
  svg: string | null,
  sheetIndex: number,
  sheetCount: number,
): string {
  const tb = item.titleBlock;
  // Per-sheet drawing size: >1 fills the frame by cropping the SVG's own
  // baked-in margins, <1 shrinks. Clamped so a bad stored value can't blow up
  // the layout.
  const zoom = Math.min(Math.max(item.zoom ?? 1, 0.5), 3);
  const drawing = svg
    ? `<div class="dp-zoom" style="transform: scale(${zoom.toFixed(2)})">${sanitizeSvgMarkup(svg)}</div>`
    : `<div class="dp-missing">Drawing unavailable — it may have been removed from the library.</div>`;
  const cell = (label: string, value: string, wide = false) =>
    `<div class="dp-tb-cell${wide ? " dp-wide" : ""}"><span class="dp-tb-label">${esc(label)}</span><span class="dp-tb-value">${esc(value) || "&nbsp;"}</span></div>`;

  return `<div class="dp-sheet"><div class="dp-frame">
<div class="dp-drawing">${drawing}</div>
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

/** Full standalone print document: one A4-landscape page per drawing. */
export function buildPackagePrintHtml(
  pkg: DrawingPackage,
  svgByItemId: Record<string, string | null>,
): string {
  const sheets = pkg.items
    .map(
      (item, index) =>
        `<div class="dp-page">${renderPackageSheetHtml(item, svgByItemId[item.id] ?? null, index, pkg.items.length)}</div>`,
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
