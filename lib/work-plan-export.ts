/**
 * Work Plan export helpers — PDF (Table or Gantt view) and Excel (Activities + Timeline).
 */
import type { Project, SavedWorkPlan, WorkPlanActivity } from "./supabase";
import {
  downloadWorkbook,
  escapeHtml,
  openPrintWindow,
  safeFilename,
} from "./exporters";

const DAY_MS = 24 * 60 * 60 * 1000;

const statusLabels: Record<WorkPlanActivity["status"], string> = {
  pending: "Pending",
  "in-progress": "Active",
  completed: "Done",
  delayed: "Critical",
};

const statusPill: Record<WorkPlanActivity["status"], string> = {
  pending: "neutral",
  "in-progress": "active",
  completed: "ok",
  delayed: "err",
};

// Gantt/status palette: completed=green, ongoing=orange, not started=red;
// delayed ("Critical") uses a darker red so it stays distinct from pending.
const statusBarColor: Record<WorkPlanActivity["status"], string> = {
  pending: "#dc2626",
  "in-progress": "#ea580c",
  completed: "#16a34a",
  delayed: "#991b1b",
};

function parseDate(value: string): Date | null {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function activityEnd(activity: WorkPlanActivity): Date | null {
  const explicit = parseDate(activity.endDate);
  if (explicit) return explicit;
  const start = parseDate(activity.startDate);
  if (!start) return null;
  const duration = Math.max(1, Number(activity.duration) || 1);
  return new Date(start.getTime() + (duration - 1) * DAY_MS);
}

function activityProgress(activity: WorkPlanActivity): number {
  if (activity.status === "completed") return 100;
  if (activity.status === "in-progress") return 55;
  if (activity.status === "delayed") return 30;
  return 0;
}

function isSection(activity: WorkPlanActivity): boolean {
  return (activity.rowType || "activity") === "section";
}

function formatIso(value: string | undefined | null): string {
  if (!value) return "";
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

interface HeaderOptions {
  workPlan: SavedWorkPlan;
  project: Project | null;
  viewLabel: string;
}

function renderHeader({ workPlan, project, viewLabel }: HeaderOptions): string {
  const today = new Date().toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  return `
    <div class="export-header">
      <div>
        <div class="subtitle">Construction Programme</div>
        <div class="title">${escapeHtml(workPlan.name)}</div>
        <div class="subtitle" style="margin-top:6px">${viewLabel}</div>
      </div>
      <div class="meta">
        <div><strong>Project</strong> · ${escapeHtml(project?.name || "—")}</div>
        ${project?.contractNumber ? `<div>Contract · ${escapeHtml(project.contractNumber)}</div>` : ""}
        ${project?.location ? `<div>Location · ${escapeHtml(project.location)}</div>` : ""}
        <div>Generated · ${escapeHtml(today)}</div>
      </div>
    </div>
  `;
}

function renderFooter(workPlan: SavedWorkPlan): string {
  return `
    <div class="export-footer">
      <span>${escapeHtml(workPlan.name)}</span>
      <span>Work Plan · Planovera</span>
    </div>
  `;
}

function renderTableBody(activities: WorkPlanActivity[]): string {
  if (!activities.length) {
    return `<tr><td colspan="6" style="text-align:center; color:#64748b; padding:20px">No activities to display.</td></tr>`;
  }
  return activities
    .map((activity, idx) => {
      if (isSection(activity)) {
        return `<tr class="section-row"><td colspan="6">${escapeHtml(activity.description || "Section")}</td></tr>`;
      }
      const seq = activities.slice(0, idx).filter((a) => !isSection(a)).length + 1;
      const progress = activityProgress(activity);
      return `
        <tr>
          <td>${seq}</td>
          <td>${activity.isMilestone ? `<span style="color:#e0912e">◆</span> ` : ""}${escapeHtml(activity.description || "—")}</td>
          <td class="num">${activity.isMilestone ? "—" : escapeHtml(activity.duration || "—")}</td>
          <td>${activity.isMilestone ? "—" : escapeHtml(formatIso(activity.startDate) || "—")}</td>
          <td>${escapeHtml(formatIso(activity.endDate) || "—")}</td>
          <td>
            <span class="pill ${statusPill[activity.status]}">${escapeHtml(statusLabels[activity.status])}</span>
            ${progress ? `<div class="progress-bar" style="margin-top:4px"><span style="width:${progress}%; background:${statusBarColor[activity.status]}"></span></div>` : ""}
          </td>
        </tr>
      `;
    })
    .join("");
}

function exportWorkPlanTableHtml(workPlan: SavedWorkPlan, project: Project | null): string {
  const sheets = workPlan.sheets.length ? workPlan.sheets : [];
  const sections = sheets
    .map((sheet) => {
      const acts = sheet.activities || [];
      const total = acts.filter((a) => !isSection(a)).length;
      const completed = acts.filter((a) => a.status === "completed").length;
      return `
        <div style="margin-top:16px">
          <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:6px">
            <h2 style="font-size:12px; text-transform:uppercase; letter-spacing:1.5px; color:#0f172a">${escapeHtml(sheet.name)}</h2>
            <span style="font-size:9px; color:#64748b; letter-spacing:0.8px; text-transform:uppercase">${completed}/${total} complete</span>
          </div>
          <table class="export-table">
            <thead>
              <tr>
                <th style="width:36px">#</th>
                <th>Activity</th>
                <th class="num" style="width:80px">Duration</th>
                <th style="width:90px">Start</th>
                <th style="width:90px">Finish</th>
                <th style="width:160px">Status</th>
              </tr>
            </thead>
            <tbody>${renderTableBody(acts)}</tbody>
          </table>
        </div>
      `;
    })
    .join("");

  return `
    <div class="export-shell">
      ${renderHeader({ workPlan, project, viewLabel: "Schedule · Table View" })}
      ${sections || `<p style="color:#64748b">No sheets defined yet.</p>`}
      ${renderFooter(workPlan)}
    </div>
  `;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}
function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function exportWorkPlanGanttHtml(workPlan: SavedWorkPlan, project: Project | null): string {
  const sheets = workPlan.sheets.length ? workPlan.sheets : [];
  const sectionsHtml = sheets
    .map((sheet) => {
      const acts = sheet.activities || [];
      const dated = acts
        .filter((a) => !isSection(a))
        // Milestones are deadline-only: treat the deadline as both start and end
        // so they participate in the timeline range calculation.
        .map((a) => ({ activity: a, start: parseDate(a.startDate) || (a.isMilestone ? activityEnd(a) : null), end: activityEnd(a) }))
        .filter((d): d is { activity: WorkPlanActivity; start: Date; end: Date } => Boolean(d.start && d.end));

      if (!dated.length) {
        return `
          <div style="margin-top:16px">
            <h2 style="font-size:12px; text-transform:uppercase; letter-spacing:1.5px; color:#0f172a; margin-bottom:8px">${escapeHtml(sheet.name)}</h2>
            <p style="color:#64748b; font-size:10px">No dated activities — add start dates in the Table view.</p>
          </div>
        `;
      }

      const minStart = dated.reduce((m, d) => (d.start < m ? d.start : m), dated[0].start);
      const maxEnd = dated.reduce((m, d) => (d.end > m ? d.end : m), dated[0].end);
      const timelineStart = addMonths(startOfMonth(minStart), -1);
      const timelineEnd = addMonths(startOfMonth(maxEnd), 2);
      const totalDays = Math.max(1, Math.round((timelineEnd.getTime() - timelineStart.getTime()) / DAY_MS));

      // Use ~6 column ticks for a clean landscape layout
      const monthSpan = (timelineEnd.getTime() - timelineStart.getTime()) / (30 * DAY_MS);
      const monthStep = monthSpan > 18 ? 3 : monthSpan > 8 ? 2 : 1;
      const cols: Array<{ date: Date; label: string }> = [];
      for (let cursor = new Date(timelineStart); cursor < timelineEnd; cursor = addMonths(cursor, monthStep)) {
        cols.push({
          date: new Date(cursor),
          label: cursor.toLocaleDateString(undefined, { month: "short", year: "2-digit" }),
        });
      }

      const today = new Date();
      const todayPosition =
        today >= timelineStart && today <= timelineEnd
          ? ((today.getTime() - timelineStart.getTime()) / DAY_MS / totalDays) * 100
          : null;

      const leftPct = (d: Date) =>
        Math.max(0, Math.min(100, ((d.getTime() - timelineStart.getTime()) / DAY_MS / totalDays) * 100));
      const widthPct = (s: Date, e: Date) =>
        Math.max(0.8, Math.min(100, (((e.getTime() - s.getTime()) / DAY_MS + 1) / totalDays) * 100));

      const rows = acts
        .map((activity, idx) => {
          if (isSection(activity)) {
            return `
              <tr class="section-row">
                <td colspan="2">${escapeHtml(activity.description || "Section")}</td>
              </tr>
            `;
          }
          const seq = acts.slice(0, idx).filter((a) => !isSection(a)).length + 1;
          const start = parseDate(activity.startDate);
          const end = activityEnd(activity);
          const progress = activityProgress(activity);
          const overdue = end && end < new Date() && activity.status !== "completed";
          const barCell = activity.isMilestone && end ? `
            <div style="position:relative; height:18px;">
              ${todayPosition !== null ? `<div style="position:absolute; top:0; bottom:0; left:${todayPosition.toFixed(2)}%; width:1px; background:#f59e0b;"></div>` : ""}
              <div style="position:absolute; top:50%; left:${leftPct(end).toFixed(2)}%; width:8px; height:8px; transform:translate(-50%,-50%) rotate(45deg); background:#e0912e; border-radius:1.5px;"></div>
            </div>
          ` : start && end ? `
            <div style="position:relative; height:18px;">
              ${todayPosition !== null ? `<div style="position:absolute; top:0; bottom:0; left:${todayPosition.toFixed(2)}%; width:1px; background:#f59e0b;"></div>` : ""}
              <div style="position:absolute; top:50%; transform:translateY(-50%); height:8px; border-radius:4px; background:${statusBarColor[activity.status]}22; border:0.6px solid ${statusBarColor[activity.status]}; left:${leftPct(start).toFixed(2)}%; width:${widthPct(start, end).toFixed(2)}%; ${overdue ? "box-shadow:0 0 0 1px #dc2626;" : ""}">
                ${progress > 0 ? `<div style="height:100%; background:${statusBarColor[activity.status]}; border-radius:4px; width:${progress}%"></div>` : ""}
              </div>
            </div>
          ` : `<div style="height:18px; color:#94a3b8; font-size:9px; padding-left:4px">No dates</div>`;
          return `
            <tr>
              <td style="vertical-align:middle">
                <div style="display:flex; gap:6px; align-items:baseline">
                  <span style="color:#64748b; font-size:9px; min-width:14px; text-align:right">${seq}</span>
                  <div style="min-width:0">
                    <div style="font-weight:600; font-size:10px; color:#0f172a">${escapeHtml(activity.description || "Untitled")}</div>
                    <div style="font-size:8.5px; color:#64748b; margin-top:1px">${activity.isMilestone ? `Deadline · ${escapeHtml(formatIso(activity.endDate) || "—")}` : `${escapeHtml(formatIso(activity.startDate) || "—")} → ${escapeHtml(formatIso(activity.endDate) || "—")}`}</div>
                  </div>
                </div>
              </td>
              <td style="vertical-align:middle; padding:4px 8px;">${barCell}</td>
            </tr>
          `;
        })
        .join("");

      const headerTicks = cols
        .map((c) => `<div style="flex:1; padding:4px 6px; border-right:0.4px solid rgba(255,255,255,0.25); font-size:9px; font-weight:600; color:#ffffff; letter-spacing:0.6px; text-transform:uppercase;">${escapeHtml(c.label)}</div>`)
        .join("");

      return `
        <div style="margin-top:16px; page-break-inside: avoid;">
          <h2 style="font-size:12px; text-transform:uppercase; letter-spacing:1.5px; color:#0f172a; margin-bottom:6px">${escapeHtml(sheet.name)}</h2>
          <table class="export-table" style="table-layout:fixed; width:100%;">
            <colgroup>
              <col style="width:32%" />
              <col style="width:68%" />
            </colgroup>
            <thead>
              <tr>
                <th>Activity</th>
                <th style="padding:0">
                  <div style="display:flex;">${headerTicks}</div>
                </th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `;
    })
    .join("");

  const legend = `
    <div class="legend" style="margin-top:10px">
      <span><span class="swatch" style="background:#16a34a"></span>Completed</span>
      <span><span class="swatch" style="background:#ea580c"></span>In Progress</span>
      <span><span class="swatch" style="background:#dc2626"></span>Pending</span>
      <span><span class="swatch" style="background:#991b1b"></span>Critical</span>
      <span style="margin-left:auto"><span class="swatch" style="background:#f59e0b"></span>Today</span>
    </div>
  `;

  return `
    <div class="export-shell">
      ${renderHeader({ workPlan, project, viewLabel: "Schedule · Gantt View" })}
      ${legend}
      ${sectionsHtml || `<p style="color:#64748b">No sheets defined yet.</p>`}
      ${renderFooter(workPlan)}
    </div>
  `;
}

export function exportWorkPlanAsPdf(
  workPlan: SavedWorkPlan,
  project: Project | null,
  view: "table" | "gantt",
): void {
  const html =
    view === "gantt"
      ? exportWorkPlanGanttHtml(workPlan, project)
      : exportWorkPlanTableHtml(workPlan, project);
  openPrintWindow(html, {
    orientation: "landscape",
    paper: view === "gantt" ? "A3" : "A4",
    title: `${workPlan.name} — Work Plan`,
  });
}

interface TimelineCell {
  monthIndex: number;
  /** Inclusive month covered by an activity. */
  active: boolean;
}

function monthsBetween(start: Date, end: Date): Date[] {
  const months: Date[] = [];
  let cursor = startOfMonth(start);
  const stop = startOfMonth(end);
  while (cursor.getTime() <= stop.getTime()) {
    months.push(new Date(cursor));
    cursor = addMonths(cursor, 1);
  }
  return months;
}

export async function exportWorkPlanAsExcel(
  workPlan: SavedWorkPlan,
  project: Project | null,
): Promise<void> {
  const filename = `${safeFilename(workPlan.name)}.xlsx`;
  await downloadWorkbook(filename, (XLSX) => {
    const wb = XLSX.utils.book_new();

    // ── Sheet 1: Activities ─────────────────────────────
    const activitiesHeader = [
      "#",
      "Sheet",
      "Type",
      "Description",
      "Duration (days)",
      "Start",
      "Finish",
      "Status",
      "Progress %",
    ];

    const activityRows: (string | number)[][] = [];
    workPlan.sheets.forEach((sheet) => {
      const acts = sheet.activities || [];
      let seq = 0;
      acts.forEach((activity) => {
        const section = isSection(activity);
        if (!section) seq += 1;
        activityRows.push([
          section ? "" : seq,
          sheet.name,
          section ? "Section" : "Activity",
          activity.description || "",
          section ? "" : (Number(activity.duration) || ""),
          activity.startDate || "",
          activity.endDate || "",
          section ? "" : statusLabels[activity.status] || activity.status,
          section ? "" : activityProgress(activity),
        ]);
      });
    });

    const activitiesData = [
      [`Work Plan — ${workPlan.name}`],
      [`Project: ${project?.name || "—"}`],
      [`Generated: ${new Date().toLocaleString()}`],
      [],
      activitiesHeader,
      ...activityRows,
    ];

    const ws1 = XLSX.utils.aoa_to_sheet(activitiesData);
    ws1["!cols"] = [
      { wch: 5 }, { wch: 22 }, { wch: 10 }, { wch: 48 },
      { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 11 },
    ];
    // Merge the three header rows across columns A–I
    ws1["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 8 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 8 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 8 } },
    ];
    XLSX.utils.book_append_sheet(wb, ws1, "Activities");

    // ── Sheet 2: Timeline (spreadsheet Gantt by month) ─────────────────────────────
    const allDated = workPlan.sheets
      .flatMap((sheet) =>
        (sheet.activities || []).map((activity) => ({
          sheetName: sheet.name,
          activity,
          start: parseDate(activity.startDate),
          end: activityEnd(activity),
        })),
      )
      .filter((row): row is { sheetName: string; activity: WorkPlanActivity; start: Date; end: Date } =>
        Boolean(row.start && row.end),
      );

    if (allDated.length) {
      const minStart = allDated.reduce((m, r) => (r.start < m ? r.start : m), allDated[0].start);
      const maxEnd = allDated.reduce((m, r) => (r.end > m ? r.end : m), allDated[0].end);
      const months = monthsBetween(minStart, maxEnd);
      const monthLabels = months.map((d) => d.toLocaleDateString(undefined, { month: "short", year: "2-digit" }));

      const timelineHeader = ["Sheet", "Activity", "Status", ...monthLabels];

      const timelineRows: (string | number)[][] = [];
      workPlan.sheets.forEach((sheet) => {
        (sheet.activities || []).forEach((activity) => {
          if (isSection(activity)) {
            timelineRows.push([sheet.name, `[${activity.description || "Section"}]`, "", ...months.map(() => "")]);
            return;
          }
          const start = parseDate(activity.startDate);
          const end = activityEnd(activity);
          if (!start || !end) {
            timelineRows.push([
              sheet.name,
              activity.description || "",
              statusLabels[activity.status] || activity.status,
              ...months.map(() => ""),
            ]);
            return;
          }
          const cells: TimelineCell[] = months.map((m, idx) => ({
            monthIndex: idx,
            active: m.getTime() >= startOfMonth(start).getTime() && m.getTime() <= startOfMonth(end).getTime(),
          }));
          timelineRows.push([
            sheet.name,
            activity.description || "",
            statusLabels[activity.status] || activity.status,
            ...cells.map((c) => (c.active ? "■" : "")),
          ]);
        });
      });

      const timelineData = [
        [`Timeline — ${workPlan.name}`],
        [],
        timelineHeader,
        ...timelineRows,
      ];
      const ws2 = XLSX.utils.aoa_to_sheet(timelineData);
      ws2["!cols"] = [
        { wch: 22 },
        { wch: 42 },
        { wch: 11 },
        ...monthLabels.map(() => ({ wch: 7 })),
      ];
      ws2["!merges"] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 2 + monthLabels.length } },
      ];
      XLSX.utils.book_append_sheet(wb, ws2, "Timeline");
    }

    return wb;
  });
}
