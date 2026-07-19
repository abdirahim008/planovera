"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  FileSpreadsheet,
  FileText,
  ListChecks,
  Lock,
  Pencil,
  Plus,
  RotateCcw,
  Settings,
  Trash2,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import type { ProgressItem, ProgressReport, ProgressSheet } from "@/lib/supabase";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Badge from "@/components/ui/Badge";
import ContextMenu, { type ContextMenuItem } from "@/components/ui/ContextMenu";
import CompactKpiList from "@/components/ui/CompactKpiList";
import { exportProgressAsExcel, exportProgressAsPdf } from "@/lib/progress-export";

function toNumber(value: string | number | undefined | null) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  return parseFloat(String(value || "0").replace(/,/g, "")) || 0;
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function progressBarTone(actualPercent: number, plannedPercent?: number) {
  if (actualPercent >= 95) return "bg-ok";
  if (actualPercent <= 1) return "bg-warn";
  if (plannedPercent !== undefined && actualPercent + 1e-6 < plannedPercent) return "bg-err";
  return "bg-accent";
}

// Per-activity weight ratio (summing to 1 across the whole report). Custom
// weights come from the stored weightPercent; otherwise every activity gets an
// equal 1/N share. Keyed by item id.
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
// so a section reads as its own 0–100 % (and the whole report rolls up to the
// overall figure). Equal ratios collapse to a simple average.
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
    variance: actual - planned,
    completed: items.filter((item) => toNumber(item.actualPercent) >= 95).length,
    totalItems: items.length,
  };
}

function reportStats(report: ProgressReport) {
  return statsFor(report.sheets.flatMap((sheet) => sheet.items), computeRatios(report));
}

function ProgressSettingsModal({
  open,
  report,
  onClose,
}: {
  open: boolean;
  report: ProgressReport;
  onClose: () => void;
}) {
  const { updateProgressReport } = useAppStore();
  const [form, setForm] = useState({
    name: report.name,
    date: report.date,
    status: report.status,
  });

  useEffect(() => {
    setForm({ name: report.name, date: report.date, status: report.status });
  }, [report]);

  return (
    <Modal open={open} onClose={onClose} title="Progress Report Settings" width={480}>
      <div className="space-y-4">
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim mb-1.5">
            Report Name
          </label>
          <input
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            className="w-full px-3 py-2.5 bg-bg-input border border-border rounded-lg text-sm text-txt outline-none focus:border-accent transition-colors"
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim mb-1.5">
              Report Date
            </label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value }))}
              className="w-full px-3 py-2.5 bg-bg-input border border-border rounded-lg text-sm text-txt outline-none focus:border-accent transition-colors"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim mb-1.5">
              Status
            </label>
            <select
              value={form.status}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  status: e.target.value as ProgressReport["status"],
                }))
              }
              className="w-full px-3 py-2.5 bg-bg-input border border-border rounded-lg text-sm text-txt outline-none focus:border-accent transition-colors"
            >
              <option value="draft">Draft</option>
              <option value="submitted">Submitted</option>
              <option value="approved">Approved</option>
            </select>
          </div>
        </div>
      </div>
      <div className="mt-5 flex flex-col-reverse gap-3 border-t border-border pt-4 sm:flex-row">
        <Button variant="ghost" onClick={onClose} className="flex-1 justify-center">
          Cancel
        </Button>
        <Button
          variant="primary"
          className="flex-1 justify-center"
          onClick={() => {
            updateProgressReport(report.id, form);
            onClose();
          }}
        >
          Save Settings
        </Button>
      </div>
    </Modal>
  );
}

