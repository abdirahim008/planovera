"use client";
// Drawing studio editor: Fabric.js canvas, parametric blocks, library, persistence.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type * as FabricNS from "fabric";
import type { User } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";

import Toolbar from "./Toolbar";
import LeftPanel, { type DrawingPanelTab } from "./LeftPanel";
import {
  broadcastLibraryChanged,
  subscribeLibraryActions,
  type LibraryAction,
} from "@/lib/drawings/libraryBridge";
import { FileText, Plus } from "lucide-react";
import ContextMenu from "./ContextMenu";
import { getPaperDimensions } from "@/lib/drawings/paper";
import {
  TITLE_BLOCK_KEY,
  TB_FIELD_KEY,
  Page,
  TitleBlockData,
  addSvgToCanvas,
  createDimensionGroup,
  createLeaderGroup,
  createLeaderArrow,
  createOrUpdateTitleBlock,
  createSvgObject,
  exportPagesToPDF,
  fitAndCenterObjectsOnPaper,
  splitSvgSubpaths,
  ungroupSvgObjects,
} from "@/lib/drawings/fabricHelpers";
import { extractSegments, findSnapPoint, renderSnapMarker } from "@/lib/drawings/snapping";
import { PATTERNS, PatternType } from "@/lib/drawings/patterns";
import {
  LIBRARY_CATEGORIES,
  LibraryCategory,
  LibraryFabricJson,
  LibraryItem,
  LibraryItemRecord,
  ProfileRecord,
  ProjectRecord,
  SEED_LIBRARY_ITEMS,
  SavedProject,
  UserSession,
  createLibraryItem,
  createBlankPage,
  loadLibraryItems,
  mapLibraryRecord,
  mapProfileToSession,
  mapProjectRecord,
  parseTags,
  loadFavoriteIds,
  loadRecentIds,
  loadSavedProjects,
  persistFavoriteIds,
  persistLibraryItems,
  persistRecentIds,
  persistSavedProjects,
} from "@/lib/drawings/appModel";
import {
  PARAMETRIC_BLOCK_LABELS,
  ParametricBlockKind,
  ParametricBlockParams,
  ParametricBlockState,
  createParametricBlockSvg,
  getDefaultParametricParams,
  normalizeParametricParams,
} from "@/lib/drawings/parametricBlocks";
import { sanitizeSvgMarkup } from "@/lib/drawings/svgSanitize";
import { useAppStore } from "@/lib/store";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase-browser";

type FabricMod = typeof FabricNS;
type ToolMode =
  | "select"
  | "marquee"
  | "lasso"
  | "pan"
  | "line"
  | "dimension"
  | "leader"
  | "trim"
  | "wall"
  | "wallRect"
  | "door"
  | "window";
type LineStyle = "solid" | "dashed";
type TextStyleSnapshot = {
  hasText: boolean;
  fontSize: number | null;
  fill: string | null;
};
type TextStyleUpdate = {
  fontSize?: number;
  fill?: string;
};
type CanvasHistory = {
  past: string[];
  future: string[];
  initialized: boolean;
  isRestoring: boolean;
};

const WALL_KEY = "__drawflowWall";
const WALL_THICKNESS_KEY = "__drawflowWallThickness";
const OPENING_KEY = "__drawflowOpening";
const OPENING_TYPE_KEY = "__drawflowOpeningType";
const OPENING_WIDTH_KEY = "__drawflowOpeningWidth";
const PARAMETRIC_KIND_KEY = "__drawflowParametricKind";
const PARAMETRIC_PARAMS_KEY = "__drawflowParametricParams";
const PARAMETRIC_LABEL_KEY = "__drawflowParametricLabel";

type GroupLikeObject = FabricNS.FabricObject & {
  _objects?: FabricNS.FabricObject[];
  removeAll?: () => FabricNS.FabricObject[];
};

type StyleableFabricObject = FabricNS.FabricObject & {
  _objects?: FabricNS.FabricObject[];
  getObjects?: () => FabricNS.FabricObject[];
};

type LibrarySaveDraft = {
  mode: "object" | "drawing";
  scope: "personal" | "shared";
  name: string;
  category: LibraryCategory;
  description: string;
  tags: string;
  svg: string;
  /** Structured Fabric objects captured with the svg — grouping preserved. */
  fabricJson: LibraryFabricJson | null;
};

type LinkedProjectContext = {
  id: string;
  name: string;
  clientName?: string;
  contractorName?: string;
  consultantName?: string;
  contractTitle?: string;
  code?: string;
  location?: string;
};

function syncSheetLabels(items: Page[]): Page[] {
  return items.map((page, index) => ({
    ...page,
    titleBlockData: {
      ...page.titleBlockData,
      sheet: `${index + 1} of ${items.length}`,
    },
  }));
}

function clonePages(items: Page[]): Page[] {
  return JSON.parse(JSON.stringify(items)) as Page[];
}

function getDrawingPackageName(linkedProject?: LinkedProjectContext | null) {
  return linkedProject ? `${linkedProject.name} Drawings` : "Untitled Engineering Package";
}

function isUngroupableObject(object?: FabricNS.FabricObject | null): object is GroupLikeObject {
  if (!object || object.type === "activeselection") return false;

  const candidate = object as GroupLikeObject;
  return (
    object.type === "group" ||
    typeof candidate.removeAll === "function" ||
    Boolean(candidate._objects && candidate._objects.length > 0)
  );
}

// ── Region-selection geometry ─────────────────────────────────────────
// Both region tools (box + lasso) use the same strict rule: an object is
// selected only when it sits FULLY inside the traced region. Nothing outside
// the region is ever grabbed — no matter how its (possibly huge) bounding box
// overlaps, and no matter how many identical shapes exist elsewhere — which is
// what makes carving parts out of dense drawings predictable.

type RegionPoint = { x: number; y: number };

// Ray-cast point-in-polygon, scene coordinates.
function pointInPolygon(point: RegionPoint, polygon: RegionPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    const crosses =
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

// The points that must all fall inside the region: bounding-box corners, edge
// midpoints and centre (9 samples — enough to reject boxes that poke out of a
// concave lasso without walking every path segment).
function objectSamplePoints(object: FabricNS.FabricObject): RegionPoint[] {
  const rect = object.getBoundingRect();
  const xs = [rect.left, rect.left + rect.width / 2, rect.left + rect.width];
  const ys = [rect.top, rect.top + rect.height / 2, rect.top + rect.height];
  const points: RegionPoint[] = [];
  for (const x of xs) for (const y of ys) points.push({ x, y });
  return points;
}

function objectFullyInRect(
  object: FabricNS.FabricObject,
  box: { left: number; top: number; width: number; height: number },
): boolean {
  const b = object.getBoundingRect();
  return (
    b.left >= box.left &&
    b.top >= box.top &&
    b.left + b.width <= box.left + box.width &&
    b.top + b.height <= box.top + box.height
  );
}

function objectFullyInPolygon(object: FabricNS.FabricObject, polygon: RegionPoint[]): boolean {
  return objectSamplePoints(object).every((point) => pointInPolygon(point, polygon));
}

function serializeLibraryObject(object: FabricNS.FabricObject) {
  const bounds = object.getBoundingRect();
  const width = Math.max(bounds.width, 1);
  const height = Math.max(bounds.height, 1);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bounds.left} ${bounds.top} ${width} ${height}" fill="none">${object.toSVG()}</svg>`;
}

// Custom keys carried through library JSON serialization (mirrors the
// FabricObject.customProperties registration below) so walls, openings and
// parametric blocks stay editable after a warehouse round-trip.
const LIBRARY_JSON_KEYS = [
  WALL_KEY,
  WALL_THICKNESS_KEY,
  OPENING_KEY,
  OPENING_TYPE_KEY,
  OPENING_WIDTH_KEY,
  PARAMETRIC_KIND_KEY,
  PARAMETRIC_PARAMS_KEY,
  PARAMETRIC_LABEL_KEY,
];

/**
 * Serialize the exportable canvas objects to structured Fabric JSON. Unlike
 * toSVG (which flattens everything to paths on re-import), this preserves the
 * admin's grouping and parametric metadata — warehouse curation persists in
 * the library until the next admin update.
 */
function serializeCanvasFabricJson(canvas: FabricNS.Canvas): LibraryFabricJson | null {
  const objects = canvas
    .getObjects()
    .filter((object) => !object.excludeFromExport)
    .map((object) => object.toObject(LIBRARY_JSON_KEYS) as unknown);
  return objects.length > 0 ? { objects } : null;
}

function serializeObjectFabricJson(object: FabricNS.FabricObject): LibraryFabricJson {
  return { objects: [object.toObject(LIBRARY_JSON_KEYS) as unknown] };
}

function getStyleTargets(object: FabricNS.FabricObject): FabricNS.FabricObject[] {
  const candidate = object as StyleableFabricObject;
  const childObjects =
    typeof candidate.getObjects === "function" ? candidate.getObjects() : candidate._objects;

  if (!childObjects || childObjects.length === 0) return [object];

  const descendants = childObjects.flatMap(getStyleTargets);
  return object.type === "activeselection" ? descendants : [object, ...descendants];
}

function isTextObject(object: FabricNS.FabricObject) {
  return ["i-text", "itext", "textbox", "text", "text-node"].includes(object.type ?? "");
}

function getTextTargets(object: FabricNS.FabricObject): FabricNS.FabricObject[] {
  return getStyleTargets(object).filter(isTextObject);
}

function getGeometryTargets(object: FabricNS.FabricObject): FabricNS.FabricObject[] {
  return getStyleTargets(object).filter((target) => !isTextObject(target));
}

function getTextStyleSnapshot(objects: FabricNS.FabricObject[]): TextStyleSnapshot {
  const textTargets = objects.flatMap(getTextTargets);
  const firstText = textTargets[0] as
    | (FabricNS.FabricObject & { fontSize?: number; fill?: unknown })
    | undefined;

  if (!firstText) return { hasText: false, fontSize: null, fill: null };

  return {
    hasText: true,
    fontSize: Number(firstText.fontSize ?? 18),
    fill: typeof firstText.fill === "string" ? firstText.fill : "#0f172a",
  };
}

function getParametricBlockState(object?: FabricNS.FabricObject | null): ParametricBlockState | null {
  if (!object || object.type === "activeselection") return null;

  const record = object as unknown as Record<string, unknown>;
  const kind = record[PARAMETRIC_KIND_KEY] as ParametricBlockKind | undefined;
  if (!kind || !(kind in PARAMETRIC_BLOCK_LABELS)) return null;

  return {
    kind,
    label: String(record[PARAMETRIC_LABEL_KEY] ?? PARAMETRIC_BLOCK_LABELS[kind]),
    params: normalizeParametricParams(kind, record[PARAMETRIC_PARAMS_KEY] as Partial<ParametricBlockParams>),
  };
}

function stampParametricBlock(
  object: FabricNS.FabricObject,
  kind: ParametricBlockKind,
  params?: Partial<ParametricBlockParams>,
) {
  const normalized = normalizeParametricParams(kind, params);
  object.set({
    [PARAMETRIC_KIND_KEY]: kind,
    [PARAMETRIC_PARAMS_KEY]: normalized,
    [PARAMETRIC_LABEL_KEY]: PARAMETRIC_BLOCK_LABELS[kind],
  } as Partial<FabricNS.FabricObject>);
}

function makeStrokeNonScaling(object?: FabricNS.FabricObject | null) {
  if (!object) return;

  object.set({ strokeUniform: true } as Partial<FabricNS.FabricObject>);

  const candidate = object as StyleableFabricObject;
  const childObjects =
    typeof candidate.getObjects === "function" ? candidate.getObjects() : candidate._objects;

  childObjects?.forEach(makeStrokeNonScaling);
}

function applyLinkedProjectContext(
  items: Page[],
  linkedProject?: LinkedProjectContext | null,
): Page[] {
  const pages = syncSheetLabels(items);
  if (!linkedProject) return pages;

  return pages.map((page, index) => ({
    ...page,
    titleBlockData: {
      ...page.titleBlockData,
      projectTitle: linkedProject.name || page.titleBlockData.projectTitle,
      client: linkedProject.clientName || page.titleBlockData.client,
      drawingTitle:
        index === 0 && linkedProject.contractTitle
          ? linkedProject.contractTitle
          : page.titleBlockData.drawingTitle,
      drawingNo: linkedProject.code
        ? `${linkedProject.code}-DRW-${String(index + 1).padStart(3, "0")}`
        : page.titleBlockData.drawingNo,
    },
  }));
}

function lineLineIntersect(
  ax1: number,
  ay1: number,
  ax2: number,
  ay2: number,
  bx1: number,
  by1: number,
  bx2: number,
  by2: number,
): { x: number; y: number } | null {
  const dax = ax2 - ax1;
  const day = ay2 - ay1;
  const dbx = bx2 - bx1;
  const dby = by2 - by1;
  const denom = dax * dby - day * dbx;

  if (Math.abs(denom) < 1e-10) return null;

  const t = ((bx1 - ax1) * dby - (by1 - ay1) * dbx) / denom;
  const u = ((bx1 - ax1) * day - (by1 - ay1) * dax) / denom;

  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: ax1 + t * dax, y: ay1 + t * day };
}

function mergeLibraryItems(remoteItems: LibraryItem[]): LibraryItem[] {
  const seen = new Set(remoteItems.map((item) => item.name.toLowerCase()));
  return [
    ...remoteItems,
    ...SEED_LIBRARY_ITEMS.filter((item) => !seen.has(item.name.toLowerCase())),
  ];
}

