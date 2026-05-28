/**
 * Progress export helpers — PDF (current view) and Excel (Summary + section sheets).
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

function fmtPercent(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) return "0.0%";
  return `${value.toFixed(decimals)}%`;
}

function sheetMetrics(sheet: ProgressSheet) {
  const items = sheet.items;
  const planned = items.reduce(
    (sum, item) => sum + (toNumber(item.weightPercent) * toNumber(item.plannedPercent)) / 100,
    0,
  );
  const actual = items.reduce(
    (sum, item) => sum + (toNumber(item.weightPercent) * toNumber(item.actualPercent)) / 100,
    0,
  );
  const earned = items.reduce((sum, item) => sum + toNumber(item.earnedAmount), 0);
  const boqAmount = items.reduce((sum, item) => sum + toNumber(item.boqAmount), 0);
  const weight = items.reduce((sum, item) => sum + toNumber(item.weightPercent), 0);
  const completed = items.filter((item) => toNumber(item.actualPercent) >= 95).length;
  return { planned, actual, variance: actual - planned, earned, boqAmount, weight, completed, totalItems: items.length };
}

function reportTotals(report: ProgressReport) {
  return report.sheets.reduce(
    (acc, sheet) => {
      const m = sheetMetrics(sheet);
      acc.planned += m.planned;
      acc.actual += m.actual;
      acc.earned += m.earned;
      acc.boqAmount += m.boqAmount;
      acc.weight += m.weight;
      acc.completed += m.completed;
      acc.totalItems += m.totalItems;
      return acc;
    },
    { planned: 0, actual: 0, earned: 0, boqAmount: 0, weight: 0, completed: 0, totalItems: 0 },
  );
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
  const totals = reportTotals(report);
  const variance = totals.actual - totals.planned;
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

function renderItemRow(item: ProgressItem, currencyCode: string, idx: number): string {
  const planned = toNumber(item.plannedPercent);
  const actual = toNumber(item.actualPercent);
  const weight = toNumber(item.weightPercent);
  const earned = toNumber(item.earnedAmount);
  const variance = actual - planned;
  const color = progressTone(actual, planned);
  return `
    <tr>
      <td>${escapeHtml(item.billNo || String(idx))}</td>
      <td>${escapeHtml(item.description || "")}</td>
      <td>${escapeHtml(item.unit || "")}</td>
      <td class="num">${escapeHtml(formatNumber(item.boqQty, 2))}</td>
      <td class="num">${escapeHtml(formatNumber(item.totalQty || item.currentQty, 2))}</td>
      <td class="num">${weight.toFixed(2)}%</td>
      <td class="num">${planned.toFixed(1)}%</td>
      <td class="num" style="color:${color}">${actual.toFixed(1)}%</td>
      <td class="num" style="color:${variance >= 0 ? "#16a34a" : "#dc2626"}">${variance >= 0 ? "+" : ""}${variance.toFixed(1)}%</td>
      <td class="num">${escapeHtml(currencyCode)} ${escapeHtml(formatNumber(earned, 2))}</td>
      <td style="min-width:120px">
        <div class="progress-bar"><span style="width:${Math.max(0, Math.min(100, actual))}%; background:${color}"></span></div>
      </td>
    </tr>
  `;
}

function renderSheetSection(sheet: ProgressSheet, currencyCode: string): string {
  const metrics = sheetMetrics(sheet);
  const itemsHtml = sheet.items.length
    ? sheet.items.map((item, idx) => renderItemRow(item, currencyCode, idx + 1)).join("")
    : `<tr><td colspan="11" style="text-align:center; color:#64748b; padding:14px">No items recorded.</td></tr>`;

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
            <th style="width:42px">#</th>
            <th>Description</th>
            <th style="width:48px">Unit</th>
            <th class="num" style="width:60px">BOQ Qty</th>
            <th class="num" style="width:62px">Done Qty</th>
            <th class="num" style="width:56px">Wt %</th>
            <th class="num" style="width:62px">Planned</th>
            <th class="num" style="width:62px">Actual</th>
            <th class="num" style="width:60px">Δ</th>
            <th class="num" style="width:96px">Earned</th>
            <th style="width:110px">Progress</th>
          </tr>
        </thead>
        <tbody>${itemsHtml}</tbody>
      </table>
    </div>
  `;
}

export function exportProgressAsPdf(report: ProgressReport, project: Project | null): void {
  const currencyCode = project?.currency || "USD";
  const sections = report.sheets.length
    ? report.sheets.map((sheet) => renderSheetSection(sheet, currencyCode)).join("")
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
  const totals = reportTotals(report);
  const filename = `${safeFilename(report.name)}.xlsx`;

  await downloadWorkbook(filename, (XLSX) => {
    const wb = XLSX.utils.book_new();

    // ── Summary sheet ─────────────────────────────
    const summaryHeader = [
      "Section",
      "Items",
      "Weight %",
      "Planned %",
      "Actual %",
      "Variance %",
      `Earned (${currencyCode})`,
    ];
    const summaryRows: (string | number)[][] = report.sheets.map((sheet) => {
      const m = sheetMetrics(sheet);
      return [
        sheet.name,
        m.totalItems,
        Number(m.weight.toFixed(2)),
        Number(m.planned.toFixed(2)),
        Number(m.actual.toFixed(2)),
        Number((m.actual - m.planned).toFixed(2)),
        Number(m.earned.toFixed(2)),
      ];
    });

    summaryRows.push([
      "TOTAL",
      totals.totalItems,
      Number(totals.weight.toFixed(2)),
      Number(totals.planned.toFixed(2)),
      Number(totals.actual.toFixed(2)),
      Number((totals.actual - totals.planned).toFixed(2)),
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
      const header = [
        "Bill No.",
        "Description",
        "Unit",
        "BOQ Qty",
        "Rate",
        "BOQ Amount",
        "Previous Qty",
        "Current Qty",
        "Total Qty",
        "Weight %",
        "Planned %",
        "Actual %",
        "Variance %",
        `Earned (${currencyCode})`,
      ];

      const items = sheet.items;
      const dataStartRow = 6 + 1; // after intro (rows 1-5) and header at row 6; 1-indexed for Excel
      const rows = items.map((item, idx) => {
        const rowIdx = dataStartRow + idx; // 1-based Excel row
        const totalQty = toNumber(item.totalQty || item.currentQty);
        const weight = toNumber(item.weightPercent);
        const planned = toNumber(item.plannedPercent);
        const actual = toNumber(item.actualPercent);
        return [
          item.billNo || "",
          item.description || "",
          item.unit || "",
          toNumber(item.boqQty),
          toNumber(item.boqRate),
          toNumber(item.boqAmount),
          toNumber(item.previousQty),
          toNumber(item.currentQty),
          totalQty,
          weight,
          planned,
          actual,
          // Variance % column (M): actual - planned
          { f: `L${rowIdx}-K${rowIdx}` },
          // Earned column (N): boqAmount * actual / 100 (best-effort live calc)
          { f: `F${rowIdx}*L${rowIdx}/100` },
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

      // Totals row with formulas (sum of columns)
      const lastDataRow = dataStartRow + items.length - 1;
      const totalsRow: (string | number | { f: string })[] = [
        "TOTAL",
        "",
        "",
        "",
        "",
        items.length ? { f: `SUM(F${dataStartRow}:F${lastDataRow})` } : 0,
        "",
        "",
        "",
        items.length ? { f: `SUM(J${dataStartRow}:J${lastDataRow})` } : 0,
        "",
        "",
        "",
        items.length ? { f: `SUM(N${dataStartRow}:N${lastDataRow})` } : 0,
      ];
      dataAoa.push(totalsRow);

      const ws = XLSX.utils.aoa_to_sheet(dataAoa);
      ws["!cols"] = [
        { wch: 10 }, { wch: 42 }, { wch: 6 }, { wch: 10 }, { wch: 10 }, { wch: 14 },
        { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 9 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 16 },
      ];
      ws["!merges"] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 13 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: 13 } },
        { s: { r: 2, c: 0 }, e: { r: 2, c: 13 } },
        { s: { r: 3, c: 0 }, e: { r: 3, c: 13 } },
      ];
      XLSX.utils.book_append_sheet(wb, ws, sanitizeSheetName(sheet.name, "Section"));
    });

    return wb;
  });
}
