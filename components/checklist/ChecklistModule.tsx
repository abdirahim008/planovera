"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  CheckCircle2,
  ClipboardCheck,
  Copy,
  ExternalLink,
  FilePlus2,
  MoreVertical,
  Plus,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  XCircle,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import type { ChecklistItem, ChecklistStatus } from "@/lib/supabase";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Badge from "@/components/ui/Badge";
import CompactKpiList from "@/components/ui/CompactKpiList";

type ChecklistFilter = "all" | ChecklistStatus | "overdue";
type ChecklistOptionalField =
  | "category"
  | "responsiblePerson"
  | "documentUrl"
  | "submittedDate"
  | "verifiedDate"
  | "verifiedBy"
  | "notes";

const statusLabels: Record<ChecklistStatus, string> = {
  pending: "Pending",
  submitted: "Submitted",
  verified: "Verified",
  rejected: "Rejected",
  waived: "Waived",
};

const statusTone: Record<ChecklistStatus, "accent" | "ok" | "warn" | "err"> = {
  pending: "warn",
  submitted: "accent",
  verified: "ok",
  rejected: "err",
  waived: "accent",
};

const categoryOptions = [
  "Contract Documents",
  "Insurances",
  "Bonds",
  "Method Statements",
  "Drawings / Shop Drawings",
  "Material Approvals",
  "Test Reports",
  "Handover Documents",
  "General",
];

const checklistColumnStorageKey = "planovera.checklist.visibleFields";

const checklistOptionalFields: Array<{ id: ChecklistOptionalField; label: string }> = [
  { id: "category", label: "Category" },
  { id: "responsiblePerson", label: "Responsible person" },
  { id: "documentUrl", label: "Document link" },
  { id: "submittedDate", label: "Submitted date" },
  { id: "verifiedDate", label: "Verified date" },
  { id: "verifiedBy", label: "Verified by" },
  { id: "notes", label: "Notes" },
];

const detailedChecklistFields = checklistOptionalFields.map((field) => field.id);

const isChecklistOptionalField = (value: string): value is ChecklistOptionalField =>
  checklistOptionalFields.some((field) => field.id === value);

const starterTemplates: Array<Partial<ChecklistItem>> = [
  { title: "Signed contract agreement", category: "Contract Documents", status: "pending" },
  { title: "Performance bond / guarantee", category: "Bonds", status: "pending" },
  { title: "Advance payment guarantee", category: "Bonds", status: "pending" },
  { title: "Contractor all-risk insurance", category: "Insurances", status: "pending" },
  { title: "Work programme / baseline schedule", category: "Contract Documents", status: "pending" },
  { title: "Method statement and risk assessment", category: "Method Statements", status: "pending" },
  { title: "Approved shop drawings", category: "Drawings / Shop Drawings", status: "pending" },
  { title: "Material approval submittals", category: "Material Approvals", status: "pending" },
  { title: "Quality test reports", category: "Test Reports", status: "pending" },
  { title: "As-built drawings and handover file", category: "Handover Documents", status: "pending" },
];

const todayISO = () => new Date().toISOString().split("T")[0];

const isOverdue = (item: ChecklistItem) =>
  item.status === "pending" && Boolean(item.dueDate) && item.dueDate < todayISO();

