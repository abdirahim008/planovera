"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type * as FabricNS from "fabric";
import type { User } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";

import Toolbar from "./Toolbar";
import LeftPanel from "./LeftPanel";
import ContextMenu from "./ContextMenu";
import { getPaperDimensions } from "@/lib/paper";
import {
  TITLE_BLOCK_KEY,
  TB_FIELD_KEY,
  Page,
  TitleBlockData,
  addSvgToCanvas,
  createDimensionGroup,
  createOrUpdateTitleBlock,
  exportPagesToPDF,
} from "@/lib/fabricHelpers";
import { extractSegments, findSnapPoint, renderSnapMarker } from "@/lib/snapping";
import { PATTERNS, PatternType } from "@/lib/patterns";
import {
  LibraryCategory,
  LibraryItem,
  LibraryItemRecord,
  ProfileRecord,
  ProjectRecord,
  SEED_LIBRARY_ITEMS,
  SavedProject,
  UserSession,
  createBlankPage,
  mapLibraryRecord,
  mapProfileToSession,
  mapProjectRecord,
  parseTags,
} from "@/lib/appModel";
import { getSupabaseBrowserClient } from "@/lib/supabase";

type FabricMod = typeof FabricNS;
type ToolMode = "select" | "pan" | "line" | "dimension" | "trim";

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

