import type { SavedWorkPlan, WorkPlanActivity } from "@/lib/supabase";

/**
 * Milestone achievement logic for the work plan. A milestone is a user-flagged
 * activity or section header (`isMilestone`). It counts as *achieved* when its
 * work is 100% done:
 *  - an activity milestone → its own status is "completed";
 *  - a section milestone   → every child activity under it (up to the next
 *    section) is completed, OR the section's own status is "completed".
 *
 * Keep this pure and dependency-free so both the work-plan table and the
 * dashboard can share it without pulling in the store.
 */

const isSectionRow = (activity: WorkPlanActivity) => (activity.rowType || "activity") === "section";

export function isWorkPlanRowAchieved(activities: WorkPlanActivity[], index: number): boolean {
  const row = activities[index];
  if (!row) return false;
  if (!isSectionRow(row)) return row.status === "completed";

  if (row.status === "completed") return true;
  // Section rollup: scan child activities until the next section header.
  let sawChild = false;
  for (let j = index + 1; j < activities.length; j++) {
    if (isSectionRow(activities[j])) break;
    sawChild = true;
    if (activities[j].status !== "completed") return false;
  }
  return sawChild;
}

export interface AchievedMilestone {
  id: string;
  description: string;
  /** Date the milestone work was scheduled to finish — used as the "achieved on" date. */
  date: string;
  isSection: boolean;
  sheetName: string;
}

/**
 * Collect every achieved milestone across a project's saved work plans, most
 * recent first (by end date). One pass per sheet; no sorting until the end.
 */
export function collectAchievedMilestones(
  savedWorkPlans: SavedWorkPlan[],
  projectId: string,
): AchievedMilestone[] {
  const achieved: AchievedMilestone[] = [];
  for (const workPlan of savedWorkPlans) {
    if (workPlan.project_id !== projectId) continue;
    for (const sheet of workPlan.sheets) {
      const activities = sheet.activities;
      for (let i = 0; i < activities.length; i++) {
        const row = activities[i];
        if (!row.isMilestone) continue;
        if (!isWorkPlanRowAchieved(activities, i)) continue;
        achieved.push({
          id: row.id,
          description: row.description || "Untitled milestone",
          date: row.endDate || "",
          isSection: isSectionRow(row),
          sheetName: sheet.name,
        });
      }
    }
  }
  // Most recent achievement first; undated milestones sink to the bottom.
  return achieved.sort((a, b) => (b.date || "0000").localeCompare(a.date || "0000"));
}

/** Total milestones flagged on a project (achieved or not) — for "X of Y" copy. */
export function countFlaggedMilestones(savedWorkPlans: SavedWorkPlan[], projectId: string): number {
  let count = 0;
  for (const workPlan of savedWorkPlans) {
    if (workPlan.project_id !== projectId) continue;
    for (const sheet of workPlan.sheets) {
      for (const activity of sheet.activities) {
        if (activity.isMilestone) count++;
      }
    }
  }
  return count;
}
