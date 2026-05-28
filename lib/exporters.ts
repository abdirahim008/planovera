/**
 * Shared helpers for the "Export" workflow used by Work Plan and Progress modules.
 *
 * Two output paths:
 *  - PDF: opened in a styled print window using the browser's native print → save-as-PDF dialog.
 *  - Excel: built with SheetJS (xlsx, dynamically imported to keep it out of the initial bundle)
 *    and downloaded via a generated blob URL.
 *
 * The Gantt PNG path was intentionally dropped — landscape PDF works perfectly for
 * PowerPoint, and OS-level screenshots cover the rest.
 */

export function escapeHtml(value: unknown): string {
  if (value === undefined || value === null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function escapeHtmlMultiline(value: unknown): string {
  return escapeHtml(value).replace(/\n/g, "<br />");
}

export type PrintOrientation = "portrait" | "landscape";
export type PrintPaper = "A4" | "A3";

export interface PrintWindowOptions {
  orientation?: PrintOrientation;
  paper?: PrintPaper;
  title?: string;
  /** Extra CSS appended after the base print stylesheet. */
  extraCss?: string;
}

/**
 * Renders a self-contained HTML document into a new browser window and triggers print.
 * The caller supplies the <body> content; this helper handles <head>, fonts and @page rules.
 */
export function openPrintWindow(bodyHtml: string, options: PrintWindowOptions = {}): void {
  if (typeof window === "undefined") return;
  const { orientation = "portrait", paper = "A4", title = "Export", extraCss = "" } = options;
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    // Most browsers block popups in non-user-gesture contexts. If that happens,
    // fall back to a same-tab data URL so the user still gets the print dialog.
    const doc = `<!doctype html><html><head><title>${escapeHtml(title)}</title>${baseStyleTag(orientation, paper, extraCss)}</head><body>${bodyHtml}</body></html>`;
    window.location.href = `data:text/html;charset=utf-8,${encodeURIComponent(doc)}`;
    return;
  }
  printWindow.document.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    ${baseStyleTag(orientation, paper, extraCss)}
  </head>
  <body>
    ${bodyHtml}
    <script>
      window.onload = function () {
        setTimeout(function () { window.focus(); window.print(); }, 80);
      };
    </script>
  </body>
</html>`);
  printWindow.document.close();
}

function baseStyleTag(orientation: PrintOrientation, paper: PrintPaper, extraCss: string): string {
  const css = `
    @page { size: ${paper} ${orientation}; margin: 12mm 12mm 14mm; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #0f172a;
      font-family: 'Inter', 'Segoe UI', 'Helvetica Neue', system-ui, -apple-system, sans-serif;
      font-size: 11px;
      line-height: 1.45;
    }
    h1, h2, h3 { color: #0f172a; margin: 0; font-weight: 600; }
    .export-shell { padding: 0; }
    .export-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      padding-bottom: 10px;
      border-bottom: 1.5px solid #0f172a;
      margin-bottom: 12px;
    }
    .export-header .title { font-size: 18px; font-weight: 700; letter-spacing: 0.2px; }
    .export-header .subtitle { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 1.4px; margin-top: 4px; }
    .export-header .meta { font-size: 10px; color: #475569; text-align: right; line-height: 1.55; }
    .export-header .meta strong { color: #0f172a; }
    .export-footer {
      margin-top: 14px;
      padding-top: 8px;
      border-top: 0.6px solid #cbd5e1;
      display: flex;
      justify-content: space-between;
      font-size: 9px;
      color: #64748b;
      letter-spacing: 0.8px;
    }
    table.export-table { width: 100%; border-collapse: collapse; font-size: 10px; }
    table.export-table th {
      background: #0f172a;
      color: #ffffff;
      text-align: left;
      padding: 6px 8px;
      font-weight: 600;
      font-size: 9px;
      letter-spacing: 0.6px;
      text-transform: uppercase;
      border: 0.4px solid #0f172a;
    }
    table.export-table td {
      padding: 5px 8px;
      border: 0.4px solid #cbd5e1;
      vertical-align: top;
    }
    table.export-table tbody tr.section-row td {
      background: #e2e8f0;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      font-size: 9px;
      color: #0f172a;
    }
    table.export-table tbody tr.total-row td {
      background: #f1f5f9;
      font-weight: 700;
    }
    table.export-table td.num, table.export-table th.num { text-align: right; font-variant-numeric: tabular-nums; }
    .legend { display: flex; gap: 14px; font-size: 9px; color: #475569; margin-bottom: 10px; }
    .legend .swatch { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 4px; vertical-align: middle; }
    .progress-bar { position: relative; height: 6px; background: #e2e8f0; border-radius: 3px; overflow: hidden; }
    .progress-bar > span { display: block; height: 100%; }
    .pill { display: inline-block; padding: 1px 6px; border-radius: 999px; font-size: 8px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
    .pill.ok { background: #dcfce7; color: #166534; }
    .pill.active { background: #dbeafe; color: #1e3a8a; }
    .pill.warn { background: #fef3c7; color: #92400e; }
    .pill.err { background: #fee2e2; color: #991b1b; }
    .pill.neutral { background: #e2e8f0; color: #334155; }
    @media print {
      .page-break { page-break-before: always; }
      table.export-table thead { display: table-header-group; }
      table.export-table tr { page-break-inside: avoid; }
    }
    ${extraCss}
  `;
  return `<style>${css}</style>`;
}

/**
 * Triggers a browser download for an arbitrary blob.
 */
export function downloadBlob(filename: string, blob: Blob): void {
  if (typeof window === "undefined") return;
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => window.URL.revokeObjectURL(url), 4000);
}

/**
 * Builds and downloads an .xlsx file. The `build` callback receives the lazy-loaded
 * xlsx namespace so callers don't need to import xlsx at the module top level.
 */
export async function downloadWorkbook(
  filename: string,
  build: (xlsx: typeof import("xlsx")) => import("xlsx").WorkBook,
): Promise<void> {
  const XLSX = await import("xlsx");
  const wb = build(XLSX);
  const wbout: ArrayBuffer = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  const blob = new Blob([wbout], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  downloadBlob(filename, blob);
}

/**
 * Sanitize a string to be safe as a filename across platforms.
 */
export function safeFilename(value: string, fallback = "export"): string {
  const cleaned = (value || "")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || fallback;
}

/**
 * Format a number for human display in PDF cells (thousands separator, max 2 decimals).
 */
export function formatNumber(value: number | string | undefined | null, decimals = 2): string {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? "").replace(/,/g, ""));
  if (!Number.isFinite(n)) return "";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

/**
 * Compute calendar days between two ISO date strings (inclusive of the start day).
 * Returns null if either date is missing or invalid.
 */
export function inclusiveDaysBetween(start?: string | null, end?: string | null): number | null {
  if (!start || !end) return null;
  const a = new Date(`${start}T00:00:00`);
  const b = new Date(`${end}T00:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  const diff = Math.round((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000));
  return diff < 0 ? null : diff + 1;
}
