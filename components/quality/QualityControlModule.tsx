"use client";

import { useMemo, useState } from "react";
import { v4 as uuid } from "uuid";
import { Copy, ExternalLink, FlaskConical, MoreVertical, Plus, Trash2 } from "lucide-react";

import { useAppStore } from "@/lib/store";
import type {
  QualityControlCategory,
  QualityControlRecord,
  QualityControlStatus,
} from "@/lib/supabase";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Badge from "@/components/ui/Badge";
import CompactKpiList from "@/components/ui/CompactKpiList";

type StatusFilter = "all" | QualityControlStatus;

const categoryLabels: Record<QualityControlCategory, string> = {
  "material-testing": "Material testing",
  survey: "Survey",
  ndt: "NDT",
  other: "Other",
};

const statusLabels: Record<QualityControlStatus, string> = {
  pass: "Pass",
  fail: "Fail",
  pending: "Pending",
  conditional: "Conditional",
};

const statusTone: Record<QualityControlStatus, "accent" | "ok" | "warn" | "err"> = {
  pass: "ok",
  fail: "err",
  pending: "warn",
  conditional: "accent",
};

const categoryOrder: QualityControlCategory[] = ["material-testing", "survey", "ndt", "other"];

const todayISO = () => new Date().toISOString().split("T")[0];

