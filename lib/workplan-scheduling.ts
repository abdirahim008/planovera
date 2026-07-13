// MS Project-style finish-to-start dependency scheduling for the work plan.
//
// Users see and type ROW NUMBERS (the "#" column: every row, sections included,
// numbered from 1). Internally a link stores the predecessor activity's stable
// UUID, so inserting/deleting/moving rows never breaks a link — the displayed
// numbers simply re-derive from the new row positions.
//
// Date convention (matches the store): endDate is INCLUSIVE —
// end = start + duration − 1 — so a successor starts the day AFTER its latest
// predecessor finishes.

import type { WorkPlanActivity } from "@/lib/supabase";

const parseISO = (dateStr: string): Date | null => {
  if (!dateStr) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!m) return null;
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(dt.getTime()) ? null : dt;
};

const formatISO = (d: Date): string => {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
};

const shiftISO = (dateStr: string, days: number): string => {
  const d = parseISO(dateStr);
  if (!d) return "";
  d.setDate(d.getDate() + days);
  return formatISO(d);
};

/** Inclusive end date for an activity: explicit endDate, else start + duration − 1. */
const effectiveEnd = (a: WorkPlanActivity): string => {
  if (a.endDate) return a.endDate;
  const days = parseInt(a.duration, 10);
  if (a.startDate && Number.isFinite(days) && days > 0) return shiftISO(a.startDate, days - 1);
  return "";
};

/** Row numbers for the "#" column: every row (sections included), 1-based. */
export function computeRowNumbers(activities: WorkPlanActivity[]): Map<string, number> {
  const map = new Map<string, number>();
  activities.forEach((a, idx) => map.set(a.id, idx + 1));
  return map;
}

/** Display string for the predecessor cell, e.g. "3, 5". Drops dangling links. */
export function formatPredecessors(
  activity: WorkPlanActivity,
  rowNumbers: Map<string, number>,
): string {
  return (activity.predecessorIds ?? [])
    .map((id) => rowNumbers.get(id))
    .filter((n): n is number => typeof n === "number")
    .join(", ");
}

/**
 * Would linking `selfId` to `newPredIds` create a dependency cycle? Walks the
 * predecessor graph upward from each proposed predecessor.
 */
export function wouldCreateCycle(
  activities: WorkPlanActivity[],
  selfId: string,
  newPredIds: string[],
): boolean {
  const predsById = new Map<string, string[]>();
  activities.forEach((a) => predsById.set(a.id, a.predecessorIds ?? []));
  const seen = new Set<string>();
  const stack = [...newPredIds];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === selfId) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const up of predsById.get(current) ?? []) stack.push(up);
  }
  return false;
}

/**
 * Parse the user's predecessor cell input ("3" / "2, 5" / "" to clear) into
 * activity UUIDs. Returns an error string instead of throwing so the UI can
 * surface it and keep the previous value.
 */
export function parsePredecessorInput(
  input: string,
  activities: WorkPlanActivity[],
  selfId: string,
): { ids: string[] } | { error: string } {
  const trimmed = input.trim();
  if (!trimmed) return { ids: [] };

  const tokens = trimmed.split(/[,;\s]+/).filter(Boolean);
  const ids: string[] = [];
  for (const token of tokens) {
    if (!/^\d+$/.test(token)) {
      return { error: `"${token}" is not a row number. Enter row IDs like "3" or "2, 5".` };
    }
    const rowNo = Number(token);
    const target = activities[rowNo - 1];
    if (!target) return { error: `Row ${rowNo} does not exist on this sheet.` };
    if ((target.rowType || "activity") === "section") {
      return { error: `Row ${rowNo} is a section header — link to an activity row instead.` };
    }
    if (target.id === selfId) return { error: "An activity cannot be its own predecessor." };
    if (!ids.includes(target.id)) ids.push(target.id);
  }
  if (wouldCreateCycle(activities, selfId, ids)) {
    return { error: "That link would create a circular dependency." };
  }
  return { ids };
}

/**
 * Reflow the schedule through the dependency graph (finish-to-start): every
 * activity with predecessors starts the day after its latest predecessor
 * finishes; its end follows from its duration; changes cascade downstream in
 * topological order. Activities without predecessors keep their own dates.
 * Section rows are untouched (their roll-up is recalculated separately).
 */
export function cascadeSchedule(activities: WorkPlanActivity[]): WorkPlanActivity[] {
  const next = activities.map((a) => ({ ...a }));
  const byId = new Map(next.map((a) => [a.id, a]));

  // Keep only links that still resolve to activity rows.
  const validPreds = (a: WorkPlanActivity): string[] =>
    (a.predecessorIds ?? []).filter((id) => {
      const target = byId.get(id);
      return Boolean(target) && (target!.rowType || "activity") !== "section";
    });

  // Kahn topological order over the dependency edges.
  const indegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  next.forEach((a) => {
    if ((a.rowType || "activity") === "section") return;
    const preds = validPreds(a);
    indegree.set(a.id, preds.length);
    preds.forEach((p) => {
      dependents.set(p, [...(dependents.get(p) ?? []), a.id]);
    });
  });

  const queue = next
    .filter((a) => (a.rowType || "activity") !== "section" && (indegree.get(a.id) ?? 0) === 0)
    .map((a) => a.id);

  while (queue.length > 0) {
    const id = queue.shift()!;
    const activity = byId.get(id)!;
    const preds = validPreds(activity);

    if (preds.length > 0) {
      // Latest predecessor finish drives the start.
      let latestEnd = "";
      for (const predId of preds) {
        const end = effectiveEnd(byId.get(predId)!);
        if (end && (!latestEnd || end > latestEnd)) latestEnd = end;
      }
      if (latestEnd) {
        if (activity.isMilestone) {
          // Milestones are point-in-time deadlines: no start/duration, the
          // deadline itself shifts to the day after the latest predecessor.
          activity.startDate = "";
          activity.duration = "";
          activity.endDate = shiftISO(latestEnd, 1);
        } else {
          const start = shiftISO(latestEnd, 1);
          const days = parseInt(activity.duration, 10);
          activity.startDate = start;
          activity.endDate = Number.isFinite(days) && days > 0 ? shiftISO(start, days - 1) : "";
        }
      }
    }

    for (const depId of dependents.get(id) ?? []) {
      const remaining = (indegree.get(depId) ?? 1) - 1;
      indegree.set(depId, remaining);
      if (remaining === 0) queue.push(depId);
    }
  }

  return next;
}