"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  BarChart3,
  ChevronRight,
  Columns3,
  Copy,
  Download,
  FileSpreadsheet,
  FileText,
  Grid3X3,
  Pencil,
  Plus,
  Settings,
  Trash2,
} from "lucide-react";
import { useAppStore, currency } from "@/lib/store";
import type { ProgressItem, ProgressReport } from "@/lib/supabase";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Badge from "@/components/ui/Badge";
import CompactKpiList from "@/components/ui/CompactKpiList";
import { exportProgressAsExcel, exportProgressAsPdf } from "@/lib/progress-export";

type ProgressViewMode = "table" | "visual";
type ProgressVisualRowMode = "all" | "sections";

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

function reportMetrics(report: ProgressReport) {
  const items = report.sheets.flatMap((sheet) => sheet.items);
  const planned = items.reduce(
    (sum, item) => sum + (toNumber(item.weightPercent) * toNumber(item.plannedPercent)) / 100,
    0
  );
  const actual = items.reduce(
    (sum, item) => sum + (toNumber(item.weightPercent) * toNumber(item.actualPercent)) / 100,
    0
  );
  const earned = items.reduce((sum, item) => sum + toNumber(item.earnedAmount), 0);
  const completed = items.filter((item) => toNumber(item.actualPercent) >= 95).length;
  return {
    planned,
    actual,
    variance: actual - planned,
    earned,
    completed,
    totalItems: items.length,
  };
}

type ProgressInputMode = NonNullable<ProgressReport["inputMode"]>;
type ProgressColumnKey =
  | "billNo"
  | "description"
  | "unit"
  | "boqQty"
  | "boqRate"
  | "boqAmount"
  | "previousQty"
  | "currentQty"
  | "totalQty"
  | "weightSource"
  | "weightPercent"
  | "plannedPercent"
  | "actualPercent"
  | "weightedContribution"
  | "earnedAmount"
  | "variancePercent";

const columnLabels: Record<ProgressColumnKey, string> = {
  billNo: "Bill No.",
  description: "Activity",
  unit: "Unit",
  boqQty: "BOQ Qty",
  boqRate: "Rate",
  boqAmount: "BOQ Amount",
  previousQty: "Previous Qty",
  currentQty: "Current Qty Done",
  totalQty: "Total Qty",
  weightSource: "Weight Source",
  weightPercent: "Weight %",
  plannedPercent: "Planned %",
  actualPercent: "Actual % Done",
  weightedContribution: "Weighted Contribution",
  earnedAmount: "Earned Amount",
  variancePercent: "Variance %",
};

const quantityCoreColumns: ProgressColumnKey[] = [
  "description",
  "currentQty",
  "actualPercent",
];

const percentCoreColumns: ProgressColumnKey[] = [
  "description",
  "actualPercent",
];

const quantityColumnOrder: ProgressColumnKey[] = [
  "billNo",
  "description",
  "unit",
  "boqQty",
  "boqRate",
  "boqAmount",
  "previousQty",
  "currentQty",
  "totalQty",
  "weightPercent",
  "plannedPercent",
  "actualPercent",
  "earnedAmount",
  "variancePercent",
];

const percentColumnOrder: ProgressColumnKey[] = [
  "billNo",
  "description",
  "weightSource",
  "weightPercent",
  "boqAmount",
  "plannedPercent",
  "actualPercent",
  "weightedContribution",
  "variancePercent",
];

const progressColumnPresets: Record<
  ProgressInputMode,
  Record<"simple" | "detailed" | "quantity" | "commercial", ProgressColumnKey[]>
> = {
  quantity: {
    simple: [
      "description",
      "unit",
      "boqQty",
      "previousQty",
      "currentQty",
      "totalQty",
      "plannedPercent",
      "actualPercent",
    ],
    detailed: quantityColumnOrder,
    quantity: [
      "billNo",
      "description",
      "unit",
      "boqQty",
      "previousQty",
      "currentQty",
      "totalQty",
      "plannedPercent",
      "actualPercent",
    ],
    commercial: [
      "description",
      "boqRate",
      "boqAmount",
      "weightPercent",
      "earnedAmount",
      "variancePercent",
    ],
  },
  percent: {
    simple: ["description", "plannedPercent", "actualPercent"],
    detailed: percentColumnOrder,
    quantity: ["description", "plannedPercent", "actualPercent", "variancePercent"],
    commercial: [
      "description",
      "weightSource",
      "weightPercent",
      "boqAmount",
      "weightedContribution",
      "variancePercent",
    ],
  },
};

