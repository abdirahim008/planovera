"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  BrickWall,
  Circle,
  Columns3,
  Construction,
  CornerDownRight,
  DoorOpen,
  Download,
  Eye,
  FileText,
  Grid2X2,
  Hammer,
  Home,
  Layers3,
  Magnet,
  Minus,
  MousePointer2,
  Move,
  PaintBucket,
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
} from "lucide-react";

import { PATTERNS, type PatternType } from "@/lib/drawings/patterns";
import { PAPER_SIZES, PaperSizeKey, Orientation } from "@/lib/drawings/paper";
import type { Page } from "@/lib/drawings/fabricHelpers";
import { DETAIL_BLOCKS, type UserSession } from "@/lib/drawings/appModel";
import type { ParametricBlockKind, ParametricBlockParams } from "@/lib/drawings/parametricBlocks";
import type { DrawingPanelTab } from "./LeftPanel";

type ToolMode =
  | "select"
  | "pan"
  | "line"
  | "dimension"
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

const svgDoc = (viewBox: string, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" fill="none">${body}</svg>`;

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

const REINFORCEMENT_BLOCKS = [
  {
    name: "Longitudinal straight bar",
    type: "svg" as const,
    icon: <Minus className="h-4 w-4" />,
    svg: svgDoc(
      "0 0 360 80",
      `<path d="M36 40 H324" stroke="#0f172a" stroke-width="10" stroke-linecap="round"/>
       <circle cx="36" cy="40" r="8" fill="#0f172a"/>
       <circle cx="324" cy="40" r="8" fill="#0f172a"/>
       <text x="180" y="68" text-anchor="middle" font-family="Arial" font-size="18" fill="#334155">T16 LONGITUDINAL BAR</text>`,
    ),
  },
  {
    name: "Bent corner bar",
    type: "svg" as const,
    icon: <CornerDownRight className="h-4 w-4" />,
    svg: svgDoc(
      "0 0 260 220",
      `<path d="M40 180 H178 Q210 180 210 148 V42" stroke="#0f172a" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
       <circle cx="40" cy="180" r="8" fill="#0f172a"/>
       <circle cx="210" cy="42" r="8" fill="#0f172a"/>
       <path d="M162 156 L198 192 M184 134 L222 172" stroke="#94a3b8" stroke-width="3"/>
       <text x="126" y="206" text-anchor="middle" font-family="Arial" font-size="16" fill="#334155">BENT CORNER BAR</text>`,
    ),
  },
  {
    name: "U bar with hooks",
    type: "svg" as const,
    icon: <Columns3 className="h-4 w-4" />,
    svg: svgDoc(
      "0 0 280 220",
      `<path d="M58 46 V154 Q58 182 86 182 H194 Q222 182 222 154 V46" stroke="#0f172a" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
       <path d="M58 46 H92 M222 46 H188" stroke="#0f172a" stroke-width="10" stroke-linecap="round"/>
       <text x="140" y="210" text-anchor="middle" font-family="Arial" font-size="16" fill="#334155">U BAR / STARTER</text>`,
    ),
  },
  {
    name: "Circular rebar dot",
    type: "svg" as const,
    icon: <Circle className="h-4 w-4" />,
    svg: svgDoc(
      "0 0 120 120",
      `<circle cx="60" cy="52" r="18" fill="#0f172a"/>
       <circle cx="60" cy="52" r="22" fill="none" stroke="#94a3b8" stroke-width="2"/>
       <text x="60" y="98" text-anchor="middle" font-family="Arial" font-size="13" fill="#334155">REBAR DOT</text>`,
    ),
  },
  {
    name: "Closed stirrup",
    type: "svg" as const,
    icon: <Square className="h-4 w-4" />,
    svg: svgDoc(
      "0 0 220 220",
      `<rect x="48" y="42" width="124" height="136" rx="18" stroke="#0f172a" stroke-width="9"/>
       <path d="M148 42 H178 V72" stroke="#0f172a" stroke-width="9" stroke-linecap="round"/>
       <path d="M172 56 L190 38" stroke="#0f172a" stroke-width="6" stroke-linecap="round"/>
       <text x="110" y="208" text-anchor="middle" font-family="Arial" font-size="16" fill="#334155">CLOSED STIRRUP</text>`,
    ),
  },
  {
    name: "Hooked bar (one end)",
    type: "svg" as const,
    icon: <CornerDownRight className="h-4 w-4" />,
    svg: svgDoc(
      "0 0 360 140",
      `<path d="M40 70 H300 V36" stroke="#0f172a" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
       <circle cx="40" cy="70" r="8" fill="#0f172a"/>
       <text x="170" y="118" text-anchor="middle" font-family="Arial" font-size="16" fill="#334155">HOOKED BAR — ONE END</text>`,
    ),
  },
  {
    name: "Hooked bar (both ends)",
    type: "svg" as const,
    icon: <Columns3 className="h-4 w-4" />,
    svg: svgDoc(
      "0 0 360 140",
      `<path d="M60 36 V70 H300 V36" stroke="#0f172a" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
       <text x="180" y="118" text-anchor="middle" font-family="Arial" font-size="16" fill="#334155">HOOKED BAR — BOTH ENDS</text>`,
    ),
  },
  {
    name: "L-shaped corner bar",
    type: "svg" as const,
    icon: <CornerDownRight className="h-4 w-4" />,
    svg: svgDoc(
      "0 0 260 260",
      `<path d="M40 220 H220 V40" stroke="#0f172a" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
       <circle cx="40" cy="220" r="8" fill="#0f172a"/>
       <circle cx="220" cy="40" r="8" fill="#0f172a"/>
       <text x="130" y="248" text-anchor="middle" font-family="Arial" font-size="16" fill="#334155">L-SHAPED BAR</text>`,
    ),
  },
  {
    name: "Crank bar (Z-shape)",
    type: "svg" as const,
    icon: <CornerDownRight className="h-4 w-4" />,
    svg: svgDoc(
      "0 0 360 200",
      `<path d="M40 150 H140 L220 60 H320" stroke="#0f172a" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
       <circle cx="40" cy="150" r="8" fill="#0f172a"/>
       <circle cx="320" cy="60" r="8" fill="#0f172a"/>
       <text x="180" y="186" text-anchor="middle" font-family="Arial" font-size="16" fill="#334155">CRANK BAR</text>`,
    ),
  },
  {
    name: "Lap splice",
    type: "svg" as const,
    icon: <Minus className="h-4 w-4" />,
    svg: svgDoc(
      "0 0 420 120",
      `<path d="M30 52 H260" stroke="#0f172a" stroke-width="10" stroke-linecap="round"/>
       <path d="M160 70 H390" stroke="#0f172a" stroke-width="10" stroke-linecap="round"/>
       <circle cx="30" cy="52" r="8" fill="#0f172a"/>
       <circle cx="390" cy="70" r="8" fill="#0f172a"/>
       <path d="M160 36 V86 M260 36 V86" stroke="#94a3b8" stroke-width="2" stroke-dasharray="4 4"/>
       <text x="210" y="22" text-anchor="middle" font-family="Arial" font-size="13" fill="#334155">LAP LENGTH</text>
       <text x="210" y="108" text-anchor="middle" font-family="Arial" font-size="16" fill="#334155">LAP SPLICE</text>`,
    ),
  },
  {
    name: "Spiral / helix tie",
    type: "svg" as const,
    icon: <Circle className="h-4 w-4" />,
    svg: svgDoc(
      "0 0 220 260",
      `<path d="M40 40 C110 36, 110 76, 180 72 M40 80 C110 76, 110 116, 180 112 M40 120 C110 116, 110 156, 180 152 M40 160 C110 156, 110 196, 180 192 M40 200 C110 196, 110 236, 180 232" stroke="#0f172a" stroke-width="6" fill="none" stroke-linecap="round"/>
       <text x="110" y="252" text-anchor="middle" font-family="Arial" font-size="16" fill="#334155">SPIRAL TIE</text>`,
    ),
  },
  {
    name: "Open stirrup (single leg)",
    type: "svg" as const,
    icon: <Square className="h-4 w-4" />,
    svg: svgDoc(
      "0 0 220 220",
      `<path d="M52 56 V178 H168 V56" stroke="#0f172a" stroke-width="9" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
       <path d="M52 56 L36 40 M168 56 L184 40" stroke="#0f172a" stroke-width="6" stroke-linecap="round"/>
       <text x="110" y="208" text-anchor="middle" font-family="Arial" font-size="16" fill="#334155">OPEN STIRRUP</text>`,
    ),
  },
  {
    name: "Diamond / rhombus tie",
    type: "svg" as const,
    icon: <Square className="h-4 w-4" />,
    svg: svgDoc(
      "0 0 220 220",
      `<path d="M110 36 L188 110 L110 184 L32 110 Z" stroke="#0f172a" stroke-width="9" fill="none" stroke-linejoin="round"/>
       <path d="M188 110 L208 90" stroke="#0f172a" stroke-width="6" stroke-linecap="round"/>
       <text x="110" y="208" text-anchor="middle" font-family="Arial" font-size="16" fill="#334155">DIAMOND TIE</text>`,
    ),
  },
  {
    name: "Trapezoidal bend",
    type: "svg" as const,
    icon: <CornerDownRight className="h-4 w-4" />,
    svg: svgDoc(
      "0 0 360 200",
      `<path d="M40 150 L120 60 H240 L320 150" stroke="#0f172a" stroke-width="10" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
       <circle cx="40" cy="150" r="8" fill="#0f172a"/>
       <circle cx="320" cy="150" r="8" fill="#0f172a"/>
       <text x="180" y="186" text-anchor="middle" font-family="Arial" font-size="16" fill="#334155">TRAPEZOIDAL BEND</text>`,
    ),
  },
  {
    name: "Column detailing plan",
    type: "parametric" as const,
    icon: <Grid2X2 className="h-4 w-4" />,
    kind: "column-detail" as const,
    params: { view: "plan", widthMm: 300, depthMm: 300, mainBars: 8, barDiaMm: 16, tieDiaMm: 8, tieSpacingMm: 150, storeyMode: "single" },
  },
  {
    name: "Column detailing section",
    type: "parametric" as const,
    icon: <Columns3 className="h-4 w-4" />,
    kind: "column-detail" as const,
    params: { view: "section", widthMm: 300, depthMm: 300, mainBars: 8, barDiaMm: 16, tieDiaMm: 8, tieSpacingMm: 150, storeyMode: "multi" },
  },
  {
    name: "Beam detailing",
    type: "parametric" as const,
    icon: <Construction className="h-4 w-4" />,
    kind: "beam-detail" as const,
    params: { widthMm: 400, depthMm: 400, topBars: 2, bottomBars: 3, barDiaMm: 16, stirrupDiaMm: 8, stirrupSpacingMm: 150 },
  },
  {
    name: "Column footing plan",
    type: "parametric" as const,
    icon: <Construction className="h-4 w-4" />,
    kind: "footing-detail" as const,
    params: { view: "plan", footingWidthMm: 1800, footingLengthMm: 1800, footingDepthMm: 500, columnWidthMm: 300, columnDepthMm: 300, barDiaMm: 16, barCountX: 7, barCountY: 7 },
  },
  {
    name: "Column footing cross section",
    type: "parametric" as const,
    icon: <Construction className="h-4 w-4" />,
    kind: "footing-detail" as const,
    params: { view: "section", footingWidthMm: 1800, footingLengthMm: 1800, footingDepthMm: 500, columnWidthMm: 300, columnDepthMm: 300, barDiaMm: 16, barCountX: 7, barCountY: 7 },
  },
] as const;

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
  onLogout,
  onBackToDashboard,
  backLabel = "Dashboard",
}: ToolbarProps) {
  const currentPage = pages[currentPageIndex];
  const hasSelection = selectedCount > 0;
  const toolMenuItems: Array<{ id: ToolMode; label: string; icon: ReactNode }> = [
    { id: "select", label: "Select / move", icon: <MousePointer2 className="h-4 w-4" /> },
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
      description: "Selection styles and sheet metadata",
      icon: <Settings2 className="h-4 w-4" />,
    },
    {
      id: "library",
      label: "Library",
      description: "Reusable drawings and objects",
      icon: <Layers3 className="h-4 w-4" />,
    },
    {
      id: "details",
      label: "Tools and SVG",
      description: "SVG import, title blocks, and details",
      icon: <Hammer className="h-4 w-4" />,
    },
    {
      id: "projects",
      label: "Projects",
      description: "Saved drawing packages",
      icon: <FileText className="h-4 w-4" />,
    },
    ...(session.role === "admin"
      ? [
          {
            id: "admin" as const,
            label: "Publish",
            description: "Shared library publishing",
            icon: <PanelLeftOpen className="h-4 w-4" />,
          },
        ]
      : []),
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
          <div className="hidden min-w-0 lg:block">
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Planovera Studio</div>
            <div className="flex items-center gap-2">
              <div className="max-w-[220px] truncate text-xs font-semibold text-slate-200">{projectName}</div>
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

        <Dropdown id="format" label="Format" icon={<PaintBucket className="h-4 w-4" />} wide>
          <div className="px-3 py-2">
            <label className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
              Shading tool
            </label>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="color"
                value={fillColor}
                onChange={(event) => setFillColor(event.target.value)}
                className="h-9 w-10 rounded-lg border border-slate-200 bg-white p-1"
              />
              <input
                value={fillColor}
                onChange={(event) => setFillColor(event.target.value)}
                className="input h-9 !rounded-lg !py-1 font-mono text-xs uppercase"
              />
            </div>
            <button
              className={`${menuItem} mt-2`}
              disabled={!hasSelection}
              onClick={() => run(() => onApplyPattern("solid", hatchScale, fillColor))}
            >
              <span>Apply solid fill</span>
            </button>
            <button
              className={menuItem}
              disabled={!hasSelection}
              onClick={() => run(() => onApplyPattern("hatch", hatchScale, fillColor))}
            >
              <span>Apply diagonal shading</span>
            </button>
            {PATTERNS.map((pattern) => (
              <button
                key={pattern.id}
                className={menuItem}
                disabled={!hasSelection}
                onClick={() => run(() => onApplyPattern(pattern.id, hatchScale, fillColor))}
              >
                <span>{pattern.label}</span>
              </button>
            ))}
            <label className="mt-3 block text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
              Hatch scale {hatchScale.toFixed(1)}
            </label>
            <input
              type="range"
              min="0.3"
              max="4"
              step="0.1"
              value={hatchScale}
              onChange={(event) => setHatchScale(parseFloat(event.target.value))}
              className="w-full accent-slate-950"
            />
          </div>

          <div className="my-1 border-t border-slate-100" />
          <div className="px-3 py-2">
            <label className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
              Stroke
            </label>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="color"
                value={strokeColor}
                onChange={(event) => setStrokeColor(event.target.value)}
                className="h-9 w-10 rounded-lg border border-slate-200 bg-white p-1"
              />
              <input
                type="range"
                min="0.5"
                max="40"
                step="0.5"
                value={strokeWidth}
                onChange={(event) => setStrokeWidth(parseFloat(event.target.value))}
                className="min-w-0 flex-1 accent-slate-950"
              />
              <span className="w-10 text-right text-xs font-semibold text-slate-600">
                {strokeWidth.toFixed(1)}
              </span>
            </div>
            <button
              className={`${menuItem} mt-2`}
              disabled={!hasSelection}
              onClick={() => run(() => onUpdateStroke(strokeColor, strokeWidth, true))}
            >
              <span>Apply stroke</span>
            </button>
            <button
              className={menuItem}
              disabled={!hasSelection}
              onClick={() => run(() => onUpdateStroke(strokeColor, strokeWidth, false))}
            >
              <span>Remove stroke</span>
            </button>
            <button
              className={menuItem}
              disabled={!hasSelection}
              onClick={() => run(() => onUpdateLineStyle("solid"))}
            >
              <span>Solid line type</span>
            </button>
            <button
              className={menuItem}
              disabled={!hasSelection}
              onClick={() => run(() => onUpdateLineStyle("dashed"))}
            >
              <span>Dashed line type</span>
            </button>
          </div>
        </Dropdown>

        <Dropdown id="detailing" label="Detailing" icon={<Construction className="h-4 w-4" />} wide>
          <div className="px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
              Smart structural detailing
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Keep the menu compact: insert editable beam, column, and footing details, plus a few quick reinforcement symbols.
            </p>
          </div>
          {REINFORCEMENT_BLOCKS.map((item) => (
            <button
              key={item.name}
              className={menuItem}
              onClick={() =>
                run(() => {
                  if (item.type === "parametric") {
                    onAddParametricBlock(item.kind, item.params);
                    return;
                  }
                  onAddSvg(item.svg);
                })
              }
            >
              <span className="inline-flex items-center gap-2">
                <span className="text-sky-300">{item.icon}</span>
                {item.name}
              </span>
            </button>
          ))}
          <div className="my-1 border-t border-slate-100" />
          <button className={menuItem} onClick={() => run(() => onSetToolMode("dimension"))}>
            <span className="inline-flex items-center gap-2"><Ruler className="h-4 w-4" /> Dimension reinforcement</span>
          </button>
          <button className={menuItem} onClick={() => run(() => onSetToolMode("line"))}>
            <span className="inline-flex items-center gap-2"><PencilLine className="h-4 w-4" /> Draw custom bar path</span>
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
