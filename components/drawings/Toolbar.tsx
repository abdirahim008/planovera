"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  BrickWall,
  Circle,
  DoorOpen,
  Download,
  Eye,
  FileText,
  Home,
  Layers3,
  Magnet,
  Minus,
  MoveUpRight,
  BoxSelect,
  MousePointer2,
  Move,
  PanelLeftClose,
  PanelLeftOpen,
  PencilLine,
  Plus,
  Ruler,
  Save,
  Scissors,
  Settings2,
  Shapes,
  Square,
  Type,
  Redo2,
  Undo2,
  Warehouse,
} from "lucide-react";

import { type PatternType } from "@/lib/drawings/patterns";
import { PAPER_SIZES, PaperSizeKey, Orientation } from "@/lib/drawings/paper";
import type { Page } from "@/lib/drawings/fabricHelpers";
import { DETAIL_BLOCKS, type UserSession } from "@/lib/drawings/appModel";
import type { ParametricBlockKind, ParametricBlockParams } from "@/lib/drawings/parametricBlocks";
import type { DrawingPanelTab } from "./LeftPanel";

type ToolMode =
  | "select"
  | "marquee"
  | "pan"
  | "line"
  | "dimension"
  | "leader"
  | "trim"
  | "wall"
  | "wallRect"
  | "door"
  | "window";
type MenuName =
  | "file"
  | "edit"
  | "view"
  | "trays"
  | "insert"
  | "tools"
  | "format"
  | "detailing"
  | "sheet";
type LineStyle = "solid" | "dashed";

interface ToolbarProps {
  session: UserSession;
  projectName: string;
  pages: Page[];
  currentPageIndex: number;
  zoom: number;
  selectedCount: number;
  toolMode: ToolMode;
  activeTray?: DrawingPanelTab | null;
  lastSavedAt: string | null;
  canUndo: boolean;
  canRedo: boolean;
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
  onSetActiveTray?: (tab: DrawingPanelTab | null) => void;
  snapEnabled: boolean;
  onToggleSnapping: () => void;
  onAddRectangle: () => void;
  onAddCircle: () => void;
  onAddText: () => void;
  onAddSvg: (svg: string) => void;
  onAddParametricBlock: (kind: ParametricBlockKind, params?: Partial<ParametricBlockParams>) => void;
  onApplyPattern: (id: PatternType, scale: number, color: string) => void;
  onUpdateStroke: (color: string, width: number, enabled: boolean) => void;
  onUpdateLineStyle: (style: LineStyle) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onBringFront: () => void;
  onSendBack: () => void;
  onNewProject: () => void;
  onSaveProject: () => void;
  onExportPDF: () => void;
  onOpenWarehouse: () => void;
  onLogout: () => void;
  onBackToDashboard?: () => void;
  /** Label for the back button. Defaults to "Dashboard"; pass the linked project name to orient users. */
  backLabel?: string;
}

const menuButton =
  "inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-[13px] font-semibold text-slate-400 transition hover:bg-slate-700/70 hover:text-slate-100";

const menuItem =
  "flex w-full items-center justify-between gap-6 rounded-md px-3 py-2 text-left text-sm font-medium text-slate-300 transition hover:bg-slate-700/80 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent";

const activeToolClass = "bg-sky-500/15 text-sky-300 hover:bg-sky-500/15 hover:text-sky-300";

function formatSavedAgo(iso: string) {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "Saved";
  const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (diffSec < 60) return "Saved just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `Saved ${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `Saved ${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `Saved ${diffDay}d ago`;
}

