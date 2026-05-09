"use client";

import { PAPER_SIZES, PaperSizeKey, Orientation } from "@/lib/paper";
import type { Page } from "@/lib/fabricHelpers";
import type { UserSession } from "@/lib/appModel";

type ToolMode = "select" | "pan" | "line" | "dimension" | "trim";

interface ToolbarProps {
  session: UserSession;
  projectName: string;
  pages: Page[];
  currentPageIndex: number;
  zoom: number;
  selectedCount: number;
  toolMode: ToolMode;
  lastSavedAt: string | null;
  onSetToolMode: (mode: ToolMode) => void;
  onSwitchPage: (index: number) => void;
  onAddPage: () => void;
  onDeletePage: (index: number) => void;
  onChangePaper: (paper: PaperSizeKey) => void;
  onChangeOrientation: (orientation: Orientation) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomFit: () => void;
  onZoom100: () => void;
  onAddRectangle: () => void;
  onAddCircle: () => void;
  onAddText: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onBringFront: () => void;
  onSendBack: () => void;
  onNewProject: () => void;
  onSaveProject: () => void;
  onExportPDF: () => void;
  onLogout: () => void;
}

const toolLabels: Array<{ id: ToolMode; label: string; short: string }> = [
  { id: "select", label: "Select", short: "Sel" },
  { id: "pan", label: "Pan", short: "Pan" },
  { id: "line", label: "Line", short: "Line" },
  { id: "dimension", label: "Dimension", short: "Dim" },
  { id: "trim", label: "Trim", short: "Trim" },
];

export default function Toolbar({
  session,
  projectName,
  pages,
  currentPageIndex,
  zoom,
  selectedCount,
  toolMode,
  lastSavedAt,
  onSetToolMode,
  onSwitchPage,
  onAddPage,
  onDeletePage,
  onChangePaper,
  onChangeOrientation,
  onZoomIn,
  onZoomOut,
  onZoomFit,
  onZoom100,
  onAddRectangle,
  onAddCircle,
  onAddText,
  onDuplicate,
  onDelete,
  onCopy,
  onPaste,
  onBringFront,
  onSendBack,
  onNewProject,
  onSaveProject,
  onExportPDF,
  onLogout,
}: ToolbarProps) {
  const currentPage = pages[currentPageIndex];
  const hasSelection = selectedCount > 0;

  return (
    <header className="border-b border-slate-200/70 bg-white/85 px-4 py-3 backdrop-blur-xl">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex min-w-[240px] flex-1 items-center gap-3">
            <img
              src="/brand/planovera-mark.png"
              alt="Planovera"
              className="h-11 w-11 rounded-2xl object-contain shadow-[0_14px_40px_rgba(15,23,42,0.12)]"
            />
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-500">
                Planovera Studio
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-semibold text-slate-900">{projectName}</h1>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                  {session.role === "admin" ? "Admin Studio" : "Engineer Workspace"}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">
              {session.name} · {session.company || "Workspace"}
            </div>
            <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">
              {lastSavedAt ? `Saved ${new Date(lastSavedAt).toLocaleString()}` : "Not saved yet"}
            </div>
            <button className="btn" onClick={onNewProject}>
              New
            </button>
            <button className="btn btn-primary" onClick={onSaveProject}>
              Save
            </button>
            <button className="btn btn-quiet" onClick={onLogout}>
              Sign out
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="toolbar-group">
            <span className="toolbar-label">Sheets</span>
            <button className="icon-btn" onClick={() => onSwitchPage(currentPageIndex - 1)} disabled={currentPageIndex === 0}>
              Prev
            </button>
            <select
              className="input h-9 min-w-[170px] !rounded-xl !bg-white !text-sm"
              value={currentPageIndex}
              onChange={(event) => onSwitchPage(Number(event.target.value))}
            >
              {pages.map((page, index) => (
                <option key={page.id} value={index}>
                  {index + 1}. {page.name}
                </option>
              ))}
            </select>
            <button className="icon-btn" onClick={() => onSwitchPage(currentPageIndex + 1)} disabled={currentPageIndex === pages.length - 1}>
              Next
            </button>
            <button className="btn" onClick={onAddPage}>
              Add sheet
            </button>
            <button className="btn btn-danger" onClick={() => onDeletePage(currentPageIndex)} disabled={pages.length <= 1}>
              Remove
            </button>
          </div>

          <div className="toolbar-group">
            <span className="toolbar-label">Paper</span>
            <select
              className="input h-9 min-w-[120px] !rounded-xl !bg-white !text-sm"
              value={currentPage.paperSize}
              onChange={(event) => onChangePaper(event.target.value as PaperSizeKey)}
            >
              {Object.entries(PAPER_SIZES).map(([key, value]) => (
                <option key={key} value={key}>
                  {value.label}
                </option>
              ))}
            </select>
            <select
              className="input h-9 min-w-[130px] !rounded-xl !bg-white !text-sm"
              value={currentPage.orientation}
              onChange={(event) => onChangeOrientation(event.target.value as Orientation)}
            >
              <option value="landscape">Landscape</option>
              <option value="portrait">Portrait</option>
            </select>
          </div>

          <div className="toolbar-group">
            <span className="toolbar-label">Navigation</span>
            <button className="icon-btn" onClick={onZoomOut}>
              -
            </button>
            <button className="icon-btn min-w-[72px]" onClick={onZoom100}>
              {Math.round(zoom * 100)}%
            </button>
            <button className="icon-btn" onClick={onZoomIn}>
              +
            </button>
            <button className="btn" onClick={onZoomFit}>
              Fit sheet
            </button>
          </div>

          <div className="toolbar-group">
            <span className="toolbar-label">Drafting</span>
            {toolLabels.map((tool) => (
              <button
                key={tool.id}
                className={`btn ${toolMode === tool.id ? "btn-primary" : ""}`}
                onClick={() => onSetToolMode(tool.id)}
                title={tool.label}
              >
                <span className="hidden sm:inline">{tool.label}</span>
                <span className="sm:hidden">{tool.short}</span>
              </button>
            ))}
            <button className="btn" onClick={onAddRectangle}>
              Rect
            </button>
            <button className="btn" onClick={onAddCircle}>
              Circle
            </button>
            <button className="btn" onClick={onAddText}>
              Label
            </button>
          </div>

          <div className="toolbar-group">
            <span className="toolbar-label">Arrange</span>
            <button className="btn" onClick={onCopy} disabled={!hasSelection}>
              Copy
            </button>
            <button className="btn" onClick={onPaste}>
              Paste
            </button>
            <button className="btn" onClick={onDuplicate} disabled={!hasSelection}>
              Duplicate
            </button>
            <button className="btn" onClick={onBringFront} disabled={!hasSelection}>
              Front
            </button>
            <button className="btn" onClick={onSendBack} disabled={!hasSelection}>
              Back
            </button>
            <button className="btn btn-danger" onClick={onDelete} disabled={!hasSelection}>
              Delete
            </button>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
              {selectedCount > 0
                ? `${selectedCount} object${selectedCount > 1 ? "s" : ""} selected`
                : "No active selection"}
            </div>
            <button className="btn btn-primary" onClick={onExportPDF}>
              Export PDF
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
