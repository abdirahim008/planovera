"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ListChecks,
  PlayCircle,
  Trash2,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import type { ActionPoint } from "@/lib/supabase";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { type CompactKpiRow } from "@/components/ui/CompactKpiList";

const todayIso = () => new Date().toISOString().split("T")[0];

const statusBadgeColor = (status: ActionPoint["status"]) =>
  status === "closed" ? "ok" : status === "in-progress" ? "accent" : "warn";

const statusLabel = (status: ActionPoint["status"]) =>
  status === "closed" ? "Completed" : status === "in-progress" ? "In progress" : "Open";

const priorityBadgeColor = (priority: ActionPoint["priority"]) =>
  priority === "critical"
    ? "err"
    : priority === "high"
    ? "warn"
    : priority === "medium"
    ? "accent"
    : "purple";

const STATUS_OPTIONS: ActionPoint["status"][] = ["open", "in-progress", "closed"];
const PRIORITY_OPTIONS: ActionPoint["priority"][] = ["low", "medium", "high", "critical"];

export default function ActionPointsModule() {
  const actionPoints = useAppStore((state) => state.actionPoints);
  const projects = useAppStore((state) => state.projects);
  const meetingMinutes = useAppStore((state) => state.meetingMinutes);
  const updateActionPoint = useAppStore((state) => state.updateActionPoint);
  const deleteActionPoint = useAppStore((state) => state.deleteActionPoint);

  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "active" | ActionPoint["status"]>(
    "active",
  );
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const projectNameById = useMemo(
    () => Object.fromEntries(projects.map((project) => [project.id, project.name])),
    [projects],
  );

  const minuteById = useMemo(
    () => new Map(meetingMinutes.map((minute) => [minute.id, minute])),
    [meetingMinutes],
  );

  // Projects that actually have at least one action point, for the filter list.
  const projectIdsWithActions = useMemo(
    () => Array.from(new Set(actionPoints.map((point) => point.project_id))),
    [actionPoints],
  );

  const today = todayIso();

  const counts = useMemo(() => {
    let open = 0;
    let inProgress = 0;
    let completed = 0;
    let overdue = 0;
    actionPoints.forEach((point) => {
      if (point.status === "open") open += 1;
      else if (point.status === "in-progress") inProgress += 1;
      else if (point.status === "closed") completed += 1;
      if (point.status !== "closed" && point.deadline && point.deadline < today) overdue += 1;
    });
    return { total: actionPoints.length, open, inProgress, completed, overdue };
  }, [actionPoints, today]);

  // Fall back to "all" if the selected project no longer has any action points.
  const effectiveProjectFilter =
    projectFilter === "all" || projectIdsWithActions.includes(projectFilter)
      ? projectFilter
      : "all";

  const filtered = useMemo(() => {
    const statusRank = (value: ActionPoint["status"]) =>
      value === "open" ? 0 : value === "in-progress" ? 1 : 2;
    return actionPoints
      .filter((point) => effectiveProjectFilter === "all" || point.project_id === effectiveProjectFilter)
      .filter((point) => {
        if (statusFilter === "all") return true;
        if (statusFilter === "active") return point.status !== "closed";
        return point.status === statusFilter;
      })
      .sort((a, b) => {
        const statusCompare = statusRank(a.status) - statusRank(b.status);
        if (statusCompare !== 0) return statusCompare;
        return (a.deadline || "").localeCompare(b.deadline || "");
      });
  }, [actionPoints, effectiveProjectFilter, statusFilter]);

  const kpiRows: CompactKpiRow[] = [
    { label: "Total", value: counts.total, icon: ListChecks, tone: "neutral" },
    { label: "Open", value: counts.open, icon: AlertTriangle, tone: "warn" },
    { label: "In progress", value: counts.inProgress, icon: PlayCircle, tone: "accent" },
    { label: "Overdue", value: counts.overdue, icon: Clock, tone: "err" },
    { label: "Completed", value: counts.completed, icon: CheckCircle2, tone: "ok" },
  ];

  const pendingDelete = confirmDeleteId
    ? actionPoints.find((point) => point.id === confirmDeleteId) ?? null
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold text-white">Action Points</h2>
        <p className="text-sm text-txt-muted">
          The single register of action points across every project. Meetings read open items
          from here and write status changes back, so this is the source of truth.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {kpiRows.map((row) => {
          const Icon = row.icon;
          return (
            <div
              key={row.label}
              className="rounded-2xl border border-border bg-bg-surface px-4 py-3"
            >
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-txt-dim">
                {Icon ? <Icon size={13} /> : null}
                {row.label}
              </div>
              <div className="mt-1 text-2xl font-semibold text-white tabular-nums">{row.value}</div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex flex-col gap-1.5 sm:max-w-xs sm:flex-1">
          <label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">
            Filter by project
          </label>
          <select
            value={effectiveProjectFilter}
            onChange={(event) => setProjectFilter(event.target.value)}
            className="w-full rounded-xl border border-border bg-bg-input px-4 py-2.5 text-sm text-txt outline-none transition focus:border-accent"
          >
            <option value="all">All projects ({actionPoints.length})</option>
            {projectIdsWithActions.map((projectId) => {
              const count = actionPoints.filter((point) => point.project_id === projectId).length;
              return (
                <option key={projectId} value={projectId}>
                  {projectNameById[projectId] || "Unassigned project"} ({count})
                </option>
              );
            })}
          </select>
        </div>
        <div className="flex flex-col gap-1.5 sm:max-w-xs sm:flex-1">
          <label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">
            Filter by status
          </label>
          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as typeof statusFilter)
            }
            className="w-full rounded-xl border border-border bg-bg-input px-4 py-2.5 text-sm text-txt outline-none transition focus:border-accent"
          >
            <option value="active">Open + in progress</option>
            <option value="open">Open</option>
            <option value="in-progress">In progress</option>
            <option value="closed">Completed</option>
            <option value="all">All statuses</option>
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-txt-muted">
          No action points match these filters. Action points are raised inside meetings and
          collected here automatically.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((point) => {
            const overdue =
              point.status !== "closed" && point.deadline && point.deadline < today;
            const originMinute = point.lastMeetingId
              ? minuteById.get(point.lastMeetingId)
              : undefined;
            return (
              <div
                key={point.id}
                className="rounded-2xl border border-border bg-bg-raised p-4"
              >
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge color={statusBadgeColor(point.status)}>
                        {statusLabel(point.status).toUpperCase()}
                      </Badge>
                      <Badge color={priorityBadgeColor(point.priority)}>
                        {point.priority.toUpperCase()}
                      </Badge>
                      {overdue ? <Badge color="err">OVERDUE</Badge> : null}
                    </div>
                    <div className="mt-2 text-xs text-txt-muted">
                      {projectNameById[point.project_id] || "Unassigned project"}
                      {originMinute ? ` • ${originMinute.title}` : ""}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(point.id)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-transparent text-txt-dim transition hover:border-err/30 hover:text-err"
                    aria-label="Delete action point"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                <textarea
                  value={point.description}
                  onChange={(event) =>
                    updateActionPoint(point.id, { description: event.target.value })
                  }
                  className="min-h-[64px] w-full resize-y rounded-xl border border-transparent bg-transparent px-3 py-2.5 text-sm leading-6 text-txt outline-none transition hover:bg-black/10 focus:border-accent/40 focus:bg-black/10"
                  placeholder="Action point description"
                />

                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <input
                    value={point.responsiblePerson}
                    onChange={(event) =>
                      updateActionPoint(point.id, { responsiblePerson: event.target.value })
                    }
                    className="w-full rounded-xl border border-border bg-bg-input px-3 py-2.5 text-sm text-txt outline-none transition focus:border-accent"
                    placeholder="Responsible person"
                  />
                  <input
                    type="date"
                    value={point.deadline}
                    onChange={(event) =>
                      updateActionPoint(point.id, { deadline: event.target.value })
                    }
                    className="w-full rounded-xl border border-border bg-bg-input px-3 py-2.5 text-sm text-txt outline-none transition focus:border-accent"
                  />
                  <select
                    value={point.priority}
                    onChange={(event) =>
                      updateActionPoint(point.id, {
                        priority: event.target.value as ActionPoint["priority"],
                      })
                    }
                    className="w-full rounded-xl border border-border bg-bg-input px-3 py-2.5 text-sm text-txt outline-none transition focus:border-accent"
                  >
                    {PRIORITY_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option.charAt(0).toUpperCase() + option.slice(1)} priority
                      </option>
                    ))}
                  </select>
                  <select
                    value={point.status}
                    onChange={(event) =>
                      updateActionPoint(point.id, {
                        status: event.target.value as ActionPoint["status"],
                      })
                    }
                    className="w-full rounded-xl border border-border bg-bg-input px-3 py-2.5 text-sm text-txt outline-none transition focus:border-accent"
                  >
                    {STATUS_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {statusLabel(option)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={Boolean(pendingDelete)}
        onClose={() => setConfirmDeleteId(null)}
        title="Delete action point"
        width={420}
      >
        <p className="mb-5 text-sm text-txt-muted">
          Remove this action point from the register? It will no longer carry forward into new
          meetings. Past meeting records keep their own copy.
        </p>
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={() => setConfirmDeleteId(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (confirmDeleteId) deleteActionPoint(confirmDeleteId);
              setConfirmDeleteId(null);
            }}
          >
            Delete
          </Button>
        </div>
      </Modal>
    </div>
  );
}
