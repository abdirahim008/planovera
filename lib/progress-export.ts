/**
 * Progress export helpers — PDF (current view) and Excel (Summary + section sheets).
 *
 * The Progress module is percent-only: activities carry a weight ratio (summing
 * to 1 across the whole report, equal 1/N unless the user sets custom weights)
 * and a manual Actual %. Exports mirror that — no quantity columns — and use the
 * same ratio-based roll-up as the on-screen view so the totals match.
 */
import type { Project, ProgressReport, ProgressSheet, ProgressItem } from "./supabase";
import {
  downloadWorkbook,
  escapeHtml,
  formatNumber,
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
  const earned = items.reduce((sum, item) => sum + toNumber(item.earnedAmount), 0);
  return {
    actual,
    planned,
    variance: actual - planned,
    earned,
    weight: weightSum,
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

function renderSummaryCards(report: ProgressReport, currencyCode: string): string {
  const totals = statsFor(report.sheets.flatMap((sheet) => sheet.items), computeRatios(report));
  const variance = totals.variance;
  const varianceColor = variance >= 0 ? "#16a34a" : "#dc2626";
  const items = [
    { label: "Planned", value: fmtPercent(totals.planned), color: "#f59e0b" },
    { label: "Actual", value: fmtPercent(totals.actual), color: "#3b82f6" },
    { label: "Variance", value: `${variance >= 0 ? "+" : ""}${variance.toFixed(1)}%`, color: varianceColor },
    { label: "Earned Value", value: `${currencyCode} ${formatNumber(totals.earned, 2)}`, color: "#16a34a" },
  ];
  return `
    <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:8px; margin-bottom:14px">
      ${items
        .map(
          (item) => `
            <div style="border:0.6px solid #cbd5e1; border-radius:8px; padding:10px 12px;">
              <div style="font-size:9px; text-transform:uppercase; letter-spacing:1.2px; color:#64748b">${escapeHtml(item.label)}</div>
              <div style="margin-top:4px; font-size:16px; font-weight:700; color:${item.color}">${escapeHtml(item.value)}</div>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderItemRow(item: ProgressItem, currencyCode: string, idx: number, ratio: number): string {
  const planned = toNumber(item.plannedPercent);
  const actual = toNumber(item.actualPercent);
  const earned = toNumber(item.earnedAmount);
  const variance = actual - planned;
  const color = progressTone(actual, planned);
  return `
    <tr>
      <td>${escapeHtml(item.billNo || String(idx))}</td>
      <td>${escapeHtml(item.description || "")}</td>
      <td class="num">${ratio.toFixed(3)}</td>
      <td class="num">${planned.toFixed(1)}%</td>
      <td class="num" style="color:${color}">${actual.toFixed(1)}%</td>
      <td class="num" style="color:${variance >= 0 ? "#16a34a" : "#dc2626"}">${variance >= 0 ? "+" : ""}${variance.toFixed(1)}%</td>
      <td class="num">${escapeHtml(currencyCode)} ${escapeHtml(formatNumber(earned, 2))}</td>
      <td style="min-width:120px">
        <div class="progress-bar"><span style="width:${clampPercent(actual)}%; background:${color}"></span></div>
      </td>
    </tr>
  `;
}

function renderSheetSection(sheet: ProgressSheet, currencyCode: string, ratios: Map<string, number>): string {
  const metrics = statsFor(sheet.items, ratios);
  const itemsHtml = sheet.items.length
    ? sheet.items.map((item, idx) => renderItemRow(item, currencyCode, idx + 1, ratios.get(item.id) || 0)).join("")
    : `<tr><td colspan="8" style="text-align:center; color:#64748b; padding:14px">No items recorded.</td></tr>`;

  return `
    <div style="margin-top:18px; page-break-inside: avoid;">
      <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:6px">
        <h2 style="font-size:12px; text-transform:uppercase; letter-spacing:1.5px; color:#0f172a">${escapeHtml(sheet.name)}</h2>
        <span style="font-size:9px; color:#64748b; letter-spacing:0.8px; text-transform:uppercase">
          ${metrics.totalItems} items · Planned ${fmtPercent(metrics.planned)} · Actual ${fmtPercent(metrics.actual)} · Earned ${escapeHtml(currencyCode)} ${escapeHtml(formatNumber(metrics.earned, 2))}
        </span>
      </div>
      <table class="export-table">
        <thead>
          <tr>
            <th style="width:56px">Bill No.</th>
            <th>Description</th>
            <th class="num" style="width:64px">Weight</th>
            <th class="num" style="width:64px">Planned</th>
            <th class="num" style="width:64px">Actual</th>
            <th class="num" style="width:60px">Δ</th>
            <th class="num" style="width:104px">Earned</th>
            <th style="width:120px">Progress</th>
          </tr>
        </thead>
        <tbody>${itemsHtml}</tbody>
      </table>
    </div>
  `;
}

export function exportProgressAsPdf(report: ProgressReport, project: Project | null): void {
  const currencyCode = project?.currency || "USD";
  const ratios = computeRatios(report);
  const sections = report.sheets.length
    ? report.sheets.map((sheet) => renderSheetSection(sheet, currencyCode, ratios)).join("")
    : `<p style="color:#64748b">No progress sections defined yet.</p>`;
  const html = `
    <div class="export-shell">
      ${renderHeader({ report, project })}
      ${renderSummaryCards(report, currencyCode)}
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
  const currencyCode = project?.currency || "USD";
  const ratios = computeRatios(report);
  const totals = statsFor(report.sheets.flatMap((sheet) => sheet.items), ratios);
  const filename = `${safeFilename(report.name)}.xlsx`;

  await downloadWorkbook(filename, (XLSX) => {
    const wb = XLSX.utils.book_new();

    // ── Summary sheet ─────────────────────────────
    const summaryHeader = [
      "Section",
      "Items",
      "Weight",
      "Planned %",
      "Actual %",
      "Variance %",
      `Earned (${currencyCode})`,
    ];
    const summaryRows: (string | number)[][] = report.sheets.map((sheet) => {
      const m = statsFor(sheet.items, ratios);
      return [
        sheet.name,
        m.totalItems,
        Number(m.weight.toFixed(4)),
        Number(m.planned.toFixed(2)),
        Number(m.actual.toFixed(2)),
        Number(m.variance.toFixed(2)),
        Number(m.earned.toFixed(2)),
      ];
    });

    summaryRows.push([
      "TOTAL",
      totals.totalItems,
      Number(totals.weight.toFixed(4)),
      Number(totals.planned.toFixed(2)),
      Number(totals.actual.toFixed(2)),
      Number(totals.variance.toFixed(2)),
      Number(totals.earned.toFixed(2)),
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
    wsSummary["!cols"] = [
      { wch: 28 }, { wch: 8 }, { wch: 10 }, { wch: 11 }, { wch: 11 }, { wch: 11 }, { wch: 18 },
    ];
    wsSummary["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 6 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 6 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 6 } },
      { s: { r: 3, c: 0 }, e: { r: 3, c: 6 } },
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

    report.sheets.forEach((sheet) => {
      // Columns: A Bill No. · B Description · C BOQ Amount · D Weight ·
      //          E Planned % · F Actual % · G Variance % · H Earned
      const header = [
        "Bill No.",
        "Description",
        `BOQ Amount (${currencyCode})`,
        "Weight",
        "Planned %",
        "Actual %",
        "Variance %",
        `Earned (${currencyCode})`,
      ];

      const items = sheet.items;
      const dataStartRow = 6 + 1; // after intro (rows 1-5) and header at row 6; 1-indexed for Excel
      const rows = items.map((item, idx) => {
        const rowIdx = dataStartRow + idx; // 1-based Excel row
        return [
          item.billNo || "",
          item.description || "",
          toNumber(item.boqAmount),
          Number((ratios.get(item.id) || 0).toFixed(4)),
          toNumber(item.plannedPercent),
          toNumber(item.actualPercent),
          // Variance % column (G): actual - planned
          { f: `F${rowIdx}-E${rowIdx}` },
          // Earned column (H): boqAmount * actual / 100 (live calc)
          { f: `C${rowIdx}*F${rowIdx}/100` },
        ];
      });

      const intro = [
        [`Section — ${sheet.name}`],
        [`Items: ${items.length}`],
        [`Report: ${report.name}  ·  Date: ${report.date}`],
        [`Project: ${project?.name || "—"}`],
        [],
      ];

      const dataAoa: (string | number | { f: string })[][] = [
        ...intro,
        header as (string | number | { f: string })[],
        ...rows,
      ];

      // Totals row with formulas (sum of value columns)
      const lastDataRow = dataStartRow + items.length - 1;
      const totalsRow: (string | number | { f: string })[] = [
        "TOTAL",
        "",
        items.length ? { f: `SUM(C${dataStartRow}:C${lastDataRow})` } : 0,
        items.length ? { f: `SUM(D${dataStartRow}:D${lastDataRow})` } : 0,
        "",
        "",
        "",
        items.length ? { f: `SUM(H${dataStartRow}:H${lastDataRow})` } : 0,
      ];
      dataAoa.push(totalsRow);

      const ws = XLSX.utils.aoa_to_sheet(dataAoa);
      ws["!cols"] = [
        { wch: 10 }, { wch: 44 }, { wch: 16 }, { wch: 9 }, { wch: 10 }, { wch: 10 }, { wch: 11 }, { wch: 16 },
      ];
      ws["!merges"] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 7 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: 7 } },
        { s: { r: 2, c: 0 }, e: { r: 2, c: 7 } },
        { s: { r: 3, c: 0 }, e: { r: 3, c: 7 } },
      ];
      XLSX.utils.book_append_sheet(wb, ws, sanitizeSheetName(sheet.name, "Section"));
    });

    return wb;
  });
}