const getProgressMode = (report: ProgressReport): ProgressInputMode => report.inputMode || "quantity";

const getWeightMode = (report: ProgressReport): NonNullable<ProgressReport["weightMode"]> =>
  report.weightMode || (report.sourceType === "boq" ? "boq-amount" : "equal");

const getWeightBadge = (report: ProgressReport) => {
  const weightMode = getWeightMode(report);
  if (weightMode === "boq-amount") return "Weights from BOQ amounts";
  if (weightMode === "custom") return "Custom weights";
  return "Equal weights";
};

const orderedColumns = (mode: ProgressInputMode, selected: ProgressColumnKey[]) => {
  const order = mode === "percent" ? percentColumnOrder : quantityColumnOrder;
  return order.filter((column) => selected.includes(column));
};

const ensureCoreColumns = (mode: ProgressInputMode, selected: ProgressColumnKey[]) => {
  const core = mode === "percent" ? percentCoreColumns : quantityCoreColumns;
  return Array.from(new Set([...selected, ...core]));
};

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

function ProgressVisualRows({
  rows,
}: {
  rows: Array<{
    id: string;
    itemNo: string;
    description: string;
    progress: number;
    planned?: number;
  }>;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-bg-surface p-6 text-center text-[13px] text-txt-muted">
        No progress rows to display.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-bg-surface">
      <div className="hidden grid-cols-[64px_minmax(220px,1fr)_minmax(220px,38%)] border-b border-border bg-bg-raised/60 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-txt-dim md:grid">
        <div>#</div>
        <div>Activity</div>
        <div>Progress</div>
      </div>
      <div className="divide-y divide-border/60">
        {rows.map((row, index) => {
          const progress = clampPercent(row.progress);
          return (
            <div
              key={row.id}
              className="grid gap-2 px-3 py-1.5 transition-colors hover:bg-bg-hover md:grid-cols-[64px_minmax(220px,1fr)_minmax(220px,38%)] md:items-center"
            >
              <div className="flex items-center justify-between gap-3 md:block">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-txt-dim md:hidden">
                  #
                </span>
                <span className="font-mono text-[12px] text-txt-muted">
                  {row.itemNo || String(index + 1)}
                </span>
              </div>
              <div className="min-w-0 truncate text-[13px] text-txt">
                {row.description || "Untitled activity"}
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-black/25">
                  <div
                    className={`h-full rounded-full ${progressBarTone(progress, row.planned)}`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="w-11 text-right font-mono text-[12px] font-semibold text-white tabular-nums">
                  {progress.toFixed(0)}%
                </div>
              </div>
            </div>
          );
        })}
      </div>
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
              <span className="block text-xs font-semibold text-txt">PDF (current view)</span>
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
                Summary sheet + one sheet per section, with live formulas
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
    progressReports,
    createProgressReport,
    updateProgressReport,
    updateProgressItem,
    deleteProgressReport,
    duplicateProgressReport,
  } = useAppStore();

  const [activeReportId, setActiveReportId] = useState<string | null>(null);
  const [activeSheetIdx, setActiveSheetIdx] = useState(-1);
  const [showCreate, setShowCreate] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedSourceId, setSelectedSourceId] = useState("");
  const [selectedPrevId, setSelectedPrevId] = useState("");
  const [newReportName, setNewReportName] = useState("");
  const [newReportInputMode, setNewReportInputMode] = useState<ProgressInputMode>("quantity");
  const [showColumns, setShowColumns] = useState(false);
  const [showMetricsSummary, setShowMetricsSummary] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<ProgressColumnKey[]>(
    progressColumnPresets.quantity.simple
  );
  const [columnDraft, setColumnDraft] = useState<ProgressColumnKey[]>(progressColumnPresets.quantity.simple);
  const [progressViewMode, setProgressViewMode] = useState<ProgressViewMode>("table");
  const [visualRowMode, setVisualRowMode] = useState<ProgressVisualRowMode>("all");

  const projectReports = progressReports.filter((report) => report.project_id === project?.id);
  const isConstruction = project?.type === "construction";
  const sourceType = isConstruction ? "boq" : "items";
  const sourceOptions = isConstruction
    ? savedBOQs.filter((boq) => boq.project_id === project?.id && boq.sheets.some((sheet) => sheet.rows.some((row) => row.type === "item" && row.description)))
    : savedSimpleItemSets.filter((itemSet) => itemSet.project_id === project?.id && itemSet.items.some((item) => item.description));
  const activeReport = projectReports.find((report) => report.id === activeReportId) || null;
  const activeInputMode = activeReport ? getProgressMode(activeReport) : "quantity";
  const activeColumnOrder = activeInputMode === "percent" ? percentColumnOrder : quantityColumnOrder;
  const lockedColumns = activeInputMode === "percent" ? percentCoreColumns : quantityCoreColumns;
  const displayColumns = orderedColumns(activeInputMode, ensureCoreColumns(activeInputMode, visibleColumns));

  useEffect(() => {
    if (!showCreate) return;
    if (!selectedSourceId && sourceOptions.length > 0) setSelectedSourceId(sourceOptions[0].id);
    if (!newReportName) setNewReportName(`Progress Report ${projectReports.length + 1}`);
  }, [showCreate, selectedSourceId, sourceOptions, newReportName, projectReports.length]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("planovera-progress-columns");
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<Record<ProgressInputMode, ProgressColumnKey[]>>;
      const saved = parsed.quantity || progressColumnPresets.quantity.simple;
      setVisibleColumns(ensureCoreColumns("quantity", saved));
      setColumnDraft(ensureCoreColumns("quantity", saved));
    } catch {
      setVisibleColumns(progressColumnPresets.quantity.simple);
      setColumnDraft(progressColumnPresets.quantity.simple);
    }
  }, []);

  useEffect(() => {
    if (!activeReport) return;
    try {
      const raw = window.localStorage.getItem("planovera-progress-columns");
      const parsed = raw ? (JSON.parse(raw) as Partial<Record<ProgressInputMode, ProgressColumnKey[]>>) : {};
      const saved = parsed[activeInputMode] || progressColumnPresets[activeInputMode].simple;
      const next = ensureCoreColumns(activeInputMode, saved);
      setVisibleColumns(next);
      setColumnDraft(next);
    } catch {
      const next = progressColumnPresets[activeInputMode].simple;
      setVisibleColumns(next);
      setColumnDraft(next);
    }
  }, [activeReport?.id, activeInputMode]);

  const saveColumns = (mode: ProgressInputMode, columns: ProgressColumnKey[]) => {
    const next = ensureCoreColumns(mode, columns);
    setVisibleColumns(next);
    setColumnDraft(next);
    try {
      const raw = window.localStorage.getItem("planovera-progress-columns");
      const parsed = raw ? (JSON.parse(raw) as Partial<Record<ProgressInputMode, ProgressColumnKey[]>>) : {};
      window.localStorage.setItem("planovera-progress-columns", JSON.stringify({ ...parsed, [mode]: next }));
    } catch {
      // Column preferences are convenience-only; failures should never block progress editing.
    }
  };

  const summaryMetrics = useMemo(() => {
    const latestApproved = [...projectReports]
      .filter((report) => report.status === "approved")
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    const latestAny = [...projectReports].sort((a, b) => b.date.localeCompare(a.date))[0];
    const report = latestApproved || latestAny;
    return report ? reportMetrics(report) : null;
  }, [projectReports]);

  if (!activeReport) {
    return (
      <div className="animate-fade-in">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Progress</h2>
          <Button variant="primary" size="sm" onClick={() => setShowCreate(true)} disabled={!sourceOptions.length}>
            <Plus size={14} /> New Progress Report
          </Button>
        </div>

        {summaryMetrics && (
          <>
            <div className="mb-5 sm:hidden">
              <CompactKpiList
                rows={[
                  { label: "Planned", value: `${summaryMetrics.planned.toFixed(1)}%`, tone: "warn" },
                  { label: "Actual", value: `${summaryMetrics.actual.toFixed(1)}%`, tone: "accent" },
                  { label: "Variance", value: `${summaryMetrics.variance.toFixed(1)}%`, tone: summaryMetrics.variance >= 0 ? "ok" : "err" },
                  { label: "Earned Value", value: `${project?.currency || "USD"} ${currency(summaryMetrics.earned)}`, tone: "ok" },
                ]}
              />
            </div>
            <div className="mb-5 hidden grid-cols-1 gap-3 sm:grid sm:grid-cols-2 xl:grid-cols-4">
              {[
                { label: "Planned", value: `${summaryMetrics.planned.toFixed(1)}%`, tone: "warn" },
                { label: "Actual", value: `${summaryMetrics.actual.toFixed(1)}%`, tone: "accent" },
                { label: "Variance", value: `${summaryMetrics.variance.toFixed(1)}%`, tone: summaryMetrics.variance >= 0 ? "ok" : "err" },
                { label: "Earned Value", value: `${project?.currency || "USD"} ${currency(summaryMetrics.earned)}`, tone: "ok" },
              ].map((card) => (
                <div key={card.label} className="bg-bg-surface border border-border rounded-xl p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim mb-2">{card.label}</div>
                  <div className="text-lg font-semibold">{card.value}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {projectReports.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <p className="text-txt-muted text-sm font-medium">No progress reports yet</p>
            <Button variant="primary" size="md" className="mt-4" onClick={() => setShowCreate(true)} disabled={!sourceOptions.length || showCreate}>
              <Plus size={14} /> Create Report
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {projectReports.map((report, idx) => {
              const metrics = reportMetrics(report);
              return (
                <div
                  key={report.id}
                  onClick={() => {
                    setActiveReportId(report.id);
                    setActiveSheetIdx(-1);
                    setIsEditMode(false);
                  }}
                  className="group flex flex-col gap-3 rounded-lg border border-border bg-bg-surface p-4 cursor-pointer transition-all duration-200 hover:border-accent/50 sm:flex-row sm:items-center sm:justify-between"
                  style={{ animationDelay: `${idx * 60}ms`, animationFillMode: "both" }}
                >
                  <div className="flex min-w-0 items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-accent font-semibold font-mono text-sm">{report.number.toString().padStart(2, "0")}</span>
                    </div>
                    <div>
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
                        <span>{metrics.actual.toFixed(1)}% actual</span>
                        <span>•</span>
                        <span>{metrics.completed}/{metrics.totalItems} complete</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-4 sm:justify-start">
                    <div className="text-right">
                      <div className="text-[11px] font-semibold text-txt-dim uppercase tracking-[0.16em]">Earned</div>
                      <div className="font-mono text-sm font-semibold mt-0.5 text-ok">
                        {project?.currency || "USD"} {currency(metrics.earned)}
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
                Source {isConstruction ? "BOQ" : "Item Set"}
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
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim mb-1.5">
                Progress Input
              </label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {[
                  {
                    value: "quantity" as ProgressInputMode,
                    title: "Quantity done",
                    body: "Site team enters current quantity. Actual progress is calculated from BOQ quantity.",
                  },
                  {
                    value: "percent" as ProgressInputMode,
                    title: "Manual % done",
                    body: "Site team enters actual percentage directly. BOQ amount still controls weighting.",
                  },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setNewReportInputMode(option.value)}
                    className={`rounded-xl border p-3 text-left transition-colors ${
                      newReportInputMode === option.value
                        ? "border-accent bg-accent/10 text-txt"
                        : "border-border bg-bg-input text-txt-muted hover:border-accent/50"
                    }`}
                  >
                    <span className="block text-sm font-semibold">{option.title}</span>
                    <span className="mt-1 block text-xs leading-5">{option.body}</span>
                  </button>
                ))}
              </div>
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
                  selectedPrevId || null,
                  newReportInputMode
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
                    setActiveSheetIdx(-1);
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

  const metrics = reportMetrics(activeReport);
  const weightMode = getWeightMode(activeReport);
  const canUseCustomWeights = activeReport.sourceType !== "boq";
  const visualRows =
    visualRowMode === "sections"
      ? activeReport.sheets.map((sheet, index) => {
          const sheetReport: ProgressReport = { ...activeReport, sheets: [sheet] };
          const sheetMetrics = reportMetrics(sheetReport);
          return {
            id: sheet.id,
            itemNo: String(index + 1),
            description: sheet.name,
            progress: sheetMetrics.actual,
          };
        })
      : (activeReport.sheets[activeSheetIdx]?.items || []).map((item, index) => ({
          id: item.id,
          itemNo: item.billNo || String(index + 1),
          description: item.description,
          progress: toNumber(item.actualPercent),
          planned: toNumber(item.plannedPercent),
        }));

  const renderProgressCell = (item: ProgressItem, column: ProgressColumnKey) => {
    const sheetId = activeReport.sheets[activeSheetIdx].id;
    const updateItem = (key: keyof ProgressItem, value: string) =>
      updateProgressItem(activeReport.id, sheetId, item.id, key, value);
    const weightedContribution = (toNumber(item.weightPercent) * toNumber(item.actualPercent)) / 100;

    if (column === "description") {
      return <td className="data-cell-wrap min-w-[260px]">{item.description}</td>;
    }
    if (column === "billNo") {
      return <td className="font-mono text-txt-muted">{item.billNo || "-"}</td>;
    }
    if (column === "unit") {
      return <td className="text-center uppercase text-txt-dim">{item.unit || "-"}</td>;
    }
    if (column === "boqQty") {
      return <td className="data-cell-num bg-bg/25 text-txt-muted">{item.boqQty}</td>;
    }
    if (column === "boqRate") {
      return (
        <td className="data-cell-num bg-bg/25 text-txt-muted">
          {currency(toNumber(item.boqRate))}
        </td>
      );
    }
    if (column === "boqAmount") {
      return (
        <td className="data-cell-num bg-bg/25 text-txt-muted">
          {project?.currency || "USD"} {currency(toNumber(item.boqAmount))}
        </td>
      );
    }
    if (column === "previousQty") {
      return <td className="data-cell-num bg-bg/25 text-txt-muted">{item.previousQty}</td>;
    }
    if (column === "currentQty") {
      return (
        <td className="data-cell-num">
          {isEditMode ? (
            <input
              value={item.currentQty}
              onChange={(e) => updateItem("currentQty", e.target.value)}
              className="data-cell-input text-right font-mono"
            />
          ) : (
            item.currentQty
          )}
        </td>
      );
    }
    if (column === "totalQty") {
      return <td className="data-cell-num bg-bg/25 font-semibold text-txt">{item.totalQty}</td>;
    }
    if (column === "weightSource") {
      return <td className="bg-bg/25 text-txt-muted">{getWeightBadge(activeReport)}</td>;
    }
    if (column === "weightPercent") {
      return (
        <td className="data-cell-num bg-bg/25 text-txt-muted">
          {isEditMode && weightMode === "custom" ? (
            <input
              value={item.weightPercent}
              onChange={(e) => updateItem("weightPercent", e.target.value)}
              className="data-cell-input text-right font-mono"
            />
          ) : (
            `${item.weightPercent}%`
          )}
        </td>
      );
    }
    if (column === "plannedPercent") {
      return (
        <td className="data-cell-num">
          {isEditMode ? (
            <input
              value={item.plannedPercent}
              onChange={(e) => updateItem("plannedPercent", e.target.value)}
              className="data-cell-input text-right font-mono"
            />
          ) : (
            `${item.plannedPercent}%`
          )}
        </td>
      );
    }
    if (column === "actualPercent") {
      return (
        <td className="data-cell-num bg-bg/25 font-semibold">
          {isEditMode && activeInputMode === "percent" ? (
            <input
              value={item.actualPercent}
              onChange={(e) => updateItem("actualPercent", e.target.value)}
              className="data-cell-input text-right font-mono"
            />
          ) : (
            `${item.actualPercent}%`
          )}
        </td>
      );
    }
    if (column === "weightedContribution") {
      return <td className="data-cell-num bg-bg/25 font-semibold">{weightedContribution.toFixed(2)}%</td>;
    }
    if (column === "earnedAmount") {
      return (
        <td className="data-cell-num bg-bg/25 font-semibold text-ok">
          {project?.currency || "USD"} {currency(toNumber(item.earnedAmount))}
        </td>
      );
    }
    if (column === "variancePercent") {
      return (
        <td className={`data-cell-num ${toNumber(item.variancePercent) >= 0 ? "text-ok" : "text-err"}`}>
          {item.variancePercent}%
        </td>
      );
    }
    // Any unrecognized column renders an empty cell defensively.
    return <td className="text-txt-dim">—</td>;
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
        <div className="relative flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="default"
            onClick={() => setShowMetricsSummary((prev) => !prev)}
          >
            <BarChart3 size={14} /> Summary
          </Button>
          {showMetricsSummary && (
            <div className="absolute right-0 top-11 z-50 w-[min(92vw,440px)] rounded-2xl border border-border bg-bg-surface p-3 shadow-xl shadow-black/30">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">
                    Progress summary
                  </div>
                  <div className="mt-1 text-xs text-txt-muted">
                    {metrics.completed}/{metrics.totalItems} items complete
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowMetricsSummary(false)}
                  className="rounded-lg border border-border px-2 py-1 text-xs font-medium text-txt-muted transition hover:text-txt"
                >
                  Close
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Planned", value: `${metrics.planned.toFixed(1)}%`, tone: "text-warn" },
                  { label: "Actual", value: `${metrics.actual.toFixed(1)}%`, tone: "text-accent" },
                  { label: "Variance", value: `${metrics.variance.toFixed(1)}%`, tone: metrics.variance >= 0 ? "text-ok" : "text-err" },
                  { label: "Earned", value: `${project?.currency || "USD"} ${currency(metrics.earned)}`, tone: "text-ok" },
                ].map((item) => (
                  <div key={item.label} className="rounded-xl border border-border bg-bg-raised/50 p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">{item.label}</div>
                    <div className={`mt-1 text-sm font-semibold ${item.tone}`}>{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
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
              <Pencil size={14} /> Edit
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 mb-3 border-b border-border overflow-x-auto">
        <button
          className={`px-4 py-2 text-xs font-medium border-b-2 transition-all whitespace-nowrap cursor-pointer bg-transparent ${
            activeSheetIdx === -1 ? "border-b-accent text-accent" : "border-b-transparent text-txt-dim hover:text-txt"
          }`}
          onClick={() => setActiveSheetIdx(-1)}
        >
          Summary
        </button>
        {activeReport.sheets.map((sheet, idx) => (
          <button
            key={sheet.id}
            className={`px-4 py-2 text-xs font-medium border-b-2 transition-all whitespace-nowrap cursor-pointer bg-transparent ${
              activeSheetIdx === idx ? "border-b-accent text-accent" : "border-b-transparent text-txt-dim hover:text-txt"
            }`}
            onClick={() => setActiveSheetIdx(idx)}
          >
            {sheet.name}
          </button>
        ))}
      </div>

      {activeSheetIdx === -1 ? (
        <>
        <div className="space-y-3 lg:hidden">
          {activeReport.sheets.length === 0 ? (
            <div className="rounded-2xl border border-border bg-bg-surface p-8 text-center text-sm text-txt-muted">
              No progress sections yet.
            </div>
          ) : (
            activeReport.sheets.map((sheet) => {
              const sheetReport: ProgressReport = { ...activeReport, sheets: [sheet] };
              const sheetMetrics = reportMetrics(sheetReport);
              return (
                <button
                  key={`${sheet.id}-compact`}
                  type="button"
                  onClick={() => setActiveSheetIdx(activeReport.sheets.findIndex((item) => item.id === sheet.id))}
                  className="w-full rounded-2xl border border-border bg-bg-surface p-4 text-left transition hover:border-accent/50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-txt">{sheet.name}</div>
                      <div className="mt-1 text-xs text-txt-muted">{sheet.items.length} activities</div>
                    </div>
                    <Badge color={sheetMetrics.variance >= 0 ? "ok" : "err"}>
                      {sheetMetrics.variance.toFixed(1)}%
                    </Badge>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-xl border border-border bg-bg-raised/50 p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">Planned</div>
                      <div className="mt-1 font-mono font-semibold text-txt">{sheetMetrics.planned.toFixed(1)}%</div>
                    </div>
                    <div className="rounded-xl border border-border bg-bg-raised/50 p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">Actual</div>
                      <div className="mt-1 font-mono font-semibold text-accent">{sheetMetrics.actual.toFixed(1)}%</div>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
        <div className="hidden data-table-shell overflow-auto lg:block">
          <table className="data-table" style={{ minWidth: 880 }}>
            <thead>
              <tr>
                <th>Section</th>
                <th>Items</th>
                <th className="text-right">Earned Value</th>
                <th className="text-right">Planned</th>
                <th className="text-right">Actual</th>
                <th className="text-right">Variance</th>
                <th>Completion</th>
              </tr>
            </thead>
            <tbody>
              {activeReport.sheets.map((sheet) => {
                const sheetReport: ProgressReport = { ...activeReport, sheets: [sheet] };
                const sheetMetrics = reportMetrics(sheetReport);
                return (
                  <tr key={sheet.id}>
                    <td className="text-sm font-medium">{sheet.name}</td>
                    <td className="text-sm text-txt-muted">{sheet.items.length}</td>
                    <td className="data-cell-num text-sm">
                      {project?.currency || "USD"} {currency(sheetMetrics.earned)}
                    </td>
                    <td className="data-cell-num text-sm">{sheetMetrics.planned.toFixed(1)}%</td>
                    <td className="data-cell-num text-sm">{sheetMetrics.actual.toFixed(1)}%</td>
                    <td className={`data-cell-num text-sm ${sheetMetrics.variance >= 0 ? "text-ok" : "text-err"}`}>
                      {sheetMetrics.variance.toFixed(1)}%
                    </td>
                    <td className="text-sm">
                      {sheetMetrics.completed}/{sheetMetrics.totalItems}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      ) : (
        <div>
          <div className="mb-2 flex flex-col gap-2 rounded-xl border border-border bg-bg-surface p-2 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2 text-xs leading-5 text-txt">
              <Badge color="accent">{getWeightBadge(activeReport)}</Badge>
              <span>
                {activeInputMode === "percent" ? (
                  <>
                    Enter <strong>Actual % Done</strong>. Weighted progress is calculated in the background.
                  </>
                ) : (
                  <>
                    Enter <strong>Current Qty Done</strong>. Weight, actual progress, and earned value are calculated in the background.
                  </>
                )}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-lg border border-border bg-bg-input p-1">
                {[
                  { mode: "table" as ProgressViewMode, label: "Table", icon: Grid3X3 },
                  { mode: "visual" as ProgressViewMode, label: "Visual", icon: BarChart3 },
                ].map((option) => {
                  const Icon = option.icon;
                  return (
                    <button
                      key={option.mode}
                      type="button"
                      onClick={() => setProgressViewMode(option.mode)}
                      className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition ${
                        progressViewMode === option.mode
                          ? "bg-accent text-white shadow-lg shadow-accent/20"
                          : "text-txt-muted hover:text-txt"
                      }`}
                    >
                      <Icon size={14} /> {option.label}
                    </button>
                  );
                })}
              </div>
              {progressViewMode === "visual" && (
                <div className="flex rounded-lg border border-border bg-bg-input p-1">
                  {[
                    { mode: "all" as ProgressVisualRowMode, label: "All rows" },
                    { mode: "sections" as ProgressVisualRowMode, label: "Section headers" },
                  ].map((option) => (
                    <button
                      key={option.mode}
                      type="button"
                      onClick={() => setVisualRowMode(option.mode)}
                      className={`h-8 rounded-md px-3 text-xs font-medium transition ${
                        visualRowMode === option.mode
                          ? "bg-bg-raised text-white"
                          : "text-txt-muted hover:text-txt"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
              {progressViewMode === "table" && canUseCustomWeights && (
                <select
                  value={weightMode}
                  onChange={(e) =>
                    updateProgressReport(activeReport.id, {
                      weightMode: e.target.value as ProgressReport["weightMode"],
                    })
                  }
                  className="h-9 rounded-lg border border-border bg-bg-input px-2 text-xs text-txt outline-none focus:border-accent"
                >
                  <option value="equal">Equal weights</option>
                  <option value="custom">Custom weights</option>
                </select>
              )}
              {progressViewMode === "table" && (
              <div className="relative">
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => {
                    setColumnDraft(ensureCoreColumns(activeInputMode, visibleColumns));
                    setShowColumns((prev) => !prev);
                  }}
                >
                  <Columns3 size={14} /> Columns
                </Button>
                {showColumns && (
                  <div className="absolute right-0 z-50 mt-2 w-[320px] rounded-2xl border border-border bg-bg-surface p-4 shadow-xl shadow-black/30">
                    <div className="mb-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">Table presets</div>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        {(["simple", "detailed", "quantity", "commercial"] as const).map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setColumnDraft(progressColumnPresets[activeInputMode][preset])}
                            className="rounded-lg border border-border bg-bg-input px-3 py-2 text-xs font-semibold capitalize text-txt-muted hover:border-accent hover:text-txt"
                          >
                            {preset}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="max-h-[280px] space-y-2 overflow-auto border-y border-border py-3">
                      {activeColumnOrder.map((column) => {
                        const isLocked = lockedColumns.includes(column);
                        const isChecked = columnDraft.includes(column) || isLocked;
                        return (
                          <label key={column} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-bg-hover">
                            <span className={isLocked ? "text-txt" : "text-txt-muted"}>{columnLabels[column]}</span>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              disabled={isLocked}
                              onChange={(e) => {
                                setColumnDraft((prev) =>
                                  e.target.checked
                                    ? Array.from(new Set([...prev, column]))
                                    : prev.filter((item) => item !== column)
                                );
                              }}
                            />
                          </label>
                        );
                      })}
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="flex-1 justify-center"
                        onClick={() => {
                          const next = progressColumnPresets[activeInputMode].simple;
                          saveColumns(activeInputMode, next);
                          setShowColumns(false);
                        }}
                      >
                        Reset
                      </Button>
                      <Button
                        size="sm"
                        variant="primary"
                        className="flex-1 justify-center"
                        onClick={() => {
                          saveColumns(activeInputMode, columnDraft);
                          setShowColumns(false);
                        }}
                      >
                        Apply
                      </Button>
                    </div>
                  </div>
                )}
              </div>
              )}
            </div>
          </div>
          {progressViewMode === "visual" ? (
            <ProgressVisualRows rows={visualRows} />
          ) : (
          <>
          <div className="space-y-3 xl:hidden">
            {activeReport.sheets[activeSheetIdx]?.items.map((item, index) => {
              const sheetId = activeReport.sheets[activeSheetIdx].id;
              const updateItem = (key: keyof ProgressItem, value: string) =>
                updateProgressItem(activeReport.id, sheetId, item.id, key, value);
              return (
                <div key={`${item.id}-compact`} className="rounded-2xl border border-border bg-bg-surface p-4">
                  <div className="mb-3 min-w-0">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">
                      Activity {index + 1} {item.billNo ? `• ${item.billNo}` : ""}
                    </div>
                    <div className="mt-1 text-sm font-semibold text-txt">{item.description}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {activeInputMode === "quantity" && (
                      <>
                        <div className="rounded-xl border border-border bg-bg-raised/50 p-3">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">BOQ Qty</div>
                          <div className="mt-1 font-mono font-semibold text-txt">{item.boqQty || "0"}</div>
                        </div>
                        <label className="rounded-xl border border-accent/30 bg-accent/5 p-3">
                          <span className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">Current Qty</span>
                          {isEditMode ? (
                            <input
                              value={item.currentQty}
                              onChange={(e) => updateItem("currentQty", e.target.value)}
                              className="mt-1 w-full rounded-lg border border-border bg-bg-input px-2 py-1 text-right font-mono text-sm text-txt outline-none focus:border-accent"
                            />
                          ) : (
                            <div className="mt-1 font-mono font-semibold text-accent">{item.currentQty || "0"}</div>
                          )}
                        </label>
                      </>
                    )}
                    <label className="rounded-xl border border-border bg-bg-raised/50 p-3">
                      <span className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">Planned %</span>
                      {isEditMode ? (
                        <input
                          value={item.plannedPercent}
                          onChange={(e) => updateItem("plannedPercent", e.target.value)}
                          className="mt-1 w-full rounded-lg border border-border bg-bg-input px-2 py-1 text-right font-mono text-sm text-txt outline-none focus:border-accent"
                        />
                      ) : (
                        <div className="mt-1 font-mono font-semibold text-txt">{item.plannedPercent}%</div>
                      )}
                    </label>
                    <label className="rounded-xl border border-border bg-bg-raised/50 p-3">
                      <span className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">Actual %</span>
                      {isEditMode && activeInputMode === "percent" ? (
                        <input
                          value={item.actualPercent}
                          onChange={(e) => updateItem("actualPercent", e.target.value)}
                          className="mt-1 w-full rounded-lg border border-accent/30 bg-accent/5 px-2 py-1 text-right font-mono text-sm text-txt outline-none focus:border-accent"
                        />
                      ) : (
                        <div className="mt-1 font-mono font-semibold text-accent">{item.actualPercent}%</div>
                      )}
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="hidden data-table-shell overflow-auto xl:block" style={{ maxHeight: "calc(100vh - 450px)" }}>
            <table className="data-table data-table-sticky text-[11px]" style={{ minWidth: Math.max(880, displayColumns.length * 132) }}>
              <thead>
                <tr>
                  <th style={{ width: 36 }} className="text-center">#</th>
                  {displayColumns.map((column) => (
                    <th key={column}>{columnLabels[column]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeReport.sheets[activeSheetIdx]?.items.map((item, index) => (
                  <tr key={item.id}>
                    <td className="data-cell-index">{index + 1}</td>
                    {displayColumns.map((column) => (
                      <Fragment key={column}>{renderProgressCell(item, column)}</Fragment>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
          )}
        </div>
      )}

      {showSettings && <ProgressSettingsModal open={showSettings} report={activeReport} onClose={() => setShowSettings(false)} />}
    </div>
  );
}