export default function Editor({
  embedded = false,
  linkedProject = null,
  editLibraryId = null,
}: {
  embedded?: boolean;
  linkedProject?: LinkedProjectContext | null;
  // When set (admin "Edit in canvas" deep-link), the studio opens this warehouse
  // drawing for editing once it has finished booting — deterministic, no reliance
  // on the cross-tab import queue.
  editLibraryId?: string | null;
} = {}) {
  const router = useRouter();
  const setActiveModule = useAppStore((state) => state.setActiveModule);
  const authConfigured = isSupabaseConfigured();
  const [fabricMod, setFabricMod] = useState<FabricMod | null>(null);
  const [booted, setBooted] = useState(false);
  const [session, setSession] = useState<UserSession | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState(() => getDrawingPackageName(linkedProject));
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>(SEED_LIBRARY_ITEMS);
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => loadFavoriteIds());
  const [recentIds, setRecentIds] = useState<string[]>(() => loadRecentIds());
  const [savedProjects, setSavedProjects] = useState<SavedProject[]>([]);

  const toggleLibraryFavorite = useCallback((libraryId: string) => {
    setFavoriteIds((current) => {
      const next = current.includes(libraryId)
        ? current.filter((id) => id !== libraryId)
        : [libraryId, ...current];
      persistFavoriteIds(next);
      return next;
    });
  }, []);

  // Admin "edit a library drawing" session: the drawing is loaded onto a fresh
  // isolated sheet; Save overwrites the source item. Null when not editing.
  const [editingLibraryItem, setEditingLibraryItem] = useState<{
    id: string;
    name: string;
    category: LibraryCategory;
    description: string;
    tags: string[];
    /** Seed items publish a DB override on update instead of an in-place edit. */
    source: LibraryItem["source"];
  } | null>(null);
  // SVG queued to load once the editing sheet's canvas is ready (see the canvas
  // init effect, which loads it after the blank page mounts).
  const pendingLoadRef = useRef<string | null>(null);
  // Structured Fabric JSON queued the same way — takes priority over the SVG so
  // a curated drawing re-opens with its saved grouping intact.
  const pendingLoadJsonRef = useRef<LibraryFabricJson | null>(null);

  const recordLibraryUse = useCallback((libraryId: string) => {
    setRecentIds((current) => {
      const next = [libraryId, ...current.filter((id) => id !== libraryId)];
      persistRecentIds(next);
      return next;
    });
  }, []);
  const [pages, setPages] = useState<Page[]>(() =>
    applyLinkedProjectContext([createBlankPage(1)], linkedProject),
  );
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [zoom, setZoom] = useState(0.6);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [selectedCount, setSelectedCount] = useState(0);
  const [selectedTextStyle, setSelectedTextStyle] = useState<TextStyleSnapshot>({
    hasText: false,
    fontSize: null,
    fill: null,
  });
  const [selectedParametricBlock, setSelectedParametricBlock] = useState<ParametricBlockState | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [toolMode, setToolMode] = useState<ToolMode>("select");
  const [studioTray, setStudioTray] = useState<DrawingPanelTab | null>("properties");
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [contextMenu, setContextMenu] = useState({
    visible: false,
    x: 0,
    y: 0,
  });
  const [librarySaveDraft, setLibrarySaveDraft] = useState<LibrarySaveDraft | null>(null);

  const handleBackToDashboard = useCallback(() => {
    setActiveModule("dashboard");
    router.push("/workspace");
  }, [router, setActiveModule]);

  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const fabricRef = useRef<FabricNS.Canvas | null>(null);
  const clipboardRef = useRef<FabricNS.FabricObject | null>(null);
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  // Anchor for cursor-centred wheel zoom: the paper point under the pointer and
  // the pointer's screen position. Consumed by the zoom effect right after the
  // canvas resizes, so the point under the cursor stays put.
  const wheelAnchorRef = useRef({ active: false, clientX: 0, clientY: 0, paperX: 0, paperY: 0 });
  // Coalesce rapid wheel ticks into one zoom update per animation frame, so a
  // fast scroll doesn't trigger a React render + canvas resize for every event.
  const zoomRafRef = useRef<{ factor: number; raf: number | null }>({ factor: 1, raf: null });
  // Pending debounced history snapshot (see commitHistory). Flushed before undo/redo.
  const historyCommitTimerRef = useRef<number | null>(null);
  const historyRef = useRef<CanvasHistory>({
    past: [],
    future: [],
    initialized: false,
    isRestoring: false,
  });
  const toolModeRef = useRef<ToolMode>("select");
  const snapEnabledRef = useRef(true);
  // Box-select ("marquee") tool: drag a rectangle to select every object that
  // sits FULLY inside it — the predictable window-selection rule on dense
  // imported drawings where pressing anywhere lands on a line.
  const marqueeRef = useRef<{ start?: { x: number; y: number }; rect?: FabricNS.FabricObject | null }>({});
  // Freehand ("lasso") tool: trace any outline around the objects to select —
  // for details a rectangle can't isolate cleanly.
  const lassoRef = useRef<{ points: { x: number; y: number }[]; line?: FabricNS.FabricObject | null }>({
    points: [],
  });
  const dimStateRef = useRef<{
    step: number;
    p1?: { x: number; y: number };
    p2?: { x: number; y: number };
    previewGroup?: FabricNS.Group | null;
  }>({ step: 0 });
  const lineStateRef = useRef<{
    // Confirmed points along the current polyline (first click = points[0]).
    points: { x: number; y: number }[];
    // Preview polyline drawn from confirmed points + the rubber-band cursor segment.
    previewPolyline?: FabricNS.Polyline | null;
  }>({ points: [] });
  // Leader/callout: step 0 → pick the anchor (arrow tip); step 1 → pick the
  // label position, then prompt for the text.
  const leaderStateRef = useRef<{
    step: number;
    anchor?: { x: number; y: number };
    previewGroup?: FabricNS.Group | null;
  }>({ step: 0 });
  const wallStateRef = useRef<{
    p1?: { x: number; y: number };
    previewLine?: FabricNS.Line | null;
    previewRectWalls?: FabricNS.Line[];
  }>({});

  const currentPage = pages[currentPageIndex] ?? pages[0];
  const canRenderWorkspace = Boolean(session && currentPage);

  useEffect(() => {
    snapEnabledRef.current = snapEnabled;
    if (!snapEnabled && fabricMod && fabricRef.current) {
      renderSnapMarker(fabricMod, fabricRef.current, null);
    }
  }, [fabricMod, snapEnabled]);

  const setMessage = useCallback((message: string) => {
    setStatusMessage(message);
  }, []);

  useEffect(() => {
    if (!statusMessage) return;
    const timer = window.setTimeout(() => setStatusMessage(null), 3600);
    return () => window.clearTimeout(timer);
  }, [statusMessage]);

  useEffect(() => {
    let mounted = true;
    import("fabric").then((mod) => {
      const fabricObject = mod.FabricObject as unknown as { customProperties?: string[] };
      fabricObject.customProperties = Array.from(
        new Set([
          ...(fabricObject.customProperties ?? []),
          WALL_KEY,
          WALL_THICKNESS_KEY,
          OPENING_KEY,
          OPENING_TYPE_KEY,
          OPENING_WIDTH_KEY,
          PARAMETRIC_KIND_KEY,
          PARAMETRIC_PARAMS_KEY,
          PARAMETRIC_LABEL_KEY,
        ]),
      );
      if (mounted) setFabricMod(mod);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const applyZoom = useCallback(
    (canvas: FabricNS.Canvas, z: number, paperW: number, paperH: number) => {
      canvas.setZoom(z);
      canvas.setDimensions({ width: paperW * z, height: paperH * z });
      canvas.requestRenderAll();
    },
    [],
  );

  const refreshHistoryState = useCallback(() => setHistoryVersion((value) => value + 1), []);

  const serializeCanvasHistory = useCallback((canvas: FabricNS.Canvas) => JSON.stringify(canvas.toJSON()), []);

  const initializeHistory = useCallback(
    (canvas: FabricNS.Canvas) => {
      historyRef.current = {
        past: [serializeCanvasHistory(canvas)],
        future: [],
        initialized: true,
        isRestoring: false,
      };
      refreshHistoryState();
    },
    [refreshHistoryState, serializeCanvasHistory],
  );

  // Immediate snapshot. Keeping a shallower stack (25 vs 80) bounds the memory
  // held for a complex drawing — each snapshot is a full JSON of the canvas.
  const commitHistoryNow = useCallback(() => {
    if (historyCommitTimerRef.current !== null) {
      window.clearTimeout(historyCommitTimerRef.current);
      historyCommitTimerRef.current = null;
    }
    const canvas = fabricRef.current;
    const history = historyRef.current;
    if (!canvas || !history.initialized || history.isRestoring) return;

    const snapshot = serializeCanvasHistory(canvas);
    if (history.past[history.past.length - 1] === snapshot) return;

    history.past = [...history.past, snapshot].slice(-25);
    history.future = [];
    refreshHistoryState();
  }, [refreshHistoryState, serializeCanvasHistory]);

  // Coalesce bursts of edits into a single serialize on the next idle tick so
  // dragging/resizing stays smooth instead of stringifying the whole canvas on
  // every event. Undo/redo flush this first (commitHistoryNow) so they never
  // miss the latest edit.
  const commitHistory = useCallback(() => {
    if (historyCommitTimerRef.current !== null) window.clearTimeout(historyCommitTimerRef.current);
    historyCommitTimerRef.current = window.setTimeout(() => {
      historyCommitTimerRef.current = null;
      commitHistoryNow();
    }, 220);
  }, [commitHistoryNow]);

  const restoreHistorySnapshot = useCallback(
    async (snapshot: string, message: string) => {
      const canvas = fabricRef.current;
      if (!canvas) return;

      const history = historyRef.current;
      history.isRestoring = true;
      canvas.discardActiveObject();
      await canvas.loadFromJSON(JSON.parse(snapshot));
      canvas.getObjects().forEach(makeStrokeNonScaling);
      canvas.requestRenderAll();
      setSelectedCount(0);
      setSelectedTextStyle({ hasText: false, fontSize: null, fill: null });
      setSelectedParametricBlock(null);
      history.isRestoring = false;
      refreshHistoryState();
      setMessage(message);
    },
    [refreshHistoryState, setMessage],
  );

  const handleUndo = useCallback(async () => {
    commitHistoryNow(); // flush any pending debounced edit so undo sees it
    const history = historyRef.current;
    if (history.past.length <= 1) {
      setMessage("Nothing to undo.");
      return;
    }

    const current = history.past.pop();
    if (current) history.future = [current, ...history.future];
    const previous = history.past[history.past.length - 1];
    if (previous) await restoreHistorySnapshot(previous, "Undo completed.");
  }, [commitHistoryNow, restoreHistorySnapshot, setMessage]);

  const handleRedo = useCallback(async () => {
    commitHistoryNow(); // flush any pending debounced edit first
    const history = historyRef.current;
    const next = history.future.shift();
    if (!next) {
      setMessage("Nothing to redo.");
      return;
    }

    history.past = [...history.past, next];
    await restoreHistorySnapshot(next, "Redo completed.");
  }, [commitHistoryNow, restoreHistorySnapshot, setMessage]);

  const resetWorkspaceState = useCallback(() => {
    setProjectName(getDrawingPackageName(linkedProject));
    setActiveProjectId(null);
    setSavedProjects([]);
    setPages(applyLinkedProjectContext([createBlankPage(1)], linkedProject));
    setCurrentPageIndex(0);
    setZoom(0.6);
    setSelectedCount(0);
    setSelectedTextStyle({ hasText: false, fontSize: null, fill: null });
    setSelectedParametricBlock(null);
    setLastSavedAt(null);
    setLibraryItems(loadLibraryItems());
  }, [linkedProject]);

  const ensureProfile = useCallback(
    async (user: User) => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) throw new Error("Supabase client is not configured.");

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      if (error && error.code !== "PGRST116") {
        throw error;
      }

      if (data) return data as ProfileRecord;

      const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
      const payload = {
        id: user.id,
        email: user.email ?? "",
        full_name:
          typeof metadata.full_name === "string" && metadata.full_name.trim()
            ? metadata.full_name
            : user.email ?? "Engineer User",
        company:
          typeof metadata.company === "string" && metadata.company.trim()
            ? metadata.company
            : "",
        role: "engineer" as const,
      };

      const { data: inserted, error: insertError } = await supabase
        .from("profiles")
        .upsert(payload)
        .select("*")
        .single();

      if (insertError) throw insertError;
      return inserted as ProfileRecord;
    },
    [],
  );

  const loadWorkspaceData = useCallback(
    async (profile: ProfileRecord) => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;

      const [{ data: projectRows, error: projectsError }, { data: libraryRows, error: libraryError }] =
        await Promise.all([
          // List metadata only — the heavy `pages` JSON (which can hold large
          // inserted drawings) is fetched on demand when a project is opened.
          supabase
            .from("drawing_projects")
            .select("id,owner_id,linked_project_id,linked_project_name,name,created_at,updated_at")
            .order("updated_at", { ascending: false }),
          // Metadata only — the studio panel shows names (the warehouse tab loads
          // its own thumbnails); the large svg + thumbnail are fetched lazily.
          supabase
            .from("drawing_library_items")
            .select("id,name,category,description,tags,asset_type,author_id,author_name,updated_at")
            .order("updated_at", { ascending: false }),
        ]);

      if (projectsError) throw projectsError;
      if (libraryError) throw libraryError;

      const nextProjects = ((projectRows ?? []) as ProjectRecord[]).map((project) =>
        mapProjectRecord(project, profile.full_name || profile.email),
      );
      const scopedProjects = linkedProject?.id
        ? nextProjects.filter((project) => project.linkedProjectId === linkedProject.id)
        : nextProjects;
      const nextLibrary = mergeLibraryItems(
        ((libraryRows ?? []) as LibraryItemRecord[]).map(mapLibraryRecord),
      );

      setSavedProjects(scopedProjects);
      setLibraryItems(nextLibrary);
      setLastSavedAt(scopedProjects[0]?.updatedAt ?? null);
    },
    [linkedProject],
  );

  // Last auth user this tab fully synced for — lets the auth listener skip
  // benign repeat events (token refresh, tab focus, cross-tab activity)
  // instead of re-downloading the studio workspace on every one.
  const syncedAuthUserIdRef = useRef<string | null>(null);

  const syncUserState = useCallback(
    async (user: User | null) => {
      if (!user) {
        syncedAuthUserIdRef.current = null;
        setSession(null);
        setUserId(null);
        resetWorkspaceState();
        setBooted(true);
        router.replace("/login");
        router.refresh();
        return;
      }

      syncedAuthUserIdRef.current = user.id;
      try {
        const profile = await ensureProfile(user);
        setSession(mapProfileToSession(profile));
        setUserId(user.id);
        await loadWorkspaceData(profile);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Could not load Supabase data.";
        setSession({
          id: user.id,
          email: user.email ?? "",
          name: user.email ?? "Signed in user",
          company: "",
          role: "engineer",
        });
        setUserId(user.id);
        setLibraryItems(loadLibraryItems());
        setSavedProjects([]);
        setMessage(
          `Supabase auth worked, but database setup is incomplete: ${message}. Run supabase/schema.sql before continuing.`,
        );
      } finally {
        setBooted(true);
      }
    },
    [ensureProfile, loadWorkspaceData, resetWorkspaceState, router, setMessage],
  );

  useEffect(() => {
    let active = true;
    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      setSession({
        name: linkedProject?.consultantName || "Local Engineer",
        company: linkedProject?.name || "Planovera Workspace",
        role: "engineer",
      });
      setUserId(null);
      setLibraryItems(loadLibraryItems());
      const localProjects = loadSavedProjects();
      const scopedLocal = linkedProject?.id
        ? localProjects.filter((p) => p.linkedProjectId === linkedProject.id)
        : localProjects;
      setSavedProjects(scopedLocal);
      setLastSavedAt(scopedLocal[0]?.updatedAt ?? null);
      setBooted(true);
      return;
    }

    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      void syncUserState(data.user ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      // Only react to real auth transitions. A transient null session — which
      // supabase surfaces during token refresh / tab-focus changes (e.g. while
      // importing a drawing across tabs) — must NOT reset the studio; a genuine
      // sign-out always arrives as SIGNED_OUT.
      if (event === "SIGNED_OUT") {
        void syncUserState(null);
        return;
      }
      // Re-sync only when the signed-in user actually changed; token
      // refreshes and focus-driven repeats for the same user are ignored so
      // the studio doesn't re-download its workspace on every tab switch.
      if (nextSession?.user && nextSession.user.id !== syncedAuthUserIdRef.current) {
        void syncUserState(nextSession.user);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [linkedProject, syncUserState]);

  const finishLinePolyline = useCallback(() => {
    const canvas = fabricRef.current;
    const state = lineStateRef.current;
    if (!canvas || !fabricMod) return false;

    // Always tear down the preview, even if we don't commit anything.
    if (state.previewPolyline) {
      canvas.remove(state.previewPolyline);
      state.previewPolyline = null;
    }

    const points = state.points;
    if (points.length < 2) {
      state.points = [];
      canvas.requestRenderAll();
      return false;
    }

    const minX = Math.min(...points.map((p) => p.x));
    const minY = Math.min(...points.map((p) => p.y));
    const localPoints = points.map((p) => ({ x: p.x - minX, y: p.y - minY }));

    const polyline = new fabricMod.Polyline(localPoints, {
      left: minX,
      top: minY,
      stroke: "#0f172a",
      strokeWidth: 1.2,
      strokeUniform: true,
      strokeLineJoin: "round",
      strokeLineCap: "round",
      fill: "transparent",
      objectCaching: false,
      selectable: true,
      evented: true,
    });

    canvas.add(polyline);
    canvas.setActiveObject(polyline);
    state.points = [];
    canvas.requestRenderAll();
    commitHistory();
    setMessage(points.length === 2 ? "Line placed on sheet." : `Polyline placed with ${points.length - 1} segments.`);
    return true;
  }, [commitHistory, fabricMod, setMessage]);

  const handleSetToolMode = useCallback(
    (mode: ToolMode) => {
      setToolMode(mode);
      toolModeRef.current = mode;

      const canvas = fabricRef.current;
      if (!canvas) return;

      if (fabricMod) renderSnapMarker(fabricMod, canvas, null);

      // If a polyline is in progress, commit it before switching tools (don't lose work).
      const lineState = lineStateRef.current;
      if (lineState.points.length >= 2 && toolModeRef.current === "line" && mode !== "line") {
        if (lineState.previewPolyline) {
          canvas.remove(lineState.previewPolyline);
          lineState.previewPolyline = null;
        }
        finishLinePolyline();
      } else {
        if (lineState.previewPolyline) {
          canvas.remove(lineState.previewPolyline);
          lineState.previewPolyline = null;
        }
        lineState.points = [];
      }

      const wallState = wallStateRef.current;
      if (wallState.previewLine) {
        canvas.remove(wallState.previewLine);
        wallState.previewLine = null;
      }
      if (wallState.previewRectWalls?.length) {
        wallState.previewRectWalls.forEach((line) => canvas.remove(line));
        wallState.previewRectWalls = [];
      }
      wallState.p1 = undefined;

      const dimState = dimStateRef.current;
      if (dimState.previewGroup) canvas.remove(dimState.previewGroup);
      dimStateRef.current = { step: 0 };

      const leaderState = leaderStateRef.current;
      if (leaderState.previewGroup) canvas.remove(leaderState.previewGroup);
      leaderStateRef.current = { step: 0 };

      if (mode === "select") {
        canvas.selection = true;
        canvas.defaultCursor = "default";
      } else if (mode === "pan") {
        canvas.discardActiveObject();
        canvas.selection = false;
        canvas.defaultCursor = "grab";
      } else {
        canvas.discardActiveObject();
        canvas.selection = false;
        canvas.defaultCursor = "crosshair";
      }

      canvas.requestRenderAll();
    },
    [fabricMod, finishLinePolyline],
  );

  const saveCurrentPage = useCallback(async () => {
    const canvas = fabricRef.current;
    if (!canvas || !currentPage) return pages;

    const json = canvas.toJSON();
    const nextPages = [...pages];
    nextPages[currentPageIndex] = { ...nextPages[currentPageIndex], json };
    setPages(nextPages);
    return nextPages;
  }, [currentPage, currentPageIndex, pages]);

  useEffect(() => {
    if (!fabricMod || !canvasElRef.current || !session || !currentPage) return;

    const { width, height } = getPaperDimensions(currentPage.paperSize, currentPage.orientation);
    const canvas = new fabricMod.Canvas(canvasElRef.current, {
      width,
      height,
      backgroundColor: "#ffffff",
      preserveObjectStacking: true,
      selection: true,
      // Rubber-band selects only objects FULLY inside the band (CAD "window
      // selection"). The default box-intersect test grabs unrelated objects
      // whose bounding box merely crosses the band — e.g. a group or merged
      // path whose box spans the sheet while its ink is in another section.
      selectionFullyContained: true,
      // Click-selection hits actual ink, not the bounding box. Sheet-spanning
      // boxes (same offenders as above) otherwise steal clicks on empty paper
      // — selecting or dragging an object whose ink is in another section.
      // Tolerance keeps thin CAD linework easy to pick at low zoom.
      perPixelTargetFind: true,
      targetFindTolerance: 8,
      // Render at 1x instead of devicePixelRatio. On hi-dpi screens this is ~4x
      // less pixel work per frame, which keeps pan/zoom/drag smooth on large
      // drawings — at the cost of slightly softer lines on retina displays.
      enableRetinaScaling: false,
    });

    fabricRef.current = canvas;

    const updateSelectionCount = () => {
      const activeObjects = canvas.getActiveObjects();
      setSelectedCount(activeObjects.length);
      setSelectedTextStyle(getTextStyleSnapshot(activeObjects));
      setSelectedParametricBlock(activeObjects.length === 1 ? getParametricBlockState(activeObjects[0]) : null);
    };
    const calculateOffsetDist = (
      p1: { x: number; y: number },
      p2: { x: number; y: number },
      mouse: { x: number; y: number },
    ) => {
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const length = Math.hypot(dx, dy);
      if (length === 0) return 20;
      const nx = -dy / length;
      const ny = dx / length;
      const mx = mouse.x - p1.x;
      const my = mouse.y - p1.y;
      return mx * nx + my * ny;
    };

    const distance = (p1: { x: number; y: number }, p2: { x: number; y: number }) =>
      Math.hypot(p1.x - p2.x, p1.y - p2.y);

    const createWallLine = (
      p1: { x: number; y: number },
      p2: { x: number; y: number },
      preview = false,
    ) => {
      const wall = new fabricMod.Line([p1.x, p1.y, p2.x, p2.y], {
        stroke: preview ? "#2563eb" : "#334155",
        strokeWidth: 18,
        strokeLineCap: "square",
        strokeUniform: true,
        selectable: !preview,
        evented: !preview,
        opacity: preview ? 0.55 : 1,
        strokeDashArray: preview ? [12, 8] : undefined,
      });
      wall.set({
        [WALL_KEY]: !preview,
        [WALL_THICKNESS_KEY]: 18,
      } as Partial<FabricNS.Line>);
      return wall;
    };

    const getWallSegments = (ignore: FabricNS.FabricObject[] = []) =>
      canvas
        .getObjects()
        .filter((object) => Boolean((object as unknown as Record<string, unknown>)[WALL_KEY]) && !ignore.includes(object))
        .flatMap((object) =>
          extractSegments(fabricMod, object).map((segment) => ({
            object,
            p1: segment.p1,
            p2: segment.p2,
            thickness: Number((object as unknown as Record<string, unknown>)[WALL_THICKNESS_KEY] ?? 18),
          })),
        );

    const findNearestWall = (
      point: { x: number; y: number },
      maxDistance?: number,
      ignore: FabricNS.FabricObject[] = [],
    ) => {
      // Default snap distance is zoom-aware so the click target feels the same at any zoom.
      const currentZoom = canvas.getZoom() || 1;
      const effectiveMaxDistance = maxDistance ?? Math.max(30, Math.min(160, 50 / currentZoom));
      let best:
        | {
            object: FabricNS.FabricObject;
            p1: { x: number; y: number };
            p2: { x: number; y: number };
            point: { x: number; y: number };
            angle: number;
            distance: number;
            thickness: number;
            t: number;
            length: number;
          }
        | null = null;

      for (const wall of getWallSegments(ignore)) {
        const vx = wall.p2.x - wall.p1.x;
        const vy = wall.p2.y - wall.p1.y;
        const lengthSq = vx * vx + vy * vy;
        if (lengthSq < 1) continue;
        const t = Math.max(0, Math.min(1, ((point.x - wall.p1.x) * vx + (point.y - wall.p1.y) * vy) / lengthSq));
        const projected = { x: wall.p1.x + vx * t, y: wall.p1.y + vy * t };
        const d = distance(point, projected);
        if (d > effectiveMaxDistance) continue;
        if (!best || d < best.distance) {
          best = {
            ...wall,
            point: projected,
            angle: (Math.atan2(vy, vx) * 180) / Math.PI,
            distance: d,
            t,
            length: Math.sqrt(lengthSq),
          };
        }
      }

      return best;
    };

    const getWallNetworkCenter = () => {
      const segments = getWallSegments();
      if (segments.length < 2) return null;

      const points = segments.flatMap((segment) => [segment.p1, segment.p2]);
      const minX = Math.min(...points.map((point) => point.x));
      const maxX = Math.max(...points.map((point) => point.x));
      const minY = Math.min(...points.map((point) => point.y));
      const maxY = Math.max(...points.map((point) => point.y));

      if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
        return null;
      }

      return {
        x: (minX + maxX) / 2,
        y: (minY + maxY) / 2,
      };
    };

    const createHostedOpening = (
      type: "door" | "window",
      host: NonNullable<ReturnType<typeof findNearestWall>>,
      clickPoint: { x: number; y: number },
    ) => {
      const openingWidth = type === "door" ? 92 : 126;
      const wallThickness = Math.max(host.thickness, 18);
      const usableOpeningWidth = Math.min(openingWidth, Math.max(46, host.length - wallThickness - 28));
      const centerlineOpeningWidth = usableOpeningWidth + wallThickness;
      const halfOpening = centerlineOpeningWidth / 2;
      const centerAlongWall = Math.min(
        Math.max(host.t * host.length, halfOpening),
        Math.max(halfOpening, host.length - halfOpening),
      );
      const startT = (centerAlongWall - halfOpening) / host.length;
      const endT = (centerAlongWall + halfOpening) / host.length;
      const vx = host.p2.x - host.p1.x;
      const vy = host.p2.y - host.p1.y;
      const openingStart = { x: host.p1.x + vx * startT, y: host.p1.y + vy * startT };
      const openingEnd = { x: host.p1.x + vx * endT, y: host.p1.y + vy * endT };
      const openingCenter = {
        x: (openingStart.x + openingEnd.x) / 2,
        y: (openingStart.y + openingEnd.y) / 2,
      };
      const unitX = vx / host.length;
      const unitY = vy / host.length;
      const normal = { x: -unitY, y: unitX };
      const roomCenter = getWallNetworkCenter();
      const sideReference = roomCenter ?? clickPoint;
      const swingSide =
        (sideReference.x - openingCenter.x) * normal.x + (sideReference.y - openingCenter.y) * normal.y >= 0
          ? 1
          : -1;
      const swingY = swingSide * wallThickness / 2;
      const leafEndY = swingSide * (wallThickness / 2 + usableOpeningWidth);
      const arcSweep = swingSide === 1 ? 0 : 1;
      const hingeX = -usableOpeningWidth / 2;
      const latchX = usableOpeningWidth / 2;

      canvas.remove(host.object);
      const replacementWalls = [
        distance(host.p1, openingStart) > 4 ? createWallLine(host.p1, openingStart) : null,
        distance(openingEnd, host.p2) > 4 ? createWallLine(openingEnd, host.p2) : null,
      ].filter((wall): wall is FabricNS.Line => Boolean(wall));
      replacementWalls.forEach((wall) => canvas.add(wall));

      const symbols: FabricNS.FabricObject[] =
        type === "door"
          ? [
              new fabricMod.Line(
                [hingeX, swingY, hingeX, leafEndY],
                {
                  stroke: "#0f172a",
                  strokeWidth: 3,
                  strokeLineCap: "round",
                  strokeUniform: true,
                },
              ),
              new fabricMod.Path(
                `M ${hingeX} ${leafEndY} A ${usableOpeningWidth} ${usableOpeningWidth} 0 0 ${arcSweep} ${latchX} ${swingY}`,
                {
                  stroke: "#2563eb",
                  strokeWidth: 2,
                  strokeUniform: true,
                  fill: "",
                },
              ),
              new fabricMod.Line([hingeX, swingY, latchX, swingY], {
                stroke: "#64748b",
                strokeWidth: 1.2,
                strokeUniform: true,
                strokeDashArray: [6, 5],
              }),
            ]
          : [
              new fabricMod.Line([-usableOpeningWidth / 2, 0, usableOpeningWidth / 2, 0], {
                stroke: "#2563eb",
                strokeWidth: 4,
                strokeUniform: true,
              }),
              new fabricMod.Line([-usableOpeningWidth / 2, -8, usableOpeningWidth / 2, -8], {
                stroke: "#2563eb",
                strokeWidth: 1.5,
                strokeUniform: true,
              }),
              new fabricMod.Line([-usableOpeningWidth / 2, 8, usableOpeningWidth / 2, 8], {
                stroke: "#2563eb",
                strokeWidth: 1.5,
                strokeUniform: true,
              }),
            ];

      const opening = new fabricMod.Group(symbols, {
        left: openingCenter.x,
        top: openingCenter.y,
        angle: host.angle,
        originX: "center",
        originY: "center",
        selectable: true,
        evented: true,
        subTargetCheck: false,
        lockScalingFlip: true,
      });

      makeStrokeNonScaling(opening);
      opening.set({
        [OPENING_KEY]: true,
        [OPENING_TYPE_KEY]: type,
        [OPENING_WIDTH_KEY]: usableOpeningWidth,
      } as Partial<FabricNS.Group>);
      return opening;
    };

    canvas.on("selection:created", updateSelectionCount);
    canvas.on("selection:updated", updateSelectionCount);
    canvas.on("selection:cleared", () => {
      setSelectedCount(0);
      setSelectedTextStyle({ hasText: false, fontSize: null, fill: null });
      setSelectedParametricBlock(null);
    });
    canvas.on("object:modified", commitHistory);
    canvas.on("object:scaling", (opt) => makeStrokeNonScaling(opt.target));
    canvas.on("object:moving", (opt) => {
      if (!opt.target) return;

      const movingObject = opt.target;

      if ((movingObject as unknown as Record<string, unknown>)[OPENING_KEY]) {
        const center = movingObject.getCenterPoint();
        const host = findNearestWall(center, 120, [movingObject]);
        if (!host) return;

        movingObject.set({
          left: host.point.x,
          top: host.point.y,
          angle: host.angle,
        });
        movingObject.setCoords();
        renderSnapMarker(fabricMod, canvas, {
          point: host.point,
          type: "edge",
          distance: host.distance,
        });
        canvas.requestRenderAll();
        return;
      }

      if (!snapEnabledRef.current) return;

      movingObject.setCoords();
      const coords = movingObject.aCoords;
      if (!coords) return;

      const candidatePoints = [
        coords.tl,
        coords.tr,
        coords.br,
        coords.bl,
        { x: (coords.tl.x + coords.tr.x) / 2, y: (coords.tl.y + coords.tr.y) / 2 },
        { x: (coords.tr.x + coords.br.x) / 2, y: (coords.tr.y + coords.br.y) / 2 },
        { x: (coords.br.x + coords.bl.x) / 2, y: (coords.br.y + coords.bl.y) / 2 },
        { x: (coords.bl.x + coords.tl.x) / 2, y: (coords.bl.y + coords.tl.y) / 2 },
        movingObject.getCenterPoint(),
      ];

      const best = candidatePoints
        .map((point) => ({ point, snap: findSnapPoint(fabricMod, point, canvas, [movingObject]) }))
        .filter((item): item is { point: { x: number; y: number }; snap: NonNullable<ReturnType<typeof findSnapPoint>> } =>
          Boolean(item.snap),
        )
        .sort((a, b) => a.snap.distance - b.snap.distance)[0];

      if (!best) {
        renderSnapMarker(fabricMod, canvas, null);
        return;
      }

      movingObject.set({
        left: (movingObject.left ?? 0) + (best.snap.point.x - best.point.x),
        top: (movingObject.top ?? 0) + (best.snap.point.y - best.point.y),
      });
      movingObject.setCoords();
      renderSnapMarker(fabricMod, canvas, best.snap);
      canvas.requestRenderAll();
    });

    canvas.on("contextmenu", (opt) => {
      opt.e.preventDefault();
      opt.e.stopPropagation();
      const mouseEvent = opt.e as MouseEvent;

      if (opt.target) {
        canvas.setActiveObject(opt.target);
        setContextMenu({ visible: true, x: mouseEvent.clientX, y: mouseEvent.clientY });
      } else {
        canvas.discardActiveObject();
        setContextMenu({ visible: true, x: mouseEvent.clientX, y: mouseEvent.clientY });
      }
    });

    const canvasElement = canvas.getElement();
    canvasElement.oncontextmenu = (event) => event.preventDefault();

    canvas.on("mouse:dblclick", (opt) => {
      // Double-click finishes an in-progress polyline.
      if (toolModeRef.current === "line" && lineStateRef.current.points.length > 0) {
        finishLinePolyline();
        return;
      }
      const target = opt.target as (FabricNS.FabricObject & Record<string, unknown>) | undefined;
      if (target && (target.type === "itext" || target.type === "textbox")) {
        canvas.setActiveObject(target);
        (target as unknown as FabricNS.IText).enterEditing();
        canvas.requestRenderAll();
        return;
      }
      // Dimensions and leaders are groups, so their inner text can't be edited
      // in place — double-click prompts for the new value instead.
      if (target && (target._isDimension || target._isLeader)) {
        const group = target as unknown as FabricNS.Group;
        const inner = group
          .getObjects()
          .find((o) => o instanceof fabricMod.IText) as unknown as FabricNS.IText | undefined;
        if (inner) {
          const next = window.prompt(
            target._isDimension ? "Dimension value" : "Label text",
            inner.text ?? "",
          );
          if (next !== null) {
            inner.set({ text: next });
            group.set({ dirty: true } as Partial<FabricNS.Group>);
            canvas.requestRenderAll();
            commitHistory();
          }
        }
      }
    });

    canvas.on("text:changed", (opt) => {
      const target = opt.target as unknown as
        | (FabricNS.FabricObject & Record<string, unknown>)
        | undefined;
      if (!target) return;

      if (target[TB_FIELD_KEY]) {
        const fieldName = target[TB_FIELD_KEY] as keyof TitleBlockData;
        const newValue = (target as unknown as { text?: string }).text ?? "";
        setPages((previous) => {
          const next = [...previous];
          const page = { ...next[currentPageIndex] };
          page.titleBlockData = { ...page.titleBlockData, [fieldName]: newValue };
          next[currentPageIndex] = page;
          return next;
        });
      }
      commitHistory();
    });

    let isDragging = false;
    let lastPosX = 0;
    let lastPosY = 0;

    canvas.on("mouse:wheel", (opt) => {
      const event = opt.e;

      // Record the drawing point currently under the cursor (in unscaled paper
      // units) from the zoom that's actually applied right now — this is
      // zoom-invariant, so it stays correct even while several wheel ticks are
      // still batched in React state. The zoom effect re-anchors the scroll to
      // it right after the canvas resizes.
      const canvasEl = canvasElRef.current;
      if (canvasEl) {
        const rect = canvasEl.getBoundingClientRect();
        const appliedZoom = canvas.getZoom() || 1;
        const anchor = wheelAnchorRef.current;
        anchor.active = true;
        anchor.clientX = event.clientX;
        anchor.clientY = event.clientY;
        anchor.paperX = (event.clientX - rect.left) / appliedZoom;
        anchor.paperY = (event.clientY - rect.top) / appliedZoom;
      }

      // Accumulate the zoom factor and apply it once on the next frame instead
      // of running a render + resize per wheel event.
      const zr = zoomRafRef.current;
      zr.factor *= 0.999 ** event.deltaY;
      if (zr.raf === null) {
        zr.raf = requestAnimationFrame(() => {
          const factor = zr.factor;
          zr.factor = 1;
          zr.raf = null;
          setZoom((oldZoom) => Math.max(0.1, Math.min(4, oldZoom * factor)));
        });
      }

      event.preventDefault();
      event.stopPropagation();
    });

    canvas.on("mouse:down", (opt) => {
      const event = opt.e;
      if (!(event instanceof MouseEvent)) return;

      if (
        event.button === 1 ||
        (event.altKey && event.button === 0) ||
        (toolModeRef.current === "pan" && event.button === 0)
      ) {
        isDragging = true;
        canvas.selection = false;
        lastPosX = event.clientX;
        lastPosY = event.clientY;
        canvas.defaultCursor = "grabbing";
        const parent = canvas.getElement().parentElement;
        if (parent) parent.style.cursor = "grabbing";
        return;
      }

      if (toolModeRef.current === "marquee" && event.button === 0) {
        const point = canvas.getScenePoint(event);
        canvas.selection = false;
        canvas.discardActiveObject();
        const rect = new fabricMod.Rect({
          left: point.x,
          top: point.y,
          width: 0,
          height: 0,
          fill: "rgba(37,99,235,0.12)",
          stroke: "#2563eb",
          strokeWidth: 1,
          strokeDashArray: [4, 3],
          strokeUniform: true,
          selectable: false,
          evented: false,
          objectCaching: false,
        });
        marqueeRef.current = { start: { x: point.x, y: point.y }, rect };
        canvas.add(rect);
        canvas.requestRenderAll();
        return;
      }

      if (toolModeRef.current === "lasso" && event.button === 0) {
        const point = canvas.getScenePoint(event);
        canvas.selection = false;
        canvas.discardActiveObject();
        lassoRef.current = { points: [{ x: point.x, y: point.y }], line: null };
        canvas.requestRenderAll();
        return;
      }

      if ((toolModeRef.current === "door" || toolModeRef.current === "window") && event.button === 0) {
        const point: { x: number; y: number } = canvas.getScenePoint(event);
        const host = findNearestWall(point);
        if (!host) {
          const wallsExist = getWallSegments().length > 0;
          setMessage(
            wallsExist
              ? "Click closer to a wall to host the opening."
              : `Draw a wall first, then click on it to place a ${toolModeRef.current}.`,
          );
          return;
        }

        const opening = createHostedOpening(toolModeRef.current, host, point);
        canvas.add(opening);
        canvas.setActiveObject(opening);
        canvas.requestRenderAll();
        commitHistory();
        setMessage(`${toolModeRef.current === "door" ? "Door" : "Window"} embedded into a clean wall opening.`);
        return;
      }

      if ((toolModeRef.current === "wall" || toolModeRef.current === "wallRect") && event.button === 0) {
        let point: { x: number; y: number } = canvas.getScenePoint(event);
        const state = wallStateRef.current;
        const previews = [
          ...(state.previewLine ? [state.previewLine] : []),
          ...(state.previewRectWalls ?? []),
        ];
        const snap = snapEnabledRef.current ? findSnapPoint(fabricMod, point, canvas, previews) : null;
        if (snap && !event.shiftKey) point = snap.point;

        if (!state.p1) {
          state.p1 = { x: point.x, y: point.y };
          return;
        }

        if (toolModeRef.current === "wallRect") {
          const x1 = state.p1.x;
          const y1 = state.p1.y;
          const x2 = point.x;
          const y2 = point.y;
          const corners = [
            { x: x1, y: y1 },
            { x: x2, y: y1 },
            { x: x2, y: y2 },
            { x: x1, y: y2 },
          ];
          if (state.previewRectWalls?.length) {
            state.previewRectWalls.forEach((line) => canvas.remove(line));
            state.previewRectWalls = [];
          }
          const walls = corners.map((corner, index) => createWallLine(corner, corners[(index + 1) % corners.length]));
          walls.forEach((wall) => canvas.add(wall));
          canvas.setActiveObject(new fabricMod.ActiveSelection(walls, { canvas }));
          state.p1 = undefined;
          canvas.requestRenderAll();
          commitHistory();
          setMessage("Rectangular wall run placed. Use Door or Window to embed openings.");
          return;
        }

        if (distance(state.p1, point) < 4) return;
        if (state.previewLine) {
          canvas.remove(state.previewLine);
          state.previewLine = null;
        }
        const wall = createWallLine(state.p1, point);
        canvas.add(wall);
        canvas.setActiveObject(wall);
        canvas.requestRenderAll();
        state.p1 = { x: point.x, y: point.y };
        commitHistory();
        setMessage("Wall segment placed. Continue clicking to add connected walls, or press Escape to stop.");
        return;
      }

      if (toolModeRef.current === "line" && event.button === 0) {
        let point: { x: number; y: number } = canvas.getScenePoint(event);
        const state = lineStateRef.current;
        const snap = snapEnabledRef.current
          ? findSnapPoint(fabricMod, point, canvas, state.previewPolyline ? [state.previewPolyline] : [])
          : null;
        if (snap && !event.shiftKey) point = snap.point;

        // Apply 45-degree angle snap relative to the previous confirmed point.
        const lastPoint = state.points[state.points.length - 1];
        if (lastPoint && event.shiftKey) {
          const dx = point.x - lastPoint.x;
          const dy = point.y - lastPoint.y;
          const angle = Math.atan2(dy, dx);
          const snapAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
          const length = Math.hypot(dx, dy);
          point = {
            x: lastPoint.x + Math.cos(snapAngle) * length,
            y: lastPoint.y + Math.sin(snapAngle) * length,
          };
        }

        // Closing the polyline by clicking on the previous point ends the chain.
        if (lastPoint && Math.hypot(point.x - lastPoint.x, point.y - lastPoint.y) < 2) {
          finishLinePolyline();
          return;
        }

        state.points.push({ x: point.x, y: point.y });
        if (state.points.length >= 2) {
          setMessage("Click to add the next bend, or press Escape / double-click to finish.");
        } else {
          setMessage("Click to add the next vertex. Hold Shift to constrain to 0°/45°/90°.");
        }
        return;
      }

      if (toolModeRef.current === "trim" && event.button === 0) {
        const clickPoint: { x: number; y: number } = canvas.getScenePoint(event);
        const target = canvas.findTarget(event);
        if (!target || target.type !== "line") return;

        const targetLine = target as FabricNS.Line;
        const segments = extractSegments(fabricMod, targetLine);
        if (segments.length === 0) return;

        const absP1 = segments[0].p1;
        const absP2 = segments[0].p2;
        const distance = (p1: { x: number; y: number }, p2: { x: number; y: number }) =>
          Math.hypot(p1.x - p2.x, p1.y - p2.y);

        const trimEnd = distance(clickPoint, absP1) < distance(clickPoint, absP2) ? "start" : "end";
        let best = Infinity;
        let intersection: { x: number; y: number } | null = null;

        canvas.getObjects().forEach((object) => {
          if (object === target) return;
          const otherSegments = extractSegments(fabricMod, object);
          for (const other of otherSegments) {
            const hit = lineLineIntersect(
              absP1.x,
              absP1.y,
              absP2.x,
              absP2.y,
              other.p1.x,
              other.p1.y,
              other.p2.x,
              other.p2.y,
            );
            if (!hit) continue;
            const metric = trimEnd === "start" ? distance(hit, absP1) : distance(hit, absP2);
            if (metric < best) {
              best = metric;
              intersection = hit;
            }
          }
        });

        if (!intersection) return;

        const keepP1 = trimEnd === "start" ? intersection : absP1;
        const keepP2 = trimEnd === "start" ? absP2 : intersection;
        const replacement = new fabricMod.Line([keepP1.x, keepP1.y, keepP2.x, keepP2.y], {
          stroke: targetLine.stroke,
          strokeWidth: targetLine.strokeWidth,
          strokeDashArray: targetLine.strokeDashArray,
          strokeUniform: true,
          fill: targetLine.fill,
          opacity: targetLine.opacity,
        });

        canvas.remove(targetLine);
        canvas.add(replacement);
        canvas.setActiveObject(replacement);
        canvas.requestRenderAll();
        commitHistory();
        setMessage("Trim operation completed.");
        return;
      }

      if (toolModeRef.current === "dimension" && event.button === 0) {
        let point: { x: number; y: number } = canvas.getScenePoint(event);
        const state = dimStateRef.current;
        const snap = snapEnabledRef.current
          ? findSnapPoint(fabricMod, point, canvas, state.previewGroup ? [state.previewGroup] : [])
          : null;
        if (snap) point = snap.point;

        if (state.step === 0) {
          state.p1 = point;
          state.step = 1;
        } else if (state.step === 1) {
          state.p2 = point;
          state.step = 2;
        } else if (state.step === 2) {
          if (state.p1 && state.p2) {
            const offsetDist = calculateOffsetDist(state.p1, state.p2, point);
            if (state.previewGroup) canvas.remove(state.previewGroup);
            // The user types the dimension value (double-click later to edit).
            const value = window.prompt("Dimension value", "000");
            if (value !== null) {
              const finalDimension = createDimensionGroup(fabricMod, state.p1, state.p2, offsetDist, {
                isPreview: false,
                text: value.trim() || "000",
              });
              if (finalDimension) {
                canvas.add(finalDimension);
                canvas.setActiveObject(finalDimension);
                canvas.requestRenderAll();
                commitHistory();
                setMessage("Dimension placed. Double-click it to edit the value.");
              }
            }
          }

          dimStateRef.current = { step: 0 };
          handleSetToolMode("select");
        }
        return;
      }

      if (toolModeRef.current === "leader" && event.button === 0) {
        let point: { x: number; y: number } = canvas.getScenePoint(event);
        const state = leaderStateRef.current;
        const snap = snapEnabledRef.current
          ? findSnapPoint(fabricMod, point, canvas, state.previewGroup ? [state.previewGroup] : [])
          : null;
        if (snap) point = snap.point;

        if (state.step === 0) {
          // First click = the point being called out (where the arrow points).
          state.anchor = point;
          state.step = 1;
          setMessage("Now click where the label should sit.");
        } else if (state.step === 1 && state.anchor) {
          if (state.previewGroup) {
            canvas.remove(state.previewGroup);
            state.previewGroup = null;
          }
          // Place the arrow, then drop an editable label at its end and open the
          // in-canvas text editor immediately — type straight away, no popup.
          const { arrow, label } = createLeaderArrow(fabricMod, state.anchor, point);
          const textObj = new fabricMod.IText("Note", {
            left: label.left,
            top: label.top,
            originX: label.originX,
            originY: "center",
            fontSize: label.fontSize,
            fontFamily: "Arial",
            fill: label.color,
            editable: true,
          });
          canvas.add(arrow);
          canvas.add(textObj);
          leaderStateRef.current = { step: 0 };
          handleSetToolMode("select");
          canvas.setActiveObject(textObj);
          textObj.enterEditing();
          textObj.selectAll();
          canvas.requestRenderAll();
          commitHistory();
          setMessage("Type the label, then click away.");
        }
        return;
      }
    });

    canvas.on("mouse:move", (opt) => {
      const event = opt.e;
      if (!(event instanceof MouseEvent)) return;

      if (isDragging) {
        const workspace = workspaceRef.current;
        if (workspace) {
          workspace.scrollLeft -= event.clientX - lastPosX;
          workspace.scrollTop -= event.clientY - lastPosY;
        }
        lastPosX = event.clientX;
        lastPosY = event.clientY;
        return;
      }

      if (toolModeRef.current === "marquee" && marqueeRef.current.start && marqueeRef.current.rect) {
        const point = canvas.getScenePoint(event);
        const start = marqueeRef.current.start;
        marqueeRef.current.rect.set({
          left: Math.min(start.x, point.x),
          top: Math.min(start.y, point.y),
          width: Math.abs(point.x - start.x),
          height: Math.abs(point.y - start.y),
        });
        marqueeRef.current.rect.setCoords();
        canvas.requestRenderAll();
        return;
      }

      if (toolModeRef.current === "lasso" && lassoRef.current.points.length > 0) {
        const point = canvas.getScenePoint(event);
        const points = lassoRef.current.points;
        const last = points[points.length - 1];
        // Only append when the pointer actually travelled — keeps the polygon
        // small and the preview cheap to rebuild.
        if (Math.hypot(point.x - last.x, point.y - last.y) < 3) return;
        points.push({ x: point.x, y: point.y });
        if (lassoRef.current.line) canvas.remove(lassoRef.current.line);
        const line = new fabricMod.Polyline(
          points.map((p) => ({ x: p.x, y: p.y })),
          {
            fill: "rgba(37,99,235,0.08)",
            stroke: "#2563eb",
            strokeWidth: 1,
            strokeDashArray: [4, 3],
            strokeUniform: true,
            selectable: false,
            evented: false,
            objectCaching: false,
            excludeFromExport: true,
          },
        );
        lassoRef.current.line = line;
        canvas.add(line);
        canvas.requestRenderAll();
        return;
      }

      if (toolModeRef.current === "door" || toolModeRef.current === "window") {
        const point: { x: number; y: number } = canvas.getScenePoint(event);
        const host = findNearestWall(point);
        renderSnapMarker(
          fabricMod,
          canvas,
          host ? { point: host.point, type: "edge", distance: host.distance } : null,
        );
        return;
      }

      if (toolModeRef.current === "wall" || toolModeRef.current === "wallRect") {
        const state = wallStateRef.current;
        let point: { x: number; y: number } = canvas.getScenePoint(event);
        const previews = [
          ...(state.previewLine ? [state.previewLine] : []),
          ...(state.previewRectWalls ?? []),
        ];
        const snap = snapEnabledRef.current ? findSnapPoint(fabricMod, point, canvas, previews) : null;
        if (snap && !event.shiftKey) point = snap.point;
        renderSnapMarker(fabricMod, canvas, snap);

        if (!state.p1) return;

        if (toolModeRef.current === "wallRect") {
          if (state.previewRectWalls?.length) {
            state.previewRectWalls.forEach((line) => canvas.remove(line));
          }
          const corners = [
            { x: state.p1.x, y: state.p1.y },
            { x: point.x, y: state.p1.y },
            { x: point.x, y: point.y },
            { x: state.p1.x, y: point.y },
          ];
          state.previewRectWalls = corners.map((corner, index) =>
            createWallLine(corner, corners[(index + 1) % corners.length], true),
          );
          state.previewRectWalls.forEach((line) => canvas.add(line));
          canvas.requestRenderAll();
          return;
        }

        if (event.shiftKey) {
          const dx = point.x - state.p1.x;
          const dy = point.y - state.p1.y;
          const angle = Math.atan2(dy, dx);
          const snapAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
          const length = Math.hypot(dx, dy);
          point = {
            x: state.p1.x + Math.cos(snapAngle) * length,
            y: state.p1.y + Math.sin(snapAngle) * length,
          };
        }

        if (state.previewLine) canvas.remove(state.previewLine);
        const previewLine = createWallLine(state.p1, point, true);
        canvas.add(previewLine);
        state.previewLine = previewLine;
        canvas.requestRenderAll();
        return;
      }

      if (toolModeRef.current === "line") {
        const state = lineStateRef.current;
        let point: { x: number; y: number } = canvas.getScenePoint(event);
        const snap = snapEnabledRef.current
          ? findSnapPoint(fabricMod, point, canvas, state.previewPolyline ? [state.previewPolyline] : [])
          : null;
        if (snap && !event.shiftKey) point = snap.point;
        renderSnapMarker(fabricMod, canvas, snap);

        if (state.points.length === 0) return;

        const lastPoint = state.points[state.points.length - 1];
        if (event.shiftKey) {
          const dx = point.x - lastPoint.x;
          const dy = point.y - lastPoint.y;
          const angle = Math.atan2(dy, dx);
          const snapAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
          const length = Math.hypot(dx, dy);
          point = {
            x: lastPoint.x + Math.cos(snapAngle) * length,
            y: lastPoint.y + Math.sin(snapAngle) * length,
          };
        }

        if (state.previewPolyline) canvas.remove(state.previewPolyline);
        const allPoints = [...state.points, point];
        const previewPolyline = new fabricMod.Polyline(allPoints, {
          stroke: "#2563eb",
          strokeWidth: 1,
          strokeUniform: true,
          strokeDashArray: [8, 4],
          fill: "transparent",
          selectable: false,
          evented: false,
          objectCaching: false,
        });

        canvas.add(previewPolyline);
        state.previewPolyline = previewPolyline;
      }

      if (toolModeRef.current === "dimension") {
        let point: { x: number; y: number } = canvas.getScenePoint(event);
        const state = dimStateRef.current;

        if (state.step < 2) {
          const snap = snapEnabledRef.current
            ? findSnapPoint(fabricMod, point, canvas, state.previewGroup ? [state.previewGroup] : [])
            : null;
          if (snap) point = snap.point;
          renderSnapMarker(fabricMod, canvas, snap);
        } else {
          renderSnapMarker(fabricMod, canvas, null);
        }

        if (state.step === 2 && state.p1 && state.p2) {
          const offsetDist = calculateOffsetDist(state.p1, state.p2, point);
          if (state.previewGroup) canvas.remove(state.previewGroup);

          const preview = createDimensionGroup(fabricMod, state.p1, state.p2, offsetDist, {
            isPreview: true,
          });

          if (preview) {
            canvas.add(preview);
            state.previewGroup = preview;
          }
        }
      }

      if (toolModeRef.current === "leader") {
        const point: { x: number; y: number } = canvas.getScenePoint(event);
        const state = leaderStateRef.current;
        if (state.step === 1 && state.anchor) {
          if (state.previewGroup) canvas.remove(state.previewGroup);
          const preview = createLeaderGroup(fabricMod, state.anchor, point, "Note", { isPreview: true });
          canvas.add(preview);
          state.previewGroup = preview;
        }
      }
    });

    canvas.on("mouse:up", () => {
      isDragging = false;

      if (toolModeRef.current === "marquee" && marqueeRef.current.start) {
        const rect = marqueeRef.current.rect;
        const box = rect ? rect.getBoundingRect() : null;
        if (rect) canvas.remove(rect);
        marqueeRef.current = {};
        if (box && box.width > 2 && box.height > 2) {
          // Strict window selection: only objects FULLY inside the box are
          // picked. Partial-overlap rules (centre, half-in) all misfire on
          // dense imported drawings — an unrelated object's bounding box can
          // overlap the box while its ink is elsewhere. Fully-inside never
          // selects anything the admin didn't encircle.
          const hits = canvas
            .getObjects()
            .filter((obj) => obj.selectable !== false && obj !== rect && objectFullyInRect(obj, box));
          canvas.discardActiveObject();
          if (hits.length === 1) {
            canvas.setActiveObject(hits[0]);
          } else if (hits.length > 1) {
            canvas.setActiveObject(new fabricMod.ActiveSelection(hits, { canvas }));
          }
          setMessage(
            hits.length
              ? `Selected ${hits.length} object${hits.length === 1 ? "" : "s"} — drag to move, or delete/group them.`
              : "Nothing fully inside the box — drag a box around the whole part (only fully-enclosed objects are selected).",
          );
        }
        // Drop back to normal select so the new selection can be dragged.
        setToolMode("select");
        toolModeRef.current = "select";
        canvas.selection = true;
        canvas.defaultCursor = "default";
        canvas.requestRenderAll();
        return;
      }

      if (toolModeRef.current === "lasso" && lassoRef.current.points.length > 0) {
        const { points, line } = lassoRef.current;
        if (line) canvas.remove(line);
        lassoRef.current = { points: [], line: null };
        if (points.length >= 3) {
          const hits = canvas
            .getObjects()
            .filter((obj) => obj.selectable !== false && objectFullyInPolygon(obj, points));
          canvas.discardActiveObject();
          if (hits.length === 1) {
            canvas.setActiveObject(hits[0]);
          } else if (hits.length > 1) {
            canvas.setActiveObject(new fabricMod.ActiveSelection(hits, { canvas }));
          }
          setMessage(
            hits.length
              ? `Selected ${hits.length} object${hits.length === 1 ? "" : "s"} — drag to move, group, or save as a part.`
              : "Nothing fully inside the outline — trace all the way around the part you want.",
          );
        }
        setToolMode("select");
        toolModeRef.current = "select";
        canvas.selection = true;
        canvas.defaultCursor = "default";
        canvas.requestRenderAll();
        return;
      }

      if (toolModeRef.current === "select") {
        canvas.selection = true;
        canvas.defaultCursor = "default";
      } else if (toolModeRef.current === "pan") {
        canvas.defaultCursor = "grab";
        const parent = canvas.getElement().parentElement;
        if (parent) parent.style.cursor = "grab";
      }
    });

    applyZoom(canvas, zoom, width, height);

    // A drawing queued for editing loads onto this (blank) sheet once ready.
    const loadPending = () => {
      const json = pendingLoadJsonRef.current;
      if (json) {
        // Curated payload: re-create the exact objects the admin saved —
        // grouping and parametric metadata intact, nothing split or flattened.
        pendingLoadJsonRef.current = null;
        pendingLoadRef.current = null;
        const enliven = fabricMod.util.enlivenObjects as unknown as (
          objects: unknown[],
        ) => Promise<FabricNS.FabricObject[]>;
        void enliven(json.objects)
          .then((objects) => {
            objects.forEach((object) => {
              makeStrokeNonScaling(object);
              canvas.add(object);
            });
            // Saved coordinates may not match this sheet — refit so the
            // drawing opens visible instead of off-paper.
            fitAndCenterObjectsOnPaper(canvas, objects);
            canvas.requestRenderAll();
            commitHistory();
          })
          .catch((error) => {
            setMessage(
              `Could not render the drawing: ${error instanceof Error ? error.message : String(error)}`,
            );
          });
        return;
      }
      const svg = pendingLoadRef.current;
      if (!svg) return;
      pendingLoadRef.current = null;
      // Split merged multi-subpath paths so each contiguous stroke is its own
      // object, then ungroup — so selecting one section never drags geometry that
      // was merged across sections, a rubber-band grabs just the dragged portion,
      // labels are directly editable, and any subset can be moved or re-grouped.
      void addSvgToCanvas(fabricMod, canvas, splitSvgSubpaths(sanitizeSvgMarkup(svg)), { ungroup: true })
        .then(() => {
          canvas.requestRenderAll();
          commitHistory();
        })
        .catch((error) => {
          setMessage(
            `Could not render the drawing: ${error instanceof Error ? error.message : String(error)}`,
          );
        });
    };

    if (currentPage.json) {
      canvas.loadFromJSON(currentPage.json).then(() => {
        canvas.getObjects().forEach(makeStrokeNonScaling);
        canvas.requestRenderAll();
        initializeHistory(canvas);
        loadPending();
      });
    } else {
      initializeHistory(canvas);
      loadPending();
    }

    setTimeout(() => {
      const workspace = workspaceRef.current;
      if (!workspace) return;
      workspace.scrollLeft = (workspace.scrollWidth - workspace.clientWidth) / 2;
      workspace.scrollTop = (workspace.scrollHeight - workspace.clientHeight) / 2;
    }, 50);

    return () => {
      if (zoomRafRef.current.raf !== null) {
        cancelAnimationFrame(zoomRafRef.current.raf);
        zoomRafRef.current.raf = null;
      }
      if (historyCommitTimerRef.current !== null) {
        window.clearTimeout(historyCommitTimerRef.current);
        historyCommitTimerRef.current = null;
      }
      canvas.dispose();
      fabricRef.current = null;
    };
  }, [
    activeProjectId,
    applyZoom,
    currentPage?.id,
    currentPageIndex,
    fabricMod,
    handleSetToolMode,
    commitHistory,
    session,
    initializeHistory,
    setMessage,
  ]);

  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas || !currentPage) return;
    const { width, height } = getPaperDimensions(currentPage.paperSize, currentPage.orientation);
    applyZoom(canvas, zoom, width, height);

    // Cursor-anchored wheel zoom: now that the canvas has resized, scroll so the
    // paper point that was under the cursor lands back under it. Done here —
    // synchronously after the resize — to avoid racing the browser's automatic
    // scroll clamp when the sheet shrinks on zoom-out. Button/fit zooms leave
    // the anchor inactive and keep their centred behaviour.
    const anchor = wheelAnchorRef.current;
    if (anchor.active) {
      anchor.active = false;
      const workspace = workspaceRef.current;
      const canvasEl = canvasElRef.current;
      if (workspace && canvasEl) {
        const rect = canvasEl.getBoundingClientRect();
        workspace.scrollLeft += rect.left + anchor.paperX * zoom - anchor.clientX;
        workspace.scrollTop += rect.top + anchor.paperY * zoom - anchor.clientY;
      }
    }
    // Depend on the paper geometry + zoom only — not the whole currentPage
    // object, which changes on every sheet edit and would otherwise re-resize
    // the canvas needlessly.
  }, [applyZoom, currentPage?.paperSize, currentPage?.orientation, zoom]);

  const getPaperCenter = useCallback(() => {
    if (!currentPage) return { width: 800, height: 600, centerX: 400, centerY: 300 };
    const { width, height } = getPaperDimensions(currentPage.paperSize, currentPage.orientation);
    return { width, height, centerX: width / 2, centerY: height / 2 };
  }, [currentPage]);

  const addObjectToCanvas = useCallback(
    (object: FabricNS.FabricObject, message: string) => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      makeStrokeNonScaling(object);
      canvas.add(object);
      canvas.setActiveObject(object);
      canvas.requestRenderAll();
      commitHistory();
      setMessage(message);
      handleSetToolMode("select");
    },
    [commitHistory, handleSetToolMode, setMessage],
  );

  const handleAddSvg = useCallback(
    async (svg: string) => {
      const canvas = fabricRef.current;
      if (!canvas || !fabricMod) return;
      if (!svg.trim()) {
        setMessage("Provide SVG code before inserting it.");
        return;
      }

      try {
        await addSvgToCanvas(fabricMod, canvas, sanitizeSvgMarkup(svg));
        commitHistory();
        setMessage("SVG block inserted on the canvas.");
      } catch (error) {
        setMessage(
          `SVG import failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
    [commitHistory, fabricMod, setMessage],
  );

  // Lazily resolve a library item's full SVG. Seed/demo items already carry it
  // in memory; admin/DB items are loaded without svg (grid uses the thumbnail)
  // and fetched by id only when inserted.
  const fetchLibrarySvg = useCallback(
    async (id: string): Promise<string> => {
      const local = libraryItems.find((item) => item.id === id);
      if (local?.svg) return local.svg;
      const supabase = getSupabaseBrowserClient();
      if (supabase) {
        const { data } = await supabase.from("drawing_library_items").select("svg").eq("id", id).single();
        if (data?.svg) return data.svg as string;
      }
      return "";
    },
    [libraryItems],
  );

  // Resolve a library item's full payload for insert/edit: the structured
  // Fabric JSON when the item has one (grouping preserved) plus the SVG
  // fallback for older items that were only ever saved as SVG.
  const fetchLibraryPayload = useCallback(
    async (id: string): Promise<{ svg: string; fabricJson: LibraryFabricJson | null }> => {
      const local = libraryItems.find((item) => item.id === id);
      if (local?.fabricJson) return { svg: local.svg || "", fabricJson: local.fabricJson };
      // Seed/personal items live fully in memory — nothing heavier to fetch.
      if (local && local.source !== "admin") {
        return { svg: local.svg || "", fabricJson: local.fabricJson ?? null };
      }
      const supabase = getSupabaseBrowserClient();
      if (supabase) {
        const { data } = await supabase
          .from("drawing_library_items")
          .select("svg,fabric_json")
          .eq("id", id)
          .single();
        if (data) {
          return {
            svg: (data.svg as string) ?? "",
            fabricJson: (data.fabric_json as LibraryFabricJson | null) ?? null,
          };
        }
      }
      return { svg: local?.svg ?? "", fabricJson: local?.fabricJson ?? null };
    },
    [libraryItems],
  );

  // Drop stored Fabric objects onto the canvas exactly as the admin saved them —
  // grouping and parametric metadata intact (the SVG path flattens both).
  const addFabricJsonToCanvas = useCallback(
    async (json: LibraryFabricJson): Promise<boolean> => {
      const canvas = fabricRef.current;
      if (!canvas || !fabricMod || !Array.isArray(json?.objects) || json.objects.length === 0) {
        return false;
      }
      try {
        const enliven = fabricMod.util.enlivenObjects as unknown as (
          objects: unknown[],
        ) => Promise<FabricNS.FabricObject[]>;
        const objects = await enliven(json.objects);
        if (objects.length === 0) return false;
        objects.forEach((object) => {
          makeStrokeNonScaling(object);
          canvas.add(object);
        });
        // Stored coordinates come from the admin's sheet, which can sit
        // entirely off this paper — refit so the import is actually visible.
        fitAndCenterObjectsOnPaper(canvas, objects);
        canvas.setActiveObject(objects[objects.length - 1]);
        canvas.requestRenderAll();
        return true;
      } catch {
        return false;
      }
    },
    [fabricMod],
  );

  // Rasterize an SVG to a small PNG data URL, stored alongside published drawings
  // so the library grid never needs to load the full svg just to show a preview.
  const svgToThumbnail = useCallback(async (svg: string): Promise<string> => {
    if (!svg.trim()) return "";
    return new Promise<string>((resolve) => {
      const img = new Image();
      img.onload = () => {
        const maxW = 260;
        const nw = img.naturalWidth || maxW;
        const nh = img.naturalHeight || maxW;
        const scale = Math.min(1, maxW / nw);
        const w = Math.max(1, Math.round(nw * scale));
        const h = Math.max(1, Math.round(nh * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve("");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        try {
          // WebP keeps line-art thumbnails tiny (~10–20 KB); fall back to PNG.
          let out = canvas.toDataURL("image/webp", 0.75);
          if (!out || out.indexOf("image/webp") < 0) out = canvas.toDataURL("image/png");
          resolve(out);
        } catch {
          resolve("");
        }
      };
      img.onerror = () => resolve("");
      img.src = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
    });
  }, []);

  const handleAddParametricBlock = useCallback(
    async (kind: ParametricBlockKind, params?: Partial<ParametricBlockParams>) => {
      const canvas = fabricRef.current;
      if (!canvas || !fabricMod) return;

      try {
        const normalized = normalizeParametricParams(kind, params);
        const object = await addSvgToCanvas(fabricMod, canvas, createParametricBlockSvg(kind, normalized));
        stampParametricBlock(object, kind, normalized);
        makeStrokeNonScaling(object);
        canvas.setActiveObject(object);
        canvas.requestRenderAll();
        setSelectedParametricBlock(getParametricBlockState(object));
        commitHistory();
        setMessage(`${PARAMETRIC_BLOCK_LABELS[kind]} inserted as an editable parametric block.`);
      } catch (error) {
        setMessage(
          `Parametric block insert failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
    [commitHistory, fabricMod, setMessage],
  );

  // Insert a library item onto the canvas: parametric blocks become editable
  // blocks; everything else fetches its (possibly large) svg lazily — only now,
  // at insert time — and drops it in. Shared by the panel strips and the
  // warehouse overlay.
  const handleInsertLibraryItem = useCallback(
    async (item: LibraryItem) => {
      recordLibraryUse(item.id);
      if (item.parametricKind) {
        await handleAddParametricBlock(
          item.parametricKind as ParametricBlockKind,
          item.parametricParams as Partial<ParametricBlockParams>,
        );
      } else {
        const canvas = fabricRef.current;
        if (canvas && fabricMod) {
          const payload = await fetchLibraryPayload(item.id);
          if (payload.fabricJson && (await addFabricJsonToCanvas(payload.fabricJson))) {
            // Curated item: inserted exactly as the admin grouped it.
            commitHistory();
            setMessage(`${item.name} inserted with its saved grouping — double-click a group to edit inside it.`);
          } else if (payload.svg) {
            try {
              // Legacy SVG-only item: import split + ungrouped so its text is
              // directly editable and any section can be box-selected.
              await addSvgToCanvas(fabricMod, canvas, splitSvgSubpaths(sanitizeSvgMarkup(payload.svg)), {
                ungroup: true,
              });
              commitHistory();
              setMessage("Drawing imported — text is editable; use Select area to grab a section.");
            } catch (error) {
              setMessage(`Drawing import failed: ${error instanceof Error ? error.message : String(error)}`);
            }
          } else {
            setMessage(`Could not load ${item.name}.`);
          }
        }
      }
      // Persist the insert into the page JSON right away. Otherwise a canvas
      // re-create (a zoom/tool/focus-driven re-render reloads currentPage.json)
      // would wipe a freshly-imported drawing that only lived on the live canvas
      // — the "appears then disappears" report when importing from the library tab.
      void saveCurrentPage();
    },
    [
      addFabricJsonToCanvas,
      commitHistory,
      fabricMod,
      fetchLibraryPayload,
      handleAddParametricBlock,
      recordLibraryUse,
      saveCurrentPage,
      setMessage,
    ],
  );

  // Admin: open a library drawing for editing on a fresh, isolated sheet (no
  // title block), so a clean-up can be saved straight back over the source item.
  const handleEditLibraryItem = useCallback(
    async (libraryId: string) => {
      // Demo mode (no auth) works on the local library; with real auth this is
      // admin-only — same gate as publishing (RLS enforces it server-side too).
      if (authConfigured && session?.role !== "admin") {
        setMessage("Only admins can edit shared library drawings.");
        return;
      }
      const item = libraryItems.find((entry) => entry.id === libraryId);
      if (!item) {
        setMessage("That drawing is no longer in the library.");
        return;
      }
      const payload = await fetchLibraryPayload(libraryId);
      if (!payload.fabricJson && !payload.svg) {
        setMessage("Could not load that drawing for editing.");
        return;
      }
      // Prefer the curated Fabric JSON so the drawing re-opens with the
      // grouping from the last warehouse update; fall back to the flat SVG.
      if (payload.fabricJson) {
        pendingLoadJsonRef.current = payload.fabricJson;
        pendingLoadRef.current = null;
      } else {
        pendingLoadRef.current = payload.svg;
        pendingLoadJsonRef.current = null;
      }
      setEditingLibraryItem({
        id: item.id,
        name: item.name,
        category: item.category,
        description: item.description,
        tags: item.tags,
        source: item.source,
      });
      const nextPages = await saveCurrentPage();
      const newPages = syncSheetLabels([...nextPages, createBlankPage(nextPages.length + 1)]);
      setPages(newPages);
      setCurrentPageIndex(newPages.length - 1);
      setMessage(`Editing "${item.name}" — group parts, remove clutter, then save to the library.`);
    },
    [authConfigured, fetchLibraryPayload, libraryItems, saveCurrentPage, session, setMessage],
  );

  // Receive actions raised from the standalone library tab. Import drops the
  // drawing on the canvas; edit opens it for an admin clean-up. The browser tab
  // only sends an id, so the canvas tab stays light while browsing.
  //
  // The bridge clears its cross-tab queue as soon as entries are handed over,
  // and an import can arrive BEFORE the canvas exists (queued while the studio
  // tab was still booting, or before it was even open) — handleInsertLibraryItem
  // would silently no-op and the import would be lost. Actions that arrive too
  // early are parked in a ref and replayed when this effect re-runs after
  // Fabric loads (its deps change with fabricMod), by which point the canvas
  // -init effect above has populated fabricRef.
  const pendingLibraryActionsRef = useRef<Array<{ libraryId: string; action: LibraryAction }>>([]);
  useEffect(() => {
    const dispatch = (libraryId: string, action: LibraryAction) => {
      if (action === "edit") {
        void handleEditLibraryItem(libraryId);
        return;
      }
      const item = libraryItems.find((entry) => entry.id === libraryId);
      if (item) {
        void handleInsertLibraryItem(item);
        return;
      }
      // Item not in the in-memory list (rare) — fetch its svg directly.
      recordLibraryUse(libraryId);
      void fetchLibrarySvg(libraryId).then((svg) => {
        if (svg) handleAddSvg(svg);
      });
    };

    const canvasReady = () => Boolean(fabricRef.current && fabricMod);

    if (canvasReady() && pendingLibraryActionsRef.current.length > 0) {
      const parked = pendingLibraryActionsRef.current;
      pendingLibraryActionsRef.current = [];
      parked.forEach(({ libraryId, action }) => dispatch(libraryId, action));
    }

    return subscribeLibraryActions((libraryId, action) => {
      if (!canvasReady()) {
        pendingLibraryActionsRef.current.push({ libraryId, action });
        return;
      }
      dispatch(libraryId, action);
    });
  }, [
    fabricMod,
    fetchLibrarySvg,
    handleAddSvg,
    handleEditLibraryItem,
    handleInsertLibraryItem,
    libraryItems,
    recordLibraryUse,
  ]);

  // Admin "Edit in canvas" deep-link: once the studio has finished booting (so the
  // DB library items + the admin session are loaded), open the requested drawing
  // for editing exactly once. URL-driven, so there's no race with the cross-tab
  // queue and no empty canvas if the studio opens before the warehouse data lands.
  const editDeepLinkHandledRef = useRef(false);
  useEffect(() => {
    if (!booted || !editLibraryId || editDeepLinkHandledRef.current) return;
    editDeepLinkHandledRef.current = true;
    void handleEditLibraryItem(editLibraryId);
  }, [booted, editLibraryId, handleEditLibraryItem]);

  const handleUpdateParametricBlock = useCallback(
    async (params: Partial<ParametricBlockParams>) => {
      const canvas = fabricRef.current;
      const active = canvas?.getActiveObject();
      if (!canvas || !fabricMod || !active) return;

      const current = getParametricBlockState(active);
      if (!current) {
        setMessage("Select a parametric block before applying parameter changes.");
        return;
      }

      try {
        const normalized = normalizeParametricParams(current.kind, params);
        const replacement = await createSvgObject(
          fabricMod,
          createParametricBlockSvg(current.kind, normalized),
        );
        stampParametricBlock(replacement, current.kind, normalized);
        makeStrokeNonScaling(replacement);

        replacement.set({
          left: active.left,
          top: active.top,
          angle: active.angle,
          scaleX: active.scaleX,
          scaleY: active.scaleY,
          flipX: active.flipX,
          flipY: active.flipY,
          originX: active.originX,
          originY: active.originY,
        });

        const index = canvas.getObjects().indexOf(active);
        canvas.discardActiveObject();
        canvas.remove(active);
        const collection = canvas as unknown as {
          insertAt?: (index: number, ...objects: FabricNS.FabricObject[]) => void;
        };
        if (collection.insertAt && index >= 0) collection.insertAt(index, replacement);
        else canvas.add(replacement);

        canvas.setActiveObject(replacement);
        replacement.setCoords();
        canvas.requestRenderAll();
        setSelectedParametricBlock(getParametricBlockState(replacement));
        commitHistory();
        setMessage(`${current.label} regenerated with updated parameters.`);
      } catch (error) {
        setMessage(
          `Parametric block update failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
    [commitHistory, fabricMod, setMessage],
  );

  const handleAddRectangle = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas || !fabricMod) return;
    const { centerX, centerY } = getPaperCenter();
    const rect = new fabricMod.Rect({
      left: centerX - 110,
      top: centerY - 70,
      width: 220,
      height: 140,
      fill: "rgba(255,255,255,0.15)",
      stroke: "#0f172a",
      strokeWidth: 1.4,
      strokeUniform: true,
      rx: 8,
      ry: 8,
    });
    addObjectToCanvas(rect, "Rectangle added.");
  }, [addObjectToCanvas, fabricMod, getPaperCenter]);

  const handleAddCircle = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas || !fabricMod) return;
    const { centerX, centerY } = getPaperCenter();
    const circle = new fabricMod.Circle({
      left: centerX - 55,
      top: centerY - 55,
      radius: 55,
      fill: "rgba(255,255,255,0.15)",
      stroke: "#0f172a",
      strokeWidth: 1.4,
      strokeUniform: true,
    });
    addObjectToCanvas(circle, "Circle added.");
  }, [addObjectToCanvas, fabricMod, getPaperCenter]);

  const handleAddText = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas || !fabricMod) return;
    const { centerX, centerY } = getPaperCenter();
    const label = new fabricMod.IText("New label", {
      left: centerX - 52,
      top: centerY - 12,
      fontSize: 18,
      fontFamily: "Arial",
      fill: "#0f172a",
      fontWeight: "600",
    });
    addObjectToCanvas(label, "Text label added.");
  }, [addObjectToCanvas, fabricMod, getPaperCenter]);

  const updateCurrentPage = useCallback(
    (updates: Partial<Page>) => {
      setPages((previous) => {
        const next = [...previous];
        next[currentPageIndex] = { ...next[currentPageIndex], ...updates };
        return next;
      });
    },
    [currentPageIndex],
  );

  const handleAddPage = useCallback(async () => {
    const nextPages = await saveCurrentPage();
    const newPages = syncSheetLabels([...nextPages, createBlankPage(nextPages.length + 1)]);
    setPages(newPages);
    setCurrentPageIndex(newPages.length - 1);
    setMessage("New sheet added to the drawing package.");
  }, [saveCurrentPage, setMessage]);

  const handleDeletePage = useCallback(
    async (index: number) => {
      if (pages.length <= 1) return;
      if (!window.confirm(`Delete sheet "${pages[index].name}"?`)) return;
      const nextPages = syncSheetLabels(pages.filter((_, itemIndex) => itemIndex !== index));
      setPages(nextPages);
      if (currentPageIndex >= index && currentPageIndex > 0) setCurrentPageIndex(currentPageIndex - 1);
      setMessage("Sheet removed from the drawing package.");
    },
    [currentPageIndex, pages, setMessage],
  );

  const handleSwitchPage = useCallback(
    async (index: number) => {
      if (index < 0 || index >= pages.length || index === currentPageIndex) return;
      await saveCurrentPage();
      setCurrentPageIndex(index);
    },
    [currentPageIndex, pages.length, saveCurrentPage],
  );

  // ── Bottom sheet-tab bar: rename / duplicate / right-click menu ──────────
  const [sheetMenu, setSheetMenu] = useState<{ visible: boolean; x: number; y: number; index: number }>({
    visible: false,
    x: 0,
    y: 0,
    index: 0,
  });
  const [renamingSheet, setRenamingSheet] = useState<number | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  const handleRenamePage = useCallback((index: number, name: string) => {
    const clean = name.trim();
    if (!clean) return;
    setPages((previous) => previous.map((page, i) => (i === index ? { ...page, name: clean } : page)));
  }, []);

  const handleDuplicatePage = useCallback(
    async (index: number) => {
      // Capture the latest canvas of the active sheet before cloning.
      const saved = await saveCurrentPage();
      const source = saved[index];
      if (!source) return;
      const copy: Page = {
        ...source,
        id: `page-${Math.random().toString(36).slice(2, 10)}`,
        name: `${source.name} copy`,
        titleBlockData: { ...source.titleBlockData },
        json: source.json ? JSON.parse(JSON.stringify(source.json)) : undefined,
      };
      const next = syncSheetLabels([...saved.slice(0, index + 1), copy, ...saved.slice(index + 1)]);
      setPages(next);
      setCurrentPageIndex(index + 1);
      setMessage("Sheet duplicated.");
    },
    [saveCurrentPage, setMessage],
  );

  const handleDuplicate = useCallback(async () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const active = canvas.getActiveObject();
    if (!active) return;

    const cloned = await active.clone();
    cloned.set({ left: (cloned.left ?? 0) + 20, top: (cloned.top ?? 0) + 20, evented: true });

    if (cloned.type === "activeselection") {
      const selection = cloned as FabricNS.ActiveSelection;
      selection.canvas = canvas;
      selection.forEachObject((item) => canvas.add(item));
      selection.setCoords();
    } else {
      canvas.add(cloned);
    }

    canvas.setActiveObject(cloned);
    canvas.requestRenderAll();
    commitHistory();
    setMessage("Selection duplicated.");
  }, [commitHistory, setMessage]);

  const handleDelete = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    canvas.getActiveObjects().forEach((item) => canvas.remove(item));
    canvas.discardActiveObject();
    canvas.requestRenderAll();
    commitHistory();
    setMessage("Selection removed.");
  }, [commitHistory, setMessage]);

  const handleCopy = useCallback(async () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const active = canvas.getActiveObject();
    if (!active) return;
    clipboardRef.current = await active.clone();
    setMessage("Selection copied.");
  }, [setMessage]);

  const handlePaste = useCallback(async () => {
    const canvas = fabricRef.current;
    const clip = clipboardRef.current;
    if (!canvas || !clip) return;

    const cloned = await clip.clone();
    cloned.set({ left: (cloned.left ?? 0) + 20, top: (cloned.top ?? 0) + 20, evented: true });

    if (cloned.type === "activeselection") {
      const selection = cloned as FabricNS.ActiveSelection;
      selection.canvas = canvas;
      selection.forEachObject((item) => canvas.add(item));
      selection.setCoords();
    } else {
      canvas.add(cloned);
    }

    canvas.setActiveObject(cloned);
    canvas.requestRenderAll();
    commitHistory();
    setMessage("Clipboard content pasted.");
  }, [commitHistory, setMessage]);

  const handleUngroup = useCallback(() => {
    const canvas = fabricRef.current;
    const active = canvas?.getActiveObject();
    if (!canvas || !fabricMod || !isUngroupableObject(active)) return;

    if (typeof active.removeAll !== "function") {
      setMessage("This object is not a grouped block that can be released.");
      return;
    }

    const items = active.removeAll();
    if (items.length === 0) {
      setMessage("This grouped block does not contain editable child objects.");
      return;
    }

    canvas.discardActiveObject();
    const group = active as FabricNS.FabricObject;
    canvas.remove(group);
    canvas.add(...items);
    const selection = new fabricMod.ActiveSelection(items, { canvas });
    canvas.setActiveObject(selection);
    canvas.requestRenderAll();
    commitHistory();
    setMessage("Group released for detailed editing.");
  }, [commitHistory, fabricMod, setMessage]);

  const handleGroup = useCallback(() => {
    const canvas = fabricRef.current;
    const active = canvas?.getActiveObject();
    if (!canvas || !fabricMod || !active || active.type !== "activeselection") return;

    const selection = active as FabricNS.ActiveSelection;
    const items = selection.removeAll();
    canvas.remove(selection);
    const group = new fabricMod.Group(items);
    canvas.add(group);
    canvas.setActiveObject(group);
    canvas.requestRenderAll();
    commitHistory();
    setMessage("Objects grouped into a reusable block.");
  }, [commitHistory, fabricMod, setMessage]);

  // Edit-banner convenience: combine the whole drawing into one block (so it
  // moves/places as a single unit) or split it back into individual objects (so
  // a marquee selects just a portion and labels are directly editable).
  const handleGroupDrawing = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas || !fabricMod) return;
    const objects = canvas.getObjects().filter((o) => o.selectable !== false);
    if (objects.length < 2) {
      setMessage("Nothing to combine yet.");
      return;
    }
    canvas.discardActiveObject();
    canvas.remove(...objects);
    const group = new fabricMod.Group(objects);
    canvas.add(group);
    canvas.setActiveObject(group);
    canvas.requestRenderAll();
    commitHistory();
    setMessage("Drawing combined into one block — drag to move it as a unit.");
  }, [commitHistory, fabricMod, setMessage]);

  const handleUngroupDrawing = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas || !fabricMod) return;
    const groups = canvas.getObjects().filter((o) => o.type === "group");
    if (groups.length === 0) {
      setMessage("The drawing is already split into individual objects.");
      return;
    }
    groups.forEach((group) => ungroupSvgObjects(fabricMod, canvas, group));
    canvas.discardActiveObject();
    canvas.requestRenderAll();
    commitHistory();
    setMessage("Drawing split into objects — drag a box to select any portion.");
  }, [commitHistory, fabricMod, setMessage]);

  const handleBringFront = useCallback(() => {
    const canvas = fabricRef.current;
    const active = canvas?.getActiveObject();
    if (!canvas || !active) return;
    canvas.bringObjectToFront(active);
    canvas.requestRenderAll();
    commitHistory();
  }, [commitHistory]);

  const handleSendBack = useCallback(() => {
    const canvas = fabricRef.current;
    const active = canvas?.getActiveObject();
    if (!canvas || !active) return;
    canvas.sendObjectToBack(active);
    canvas.requestRenderAll();
    commitHistory();
  }, [commitHistory]);

  const handleZoomIn = useCallback(() => setZoom((value) => Math.min(4, +(value + 0.1).toFixed(2))), []);
  const handleZoomOut = useCallback(() => setZoom((value) => Math.max(0.15, +(value - 0.1).toFixed(2))), []);
  const handleZoom100 = useCallback(() => setZoom(1), []);
  const handleZoomFit = useCallback(() => {
    const workspace = workspaceRef.current;
    if (!workspace || !currentPage) return;
    const { width, height } = getPaperDimensions(currentPage.paperSize, currentPage.orientation);
    const padding = 72;
    const fit = Math.min((workspace.clientWidth - padding) / width, (workspace.clientHeight - padding) / height);
    setZoom(Math.max(0.12, +fit.toFixed(2)));
  }, [currentPage]);

  const handleApplyTitleBlock = useCallback(async () => {
    const canvas = fabricRef.current;
    if (!canvas || !fabricMod || !currentPage) return;
    const { width, height } = getPaperDimensions(currentPage.paperSize, currentPage.orientation);
    await createOrUpdateTitleBlock(fabricMod, canvas, currentPage.titleBlockData, width, height);
    commitHistory();
    setMessage("Title block applied to the current sheet.");
  }, [commitHistory, currentPage, fabricMod, setMessage]);

  const handleRemoveTitleBlock = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const titleBlocks = canvas
      .getObjects()
      .filter((item) => (item as unknown as Record<string, unknown>)[TITLE_BLOCK_KEY] === true);
    titleBlocks.forEach((item) => canvas.remove(item));
    canvas.requestRenderAll();
    commitHistory();
    setMessage("Title block removed from the current sheet.");
  }, [commitHistory, setMessage]);

  const handleApplyPattern = useCallback(
    (patternId: PatternType, scale: number, color: string) => {
      const canvas = fabricRef.current;
      if (!canvas || !fabricMod) return;
      const active = canvas.getActiveObject();
      if (!active) {
        setMessage("Select an object before applying a fill pattern.");
        return;
      }

      const targets = getGeometryTargets(active);
      if (patternId === "solid") {
        targets.forEach((target) => target.set({ fill: color, dirty: true }));
        active.set({ dirty: true });
        canvas.requestRenderAll();
        commitHistory();
        setMessage(`Solid fill applied to ${targets.length} object${targets.length === 1 ? "" : "s"}.`);
        return;
      }

      const definition = PATTERNS.find((pattern) => pattern.id === patternId);
      if (!definition) return;

      targets.forEach((target) => {
        const source = definition.generate(color, scale);
        target.set({ fill: new fabricMod.Pattern({ source, repeat: "repeat" }), dirty: true });
      });
      active.set({ dirty: true });
      canvas.requestRenderAll();
      commitHistory();
      setMessage(`${definition.label} applied to ${targets.length} object${targets.length === 1 ? "" : "s"}.`);
    },
    [commitHistory, fabricMod, setMessage],
  );

  const handleUpdateStroke = useCallback(
    (color: string, width: number, enabled: boolean) => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const active = canvas.getActiveObject();
      if (!active) return;

      const targets = getGeometryTargets(active);
      if (targets.length === 0) {
        setMessage("Select a shape, line, wall, or grouped geometry before changing stroke.");
        return;
      }

      targets.forEach((target) => {
        makeStrokeNonScaling(target);
        if (!enabled) target.set({ stroke: null, strokeWidth: 0, dirty: true });
        else target.set({ stroke: color, strokeWidth: width, strokeUniform: true, dirty: true });

        if ((target as unknown as Record<string, unknown>)[WALL_KEY]) {
          target.set({ [WALL_THICKNESS_KEY]: enabled ? width : 0 } as Partial<FabricNS.FabricObject>);
        }
      });
      active.set({ dirty: true });

      canvas.requestRenderAll();
      commitHistory();
      setMessage("Stroke style updated.");
    },
    [commitHistory, setMessage],
  );

  const handleUpdateLineStyle = useCallback(
    (style: LineStyle) => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const active = canvas.getActiveObject();
      if (!active) return;

      const strokeDashArray = style === "dashed" ? [12, 8] : undefined;
      const targets = getGeometryTargets(active);
      if (targets.length === 0) {
        setMessage("Select a shape, line, wall, or grouped geometry before changing line type.");
        return;
      }

      targets.forEach((target) => {
        makeStrokeNonScaling(target);
        target.set({
          strokeDashArray,
          strokeUniform: true,
          dirty: true,
        } as Partial<FabricNS.FabricObject>);
      });
      active.set({ dirty: true });

      canvas.requestRenderAll();
      commitHistory();
      setMessage(style === "dashed" ? "Dashed line style applied." : "Solid line style applied.");
    },
    [commitHistory, setMessage],
  );

  const handleUpdateTextStyle = useCallback(
    (updates: TextStyleUpdate) => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const activeObjects = canvas.getActiveObjects();
      const textTargets = activeObjects.flatMap(getTextTargets);
      if (textTargets.length === 0) {
        setMessage("Select text or a dimension label before changing text style.");
        return;
      }

      textTargets.forEach((target) => {
        target.set({
          ...(updates.fontSize !== undefined ? { fontSize: updates.fontSize } : {}),
          ...(updates.fill !== undefined ? { fill: updates.fill } : {}),
          dirty: true,
        } as Partial<FabricNS.FabricObject>);
      });

      canvas.getActiveObject()?.set({ dirty: true });
      canvas.requestRenderAll();
      setSelectedTextStyle(getTextStyleSnapshot(activeObjects));
      commitHistory();
      setMessage("Text style updated.");
    },
    [commitHistory, setMessage],
  );

  const handleExportPDF = useCallback(async () => {
    const canvas = fabricRef.current;
    if (!canvas || !fabricMod || !currentPage) return;

    const updatedPages = await saveCurrentPage();
    const freshPages = [...updatedPages];
    freshPages[currentPageIndex] = { ...freshPages[currentPageIndex], json: canvas.toJSON() };
    const fileName = `${currentPage.titleBlockData.drawingNo || projectName || "drawing-package"}.pdf`;
    await exportPagesToPDF(fabricMod, freshPages, getPaperDimensions, fileName);
    setMessage("PDF export completed.");
  }, [currentPage, currentPageIndex, fabricMod, projectName, saveCurrentPage, setMessage]);

  const openLibrarySaveDialog = useCallback(
    (mode: "object" | "drawing", scope: "personal" | "shared") => {
      const canvas = fabricRef.current;
      if (!canvas) return;

      const active = canvas.getActiveObject();
      if (mode === "object" && !active) {
        setMessage("Select or right-click an object before saving it to the library.");
        return;
      }

      if (scope === "shared" && authConfigured && session?.role !== "admin") {
        setMessage("Only admins can publish to the shared library. Save it to your personal library instead.");
        return;
      }

      const defaultName =
        mode === "object"
          ? `Reusable ${active?.type === "group" ? "block" : "object"}`
          : `${projectName || "Drawing"} - ${currentPage.name}`;

      setLibrarySaveDraft({
        mode,
        scope,
        name: defaultName,
        category: mode === "object" ? "structural" : "layouts",
        description:
          mode === "object"
            ? "Reusable engineering object saved from the canvas."
            : "Complete editable drawing saved from the current sheet.",
        tags: mode === "object" ? "object, reusable, detail" : "drawing, layout, sheet",
        svg: mode === "object" && active ? serializeLibraryObject(active) : canvas.toSVG(),
        // Multi-select has selection-relative coords that don't survive
        // enlivenment — group it first to keep the structured payload.
        fabricJson:
          mode === "object"
            ? active && active.type !== "activeselection"
              ? serializeObjectFabricJson(active)
              : null
            : serializeCanvasFabricJson(canvas),
      });
    },
    [authConfigured, currentPage.name, projectName, session?.role, setMessage],
  );

  const handleConfirmLibrarySave = useCallback(
    async (draft: LibrarySaveDraft) => {
      const cleanName = draft.name.trim();
      if (!cleanName) {
        setMessage("Give the library item a clear name before saving.");
        return;
      }

      const tags = parseTags(draft.tags);
      const description =
        draft.description.trim() ||
        (draft.mode === "object"
          ? "Reusable engineering object saved from the canvas."
          : "Editable drawing saved from the canvas.");

      if (draft.scope === "shared") {
        const supabase = getSupabaseBrowserClient();
        if (!supabase) {
          const item = createLibraryItem({
            name: cleanName,
            category: draft.category,
            description,
            tags: tags.length > 0 ? tags : parseTags(cleanName),
            svg: draft.svg,
            fabricJson: draft.fabricJson,
            source: "admin",
            assetType: draft.mode,
            author: session?.name || "Demo Admin",
          });
          const nextItems = mergeLibraryItems([item, ...libraryItems.filter((entry) => entry.id !== item.id)]);
          setLibraryItems(nextItems);
          persistLibraryItems(nextItems);
          setLibrarySaveDraft(null);
          setMessage(`Saved ${draft.mode} "${item.name}" to the demo shared library.`);
          return;
        }

        if (session?.role !== "admin") {
          setMessage("Shared library publishing requires an admin Supabase session.");
          return;
        }

        const { data, error } = await supabase
          .from("drawing_library_items")
          .insert({
            name: cleanName,
            category: draft.category,
            description,
            tags: tags.length > 0 ? tags : parseTags(cleanName),
            svg: draft.svg,
            fabric_json: draft.fabricJson,
            thumbnail: await svgToThumbnail(draft.svg),
            asset_type: draft.mode,
            author_id: userId,
            author_name: session.name,
          })
          .select("id,name,category,description,tags,thumbnail,asset_type,author_id,author_name,updated_at")
          .single();

        if (error) {
          setMessage(`Library publish failed: ${error.message}`);
          return;
        }

        const item = {
          ...mapLibraryRecord(data as LibraryItemRecord),
          fabricJson: draft.fabricJson,
          assetType: draft.mode,
        } satisfies LibraryItem;
        setLibraryItems((previous) => mergeLibraryItems([item, ...previous.filter((entry) => entry.id !== item.id)]));
        setLibrarySaveDraft(null);
        broadcastLibraryChanged();
        setMessage(`Published ${draft.mode} "${item.name}" to the shared library.`);
        return;
      }

      const item = createLibraryItem({
        name: cleanName,
        category: draft.category,
        description,
        tags: tags.length > 0 ? tags : parseTags(cleanName),
        svg: draft.svg,
        fabricJson: draft.fabricJson,
        source: "personal",
        assetType: draft.mode,
        author: session?.name || "Local Engineer",
      });

      const nextItems = mergeLibraryItems([item, ...libraryItems.filter((entry) => entry.id !== item.id)]);
      setLibraryItems(nextItems);
      persistLibraryItems(nextItems);
      setLibrarySaveDraft(null);
      setMessage(`Saved ${draft.mode} "${item.name}" to your personal library.`);
    },
    [libraryItems, session, setMessage, userId, svgToThumbnail],
  );

  const handleSaveProject = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    const nextPages = clonePages(syncSheetLabels(await saveCurrentPage()));
    const cleanName = projectName.trim() || "Untitled Engineering Package";

    // Demo mode (no Supabase): persist to localStorage.
    if (!supabase || !session || !userId) {
      const nowIso = new Date().toISOString();
      const id = activeProjectId ?? `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const saved: SavedProject = {
        id,
        ownerId: undefined,
        linkedProjectId: linkedProject?.id ?? null,
        linkedProjectName: linkedProject?.name ?? null,
        name: cleanName,
        owner: session?.name || "Local Engineer",
        updatedAt: nowIso,
        pages: nextPages,
      };
      const allLocal = loadSavedProjects();
      const merged = [saved, ...allLocal.filter((item) => item.id !== saved.id)];
      persistSavedProjects(merged);
      const scoped = linkedProject?.id
        ? merged.filter((p) => p.linkedProjectId === linkedProject.id)
        : merged;
      setSavedProjects(scoped);
      setActiveProjectId(saved.id);
      setLastSavedAt(saved.updatedAt);
      setProjectName(saved.name);
      setMessage("Project saved locally.");
      return;
    }

    const { data, error } = await supabase
      .from("drawing_projects")
      .upsert(
        {
          id: activeProjectId ?? undefined,
          owner_id: userId,
          linked_project_id: linkedProject?.id ?? null,
          linked_project_name: linkedProject?.name ?? null,
          name: cleanName,
          pages: nextPages,
        },
        { onConflict: "id" },
      )
      .select("*")
      .single();

    if (error) {
      setMessage(`Project save failed: ${error.message}`);
      return;
    }

    const saved = mapProjectRecord(data as ProjectRecord, session.name);
    setSavedProjects((previous) => [saved, ...previous.filter((item) => item.id !== saved.id)]);
    setActiveProjectId(saved.id);
    setLastSavedAt(saved.updatedAt);
    setProjectName(saved.name);
    setMessage("Project saved to Supabase.");
  }, [activeProjectId, linkedProject, projectName, saveCurrentPage, session, setMessage, userId]);

  const handleOpenProject = useCallback(
    async (project: SavedProject) => {
      // The list carries metadata only; fetch the project's pages on open so
      // boot never pulls every project's (potentially large) drawing content.
      let pages = project.pages;
      const supabase = getSupabaseBrowserClient();
      if (supabase) {
        setMessage(`Opening "${project.name}"…`);
        const { data, error } = await supabase
          .from("drawing_projects")
          .select("pages")
          .eq("id", project.id)
          .single();
        if (error) {
          setMessage(`Could not open project: ${error.message}`);
          return;
        }
        pages = Array.isArray(data?.pages) && data.pages.length ? (data.pages as Page[]) : [createBlankPage(1)];
      }
      setPages(clonePages(syncSheetLabels(pages)));
      setCurrentPageIndex(0);
      setProjectName(project.name);
      setActiveProjectId(project.id);
      setSelectedCount(0);
      setSelectedTextStyle({ hasText: false, fontSize: null, fill: null });
      setSelectedParametricBlock(null);
      setLastSavedAt(project.updatedAt);
      handleSetToolMode("select");
      setMessage(`Opened project "${project.name}".`);
    },
    [handleSetToolMode, setMessage],
  );

  const handleDeleteProject = useCallback(
    async (projectId: string) => {
      const project = savedProjects.find((item) => item.id === projectId);
      if (!project) return;
      if (!window.confirm(`Delete saved project "${project.name}"?`)) return;

      const supabase = getSupabaseBrowserClient();
      if (supabase) {
        const { error } = await supabase.from("drawing_projects").delete().eq("id", projectId);
        if (error) {
          setMessage(`Could not delete project: ${error.message}`);
          return;
        }
      } else {
        // Demo mode: drop from localStorage.
        const remaining = loadSavedProjects().filter((item) => item.id !== projectId);
        persistSavedProjects(remaining);
      }

      setSavedProjects((previous) => previous.filter((item) => item.id !== projectId));
      if (activeProjectId === projectId) {
        setActiveProjectId(null);
        setLastSavedAt(null);
      }
      setMessage("Saved project deleted.");
    },
    [activeProjectId, savedProjects, setMessage],
  );

  const handleNewProject = useCallback(() => {
    if (!window.confirm("Start a new drawing package? Unsaved work on the canvas may be lost.")) return;
    setPages(applyLinkedProjectContext([createBlankPage(1)], linkedProject));
    setCurrentPageIndex(0);
    setProjectName(getDrawingPackageName(linkedProject));
    setActiveProjectId(null);
    setLastSavedAt(null);
    setZoom(0.6);
    setSelectedCount(0);
    setSelectedTextStyle({ hasText: false, fontSize: null, fill: null });
    setSelectedParametricBlock(null);
    handleSetToolMode("select");
    setMessage("Started a new drawing package.");
  }, [handleSetToolMode, linkedProject, setMessage]);

  const handlePublishRawSvg = useCallback(
    async (payload: {
      name: string;
      category: LibraryCategory;
      description: string;
      tags: string[];
      svg: string;
    }) => {
      const supabase = getSupabaseBrowserClient();
      if (!payload.svg.trim()) {
        setMessage("Paste or generate SVG code before publishing.");
        return;
      }
      const cleanSvg = sanitizeSvgMarkup(payload.svg);

      // Demo mode / no Supabase: publish into the local shared library.
      if (!supabase) {
        const item = createLibraryItem({
          name: payload.name.trim() || "Published Drawing",
          category: payload.category,
          description: payload.description.trim() || "Admin-published SVG drawing.",
          tags: payload.tags.length > 0 ? payload.tags : parseTags(payload.name),
          svg: cleanSvg,
          source: "admin",
          assetType: "object",
          author: session?.name || "Demo Admin",
        });
        const nextItems = mergeLibraryItems([item, ...libraryItems.filter((entry) => entry.id !== item.id)]);
        setLibraryItems(nextItems);
        persistLibraryItems(nextItems);
        setMessage(`Published "${item.name}" to the demo shared library.`);
        return;
      }

      if (session?.role !== "admin") {
        setMessage("Shared library publishing requires an admin session.");
        return;
      }

      const { data, error } = await supabase
        .from("drawing_library_items")
        .insert({
          name: payload.name.trim() || "Published Drawing",
          category: payload.category,
          description: payload.description.trim() || "Admin-published SVG drawing.",
          tags: payload.tags.length > 0 ? payload.tags : parseTags(payload.name),
          svg: cleanSvg,
          thumbnail: await svgToThumbnail(cleanSvg),
          asset_type: "object",
          author_id: userId,
          author_name: session.name,
        })
        .select("id,name,category,description,tags,thumbnail,asset_type,author_id,author_name,updated_at")
        .single();

      if (error) {
        setMessage(`Library publish failed: ${error.message}`);
        return;
      }

      const item = {
        ...mapLibraryRecord(data as LibraryItemRecord),
        assetType: "object" as const,
      };
      setLibraryItems((previous) => mergeLibraryItems([item, ...previous.filter((entry) => entry.id !== item.id)]));
      setMessage(`Published "${item.name}" to the shared library.`);
    },
    [libraryItems, session, setMessage, userId, svgToThumbnail],
  );

  const handleDeleteLibraryItem = useCallback(
    async (item: LibraryItem) => {
      if (item.source === "seed") {
        setMessage("Built-in system library items cannot be deleted.");
        return;
      }

      const supabase = getSupabaseBrowserClient();
      if (supabase && item.source === "admin") {
        if (session?.role !== "admin") {
          setMessage("Only admins can remove shared library items.");
          return;
        }
        const { error } = await supabase.from("drawing_library_items").delete().eq("id", item.id);
        if (error) {
          setMessage(`Library delete failed: ${error.message}`);
          return;
        }
        setLibraryItems((previous) => previous.filter((entry) => entry.id !== item.id));
        broadcastLibraryChanged();
        setMessage(`Removed "${item.name}" from the shared library.`);
        return;
      }

      const nextItems = libraryItems.filter((entry) => entry.id !== item.id);
      setLibraryItems(nextItems);
      persistLibraryItems(nextItems);
      setMessage(`Removed "${item.name}" from the library.`);
    },
    [libraryItems, session, setMessage],
  );

  const handlePublishCanvasToLibrary = useCallback(
    async (payload: {
      name: string;
      category: LibraryCategory;
      description: string;
      tags: string[];
    }) => {
      const supabase = getSupabaseBrowserClient();
      const canvas = fabricRef.current;
      if (!supabase || !canvas || session?.role !== "admin") return;

      const canvasSvg = canvas.toSVG();
      const fabricJson = serializeCanvasFabricJson(canvas);
      const { data, error } = await supabase
        .from("drawing_library_items")
        .insert({
          name: payload.name.trim() || `${projectName} Sheet`,
          category: payload.category,
          description: payload.description.trim() || "Canvas drawing published from the admin workspace.",
          tags: payload.tags.length > 0 ? payload.tags : parseTags(projectName),
          svg: canvasSvg,
          fabric_json: fabricJson,
          thumbnail: await svgToThumbnail(canvasSvg),
          asset_type: "drawing",
          author_id: userId,
          author_name: session.name,
        })
        .select("id,name,category,description,tags,thumbnail,asset_type,author_id,author_name,updated_at")
        .single();

      if (error) {
        setMessage(`Canvas publish failed: ${error.message}`);
        return;
      }

      const item = {
        ...mapLibraryRecord(data as LibraryItemRecord),
        fabricJson,
        assetType: "drawing" as const,
      };
      setLibraryItems((previous) => mergeLibraryItems([item, ...previous.filter((entry) => entry.id !== item.id)]));
      broadcastLibraryChanged();
      setMessage(`Published canvas content as "${item.name}".`);
    },
    [projectName, session, setMessage, userId],
  );

  // Admin: overwrite the library drawing currently being edited with the cleaned
  // canvas (new svg + thumbnail). "Republish the updated drawing."
  const handleUpdateLibraryItem = useCallback(async () => {
    if (!editingLibraryItem) return;
    const supabase = getSupabaseBrowserClient();
    const canvas = fabricRef.current;
    if (!canvas || (authConfigured && session?.role !== "admin")) {
      setMessage("Only admins can update shared library drawings.");
      return;
    }
    // Save both formats: the SVG renders thumbnails/previews, the Fabric JSON
    // preserves the admin's grouping + parametric metadata — so the curated
    // structure persists in the warehouse until the next admin update.
    const canvasSvg = canvas.toSVG();
    const fabricJson = serializeCanvasFabricJson(canvas);
    const thumbnail = await svgToThumbnail(canvasSvg);
    const updatedAt = new Date().toISOString();

    // Personal items — and everything in demo mode — live in local storage.
    if (!supabase || editingLibraryItem.source === "personal") {
      let nextItems: LibraryItem[];
      if (editingLibraryItem.source === "seed") {
        // Built-in item: persist an admin copy under the same name; the loader
        // prefers stored items over seeds by name, so the curated version wins.
        const replacement = createLibraryItem({
          name: editingLibraryItem.name,
          category: editingLibraryItem.category,
          description: editingLibraryItem.description,
          tags: editingLibraryItem.tags,
          svg: canvasSvg,
          fabricJson,
          source: "admin",
          author: session?.name || "Demo Admin",
        });
        nextItems = [
          { ...replacement, thumbnail },
          ...libraryItems.filter((entry) => entry.id !== editingLibraryItem.id),
        ];
      } else {
        nextItems = libraryItems.map((entry) =>
          entry.id === editingLibraryItem.id
            ? { ...entry, svg: canvasSvg, fabricJson, thumbnail, updatedAt }
            : entry,
        );
      }
      setLibraryItems(nextItems);
      persistLibraryItems(nextItems);
      setMessage(`Updated "${editingLibraryItem.name}" in the library.`);
      setEditingLibraryItem(null);
      return;
    }

    if (session?.role !== "admin") {
      setMessage("Only admins can update shared library drawings.");
      return;
    }

    if (editingLibraryItem.source === "seed") {
      // Built-in item: publish a DB override with the same name — the library
      // merge prefers DB items over seeds, so this replaces it for everyone.
      const { data, error } = await supabase
        .from("drawing_library_items")
        .insert({
          name: editingLibraryItem.name,
          category: editingLibraryItem.category,
          description: editingLibraryItem.description,
          tags: editingLibraryItem.tags,
          svg: canvasSvg,
          fabric_json: fabricJson,
          thumbnail,
          // Seed override keeps the original's kind (a curated seed part must
          // stay a part).
          asset_type:
            libraryItems.find((entry) => entry.id === editingLibraryItem.id)?.assetType ??
            "drawing",
          author_id: userId,
          author_name: session.name,
        })
        .select("id,name,category,description,tags,thumbnail,asset_type,author_id,author_name,updated_at")
        .single();
      if (error) {
        setMessage(`Library update failed: ${error.message}`);
        return;
      }
      const item: LibraryItem = { ...mapLibraryRecord(data as LibraryItemRecord), svg: canvasSvg, fabricJson };
      setLibraryItems((previous) =>
        mergeLibraryItems([
          item,
          ...previous.filter((entry) => entry.id !== item.id && entry.id !== editingLibraryItem.id),
        ]),
      );
    } else {
      // Confirm the write landed: an update that matches zero rows (RLS blocked
      // it, or the row is gone) resolves with no error, so without .select() the
      // UI would report a phantom success while nothing persisted.
      const { data: updated, error } = await supabase
        .from("drawing_library_items")
        .update({ svg: canvasSvg, fabric_json: fabricJson, thumbnail, updated_at: updatedAt })
        .eq("id", editingLibraryItem.id)
        .select("id");
      if (error) {
        setMessage(`Library update failed: ${error.message}`);
        return;
      }
      if (!updated || updated.length === 0) {
        setMessage(
          "Library update didn't save — you may not have permission, or the drawing no longer exists.",
        );
        return;
      }
      setLibraryItems((previous) =>
        previous.map((entry) =>
          entry.id === editingLibraryItem.id
            ? { ...entry, svg: canvasSvg, fabricJson, thumbnail, updatedAt }
            : entry,
        ),
      );
    }
    broadcastLibraryChanged();
    setMessage(`Updated "${editingLibraryItem.name}" in the library.`);
    setEditingLibraryItem(null);
  }, [authConfigured, editingLibraryItem, libraryItems, session, setMessage, svgToThumbnail, userId]);

  // Admin: save the cleaned canvas as a new copy instead of overwriting.
  const handleSaveEditAsNew = useCallback(() => {
    if (!editingLibraryItem) return;
    void handlePublishCanvasToLibrary({
      name: `${editingLibraryItem.name} (copy)`,
      category: editingLibraryItem.category,
      description: editingLibraryItem.description,
      tags: editingLibraryItem.tags,
    });
    setEditingLibraryItem(null);
  }, [editingLibraryItem, handlePublishCanvasToLibrary]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (mod && key === "z") {
        event.preventDefault();
        if (event.shiftKey) void handleRedo();
        else void handleUndo();
      } else if (mod && key === "y") {
        event.preventDefault();
        void handleRedo();
      } else if (mod && key === "c") {
        event.preventDefault();
        void handleCopy();
      } else if (mod && key === "v") {
        event.preventDefault();
        void handlePaste();
      } else if (mod && key === "d") {
        event.preventDefault();
        void handleDuplicate();
      } else if (mod && key === "s") {
        event.preventDefault();
        void handleSaveProject();
      } else if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        handleDelete();
      } else if (event.key === "Escape") {
        // If a polyline is being drawn, finish it on first Escape; switch tool on the next.
        if (toolModeRef.current === "line" && lineStateRef.current.points.length > 0) {
          event.preventDefault();
          finishLinePolyline();
          return;
        }
        if (toolModeRef.current !== "select") {
          handleSetToolMode("select");
        } else {
          fabricRef.current?.discardActiveObject();
          fabricRef.current?.requestRenderAll();
        }
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [finishLinePolyline, handleCopy, handleDelete, handleDuplicate, handlePaste, handleRedo, handleSaveProject, handleSetToolMode, handleUndo]);

  const activeContextObject = fabricRef.current?.getActiveObject();
  const canUndo = historyVersion >= 0 && historyRef.current.past.length > 1;
  const canRedo = historyVersion >= 0 && historyRef.current.future.length > 0;
  const contextItems = [
    {
      label: "Save selection as part (my library)",
      onClick: () => openLibrarySaveDialog("object", "personal"),
      visible: Boolean(activeContextObject),
    },
    {
      label: "Publish selection as part (shared warehouse)",
      onClick: () => openLibrarySaveDialog("object", "shared"),
      visible: Boolean(activeContextObject && (session?.role === "admin" || !authConfigured)),
    },
    {
      label: "Save current drawing to my library",
      onClick: () => openLibrarySaveDialog("drawing", "personal"),
      visible: true,
    },
    {
      label: "Publish current drawing to shared library",
      onClick: () => openLibrarySaveDialog("drawing", "shared"),
      visible: session?.role === "admin" || !authConfigured,
    },
    {
      label: "Ungroup block for editing",
      onClick: handleUngroup,
      visible: isUngroupableObject(activeContextObject),
    },
    {
      label: "Group selection",
      onClick: handleGroup,
      visible: activeContextObject?.type === "activeselection",
    },
    { label: "Duplicate", onClick: () => void handleDuplicate(), visible: Boolean(activeContextObject) },
    { label: "Copy", onClick: () => void handleCopy(), visible: Boolean(activeContextObject) },
    { label: "Bring to front", onClick: handleBringFront, visible: Boolean(activeContextObject) },
    { label: "Send to back", onClick: handleSendBack, visible: Boolean(activeContextObject) },
    { label: "Delete", onClick: handleDelete, visible: Boolean(activeContextObject), danger: true },
  ].filter((item) => item.visible);

  if (!booted || !fabricMod) {
    return (
      <div className={`flex items-center justify-center bg-slate-950 text-sm font-medium text-slate-400 ${embedded ? "min-h-[70vh]" : "min-h-screen"}`}>
        Loading drawing workspace...
      </div>
    );
  }

  if (!session || !canRenderWorkspace) {
    return (
      <div className={`flex items-center justify-center bg-slate-950 text-sm font-medium text-slate-400 ${embedded ? "min-h-[70vh]" : "min-h-screen"}`}>
        Loading authenticated workspace...
      </div>
    );
  }

  return (
    <>
    {!embedded && (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-6 text-center sm:hidden">
        <div className="rounded-[28px] border border-slate-800 bg-slate-900/80 p-6 shadow-2xl shadow-black/30">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-500 text-lg font-black text-white">
            DF
          </div>
          <h1 className="mt-5 text-xl font-black text-white">Drawing Studio needs more space</h1>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            The technical drawing editor is optimized for tablets, laptops, and desktop screens so the canvas and tools remain usable.
          </p>
          <button
            type="button"
            onClick={handleBackToDashboard}
            className="mt-5 inline-flex w-full items-center justify-center rounded-2xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm font-bold text-white"
          >
            Back to dashboard
          </button>
        </div>
      </div>
    )}
    <div className={`drawflow-studio ${embedded ? "flex" : "hidden sm:flex"} flex-col bg-slate-950 ${embedded ? "min-h-[78vh] rounded-[18px] border border-slate-800 shadow-[0_20px_60px_rgba(0,0,0,0.35)]" : "h-screen"}`}>
      <Toolbar
        session={session}
        projectName={projectName}
        pages={pages}
        currentPageIndex={currentPageIndex}
        zoom={zoom}
        selectedCount={selectedCount}
        toolMode={toolMode}
        activeTray={embedded ? undefined : studioTray}
        lastSavedAt={lastSavedAt}
        canUndo={canUndo}
        canRedo={canRedo}
        onSetToolMode={handleSetToolMode}
        onSwitchPage={handleSwitchPage}
        onAddPage={handleAddPage}
        onDeletePage={handleDeletePage}
        onChangePaper={(paper) => updateCurrentPage({ paperSize: paper })}
        onChangeOrientation={(orientation) => updateCurrentPage({ orientation })}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onZoomFit={handleZoomFit}
        onZoom100={handleZoom100}
        onSetActiveTray={embedded ? undefined : setStudioTray}
        onBackToDashboard={embedded ? undefined : handleBackToDashboard}
        backLabel={linkedProject?.name}
        snapEnabled={snapEnabled}
        onToggleSnapping={() => setSnapEnabled((current) => !current)}
        onAddRectangle={handleAddRectangle}
        onAddCircle={handleAddCircle}
        onAddText={handleAddText}
        onAddSvg={handleAddSvg}
        onAddParametricBlock={handleAddParametricBlock}
        onApplyPattern={handleApplyPattern}
        onUpdateStroke={handleUpdateStroke}
        onUpdateLineStyle={handleUpdateLineStyle}
        onDuplicate={() => void handleDuplicate()}
        onDelete={handleDelete}
        onCopy={() => void handleCopy()}
        onPaste={() => void handlePaste()}
        onUndo={() => void handleUndo()}
        onRedo={() => void handleRedo()}
        onBringFront={handleBringFront}
        onSendBack={handleSendBack}
        onNewProject={handleNewProject}
        onSaveProject={() => void handleSaveProject()}
        onExportPDF={() => void handleExportPDF()}
        onOpenWarehouse={() => window.open("/drawings/library", "planovera-library")}
        onLogout={() => {
          const supabase = getSupabaseBrowserClient();
          if (authConfigured) {
            void supabase?.auth.signOut();
          }
          setSession(null);
          setUserId(null);
          if (authConfigured) {
            router.replace("/login");
            router.refresh();
            setMessage("Signed out of the drawing workspace.");
            return;
          }
          resetWorkspaceState();
          setSession({
            name: linkedProject?.consultantName || "Local Engineer",
            company: linkedProject?.name || "Planovera Workspace",
            role: "engineer",
          });
          setMessage("Reset the local drawing workspace.");
        }}
      />

      {editingLibraryItem ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm">
          <span className="font-semibold text-amber-900">
            Editing library drawing: {editingLibraryItem.name}
          </span>
          <span className="text-amber-700">Remove unneeded notes, clean up, then save.</span>
          <div className="ml-auto flex items-center gap-2">
            <button
              className={`btn ${toolMode === "marquee" ? "btn-primary" : ""}`}
              onClick={() => handleSetToolMode(toolMode === "marquee" ? "select" : "marquee")}
              title="Drag a box around a detail — only objects FULLY inside the box are selected"
            >
              {toolMode === "marquee" ? "Drag a box…" : "Select area"}
            </button>
            <button
              className={`btn ${toolMode === "lasso" ? "btn-primary" : ""}`}
              onClick={() => handleSetToolMode(toolMode === "lasso" ? "select" : "lasso")}
              title="Trace any outline around a detail — only objects FULLY inside the outline are selected"
            >
              {toolMode === "lasso" ? "Trace around it…" : "Select freehand"}
            </button>
            <button
              className="btn"
              onClick={handleUngroupDrawing}
              title="Split the drawing into individual parts — drag a box to select any portion, or click a label to edit it"
            >
              Ungroup
            </button>
            <button
              className="btn"
              onClick={handleGroupDrawing}
              title="Combine the whole drawing into one block so it moves and places as a single unit"
            >
              Group
            </button>
            <button className="btn btn-primary" onClick={() => void handleUpdateLibraryItem()}>
              Save changes to library
            </button>
            <button className="btn" onClick={handleSaveEditAsNew}>
              Save as new copy
            </button>
            <button className="btn" onClick={() => setEditingLibraryItem(null)}>
              Done
            </button>
          </div>
        </div>
      ) : null}

      <div className={`flex min-h-0 flex-1 ${embedded ? "flex-col" : "flex-row"}`}>
        <LeftPanel
          layout={embedded ? "top" : "side"}
          activeTray={embedded ? undefined : studioTray}
          onActiveTrayChange={embedded ? undefined : setStudioTray}
          session={session}
          projectName={projectName}
          onProjectNameChange={setProjectName}
          libraryItems={libraryItems}
          favoriteIds={favoriteIds}
          recentIds={recentIds}
          onToggleFavorite={toggleLibraryFavorite}
          onRecordLibraryUse={recordLibraryUse}
          onOpenLibrary={() => window.open("/drawings/library", "planovera-library")}
          onInsertLibraryItem={handleInsertLibraryItem}
          savedProjects={savedProjects}
          activeProjectId={activeProjectId}
          selectedCount={selectedCount}
          selectedTextStyle={selectedTextStyle}
          selectedParametricBlock={selectedParametricBlock}
          statusMessage={statusMessage}
          titleBlockData={currentPage.titleBlockData}
          setTitleBlockData={(data) => updateCurrentPage({ titleBlockData: data })}
          onAddSvg={handleAddSvg}
          onAddParametricBlock={handleAddParametricBlock}
          onFetchLibrarySvg={fetchLibrarySvg}
          onUpdateParametricBlock={handleUpdateParametricBlock}
          onApplyTitleBlock={handleApplyTitleBlock}
          onRemoveTitleBlock={handleRemoveTitleBlock}
          onApplyPattern={handleApplyPattern}
          onUpdateStroke={handleUpdateStroke}
          onUpdateLineStyle={handleUpdateLineStyle}
          onUpdateTextStyle={handleUpdateTextStyle}
          onSaveProject={() => void handleSaveProject()}
          onOpenProject={handleOpenProject}
          onDeleteProject={(projectId) => void handleDeleteProject(projectId)}
          onPublishRawSvg={(payload) => void handlePublishRawSvg(payload)}
          onPublishCanvasToLibrary={(payload) => void handlePublishCanvasToLibrary(payload)}
          onDeleteLibraryItem={(item) => void handleDeleteLibraryItem(item)}
        />

        <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-slate-950">
          <div className={`flex flex-1 overflow-hidden ${embedded ? "px-3 py-3" : "px-0 py-0"}`}>
            <section
              ref={workspaceRef}
              className={`workspace-panel flex-1 overflow-auto ${embedded ? "rounded-[18px] p-4" : "p-0"}`}
            >
              <div className={`inline-flex min-h-full min-w-full items-center justify-center ${embedded ? "p-10" : "p-12"}`}>
                <div className="paper-frame relative flex-shrink-0">
                  <canvas ref={canvasElRef} />
                </div>
              </div>
            </section>
          </div>
        </main>
      </div>

      <div className="flex items-center gap-1 overflow-x-auto border-t border-[color:var(--df-border)] bg-[color:var(--df-surface)] px-2 py-1.5">
        <span className="mr-1 inline-flex shrink-0 items-center gap-1.5 px-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--df-text-muted)]">
          <FileText className="h-3.5 w-3.5" /> Sheets
        </span>
        {pages.map((page, index) => {
          const active = index === currentPageIndex;
          if (renamingSheet === index) {
            return (
              <input
                key={page.id}
                autoFocus
                value={renameDraft}
                onChange={(event) => setRenameDraft(event.target.value)}
                onBlur={() => {
                  handleRenamePage(index, renameDraft);
                  setRenamingSheet(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    handleRenamePage(index, renameDraft);
                    setRenamingSheet(null);
                  } else if (event.key === "Escape") {
                    setRenamingSheet(null);
                  }
                }}
                className="w-32 shrink-0 rounded-md border border-[color:var(--df-accent)] bg-[color:var(--df-bg)] px-2 py-1 text-xs text-[color:var(--df-text)] outline-none"
              />
            );
          }
          return (
            <button
              key={page.id}
              type="button"
              onClick={() => void handleSwitchPage(index)}
              onDoubleClick={() => {
                setRenameDraft(page.name);
                setRenamingSheet(index);
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                setSheetMenu({ visible: true, x: event.clientX, y: event.clientY, index });
              }}
              title="Click to open · double-click to rename · right-click for more"
              className="group inline-flex shrink-0 items-center gap-1.5 rounded-md border-t-2 px-3 py-1.5 text-xs font-medium transition"
              style={{
                borderTopColor: active ? "var(--df-accent)" : "transparent",
                background: active ? "var(--df-surface-3)" : "transparent",
                color: active ? "var(--df-text)" : "var(--df-text-dim)",
              }}
            >
              <span className={active ? "font-semibold" : ""}>{page.name}</span>
              <span
                className="rounded px-1 py-0.5 text-[9px] font-bold uppercase"
                style={{
                  background: active ? "var(--df-accent)" : "rgba(255,255,255,0.08)",
                  color: active ? "#1b1c20" : "var(--df-text-dim)",
                }}
              >
                {page.paperSize}
              </span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => void handleAddPage()}
          title="Add sheet"
          aria-label="Add sheet"
          className="ml-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-dashed border-[color:var(--df-border)] text-[color:var(--df-text-dim)] transition hover:border-[color:var(--df-accent)] hover:text-[color:var(--df-accent)]"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      <footer className="drawflow-statusbar">
        <span className="drawflow-statusbar-item"><span className="drawflow-statusbar-dot" /> Ready</span>
        <span className="drawflow-statusbar-item">Sheet {currentPageIndex + 1} / {pages.length}</span>
        <span className="drawflow-statusbar-item">{currentPage.paperSize} {currentPage.orientation}</span>
        <span className="drawflow-statusbar-item">Tool {toolMode}</span>
        <span className="drawflow-statusbar-item">Snap {snapEnabled ? "on" : "off"}</span>
        <span className="drawflow-statusbar-spacer" />
        <span className="drawflow-statusbar-item">{statusMessage || "Right-click objects for edit, ungroup, and library actions."}</span>
      </footer>

      {contextMenu.visible ? (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu((previous) => ({ ...previous, visible: false }))}
          items={contextItems.map((item) => ({
            label: item.label,
            onClick: item.onClick,
            danger: item.danger,
          }))}
        />
      ) : null}

      {sheetMenu.visible ? (
        <ContextMenu
          x={sheetMenu.x}
          y={sheetMenu.y}
          onClose={() => setSheetMenu((previous) => ({ ...previous, visible: false }))}
          items={[
            {
              label: "Rename sheet",
              onClick: () => {
                setRenameDraft(pages[sheetMenu.index]?.name ?? "");
                setRenamingSheet(sheetMenu.index);
              },
            },
            { label: "Duplicate sheet", onClick: () => void handleDuplicatePage(sheetMenu.index) },
            {
              label: "Delete sheet",
              onClick: () => void handleDeletePage(sheetMenu.index),
              danger: true,
            },
          ]}
        />
      ) : null}

      {librarySaveDraft ? (
        <LibrarySaveDialog
          draft={librarySaveDraft}
          canPublishShared={session.role === "admin" || !authConfigured}
          onChange={setLibrarySaveDraft}
          onCancel={() => setLibrarySaveDraft(null)}
          onSave={() => void handleConfirmLibrarySave(librarySaveDraft)}
        />
      ) : null}
    </div>
    </>
  );
}

function LibrarySaveDialog({
  draft,
  canPublishShared,
  onChange,
  onCancel,
  onSave,
}: {
  draft: LibrarySaveDraft;
  canPublishShared: boolean;
  onChange: (draft: LibrarySaveDraft) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const scopeLabel = draft.scope === "shared" ? "Shared library" : "My library";
  const modeLabel = draft.mode === "object" ? "object" : "complete drawing";

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/55 px-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_28px_90px_rgba(15,23,42,0.28)]">
        <div className="border-b border-slate-200 bg-slate-50 px-6 py-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
            Save reusable library asset
          </p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">
            Save {modeLabel} to {scopeLabel.toLowerCase()}
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Use clear labels so engineers can quickly find columns, beams, footings,
            details, or complete drawing layouts later.
          </p>
        </div>

        <div className="grid gap-4 px-6 py-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label">Asset name</label>
            <input
              className="input"
              value={draft.name}
              onChange={(event) => onChange({ ...draft, name: event.target.value })}
              placeholder="e.g. RC Column C1 300x450 with starter bars"
            />
          </div>

          <div>
            <label className="label">Category</label>
            <select
              className="input"
              value={draft.category}
              onChange={(event) =>
                onChange({ ...draft, category: event.target.value as LibraryCategory })
              }
            >
              {LIBRARY_CATEGORIES.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Library destination</label>
            <select
              className="input"
              value={draft.scope}
              disabled={!canPublishShared}
              onChange={(event) =>
                onChange({
                  ...draft,
                  scope: event.target.value as LibrarySaveDraft["scope"],
                })
              }
            >
              <option value="personal">My personal library</option>
              <option value="shared">Shared admin library</option>
            </select>
            {!canPublishShared ? (
              <p className="mt-2 text-xs leading-5 text-slate-500">
                Shared publishing will be enabled for admin accounts after login is active.
              </p>
            ) : null}
          </div>

          <div className="sm:col-span-2">
            <label className="label">Description</label>
            <textarea
              className="input min-h-[96px] resize-y"
              value={draft.description}
              onChange={(event) => onChange({ ...draft, description: event.target.value })}
              placeholder="Describe use case, scale assumptions, project standard, or edit notes."
            />
          </div>

          <div className="sm:col-span-2">
            <label className="label">Tags</label>
            <input
              className="input"
              value={draft.tags}
              onChange={(event) => onChange({ ...draft, tags: event.target.value })}
              placeholder="column, beam, footing, structural, detail"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
          <div className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">
            Type: {draft.mode === "object" ? "Reusable part (cropped to the selection)" : "Complete drawing"}
          </div>
          <div className="flex items-center gap-2">
            <button className="btn" onClick={onCancel}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={onSave}>
              Save library asset
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