// ─── Weight ratio input: local text state, commits a 0–1 number on blur/Enter ──
// Keeps cascade-rebalancing off the keystroke path so other rows don't jump
// around mid-type.
function WeightInput({ value, onCommit }: { value: number; onCommit: (ratio: number) => void }) {
  const [text, setText] = useState(value.toFixed(3));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(value.toFixed(3));
  }, [value, focused]);

  const commit = () => {
    setFocused(false);
    const parsed = parseFloat(text);
    onCommit(Number.isFinite(parsed) ? parsed : value);
  };

  return (
    <input
      value={text}
      inputMode="decimal"
      onFocus={() => setFocused(true)}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      title="Weight ratio (0–1). Editing locks this activity and rebalances the rest."
      className="w-16 rounded-md border border-border bg-bg-input px-1.5 py-1 text-right font-mono text-[11px] text-txt outline-none focus:border-accent"
    />
  );
}

// ─── Single activity row: name + progress bar + % (editable in edit mode) ──────
function ProgressActivityRow({
  item,
  editMode,
  onChange,
  onDescriptionChange,
  showWeights,
  ratio,
  onWeightCommit,
  onContextMenu,
}: {
  item: ProgressItem;
  editMode: boolean;
  onChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  showWeights: boolean;
  ratio: number;
  onWeightCommit: (ratio: number) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  const actual = clampPercent(toNumber(item.actualPercent));
  const planned = toNumber(item.plannedPercent);
  return (
    <div className="flex items-center gap-3 px-3 py-1.5 transition-colors hover:bg-bg-hover" onContextMenu={onContextMenu}>
      {/* ID/# in its own narrow column at the far left */}
      <span className="w-6 shrink-0 text-right font-mono text-[10px] tabular-nums text-txt-dim">
        {item.billNo}
      </span>
      {/* Description — read-only text normally; an inline input in edit mode so
          the activity name can be corrected here without touching the work plan. */}
      {editMode ? (
        <input
          value={item.description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="Activity description"
          className="min-w-0 flex-1 rounded-md border border-border bg-bg-input px-2 py-1 text-[13px] text-txt outline-none focus:border-accent lg:max-w-[540px]"
        />
      ) : (
        <div className="min-w-0 flex-1 truncate text-[13px] text-txt lg:max-w-[540px]">
          {item.description || "Untitled activity"}
        </div>
      )}
      {showWeights && (
        <div className="ml-auto flex w-[88px] shrink-0 items-center justify-end gap-1">
          <WeightInput value={ratio} onCommit={onWeightCommit} />
          <Lock
            size={11}
            className={item.weightLocked ? "text-accent" : "text-transparent"}
            aria-label={item.weightLocked ? "Weight locked" : undefined}
          />
        </div>
      )}
      <div className={`flex w-[150px] items-center gap-2 sm:w-[230px] lg:w-auto lg:flex-1 ${showWeights ? "" : "ml-auto"}`}>
        {editMode ? (
          <>
            <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-bg">
              <div
                className={`h-full rounded-full ${progressBarTone(actual, planned)}`}
                style={{ width: `${actual}%` }}
              />
            </div>
            <div className="flex items-center gap-1">
              <input
                value={item.actualPercent}
                onChange={(e) => onChange(e.target.value)}
                inputMode="decimal"
                placeholder="0"
                className="w-14 rounded-md border border-border bg-bg-input px-2 py-1 text-right font-mono text-xs text-txt outline-none focus:border-accent"
              />
              <span className="text-xs text-txt-dim">%</span>
            </div>
          </>
        ) : (
          /* View mode: the % label rides the tip of the fill. The track stops
             46px short of the right edge so even a 100% fill leaves room for
             the label to sit fully past the bar without overlapping it. */
          <div className="relative h-4 min-w-0 flex-1">
            <div className="absolute left-0 right-[46px] top-1/2 h-2 -translate-y-1/2 overflow-hidden rounded-full bg-bg">
              <div
                className={`h-full rounded-full ${progressBarTone(actual, planned)}`}
                style={{ width: `${actual}%` }}
              />
            </div>
            <span
              className="absolute top-1/2 -translate-y-1/2 whitespace-nowrap pl-1.5 font-mono text-xs font-semibold tabular-nums text-txt"
              style={{ left: `calc((100% - 46px) * ${actual / 100})` }}
            >
              {actual.toFixed(0)}%
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Collapsible section with a rolled-up bar in its header ────────────────────
function ProgressSection({
  sheet,
  ratios,
  expanded,
  onToggle,
  editMode,
  showWeights,
  onItemChange,
  onItemDescriptionChange,
  onWeightCommit,
  onContextMenu,
  onRename,
  onAddRow,
}: {
  sheet: ProgressSheet;
  ratios: Map<string, number>;
  expanded: boolean;
  onToggle: () => void;
  editMode: boolean;
  showWeights: boolean;
  onItemChange: (sheetId: string, itemId: string, value: string) => void;
  onItemDescriptionChange: (sheetId: string, itemId: string, value: string) => void;
  onWeightCommit: (itemId: string, ratio: number) => void;
  onContextMenu: (e: React.MouseEvent, sheetId: string, itemId?: string) => void;
  onRename: (sheetId: string, name: string) => void;
  onAddRow: (sheetId: string) => void;
}) {
  const stats = statsFor(sheet.items, ratios);
  const actual = clampPercent(stats.actual);
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-bg-surface">
      {/* Header: right-click for add/delete section & rows. In edit mode the
          title becomes an inline input so sections can be renamed to match the
          work plan; the chevron stays a separate toggle. */}
      <div
        className="flex w-full items-center gap-3 bg-bg-hover px-3 py-2.5"
        onContextMenu={editMode ? (e) => onContextMenu(e, sheet.id) : undefined}
      >
        <button
          type="button"
          onClick={onToggle}
          className="shrink-0 text-txt-dim"
          aria-label={expanded ? "Collapse section" : "Expand section"}
        >
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
        {editMode ? (
          <input
            value={sheet.name}
            onChange={(e) => onRename(sheet.id, e.target.value)}
            placeholder="Section name"
            className="min-w-0 flex-1 rounded-md border border-border bg-bg-input px-2 py-1 text-sm font-bold uppercase tracking-[0.04em] text-txt outline-none focus:border-accent"
          />
        ) : (
          <button
            type="button"
            onClick={onToggle}
            className="min-w-0 flex-1 truncate text-left text-sm font-bold uppercase tracking-[0.04em] text-txt"
          >
            {sheet.name}
          </button>
        )}
        <span className="hidden text-[11px] text-txt-dim sm:inline">
          {stats.completed}/{sheet.items.length}
        </span>
        <div className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-bg sm:block">
          <div
            className={`h-full rounded-full ${progressBarTone(actual, stats.planned)}`}
            style={{ width: `${actual}%` }}
          />
        </div>
        <span className="w-11 text-right font-mono text-xs font-semibold tabular-nums text-txt">
          {actual.toFixed(0)}%
        </span>
      </div>
      {expanded && (
        <div className="divide-y divide-border/60 border-t border-border">
          {sheet.items.length === 0 ? (
            <div
              className="px-3 py-4 text-center text-[13px] text-txt-muted"
              onContextMenu={editMode ? (e) => onContextMenu(e, sheet.id) : undefined}
            >
              {editMode ? (
                <button
                  type="button"
                  onClick={() => onAddRow(sheet.id)}
                  className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-3 py-1.5 text-txt-muted transition hover:border-accent hover:text-txt"
                >
                  <Plus size={14} /> Add row
                </button>
              ) : (
                "No activities in this section."
              )}
            </div>
          ) : (
            sheet.items.map((item) => (
              <ProgressActivityRow
                key={item.id}
                item={item}
                editMode={editMode}
                onChange={(value) => onItemChange(sheet.id, item.id, value)}
                onDescriptionChange={(value) => onItemDescriptionChange(sheet.id, item.id, value)}
                showWeights={showWeights}
                ratio={ratios.get(item.id) || 0}
                onWeightCommit={(ratio) => onWeightCommit(item.id, ratio)}
                onContextMenu={editMode ? (e) => onContextMenu(e, sheet.id, item.id) : undefined}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── Export menu (PDF / Excel) ────────────────────────────────────
function ProgressExportMenu({
  onPdf,
  onExcel,
}: {
  onPdf: () => void;
  onExcel: () => void;
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
              <span className="block text-xs font-semibold text-txt">PDF report</span>
              <span className="mt-0.5 block text-[10px] leading-snug text-txt-dim">
                Landscape A4 — summary, sections, progress bars
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
                Summary sheet + one sheet per section with progress %
              </span>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

export default function ProgressModule() {
  const {
    project,
    savedBOQs,
    savedSimpleItemSets,
    savedWorkPlans,
    progressReports,
    createProgressReport,
    updateProgressItem,
    addProgressItem,
    deleteProgressItem,
    addProgressSection,
    deleteProgressSection,
    renameProgressSection,
    setProgressWeight,
    resetProgressWeights,
    deleteProgressReport,
    duplicateProgressReport,
  } = useAppStore();

  const [activeReportId, setActiveReportId] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; sheetId: string; itemId?: string } | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedSourceId, setSelectedSourceId] = useState("");
  const [selectedPrevId, setSelectedPrevId] = useState("");
  const [newReportName, setNewReportName] = useState("");
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [showWeights, setShowWeights] = useState(false);

  const projectReports = progressReports.filter((report) => report.project_id === project?.id);
  const isConstruction = project?.type === "construction";
  // Progress can be drawn from the priced bill (BOQ / item set) OR straight from
  // the Work Plan — the latter is the natural source for consultancy/design
  // projects that track deliverables and activities rather than quantities.
  const sourceOptions: Array<{ id: string; name: string; type: "boq" | "items" | "workplan" }> = [
    ...(isConstruction
      ? savedBOQs
          .filter((boq) => boq.project_id === project?.id && boq.sheets.some((sheet) => sheet.rows.some((row) => row.type === "item" && row.description)))
          .map((boq) => ({ id: boq.id, name: boq.name, type: "boq" as const }))
      : savedSimpleItemSets
          .filter((itemSet) => itemSet.project_id === project?.id && itemSet.items.some((item) => item.description))
          .map((itemSet) => ({ id: itemSet.id, name: itemSet.name, type: "items" as const }))),
    ...savedWorkPlans
      .filter((wp) => wp.project_id === project?.id && wp.sheets.some((sheet) => sheet.activities.some((a) => (a.rowType || "activity") !== "section" && a.description)))
      .map((wp) => ({ id: wp.id, name: `${wp.name} (Work Plan)`, type: "workplan" as const })),
  ];
  const selectedSource = sourceOptions.find((option) => option.id === selectedSourceId);
  const sourceType = selectedSource?.type ?? (isConstruction ? "boq" : "items");
  const activeReport = projectReports.find((report) => report.id === activeReportId) || null;

  useEffect(() => {
    if (!showCreate) return;
    if (!selectedSourceId && sourceOptions.length > 0) setSelectedSourceId(sourceOptions[0].id);
    if (!newReportName) setNewReportName(`Progress Report ${projectReports.length + 1}`);
  }, [showCreate, selectedSourceId, sourceOptions, newReportName, projectReports.length]);

  // Reset section expand state whenever the open report changes (default: all open).
  useEffect(() => {
    setCollapsedSections(new Set());
  }, [activeReportId]);

  // The weights panel is an edit-mode power tool — keep it hidden by default and
  // tuck it away again whenever editing stops.
  useEffect(() => {
    if (!isEditMode) setShowWeights(false);
  }, [isEditMode]);

  const summaryStats = useMemo(() => {
    const latestApproved = [...projectReports]
      .filter((report) => report.status === "approved")
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    const latestAny = [...projectReports].sort((a, b) => b.date.localeCompare(a.date))[0];
    const report = latestApproved || latestAny;
    return report ? reportStats(report) : null;
  }, [projectReports]);

  if (!activeReport) {
    const summaryCards = summaryStats
      ? [
          { label: "Planned", value: `${summaryStats.planned.toFixed(1)}%`, tone: "warn" as const },
          { label: "Actual", value: `${summaryStats.actual.toFixed(1)}%`, tone: "accent" as const },
          {
            label: "Variance",
            value: `${summaryStats.variance >= 0 ? "+" : ""}${summaryStats.variance.toFixed(1)}%`,
            tone: (summaryStats.variance >= 0 ? "ok" : "err") as "ok" | "err",
          },
        ]
      : [];

    return (
      <div className="animate-fade-in">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Progress</h2>
          <Button variant="primary" size="sm" onClick={() => setShowCreate(true)} disabled={!sourceOptions.length}>
            <Plus size={14} /> New Progress Report
          </Button>
        </div>

        {summaryStats && (
          <>
            <div className="mb-5 sm:hidden">
              <CompactKpiList rows={summaryCards.map((card) => ({ label: card.label, value: card.value, tone: card.tone }))} />
            </div>
            <div className="mb-5 hidden grid-cols-1 gap-3 sm:grid sm:grid-cols-3">
              {summaryCards.map((card) => {
                const toneText =
                  { accent: "text-accent", ok: "text-ok", warn: "text-warn", err: "text-err" }[card.tone] ?? "text-txt";
                const toneTop =
                  { accent: "border-t-accent", ok: "border-t-ok", warn: "border-t-warn", err: "border-t-err" }[card.tone] ??
                  "border-t-border";
                return (
                  <div
                    key={card.label}
                    className={`rounded-xl border border-border border-t-2 ${toneTop} bg-bg-surface p-4`}
                  >
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim mb-2">{card.label}</div>
                    <div className={`text-lg font-semibold ${toneText}`}>{card.value}</div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {!sourceOptions.length && projectReports.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-txt-muted text-sm font-medium">
              {isConstruction ? "Save a BOQ or Work Plan first" : "Save an item set or Work Plan first"}
            </p>
            <p className="mt-1 text-xs text-txt-dim">
              Progress activities are drawn from your {isConstruction ? "BOQ" : "item set"} or your Work Plan.
            </p>
          </div>
        ) : projectReports.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <p className="text-txt-muted text-sm font-medium">No progress reports yet</p>
            <Button variant="primary" size="md" className="mt-4" onClick={() => setShowCreate(true)} disabled={!sourceOptions.length || showCreate}>
              <Plus size={14} /> Create Report
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {projectReports.map((report, idx) => {
              const stats = reportStats(report);
              const actual = clampPercent(stats.actual);
              return (
                <div
                  key={report.id}
                  onClick={() => {
                    setActiveReportId(report.id);
                    setIsEditMode(false);
                  }}
                  className="group flex flex-col gap-3 rounded-lg border border-border bg-bg-surface p-4 cursor-pointer transition-all duration-200 hover:border-accent/50 sm:flex-row sm:items-center sm:justify-between"
                  style={{ animationDelay: `${idx * 60}ms`, animationFillMode: "both" }}
                >
                  <div className="flex min-w-0 items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-accent font-semibold font-mono text-sm">{report.number.toString().padStart(2, "0")}</span>
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-sm">{report.name}</span>
                        <Badge color={report.status === "approved" ? "ok" : report.status === "submitted" ? "accent" : "warn"}>
                          {report.status}
                        </Badge>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-2 text-[11px] text-txt-dim md:gap-3">
                        <span>{report.sourceName}</span>
                        <span>•</span>
                        <span>{report.date}</span>
                        <span>•</span>
                        <span>{stats.completed}/{stats.totalItems} complete</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-4 sm:justify-start">
                    <div className="flex items-center gap-3">
                      <div className="hidden h-2 w-28 overflow-hidden rounded-full bg-bg sm:block">
                        <div
                          className={`h-full rounded-full ${progressBarTone(actual, stats.planned)}`}
                          style={{ width: `${actual}%` }}
                        />
                      </div>
                      <div className="text-right">
                        <div className="text-[11px] font-semibold text-txt-dim uppercase tracking-[0.16em]">Actual</div>
                        <div className="font-mono text-sm font-semibold mt-0.5 text-accent">{actual.toFixed(0)}%</div>
                      </div>
                    </div>
                    <div className="flex gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          duplicateProgressReport(report.id);
                        }}
                        className="p-1.5 rounded-md bg-transparent border-none text-txt-dim hover:text-accent hover:bg-accent/10 cursor-pointer transition-colors"
                        title="Duplicate"
                      >
                        <Copy size={14} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteProgressReport(report.id);
                          if (activeReportId === report.id) setActiveReportId(null);
                        }}
                        className="p-1.5 rounded-md bg-transparent border-none text-txt-dim hover:text-err hover:bg-err/10 cursor-pointer transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <ChevronRight size={16} className="text-txt-dim group-hover:text-accent transition-colors" />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Progress Report" width={540}>
          <div className="space-y-4">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim mb-1.5">
                Report Name
              </label>
              <input
                value={newReportName}
                onChange={(e) => setNewReportName(e.target.value)}
                className="w-full px-3 py-2.5 bg-bg-input border border-border rounded-lg text-sm text-txt outline-none focus:border-accent transition-colors"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim mb-1.5">
                Source
              </label>
              <select
                value={selectedSourceId}
                onChange={(e) => setSelectedSourceId(e.target.value)}
                className="w-full px-3 py-2.5 bg-bg-input border border-border rounded-lg text-sm text-txt outline-none focus:border-accent transition-colors"
              >
                {sourceOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-start gap-2.5 rounded-xl border border-border bg-bg-input/60 p-3 text-xs leading-5 text-txt-muted">
              <ListChecks size={16} className="mt-0.5 shrink-0 text-accent" />
              <span>
                Activities are pulled from the source you pick above ({isConstruction ? "BOQ" : "item set"} or Work Plan).
                You just set each activity&apos;s <strong className="text-txt">% complete</strong> — the overall and section
                progress update automatically. Work-plan activities already marked complete start at 100%.
              </span>
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim mb-1.5">
                Carry Forward Previous Report
              </label>
              <select
                value={selectedPrevId}
                onChange={(e) => setSelectedPrevId(e.target.value)}
                className="w-full px-3 py-2.5 bg-bg-input border border-border rounded-lg text-sm text-txt outline-none focus:border-accent transition-colors"
              >
                <option value="">None</option>
                {projectReports
                  .filter((report) => report.sourceId === selectedSourceId)
                  .sort((a, b) => b.number - a.number)
                  .map((report) => (
                    <option key={report.id} value={report.id}>
                      {report.name} • {report.date}
                    </option>
                  ))}
              </select>
            </div>
          </div>
          <div className="mt-5 flex flex-col-reverse gap-3 border-t border-border pt-4 sm:flex-row">
            <Button variant="ghost" onClick={() => setShowCreate(false)} className="flex-1 justify-center">
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                createProgressReport(
                  newReportName || `Progress Report ${projectReports.length + 1}`,
                  sourceType,
                  selectedSourceId,
                  selectedPrevId || null
                );
                setShowCreate(false);
                setSelectedPrevId("");
                setTimeout(() => {
                  const latest = useAppStore
                    .getState()
                    .progressReports.filter((report) => report.project_id === project?.id)
                    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
                  if (latest) {
                    setActiveReportId(latest.id);
                    setIsEditMode(true);
                  }
                }, 10);
              }}
              disabled={!selectedSourceId}
              className="flex-1 justify-center"
            >
              Create Report
            </Button>
          </div>
        </Modal>
      </div>
    );
  }

  const ratios = computeRatios(activeReport);
  const stats = statsFor(activeReport.sheets.flatMap((sheet) => sheet.items), ratios);
  const overallActual = clampPercent(stats.actual);
  const weightTotal = Array.from(ratios.values()).reduce((sum, value) => sum + value, 0);
  const allExpanded = activeReport.sheets.every((sheet) => !collapsedSections.has(sheet.id));

  const toggleSection = (sheetId: string) =>
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sheetId)) next.delete(sheetId);
      else next.add(sheetId);
      return next;
    });

  const toggleAllSections = () =>
    setCollapsedSections(allExpanded ? new Set(activeReport.sheets.map((sheet) => sheet.id)) : new Set());

  // Right-click menu on a row (itemId set) or a section header (itemId absent),
  // so a report can be harmonized with the work plan by hand.
  const buildCtxItems = (ctx: { sheetId: string; itemId?: string }): ContextMenuItem[] => {
    const reportId = activeReport.id;
    if (ctx.itemId) {
      return [
        { label: "Add row above", icon: <Plus size={14} />, action: () => addProgressItem(reportId, ctx.sheetId, ctx.itemId, "above") },
        { label: "Add row below", icon: <Plus size={14} />, action: () => addProgressItem(reportId, ctx.sheetId, ctx.itemId, "below") },
        { divider: true },
        { label: "Add section below", icon: <Plus size={14} />, action: () => addProgressSection(reportId, ctx.sheetId) },
        { divider: true },
        { label: "Delete row", icon: <Trash2 size={14} />, danger: true, action: () => deleteProgressItem(reportId, ctx.sheetId, ctx.itemId!) },
      ];
    }
    return [
      { label: "Add row", icon: <Plus size={14} />, action: () => addProgressItem(reportId, ctx.sheetId) },
      { label: "Add section below", icon: <Plus size={14} />, action: () => addProgressSection(reportId, ctx.sheetId) },
      { divider: true },
      { label: "Delete section", icon: <Trash2 size={14} />, danger: true, action: () => deleteProgressSection(reportId, ctx.sheetId) },
    ];
  };

  return (
    <div className="animate-fade-in">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" variant="ghost" onClick={() => { setActiveReportId(null); setIsEditMode(false); }}>
            <ArrowLeft size={14} /> Back
          </Button>
          <div className="h-5 w-px bg-border" />
          <div>
            <h2 className="text-lg font-semibold">{activeReport.name}</h2>
            <p className="text-xs text-txt-muted mt-0.5">
              {activeReport.sourceName} • {activeReport.date}
            </p>
          </div>
          <Badge color={activeReport.status === "approved" ? "ok" : activeReport.status === "submitted" ? "accent" : "warn"}>
            {activeReport.status}
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="default" onClick={() => setShowSettings(true)}>
            <Settings size={14} /> Settings
          </Button>
          <ProgressExportMenu
            onPdf={() => exportProgressAsPdf(activeReport, project)}
            onExcel={() => void exportProgressAsExcel(activeReport, project)}
          />
          {isEditMode ? (
            <Button size="sm" variant="primary" onClick={() => setIsEditMode(false)}>
              Done
            </Button>
          ) : (
            <Button size="sm" variant="primary" onClick={() => setIsEditMode(true)}>
              <Pencil size={14} /> Update progress
            </Button>
          )}
        </div>
      </div>

      {/* Overall progress header */}
      <div className="mb-4 rounded-2xl border border-border bg-bg-surface p-4 sm:p-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">Overall progress</div>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-3xl font-bold tabular-nums text-txt">{overallActual.toFixed(0)}</span>
              <span className="text-lg font-semibold text-txt-muted">%</span>
            </div>
          </div>
          <div className="text-right text-[11px] text-txt-dim">
            {stats.completed}/{stats.totalItems} activities complete
          </div>
        </div>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-bg">
          <div
            className={`h-full rounded-full transition-all ${progressBarTone(overallActual, stats.planned)}`}
            style={{ width: `${overallActual}%` }}
          />
        </div>
        {stats.planned > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-txt-muted">
            <span>
              Planned <strong className="text-txt">{stats.planned.toFixed(1)}%</strong>
            </span>
            <span className={stats.variance >= 0 ? "text-ok" : "text-err"}>
              Variance {stats.variance >= 0 ? "+" : ""}{stats.variance.toFixed(1)}%
            </span>
          </div>
        )}
      </div>

      {activeReport.sheets.length === 0 ? (
        <div className="rounded-2xl border border-border bg-bg-surface p-8 text-center text-sm text-txt-muted">
          No progress sections yet.
        </div>
      ) : (
        <>
          {(isEditMode || activeReport.sheets.length > 1) && (
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              {isEditMode ? (
                <label className="inline-flex cursor-pointer items-center gap-2 text-[11px] font-medium text-txt-muted">
                  <input
                    type="checkbox"
                    checked={showWeights}
                    onChange={(e) => setShowWeights(e.target.checked)}
                    className="accent-accent"
                  />
                  Show activity weights
                </label>
              ) : (
                <span />
              )}
              {activeReport.sheets.length > 1 && (
                <button
                  type="button"
                  onClick={toggleAllSections}
                  className="text-[11px] font-medium text-txt-muted transition hover:text-txt"
                >
                  {allExpanded ? "Collapse all" : "Expand all"}
                </button>
              )}
            </div>
          )}
          {isEditMode && showWeights && (
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-bg-surface px-3 py-2">
              <span className="text-[11px] text-txt-muted">
                Activity weights total{" "}
                <strong className={Math.abs(weightTotal - 1) < 0.005 ? "text-ok" : "text-warn"}>
                  {weightTotal.toFixed(3)}
                </strong>{" "}
                of 1.000 — editing a ratio locks it; the rest rebalance.
              </span>
              <button
                type="button"
                onClick={() => resetProgressWeights(activeReport.id)}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-accent transition hover:underline"
              >
                <RotateCcw size={12} /> Reset to equal
              </button>
            </div>
          )}
          <div className="flex flex-col gap-2.5">
            {activeReport.sheets.map((sheet) => (
              <ProgressSection
                key={sheet.id}
                sheet={sheet}
                ratios={ratios}
                expanded={!collapsedSections.has(sheet.id)}
                onToggle={() => toggleSection(sheet.id)}
                editMode={isEditMode}
                showWeights={isEditMode && showWeights}
                onItemChange={(sheetId, itemId, value) =>
                  updateProgressItem(activeReport.id, sheetId, itemId, "actualPercent", value)
                }
                onItemDescriptionChange={(sheetId, itemId, value) =>
                  updateProgressItem(activeReport.id, sheetId, itemId, "description", value)
                }
                onWeightCommit={(itemId, ratio) => setProgressWeight(activeReport.id, itemId, ratio)}
                onContextMenu={(e, sheetId, itemId) => {
                  e.preventDefault();
                  setCtxMenu({ x: e.clientX, y: e.clientY, sheetId, itemId });
                }}
                onRename={(sheetId, name) => renameProgressSection(activeReport.id, sheetId, name)}
                onAddRow={(sheetId) => addProgressItem(activeReport.id, sheetId)}
              />
            ))}
            {isEditMode && (
              <button
                type="button"
                onClick={() => addProgressSection(activeReport.id, activeReport.sheets.at(-1)?.id ?? null)}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-border px-3 py-2.5 text-[13px] font-medium text-txt-muted transition hover:border-accent hover:text-txt"
              >
                <Plus size={15} /> Add section
              </button>
            )}
          </div>
        </>
      )}

      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={buildCtxItems(ctxMenu)}
          onClose={() => setCtxMenu(null)}
        />
      )}

      {showSettings && <ProgressSettingsModal open={showSettings} report={activeReport} onClose={() => setShowSettings(false)} />}
    </div>
  );
}