export default function Toolbar({
  session,
  projectName,
  pages,
  currentPageIndex,
  zoom,
  selectedCount,
  toolMode,
  activeTray,
  lastSavedAt,
  canUndo,
  canRedo,
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
  onSetActiveTray,
  snapEnabled,
  onToggleSnapping,
  onAddRectangle,
  onAddCircle,
  onAddText,
  onAddSvg,
  onAddParametricBlock,
  onApplyPattern,
  onUpdateStroke,
  onUpdateLineStyle,
  onDuplicate,
  onDelete,
  onCopy,
  onPaste,
  onUndo,
  onRedo,
  onBringFront,
  onSendBack,
  onNewProject,
  onSaveProject,
  onExportPDF,
  onOpenWarehouse,
  onLogout,
  onBackToDashboard,
  backLabel = "Dashboard",
}: ToolbarProps) {
  const currentPage = pages[currentPageIndex];
  const hasSelection = selectedCount > 0;
  const toolMenuItems: Array<{ id: ToolMode; label: string; icon: ReactNode }> = [
    { id: "select", label: "Select / move", icon: <MousePointer2 className="h-4 w-4" /> },
    { id: "marquee", label: "Select area (box)", icon: <BoxSelect className="h-4 w-4" /> },
    { id: "pan", label: "Pan canvas", icon: <Move className="h-4 w-4" /> },
    { id: "line", label: "Line tool", icon: <Minus className="h-4 w-4" /> },
    { id: "wall", label: "Wall line tool", icon: <Minus className="h-4 w-4" /> },
    { id: "wallRect", label: "Wall rectangle tool", icon: <Square className="h-4 w-4" /> },
    { id: "door", label: "Door hosting tool", icon: <Square className="h-4 w-4" /> },
    { id: "window", label: "Window hosting tool", icon: <Square className="h-4 w-4" /> },
    { id: "dimension", label: "Dimension tool", icon: <Ruler className="h-4 w-4" /> },
    { id: "trim", label: "Trim tool", icon: <Scissors className="h-4 w-4" /> },
  ];
  const trayItems: Array<{ id: DrawingPanelTab; label: string; description: string; icon: ReactNode }> = [
    {
      id: "properties",
      label: "Properties",
      description: "Selection styles, shading and import",
      icon: <Settings2 className="h-4 w-4" />,
    },
    {
      id: "titleblock",
      label: "Title block",
      description: "Sheet title block and metadata",
      icon: <FileText className="h-4 w-4" />,
    },
    {
      id: "projects",
      label: "Projects",
      description: "Saved drawing packages",
      icon: <FileText className="h-4 w-4" />,
    },
  ];
  const [openMenu, setOpenMenu] = useState<MenuName | null>(null);
  const [fillColor, setFillColor] = useState("#dbeafe");
  const [hatchScale, setHatchScale] = useState(1);
  const [strokeColor, setStrokeColor] = useState("#0f172a");
  const [strokeWidth, setStrokeWidth] = useState(1.2);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const close = () => setOpenMenu(null);
  const run = (action: () => void) => {
    action();
    close();
  };

  const Dropdown = ({
    id,
    label,
    icon,
    children,
    wide = false,
  }: {
    id: MenuName;
    label: string;
    icon?: ReactNode;
    children: ReactNode;
    wide?: boolean;
  }) => (
    <div className="relative">
      <button
        type="button"
        className={`${menuButton} ${
          openMenu === id || (id === "trays" && activeTray) ? "bg-sky-500/15 text-sky-300" : ""
        }`}
        aria-label={label}
        title={label}
        onClick={() => setOpenMenu((current) => (current === id ? null : id))}
      >
        {icon ? <span className="inline-flex items-center">{icon}</span> : null}
        <span>{label}</span>
      </button>
      {openMenu === id ? (
        <div
          className={`absolute left-0 top-[calc(100%+8px)] z-[6000] rounded-xl border border-slate-700 bg-slate-900 p-2 shadow-[0_24px_70px_rgba(0,0,0,0.42)] ${
            wide ? "w-[330px]" : "w-[250px]"
          }`}
        >
          {children}
        </div>
      ) : null}
    </div>
  );

  return (
    <header className="relative z-[5000] border-b border-slate-800 bg-slate-900 px-3 py-2 shadow-[0_10px_30px_rgba(0,0,0,0.22)]">
      <div ref={menuRef} className="flex flex-wrap items-center gap-1">
        <div className="mr-2 flex items-center gap-2 border-r border-slate-700 pr-3">
          <img
            src="/brand/planovera-mark.png"
            alt="Planovera"
            className="h-8 w-8 rounded-lg object-contain"
          />
          <div className="hidden min-w-0 xl:block">
            <div className="flex items-center gap-2">
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Studio</div>
              <span
                className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
                  lastSavedAt ? "bg-emerald-500/10 text-emerald-300" : "bg-slate-700/60 text-slate-400"
                }`}
                title={lastSavedAt ? `Last saved ${new Date(lastSavedAt).toLocaleString()}` : "Not saved yet"}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${lastSavedAt ? "bg-emerald-400" : "bg-slate-500"}`} />
                {lastSavedAt ? formatSavedAgo(lastSavedAt) : "Not saved"}
              </span>
            </div>
          </div>
        </div>
        {onBackToDashboard ? (
          <div className="mr-1 flex items-center gap-1 border-r border-slate-700 pr-2">
            <button
              type="button"
              className={menuButton}
              onClick={() => run(onBackToDashboard)}
              title={`Back to ${backLabel}`}
            >
              <Home className="h-4 w-4" />
              <span className="max-w-[180px] truncate">{backLabel}</span>
            </button>
          </div>
        ) : null}
        <div className="mr-1 flex items-center gap-1 border-r border-slate-700 pr-2">
          <button
            type="button"
            className={`${menuButton} disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-400`}
            disabled={!canUndo}
            onClick={() => run(onUndo)}
            title="Undo"
          >
            <Undo2 className="h-4 w-4" />
            <span>Undo</span>
          </button>
          <button
            type="button"
            className={`${menuButton} disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-400`}
            disabled={!canRedo}
            onClick={() => run(onRedo)}
            title="Redo"
          >
            <Redo2 className="h-4 w-4" />
            <span>Redo</span>
          </button>
        </div>
        <Dropdown id="file" label="File" icon={<FileText className="h-4 w-4" />}>
          <button className={menuItem} onClick={() => run(onNewProject)}>
            <span>New drawing package</span>
            <span className="text-xs text-slate-400">Ctrl N</span>
          </button>
          <button className={menuItem} onClick={() => run(onSaveProject)}>
            <span className="inline-flex items-center gap-2"><Save className="h-4 w-4" /> Save project</span>
            <span className="text-xs text-slate-400">Ctrl S</span>
          </button>
          <button className={menuItem} onClick={() => run(onExportPDF)}>
            <span className="inline-flex items-center gap-2"><Download className="h-4 w-4" /> Export PDF</span>
          </button>
          <div className="my-1 border-t border-slate-100" />
          <button className={menuItem} onClick={() => run(onLogout)}>
            <span>Sign out / reset local session</span>
          </button>
        </Dropdown>

        <Dropdown id="edit" label="Edit" icon={<PencilLine className="h-4 w-4" />}>
          <button className={menuItem} disabled={!canUndo} onClick={() => run(onUndo)}>
            <span className="inline-flex items-center gap-2"><Undo2 className="h-4 w-4" /> Undo</span>
            <span className="text-xs text-slate-400">Ctrl Z</span>
          </button>
          <button className={menuItem} disabled={!canRedo} onClick={() => run(onRedo)}>
            <span className="inline-flex items-center gap-2"><Redo2 className="h-4 w-4" /> Redo</span>
            <span className="text-xs text-slate-400">Ctrl Y</span>
          </button>
          <div className="my-1 border-t border-slate-100" />
          <button className={menuItem} disabled={!hasSelection} onClick={() => run(onCopy)}>
            <span>Copy</span>
            <span className="text-xs text-slate-400">Ctrl C</span>
          </button>
          <button className={menuItem} onClick={() => run(onPaste)}>
            <span>Paste</span>
            <span className="text-xs text-slate-400">Ctrl V</span>
          </button>
          <button className={menuItem} disabled={!hasSelection} onClick={() => run(onDuplicate)}>
            <span>Duplicate</span>
            <span className="text-xs text-slate-400">Ctrl D</span>
          </button>
          <div className="my-1 border-t border-slate-100" />
          <button className={menuItem} disabled={!hasSelection} onClick={() => run(onBringFront)}>
            <span>Bring to front</span>
          </button>
          <button className={menuItem} disabled={!hasSelection} onClick={() => run(onSendBack)}>
            <span>Send to back</span>
          </button>
          <button className={`${menuItem} text-red-600`} disabled={!hasSelection} onClick={() => run(onDelete)}>
            <span>Delete selected</span>
          </button>
        </Dropdown>

        <Dropdown id="view" label="View" icon={<Eye className="h-4 w-4" />}>
          <button className={menuItem} onClick={() => run(onZoomOut)}>
            <span>Zoom out</span>
          </button>
          <button className={menuItem} onClick={() => run(onZoom100)}>
            <span>Actual size</span>
            <span className="text-xs text-slate-400">{Math.round(zoom * 100)}%</span>
          </button>
          <button className={menuItem} onClick={() => run(onZoomIn)}>
            <span>Zoom in</span>
          </button>
          <button className={menuItem} onClick={() => run(onZoomFit)}>
            <span>Fit sheet to window</span>
          </button>
        </Dropdown>

        {onSetActiveTray ? (
          <Dropdown
            id="trays"
            label="Trays"
            icon={activeTray ? <PanelLeftClose className="h-5 w-5" /> : <Layers3 className="h-5 w-5" />}
            wide
          >
            <div className="px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                Side panel
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Show a docked tray beside the canvas, or hide it for maximum drawing space.
              </p>
            </div>
            {trayItems.map((item) => (
              <button
                key={item.id}
                className={`${menuItem} ${activeTray === item.id ? activeToolClass : ""}`}
                onClick={() => run(() => onSetActiveTray(activeTray === item.id ? null : item.id))}
              >
                <span className="inline-flex min-w-0 items-start gap-3">
                  <span className="mt-0.5 text-slate-400">{item.icon}</span>
                  <span className="min-w-0">
                  <span className="block">{item.label}</span>
                  <span className={`block text-xs ${activeTray === item.id ? "text-slate-200" : "text-slate-400"}`}>
                    {item.description}
                  </span>
                  </span>
                </span>
                {activeTray === item.id ? <span className="text-xs">Open</span> : null}
              </button>
            ))}
            <div className="my-1 border-t border-slate-100" />
            <button className={menuItem} onClick={() => run(() => onSetActiveTray(null))}>
              <span className="inline-flex items-center gap-2">
                <PanelLeftClose className="h-4 w-4" />
                Hide side panel
              </span>
            </button>
          </Dropdown>
        ) : null}

        <Dropdown id="insert" label="Insert" icon={<Plus className="h-4 w-4" />}>
          <button className={menuItem} onClick={() => run(() => onSetToolMode("wall"))}>
            <span className="inline-flex items-center gap-2"><BrickWall className="h-4 w-4" /> Wall line</span>
            {toolMode === "wall" ? <span className="text-xs text-slate-400">Active</span> : null}
          </button>
          <button className={menuItem} onClick={() => run(() => onSetToolMode("wallRect"))}>
            <span className="inline-flex items-center gap-2"><BrickWall className="h-4 w-4" /> Wall rectangle</span>
            {toolMode === "wallRect" ? <span className="text-xs text-slate-400">Active</span> : null}
          </button>
          <button className={menuItem} onClick={() => run(() => onSetToolMode("door"))}>
            <span className="inline-flex items-center gap-2"><DoorOpen className="h-4 w-4" /> Door in wall</span>
            {toolMode === "door" ? <span className="text-xs text-slate-400">Active</span> : null}
          </button>
          <button className={menuItem} onClick={() => run(() => onSetToolMode("window"))}>
            <span className="inline-flex items-center gap-2"><Shapes className="h-4 w-4" /> Window in wall</span>
            {toolMode === "window" ? <span className="text-xs text-slate-400">Active</span> : null}
          </button>
          <div className="my-1 border-t border-slate-100" />
          <button className={menuItem} onClick={() => run(() => onSetToolMode("line"))}>
            <span className="inline-flex items-center gap-2"><Minus className="h-4 w-4" /> Line</span>
            {toolMode === "line" ? <span className="text-xs text-slate-400">Active</span> : null}
          </button>
          <button className={menuItem} onClick={() => run(() => onSetToolMode("dimension"))}>
            <span className="inline-flex items-center gap-2"><Ruler className="h-4 w-4" /> Dimension line</span>
            {toolMode === "dimension" ? <span className="text-xs text-slate-400">Active</span> : null}
          </button>
          <button className={menuItem} onClick={() => run(() => onSetToolMode("leader"))}>
            <span className="inline-flex items-center gap-2"><MoveUpRight className="h-4 w-4" /> Arrow label (leader)</span>
            {toolMode === "leader" ? <span className="text-xs text-slate-400">Active</span> : null}
          </button>
          <button className={menuItem} onClick={() => run(onAddRectangle)}>
            <span className="inline-flex items-center gap-2"><Square className="h-4 w-4" /> Rectangle</span>
          </button>
          <button className={menuItem} onClick={() => run(onAddCircle)}>
            <span className="inline-flex items-center gap-2"><Circle className="h-4 w-4" /> Circle</span>
          </button>
          <button className={menuItem} onClick={() => run(onAddText)}>
            <span className="inline-flex items-center gap-2"><Type className="h-4 w-4" /> Text label</span>
          </button>
          <div className="my-1 border-t border-slate-100" />
          {DETAIL_BLOCKS.map((item) => (
            <button key={item.id} className={menuItem} onClick={() => run(() => onAddSvg(item.svg))}>
              <span className="inline-flex items-center gap-2"><Shapes className="h-4 w-4" /> {item.name}</span>
            </button>
          ))}
        </Dropdown>

        <Dropdown id="tools" label="Tools" icon={<MousePointer2 className="h-4 w-4" />}>
          {toolMenuItems.map((item) => (
            <button
              key={item.id}
              className={`${menuItem} ${toolMode === item.id ? activeToolClass : ""}`}
              onClick={() => run(() => onSetToolMode(item.id))}
            >
              <span className="inline-flex items-center gap-2">{item.icon}{item.label}</span>
              {toolMode === item.id ? <span className="text-xs">Active</span> : null}
            </button>
          ))}
          <div className="my-1 border-t border-slate-100" />
          <button
            className={`${menuItem} ${snapEnabled ? activeToolClass : ""}`}
            onClick={() => run(onToggleSnapping)}
          >
            <span className="inline-flex items-center gap-2"><Magnet className="h-4 w-4" /> Snapping</span>
            <span className="text-xs">{snapEnabled ? "On" : "Off"}</span>
          </button>
        </Dropdown>

        <Dropdown id="sheet" label="Sheet" icon={<FileText className="h-4 w-4" />} wide>
          <div className="space-y-3 px-3 py-2">
            <div>
              <label className="label">Current sheet</label>
              <select
                className="input"
                value={currentPageIndex}
                onChange={(event) => onSwitchPage(Number(event.target.value))}
              >
                {pages.map((page, index) => (
                  <option key={page.id} value={index}>
                    {index + 1}. {page.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button className="btn" onClick={() => run(() => onSwitchPage(currentPageIndex - 1))} disabled={currentPageIndex === 0}>
                Previous
              </button>
              <button className="btn" onClick={() => run(() => onSwitchPage(currentPageIndex + 1))} disabled={currentPageIndex === pages.length - 1}>
                Next
              </button>
              <button className="btn btn-primary" onClick={() => run(onAddPage)}>
                Add sheet
              </button>
              <button className="btn btn-danger" onClick={() => run(() => onDeletePage(currentPageIndex))} disabled={pages.length <= 1}>
                Remove
              </button>
            </div>
            <div>
              <label className="label">Paper size</label>
              <select
                className="input"
                value={currentPage.paperSize}
                onChange={(event) => onChangePaper(event.target.value as PaperSizeKey)}
              >
                {Object.entries(PAPER_SIZES).map(([key, value]) => (
                  <option key={key} value={key}>
                    {value.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Orientation</label>
              <select
                className="input"
                value={currentPage.orientation}
                onChange={(event) => onChangeOrientation(event.target.value as Orientation)}
              >
                <option value="landscape">Landscape</option>
                <option value="portrait">Portrait</option>
              </select>
            </div>
          </div>
        </Dropdown>

        <button
          type="button"
          className={`${menuButton} border border-amber-400/40 bg-amber-400/10 text-amber-200 hover:bg-amber-400/20 hover:text-amber-100`}
          onClick={() => run(onOpenWarehouse)}
          title="Open the drawing & BOQ warehouse in a new tab"
        >
          <Warehouse className="h-4 w-4" />
          <span>Warehouse</span>
        </button>

        <div className="ml-auto flex items-center gap-2 pl-2">
          <span className="hidden rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-slate-400 md:inline-flex">
            Tool: <span className="ml-1 text-slate-100">{toolMode}</span>
          </span>
          <span className="hidden rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-slate-400 md:inline-flex">
            Zoom: <span className="ml-1 text-slate-100">{Math.round(zoom * 100)}%</span>
          </span>
          <span className="hidden rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-slate-400 xl:inline-flex">
            {selectedCount > 0 ? `${selectedCount} selected` : "No selection"}
          </span>
        </div>
      </div>
    </header>
  );
}
