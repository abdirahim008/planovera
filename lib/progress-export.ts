/**
 * Progress export helpers — PDF (current view) and Excel (Summary + section sheets).
 *
 * Exports mirror the on-screen report exactly: Bill No · Description · Progress
 * bar · %. Internal bookkeeping columns (weight ratios, planned %, variance,
 * earned value) stay out of the deliverable — the weight ratios are still used
 * behind the scenes for the section/overall roll-ups so totals match the app.
 */
import type { Project, ProgressReport, ProgressSheet, ProgressItem } from "./supabase";
import {
  downloadWorkbook,
  escapeHtml,
  openPrintWindow,
  safeFilename,
} from "./exporters";

function toNumber(value: string | number | undefined | null): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  return parseFloat(String(value || "0").replace(/,/g, "")) || 0;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function fmtPercent(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) return "0.0%";
  return `${value.toFixed(decimals)}%`;
}

// Per-activity weight ratio (summing to 1 across the whole report), mirroring
// computeRatios in components/progress/ProgressModule.tsx. Custom weights come
// from the stored weightPercent; otherwise every activity gets an equal share.
function computeRatios(report: ProgressReport): Map<string, number> {
  const items = report.sheets.flatMap((sheet) => sheet.items);
  const count = items.length;
  const ratios = new Map<string, number>();
  if (count === 0) return ratios;
  if (report.weightMode === "custom") {
    const total = items.reduce((sum, item) => sum + Math.max(0, toNumber(item.weightPercent)), 0);
    if (total > 0) {
      items.forEach((item) => ratios.set(item.id, Math.max(0, toNumber(item.weightPercent)) / total));
      return ratios;
    }
  }
  items.forEach((item) => ratios.set(item.id, 1 / count));
  return ratios;
}

// Weighted completion for a set of activities, normalised by the ratios in play
// (a section reads as its own 0–100 %; the whole report rolls up to the overall).
function statsFor(items: ProgressItem[], ratios: Map<string, number>) {
  const weightSum = items.reduce((sum, item) => sum + (ratios.get(item.id) || 0), 0);
  const weightedAvg = (key: "actualPercent" | "plannedPercent") =>
    weightSum > 0
      ? items.reduce((sum, item) => sum + (ratios.get(item.id) || 0) * clampPercent(toNumber(item[key])), 0) /
        weightSum
      : 0;
  const actual = weightedAvg("actualPercent");
  const planned = weightedAvg("plannedPercent");
  return {
    actual,
    planned,
    completed: items.filter((item) => toNumber(item.actualPercent) >= 95).length,
    totalItems: items.length,
  };
}

function progressTone(actual: number, planned: number): string {
  if (actual >= 95) return "#16a34a";
  if (actual <= 1) return "#f59e0b";
  if (actual + 1e-6 < planned) return "#dc2626";
  return "#3b82f6";
}

interface HeaderOptions {
  report: ProgressReport;
  project: Project | null;
}