const normalizeDocumentUrl = (url: string) => {
  const trimmed = url.trim();
  if (!trimmed) return "";
  if (/^(https?:|mailto:|file:)/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

function statusBadge(status: ChecklistStatus) {
  return <Badge color={statusTone[status]}>{statusLabels[status]}</Badge>;
}

export default function ChecklistModule() {
  const {
    project,
    checklistItems,
    addChecklistItem,
    addChecklistItems,
    updateChecklistItem,
    deleteChecklistItem,
    duplicateChecklistItem,
  } = useAppStore();
  const [filter, setFilter] = useState<ChecklistFilter>("all");
  const [deleteTarget, setDeleteTarget] = useState<ChecklistItem | null>(null);
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  // Kebab menu: portaled to the body with fixed coordinates so it floats
  // above the table instead of being clipped inside its scroll container.
  const [openAction, setOpenAction] = useState<{ id: string; x: number; y: number } | null>(null);
  const [columnPreferencesLoaded, setColumnPreferencesLoaded] = useState(false);
  const [visibleFields, setVisibleFields] = useState<ChecklistOptionalField[]>([]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(checklistColumnStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setVisibleFields(parsed.filter((field): field is ChecklistOptionalField => isChecklistOptionalField(field)));
        }
      }
    } catch {
      setVisibleFields([]);
    } finally {
      setColumnPreferencesLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!columnPreferencesLoaded) return;
    window.localStorage.setItem(checklistColumnStorageKey, JSON.stringify(visibleFields));
  }, [columnPreferencesLoaded, visibleFields]);

  const projectItems = useMemo(
    () => checklistItems.filter((item) => item.project_id === project?.id),
    [checklistItems, project?.id]
  );

  const metrics = useMemo(() => {
    const submitted = projectItems.filter((item) => item.status === "submitted" || item.status === "verified").length;
    const verified = projectItems.filter((item) => item.status === "verified").length;
    const overdue = projectItems.filter(isOverdue).length;
    return {
      total: projectItems.length,
      submitted,
      verified,
      overdue,
      pending: projectItems.filter((item) => item.status === "pending").length,
    };
  }, [projectItems]);

  const visibleItems = useMemo(() => {
    if (filter === "all") return projectItems;
    if (filter === "overdue") return projectItems.filter(isOverdue);
    return projectItems.filter((item) => item.status === filter);
  }, [filter, projectItems]);

  const addBlankRow = () => {
    addChecklistItem({
      title: "New checklist item",
      category: "General",
      responsiblePerson: "",
      status: "pending",
    });
  };

  const markSubmitted = (item: ChecklistItem) => {
    updateChecklistItem(item.id, {
      status: "submitted",
      submittedDate: item.submittedDate || todayISO(),
    });
  };

  const markVerified = (item: ChecklistItem) => {
    updateChecklistItem(item.id, {
      status: "verified",
      submittedDate: item.submittedDate || todayISO(),
      verifiedDate: item.verifiedDate || todayISO(),
      verifiedBy: item.verifiedBy || "Project Manager",
    });
  };

  const openDocument = (item: ChecklistItem) => {
    const url = normalizeDocumentUrl(item.documentUrl);
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const isFieldVisible = (field: ChecklistOptionalField) => visibleFields.includes(field);

  const toggleVisibleField = (field: ChecklistOptionalField) => {
    setVisibleFields((current) =>
      current.includes(field) ? current.filter((item) => item !== field) : [...current, field]
    );
  };

  const setSimpleColumns = () => setVisibleFields([]);
  const setDetailedColumns = () => setVisibleFields(detailedChecklistFields);

  const tableColumnCount =
    4 +
    (isFieldVisible("category") ? 1 : 0) +
    (isFieldVisible("responsiblePerson") ? 1 : 0) +
    (isFieldVisible("documentUrl") ? 1 : 0) +
    (isFieldVisible("submittedDate") ? 1 : 0) +
    (isFieldVisible("verifiedDate") ? 1 : 0) +
    (isFieldVisible("verifiedBy") ? 1 : 0) +
    (isFieldVisible("notes") ? 1 : 0);

  const MENU_WIDTH = 208; // w-52
  const MENU_HEIGHT = 200; // ~5 rows — used to flip above when near the bottom edge

  const renderRowActions = (item: ChecklistItem) => {
    const isOpen = openAction?.id === item.id;
    return (
      <div className="flex justify-end">
        <button
          type="button"
          onClick={(e) => {
            if (isOpen) {
              setOpenAction(null);
              return;
            }
            // Anchor the portaled menu to the button: right-aligned, below it
            // (or above when it would spill past the bottom of the viewport).
            const rect = e.currentTarget.getBoundingClientRect();
            const x = Math.max(8, rect.right - MENU_WIDTH);
            const y =
              rect.bottom + 4 + MENU_HEIGHT > window.innerHeight
                ? Math.max(8, rect.top - 4 - MENU_HEIGHT)
                : rect.bottom + 4;
            setOpenAction({ id: item.id, x, y });
          }}
          className="data-row-action"
          aria-label={`Actions for ${item.title}`}
          aria-expanded={isOpen}
        >
          <MoreVertical size={14} />
        </button>
        {isOpen && openAction
          ? createPortal(
              <>
                <div className="fixed inset-0 z-[9998]" onMouseDown={() => setOpenAction(null)} />
                <div
                  className="fixed z-[9999] w-52 overflow-hidden rounded-2xl border border-border bg-bg-surface py-1 text-left shadow-[0_18px_55px_rgba(0,0,0,0.45)]"
                  style={{ left: openAction.x, top: openAction.y }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      markSubmitted(item);
                      setOpenAction(null);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm font-semibold text-txt-muted transition hover:bg-bg-hover hover:text-txt"
                  >
                    <CheckCircle2 size={14} /> Mark submitted
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      markVerified(item);
                      setOpenAction(null);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm font-semibold text-ok transition hover:bg-ok/10"
                  >
                    <ShieldCheck size={14} /> Mark verified
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      updateChecklistItem(item.id, { status: "rejected" });
                      setOpenAction(null);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm font-semibold text-txt-muted transition hover:bg-bg-hover hover:text-err"
                  >
                    <XCircle size={14} /> Reject
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      duplicateChecklistItem(item.id);
                      setOpenAction(null);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm font-semibold text-txt-muted transition hover:bg-bg-hover hover:text-txt"
                  >
                    <Copy size={14} /> Duplicate
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteTarget(item);
                      setOpenAction(null);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm font-semibold text-err transition hover:bg-err/10"
                  >
                    <Trash2 size={14} /> Delete
                  </button>
                </div>
              </>,
              document.body,
            )
          : null}
      </div>
    );
  };

  return (
    <div className="mx-auto w-full max-w-[1500px] animate-fade-in px-1 sm:px-0">
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <h2 className="text-lg font-semibold tracking-tight text-txt">Checklist</h2>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => addChecklistItems(starterTemplates)}>
            <FilePlus2 size={14} /> Insert starter checklist
          </Button>
          <Button size="sm" variant="primary" onClick={addBlankRow}>
            <Plus size={14} /> Add row
          </Button>
        </div>
      </div>

      <div className="mb-5 sm:hidden">
        <CompactKpiList
          rows={[
            { label: "Required", value: metrics.total, tone: "neutral" },
            { label: "Pending", value: metrics.pending, tone: "warn" },
            { label: "Submitted", value: metrics.submitted, tone: "accent" },
            { label: "Verified", value: metrics.verified, tone: "ok" },
            { label: "Overdue", value: metrics.overdue, tone: "err" },
          ]}
        />
      </div>
      <div className="mb-5 hidden gap-3 sm:grid sm:grid-cols-2 xl:grid-cols-5">
        {[
          { label: "Required", value: metrics.total, tone: "text-txt" },
          { label: "Pending", value: metrics.pending, tone: "text-warn" },
          { label: "Submitted", value: metrics.submitted, tone: "text-accent" },
          { label: "Verified", value: metrics.verified, tone: "text-ok" },
          { label: "Overdue", value: metrics.overdue, tone: "text-err" },
        ].map((card) => (
          <div key={card.label} className="rounded-2xl border border-border bg-bg-surface p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">
              {card.label}
            </div>
            <div className={`mt-2 text-2xl font-semibold ${card.tone}`}>{card.value}</div>
          </div>
        ))}
      </div>

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {[
            { id: "all", label: "All" },
            { id: "pending", label: "Pending" },
            { id: "submitted", label: "Submitted" },
            { id: "verified", label: "Verified" },
            { id: "overdue", label: "Overdue" },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id as ChecklistFilter)}
              className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                filter === item.id
                  ? "border-accent bg-accent text-white"
                  : "border-border bg-bg-surface text-txt-muted hover:bg-bg-hover hover:text-txt"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowColumnMenu((current) => !current)}
            className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-border bg-bg-surface px-3 py-2 text-sm font-semibold text-txt transition hover:bg-bg-hover sm:w-auto"
            aria-expanded={showColumnMenu}
          >
            <SlidersHorizontal size={15} /> Columns
          </button>
          {showColumnMenu ? (
            <div className="absolute right-0 top-12 z-40 w-[min(92vw,320px)] rounded-xl border border-border bg-bg-surface p-3 shadow-[0_18px_55px_rgba(0,0,0,0.45)]">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={setSimpleColumns}
                  className="flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-xs font-semibold text-txt-muted transition hover:border-accent hover:text-txt"
                >
                  Simple
                </button>
                <button
                  type="button"
                  onClick={setDetailedColumns}
                  className="flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-xs font-semibold text-txt-muted transition hover:border-accent hover:text-txt"
                >
                  Detailed
                </button>
              </div>
              <div className="mt-3 rounded-lg border border-border bg-bg p-2">
                <div className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">
                  Locked fields
                </div>
                <div className="flex flex-wrap gap-1 px-1 pb-2 text-[11px] font-semibold text-txt-muted">
                  <span>Item</span>
                  <span>Due date</span>
                  <span>Status</span>
                </div>
                <div className="space-y-1 border-t border-border pt-2">
                  {checklistOptionalFields.map((field) => (
                    <label
                      key={field.id}
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm font-semibold text-txt-muted transition hover:bg-bg-hover hover:text-txt"
                    >
                      <input
                        type="checkbox"
                        checked={isFieldVisible(field.id)}
                        onChange={() => toggleVisibleField(field.id)}
                        className="h-4 w-4 accent-accent"
                      />
                      {field.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="space-y-4 xl:hidden">
        {visibleItems.map((item) => {
          const overdue = isOverdue(item);
          const submittedWithoutLink = item.status === "submitted" && !item.documentUrl.trim();
          return (
            <div
              key={item.id}
              className={`rounded-2xl border bg-bg-surface p-4 ${
                overdue ? "border-err/35" : "border-border"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">
                    Checklist item
                  </label>
                  <input
                    value={item.title}
                    onChange={(event) => updateChecklistItem(item.id, { title: event.target.value })}
                    className="mt-2 w-full rounded-lg border border-border bg-bg px-3 py-3 text-base font-semibold text-txt outline-none focus:border-accent"
                  />
                  {!isFieldVisible("documentUrl") && item.documentUrl.trim() ? (
                    <button
                      type="button"
                      onClick={() => openDocument(item)}
                      className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-accent transition hover:text-txt"
                    >
                      <ExternalLink size={13} /> Open linked document
                    </button>
                  ) : null}
                </div>
                <div className="flex flex-col items-end gap-2">
                  {statusBadge(item.status)}
                  {overdue ? <Badge color="err">Overdue</Badge> : null}
                  {submittedWithoutLink ? <Badge color="warn">Link missing</Badge> : null}
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {isFieldVisible("category") ? (
                  <label className="block">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">Category</span>
                    <select
                      value={item.category}
                      onChange={(event) => updateChecklistItem(item.id, { category: event.target.value })}
                      className="mt-2 w-full rounded-lg border border-border bg-bg px-3 py-3 text-txt outline-none focus:border-accent"
                    >
                      {categoryOptions.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {isFieldVisible("responsiblePerson") ? (
                  <label className="block">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">Responsible</span>
                    <input
                      value={item.responsiblePerson}
                      onChange={(event) => updateChecklistItem(item.id, { responsiblePerson: event.target.value })}
                      placeholder="Responsible person"
                      className="mt-2 w-full rounded-lg border border-border bg-bg px-3 py-3 text-txt outline-none focus:border-accent"
                    />
                  </label>
                ) : null}
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">Due date</span>
                  <input
                    type="date"
                    value={item.dueDate}
                    onChange={(event) => updateChecklistItem(item.id, { dueDate: event.target.value })}
                    className="mt-2 w-full rounded-lg border border-border bg-bg px-3 py-3 text-txt outline-none focus:border-accent"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">Status</span>
                  <select
                    value={item.status}
                    onChange={(event) =>
                      updateChecklistItem(item.id, { status: event.target.value as ChecklistStatus })
                    }
                    className="mt-2 w-full rounded-lg border border-border bg-bg px-3 py-3 text-txt outline-none focus:border-accent"
                  >
                    {(Object.keys(statusLabels) as ChecklistStatus[]).map((status) => (
                      <option key={status} value={status}>
                        {statusLabels[status]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {isFieldVisible("documentUrl") ? (
              <div className="mt-3">
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">Document link</span>
                <div className="mt-2 flex gap-2">
                  <input
                    value={item.documentUrl}
                    onChange={(event) => updateChecklistItem(item.id, { documentUrl: event.target.value })}
                    placeholder="Paste SharePoint, Drive, OneDrive, or URL"
                    className="min-w-0 flex-1 rounded-2xl border border-border bg-bg px-3 py-3 text-txt outline-none focus:border-accent"
                  />
                  <button
                    type="button"
                    onClick={() => openDocument(item)}
                    disabled={!item.documentUrl.trim()}
                    className="inline-flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-bg-raised text-txt-muted transition hover:bg-bg-hover hover:text-txt disabled:cursor-not-allowed disabled:opacity-40"
                    title="Open document link"
                  >
                    <ExternalLink size={16} />
                  </button>
                </div>
              </div>
              ) : null}

              {isFieldVisible("submittedDate") || isFieldVisible("verifiedDate") || isFieldVisible("verifiedBy") ? (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {isFieldVisible("submittedDate") ? (
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">Submitted</span>
                  <input
                    type="date"
                    value={item.submittedDate}
                    onChange={(event) => updateChecklistItem(item.id, { submittedDate: event.target.value })}
                    className="mt-2 w-full rounded-lg border border-border bg-bg px-3 py-3 text-txt outline-none focus:border-accent"
                  />
                </label>
                ) : null}
                {isFieldVisible("verifiedDate") ? (
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">Verified date</span>
                  <input
                    type="date"
                    value={item.verifiedDate}
                    onChange={(event) => updateChecklistItem(item.id, { verifiedDate: event.target.value })}
                    className="mt-2 w-full rounded-lg border border-border bg-bg px-3 py-3 text-txt outline-none focus:border-accent"
                  />
                </label>
                ) : null}
                {isFieldVisible("verifiedBy") ? (
                <label className="block md:col-span-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">Verified by</span>
                  <input
                    value={item.verifiedBy}
                    onChange={(event) => updateChecklistItem(item.id, { verifiedBy: event.target.value })}
                    placeholder="Verified by"
                    className="mt-2 w-full rounded-lg border border-border bg-bg px-3 py-3 text-txt outline-none focus:border-accent"
                  />
                </label>
                ) : null}
              </div>
              ) : null}

              {isFieldVisible("notes") ? (
              <label className="mt-4 block">
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">Notes</span>
                <textarea
                  value={item.notes}
                  onChange={(event) => updateChecklistItem(item.id, { notes: event.target.value })}
                  placeholder="Notes"
                  className="mt-2 h-24 w-full resize-none rounded-lg border border-border bg-bg px-3 py-3 text-txt outline-none focus:border-accent"
                />
              </label>
              ) : null}

              <div className="mt-4 flex justify-end">{renderRowActions(item)}</div>
            </div>
          );
        })}
        {visibleItems.length === 0 ? (
          <div className="rounded-2xl border border-border bg-bg-surface px-6 py-14 text-center">
            <ClipboardCheck className="mx-auto text-txt-dim" size={34} />
            <h3 className="mt-3 text-lg font-semibold text-txt">No checklist items yet</h3>
            <p className="mt-1 text-sm text-txt-muted">
              Add a row or insert starter templates to begin tracking compliance.
            </p>
          </div>
        ) : null}
      </div>

      <div className="data-table-shell hidden xl:block">
        <div className="overflow-x-auto">
          <table className="data-table data-table-sticky min-w-[820px]">
            <thead>
              <tr>
                <th>Item</th>
                {isFieldVisible("category") ? <th>Category</th> : null}
                {isFieldVisible("responsiblePerson") ? <th>Responsible</th> : null}
                <th>Due Date</th>
                <th>Status</th>
                {isFieldVisible("documentUrl") ? <th>Document Link</th> : null}
                {isFieldVisible("submittedDate") ? <th>Submitted</th> : null}
                {isFieldVisible("verifiedDate") ? <th>Verified Date</th> : null}
                {isFieldVisible("verifiedBy") ? <th>Verified By</th> : null}
                {isFieldVisible("notes") ? <th>Notes</th> : null}
                <th style={{ width: 44 }} aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {visibleItems.map((item) => {
                const overdue = isOverdue(item);
                const submittedWithoutLink = item.status === "submitted" && !item.documentUrl.trim();
                return (
                  <tr key={item.id} className={overdue ? "bg-err/5" : ""}>
                    <td className="data-cell-wrap">
                      <input
                        value={item.title}
                        onChange={(event) => updateChecklistItem(item.id, { title: event.target.value })}
                        className="data-cell-input font-semibold text-txt"
                      />
                      {!isFieldVisible("documentUrl") && item.documentUrl.trim() ? (
                        <button
                          type="button"
                          onClick={() => openDocument(item)}
                          className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-accent transition hover:text-txt"
                        >
                          <ExternalLink size={12} /> Link
                        </button>
                      ) : null}
                    </td>
                    {isFieldVisible("category") ? (
                      <td>
                        <select
                          value={item.category}
                          onChange={(event) => updateChecklistItem(item.id, { category: event.target.value })}
                          className="data-cell-select"
                        >
                          {categoryOptions.map((category) => (
                            <option key={category} value={category}>
                              {category}
                            </option>
                          ))}
                        </select>
                      </td>
                    ) : null}
                    {isFieldVisible("responsiblePerson") ? (
                      <td>
                        <input
                          value={item.responsiblePerson}
                          onChange={(event) => updateChecklistItem(item.id, { responsiblePerson: event.target.value })}
                          placeholder="Responsible person"
                          className="data-cell-input"
                        />
                      </td>
                    ) : null}
                    <td>
                      <input
                        type="date"
                        value={item.dueDate}
                        onChange={(event) => updateChecklistItem(item.id, { dueDate: event.target.value })}
                        className="data-cell-input"
                      />
                      {overdue ? <div className="mt-1 text-xs font-semibold text-err">Overdue</div> : null}
                    </td>
                    <td>
                      <select
                        value={item.status}
                        onChange={(event) =>
                          updateChecklistItem(item.id, { status: event.target.value as ChecklistStatus })
                        }
                        className="data-cell-select"
                      >
                        {(Object.keys(statusLabels) as ChecklistStatus[]).map((status) => (
                          <option key={status} value={status}>
                            {statusLabels[status]}
                          </option>
                        ))}
                      </select>
                      {submittedWithoutLink ? (
                        <div className="mt-1 text-xs font-semibold text-warn">Link missing</div>
                      ) : null}
                    </td>
                    {isFieldVisible("documentUrl") ? (
                      <td>
                        <div className="flex min-w-[220px] items-center gap-1">
                          <input
                            value={item.documentUrl}
                            onChange={(event) => updateChecklistItem(item.id, { documentUrl: event.target.value })}
                            placeholder="Paste URL"
                            className="data-cell-input min-w-0 flex-1"
                          />
                          <button
                            type="button"
                            onClick={() => openDocument(item)}
                            disabled={!item.documentUrl.trim()}
                            className="data-row-action"
                            title="Open document link"
                          >
                            <ExternalLink size={14} />
                          </button>
                        </div>
                      </td>
                    ) : null}
                    {isFieldVisible("submittedDate") ? (
                      <td>
                        <input
                          type="date"
                          value={item.submittedDate}
                          onChange={(event) => updateChecklistItem(item.id, { submittedDate: event.target.value })}
                          className="data-cell-input"
                        />
                      </td>
                    ) : null}
                    {isFieldVisible("verifiedDate") ? (
                      <td>
                        <input
                          type="date"
                          value={item.verifiedDate}
                          onChange={(event) => updateChecklistItem(item.id, { verifiedDate: event.target.value })}
                          className="data-cell-input"
                        />
                      </td>
                    ) : null}
                    {isFieldVisible("verifiedBy") ? (
                      <td>
                        <input
                          value={item.verifiedBy}
                          onChange={(event) => updateChecklistItem(item.id, { verifiedBy: event.target.value })}
                          placeholder="Verified by"
                          className="data-cell-input"
                        />
                      </td>
                    ) : null}
                    {isFieldVisible("notes") ? (
                      <td className="data-cell-wrap">
                        <textarea
                          value={item.notes}
                          onChange={(event) => updateChecklistItem(item.id, { notes: event.target.value })}
                          placeholder="Notes"
                          rows={1}
                          className="data-cell-textarea"
                        />
                      </td>
                    ) : null}
                    <td className="data-cell-action">{renderRowActions(item)}</td>
                  </tr>
                );
              })}
              {visibleItems.length === 0 ? (
                <tr>
                  <td colSpan={tableColumnCount} className="px-6 py-14 text-center">
                    <ClipboardCheck className="mx-auto text-txt-dim" size={34} />
                    <h3 className="mt-3 text-lg font-semibold text-txt">No checklist items yet</h3>
                    <p className="mt-1 text-sm text-txt-muted">
                      Add a row or insert starter templates to begin tracking compliance.
                    </p>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {deleteTarget ? (
        <Modal open={true} onClose={() => setDeleteTarget(null)} title="Delete Checklist Item" width={420}>
          <p className="mb-5 text-sm leading-6 text-txt-muted">
            Delete <strong>{deleteTarget.title}</strong>?
          </p>
          <div className="flex gap-3">
            <Button variant="ghost" className="flex-1 justify-center" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              className="flex-1 justify-center"
              onClick={() => {
                deleteChecklistItem(deleteTarget.id);
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
