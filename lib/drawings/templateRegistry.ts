// ------------------------------------------------------------------
// Schema-driven parametric drawing templates.
//
// A template is a pure definition: a parameter schema plus an SVG
// generator. The dimension-editing UI is generated automatically from
// the schema, so adding a new library part means adding ONE entry to a
// template file — no new TypeScript types, normalizers, or editor UI.
// ------------------------------------------------------------------

export type TemplateParamDef =
  | {
      key: string;
      label: string;
      type: "number";
      /** Display unit, e.g. "mm", "m", "%", "no." */
      unit?: string;
      min: number;
      max: number;
      step?: number;
      integer?: boolean;
      default: number;
    }
  | {
      key: string;
      label: string;
      type: "select";
      options: Array<{ value: string; label: string }>;
      default: string;
    };

export type TemplateParamValues = Record<string, number | string>;

export type TemplateCategory =
  | "layouts"
  | "structural"
  | "mechanical"
  | "electrical"
  | "civil"
  | "details";

export interface TemplatePreset {
  id: string;
  name: string;
  description: string;
  tags?: string[];
  values?: Partial<TemplateParamValues>;
}

export interface DrawingTemplate {
  /** Unique kind id, e.g. "road-dual-carriageway". Stored on canvas objects. */
  kind: string;
  label: string;
  category: TemplateCategory;
  description: string;
  tags: string[];
  assetType: "object" | "drawing";
  params: TemplateParamDef[];
  generate: (values: TemplateParamValues) => string;
  /** Ready-to-insert presets surfaced as library items. */
  presets?: TemplatePreset[];
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export function normalizeTemplateValues(
  template: DrawingTemplate,
  input?: Partial<TemplateParamValues>,
): TemplateParamValues {
  const values: TemplateParamValues = {};
  for (const def of template.params) {
    const raw = input?.[def.key];
    if (def.type === "number") {
      const num = typeof raw === "number" ? raw : typeof raw === "string" ? parseFloat(raw) : NaN;
      let next = Number.isFinite(num) ? clamp(num, def.min, def.max) : def.default;
      if (def.integer) next = Math.round(next);
      values[def.key] = next;
    } else {
      const valid = def.options.some((option) => option.value === raw);
      values[def.key] = valid ? (raw as string) : def.default;
    }
  }
  return values;
}

// ------------------------------------------------------------------
// Registry
// ------------------------------------------------------------------
import { ROAD_TEMPLATES } from "./templates/roads";
import { STRUCTURAL_TEMPLATES } from "./templates/structural";
import { DRAINAGE_TEMPLATES } from "./templates/drainage";
import { WATER_TEMPLATES } from "./templates/water";

export const DRAWING_TEMPLATES: DrawingTemplate[] = [
  ...ROAD_TEMPLATES,
  ...STRUCTURAL_TEMPLATES,
  ...DRAINAGE_TEMPLATES,
  ...WATER_TEMPLATES,
];

export const TEMPLATE_REGISTRY: Record<string, DrawingTemplate> = Object.fromEntries(
  DRAWING_TEMPLATES.map((template) => [template.kind, template]),
);

export function getTemplate(kind: string): DrawingTemplate | undefined {
  return TEMPLATE_REGISTRY[kind];
}

export function createTemplateSvg(kind: string, input?: Partial<TemplateParamValues>): string {
  const template = TEMPLATE_REGISTRY[kind];
  if (!template) throw new Error(`Unknown drawing template: ${kind}`);
  return template.generate(normalizeTemplateValues(template, input));
}