export default function Editor() {
  const router = useRouter();
  const [fabricMod, setFabricMod] = useState<FabricMod | null>(null);
  const [booted, setBooted] = useState(false);
  const [session, setSession] = useState<UserSession | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("Untitled Engineering Package");
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>(SEED_LIBRARY_ITEMS);
  const [savedProjects, setSavedProjects] = useState<SavedProject[]>([]);
  const [pages, setPages] = useState<Page[]>([createBlankPage(1)]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [zoom, setZoom] = useState(0.6);
  const [selectedCount, setSelectedCount] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [toolMode, setToolMode] = useState<ToolMode>("select");
  const [contextMenu, setContextMenu] = useState({
    visible: false,
    x: 0,
    y: 0,
  });

  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const fabricRef = useRef<FabricNS.Canvas | null>(null);
  const clipboardRef = useRef<FabricNS.FabricObject | null>(null);
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const toolModeRef = useRef<ToolMode>("select");
  const dimStateRef = useRef<{
    step: number;
    p1?: { x: number; y: number };
    p2?: { x: number; y: number };
    previewGroup?: FabricNS.Group | null;
  }>({ step: 0 });
  const lineStateRef = useRef<{
    p1?: { x: number; y: number };
    previewLine?: FabricNS.Line | null;
  }>({});

  const currentPage = pages[currentPageIndex] ?? pages[0];
  const canRenderWorkspace = Boolean(session && currentPage);

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

  const resetWorkspaceState = useCallback(() => {
    setProjectName("Untitled Engineering Package");
    setActiveProjectId(null);
    setSavedProjects([]);
    setPages([createBlankPage(1)]);
    setCurrentPageIndex(0);
    setZoom(0.6);
    setSelectedCount(0);
    setLastSavedAt(null);
    setLibraryItems(SEED_LIBRARY_ITEMS);
  }, []);

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
          supabase.from("drawing_projects").select("*").order("updated_at", { ascending: false }),
          supabase.from("drawing_library_items").select("*").order("updated_at", { ascending: false }),
        ]);

      if (projectsError) throw projectsError;
      if (libraryError) throw libraryError;

      const nextProjects = ((projectRows ?? []) as ProjectRecord[]).map((project) =>
        mapProjectRecord(project, profile.full_name || profile.email),
      );
      const nextLibrary = mergeLibraryItems(
        ((libraryRows ?? []) as LibraryItemRecord[]).map(mapLibraryRecord),
      );

      setSavedProjects(nextProjects);
      setLibraryItems(nextLibrary);
      setLastSavedAt(nextProjects[0]?.updatedAt ?? null);
    },
    [],
  );

  const syncUserState = useCallback(
    async (user: User | null) => {
      if (!user) {
        setSession(null);
        setUserId(null);
        resetWorkspaceState();
        setBooted(true);
        router.replace("/login");
        router.refresh();
        return;
      }

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
        setLibraryItems(SEED_LIBRARY_ITEMS);
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
      setBooted(true);
      return;
    }

    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      void syncUserState(data.user ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      void syncUserState(nextSession?.user ?? null);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [syncUserState]);

  const handleSetToolMode = useCallback(
    (mode: ToolMode) => {
      setToolMode(mode);
      toolModeRef.current = mode;

      const canvas = fabricRef.current;
      if (!canvas) return;

      if (fabricMod) renderSnapMarker(fabricMod, canvas, null);

      const lineState = lineStateRef.current;
      if (lineState.previewLine) {
        canvas.remove(lineState.previewLine);
        lineState.previewLine = null;
      }
      lineState.p1 = undefined;

      const dimState = dimStateRef.current;
      if (dimState.previewGroup) canvas.remove(dimState.previewGroup);
      dimStateRef.current = { step: 0 };

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
    [fabricMod],
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
    });

    fabricRef.current = canvas;

    const updateSelectionCount = () => setSelectedCount(canvas.getActiveObjects().length);
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

    canvas.on("selection:created", updateSelectionCount);
    canvas.on("selection:updated", updateSelectionCount);
    canvas.on("selection:cleared", () => setSelectedCount(0));

    canvas.on("contextmenu", (opt) => {
      opt.e.preventDefault();
      opt.e.stopPropagation();
      const mouseEvent = opt.e as MouseEvent;

      if (opt.target) {
        canvas.setActiveObject(opt.target);
        setContextMenu({ visible: true, x: mouseEvent.clientX, y: mouseEvent.clientY });
      } else {
        setContextMenu((previous) => ({ ...previous, visible: false }));
      }
    });

    const canvasElement = canvas.getElement();
    canvasElement.oncontextmenu = (event) => event.preventDefault();

    canvas.on("mouse:dblclick", (opt) => {
      const target = opt.target;
      if (target && (target.type === "itext" || target.type === "textbox")) {
        canvas.setActiveObject(target);
        (target as FabricNS.IText).enterEditing();
        canvas.requestRenderAll();
      }
    });

    canvas.on("text:changed", (opt) => {
      const target = opt.target as unknown as
        | (FabricNS.FabricObject & Record<string, unknown>)
        | undefined;
      if (!target || !target[TB_FIELD_KEY]) return;

      const fieldName = target[TB_FIELD_KEY] as keyof TitleBlockData;
      const newValue = (target as unknown as { text?: string }).text ?? "";
      setPages((previous) => {
        const next = [...previous];
        const page = { ...next[currentPageIndex] };
        page.titleBlockData = { ...page.titleBlockData, [fieldName]: newValue };
        next[currentPageIndex] = page;
        return next;
      });
    });

    let isDragging = false;
    let lastPosX = 0;
    let lastPosY = 0;

    canvas.on("mouse:wheel", (opt) => {
      const delta = opt.e.deltaY;
      const zoomFactor = 0.999 ** delta;

      setZoom((oldZoom) => {
        const newZoom = Math.max(0.1, Math.min(4, oldZoom * zoomFactor));
        setTimeout(() => {
          const workspace = workspaceRef.current;
          if (!workspace) return;
          const ratio = newZoom / oldZoom;
          workspace.scrollLeft = (workspace.scrollLeft + opt.e.offsetX) * ratio - opt.e.offsetX;
          workspace.scrollTop = (workspace.scrollTop + opt.e.offsetY) * ratio - opt.e.offsetY;
        }, 0);
        return newZoom;
      });

      opt.e.preventDefault();
      opt.e.stopPropagation();
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

      if (toolModeRef.current === "line" && event.button === 0) {
        let point: { x: number; y: number } = canvas.getScenePoint(event);
        const state = lineStateRef.current;
        const snap = findSnapPoint(fabricMod, point, canvas, state.previewLine ? [state.previewLine] : []);
        if (snap && !event.shiftKey) point = snap.point;

        if (!state.p1) {
          state.p1 = { x: point.x, y: point.y };
        } else {
          let endX = point.x;
          let endY = point.y;
          if (event.shiftKey) {
            const dx = point.x - state.p1.x;
            const dy = point.y - state.p1.y;
            const angle = Math.atan2(dy, dx);
            const snapAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
            const length = Math.hypot(dx, dy);
            endX = state.p1.x + Math.cos(snapAngle) * length;
            endY = state.p1.y + Math.sin(snapAngle) * length;
          }

          if (state.previewLine) canvas.remove(state.previewLine);
          const line = new fabricMod.Line([state.p1.x, state.p1.y, endX, endY], {
            stroke: "#0f172a",
            strokeWidth: 1.2,
            selectable: true,
            evented: true,
          });

          canvas.add(line);
          canvas.setActiveObject(line);
          canvas.requestRenderAll();
          state.p1 = undefined;
          state.previewLine = null;
          setMessage("Line placed on sheet.");
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
          fill: targetLine.fill,
          opacity: targetLine.opacity,
        });

        canvas.remove(targetLine);
        canvas.add(replacement);
        canvas.setActiveObject(replacement);
        canvas.requestRenderAll();
        setMessage("Trim operation completed.");
        return;
      }

      if (toolModeRef.current === "dimension" && event.button === 0) {
        let point: { x: number; y: number } = canvas.getScenePoint(event);
        const state = dimStateRef.current;
        const snap = findSnapPoint(fabricMod, point, canvas, state.previewGroup ? [state.previewGroup] : []);
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
            const finalDimension = createDimensionGroup(fabricMod, state.p1, state.p2, offsetDist, {
              isPreview: false,
            });
            if (finalDimension) {
              canvas.add(finalDimension);
              canvas.setActiveObject(finalDimension);
              setMessage("Dimension placed.");
            }
          }

          dimStateRef.current = { step: 0 };
          handleSetToolMode("select");
        }
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

      if (toolModeRef.current === "line") {
        const state = lineStateRef.current;
        let point: { x: number; y: number } = canvas.getScenePoint(event);
        const snap = findSnapPoint(fabricMod, point, canvas, state.previewLine ? [state.previewLine] : []);
        if (snap && !event.shiftKey) point = snap.point;
        renderSnapMarker(fabricMod, canvas, snap);

        if (!state.p1) return;

        let endX = point.x;
        let endY = point.y;
        if (event.shiftKey) {
          const dx = point.x - state.p1.x;
          const dy = point.y - state.p1.y;
          const angle = Math.atan2(dy, dx);
          const snapAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
          const length = Math.hypot(dx, dy);
          endX = state.p1.x + Math.cos(snapAngle) * length;
          endY = state.p1.y + Math.sin(snapAngle) * length;
        }

        if (state.previewLine) canvas.remove(state.previewLine);
        const previewLine = new fabricMod.Line([state.p1.x, state.p1.y, endX, endY], {
          stroke: "#2563eb",
          strokeWidth: 1,
          strokeDashArray: [8, 4],
          selectable: false,
          evented: false,
        });

        canvas.add(previewLine);
        state.previewLine = previewLine;
      }

      if (toolModeRef.current === "dimension") {
        let point: { x: number; y: number } = canvas.getScenePoint(event);
        const state = dimStateRef.current;

        if (state.step < 2) {
          const snap = findSnapPoint(fabricMod, point, canvas, state.previewGroup ? [state.previewGroup] : []);
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
    });

    canvas.on("mouse:up", () => {
      isDragging = false;
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

    if (currentPage.json) {
      canvas.loadFromJSON(currentPage.json).then(() => {
        canvas.requestRenderAll();
      });
    }

    setTimeout(() => {
      const workspace = workspaceRef.current;
      if (!workspace) return;
      workspace.scrollLeft = (workspace.scrollWidth - workspace.clientWidth) / 2;
      workspace.scrollTop = (workspace.scrollHeight - workspace.clientHeight) / 2;
    }, 50);

    return () => {
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
    session,
    setMessage,
  ]);

  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas || !currentPage) return;
    const { width, height } = getPaperDimensions(currentPage.paperSize, currentPage.orientation);
    applyZoom(canvas, zoom, width, height);
  }, [applyZoom, currentPage, zoom]);

  const getPaperCenter = useCallback(() => {
    if (!currentPage) return { width: 800, height: 600, centerX: 400, centerY: 300 };
    const { width, height } = getPaperDimensions(currentPage.paperSize, currentPage.orientation);
    return { width, height, centerX: width / 2, centerY: height / 2 };
  }, [currentPage]);

  const addObjectToCanvas = useCallback(
    (object: FabricNS.FabricObject, message: string) => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      canvas.add(object);
      canvas.setActiveObject(object);
      canvas.requestRenderAll();
      setMessage(message);
      handleSetToolMode("select");
    },
    [handleSetToolMode, setMessage],
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
        await addSvgToCanvas(fabricMod, canvas, svg);
        setMessage("SVG block inserted on the canvas.");
      } catch (error) {
        setMessage(
          `SVG import failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
    [fabricMod, setMessage],
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
    setMessage("Selection duplicated.");
  }, [setMessage]);

  const handleDelete = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    canvas.getActiveObjects().forEach((item) => canvas.remove(item));
    canvas.discardActiveObject();
    canvas.requestRenderAll();
    setMessage("Selection removed.");
  }, [setMessage]);

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
    setMessage("Clipboard content pasted.");
  }, [setMessage]);

  const handleUngroup = useCallback(() => {
    const canvas = fabricRef.current;
    const active = canvas?.getActiveObject();
    if (!canvas || !fabricMod || !active || active.type !== "group") return;

    const group = active as FabricNS.Group;
    const items = group.removeAll();
    canvas.remove(group);
    canvas.add(...items);
    const selection = new fabricMod.ActiveSelection(items, { canvas });
    canvas.setActiveObject(selection);
    canvas.requestRenderAll();
    setMessage("Group released for detailed editing.");
  }, [fabricMod, setMessage]);

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
    setMessage("Objects grouped into a reusable block.");
  }, [fabricMod, setMessage]);

  const handleBringFront = useCallback(() => {
    const canvas = fabricRef.current;
    const active = canvas?.getActiveObject();
    if (!canvas || !active) return;
    canvas.bringObjectToFront(active);
    canvas.requestRenderAll();
  }, []);

  const handleSendBack = useCallback(() => {
    const canvas = fabricRef.current;
    const active = canvas?.getActiveObject();
    if (!canvas || !active) return;
    canvas.sendObjectToBack(active);
    canvas.requestRenderAll();
  }, []);

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

  const handleApplyTitleBlock = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas || !fabricMod || !currentPage) return;
    const { width, height } = getPaperDimensions(currentPage.paperSize, currentPage.orientation);
    createOrUpdateTitleBlock(fabricMod, canvas, currentPage.titleBlockData, width, height);
    setMessage("Title block applied to the current sheet.");
  }, [currentPage, fabricMod, setMessage]);

  const handleRemoveTitleBlock = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const titleBlocks = canvas
      .getObjects()
      .filter((item) => (item as unknown as Record<string, unknown>)[TITLE_BLOCK_KEY] === true);
    titleBlocks.forEach((item) => canvas.remove(item));
    canvas.requestRenderAll();
    setMessage("Title block removed from the current sheet.");
  }, [setMessage]);

  const handleApplyPattern = useCallback(
    (patternId: PatternType, scale: number, color: string) => {
      const canvas = fabricRef.current;
      if (!canvas || !fabricMod) return;
      const active = canvas.getActiveObject();
      if (!active) {
        setMessage("Select an object before applying a fill pattern.");
        return;
      }

      if (patternId === "solid") {
        active.set({ fill: color });
        canvas.requestRenderAll();
        setMessage("Solid fill applied.");
        return;
      }

      const definition = PATTERNS.find((pattern) => pattern.id === patternId);
      if (!definition) return;

      const source = definition.generate(color, scale);
      const fill = new fabricMod.Pattern({ source, repeat: "repeat" });
      active.set({ fill });
      canvas.requestRenderAll();
      setMessage(`${definition.label} applied to selected object.`);
    },
    [fabricMod, setMessage],
  );

  const handleUpdateStroke = useCallback(
    (color: string, width: number, enabled: boolean) => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const active = canvas.getActiveObject();
      if (!active) return;

      if (!enabled) active.set({ stroke: null, strokeWidth: 0 });
      else active.set({ stroke: color, strokeWidth: width });

      canvas.requestRenderAll();
      setMessage("Stroke style updated.");
    },
    [setMessage],
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

  const handleSaveProject = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !session || !userId) {
      setMessage("Sign in with Supabase before saving projects.");
      return;
    }

    const nextPages = clonePages(syncSheetLabels(await saveCurrentPage()));
    const { data, error } = await supabase
      .from("drawing_projects")
      .upsert(
        {
          id: activeProjectId ?? undefined,
          owner_id: userId,
          name: projectName.trim() || "Untitled Engineering Package",
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
  }, [activeProjectId, projectName, saveCurrentPage, session, setMessage, userId]);

  const handleOpenProject = useCallback(
    (project: SavedProject) => {
      setPages(clonePages(syncSheetLabels(project.pages)));
      setCurrentPageIndex(0);
      setProjectName(project.name);
      setActiveProjectId(project.id);
      setLastSavedAt(project.updatedAt);
      handleSetToolMode("select");
      setMessage(`Opened project "${project.name}".`);
    },
    [handleSetToolMode, setMessage],
  );

  const handleDeleteProject = useCallback(
    async (projectId: string) => {
      const supabase = getSupabaseBrowserClient();
      const project = savedProjects.find((item) => item.id === projectId);
      if (!supabase || !project) return;
      if (!window.confirm(`Delete saved project "${project.name}"?`)) return;

      const { error } = await supabase.from("drawing_projects").delete().eq("id", projectId);
      if (error) {
        setMessage(`Could not delete project: ${error.message}`);
        return;
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
    setPages([createBlankPage(1)]);
    setCurrentPageIndex(0);
    setProjectName("Untitled Engineering Package");
    setActiveProjectId(null);
    setLastSavedAt(null);
    setZoom(0.6);
    setSelectedCount(0);
    handleSetToolMode("select");
    setMessage("Started a new drawing package.");
  }, [handleSetToolMode, setMessage]);

  const handlePublishRawSvg = useCallback(
    async (payload: {
      name: string;
      category: LibraryCategory;
      description: string;
      tags: string[];
      svg: string;
    }) => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase || session?.role !== "admin") return;
      if (!payload.svg.trim()) {
        setMessage("Paste or generate SVG code before publishing.");
        return;
      }

      const { data, error } = await supabase
        .from("drawing_library_items")
        .insert({
          name: payload.name.trim() || "Published Drawing",
          category: payload.category,
          description: payload.description.trim() || "Admin-published SVG drawing.",
          tags: payload.tags.length > 0 ? payload.tags : parseTags(payload.name),
          svg: payload.svg,
          author_id: userId,
          author_name: session.name,
        })
        .select("*")
        .single();

      if (error) {
        setMessage(`Library publish failed: ${error.message}`);
        return;
      }

      const item = mapLibraryRecord(data as LibraryItemRecord);
      setLibraryItems((previous) => mergeLibraryItems([item, ...previous.filter((entry) => entry.id !== item.id)]));
      setMessage(`Published "${item.name}" to the shared library.`);
    },
    [session, setMessage, userId],
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

      const { data, error } = await supabase
        .from("drawing_library_items")
        .insert({
          name: payload.name.trim() || `${projectName} Sheet`,
          category: payload.category,
          description: payload.description.trim() || "Canvas drawing published from the admin workspace.",
          tags: payload.tags.length > 0 ? payload.tags : parseTags(projectName),
          svg: canvas.toSVG(),
          author_id: userId,
          author_name: session.name,
        })
        .select("*")
        .single();

      if (error) {
        setMessage(`Canvas publish failed: ${error.message}`);
        return;
      }

      const item = mapLibraryRecord(data as LibraryItemRecord);
      setLibraryItems((previous) => mergeLibraryItems([item, ...previous.filter((entry) => entry.id !== item.id)]));
      setMessage(`Published canvas content as "${item.name}".`);
    },
    [projectName, session, setMessage, userId],
  );

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key.toLowerCase() === "c") {
        event.preventDefault();
        void handleCopy();
      } else if (mod && event.key.toLowerCase() === "v") {
        event.preventDefault();
        void handlePaste();
      } else if (mod && event.key.toLowerCase() === "d") {
        event.preventDefault();
        void handleDuplicate();
      } else if (mod && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void handleSaveProject();
      } else if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        handleDelete();
      } else if (event.key === "Escape") {
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
  }, [handleCopy, handleDelete, handleDuplicate, handlePaste, handleSaveProject, handleSetToolMode]);

  const contextItems = useMemo(
    () =>
      [
        {
          label: "Ungroup block",
          onClick: handleUngroup,
          visible: fabricRef.current?.getActiveObject()?.type === "group",
        },
        {
          label: "Group selection",
          onClick: handleGroup,
          visible: fabricRef.current?.getActiveObject()?.type === "activeselection",
        },
        { label: "Duplicate", onClick: () => void handleDuplicate(), visible: true },
        { label: "Copy", onClick: () => void handleCopy(), visible: true },
        { label: "Bring to front", onClick: handleBringFront, visible: true },
        { label: "Send to back", onClick: handleSendBack, visible: true },
        { label: "Delete", onClick: handleDelete, visible: true, danger: true },
      ].filter((item) => item.visible),
    [handleBringFront, handleCopy, handleDelete, handleDuplicate, handleGroup, handleSendBack, handleUngroup],
  );

  if (!booted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 text-sm font-medium text-slate-600">
        Loading drawing workspace...
      </div>
    );
  }

  if (!session || !canRenderWorkspace) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 text-sm font-medium text-slate-600">
        Loading authenticated workspace...
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-[linear-gradient(180deg,_#f8fafc,_#eef2ff)]">
      <Toolbar
        session={session}
        projectName={projectName}
        pages={pages}
        currentPageIndex={currentPageIndex}
        zoom={zoom}
        selectedCount={selectedCount}
        toolMode={toolMode}
        lastSavedAt={lastSavedAt}
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
        onAddRectangle={handleAddRectangle}
        onAddCircle={handleAddCircle}
        onAddText={handleAddText}
        onDuplicate={() => void handleDuplicate()}
        onDelete={handleDelete}
        onCopy={() => void handleCopy()}
        onPaste={() => void handlePaste()}
        onBringFront={handleBringFront}
        onSendBack={handleSendBack}
        onNewProject={handleNewProject}
        onSaveProject={() => void handleSaveProject()}
        onExportPDF={() => void handleExportPDF()}
        onLogout={() => {
          const supabase = getSupabaseBrowserClient();
          void supabase?.auth.signOut();
          setSession(null);
          setUserId(null);
          router.replace("/login");
          router.refresh();
          setMessage("Signed out of the drawing workspace.");
        }}
      />

      <div className="flex min-h-0 flex-1">
        <LeftPanel
          session={session}
          projectName={projectName}
          onProjectNameChange={setProjectName}
          libraryItems={libraryItems}
          savedProjects={savedProjects}
          activeProjectId={activeProjectId}
          selectedCount={selectedCount}
          statusMessage={statusMessage}
          titleBlockData={currentPage.titleBlockData}
          setTitleBlockData={(data) => updateCurrentPage({ titleBlockData: data })}
          onAddSvg={handleAddSvg}
          onApplyTitleBlock={handleApplyTitleBlock}
          onRemoveTitleBlock={handleRemoveTitleBlock}
          onApplyPattern={handleApplyPattern}
          onUpdateStroke={handleUpdateStroke}
          onSaveProject={() => void handleSaveProject()}
          onOpenProject={handleOpenProject}
          onDeleteProject={(projectId) => void handleDeleteProject(projectId)}
          onPublishRawSvg={(payload) => void handlePublishRawSvg(payload)}
          onPublishCanvasToLibrary={(payload) => void handlePublishCanvasToLibrary(payload)}
        />

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-1 gap-5 overflow-hidden px-5 py-5">
            <section
              ref={workspaceRef}
              className="workspace-panel flex-1 overflow-auto rounded-[32px] border border-white/60 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]"
            >
              <div className="inline-flex min-h-full min-w-full items-center justify-center p-24">
                <div className="paper-frame relative flex-shrink-0">
                  <canvas ref={canvasElRef} />
                </div>
              </div>
            </section>

            <aside className="hidden w-[300px] shrink-0 flex-col gap-4 xl:flex">
              <div className="rounded-[28px] border border-slate-200 bg-white/82 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)] backdrop-blur-xl">
                <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500">
                  Workspace Focus
                </p>
                <h3 className="mt-3 text-lg font-semibold text-slate-900">Current sheet</h3>
                <div className="mt-4 space-y-3 text-sm text-slate-600">
                  <div className="flex items-center justify-between">
                    <span>Sheet name</span>
                    <span className="font-semibold text-slate-900">{currentPage.name}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Paper</span>
                    <span className="font-semibold text-slate-900">
                      {currentPage.paperSize.toUpperCase()} · {currentPage.orientation}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Drawing No.</span>
                    <span className="font-semibold text-slate-900">{currentPage.titleBlockData.drawingNo}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Role</span>
                    <span className="font-semibold text-slate-900">{session.role}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-[28px] border border-slate-200 bg-white/82 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)] backdrop-blur-xl">
                <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500">
                  Recommended Flow
                </p>
                <ol className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
                  <li>1. Start from a blank sheet or insert a library drawing block.</li>
                  <li>2. Draft linework, add labels and dimensions, then style key elements.</li>
                  <li>3. Save the project to Supabase and export the PDF drawing set.</li>
                </ol>
              </div>
            </aside>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/80 bg-white/80 px-5 py-3 text-xs text-slate-600 backdrop-blur-xl">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                Sheet {currentPageIndex + 1} of {pages.length}
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                Tool: {toolMode}
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                Project: {projectName}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span>
                User: <strong className="text-slate-900">{session.name}</strong>
              </span>
              <span>
                Zoom: <strong className="text-slate-900">{Math.round(zoom * 100)}%</strong>
              </span>
            </div>
          </div>
        </main>
      </div>

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
    </div>
  );
}
