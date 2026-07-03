"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Plus,
  Trash2,
  RefreshCw,
  Calendar,
  Copy,
  ClipboardPaste,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  Pencil,
  Save,
  ChevronRight,
  Layers,
  BarChart3,
  Table2,
  Download,
  FileText,
  FileSpreadsheet,
  CalendarRange,
  Flag,
  CheckCircle2,
  Link2,
} from "lucide-react";
import { isWorkPlanRowAchieved } from "@/lib/work-plan-milestones";
import {
  computeRowNumbers,
  formatPredecessors,
  parsePredecessorInput,
} from "@/lib/workplan-scheduling";
import { useAppStore } from "@/lib/store";
import { labelsForType } from "@/lib/project-labels";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import ContextMenu, { type ContextMenuItem } from "@/components/ui/ContextMenu";
import type { WorkPlanActivity } from "@/lib/supabase";
import { exportWorkPlanAsPdf, exportWorkPlanAsExcel } from "@/lib/work-plan-export";

type ScheduleView = "table" | "gantt";
type WorkPlanSummaryMode = "all" | "sections";
type TimelineZoom = "month" | "quarter" | "year";

const DAY_MS = 24 * 60 * 60 * 1000;
const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));

const parseDate = (value: string) => {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);
const addMonths = (date: Date, months: number) => new Date(date.getFullYear(), date.getMonth() + months, 1);

const monthLabel = (date: Date, zoom: TimelineZoom) => {
  if (zoom === "year") return String(date.getFullYear());
  if (zoom === "quarter") return `Q${Math.floor(date.getMonth() / 3) + 1} ${date.getFullYear()}`;
  return date.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
};

const getActivityEndDate = (activity: WorkPlanActivity) => {
  const explicitEnd = parseDate(activity.endDate);
  if (explicitEnd) return explicitEnd;
  const start = parseDate(activity.startDate);
  const duration = Math.max(1, Number(activity.duration) || 1);
  return start ? new Date(start.getTime() + (duration - 1) * DAY_MS) : null;
};