function renderHeader({ report, project }: HeaderOptions): string {
  const today = new Date().toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  return `
    <div class="export-header">
      <div>
        <div class="subtitle">Progress Report ${report.number ? `#${report.number}` : ""}</div>
        <div class="title">${escapeHtml(report.name)}</div>
        <div class="subtitle" style="margin-top:6px">Source · ${escapeHtml(report.sourceName)} · ${escapeHtml(report.status.toUpperCase())}</div>
      </div>
      <div class="meta">
        <div><strong>Project</strong> · ${escapeHtml(project?.name || "—")}</div>
        ${project?.contractNumber ? `<div>Contract · ${escapeHtml(project.contractNumber)}</div>` : ""}
        ${project?.location ? `<div>Location · ${escapeHtml(project.location)}</div>` : ""}
        <div>Report date · ${escapeHtml(report.date)}</div>
        <div>Generated · ${escapeHtml(today)}</div>
      </div>
    </div>
  `;
}

function renderFooter(report: ProgressReport): string {
  return `
    <div class="export-footer">
      <span>${escapeHtml(report.name)}</span>
      <span>Progress · Planovera</span>
    </div>
  `;
}

function renderOverallProgress(report: ProgressReport): string {
  const totals = statsFor(report.sheets.flatMap((sheet) => sheet.items), computeRatios(report));
  const actual = clampPercent(totals.actual);
  const color = progressTone(actual, totals.planned);
  return `
    <div style="border:0.6px solid #cbd5e1; border-radius:8px; padding:12px 14px; margin-bottom:14px; display:flex; align-items:center; gap:16px">
      <div>
        <div style="font-size:9px; text-transform:uppercase; letter-spacing:1.2px; color:#64748b">Overall Progress</div>
        <div style="margin-top:4px; font-size:20px; font-weight:700; color:#0f172a">${fmtPercent(actual)}</div>
      </div>
      <div style="flex:1">
        <div class="progress-bar"><span style="width:${actual}%; background:${color}"></span></div>
      </div>
      <div style="font-size:10px; color:#64748b">${totals.completed}/${totals.totalItems} activities complete</div>
    </div>
  `;
}

// Row number shown in the "#"/"Bill No." column. Non-BOQ reports (work plan,
// item lists) get a continuous 1..N sequence so manually-added rows are numbered
// too; BOQ reports keep their bill code, falling back to the running number when
// a manually-added row has no code.
function displayNo(item: ProgressItem, runningNo: number, sequential: boolean): string {
  return sequential ? String(runningNo) : item.billNo || String(runningNo);
}

function renderItemRow(item: ProgressItem, number: number, sequential: boolean): string {
  const planned = toNumber(item.plannedPercent);
  const actual = toNumber(item.actualPercent);
  const color = progressTone(actual, planned);
  const clamped = clampPercent(actual);
  // Mirrors the on-screen rows: the % label rides the tip of the fill, and the
  // track stops 44px short of the cell edge so a 100% bar never overlaps it.
  return `
    <tr>
      <td>${escapeHtml(displayNo(item, number, sequential))}</td>
      <td>${escapeHtml(item.description || "")}</td>
      <td style="min-width:280px">
        <div style="position:relative; height:12px">
          <div class="progress-bar" style="position:absolute; left:0; right:44px; top:50%; transform:translateY(-50%)">
            <span style="width:${clamped}%; background:${color}"></span>
          </div>
          <span style="position:absolute; top:50%; transform:translateY(-50%); left:calc((100% - 44px) * ${clamped / 100}); padding-left:5px; font-size:9px; font-weight:600; font-variant-numeric:tabular-nums; white-space:nowrap; color:${color}">${actual.toFixed(1)}%</span>
        </div>
      </td>
    </tr>
  `;
}

function renderSheetSection(
  sheet: ProgressSheet,
  ratios: Map<string, number>,
  startNumber: number,
  sequential: boolean,
): string {
  const metrics = statsFor(sheet.items, ratios);
  const itemsHtml = sheet.items.length
    ? sheet.items.map((item, idx) => renderItemRow(item, startNumber + idx + 1, sequential)).join("")
    : `<tr><td colspan="3" style="text-align:center; color:#64748b; padding:14px">No items recorded.</td></tr>`;

  // No page-break-inside:avoid on the wrapper — long sections flow across pages
  // (rows stay intact and the table header repeats via the base print CSS).
  // Only the heading is glued to the table start so a title never strands alone.
  return `
    <div style="margin-top:18px;">
      <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:6px; page-break-inside: avoid; page-break-after: avoid;">
        <h2 style="font-size:12px; text-transform:uppercase; letter-spacing:1.5px; color:#0f172a">${escapeHtml(sheet.name)}</h2>
        <span style="font-size:9px; color:#64748b; letter-spacing:0.8px; text-transform:uppercase">
          ${metrics.completed}/${metrics.totalItems} complete · ${fmtPercent(metrics.actual)}
        </span>
      </div>
      <table class="export-table">
        <thead>
          <tr>
            <th style="width:56px">Bill No.</th>
            <th>Description</th>
            <th style="width:280px">Progress</th>
          </tr>
        </thead>
        <tbody>${itemsHtml}</tbody>
      </table>
    </div>
  `;
}

export function exportProgressAsPdf(report: ProgressReport, project: Project | null): void {
  const ratios = computeRatios(report);
  const sequential = report.sourceType !== "boq";
  let runningNo = 0;
  const sections = report.sheets.length
    ? report.sheets
        .map((sheet) => {
          const html = renderSheetSection(sheet, ratios, runningNo, sequential);
          runningNo += sheet.items.length;
          return html;
        })
        .join("")
    : `<p style="color:#64748b">No progress sections defined yet.</p>`;
  const html = `
    <div class="export-shell">
      ${renderHeader({ report, project })}
      ${renderOverallProgress(report)}
      ${sections}
      ${renderFooter(report)}
    </div>
  `;
  openPrintWindow(html, {
    orientation: "landscape",
    paper: "A4",
    title: `${report.name} — Progress`,
  });
}

export async function exportProgressAsExcel(
  report: ProgressReport,
  project: Project | null,
): Promise<void> {
  const ratios = computeRatios(report);
  const totals = statsFor(report.sheets.flatMap((sheet) => sheet.items), ratios);
  const filename = `${safeFilename(report.name)}.xlsx`;

  await downloadWorkbook(filename, (XLSX) => {
    const wb = XLSX.utils.book_new();

    // ── Summary sheet ─────────────────────────────
    const summaryHeader = ["Section", "Items", "Complete", "Progress %"];
    const summaryRows: (string | number)[][] = report.sheets.map((sheet) => {
      const m = statsFor(sheet.items, ratios);
      return [sheet.name, m.totalItems, m.completed, Number(m.actual.toFixed(2))];
    });

    summaryRows.push([
      "TOTAL",
      totals.totalItems,
      totals.completed,
      Number(totals.actual.toFixed(2)),
    ]);

    const summaryAoa = [
      [`Progress — ${report.name}`],
      [`Project: ${project?.name || "—"}${project?.contractNumber ? `  ·  Contract ${project.contractNumber}` : ""}`],
      [`Report date: ${report.date}  ·  Status: ${report.status.toUpperCase()}  ·  Source: ${report.sourceName}`],
      [`Generated: ${new Date().toLocaleString()}`],
      [],
      summaryHeader,
      ...summaryRows,
    ];
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryAoa);
    wsSummary["!cols"] = [{ wch: 36 }, { wch: 8 }, { wch: 10 }, { wch: 12 }];
    wsSummary["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 3 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 3 } },
      { s: { r: 3, c: 0 }, e: { r: 3, c: 3 } },
    ];
    XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

    // ── One sheet per section, with formulas so totals stay live ─────────────────────────────
    const usedNames = new Set<string>(["Summary"]);
    const sanitizeSheetName = (raw: string, fallback: string): string => {
      let name = (raw || fallback).replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 31) || fallback;
      let attempt = name;
      let n = 2;
      while (usedNames.has(attempt)) {
        const suffix = ` (${n})`;
        attempt = name.slice(0, 31 - suffix.length) + suffix;
        n += 1;
      }
      usedNames.add(attempt);
      return attempt;
    };

    const sequential = report.sourceType !== "boq";
    let runningNo = 0;
    report.sheets.forEach((sheet) => {
      // Columns: A Bill No. · B Description · C Progress %
      const header = ["Bill No.", "Description", "Progress %"];

      const items = sheet.items;
      const rows: (string | number)[][] = items.map((item, idx) => [
        displayNo(item, runningNo + idx + 1, sequential),
        item.description || "",
        toNumber(item.actualPercent),
      ]);
      runningNo += items.length;

      const intro = [
        [`Section — ${sheet.name}`],
        [`Items: ${items.length}`],
        [`Report: ${report.name}  ·  Date: ${report.date}`],
        [`Project: ${project?.name || "—"}`],
        [],
      ];

      const dataAoa: (string | number)[][] = [...intro, header, ...rows];

      // Section roll-up as computed in the app (weight-aware), not a plain average
      const sectionActual = statsFor(items, ratios).actual;
      dataAoa.push(["SECTION PROGRESS", "", Number(sectionActual.toFixed(2))]);

      const ws = XLSX.utils.aoa_to_sheet(dataAoa);
      ws["!cols"] = [{ wch: 10 }, { wch: 56 }, { wch: 12 }];
      ws["!merges"] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 2 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: 2 } },
        { s: { r: 2, c: 0 }, e: { r: 2, c: 2 } },
        { s: { r: 3, c: 0 }, e: { r: 3, c: 2 } },
      ];
      XLSX.utils.book_append_sheet(wb, ws, sanitizeSheetName(sheet.name, "Section"));
    });

    return wb;
  });
}
