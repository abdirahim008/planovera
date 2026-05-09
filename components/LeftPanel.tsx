"use client";

import { useMemo, useState } from "react";
import type { TitleBlockData } from "@/lib/fabricHelpers";
import { PATTERNS, PatternType } from "@/lib/patterns";
import {
  ADMIN_SVG_TEMPLATES,
  DETAIL_BLOCKS,
  LIBRARY_CATEGORIES,
  LibraryCategory,
  LibraryItem,
  SavedProject,
  UserSession,
  parseTags,
} from "@/lib/appModel";

interface LeftPanelProps {
  session: UserSession;
  projectName: string;
  onProjectNameChange: (name: string) => void;
  libraryItems: LibraryItem[];
  savedProjects: SavedProject[];
  activeProjectId: string | null;
  selectedCount: number;
  statusMessage: string | null;
  titleBlockData: TitleBlockData;
  setTitleBlockData: (data: TitleBlockData) => void;
  onAddSvg: (svg: string) => void;
  onApplyTitleBlock: () => void;
  onRemoveTitleBlock: () => void;
  onApplyPattern: (id: PatternType, scale: number, color: string) => void;
  onUpdateStroke: (color: string, width: number, enabled: boolean) => void;
  onSaveProject: () => void;
  onOpenProject: (project: SavedProject) => void;
  onDeleteProject: (projectId: string) => void;
  onPublishRawSvg: (payload: {
    name: string;
    category: LibraryCategory;
    description: string;
    tags: string[];
    svg: string;
  }) => void;
  onPublishCanvasToLibrary: (payload: {
    name: string;
    category: LibraryCategory;
    description: string;
    tags: string[];
  }) => void;
}

type PanelTab = "library" | "details" | "projects" | "admin";

