"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Copy,
  Pencil,
  Plus,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import type {
  Risk,
  RiskCategory,
  RiskLevel,
  RiskStatus,
} from "@/lib/supabase";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Badge from "@/components/ui/Badge";

const categoryLabels: Record<RiskCategory, string> = {
  technical: "Technical",
  commercial: "Commercial",
  schedule: "Schedule",
  safety: "Safety",
  quality: "Quality",
  resource: "Resource",
  external: "External",
  other: "Other",
};

const statusLabels: Record<RiskStatus, string> = {
  open: "Open",
  mitigated: "Mitigated",
  closed: "Closed",
  accepted: "Accepted",
};

const levelLabels: Record<RiskLevel, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

const statusColors: Record<RiskStatus, "warn" | "accent" | "ok" | "purple"> = {
  open: "warn",
  mitigated: "accent",
  closed: "ok",
  accepted: "purple",
};

const levelToScore: Record<RiskLevel, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

const scoreColor = (score: number) => {
  if (score >= 9) return { bg: "bg-err/15", border: "border-err/40", text: "text-err", swatch: "bg-err" };
  if (score >= 6) return { bg: "bg-warn/15", border: "border-warn/40", text: "text-warn", swatch: "bg-warn" };
  if (score >= 3) return { bg: "bg-accent/10", border: "border-accent/35", text: "text-accent", swatch: "bg-accent" };
  return { bg: "bg-ok/10", border: "border-ok/30", text: "text-ok", swatch: "bg-ok" };
};

const scoreLabel = (score: number) => {
  if (score >= 9) return "Critical";
  if (score >= 6) return "High";
  if (score >= 3) return "Medium";
  return "Low";
};

interface RiskFormState {
  id?: string;
  title: string;
  description: string;
  category: RiskCategory;
  likelihood: RiskLevel;
  impact: RiskLevel;
  status: RiskStatus;
  owner: string;
  mitigation: string;
  reviewDate: string;
}

const emptyFormState = (): RiskFormState => ({
  title: "",
  description: "",
  category: "other",
  likelihood: "medium",
  impact: "medium",
  status: "open",
  owner: "",
  mitigation: "",
  reviewDate: "",
});

