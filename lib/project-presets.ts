/**
 * Project preset catalogue.
 *
 * Presets let a new user pick the kind of work they do ("Construction project",
 * "Consulting engagement", "Development program", "Internal project", "Other")
 * and have the create-project form pre-fill sensible defaults — project type, role,
 * suggested category — without needing to choose each one manually.
 *
 * The preset id is also persisted on Project.preset so the dashboard can show a small
 * badge at-a-glance. The id is purely informational at runtime — the app's behavior is
 * driven by Project.type (construction vs non-construction), which every preset sets.
 */

import type { Project } from "./supabase";

export type ProjectPresetId =
  | "construction"
  | "consulting"
  | "program"
  | "internal"
  | "other";

export interface ProjectPreset {
  id: ProjectPresetId;
  /** Card title shown in the picker. */
  title: string;
  /** One-line blurb under the title. */
  blurb: string;
  /** Longer descriptive text shown below the card grid when this preset is selected. */
  helper: string;
  /** Drives module gating (BOQ, FIDIC docs, drawings, site notes). */
  type: Project["type"];
  /** Default project authority role for this preset. */
  defaultRole: Project["role"];
  /** Suggested categoryName placeholder shown in the form. */
  suggestedCategory: string;
  /** Short label used on the preset badge in the dashboard. */
  badgeLabel: string;
  /** Optional emoji or short visual marker to distinguish the card at a glance. */
  marker: string;
}

export const PROJECT_PRESETS: ProjectPreset[] = [
  {
    id: "construction",
    title: "Construction project",
    blurb: "Civil / building works · BOQ, FIDIC payments, drawings, site supervision",
    helper:
      "Full kit — BOQ, payment certificates, drawings, site notes, and FIDIC document templates. Best for engineering consultancies, contractors, and project supervisors managing physical works.",
    type: "construction",
    defaultRole: "supervision",
    suggestedCategory: "Civil works",
    badgeLabel: "Construction",
    marker: "🏗",
  },
  {
    id: "consulting",
    title: "Consulting engagement",
    blurb: "Professional services · deliverables, milestone invoicing, reports",
    helper:
      "Deliverables-based work for clients — perfect for consulting firms, design studios, advisory engagements. Hides construction modules; surfaces invoicing and status reports.",
    type: "non-construction",
    defaultRole: "supervision",
    suggestedCategory: "Consulting",
    badgeLabel: "Consulting",
    marker: "💼",
  },
  {
    id: "program",
    title: "Development program",
    blurb: "NGO / public sector · milestones, grant reports, M&E",
    helper:
      "Program- and milestone-based work where reporting and accountability matter. Used by NGOs, donor-funded programs, public-sector projects. Same lean kit as Consulting, with stakeholder log front-and-center.",
    type: "non-construction",
    defaultRole: "employer",
    suggestedCategory: "Development program",
    badgeLabel: "Program",
    marker: "🌍",
  },
  {
    id: "internal",
    title: "Internal project",
    blurb: "In-house initiative · status reports, action points, meetings",
    helper:
      "Cross-functional or transformation work inside an organization. Lean toolset focused on schedule, status updates, action points, and stakeholder log.",
    type: "non-construction",
    defaultRole: "employer",
    suggestedCategory: "Internal initiative",
    badgeLabel: "Internal",
    marker: "🧭",
  },
  {
    id: "other",
    title: "Other project",
    blurb: "Generic project — minimal universal core",
    helper:
      "If none of the others fit. Same universal core: schedule, progress, meetings, documents, risks, stakeholders, checklist. You can change details any time.",
    type: "non-construction",
    defaultRole: "supervision",
    suggestedCategory: "",
    badgeLabel: "Other",
    marker: "✦",
  },
];

export const DEFAULT_PRESET_ID: ProjectPresetId = "construction";

/**
 * Look up a preset by id. Falls back to "construction" so the legacy projects
 * (created before presets existed) still resolve to a sensible default.
 */
export function getProjectPreset(
  id: ProjectPresetId | string | null | undefined,
): ProjectPreset {
  return (
    PROJECT_PRESETS.find((preset) => preset.id === id) ||
    PROJECT_PRESETS.find((preset) => preset.id === DEFAULT_PRESET_ID)!
  );
}

/**
 * Best-effort guess of a preset for a project that doesn't have one stored.
 * Construction-type projects → "construction"; non-construction → "other".
 * Used purely to render a placeholder badge when the user looks at legacy data.
 */
export function inferPresetFromType(type: Project["type"]): ProjectPreset {
  return type === "construction"
    ? getProjectPreset("construction")
    : getProjectPreset("other");
}