const normalizeUrl = (url: string) => {
  const trimmed = url.trim();
  if (!trimmed) return "";
  if (/^(https?:|mailto:|file:)/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

export default function QualityControlModule() {
  const {
    project,
    qualityControlRecords,
    addQualityControlRecord,
    updateQualityControlRecord,
    deleteQualityControlRecord,
    duplicateQualityControlRecord,
  } = useAppStore();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<"all" | QualityControlCategory>("all");
  const [deleteTarget, setDeleteTarget] = useState<QualityControlRecord | null>(null);
  const [openActionId, setOpenActionId] = useState<string | null>(null);

  const projectRecords = useMemo(
    () => qualityControlRecords.filter((record) => record.project_id === project?.id),
    [qualityControlRecords, project?.id],
  );

  const metrics = useMemo(() => {
    const pass = projectRecords.filter((r) => r.status === "pass").length;
    const fail = projectRecords.filter((r) => r.status === "fail").length;
    const pending = projectRecords.filter((r) => r.status === "pending").length;
    const decided = pass + fail;
    const passRate = decided > 0 ? Math.round((pass / decided) * 100) : 0;
    return { total: projectRecords.length, pass, fail, pending, passRate };
  }, [projectRecords]);

  const visibleRecords = useMemo(() => {
    return projectRecords.filter((record) => {
      if (statusFilter !== "all" && record.status !== statusFilter) return false;
      if (categoryFilter !== "all" && record.category !== categoryFilter) return false;
      return true;
    });
  }, [projectRecords, statusFilter, categoryFilter]);

  const addBlankRow = () => {
    const now = new Date().toISOString();
    const number = projectRecords.length + 1;
    const record: QualityControlRecord = {
      id: uuid(),
      project_id: project?.id || "",
      number,
      category: "material-testing",
      testName: "",
      elementLocation: "",
      sampleRef: "",
      date: todayISO(),
      performedBy: "",
      witnessedBy: "",
      specification: "",
      result: "",
      status: "pending",
      reportLink: "",
      remarks: "",
      createdAt: now,
      updatedAt: now,
    };
    addQualityControlRecord(record);
  };

  const openLink = (record: QualityControlRecord) => {
    const url = normalizeUrl(record.reportLink);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  const set = (id: string, updates: Partial<QualityControlRecord>) =>
    updateQualityControlRecord(id, updates);

  const renderRowActions = (record: QualityControlRecord) => {
    const isOpen = openActionId === record.id;
    return (
      <div className="relative flex justify-end">
        <button
          type="button"
          onClick={() => setOpenActionId((current) => (current === record.id ? null : record.id))}
          className="data-row-action"
          aria-label={`Actions for ${record.testName || "test"}`}
          aria-expanded={isOpen}
        >
          <MoreVertical size={14} />
        </button>
        {isOpen ? (
          <div className="absolute right-0 top-9 z-40 w-44 overflow-hidden rounded-2xl border border-border bg-bg-surface py-1 text-left shadow-[0_18px_55px_rgba(0,0,0,0.45)]">
            <button
              type="button"
              onClick={() => {
                duplicateQualityControlRecord(record.id);
                setOpenActionId(null);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm font-semibold text-txt-muted transition hover:bg-bg-hover hover:text-txt"
            >
              <Copy size={14} /> Duplicate
            </button>
            <button
              type="button"
              onClick={() => {
                setDeleteTarget(record);
                setOpenActionId(null);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm font-semibold text-err transition hover:bg-err/10"
            >
              <Trash2 size={14} /> Delete
            </button>
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="mx-auto w-full max-w-[1500px] animate-fade-in px-1 sm:px-0">
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-txt">Quality Control</h2>
          <p className="mt-1 text-sm text-txt-muted">
            Material testing and survey records — what was tested, the result, and a link to the report.
          </p>
        </div>
        <Button size="sm" variant="primary" onClick={addBlankRow}>
          <Plus size={14} /> Add test
        </Button>
      </div>

      <div className="mb-5 sm:hidden">
        <CompactKpiList
          rows={[
            { label: "Total", value: metrics.total, tone: "neutral" },
            { label: "Pass", value: metrics.pass, tone: "ok" },
            { label: "Fail", value: metrics.fail, tone: "err" },
            { label: "Pending", value: metrics.pending, tone: "warn" },
            { label: "Pass rate", value: `${metrics.passRate}%`, tone: "accent" },
          ]}
        />
      </div>
      <div className="mb-5 hidden gap-3 sm:grid sm:grid-cols-2 xl:grid-cols-5">
        {[
          { label: "Total tests", value: metrics.total, tone: "text-txt" },
          { label: "Pass", value: metrics.pass, tone: "text-ok" },
          { label: "Fail", value: metrics.fail, tone: "text-err" },
          { label: "Pending", value: metrics.pending, tone: "text-warn" },
          { label: "Pass rate", value: `${metrics.passRate}%`, tone: "text-accent" },
        ].map((card) => (
          <div key={card.label} className="rounded-2xl border border-border bg-bg-surface p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">{card.label}</div>
            <div className={`mt-2 text-2xl font-semibold ${card.tone}`}>{card.value}</div>
          </div>
        ))}
      </div>

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {([
            { id: "all", label: "All" },
            { id: "pass", label: "Pass" },
            { id: "fail", label: "Fail" },
            { id: "pending", label: "Pending" },
            { id: "conditional", label: "Conditional" },
          ] as const).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setStatusFilter(item.id)}
              className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                statusFilter === item.id
                  ? "border-accent bg-accent text-white"
                  : "border-border bg-bg-surface text-txt-muted hover:bg-bg-hover hover:text-txt"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <select
          value={categoryFilter}
          onChange={(event) => setCategoryFilter(event.target.value as "all" | QualityControlCategory)}
          className="min-h-10 rounded-lg border border-border bg-bg-surface px-3 py-2 text-sm font-semibold text-txt outline-none focus:border-accent"
        >
          <option value="all">All categories</option>
          {categoryOrder.map((category) => (
            <option key={category} value={category}>
              {categoryLabels[category]}
            </option>
          ))}
        </select>
      </div>

      {/* Mobile cards */}
      <div className="space-y-4 xl:hidden">
        {visibleRecords.map((record) => (
          <div key={record.id} className="rounded-2xl border border-border bg-bg-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <input
                  value={record.testName}
                  onChange={(event) => set(record.id, { testName: event.target.value })}
                  placeholder="Test / activity"
                  className="w-full rounded-lg border border-border bg-bg px-3 py-3 text-base font-semibold text-txt outline-none focus:border-accent"
                />
              </div>
              <Badge color={statusTone[record.status]}>{statusLabels[record.status]}</Badge>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">Category</span>
                <select
                  value={record.category}
                  onChange={(event) => set(record.id, { category: event.target.value as QualityControlCategory })}
                  className="mt-2 w-full rounded-lg border border-border bg-bg px-3 py-3 text-txt outline-none focus:border-accent"
                >
                  {categoryOrder.map((category) => (
                    <option key={category} value={category}>
                      {categoryLabels[category]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">Date</span>
                <input
                  type="date"
                  value={record.date}
                  onChange={(event) => set(record.id, { date: event.target.value })}
                  className="mt-2 w-full rounded-lg border border-border bg-bg px-3 py-3 text-txt outline-none focus:border-accent"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">Element / location</span>
                <input
                  value={record.elementLocation}
                  onChange={(event) => set(record.id, { elementLocation: event.target.value })}
                  className="mt-2 w-full rounded-lg border border-border bg-bg px-3 py-3 text-txt outline-none focus:border-accent"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">Performed by</span>
                <input
                  value={record.performedBy}
                  onChange={(event) => set(record.id, { performedBy: event.target.value })}
                  className="mt-2 w-full rounded-lg border border-border bg-bg px-3 py-3 text-txt outline-none focus:border-accent"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">Specification</span>
                <input
                  value={record.specification}
                  onChange={(event) => set(record.id, { specification: event.target.value })}
                  className="mt-2 w-full rounded-lg border border-border bg-bg px-3 py-3 text-txt outline-none focus:border-accent"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">Result</span>
                <input
                  value={record.result}
                  onChange={(event) => set(record.id, { result: event.target.value })}
                  className="mt-2 w-full rounded-lg border border-border bg-bg px-3 py-3 text-txt outline-none focus:border-accent"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">Status</span>
                <select
                  value={record.status}
                  onChange={(event) => set(record.id, { status: event.target.value as QualityControlStatus })}
                  className="mt-2 w-full rounded-lg border border-border bg-bg px-3 py-3 text-txt outline-none focus:border-accent"
                >
                  {(Object.keys(statusLabels) as QualityControlStatus[]).map((status) => (
                    <option key={status} value={status}>
                      {statusLabels[status]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-3">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">Report link</span>
              <div className="mt-2 flex gap-2">
                <input
                  value={record.reportLink}
                  onChange={(event) => set(record.id, { reportLink: event.target.value })}
                  placeholder="Paste the test report URL"
                  className="min-w-0 flex-1 rounded-lg border border-border bg-bg px-3 py-3 text-txt outline-none focus:border-accent"
                />
                <button
                  type="button"
                  onClick={() => openLink(record)}
                  disabled={!record.reportLink.trim()}
                  className="inline-flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-bg-raised text-txt-muted transition hover:bg-bg-hover hover:text-txt disabled:cursor-not-allowed disabled:opacity-40"
                  title="Open report link"
                >
                  <ExternalLink size={16} />
                </button>
              </div>
            </div>
            <div className="mt-4 flex justify-end">{renderRowActions(record)}</div>
          </div>
        ))}
        {visibleRecords.length === 0 ? (
          <div className="rounded-2xl border border-border bg-bg-surface px-6 py-14 text-center">
            <FlaskConical className="mx-auto text-txt-dim" size={34} />
            <h3 className="mt-3 text-lg font-semibold text-txt">No quality-control records yet</h3>
            <p className="mt-1 text-sm text-txt-muted">Add a test to start logging results.</p>
          </div>
        ) : null}
      </div>

      {/* Desktop table */}
      <div className="data-table-shell hidden xl:block">
        <div className="overflow-x-auto">
          <table className="data-table data-table-sticky min-w-[1180px]">
            <thead>
              <tr>
                <th style={{ width: 44 }}>#</th>
                <th>Category</th>
                <th>Test / activity</th>
                <th>Element / location</th>
                <th>Date</th>
                <th>Performed by</th>
                <th>Specification</th>
                <th>Result</th>
                <th>Status</th>
                <th>Report</th>
                <th style={{ width: 44 }} aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {visibleRecords.map((record) => (
                <tr key={record.id}>
                  <td className="num text-txt-muted">{record.number}</td>
                  <td>
                    <select
                      value={record.category}
                      onChange={(event) => set(record.id, { category: event.target.value as QualityControlCategory })}
                      className="data-cell-select"
                    >
                      {categoryOrder.map((category) => (
                        <option key={category} value={category}>
                          {categoryLabels[category]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="data-cell-wrap">
                    <input
                      value={record.testName}
                      onChange={(event) => set(record.id, { testName: event.target.value })}
                      placeholder="e.g. Concrete cube test"
                      className="data-cell-input font-semibold text-txt"
                    />
                  </td>
                  <td className="data-cell-wrap">
                    <input
                      value={record.elementLocation}
                      onChange={(event) => set(record.id, { elementLocation: event.target.value })}
                      placeholder="Element / location"
                      className="data-cell-input"
                    />
                  </td>
                  <td>
                    <input
                      type="date"
                      value={record.date}
                      onChange={(event) => set(record.id, { date: event.target.value })}
                      className="data-cell-input"
                    />
                  </td>
                  <td>
                    <input
                      value={record.performedBy}
                      onChange={(event) => set(record.id, { performedBy: event.target.value })}
                      placeholder="Lab / surveyor"
                      className="data-cell-input"
                    />
                  </td>
                  <td>
                    <input
                      value={record.specification}
                      onChange={(event) => set(record.id, { specification: event.target.value })}
                      placeholder="Required"
                      className="data-cell-input"
                    />
                  </td>
                  <td>
                    <input
                      value={record.result}
                      onChange={(event) => set(record.id, { result: event.target.value })}
                      placeholder="Measured"
                      className="data-cell-input"
                    />
                  </td>
                  <td>
                    <select
                      value={record.status}
                      onChange={(event) => set(record.id, { status: event.target.value as QualityControlStatus })}
                      className="data-cell-select"
                    >
                      {(Object.keys(statusLabels) as QualityControlStatus[]).map((status) => (
                        <option key={status} value={status}>
                          {statusLabels[status]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <div className="flex min-w-[200px] items-center gap-1">
                      <input
                        value={record.reportLink}
                        onChange={(event) => set(record.id, { reportLink: event.target.value })}
                        placeholder="Paste URL"
                        className="data-cell-input min-w-0 flex-1"
                      />
                      <button
                        type="button"
                        onClick={() => openLink(record)}
                        disabled={!record.reportLink.trim()}
                        className="data-row-action"
                        title="Open report link"
                      >
                        <ExternalLink size={14} />
                      </button>
                    </div>
                  </td>
                  <td className="data-cell-action">{renderRowActions(record)}</td>
                </tr>
              ))}
              {visibleRecords.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-6 py-14 text-center">
                    <FlaskConical className="mx-auto text-txt-dim" size={34} />
                    <h3 className="mt-3 text-lg font-semibold text-txt">No quality-control records yet</h3>
                    <p className="mt-1 text-sm text-txt-muted">Add a test to start logging results.</p>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {deleteTarget ? (
        <Modal open={true} onClose={() => setDeleteTarget(null)} title="Delete quality-control record" width={420}>
          <p className="mb-5 text-sm leading-6 text-txt-muted">
            Delete <strong>{deleteTarget.testName || `QC Test ${deleteTarget.number}`}</strong>?
          </p>
          <div className="flex gap-3">
            <Button variant="ghost" className="flex-1 justify-center" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              className="flex-1 justify-center"
              onClick={() => {
                deleteQualityControlRecord(deleteTarget.id);
                setDeleteTarget(null);
              }}
            >
              <Trash2 size={14} /> Delete
            </Button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