export default function LeftPanel({
  session,
  projectName,
  onProjectNameChange,
  libraryItems,
  savedProjects,
  activeProjectId,
  selectedCount,
  statusMessage,
  titleBlockData,
  setTitleBlockData,
  onAddSvg,
  onApplyTitleBlock,
  onRemoveTitleBlock,
  onApplyPattern,
  onUpdateStroke,
  onSaveProject,
  onOpenProject,
  onDeleteProject,
  onPublishRawSvg,
  onPublishCanvasToLibrary,
}: LeftPanelProps) {
  const isAdmin = session.role === "admin";
  const tabs: Array<{ id: PanelTab; label: string }> = [
    { id: "library", label: "Library" },
    { id: "details", label: "Drafting" },
    { id: "projects", label: "Projects" },
    ...(isAdmin ? [{ id: "admin" as const, label: "Publish" }] : []),
  ];

  const [tab, setTab] = useState<PanelTab>("library");
  const [libraryQuery, setLibraryQuery] = useState("");
  const [libraryCategory, setLibraryCategory] = useState<LibraryCategory | "all">("all");
  const [hatchScale, setHatchScale] = useState(1);
  const [hatchColor, setHatchColor] = useState("#0f172a");
  const [strokeColor, setStrokeColor] = useState("#0f172a");
  const [strokeWidth, setStrokeWidth] = useState(1.2);
  const [hasStroke, setHasStroke] = useState(true);
  const [svgText, setSvgText] = useState("");
  const [publishName, setPublishName] = useState("Library Drawing");
  const [publishCategory, setPublishCategory] = useState<LibraryCategory>("details");
  const [publishDescription, setPublishDescription] = useState(
    "Editable drawing block prepared by the admin studio.",
  );
  const [publishTags, setPublishTags] = useState("library, editable, drawing");

  const filteredItems = useMemo(() => {
    const needle = libraryQuery.trim().toLowerCase();
    return libraryItems.filter((item) => {
      const categoryMatch = libraryCategory === "all" || item.category === libraryCategory;
      if (!categoryMatch) return false;
      if (!needle) return true;
      const haystack = [item.name, item.description, ...item.tags, item.author].join(" ").toLowerCase();
      return haystack.includes(needle);
    });
  }, [libraryCategory, libraryItems, libraryQuery]);

  const updateTitleBlock = <K extends keyof TitleBlockData>(
    key: K,
    value: TitleBlockData[K],
  ) => setTitleBlockData({ ...titleBlockData, [key]: value });

  return (
    <aside className="panel-shell flex w-[360px] min-w-[320px] flex-col overflow-hidden border-r border-slate-200/80 bg-white/82 backdrop-blur-xl">
      <div className="border-b border-slate-200/80 px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-500">
              Workspace Panel
            </p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">
              {isAdmin ? "Drafting, SVG import, and publishing" : "Drafting, SVG import, and project tools"}
            </h2>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-right">
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
              Selection
            </div>
            <div className="text-sm font-semibold text-slate-900">
              {selectedCount > 0 ? selectedCount : 0}
            </div>
          </div>
        </div>

        {statusMessage ? (
          <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
            {statusMessage}
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-4 gap-1 border-b border-slate-200/80 bg-slate-50/80 p-2">
        {tabs.map((item) => (
          <button
            key={item.id}
            className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
              tab === item.id
                ? "bg-slate-900 text-white shadow-[0_10px_24px_rgba(15,23,42,0.18)]"
                : "text-slate-600 hover:bg-white hover:text-slate-900"
            }`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        {tab === "library" ? (
          <div className="space-y-5">
            <div className="space-y-3">
              <div>
                <label className="label">Search library</label>
                <input
                  className="input"
                  value={libraryQuery}
                  onChange={(event) => setLibraryQuery(event.target.value)}
                  placeholder="Search layouts, symbols, equipment"
                />
              </div>

              <div>
                <label className="label">Category</label>
                <select
                  className="input"
                  value={libraryCategory}
                  onChange={(event) => setLibraryCategory(event.target.value as LibraryCategory | "all")}
                >
                  <option value="all">All categories</option>
                  {LIBRARY_CATEGORIES.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                Ready-to-edit drawings
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Bring a starting block into the sheet, then stretch, annotate, trim, dimension, and export.
              </p>
            </div>

            <div className="space-y-3">
              {filteredItems.map((item) => (
                <div key={item.id} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{item.name}</div>
                      <div className="mt-1 text-xs uppercase tracking-[0.22em] text-slate-500">
                        {item.category} · {item.source === "admin" ? "Published by admin" : "System starter"}
                      </div>
                    </div>
                    <button className="btn btn-primary" onClick={() => onAddSvg(item.svg)}>
                      Insert
                    </button>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{item.description}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.tags.map((tag) => (
                      <span key={`${item.id}-${tag}`} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-600">
                        {tag}
                      </span>
                    ))}
                  </div>
                  <div className="mt-3 text-xs text-slate-500">
                    Updated {new Date(item.updatedAt).toLocaleDateString()} by {item.author}
                  </div>
                </div>
              ))}

              {filteredItems.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                  No library drawings match the current search.
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {tab === "details" ? (
          <div className="space-y-6">
            <div className="space-y-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
              <div>
                <label className="label">Project name</label>
                <input
                  className="input"
                  value={projectName}
                  onChange={(event) => onProjectNameChange(event.target.value)}
                  placeholder="Project name"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button className="btn btn-primary" onClick={onSaveProject}>
                  Save project
                </button>
                <button className="btn" onClick={onApplyTitleBlock}>
                  Refresh title block
                </button>
              </div>
            </div>

            <div className="space-y-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">SVG import</h3>
                <p className="mt-1 text-sm text-slate-600">
                  Paste SVG markup, render it onto the canvas, and continue editing with the drafting tools. Publishing to the shared library stays restricted to admins.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-2">
                {ADMIN_SVG_TEMPLATES.map((template) => (
                  <button
                    key={template.id}
                    className="btn justify-between"
                    onClick={() => {
                      setSvgText(template.svg);
                      setPublishName(template.name);
                      setPublishCategory(template.category);
                      setPublishDescription(template.description);
                    }}
                  >
                    <span>{template.name}</span>
                    <span className="text-[11px] text-slate-500">{template.category}</span>
                  </button>
                ))}
              </div>

              <div>
                <label className="label">SVG code</label>
                <textarea
                  className="input min-h-[220px] resize-y font-mono text-xs leading-6"
                  value={svgText}
                  onChange={(event) => setSvgText(event.target.value)}
                  placeholder='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200">...</svg>'
                  spellCheck={false}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button className="btn btn-primary" onClick={() => svgText.trim() && onAddSvg(svgText)}>
                  Insert SVG
                </button>
                <button className="btn" onClick={() => setSvgText("")}>
                  Clear
                </button>
              </div>
            </div>

            <div className="space-y-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Quick detail blocks</h3>
                  <p className="mt-1 text-sm text-slate-600">
                    Add common drafting references without leaving the canvas.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {DETAIL_BLOCKS.map((item) => (
                  <button key={item.id} className="btn justify-start" onClick={() => onAddSvg(item.svg)}>
                    {item.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Title block and sheet data</h3>
                <p className="mt-1 text-sm text-slate-600">
                  Keep drawing metadata consistent before saving or exporting.
                </p>
              </div>

              <div>
                <label className="label">Project title</label>
                <input className="input" value={titleBlockData.projectTitle} onChange={(event) => updateTitleBlock("projectTitle", event.target.value)} />
              </div>
              <div>
                <label className="label">Drawing title</label>
                <input className="input" value={titleBlockData.drawingTitle} onChange={(event) => updateTitleBlock("drawingTitle", event.target.value)} />
              </div>
              <div>
                <label className="label">Client</label>
                <input className="input" value={titleBlockData.client} onChange={(event) => updateTitleBlock("client", event.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Drawing number</label>
                  <input className="input" value={titleBlockData.drawingNo} onChange={(event) => updateTitleBlock("drawingNo", event.target.value)} />
                </div>
                <div>
                  <label className="label">Revision</label>
                  <input className="input" value={titleBlockData.revision} onChange={(event) => updateTitleBlock("revision", event.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Scale</label>
                  <input className="input" value={titleBlockData.scale} onChange={(event) => updateTitleBlock("scale", event.target.value)} />
                </div>
                <div>
                  <label className="label">Date</label>
                  <input type="date" className="input" value={titleBlockData.date} onChange={(event) => updateTitleBlock("date", event.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Drawn by</label>
                  <input className="input" value={titleBlockData.drawnBy} onChange={(event) => updateTitleBlock("drawnBy", event.target.value)} />
                </div>
                <div>
                  <label className="label">Checked by</label>
                  <input className="input" value={titleBlockData.checkedBy} onChange={(event) => updateTitleBlock("checkedBy", event.target.value)} />
                </div>
              </div>
              <div>
                <label className="label">Sheet reference</label>
                <input className="input" value={titleBlockData.sheet} onChange={(event) => updateTitleBlock("sheet", event.target.value)} />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button className="btn btn-primary" onClick={onApplyTitleBlock}>
                  Apply title block
                </button>
                <button className="btn btn-danger" onClick={onRemoveTitleBlock}>
                  Remove
                </button>
              </div>
            </div>

            <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Fill, hatch, and stroke</h3>
                <p className="mt-1 text-sm text-slate-600">
                  Apply fills to the selected object or ungroup a library block to style sub-elements.
                </p>
              </div>

              <div>
                <label className="label">Fill color</label>
                <div className="flex items-center gap-3">
                  <input type="color" value={hatchColor} onChange={(event) => setHatchColor(event.target.value)} className="h-11 w-11 rounded-xl border border-slate-200 bg-white p-1" />
                  <input className="input font-mono uppercase" value={hatchColor} onChange={(event) => setHatchColor(event.target.value)} />
                </div>
              </div>

              <div>
                <label className="label">Pattern scale ({hatchScale.toFixed(1)})</label>
                <input
                  type="range"
                  min="0.3"
                  max="4"
                  step="0.1"
                  value={hatchScale}
                  onChange={(event) => setHatchScale(parseFloat(event.target.value))}
                  className="w-full accent-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button className="btn" onClick={() => onApplyPattern("solid", hatchScale, hatchColor)}>
                  Solid fill
                </button>
                {PATTERNS.map((pattern) => (
                  <button key={pattern.id} className="btn justify-start" onClick={() => onApplyPattern(pattern.id, hatchScale, hatchColor)}>
                    {pattern.label}
                  </button>
                ))}
              </div>

              <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-900">Stroke</span>
                  <button
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${hasStroke ? "bg-slate-900 text-white" : "bg-white text-slate-600"}`}
                    onClick={() => {
                      const next = !hasStroke;
                      setHasStroke(next);
                      onUpdateStroke(strokeColor, strokeWidth, next);
                    }}
                  >
                    {hasStroke ? "Enabled" : "Disabled"}
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={strokeColor}
                    onChange={(event) => {
                      setStrokeColor(event.target.value);
                      onUpdateStroke(event.target.value, strokeWidth, hasStroke);
                    }}
                    className="h-11 w-11 rounded-xl border border-slate-200 bg-white p-1"
                  />
                  <input
                    type="range"
                    min="0.5"
                    max="12"
                    step="0.5"
                    value={strokeWidth}
                    onChange={(event) => {
                      const next = parseFloat(event.target.value);
                      setStrokeWidth(next);
                      onUpdateStroke(strokeColor, next, hasStroke);
                    }}
                    className="w-full accent-slate-900"
                  />
                  <span className="w-12 text-right text-sm text-slate-600">{strokeWidth.toFixed(1)}</span>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {tab === "projects" ? (
          <div className="space-y-5">
            <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
              <h3 className="text-sm font-semibold text-slate-900">Saved drawing packages</h3>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Save multi-sheet projects to Supabase, reopen them later from any signed-in session, and keep editing.
              </p>
              <button className="btn btn-primary mt-4 w-full" onClick={onSaveProject}>
                Save current project
              </button>
            </div>

            <div className="space-y-3">
              {savedProjects.map((project) => (
                <div
                  key={project.id}
                  className={`rounded-3xl border p-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)] ${
                    activeProjectId === project.id ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">{project.name}</div>
                      <div className={`mt-1 text-xs ${activeProjectId === project.id ? "text-slate-300" : "text-slate-500"}`}>
                        {project.pages.length} sheet{project.pages.length > 1 ? "s" : ""} · {project.owner}
                      </div>
                    </div>
                    <button
                      className={`btn ${activeProjectId === project.id ? "!border-white/30 !bg-white/10 !text-white hover:!bg-white/20" : ""}`}
                      onClick={() => onOpenProject(project)}
                    >
                      Open
                    </button>
                  </div>
                  <div className={`mt-3 text-xs ${activeProjectId === project.id ? "text-slate-300" : "text-slate-500"}`}>
                    Last saved {new Date(project.updatedAt).toLocaleString()}
                  </div>
                  <button
                    className={`btn btn-danger mt-3 ${activeProjectId === project.id ? "!border-red-300/30 !bg-red-500/15 !text-red-100" : ""}`}
                    onClick={() => onDeleteProject(project.id)}
                  >
                    Delete
                  </button>
                </div>
              ))}

              {savedProjects.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                  No saved projects yet. Save the current drawing package to build your workspace library.
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {tab === "admin" && isAdmin ? (
          <div className="space-y-6">
            <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-700">
                Shared library publishing
              </p>
              <p className="mt-2 text-sm leading-6 text-amber-900">
                All signed-in users can import raw SVG into their own drawing workspace. This panel is reserved for publishing approved drawings into the shared engineering library.
              </p>
            </div>

            <div className="space-y-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Publish to shared library</h3>
                <p className="mt-1 text-sm text-slate-600">
                  Publish either the current SVG draft or the active canvas as a reusable drawing block for engineers across the platform.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Library name</label>
                  <input className="input" value={publishName} onChange={(event) => setPublishName(event.target.value)} />
                </div>
                <div>
                  <label className="label">Category</label>
                  <select className="input" value={publishCategory} onChange={(event) => setPublishCategory(event.target.value as LibraryCategory)}>
                    {LIBRARY_CATEGORIES.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="label">Description</label>
                <textarea className="input min-h-[90px] resize-y" value={publishDescription} onChange={(event) => setPublishDescription(event.target.value)} />
              </div>

              <div>
                <label className="label">Tags</label>
                <input
                  className="input"
                  value={publishTags}
                  onChange={(event) => setPublishTags(event.target.value)}
                  placeholder="layout, equipment, section"
                />
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  className="btn btn-primary"
                  onClick={() =>
                    onPublishRawSvg({
                      name: publishName,
                      category: publishCategory,
                      description: publishDescription,
                      tags: parseTags(publishTags),
                      svg: svgText,
                    })
                  }
                >
                  Publish raw SVG
                </button>
                <button
                  className="btn"
                  onClick={() =>
                    onPublishCanvasToLibrary({
                      name: `${publishName} Canvas`,
                      category: publishCategory,
                      description: publishDescription,
                      tags: parseTags(publishTags),
                    })
                  }
                >
                  Publish current canvas
                </button>
                <button
                  className="btn"
                  onClick={() => {
                    setPublishName("Library Drawing");
                    setPublishDescription("Editable drawing block prepared by the admin studio.");
                    setPublishTags("library, editable, drawing");
                  }}
                >
                  Reset publish form
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