// ─── Create Work Plan Modal ───────────────────────────────────────
function CreateWorkPlanModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { createWorkPlan } = useAppStore();
  const [name, setName] = useState("");

  const handleCreate = () => {
    if (!name.trim()) return;
    createWorkPlan(name.trim());
    onClose();
    setName("");
  };

  return (
    <Modal open={open} onClose={onClose} title="Create New Work Plan" width={420}>
      <div className="flex flex-col gap-4">
        <div>
          <label className="text-xs font-semibold text-txt-muted uppercase tracking-wider block mb-1.5">
            Work Plan Name
          </label>
          <input
            autoFocus
            className="w-full px-3 py-2.5 bg-bg-input border border-border rounded-lg text-sm text-txt outline-none focus:border-accent transition-colors placeholder:text-txt-dim"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            placeholder="e.g. Phase 1 Schedule, Construction Timeline"
          />
        </div>
        <div className="mt-1 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!name.trim()} onClick={handleCreate}>
            <Plus size={14} /> Create
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Work Plan List View ──────────────────────────────────────────
function WorkPlanListView({
  onOpen,
  onCreateClick,
}: {
  onOpen: (id: string) => void;
  onCreateClick: () => void;
}) {
  const { savedWorkPlans, project, deleteWorkPlan, duplicateWorkPlan } = useAppStore();
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const projectWorkPlans = savedWorkPlans.filter((wp) => wp.project_id === project?.id);

  return (
    <>
      {projectWorkPlans.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-bg-surface/80 px-6 py-20 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-accent/10">
            <Calendar size={28} className="text-accent opacity-70" />
          </div>
          <p className="text-sm font-semibold text-txt">No work plans yet</p>
          <Button variant="primary" size="md" className="mt-4" onClick={onCreateClick}>
            <Plus size={14} /> New Work Plan
          </Button>
        </div>
      ) : (
        <div className="grid gap-3">
          {projectWorkPlans.map((wp, idx) => {
            const allActs = wp.sheets.flatMap((sh) => sh.activities).filter((a) => (a.rowType || "activity") !== "section");
            const actCount = allActs.length;
            const completedCount = allActs.filter((a) => a.status === "completed").length;
            const activeCount = allActs.filter((a) => a.status === "in-progress").length;
            const delayedCount = allActs.filter((a) => a.status === "delayed").length;
            const completion = actCount > 0 ? Math.round((completedCount / actCount) * 100) : 0;
            const dates = allActs.filter((a) => a.startDate);
            const earliestStart = dates.length
              ? dates.reduce((min, a) => (a.startDate < min ? a.startDate : min), dates[0].startDate)
              : null;
            const endDates = allActs.filter((a) => a.endDate);
            const latestEnd = endDates.length
              ? endDates.reduce((max, a) => (a.endDate > max ? a.endDate : max), endDates[0].endDate)
              : null;

            return (
              <div
                key={wp.id}
                className="group relative overflow-hidden rounded-2xl border border-border bg-bg-surface p-4 cursor-pointer transition-colors duration-150 hover:border-accent/45"
                style={{ animationDelay: `${idx * 60}ms`, animationFillMode: "both" }}
                onClick={() => onOpen(wp.id)}
              >
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                  <div className="flex min-w-0 items-start gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent/10">
                      <Calendar size={20} className="text-accent" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">
                        Construction Programme
                      </div>
                      <div className="mt-1 truncate text-base font-semibold text-txt">{wp.name}</div>
                      <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-txt-dim md:gap-3">
                        <span>{wp.sheets.length} sheet{wp.sheets.length !== 1 ? "s" : ""}</span>
                        <span>{actCount} activit{actCount !== 1 ? "ies" : "y"}</span>
                        <span>{completedCount}/{actCount || 0} complete</span>
                        {earliestStart && latestEnd && <span>{earliestStart} to {latestEnd}</span>}
                        <span>Modified {new Date(wp.updatedAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="min-w-[180px] rounded-xl border border-border bg-bg p-3">
                      <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">
                        <span>Progress</span>
                        <span className="text-txt">{completion}%</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-black/5">
                        <div className="h-full rounded-full bg-gradient-to-r from-accent to-ok" style={{ width: `${completion}%` }} />
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-txt-dim">
                        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-ok" /> {completedCount} done</span>
                        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-accent" /> {activeCount} active</span>
                        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-err" /> {delayedCount} critical</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-3 sm:justify-start">
                      <div className="flex gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                        <button
                          onClick={(e) => { e.stopPropagation(); duplicateWorkPlan(wp.id); }}
                          className="p-1.5 rounded-md bg-transparent border-none text-txt-dim hover:text-accent hover:bg-accent/10 cursor-pointer transition-colors"
                          title="Duplicate"
                        >
                          <Copy size={14} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteTarget({ id: wp.id, name: wp.name }); }}
                          className="p-1.5 rounded-md bg-transparent border-none text-txt-dim hover:text-err hover:bg-err/10 cursor-pointer transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <ChevronRight size={16} className="text-txt-dim group-hover:text-accent transition-colors" />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {deleteTarget && (
        <Modal open={true} onClose={() => setDeleteTarget(null)} title="Delete Work Plan" width={400}>
          <p className="text-sm text-txt-muted mb-5">
            Are you sure you want to delete <strong>{deleteTarget.name}</strong>? This action cannot be undone.
          </p>
          <div className="flex flex-col-reverse gap-3 sm:flex-row">
            <Button variant="ghost" className="flex-1 justify-center" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="danger" className="flex-1 justify-center" onClick={() => { deleteWorkPlan(deleteTarget.id); setDeleteTarget(null); }}>
              <Trash2 size={14} /> Delete
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}

// ─── Work Plan Table (view/edit) ──────────────────────────────────
/**
 * Predecessor cell: shows/accepts row IDs from the "#" column ("3" or "2, 5").
 * Commits on blur/Enter; an invalid entry keeps the previous value and shows
 * the reason as a red ring + tooltip. Links are finish-to-start.
 */
function PredecessorCellInput({
  display,
  onCommit,
}: {
  display: string;
  /** Returns an error message when the input is rejected, null when applied. */
  onCommit: (raw: string) => string | null;
}) {
  const [draft, setDraft] = useState(display);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setDraft(display);
  }, [display]);
  return (
    <input
      type="text"
      inputMode="numeric"
      className={`data-cell-input text-center font-mono text-xs ${error ? "ring-1 ring-inset ring-err" : ""}`}
      value={draft}
      placeholder="—"
      title={error || 'Predecessor row IDs from the "#" column, e.g. "3" or "2, 5"'}
      onChange={(e) => {
        setDraft(e.target.value);
        if (error) setError(null);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      onBlur={() => {
        const err = onCommit(draft);
        if (err) {
          setError(err);
          setDraft(display);
        }
      }}
    />
  );
}

function WorkPlanTable({
  readOnly = false,
  summaryMode = "all",
}: {
  readOnly?: boolean;
  summaryMode?: WorkPlanSummaryMode;
}) {
  const {
    project,
    workPlanSheets,
    activeWorkPlanSheetIndex,
    updateActivity,
    toggleActivityMilestone,
    deleteActivity,
    pasteWorkPlanRows,
    clearWorkPlanRange,
    insertActivityAt,
    moveActivity,
    pasteActivityAt,
    deleteActivities,
    setActivityPredecessors,
  } = useAppStore();

  const activities = workPlanSheets[activeWorkPlanSheetIndex]?.activities || [];
  // Row IDs for the "#" column (every row, 1-based). Predecessor links store
  // stable activity UUIDs, so these display numbers can shift freely when rows
  // are inserted/moved/deleted without breaking any link.
  const rowNumbers = useMemo(() => computeRowNumbers(activities), [activities]);
  // Precompute which flagged milestones are achieved once per render so each row
  // is an O(1) Set lookup rather than re-scanning the activity list.
  const achievedMilestoneIds = useMemo(() => {
    const ids = new Set<string>();
    activities.forEach((activity, index) => {
      if (activity.isMilestone && isWorkPlanRowAchieved(activities, index)) ids.add(activity.id);
    });
    return ids;
  }, [activities]);
  const isSectionSummary = summaryMode === "sections";
  const visibleActivities = isSectionSummary
    ? activities.filter((activity) => (activity.rowType || "activity") === "section")
    : activities;

  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [lastSelectedRowId, setLastSelectedRowId] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [clipboard, setClipboard] = useState<WorkPlanActivity[]>([]);

  const [selection, setSelection] = useState<{
    start: { r: number; c: string };
    end: { r: number; c: string };
    isDragging: boolean;
  } | null>(null);

  const wpCols = ["description", "duration", "startDate"];

  useEffect(() => {
    setSelectedRowIds([]);
    setLastSelectedRowId(null);
    setSelection(null);
  }, [summaryMode, activeWorkPlanSheetIndex]);

  const handlePaste = (rowIndex: number, colKey: string, e: React.ClipboardEvent) => {
    if (readOnly || isSectionSummary) return;
    const text = e.clipboardData.getData("text/plain");
    if (text.includes("\t") || text.includes("\n")) {
      e.preventDefault();
      pasteWorkPlanRows(rowIndex, colKey, text);
    }
  };

  const handleMouseDown = (r: number, c: string) => {
    if (readOnly || isSectionSummary) return;
    setSelection({ start: { r, c }, end: { r, c }, isDragging: true });
  };

  const handleMouseEnter = (r: number, c: string) => {
    if (readOnly) return;
    if (selection?.isDragging) {
      setSelection((prev) => (prev ? { ...prev, end: { r, c } } : null));
    }
  };

  const clearSelection = useCallback(() => { setSelection(null); }, []);

  useEffect(() => {
    if (readOnly) return;
    const handleMouseUp = () => { setSelection((prev) => (prev ? { ...prev, isDragging: false } : null)); };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Delete" && !selection?.isDragging) {
        const isInputFocused = document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "SELECT" || document.activeElement?.tagName === "TEXTAREA";
        if (!isInputFocused) {
          if (selection && (selection.start.r !== selection.end.r || selection.start.c !== selection.end.c)) {
            e.preventDefault();
            clearWorkPlanRange(selection.start.r, selection.end.r, selection.start.c, selection.end.c);
          } else if (selectedRowIds.length > 0) {
            e.preventDefault();
            deleteActivities(selectedRowIds);
            setSelectedRowIds([]);
          }
        }
      }
      if (e.key === "Escape") clearSelection();
    };
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("keydown", handleKeyDown);
    return () => { window.removeEventListener("mouseup", handleMouseUp); window.removeEventListener("keydown", handleKeyDown); };
  }, [selection, clearWorkPlanRange, clearSelection, readOnly, selectedRowIds, activities, updateActivity, deleteActivities]);

  const isInSelection = (r: number, c: string) => {
    if (!selection) return false;
    const { start, end } = selection;
    const minR = Math.min(start.r, end.r), maxR = Math.max(start.r, end.r);
    const colIdx1 = wpCols.indexOf(start.c), colIdx2 = wpCols.indexOf(end.c);
    const minC = Math.min(colIdx1, colIdx2), maxC = Math.max(colIdx1, colIdx2);
    return r >= minR && r <= maxR && wpCols.indexOf(c) >= minC && wpCols.indexOf(c) <= maxC;
  };

  const handleRowClick = (e: React.MouseEvent, id: string) => {
    if (readOnly) return;

    if (e.shiftKey && lastSelectedRowId) {
      const actIds = visibleActivities.map((a) => a.id);
      const startIdx = actIds.indexOf(lastSelectedRowId);
      const endIdx = actIds.indexOf(id);
      if (startIdx !== -1 && endIdx !== -1) {
        const range = actIds.slice(Math.min(startIdx, endIdx), Math.max(startIdx, endIdx) + 1);
        setSelectedRowIds(Array.from(new Set([...selectedRowIds, ...range])));
      }
    } else if (e.ctrlKey || e.metaKey) {
      setSelectedRowIds((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      );
    } else {
      setSelectedRowIds([id]);
    }
    setLastSelectedRowId(id);
  };

  const handleContextMenu = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation(); // Stop bubbling to backdrop
    if (!selectedRowIds.includes(id)) {
      setSelectedRowIds([id]);
      setLastSelectedRowId(id);
    }
    setCtxMenu({ x: e.clientX, y: e.clientY });
  };

  const copyRow = () => {
    if (selectedRowIds.length === 0) return;
    const items = visibleActivities.filter((a) => selectedRowIds.includes(a.id));
    setClipboard(items.map((i) => ({ ...i })));
  };

  const selectedActs = selectedRowIds
    .map((id) => activities.find((a) => a.id === id))
    .filter((a): a is WorkPlanActivity => Boolean(a));
  const primaryAct = selectedActs[0];
  const primaryIsSection = (primaryAct?.rowType || "activity") === "section";

  const contextItems: ContextMenuItem[] = [
    {
      label: selectedRowIds.length > 1 ? `Add Activities Above` : "Add Activity Above",
      icon: <Plus size={14} />,
      action: () => selectedRowIds.length > 0 && insertActivityAt(selectedRowIds[0], "above"),
      disabled: selectedRowIds.length > 1 || readOnly || isSectionSummary
    },
    {
      label: selectedRowIds.length > 1 ? `Add Activities Below` : "Add Activity Below",
      icon: <Plus size={14} />,
      action: () => selectedRowIds.length > 0 && insertActivityAt(selectedRowIds[selectedRowIds.length - 1], "below"),
      disabled: selectedRowIds.length > 1 || readOnly || isSectionSummary
    },
    {
      label: primaryIsSection ? "Convert to Activity Row" : "Make Section Header",
      icon: <Layers size={14} />,
      action: () => primaryAct && updateActivity(primaryAct.id, "rowType", primaryIsSection ? "activity" : "section"),
      disabled: readOnly || isSectionSummary || selectedRowIds.length !== 1 || !primaryAct,
    },
    { divider: true },
    {
      label: primaryAct?.isMilestone ? "Remove Milestone" : "Mark as Milestone",
      icon: <Flag size={14} />,
      action: () => primaryAct && toggleActivityMilestone(primaryAct.id),
      disabled: readOnly || selectedRowIds.length !== 1 || !primaryAct,
    },
    {
      label: primaryAct?.status === "completed" ? "Reopen (in progress)" : "Mark Completed",
      icon: <CheckCircle2 size={14} />,
      action: () =>
        primaryAct &&
        updateActivity(primaryAct.id, "status", primaryAct.status === "completed" ? "in-progress" : "completed"),
      disabled: readOnly || isSectionSummary || selectedRowIds.length !== 1 || !primaryAct,
    },
    { divider: true },
    { label: selectedRowIds.length > 1 ? `Copy ${selectedRowIds.length} Activities` : "Copy Activity", icon: <Copy size={14} />, action: copyRow },
    { label: "Paste Activities Above", icon: <ClipboardPaste size={14} />, action: () => selectedRowIds.length > 0 && pasteActivityAt(selectedRowIds[0], "above", clipboard), disabled: !clipboard.length || readOnly || isSectionSummary },
    { label: "Paste Activities Below", icon: <ClipboardPaste size={14} />, action: () => selectedRowIds.length > 0 && pasteActivityAt(selectedRowIds[selectedRowIds.length - 1], "below", clipboard), disabled: !clipboard.length || readOnly || isSectionSummary },
    { label: "Move Up", icon: <ArrowUp size={14} />, action: () => selectedRowIds.length === 1 && moveActivity(selectedRowIds[0], "up"), disabled: selectedRowIds.length !== 1 || readOnly || isSectionSummary },
    { label: "Move Down", icon: <ArrowDown size={14} />, action: () => selectedRowIds.length === 1 && moveActivity(selectedRowIds[0], "down"), disabled: selectedRowIds.length !== 1 || readOnly || isSectionSummary },
    { divider: true },
    {
      label: selectedRowIds.length > 1 ? `Delete ${selectedRowIds.length} Activities` : "Delete Activity",
      icon: <Trash2 size={14} />,
      action: () => {
        deleteActivities(selectedRowIds);
        setSelectedRowIds([]);
      },
      danger: true,
      disabled: readOnly || isSectionSummary
    },
  ];

  if (visibleActivities.length === 0 && readOnly) {
    return (
      <div className="text-center py-16 text-txt-muted">
        <Calendar size={40} className="mx-auto mb-3 opacity-40" />
        <p>{isSectionSummary ? "No section headers in this sheet" : "No activities in this sheet"}</p>
      </div>
    );
  }

  if (visibleActivities.length === 0 && !readOnly) {
    return (
      <div className="text-center py-16 text-txt-muted">
        <Calendar size={40} className="mx-auto mb-3 opacity-40" />
        <p>{isSectionSummary ? "No section headers yet" : "No activities yet"}</p>
        <p className="text-xs mt-1">
          {isSectionSummary ? "Switch to All rows to add section headers and activities." : `Add activities manually or fetch from ${labelsForType(project).nav.boqOrItems}`}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="data-table-shell overflow-auto" style={{ maxHeight: "calc(100vh - 365px)" }}>
        <table className="data-table data-table-sticky min-w-[430px] sm:min-w-[780px]">
          <thead>
            <tr>
              {/* The body "#" gutter is hidden globally (.data-cell-index → display:none),
                  so the header must hide too or thead/tbody columns shift out of alignment. */}
              <th className="hidden" aria-hidden="true" />
              {/* Row ID (MS Project-style): editor-only — never appears in PDF/Excel
                  exports or in reports; predecessors reference these numbers. */}
              <th className="data-sticky-col left-0 w-[34px] min-w-[34px] text-center" title="Row ID — reference these numbers in the Predecessors column">
                #
              </th>
              <th className="data-sticky-col left-[34px] data-sticky-edge w-[132px] min-w-[132px] sm:min-w-[420px] sm:w-[54%]">Description</th>
              <th className="text-center w-[46px] sm:w-[110px]">
                <span className="sm:hidden">Days</span>
                <span className="hidden sm:inline">Duration (days)</span>
              </th>
              <th className="text-center w-[88px] sm:w-[130px]">Start Date</th>
              <th className="text-center w-[88px] sm:w-[130px]">End Date</th>
              <th className="text-center w-[64px] sm:w-[110px]" title='Finish-to-start links: enter predecessor row IDs, e.g. "3" or "2, 5"'>
                <span className="sm:hidden">Pred.</span>
                <span className="hidden sm:inline">Predecessors</span>
              </th>
              {!readOnly && <th style={{ width: 40 }} aria-label="Actions" />}
            </tr>
          </thead>
          <tbody>
            {visibleActivities.map((act, i) => {
              const rowType = act.rowType || "activity";
              const isSection = rowType === "section";
              const activityOrdinal =
                1 + activities.slice(0, i).filter((a) => (a.rowType || "activity") !== "section").length;
              const hasPreds = !isSection && (act.predecessorIds?.length ?? 0) > 0;
              return (
              <tr
                key={act.id}
                className={`${isSection ? "bg-bg-raised/60" : ""} ${selectedRowIds.includes(act.id) ? "bg-accent/10 row-selected" : ""}`}
                onContextMenu={(e) => handleContextMenu(e, act.id)}
                onClick={(e) => handleRowClick(e, act.id)}
              >
                <td className="data-cell-index" aria-hidden="true">{isSection ? "" : activityOrdinal}</td>
                <td className="data-sticky-col left-0 w-[34px] min-w-[34px] text-center text-[11px] font-mono text-txt-muted">
                  {rowNumbers.get(act.id) ?? ""}
                </td>
                <td className={`data-cell-wrap data-sticky-col left-[34px] data-sticky-edge w-[132px] min-w-[132px] sm:min-w-[420px] sm:w-[54%] transition-colors ${isInSelection(i, "description") ? "bg-accent/15 ring-1 ring-inset ring-accent/30" : ""}`}
                    onMouseDown={() => handleMouseDown(i, "description")} onMouseEnter={() => handleMouseEnter(i, "description")}>
                  <div className="flex items-start gap-1.5">
                    {act.isMilestone ? (
                      achievedMilestoneIds.has(act.id) ? (
                        <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-ok" aria-label="Milestone achieved" />
                      ) : (
                        <Flag size={13} className="mt-0.5 shrink-0 text-accent" aria-label="Milestone (not yet achieved)" />
                      )
                    ) : null}
                    <div className="min-w-0 flex-1">
                      {readOnly ? <span className={`block whitespace-pre-wrap break-words text-[13px] leading-5 ${isSection ? "font-semibold text-txt" : "text-txt"}`}>{act.description || "—"}</span>
                        : <textarea className={`data-cell-textarea ${isSection ? "font-semibold text-txt" : "text-txt"}`} value={act.description}
                            rows={2} onChange={(e) => updateActivity(act.id, "description", e.target.value)} onPaste={(e) => handlePaste(i, "description", e)} placeholder={isSection ? "Section title" : "Activity description"} />}
                    </div>
                  </div>
                </td>
                <td className={`text-center transition-colors ${isInSelection(i, "duration") ? "bg-accent/15 ring-1 ring-inset ring-accent/30" : ""}`}
                    onMouseDown={() => handleMouseDown(i, "duration")} onMouseEnter={() => handleMouseEnter(i, "duration")}>
                  {readOnly || isSection ? <span className="text-xs font-mono text-txt">{act.duration || "—"}</span>
                    : <input type="number" className="data-cell-input text-center font-mono text-xs" value={act.duration}
                        onChange={(e) => updateActivity(act.id, "duration", e.target.value)} onPaste={(e) => handlePaste(i, "duration", e)} placeholder="—" />}
                </td>
                <td className={`text-center transition-colors ${isInSelection(i, "startDate") ? "bg-accent/15 ring-1 ring-inset ring-accent/30" : ""}`}
                    onMouseDown={() => handleMouseDown(i, "startDate")} onMouseEnter={() => handleMouseEnter(i, "startDate")}>
                  {readOnly || isSection ? <span className="text-xs text-txt">{act.startDate || "—"}</span>
                    : hasPreds ? (
                      <span
                        className="inline-flex items-center gap-1 text-xs text-txt"
                        title="Start date follows the latest predecessor — clear the Predecessors cell to set it manually"
                      >
                        <Link2 size={11} className="shrink-0 text-accent" aria-hidden="true" />
                        {act.startDate || "—"}
                      </span>
                    )
                    : <input type="date" className="data-cell-input [color-scheme:light] text-center text-xs" value={act.startDate}
                        onChange={(e) => updateActivity(act.id, "startDate", e.target.value)} onPaste={(e) => handlePaste(i, "startDate", e)} />}
                </td>
                <td className="text-center text-xs font-mono text-txt-muted">{act.endDate || "—"}</td>
                <td className="text-center">
                  {isSection ? (
                    <span className="text-xs text-txt-muted">—</span>
                  ) : readOnly ? (
                    <span className="text-xs font-mono text-txt">{formatPredecessors(act, rowNumbers) || "—"}</span>
                  ) : (
                    <PredecessorCellInput
                      display={formatPredecessors(act, rowNumbers)}
                      onCommit={(raw) => {
                        const parsed = parsePredecessorInput(raw, activities, act.id);
                        if ("error" in parsed) return parsed.error;
                        setActivityPredecessors(act.id, parsed.ids);
                        return null;
                      }}
                    />
                  )}
                </td>
                {!readOnly && (
                  <td className="data-cell-action">
                    <button onClick={() => deleteActivity(act.id)} className="data-row-action danger" aria-label="Delete activity"><Trash2 size={13} /></button>
                  </td>
                )}
              </tr>
            );
            })}
          </tbody>
        </table>
      </div>
      {ctxMenu && <ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={contextItems} onClose={() => setCtxMenu(null)} />}
    </>
  );
}

// ─── Work Plan Gantt View ─────────────────────────────────────────
function WorkPlanGanttView({ summaryMode = "all" }: { summaryMode?: WorkPlanSummaryMode }) {
  const { workPlanSheets, activeWorkPlanSheetIndex } = useAppStore();
  const [zoom, setZoom] = useState<TimelineZoom>("quarter");
  const activities = workPlanSheets[activeWorkPlanSheetIndex]?.activities || [];
  const ganttActivities = summaryMode === "sections"
    ? activities.filter((activity) => (activity.rowType || "activity") === "section")
    : activities;
  const today = startOfMonth(new Date());

  const datedActivities = ganttActivities
    .filter((activity) =>
      summaryMode === "sections"
        ? (activity.rowType || "activity") === "section"
        : (activity.rowType || "activity") !== "section"
    )
    .map((activity) => ({
      activity,
      start: parseDate(activity.startDate),
      end: getActivityEndDate(activity),
    }))
    .filter((item): item is { activity: WorkPlanActivity; start: Date; end: Date } => Boolean(item.start && item.end));

  if (ganttActivities.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-bg-surface/80 p-10 text-center text-txt-muted">
        <BarChart3 size={42} className="mx-auto mb-3 opacity-40" />
        <p className="font-medium text-txt">{summaryMode === "sections" ? "No section headers yet" : "No Gantt data yet"}</p>
        <p className="mt-1 text-xs">
          {summaryMode === "sections"
            ? "Switch to All rows to add section headers and activities."
            : "Add activities with start dates in the table, then switch back to Gantt."}
        </p>
      </div>
    );
  }

  if (datedActivities.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-bg-surface/80 p-10 text-center text-txt-muted">
        <Calendar size={42} className="mx-auto mb-3 opacity-40" />
        <p className="font-medium text-txt">Dates required for Gantt view</p>
        <p className="mt-1 text-xs">
          {summaryMode === "sections"
            ? "Section dates are rolled up from dated child activities."
            : "Enter activity start dates and durations in the table to generate the programme timeline."}
        </p>
      </div>
    );
  }

  const minStart = datedActivities.reduce((min, item) => (item.start < min ? item.start : min), datedActivities[0].start);
  const maxEnd = datedActivities.reduce((max, item) => (item.end > max ? item.end : max), datedActivities[0].end);
  const timelineStart = addMonths(startOfMonth(minStart), -1);
  const timelineEnd = addMonths(startOfMonth(maxEnd), 2);
  const totalDays = Math.max(1, Math.round((timelineEnd.getTime() - timelineStart.getTime()) / DAY_MS));
  const monthStep = zoom === "year" ? 12 : zoom === "quarter" ? 3 : 1;
  const timelineCols: Array<{ date: Date; spanDays: number; label: string }> = [];

  for (let cursor = new Date(timelineStart); cursor < timelineEnd; cursor = addMonths(cursor, monthStep)) {
    const next = addMonths(cursor, monthStep);
    timelineCols.push({
      date: new Date(cursor),
      spanDays: Math.max(1, Math.round((Math.min(next.getTime(), timelineEnd.getTime()) - cursor.getTime()) / DAY_MS)),
      label: monthLabel(cursor, zoom),
    });
  }

  const leftPercent = (date: Date) => clamp(((date.getTime() - timelineStart.getTime()) / DAY_MS / totalDays) * 100);
  const widthPercent = (start: Date, end: Date) =>
    Math.max(1.5, clamp((((end.getTime() - start.getTime()) / DAY_MS + 1) / totalDays) * 100));
  const todayPosition =
    today >= timelineStart && today <= timelineEnd ? leftPercent(today) : null;
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-bg-surface">
      <div className="flex flex-col gap-4 border-b border-border bg-bg-raised/40 p-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">Programme Gantt</div>
            <div className="mt-1 text-sm font-semibold text-txt">
              Rev 1 - {datedActivities.length} activities
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl border border-border bg-bg p-1">
          {(["month", "quarter", "year"] as TimelineZoom[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setZoom(item)}
              className={`h-7 rounded-lg px-3 text-xs font-semibold capitalize transition-colors ${
                zoom === item
                  ? "bg-bg-raised text-txt shadow-sm"
                  : "text-txt-muted hover:bg-bg-hover hover:text-txt"
              }`}
            >
              {item}
            </button>
          ))}
          </div>
        </div>
      </div>

      <div className="overflow-auto">
        <div className="min-w-[980px]">
          <div className="grid grid-cols-[320px_1fr] border-b border-border bg-bg/70">
            <div className="border-r border-border px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">Activity</div>
            </div>
            <div className="relative flex min-h-11">
              {timelineCols.map((col, index) => (
                <div
                  key={`${col.label}-${index}`}
                  className="flex items-center justify-center border-r border-border/70 px-2 text-[10px] font-bold uppercase tracking-[0.12em] text-txt-dim"
                  style={{ flex: col.spanDays }}
                >
                  {col.label}
                </div>
              ))}
              {todayPosition !== null && (
                <div
                  className="absolute bottom-0 top-0 w-px bg-warn"
                  style={{ left: `${todayPosition}%` }}
                >
                  <span className="absolute -left-5 top-1 rounded bg-warn px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wider text-black">
                    Today
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="relative">
            {ganttActivities.map((activity, index) => {
              const isSection = (activity.rowType || "activity") === "section";
              const start = parseDate(activity.startDate);
              const end = getActivityEndDate(activity);
              const overdue = end && end < new Date() && activity.status !== "completed";
              const rowNumber =
                1 + activities.slice(0, index).filter((item) => (item.rowType || "activity") !== "section").length;

              return (
                <div
                  key={activity.id}
                  className={`grid grid-cols-[320px_1fr] border-b border-border/70 ${
                    isSection ? "bg-bg-raised/70" : "bg-bg-surface/80 hover:bg-bg-hover"
                  }`}
                >
                  <div className="flex min-h-[46px] items-center gap-3 border-r border-border px-4 py-2">
                    {isSection ? (
                      <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-txt">{activity.description || "Section"}</div>
                    ) : (
                      <>
                        <span className="w-6 shrink-0 text-right text-[10px] font-mono text-txt-dim">{rowNumber}</span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-txt">{activity.description || "Untitled activity"}</div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-txt-dim">
                            <span>{activity.startDate || "No start"}</span>
                            <span>→</span>
                            <span>{activity.endDate || "Auto end"}</span>
                            {overdue && <span className="font-bold text-err">Overdue</span>}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                  <div className="relative min-h-[46px] overflow-hidden">
                    {todayPosition !== null && (
                      <div
                        className="absolute bottom-0 top-0 z-10 w-px bg-warn/60"
                        style={{ left: `${todayPosition}%` }}
                      />
                    )}
                    {timelineCols.map((col, colIndex) => (
                      <div
                        key={`${activity.id}-${colIndex}`}
                        className="absolute bottom-0 top-0 border-r border-border/35"
                        style={{
                          left: `${leftPercent(col.date)}%`,
                          width: `${clamp((col.spanDays / totalDays) * 100)}%`,
                          background: colIndex % 2 === 0 ? "rgba(255,255,255,0.015)" : "transparent",
                        }}
                      />
                    ))}
                    {isSection && summaryMode !== "sections" ? (
                      <div className="absolute left-4 right-4 top-1/2 h-px bg-border" />
                    ) : start && end ? (
                      <div
                        className={`absolute top-1/2 h-4 -translate-y-1/2 rounded-full bg-accent shadow-lg shadow-black/10 ${
                          overdue ? "ring-2 ring-err/40" : ""
                        }`}
                        style={{ left: `${leftPercent(start)}%`, width: `${widthPercent(start, end)}%` }}
                      />
                    ) : (
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-xs text-txt-dim">Add a start date</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 border-t border-border bg-bg-raised/40 px-4 py-3 text-[11px] text-txt-muted">
        <span className="inline-flex items-center gap-1.5 font-semibold text-txt"><CalendarRange size={13} className="text-accent" /> {datedActivities.length} activities</span>
        <span className="ml-auto text-txt-dim">Edit dates and durations from the table view.</span>
      </div>
    </div>
  );
}

// ─── Sheet Tabs (BOQ-style) ───────────────────────────────────────
function WorkPlanSheetTabs({ readOnly }: { readOnly: boolean }) {
  const {
    workPlanSheets,
    activeWorkPlanSheetIndex,
    setActiveWorkPlanSheetIndex,
    addWorkPlanSheet,
    duplicateWorkPlanSheet,
    deleteWorkPlanSheet,
    renameWorkPlanSheet,
  } = useAppStore();

  const [renaming, setRenaming] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; idx: number } | null>(null);

  const startRename = (idx: number) => {
    setRenaming(idx);
    setRenameValue(workPlanSheets[idx].name);
  };

  const finishRename = () => {
    if (renaming !== null && renameValue.trim()) {
      renameWorkPlanSheet(renaming, renameValue.trim());
    }
    setRenaming(null);
  };

  const handleCtxMenu = (e: React.MouseEvent, idx: number) => {
    if (readOnly) return;
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, idx });
  };

  const ctxItems: ContextMenuItem[] = ctxMenu
    ? [
        { label: "Rename Sheet", icon: <Pencil size={14} />, action: () => startRename(ctxMenu.idx) },
        { label: "Duplicate Sheet", icon: <Copy size={14} />, action: () => duplicateWorkPlanSheet(ctxMenu.idx) },
        { divider: true },
        { label: "Delete Sheet", icon: <Trash2 size={14} />, action: () => deleteWorkPlanSheet(ctxMenu.idx), danger: true, disabled: workPlanSheets.length <= 1 },
      ]
    : [];

  return (
    <div className="flex items-center gap-1 mt-3 border-t border-border pt-2 overflow-x-auto">
      {workPlanSheets.map((sh, i) => (
        <button
          key={sh.id}
          className={`px-3 py-1.5 text-xs font-medium rounded-t-md border border-b-0 transition-all whitespace-nowrap cursor-pointer
            ${i === activeWorkPlanSheetIndex
              ? "bg-bg-surface text-txt border-border -mb-px z-10"
              : "bg-transparent text-txt-dim hover:text-txt border-transparent hover:bg-bg-raised"}`}
          onClick={() => setActiveWorkPlanSheetIndex(i)}
          onDoubleClick={() => !readOnly && startRename(i)}
          onContextMenu={(e) => handleCtxMenu(e, i)}
        >
          {renaming === i ? (
            <input
              autoFocus
              className="bg-transparent border-none text-xs font-medium text-txt outline-none w-[100px]"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={finishRename}
              onKeyDown={(e) => { if (e.key === "Enter") finishRename(); if (e.key === "Escape") setRenaming(null); }}
            />
          ) : sh.name}
        </button>
      ))}
      {!readOnly && (
        <button
          onClick={addWorkPlanSheet}
          className="px-2 py-1.5 text-xs text-txt-dim hover:text-accent bg-transparent border-none cursor-pointer transition-colors"
          title="Add Sheet"
        >
          <Plus size={14} />
        </button>
      )}
      {ctxMenu && <ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={ctxItems} onClose={() => setCtxMenu(null)} />}
    </div>
  );
}

// ─── Export menu (PDF / Excel) ────────────────────────────────────
function ExportMenu({
  onPdf,
  onExcel,
  ganttHint,
}: {
  onPdf: () => void;
  onExcel: () => void;
  ganttHint: boolean;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={menuRef} className="relative">
      <Button size="sm" variant="default" onClick={() => setOpen((prev) => !prev)}>
        <Download size={14} /> Export
      </Button>
      {open && (
        <div className="absolute right-0 top-10 z-40 w-[260px] rounded-xl border border-border bg-bg-surface p-1 shadow-xl shadow-black/30">
          <button
            type="button"
            onClick={() => { setOpen(false); onPdf(); }}
            className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition hover:bg-bg-hover"
          >
            <FileText size={16} className="mt-0.5 shrink-0 text-accent" />
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-semibold text-txt">PDF (current view)</span>
              <span className="mt-0.5 block text-[10px] leading-snug text-txt-dim">
                {ganttHint ? "Landscape A3 — drop into a presentation" : "Print-ready schedule table"}
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => { setOpen(false); onExcel(); }}
            className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition hover:bg-bg-hover"
          >
            <FileSpreadsheet size={16} className="mt-0.5 shrink-0 text-ok" />
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-semibold text-txt">Excel (data table)</span>
              <span className="mt-0.5 block text-[10px] leading-snug text-txt-dim">
                Activities + month-by-month timeline sheet
              </span>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main Work Plan Module ────────────────────────────────────────
export default function WorkPlanModule() {
  const {
    activeWorkPlanId,
    openWorkPlan,
    saveWorkPlan,
    savedWorkPlans,
    addActivity,
    fetchActivitiesFromBOQ,
    project,
    savedBOQs,
    savedSimpleItemSets,
    workPlanSheets,
  } = useAppStore();

  const [mode, setMode] = useState<"list" | "view" | "edit">(activeWorkPlanId ? "view" : "list");
  const [scheduleView, setScheduleView] = useState<ScheduleView>("table");
  const [summaryMode, setSummaryMode] = useState<WorkPlanSummaryMode>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [showFetchBOQModal, setShowFetchBOQModal] = useState(false);
  const [selectedBOQId, setSelectedBOQId] = useState("");

  const projectWorkPlans = savedWorkPlans.filter((w) => w.project_id === project?.id);
  const projectBOQs = savedBOQs.filter((b) => b.project_id === project?.id);
  const activeWpName = projectWorkPlans.find((w) => w.id === activeWorkPlanId)?.name || "Work Plan";
  const isConstruction = project?.type === "construction";

  // The work plan can pull activities from whatever item source the project type
  // uses: a saved BOQ (construction) or a saved Deliverables/Items list
  // (non-construction). Both expose { id, name } so the picker is uniform.
  const sourceLabel = labelsForType(project).nav.boqOrItems; // "BOQ" or "Deliverables"
  const projectSimpleItemSets = savedSimpleItemSets.filter((s) => s.project_id === project?.id);
  const sourceOptions: { id: string; name: string }[] = isConstruction
    ? projectBOQs.filter((b) => b.sheets.some((s) => s.rows.some((r) => r.type === "item" && r.description)))
    : projectSimpleItemSets.filter((s) => s.items.some((it) => it.description && it.description.trim()));
  const hasSourceItems = sourceOptions.length > 0;

  useEffect(() => {
    if (!showFetchBOQModal) return;
    if (!selectedBOQId && sourceOptions.length > 0) {
      setSelectedBOQId(sourceOptions[0].id);
    }
  }, [showFetchBOQModal, selectedBOQId, sourceOptions]);

  useEffect(() => {
    if (activeWorkPlanId && mode === "list") {
      setMode("edit");
    }
  }, [activeWorkPlanId]);

  const handleOpen = (id: string) => { openWorkPlan(id); setMode("view"); };
  const handleBack = () => { setMode("list"); };
  const handleEdit = () => { setMode("edit"); };
  const handleSave = () => { saveWorkPlan(); setMode("view"); };

  // Build an in-memory snapshot of the active work plan so that exports reflect
  // unsaved edits the user is currently looking at, not the last saved version.
  const buildLiveWorkPlanSnapshot = () => {
    if (!activeWorkPlanId) return null;
    const saved = projectWorkPlans.find((w) => w.id === activeWorkPlanId);
    return {
      id: activeWorkPlanId,
      project_id: project?.id || "",
      name: saved?.name || activeWpName,
      createdAt: saved?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sheets: workPlanSheets,
    };
  };

  if (mode === "list") {
    return (
      <div className="animate-fade-in">
        <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold tracking-tight text-txt">Work Plan</h2>
          <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
            <Plus size={14} /> New Work Plan
          </Button>
        </div>
        <WorkPlanListView onOpen={handleOpen} onCreateClick={() => setShowCreate(true)} />
        <CreateWorkPlanModal open={showCreate} onClose={() => setShowCreate(false)} />
      </div>
    );
  }

  const isViewMode = mode === "view";

  return (
    <div className="animate-fade-in">
      <div className="mb-4 rounded-2xl border border-border bg-bg-surface p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="ghost" onClick={handleBack}><ArrowLeft size={14} /> Back</Button>
              <span className="rounded-full border border-border bg-bg px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">
                {isViewMode ? "View Mode" : "Edit Mode"}
              </span>
            </div>
            <h2 className="mt-3 text-lg font-semibold tracking-tight text-txt">{activeWpName}</h2>
          </div>
          <div className="flex flex-col gap-3 xl:items-end">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-xl border border-border bg-bg p-1">
                {([
                  { id: "table" as ScheduleView, label: "Table", icon: Table2 },
                  { id: "gantt" as ScheduleView, label: "Gantt", icon: BarChart3 },
                ]).map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setScheduleView(item.id)}
                      className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors ${
                        scheduleView === item.id
                          ? "bg-bg-raised text-txt shadow-sm"
                          : "text-txt-muted hover:bg-bg-hover hover:text-txt"
                      }`}
                    >
                      <Icon size={13} />
                      {item.label}
                    </button>
                  );
                })}
              </div>
              <div className="flex rounded-xl border border-border bg-bg p-1">
                {([
                  { id: "all" as WorkPlanSummaryMode, label: "All rows" },
                  { id: "sections" as WorkPlanSummaryMode, label: "Section headers" },
                ]).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSummaryMode(item.id)}
                    className={`inline-flex h-8 items-center rounded-lg px-3 text-xs font-semibold transition-colors ${
                      summaryMode === item.id
                        ? "bg-bg-raised text-txt shadow-sm"
                        : "text-txt-muted hover:bg-bg-hover hover:text-txt"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <ExportMenu
                ganttHint={scheduleView === "gantt"}
                onPdf={() => {
                  const liveSnapshot = buildLiveWorkPlanSnapshot();
                  if (liveSnapshot) exportWorkPlanAsPdf(liveSnapshot, project, scheduleView);
                }}
                onExcel={() => {
                  const liveSnapshot = buildLiveWorkPlanSnapshot();
                  if (liveSnapshot) void exportWorkPlanAsExcel(liveSnapshot, project);
                }}
              />
              {isViewMode ? (
                <Button size="sm" variant="primary" onClick={handleEdit}><Pencil size={14} /> Edit</Button>
              ) : (
                <>
                  {hasSourceItems && (
                    <Button size="sm" onClick={() => setShowFetchBOQModal(true)}><RefreshCw size={14} /> Fetch from {sourceLabel}</Button>
                  )}
                  <Button size="sm" onClick={addActivity}><Plus size={14} /> Add Activity</Button>
                  <Button size="sm" variant="primary" onClick={handleSave}><Save size={14} /> Save</Button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {scheduleView === "table" ? (
        <WorkPlanTable readOnly={isViewMode} summaryMode={summaryMode} />
      ) : (
        <WorkPlanGanttView summaryMode={summaryMode} />
      )}
      {workPlanSheets.length > 0 && <WorkPlanSheetTabs readOnly={isViewMode} />}

      <Modal open={showFetchBOQModal} onClose={() => setShowFetchBOQModal(false)} title={`Fetch Activities from ${sourceLabel}`} width={520}>
        <div className="space-y-3">
          <label className="text-xs font-semibold text-txt-muted uppercase tracking-wider block">
            {sourceLabel} Source
          </label>
          <div className="relative">
            <select
              value={selectedBOQId}
              onChange={(e) => setSelectedBOQId(e.target.value)}
              className="w-full h-10 px-3 py-2 bg-bg-surface border border-border rounded-lg text-sm appearance-none outline-none focus:ring-2 focus:ring-accent/50 transition-all font-medium cursor-pointer"
            >
              <option value="" disabled>Select {sourceLabel}</option>
              {sourceOptions.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-txt-muted opacity-50">
              <ChevronRight size={14} className="rotate-90" />
            </div>
          </div>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row">
          <Button variant="ghost" className="flex-1 justify-center" onClick={() => setShowFetchBOQModal(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            className="flex-1 justify-center"
            disabled={!selectedBOQId}
            onClick={() => {
              fetchActivitiesFromBOQ(selectedBOQId);
              setShowFetchBOQModal(false);
            }}
          >
            <RefreshCw size={14} /> Fetch Activities
          </Button>
        </div>
      </Modal>
    </div>
  );
}