function RiskFormModal({
  open,
  initial,
  onClose,
  onSubmit,
}: {
  open: boolean;
  initial: RiskFormState;
  onClose: () => void;
  onSubmit: (form: RiskFormState) => void;
}) {
  const [form, setForm] = useState<RiskFormState>(initial);

  // Reset form whenever the initial values change (opening modal with a different risk)
  useMemo(() => {
    setForm(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial.id, open]);

  const score = levelToScore[form.likelihood] * levelToScore[form.impact];
  const tone = scoreColor(score);

  const update = <K extends keyof RiskFormState>(key: K, value: RiskFormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <Modal open={open} onClose={onClose} title={initial.id ? "Edit Risk" : "Add Risk"} width={640}>
      <div className="flex flex-col gap-4">
        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-muted">
            Title
          </label>
          <input
            autoFocus
            value={form.title}
            onChange={(e) => update("title", e.target.value)}
            placeholder="One-line risk summary"
            className="w-full rounded-lg border border-border bg-bg-input px-3 py-2.5 text-sm text-txt outline-none focus:border-accent"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-muted">
            Description
          </label>
          <textarea
            value={form.description}
            onChange={(e) => update("description", e.target.value)}
            rows={3}
            placeholder="What could go wrong? Why? When?"
            className="w-full resize-y rounded-lg border border-border bg-bg-input px-3 py-2.5 text-sm text-txt outline-none focus:border-accent"
          />
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-muted">
              Category
            </label>
            <select
              value={form.category}
              onChange={(e) => update("category", e.target.value as RiskCategory)}
              className="w-full rounded-lg border border-border bg-bg-input px-3 py-2 text-sm text-txt outline-none focus:border-accent"
            >
              {(Object.keys(categoryLabels) as RiskCategory[]).map((cat) => (
                <option key={cat} value={cat}>
                  {categoryLabels[cat]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-muted">
              Likelihood
            </label>
            <select
              value={form.likelihood}
              onChange={(e) => update("likelihood", e.target.value as RiskLevel)}
              className="w-full rounded-lg border border-border bg-bg-input px-3 py-2 text-sm text-txt outline-none focus:border-accent"
            >
              {(Object.keys(levelLabels) as RiskLevel[]).map((lvl) => (
                <option key={lvl} value={lvl}>
                  {levelLabels[lvl]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-muted">
              Impact
            </label>
            <select
              value={form.impact}
              onChange={(e) => update("impact", e.target.value as RiskLevel)}
              className="w-full rounded-lg border border-border bg-bg-input px-3 py-2 text-sm text-txt outline-none focus:border-accent"
            >
              {(Object.keys(levelLabels) as RiskLevel[]).map((lvl) => (
                <option key={lvl} value={lvl}>
                  {levelLabels[lvl]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-muted">
              Status
            </label>
            <select
              value={form.status}
              onChange={(e) => update("status", e.target.value as RiskStatus)}
              className="w-full rounded-lg border border-border bg-bg-input px-3 py-2 text-sm text-txt outline-none focus:border-accent"
            >
              {(Object.keys(statusLabels) as RiskStatus[]).map((st) => (
                <option key={st} value={st}>
                  {statusLabels[st]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className={`rounded-xl border ${tone.border} ${tone.bg} p-3`}>
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-muted">
            <span>Risk score</span>
            <span className={tone.text}>{scoreLabel(score)} · {score}</span>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1 text-[10px] text-txt-dim">
            {(["low", "medium", "high"] as RiskLevel[]).flatMap((l, lIdx) =>
              (["low", "medium", "high"] as RiskLevel[]).map((i, iIdx) => {
                const s = (lIdx + 1) * (iIdx + 1);
                const cellTone = scoreColor(s);
                const isSelected = form.likelihood === l && form.impact === i;
                return (
                  <button
                    key={`${l}-${i}`}
                    type="button"
                    onClick={() => {
                      update("likelihood", l);
                      update("impact", i);
                    }}
                    className={`flex aspect-square items-center justify-center rounded border transition ${cellTone.bg} ${
                      isSelected ? `${cellTone.border} ring-2 ring-accent/30` : `${cellTone.border} hover:ring-1 hover:ring-accent/20`
                    }`}
                  >
                    <span className={`text-[12px] font-bold ${cellTone.text}`}>{s}</span>
                  </button>
                );
              }),
            )}
          </div>
          <div className="mt-2 grid grid-cols-2 text-[9px] text-txt-dim">
            <span>← Likelihood</span>
            <span className="text-right">Impact →</span>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-muted">
              Owner
            </label>
            <input
              value={form.owner}
              onChange={(e) => update("owner", e.target.value)}
              placeholder="Person responsible"
              className="w-full rounded-lg border border-border bg-bg-input px-3 py-2 text-sm text-txt outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-muted">
              Review date
            </label>
            <input
              type="date"
              value={form.reviewDate}
              onChange={(e) => update("reviewDate", e.target.value)}
              className="w-full rounded-lg border border-border bg-bg-input px-3 py-2 text-sm text-txt outline-none focus:border-accent [color-scheme:light]"
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-muted">
            Mitigation
          </label>
          <textarea
            value={form.mitigation}
            onChange={(e) => update("mitigation", e.target.value)}
            rows={3}
            placeholder="Planned actions to reduce likelihood or impact."
            className="w-full resize-y rounded-lg border border-border bg-bg-input px-3 py-2 text-sm text-txt outline-none focus:border-accent"
          />
        </div>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!form.title.trim()}
            onClick={() => onSubmit(form)}
          >
            {initial.id ? <><Pencil size={14} /> Save changes</> : <><Plus size={14} /> Add risk</>}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default function RiskRegisterModule() {
  const {
    project,
    risks,
    addRisk,
    updateRisk,
    deleteRisk,
    duplicateRisk,
  } = useAppStore();

  const projectRisks = useMemo(
    () => risks.filter((r) => r.project_id === project?.id),
    [risks, project?.id],
  );

  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formInitial, setFormInitial] = useState<RiskFormState>(emptyFormState());
  const [deleteTarget, setDeleteTarget] = useState<Risk | null>(null);
  const [statusFilter, setStatusFilter] = useState<RiskStatus | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState<RiskCategory | "all">("all");
  const [search, setSearch] = useState("");

  const filteredRisks = useMemo(() => {
    const q = search.trim().toLowerCase();
    return projectRisks.filter((risk) => {
      if (statusFilter !== "all" && risk.status !== statusFilter) return false;
      if (categoryFilter !== "all" && risk.category !== categoryFilter) return false;
      if (q && !`${risk.title} ${risk.description} ${risk.owner} ${risk.reference}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [projectRisks, statusFilter, categoryFilter, search]);

  const counts = useMemo(() => {
    const open = projectRisks.filter((r) => r.status === "open").length;
    const critical = projectRisks.filter((r) => levelToScore[r.likelihood] * levelToScore[r.impact] >= 9).length;
    const mitigated = projectRisks.filter((r) => r.status === "mitigated").length;
    return { total: projectRisks.length, open, critical, mitigated };
  }, [projectRisks]);

  const openAdd = () => {
    setEditingId(null);
    setFormInitial(emptyFormState());
    setFormOpen(true);
  };

  const openEdit = (risk: Risk) => {
    setEditingId(risk.id);
    setFormInitial({
      id: risk.id,
      title: risk.title,
      description: risk.description,
      category: risk.category,
      likelihood: risk.likelihood,
      impact: risk.impact,
      status: risk.status,
      owner: risk.owner,
      mitigation: risk.mitigation,
      reviewDate: risk.reviewDate,
    });
    setFormOpen(true);
  };

  const submitForm = (form: RiskFormState) => {
    if (editingId) {
      updateRisk(editingId, {
        title: form.title.trim(),
        description: form.description,
        category: form.category,
        likelihood: form.likelihood,
        impact: form.impact,
        status: form.status,
        owner: form.owner,
        mitigation: form.mitigation,
        reviewDate: form.reviewDate,
      });
    } else {
      addRisk({
        title: form.title.trim(),
        description: form.description,
        category: form.category,
        likelihood: form.likelihood,
        impact: form.impact,
        status: form.status,
        owner: form.owner,
        mitigation: form.mitigation,
        reviewDate: form.reviewDate,
      });
    }
    setFormOpen(false);
    setEditingId(null);
  };

  return (
    <div className="animate-fade-in">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Risk Register</h2>
          <p className="mt-0.5 text-xs text-txt-muted">
            Track risks, owners, scores and mitigations across the project.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="primary" onClick={openAdd}>
            <Plus size={14} /> Add risk
          </Button>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total", value: counts.total, icon: Shield, tone: "text-txt" },
          { label: "Open", value: counts.open, icon: ShieldAlert, tone: "text-warn" },
          { label: "Critical", value: counts.critical, icon: AlertTriangle, tone: "text-err" },
          { label: "Mitigated", value: counts.mitigated, icon: ShieldCheck, tone: "text-ok" },
        ].map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div key={kpi.label} className="rounded-xl border border-border bg-bg-surface px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-muted">{kpi.label}</div>
                <Icon size={14} className={kpi.tone} />
              </div>
              <div className={`mt-1 text-2xl font-bold ${kpi.tone}`}>{kpi.value}</div>
            </div>
          );
        })}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-txt-dim" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search risks…"
            className="w-full rounded-lg border border-border bg-bg-input pl-8 pr-3 py-2 text-sm text-txt outline-none focus:border-accent"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as RiskStatus | "all")}
          className="rounded-lg border border-border bg-bg-input px-3 py-2 text-sm text-txt outline-none focus:border-accent"
        >
          <option value="all">All statuses</option>
          {(Object.keys(statusLabels) as RiskStatus[]).map((st) => (
            <option key={st} value={st}>{statusLabels[st]}</option>
          ))}
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value as RiskCategory | "all")}
          className="rounded-lg border border-border bg-bg-input px-3 py-2 text-sm text-txt outline-none focus:border-accent"
        >
          <option value="all">All categories</option>
          {(Object.keys(categoryLabels) as RiskCategory[]).map((cat) => (
            <option key={cat} value={cat}>{categoryLabels[cat]}</option>
          ))}
        </select>
      </div>

      {projectRisks.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-bg-surface/80 px-6 py-16 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-xl bg-accent/10">
            <Shield size={24} className="text-accent opacity-70" />
          </div>
          <p className="text-sm font-semibold text-txt">No risks logged yet</p>
          <p className="mt-1 text-xs text-txt-muted">
            Capture potential issues early so they don't surprise the project later.
          </p>
          <Button variant="primary" size="md" className="mt-4" onClick={openAdd}>
            <Plus size={14} /> Add first risk
          </Button>
        </div>
      ) : (
        <div className="data-table-shell overflow-auto">
          <table className="data-table" style={{ minWidth: 940 }}>
            <thead>
              <tr>
                <th style={{ width: 72 }}>Ref</th>
                <th>Title</th>
                <th style={{ width: 110 }}>Category</th>
                <th style={{ width: 90 }}>Score</th>
                <th style={{ width: 130 }}>Owner</th>
                <th style={{ width: 110 }}>Review</th>
                <th style={{ width: 100 }}>Status</th>
                <th style={{ width: 100 }} className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRisks.map((risk) => {
                const score = levelToScore[risk.likelihood] * levelToScore[risk.impact];
                const tone = scoreColor(score);
                const reviewOverdue =
                  risk.reviewDate && new Date(risk.reviewDate) < new Date() && risk.status !== "closed";
                return (
                  <tr key={risk.id}>
                    <td className="font-mono text-[11px] text-txt-muted">{risk.reference}</td>
                    <td>
                      <button
                        type="button"
                        onClick={() => openEdit(risk)}
                        className="block w-full text-left transition hover:text-accent"
                      >
                        <div className="font-medium text-sm text-txt">{risk.title || "Untitled risk"}</div>
                        {risk.description ? (
                          <div className="mt-0.5 text-[11px] text-txt-dim line-clamp-1">{risk.description}</div>
                        ) : null}
                      </button>
                    </td>
                    <td className="text-xs">{categoryLabels[risk.category]}</td>
                    <td>
                      <div className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tone.bg} ${tone.border} ${tone.text}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${tone.swatch}`} />
                        {scoreLabel(score)} {score}
                      </div>
                    </td>
                    <td className="text-xs">{risk.owner || "—"}</td>
                    <td className={`text-xs ${reviewOverdue ? "text-err font-semibold" : ""}`}>
                      {risk.reviewDate || "—"}
                      {reviewOverdue ? <span className="ml-1 text-[10px]">overdue</span> : null}
                    </td>
                    <td>
                      <Badge color={statusColors[risk.status]}>{statusLabels[risk.status]}</Badge>
                    </td>
                    <td>
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => duplicateRisk(risk.id)}
                          className="rounded-md p-1.5 text-txt-dim transition hover:bg-bg-hover hover:text-accent"
                          title="Duplicate"
                        >
                          <Copy size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => openEdit(risk)}
                          className="rounded-md p-1.5 text-txt-dim transition hover:bg-bg-hover hover:text-accent"
                          title="Edit"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(risk)}
                          className="rounded-md p-1.5 text-txt-dim transition hover:bg-err/10 hover:text-err"
                          title="Delete"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <RiskFormModal
        open={formOpen}
        initial={formInitial}
        onClose={() => {
          setFormOpen(false);
          setEditingId(null);
        }}
        onSubmit={submitForm}
      />

      {deleteTarget && (
        <Modal open={true} onClose={() => setDeleteTarget(null)} title="Delete Risk" width={420}>
          <p className="text-sm text-txt-muted mb-5">
            Are you sure you want to delete <strong>{deleteTarget.reference} — {deleteTarget.title || "Untitled risk"}</strong>?
            This action cannot be undone.
          </p>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                deleteRisk(deleteTarget.id);
                setDeleteTarget(null);
              }}
            >
              <Trash2 size={14} /> Delete
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
