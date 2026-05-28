"use client";

import { useMemo, useState } from "react";
import {
  Copy,
  Mail,
  Pencil,
  Phone,
  Plus,
  Search,
  Trash2,
  Users,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import type {
  RiskLevel,
  Stakeholder,
  StakeholderType,
} from "@/lib/supabase";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Badge from "@/components/ui/Badge";

const typeLabels: Record<StakeholderType, string> = {
  internal: "Internal",
  client: "Client",
  vendor: "Vendor",
  regulator: "Regulator",
  community: "Community",
  partner: "Partner",
  other: "Other",
};

const levelLabels: Record<RiskLevel, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

const levelOrder: Record<RiskLevel, number> = { low: 0, medium: 1, high: 2 };

const engagementStrategy = (influence: RiskLevel, interest: RiskLevel) => {
  if (influence === "high" && interest === "high") return { label: "Manage closely", color: "text-err" };
  if (influence === "high" && interest === "medium") return { label: "Manage closely", color: "text-err" };
  if (influence === "high") return { label: "Keep satisfied", color: "text-warn" };
  if (interest === "high") return { label: "Keep informed", color: "text-accent" };
  return { label: "Monitor", color: "text-ok" };
};

interface StakeholderFormState {
  id?: string;
  name: string;
  organization: string;
  role: string;
  type: StakeholderType;
  email: string;
  phone: string;
  influence: RiskLevel;
  interest: RiskLevel;
  engagementNotes: string;
  active: boolean;
}

const emptyFormState = (): StakeholderFormState => ({
  name: "",
  organization: "",
  role: "",
  type: "internal",
  email: "",
  phone: "",
  influence: "medium",
  interest: "medium",
  engagementNotes: "",
  active: true,
});

function StakeholderFormModal({
  open,
  initial,
  onClose,
  onSubmit,
}: {
  open: boolean;
  initial: StakeholderFormState;
  onClose: () => void;
  onSubmit: (form: StakeholderFormState) => void;
}) {
  const [form, setForm] = useState<StakeholderFormState>(initial);

  useMemo(() => {
    setForm(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial.id, open]);

  const update = <K extends keyof StakeholderFormState>(key: K, value: StakeholderFormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const strategy = engagementStrategy(form.influence, form.interest);

  return (
    <Modal open={open} onClose={onClose} title={initial.id ? "Edit Stakeholder" : "Add Stakeholder"} width={640}>
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-muted">
              Name
            </label>
            <input
              autoFocus
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="Full name"
              className="w-full rounded-lg border border-border bg-bg-input px-3 py-2.5 text-sm text-txt outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-muted">
              Role / Title
            </label>
            <input
              value={form.role}
              onChange={(e) => update("role", e.target.value)}
              placeholder="e.g. Project Sponsor"
              className="w-full rounded-lg border border-border bg-bg-input px-3 py-2.5 text-sm text-txt outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-muted">
              Organization
            </label>
            <input
              value={form.organization}
              onChange={(e) => update("organization", e.target.value)}
              placeholder="Company / department"
              className="w-full rounded-lg border border-border bg-bg-input px-3 py-2.5 text-sm text-txt outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-muted">
              Type
            </label>
            <select
              value={form.type}
              onChange={(e) => update("type", e.target.value as StakeholderType)}
              className="w-full rounded-lg border border-border bg-bg-input px-3 py-2 text-sm text-txt outline-none focus:border-accent"
            >
              {(Object.keys(typeLabels) as StakeholderType[]).map((t) => (
                <option key={t} value={t}>{typeLabels[t]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-muted">
              Email
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
              placeholder="name@company.com"
              className="w-full rounded-lg border border-border bg-bg-input px-3 py-2.5 text-sm text-txt outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-muted">
              Phone
            </label>
            <input
              value={form.phone}
              onChange={(e) => update("phone", e.target.value)}
              placeholder="+1 555 0000"
              className="w-full rounded-lg border border-border bg-bg-input px-3 py-2.5 text-sm text-txt outline-none focus:border-accent"
            />
          </div>
        </div>

        <div className="rounded-xl border border-border bg-bg-surface/70 p-3">
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-muted">
            <span>Engagement strategy</span>
            <span className={strategy.color}>{strategy.label}</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-txt-dim">
                Influence
              </label>
              <select
                value={form.influence}
                onChange={(e) => update("influence", e.target.value as RiskLevel)}
                className="w-full rounded-lg border border-border bg-bg-input px-3 py-2 text-sm text-txt outline-none focus:border-accent"
              >
                {(Object.keys(levelLabels) as RiskLevel[]).map((lvl) => (
                  <option key={lvl} value={lvl}>{levelLabels[lvl]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-txt-dim">
                Interest
              </label>
              <select
                value={form.interest}
                onChange={(e) => update("interest", e.target.value as RiskLevel)}
                className="w-full rounded-lg border border-border bg-bg-input px-3 py-2 text-sm text-txt outline-none focus:border-accent"
              >
                {(Object.keys(levelLabels) as RiskLevel[]).map((lvl) => (
                  <option key={lvl} value={lvl}>{levelLabels[lvl]}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-muted">
            Engagement notes
          </label>
          <textarea
            value={form.engagementNotes}
            onChange={(e) => update("engagementNotes", e.target.value)}
            rows={3}
            placeholder="Communication cadence, key concerns, hooks..."
            className="w-full resize-y rounded-lg border border-border bg-bg-input px-3 py-2 text-sm text-txt outline-none focus:border-accent"
          />
        </div>

        <label className="flex items-center gap-2 text-xs text-txt-muted">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => update("active", e.target.checked)}
            className="h-4 w-4 rounded border-border bg-bg-input accent-accent"
          />
          Active stakeholder
        </label>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!form.name.trim()}
            onClick={() => onSubmit(form)}
          >
            {initial.id ? <><Pencil size={14} /> Save changes</> : <><Plus size={14} /> Add stakeholder</>}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default function StakeholderLogModule() {
  const {
    project,
    stakeholders,
    addStakeholder,
    updateStakeholder,
    deleteStakeholder,
    duplicateStakeholder,
  } = useAppStore();

  const projectStakeholders = useMemo(
    () => stakeholders.filter((s) => s.project_id === project?.id),
    [stakeholders, project?.id],
  );

  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formInitial, setFormInitial] = useState<StakeholderFormState>(emptyFormState());
  const [deleteTarget, setDeleteTarget] = useState<Stakeholder | null>(null);
  const [typeFilter, setTypeFilter] = useState<StakeholderType | "all">("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return projectStakeholders
      .filter((s) => {
        if (typeFilter !== "all" && s.type !== typeFilter) return false;
        if (q && !`${s.name} ${s.organization} ${s.role} ${s.email}`.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => {
        // Sort by influence × interest score, descending
        const sa = levelOrder[a.influence] + levelOrder[a.interest];
        const sb = levelOrder[b.influence] + levelOrder[b.interest];
        return sb - sa;
      });
  }, [projectStakeholders, typeFilter, search]);

  const openAdd = () => {
    setEditingId(null);
    setFormInitial(emptyFormState());
    setFormOpen(true);
  };

  const openEdit = (stakeholder: Stakeholder) => {
    setEditingId(stakeholder.id);
    setFormInitial({
      id: stakeholder.id,
      name: stakeholder.name,
      organization: stakeholder.organization,
      role: stakeholder.role,
      type: stakeholder.type,
      email: stakeholder.email,
      phone: stakeholder.phone,
      influence: stakeholder.influence,
      interest: stakeholder.interest,
      engagementNotes: stakeholder.engagementNotes,
      active: stakeholder.active,
    });
    setFormOpen(true);
  };

  const submitForm = (form: StakeholderFormState) => {
    if (editingId) {
      updateStakeholder(editingId, {
        name: form.name.trim(),
        organization: form.organization,
        role: form.role,
        type: form.type,
        email: form.email,
        phone: form.phone,
        influence: form.influence,
        interest: form.interest,
        engagementNotes: form.engagementNotes,
        active: form.active,
      });
    } else {
      addStakeholder({
        name: form.name.trim(),
        organization: form.organization,
        role: form.role,
        type: form.type,
        email: form.email,
        phone: form.phone,
        influence: form.influence,
        interest: form.interest,
        engagementNotes: form.engagementNotes,
        active: form.active,
      });
    }
    setFormOpen(false);
    setEditingId(null);
  };

  return (
    <div className="animate-fade-in">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Stakeholder Log</h2>
          <p className="mt-0.5 text-xs text-txt-muted">
            Track who's involved, their interests, and how to engage with them.
          </p>
        </div>
        <Button size="sm" variant="primary" onClick={openAdd}>
          <Plus size={14} /> Add stakeholder
        </Button>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-txt-dim" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search stakeholders…"
            className="w-full rounded-lg border border-border bg-bg-input pl-8 pr-3 py-2 text-sm text-txt outline-none focus:border-accent"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as StakeholderType | "all")}
          className="rounded-lg border border-border bg-bg-input px-3 py-2 text-sm text-txt outline-none focus:border-accent"
        >
          <option value="all">All types</option>
          {(Object.keys(typeLabels) as StakeholderType[]).map((t) => (
            <option key={t} value={t}>{typeLabels[t]}</option>
          ))}
        </select>
      </div>

      {projectStakeholders.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-bg-surface/80 px-6 py-16 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-xl bg-accent/10">
            <Users size={24} className="text-accent opacity-70" />
          </div>
          <p className="text-sm font-semibold text-txt">No stakeholders logged yet</p>
          <p className="mt-1 text-xs text-txt-muted">
            Track who's involved so you can plan communication and engagement effectively.
          </p>
          <Button variant="primary" size="md" className="mt-4" onClick={openAdd}>
            <Plus size={14} /> Add first stakeholder
          </Button>
        </div>
      ) : (
        <div className="data-table-shell overflow-auto">
          <table className="data-table" style={{ minWidth: 940 }}>
            <thead>
              <tr>
                <th>Name</th>
                <th style={{ width: 140 }}>Organization</th>
                <th style={{ width: 110 }}>Type</th>
                <th style={{ width: 140 }}>Contact</th>
                <th style={{ width: 170 }}>Engagement</th>
                <th style={{ width: 90 }}>Status</th>
                <th style={{ width: 100 }} className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((stakeholder) => {
                const strategy = engagementStrategy(stakeholder.influence, stakeholder.interest);
                return (
                  <tr key={stakeholder.id}>
                    <td>
                      <button
                        type="button"
                        onClick={() => openEdit(stakeholder)}
                        className="block w-full text-left transition hover:text-accent"
                      >
                        <div className="font-medium text-sm text-txt">{stakeholder.name || "Untitled"}</div>
                        {stakeholder.role ? (
                          <div className="mt-0.5 text-[11px] text-txt-dim">{stakeholder.role}</div>
                        ) : null}
                      </button>
                    </td>
                    <td className="text-xs">{stakeholder.organization || "—"}</td>
                    <td className="text-xs">{typeLabels[stakeholder.type]}</td>
                    <td>
                      <div className="flex flex-col gap-0.5 text-[11px]">
                        {stakeholder.email ? (
                          <a href={`mailto:${stakeholder.email}`} className="inline-flex items-center gap-1 text-accent hover:underline">
                            <Mail size={11} /> {stakeholder.email}
                          </a>
                        ) : null}
                        {stakeholder.phone ? (
                          <span className="inline-flex items-center gap-1 text-txt-dim">
                            <Phone size={11} /> {stakeholder.phone}
                          </span>
                        ) : null}
                        {!stakeholder.email && !stakeholder.phone ? <span className="text-txt-dim">—</span> : null}
                      </div>
                    </td>
                    <td>
                      <div className={`text-[11px] font-semibold ${strategy.color}`}>{strategy.label}</div>
                      <div className="mt-0.5 text-[10px] text-txt-dim">
                        Inf. {levelLabels[stakeholder.influence]} · Int. {levelLabels[stakeholder.interest]}
                      </div>
                    </td>
                    <td>
                      <Badge color={stakeholder.active ? "ok" : "warn"}>
                        {stakeholder.active ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td>
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => duplicateStakeholder(stakeholder.id)}
                          className="rounded-md p-1.5 text-txt-dim transition hover:bg-bg-hover hover:text-accent"
                          title="Duplicate"
                        >
                          <Copy size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => openEdit(stakeholder)}
                          className="rounded-md p-1.5 text-txt-dim transition hover:bg-bg-hover hover:text-accent"
                          title="Edit"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(stakeholder)}
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

      <StakeholderFormModal
        open={formOpen}
        initial={formInitial}
        onClose={() => {
          setFormOpen(false);
          setEditingId(null);
        }}
        onSubmit={submitForm}
      />

      {deleteTarget && (
        <Modal open={true} onClose={() => setDeleteTarget(null)} title="Delete Stakeholder" width={420}>
          <p className="text-sm text-txt-muted mb-5">
            Are you sure you want to delete <strong>{deleteTarget.name || "this stakeholder"}</strong>? This action cannot be undone.
          </p>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                deleteStakeholder(deleteTarget.id);
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
