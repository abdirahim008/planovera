"use client";

import {
  BookmarkPlus,
  ChevronDown,
  ChevronUp,
  Crop,
  Eraser,
  ExternalLink,
  FileDown,
  FolderOpen,
  Loader2,
  MoveHorizontal,
  MoveVertical,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  Search,
  Trash2,
  Undo2,
  X,
  ZoomIn,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuid } from "uuid";

import Modal from "@/components/ui/Modal";
import { LibraryThumbnail } from "@/components/drawings/LibraryThumbnail";
import { LIBRARY_CATEGORIES, type LibraryItem } from "@/lib/drawings/appModel";
import {
  fetchCurrentUserRole,
  fetchDrawingLibrary,
  fetchLibraryItemSvg,
  fetchLibrarySvgById,
  streamLibraryThumbnails,
  subscribeLibraryChanges,
} from "@/lib/drawings/libraryBridge";
import {
  PACKAGE_SHEET_CSS,
  buildPackagePrintHtml,
  packageSheetLibraryIds,
  parseSvgViewBox,
  renderPackageSheetHtml,
  type SvgViewBox,
} from "@/lib/drawings/packageSheet";
import { sanitizeSvgMarkup } from "@/lib/drawings/svgSanitize";
import {
  emptyDrawingPackageTitleBlock,
  type DrawingErasure,
  type DrawingPackage,
  type DrawingPackageDimension,
  type DrawingPackageItem,
  type DrawingPackageOverlay,
  type DrawingPackageTitleBlock,
  type TitleBlockPreset,
} from "@/lib/supabase";
import { isSupabaseConfigured } from "@/lib/supabase-browser";
import { useAppStore } from "@/lib/store";

// The user-facing drawings module: pick ready-made drawings from the shared
// warehouse, fill in the title block, export a clean PDF package. No canvas —
// the full studio editor is an admin curation tool reached from the header.
export default function DrawingPackagesModule() {
  const project = useAppStore((state) => state.project);
  const drawingPackages = useAppStore((state) => state.drawingPackages);
  const addDrawingPackage = useAppStore((state) => state.addDrawingPackage);
  const renameDrawingPackage = useAppStore((state) => state.renameDrawingPackage);
  const deleteDrawingPackage = useAppStore((state) => state.deleteDrawingPackage);
  const addDrawingPackageItems = useAppStore((state) => state.addDrawingPackageItems);
  const updateDrawingPackageItem = useAppStore((state) => state.updateDrawingPackageItem);
  const removeDrawingPackageItem = useAppStore((state) => state.removeDrawingPackageItem);
  const moveDrawingPackageItem = useAppStore((state) => state.moveDrawingPackageItem);
  const titleBlockPresets = useAppStore((state) => state.titleBlockPresets);
  const saveTitleBlockPreset = useAppStore((state) => state.saveTitleBlockPreset);
  const deleteTitleBlockPreset = useAppStore((state) => state.deleteTitleBlockPreset);

  const projectPackages = useMemo(
    () => drawingPackages.filter((pkg) => pkg.project_id === (project?.id ?? "")),
    [drawingPackages, project?.id],
  );

  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  const selectedPackage =
    projectPackages.find((pkg) => pkg.id === selectedPackageId) ?? projectPackages[0] ?? null;

  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const selectedItem =
    selectedPackage?.items.find((item) => item.id === selectedItemId) ??
    selectedPackage?.items[0] ??
    null;

  // ── Shared library (metadata only) — loaded on demand, once. Thumbnails
  // stream in per-batch afterwards so the picker list is usable immediately. ──
  const [library, setLibrary] = useState<LibraryItem[] | null>(null);
  const libraryPromiseRef = useRef<Promise<LibraryItem[]> | null>(null);
  const mergeThumbnails = useCallback((batch: Record<string, string>) => {
    setLibrary((current) =>
      current
        ? current.map((item) => (batch[item.id] ? { ...item, thumbnail: batch[item.id] } : item))
        : current,
    );
  }, []);
  // A (re)fetched list arrives without thumbnails — keep any already loaded so
  // focus-driven refreshes don't blank the picker; changed thumbnails are
  // replaced when their stream batch lands.
  const applyLibrary = useCallback((list: LibraryItem[]) => {
    setLibrary((current) => {
      if (!current) return list;
      const known = new Map(current.map((item) => [item.id, item.thumbnail]));
      return list.map((item) =>
        item.thumbnail ? item : { ...item, thumbnail: known.get(item.id) },
      );
    });
  }, []);
  // Metadata only — thumbnails are streamed separately when the picker opens
  // (they're invisible until then, and on slow connections their batches were
  // starving the sheet SVG fetches).
  const ensureLibrary = useCallback((): Promise<LibraryItem[]> => {
    if (!libraryPromiseRef.current) {
      libraryPromiseRef.current = fetchDrawingLibrary().then((items) => {
        applyLibrary(items);
        return items;
      });
    }
    return libraryPromiseRef.current;
  }, [applyLibrary]);

  // ── Full SVGs, fetched lazily per drawing and cached for the session. ──
  const [svgCache, setSvgCache] = useState<Record<string, string | null>>({});
  const svgCacheRef = useRef(svgCache);
  svgCacheRef.current = svgCache;
  const svgInFlightRef = useRef(new Map<string, Promise<string | null>>());
  const ensureSvg = useCallback(
    (libraryItemId: string): Promise<string | null> => {
      if (libraryItemId in svgCacheRef.current) {
        return Promise.resolve(svgCacheRef.current[libraryItemId]);
      }
      const inFlight = svgInFlightRef.current.get(libraryItemId);
      if (inFlight) return inFlight;
      const request = (async () => {
        try {
          // Fast path: pull the SVG straight by id — rendering a saved sheet
          // must not wait for the whole warehouse list to arrive first.
          let svg: string | null = (await fetchLibrarySvgById(libraryItemId)) || null;
          if (!svg) {
            // Seed and demo-mode items carry their SVG inline in the list.
            const items = await ensureLibrary();
            const entry = items.find((item) => item.id === libraryItemId);
            svg = entry ? (await fetchLibraryItemSvg(entry)) || null : null;
          }
          setSvgCache((cache) => ({ ...cache, [libraryItemId]: svg }));
          return svg;
        } finally {
          svgInFlightRef.current.delete(libraryItemId);
        }
      })();
      svgInFlightRef.current.set(libraryItemId, request);
      return request;
    },
    [ensureLibrary],
  );

  // Warm the warehouse metadata as soon as the module opens, and pull every
  // sheet's SVG in parallel — so switching sheets, opening the picker, and
  // exporting are instant instead of each paying a fetch on demand.
  useEffect(() => {
    void ensureLibrary();
  }, [ensureLibrary]);
  useEffect(() => {
    selectedPackage?.items.forEach((item) =>
      packageSheetLibraryIds(item).forEach((libraryId) => void ensureSvg(libraryId)),
    );
  }, [ensureSvg, selectedPackage]);

  // ── Admin: the studio survives as a curation tool only. ──
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setIsAdmin(true); // demo mode: no roles, keep tooling reachable
      return;
    }
    void fetchCurrentUserRole().then((role) => setIsAdmin(role === "admin"));
  }, []);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  // The sheets + title-block panel floats OVER the drawing (never shrinks it)
  // and starts hidden — the drawing gets the full width by default.
  const [panelHidden, setPanelHidden] = useState(true);

  useEffect(() => {
    if (panelHidden) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPanelHidden(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panelHidden]);

  // The picker needs the warehouse list however it was opened.
  useEffect(() => {
    if (pickerOpen) void ensureLibrary();
  }, [pickerOpen, ensureLibrary]);

  // Thumbnails are fetched per row, only when the row scrolls into view —
  // never the whole warehouse up front (161 thumbnails for ~8 visible rows
  // was what made the picker heavy). Rows becoming visible around the same
  // moment are collected briefly and fetched as one query.
  const requestedThumbsRef = useRef(new Set<string>());
  const pendingThumbsRef = useRef(new Set<string>());
  const thumbTimerRef = useRef<number | null>(null);
  const requestThumbnail = useCallback(
    (id: string) => {
      if (requestedThumbsRef.current.has(id)) return;
      requestedThumbsRef.current.add(id);
      pendingThumbsRef.current.add(id);
      if (thumbTimerRef.current !== null) return;
      thumbTimerRef.current = window.setTimeout(() => {
        thumbTimerRef.current = null;
        const ids = Array.from(pendingThumbsRef.current);
        pendingThumbsRef.current.clear();
        if (ids.length > 0) void streamLibraryThumbnails(ids, mergeThumbnails);
      }, 150);
    },
    [mergeThumbnails],
  );

  // Re-pull the warehouse after an admin curates it in the studio (another tab),
  // so this module doesn't keep serving the memoized pre-edit list. Skip when the
  // library was never loaded — nothing to refresh, and no need to fetch for users
  // who never open the picker. `clearSvgCache` drops cached drawing SVGs so an
  // edited drawing re-renders; focus (a cheap fallback) only re-syncs metadata.
  const refreshLibrary = useCallback(
    (clearSvgCache: boolean) => {
      if (!libraryPromiseRef.current) return;
      // Metadata only — window focus fires this often, and re-streaming every
      // thumbnail on each refocus starved slow connections. After an admin
      // curation event the next picker open re-streams fresh thumbnails.
      const promise = fetchDrawingLibrary().then((items) => {
        applyLibrary(items);
        return items;
      });
      libraryPromiseRef.current = promise;
      if (clearSvgCache) {
        setSvgCache({});
        // Curated thumbnails may have changed — let visible rows re-request.
        requestedThumbsRef.current.clear();
      }
      void promise;
    },
    [applyLibrary],
  );

  useEffect(() => {
    const onFocus = () => refreshLibrary(false);
    window.addEventListener("focus", onFocus);
    const unsubscribe = subscribeLibraryChanges(() => refreshLibrary(true));
    return () => {
      window.removeEventListener("focus", onFocus);
      unsubscribe();
    };
  }, [refreshLibrary]);

  const makeTitleBlock = useCallback(
    (item: LibraryItem, sequence: number): DrawingPackageTitleBlock => ({
      ...emptyDrawingPackageTitleBlock(),
      projectTitle: project?.contractTitle || project?.name || "",
      client: project?.clientName || "",
      consultant: project?.consultantName || "",
      drawingTitle: item.name,
      drawingNo: String(sequence).padStart(3, "0"),
      date: new Date().toISOString().slice(0, 10),
    }),
    [project],
  );

  const handleCreatePackage = () => {
    const id = addDrawingPackage(`${project?.code || project?.name || "Project"} drawings`);
    if (id) {
      setSelectedPackageId(id);
      setPickerOpen(true);
    }
  };

  const [notice, setNotice] = useState<string | null>(null);

  // Crop-a-section flow: instead of adding the full drawing, the user drags a
  // box over a preview and only that region lands on the sheet (stored as a
  // library reference + crop window — no geometry is copied).
  const [cropTarget, setCropTarget] = useState<LibraryItem | null>(null);
  const handleCropStart = (item: LibraryItem) => {
    setPickerOpen(false);
    setCropTarget(item);
    void ensureSvg(item.id);
  };
  const handleCropConfirm = (crop: SvgViewBox) => {
    const target = selectedItem ?? selectedPackage?.items[0] ?? null;
    if (!selectedPackage || !target || !cropTarget) {
      setNotice("Add a drawing sheet first — sections are placed on top of a sheet.");
      setCropTarget(null);
      return;
    }
    updateDrawingPackageItem(selectedPackage.id, target.id, {
      overlays: [
        ...(target.overlays ?? []),
        {
          id: uuid(),
          libraryItemId: cropTarget.id,
          name: `${cropTarget.name} — section`,
          x: 32,
          y: 30,
          width: 35,
          crop,
        },
      ],
    });
    setNotice(
      `Placed a section of “${cropTarget.name}” on “${target.name}” — drag to position, resize while selected.`,
    );
    setCropTarget(null);
  };

  // Picker confirm: full drawings become sheets; parts land as overlays on
  // the currently selected sheet (staggered so several don't stack exactly).
  const handleAddFromPicker = (items: LibraryItem[]) => {
    if (!selectedPackage || items.length === 0) return;
    const drawings = items.filter((item) => item.assetType !== "object");
    const parts = items.filter((item) => item.assetType === "object");

    if (drawings.length > 0) {
      const base = selectedPackage.items.length;
      addDrawingPackageItems(
        selectedPackage.id,
        drawings.map((item, index) => ({
          libraryItemId: item.id,
          name: item.name,
          titleBlock: makeTitleBlock(item, base + index + 1),
        })),
      );
    }

    if (parts.length > 0) {
      const targetSheet = selectedItem ?? selectedPackage.items[0] ?? null;
      if (!targetSheet) {
        setNotice("Add a drawing sheet first — parts are placed on top of a sheet.");
      } else {
        const existing = targetSheet.overlays ?? [];
        const overlays: DrawingPackageOverlay[] = [
          ...existing,
          ...parts.map((part, index) => ({
            id: uuid(),
            libraryItemId: part.id,
            name: part.name,
            x: 34 + ((existing.length + index) % 4) * 7,
            y: 30 + ((existing.length + index) % 4) * 7,
            width: 25,
          })),
        ];
        updateDrawingPackageItem(selectedPackage.id, targetSheet.id, { overlays });
        setNotice(
          `Placed ${parts.length} part${parts.length === 1 ? "" : "s"} on “${targetSheet.name}” — drag to position, use the size control while selected.`,
        );
      }
    }

    setPickerOpen(false);
  };

  const handleExport = async () => {
    if (!selectedPackage || selectedPackage.items.length === 0 || exporting) return;
    setExporting(true);
    try {
      const libraryIds = Array.from(
        new Set(selectedPackage.items.flatMap((item) => packageSheetLibraryIds(item))),
      );
      const svgByLibraryId: Record<string, string | null> = Object.fromEntries(
        await Promise.all(
          libraryIds.map(async (libraryId) => [libraryId, await ensureSvg(libraryId)] as const),
        ),
      );
      const printWindow = window.open("", "_blank");
      if (!printWindow) return;
      printWindow.document.write(buildPackagePrintHtml(selectedPackage, svgByLibraryId));
      printWindow.document.close();
      setTimeout(() => {
        printWindow.focus();
        printWindow.print();
      }, 350);
    } finally {
      setExporting(false);
    }
  };

  if (!project) {
    return (
      <div className="rounded-[28px] border border-border bg-bg-surface p-8 text-center text-sm text-txt-muted">
        Open a project to prepare its drawing package.
      </div>
    );
  }

  return (
    <section className="space-y-3">
      {/* One compact command bar — package switcher, package actions and
          export in a single row so the drawing canvas gets the height. */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-border bg-bg-surface px-3 py-2">
        {projectPackages.length > 0 && (
          <select
            value={selectedPackage?.id ?? ""}
            onChange={(event) => {
              setSelectedPackageId(event.target.value);
              setSelectedItemId(null);
            }}
            className="max-w-[240px] rounded-lg border border-border bg-bg-surface px-2 py-1.5 text-xs font-semibold text-txt outline-none"
            title="Switch drawing package — every package is saved automatically"
          >
            {projectPackages.map((pkg) => (
              <option key={pkg.id} value={pkg.id}>
                {pkg.name} · {pkg.items.length} sheet{pkg.items.length === 1 ? "" : "s"}
              </option>
            ))}
          </select>
        )}
        {selectedPackage && (
          <>
            <button
              type="button"
              onClick={() => {
                const name = window.prompt("Rename package:", selectedPackage.name);
                if (name?.trim()) renameDrawingPackage(selectedPackage.id, name.trim());
              }}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-txt-muted transition hover:text-txt"
              aria-label="Rename package"
              title="Rename package"
            >
              <Pencil size={13} />
            </button>
            <button
              type="button"
              onClick={() => {
                if (
                  window.confirm(
                    `Delete "${selectedPackage.name}"? The warehouse drawings themselves are not affected.`,
                  )
                ) {
                  deleteDrawingPackage(selectedPackage.id);
                  setSelectedPackageId(null);
                }
              }}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-txt-muted transition hover:text-err"
              aria-label="Delete package"
              title="Delete package"
            >
              <Trash2 size={13} />
            </button>
          </>
        )}
        <button
          type="button"
          onClick={handleCreatePackage}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-txt-muted transition hover:text-txt"
          title="Create a new drawing package for this project"
        >
          <Plus size={13} />
          New
        </button>
        {isAdmin && (
          <a
            href="/drawings/studio"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-txt-muted transition hover:text-txt"
            title="Curate the shared warehouse (admin studio)"
          >
            Studio
            <ExternalLink size={12} />
          </a>
        )}
        {selectedPackage && (
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPanelHidden((hidden) => !hidden)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-txt-muted transition hover:text-txt"
              title={
                panelHidden
                  ? "Open the sheets and title-block panel — it floats over the drawing without shrinking it"
                  : "Close the panel (Esc works too)"
              }
            >
              {panelHidden ? <PanelLeftOpen size={13} /> : <PanelLeftClose size={13} />}
              {panelHidden ? "Show panel" : "Hide panel"}
            </button>
            <button
              type="button"
              onClick={() => {
                void ensureLibrary();
                setPickerOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-txt-muted transition hover:text-txt"
            >
              <Plus size={13} />
              Add drawings / parts
            </button>
            <button
              type="button"
              onClick={() => void handleExport()}
              disabled={selectedPackage.items.length === 0 || exporting}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-white transition hover:bg-accent-strong disabled:opacity-50"
            >
              {exporting ? <Loader2 size={13} className="animate-spin" /> : <FileDown size={13} />}
              Export PDF
            </button>
          </div>
        )}
      </div>

      {projectPackages.length === 0 ? (
        <div className="rounded-[28px] border border-border bg-bg-surface p-10 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-accent/30 bg-accent/10 text-accent">
            <FolderOpen size={20} />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-txt">No drawing package yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-txt-muted">
            A package is a set of standard drawings from the shared warehouse with this
            project&apos;s details on the title block — ready to print or attach.
          </p>
          <button
            type="button"
            onClick={handleCreatePackage}
            className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2.5 text-sm font-bold text-white transition hover:bg-accent-strong"
          >
            <Plus size={15} />
            Create the first package
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {selectedPackage && (
            <div className="space-y-3">
              {notice ? (
                <div className="flex items-center justify-between gap-2 rounded-xl border border-accent/30 bg-accent/10 px-3 py-2 text-xs text-accent">
                  <span>{notice}</span>
                  <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss notice">
                    ✕
                  </button>
                </div>
              ) : null}

              {selectedPackage.items.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-bg-surface p-8 text-center text-sm text-txt-muted">
                  No drawings in this package yet — click “Add drawings” to pick from the
                  warehouse.
                </div>
              ) : (
                <div className="relative">
                  {/* Sheet list + title-block form — floats over the canvas so
                      the drawing never gives up width; close via ✕, Esc or the
                      toggle button. */}
                  <div
                    className={
                      panelHidden
                        ? "hidden"
                        : "absolute left-0 top-0 z-20 max-h-full w-[360px] max-w-[calc(100%-0.75rem)] space-y-2 overflow-y-auto rounded-2xl border border-border bg-bg-surface p-3 shadow-[0_18px_50px_rgba(15,23,42,0.18)]"
                    }
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-txt-dim">
                        Sheets &amp; title block
                      </span>
                      <button
                        type="button"
                        onClick={() => setPanelHidden(true)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-txt-muted transition hover:bg-bg-hover hover:text-txt"
                        aria-label="Close panel"
                        title="Close (Esc)"
                      >
                        <X size={14} />
                      </button>
                    </div>
                    {selectedPackage.items.map((item, index) => (
                      <SheetRow
                        key={item.id}
                        item={item}
                        index={index}
                        count={selectedPackage.items.length}
                        active={item.id === selectedItem?.id}
                        onSelect={() => setSelectedItemId(item.id)}
                        onMove={(direction) =>
                          moveDrawingPackageItem(selectedPackage.id, item.id, direction)
                        }
                        onRemove={() => removeDrawingPackageItem(selectedPackage.id, item.id)}
                      />
                    ))}

                    {selectedItem && (
                      <TitleBlockForm
                        key={selectedItem.id}
                        item={selectedItem}
                        presets={titleBlockPresets}
                        onSavePreset={saveTitleBlockPreset}
                        onDeletePreset={deleteTitleBlockPreset}
                        onCommit={(titleBlock) =>
                          updateDrawingPackageItem(selectedPackage.id, selectedItem.id, {
                            titleBlock,
                          })
                        }
                        onApplyToAll={(titleBlock) => {
                          selectedPackage.items.forEach((item) => {
                            if (item.id === selectedItem.id) return;
                            updateDrawingPackageItem(selectedPackage.id, item.id, {
                              titleBlock: {
                                ...item.titleBlock,
                                projectTitle: titleBlock.projectTitle,
                                client: titleBlock.client,
                                consultant: titleBlock.consultant,
                                date: titleBlock.date,
                                drawnBy: titleBlock.drawnBy,
                                checkedBy: titleBlock.checkedBy,
                                approvedBy: titleBlock.approvedBy,
                                revision: titleBlock.revision,
                                status: titleBlock.status,
                              },
                            });
                          });
                        }}
                      />
                    )}
                  </div>

                  {/* Sheet preview — exact same markup as the PDF export */}
                  <div>
                    {selectedItem && (
                      <SheetPreview
                        item={selectedItem}
                        svgByLibraryId={svgCache}
                        index={selectedPackage.items.findIndex((i) => i.id === selectedItem.id)}
                        count={selectedPackage.items.length}
                        onAdjust={(updates) =>
                          updateDrawingPackageItem(selectedPackage.id, selectedItem.id, updates)
                        }
                        onUpdateOverlay={(overlayId, updates) =>
                          updateDrawingPackageItem(selectedPackage.id, selectedItem.id, {
                            overlays: (selectedItem.overlays ?? []).map((overlay) =>
                              overlay.id === overlayId ? { ...overlay, ...updates } : overlay,
                            ),
                          })
                        }
                        onRemoveOverlay={(overlayId) =>
                          updateDrawingPackageItem(selectedPackage.id, selectedItem.id, {
                            overlays: (selectedItem.overlays ?? []).filter(
                              (overlay) => overlay.id !== overlayId,
                            ),
                            // A part's attached dimensions go with it.
                            dimensions: (selectedItem.dimensions ?? []).filter(
                              (dim) => dim.overlayId !== overlayId,
                            ),
                          })
                        }
                        onAddErasure={(overlayId, patch) => {
                          if (overlayId === null) {
                            updateDrawingPackageItem(selectedPackage.id, selectedItem.id, {
                              erasures: [...(selectedItem.erasures ?? []), patch],
                            });
                            return;
                          }
                          updateDrawingPackageItem(selectedPackage.id, selectedItem.id, {
                            overlays: (selectedItem.overlays ?? []).map((overlay) =>
                              overlay.id === overlayId
                                ? { ...overlay, erasures: [...(overlay.erasures ?? []), patch] }
                                : overlay,
                            ),
                          });
                        }}
                        onUndoErasure={(overlayId) => {
                          if (overlayId === null) {
                            updateDrawingPackageItem(selectedPackage.id, selectedItem.id, {
                              erasures: (selectedItem.erasures ?? []).slice(0, -1),
                            });
                            return;
                          }
                          updateDrawingPackageItem(selectedPackage.id, selectedItem.id, {
                            overlays: (selectedItem.overlays ?? []).map((overlay) =>
                              overlay.id === overlayId
                                ? { ...overlay, erasures: (overlay.erasures ?? []).slice(0, -1) }
                                : overlay,
                            ),
                          });
                        }}
                        onAddDimension={(dimension) =>
                          updateDrawingPackageItem(selectedPackage.id, selectedItem.id, {
                            dimensions: [...(selectedItem.dimensions ?? []), dimension],
                          })
                        }
                        onUpdateDimension={(dimId, updates) =>
                          updateDrawingPackageItem(selectedPackage.id, selectedItem.id, {
                            dimensions: (selectedItem.dimensions ?? []).map((dim) =>
                              dim.id === dimId ? { ...dim, ...updates } : dim,
                            ),
                          })
                        }
                        onRemoveDimension={(dimId) =>
                          updateDrawingPackageItem(selectedPackage.id, selectedItem.id, {
                            dimensions: (selectedItem.dimensions ?? []).filter(
                              (dim) => dim.id !== dimId,
                            ),
                          })
                        }
                      />
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <DrawingPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        library={library}
        onConfirm={handleAddFromPicker}
        onCrop={handleCropStart}
        onRequestThumbnail={requestThumbnail}
      />

      {cropTarget && (
        <CropDrawingModal
          item={cropTarget}
          svg={svgCache[cropTarget.id]}
          onClose={() => setCropTarget(null)}
          onConfirm={handleCropConfirm}
        />
      )}
    </section>
  );
}

function SheetRow({
  item,
  index,
  count,
  active,
  onSelect,
  onMove,
  onRemove,
}: {
  item: DrawingPackageItem;
  index: number;
  count: number;
  active: boolean;
  onSelect: () => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  return (
    <div
      className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 transition ${
        active ? "border-accent/60 bg-accent/10" : "border-border bg-bg-surface hover:border-accent/30"
      }`}
      onClick={onSelect}
    >
      <span className="w-6 shrink-0 text-center text-[11px] font-bold text-txt-muted">
        {index + 1}
      </span>
      <span className="min-w-0 flex-1 truncate text-xs font-semibold text-txt">{item.name}</span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onMove(-1);
        }}
        disabled={index === 0}
        className="text-txt-muted transition hover:text-txt disabled:opacity-30"
        aria-label="Move up"
      >
        <ChevronUp size={14} />
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onMove(1);
        }}
        disabled={index === count - 1}
        className="text-txt-muted transition hover:text-txt disabled:opacity-30"
        aria-label="Move down"
      >
        <ChevronDown size={14} />
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="text-txt-muted transition hover:text-red-400"
        aria-label="Remove sheet"
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}

const TITLE_BLOCK_FIELDS: Array<{ key: keyof DrawingPackageTitleBlock; label: string }> = [
  { key: "projectTitle", label: "Project" },
  { key: "client", label: "Client" },
  { key: "consultant", label: "Consultant" },
  { key: "drawingTitle", label: "Drawing title" },
  { key: "drawingNo", label: "Drawing no" },
  { key: "scale", label: "Scale" },
  { key: "date", label: "Date" },
  { key: "drawnBy", label: "Drawn by" },
  { key: "checkedBy", label: "Checked by" },
  { key: "approvedBy", label: "Approved by" },
  { key: "revision", label: "Revision" },
  { key: "status", label: "Status" },
];

// Local draft committed on blur — every store write re-serializes the whole
// persisted workspace, so per-keystroke commits are deliberately avoided.
// Applying a preset fills the RECURRING fields; the sheet keeps its own
// drawing title, number and date.
const PRESET_EXCLUDED_FIELDS: Array<keyof DrawingPackageTitleBlock> = [
  "drawingTitle",
  "drawingNo",
  "date",
];

function TitleBlockForm({
  item,
  presets,
  onSavePreset,
  onDeletePreset,
  onCommit,
  onApplyToAll,
}: {
  item: DrawingPackageItem;
  presets: TitleBlockPreset[];
  onSavePreset: (name: string, titleBlock: DrawingPackageTitleBlock) => void;
  onDeletePreset: (id: string) => void;
  onCommit: (titleBlock: DrawingPackageTitleBlock) => void;
  onApplyToAll: (titleBlock: DrawingPackageTitleBlock) => void;
}) {
  const [draft, setDraft] = useState<DrawingPackageTitleBlock>(item.titleBlock);
  useEffect(() => setDraft(item.titleBlock), [item.titleBlock]);
  // Collapsed by default — drawing space wins; the header shows the drawing
  // number and title, one click expands the form when it needs editing.
  const [open, setOpen] = useState(false);
  const [presetId, setPresetId] = useState("");

  const commit = (next: DrawingPackageTitleBlock) => {
    if (JSON.stringify(next) !== JSON.stringify(item.titleBlock)) onCommit(next);
  };

  const applyPreset = (id: string) => {
    setPresetId(id);
    const preset = presets.find((entry) => entry.id === id);
    if (!preset) return;
    const next = { ...draft };
    (Object.keys(preset.titleBlock) as Array<keyof DrawingPackageTitleBlock>).forEach((key) => {
      if (!PRESET_EXCLUDED_FIELDS.includes(key)) next[key] = preset.titleBlock[key];
    });
    setDraft(next);
    commit(next);
  };

  const handleSavePreset = () => {
    const name = window.prompt(
      "Name this title block (saving under an existing name replaces it):",
      draft.projectTitle || "My title block",
    );
    if (name?.trim()) onSavePreset(name, draft);
  };

  return (
    <div className="rounded-2xl border border-border bg-bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.2em] text-accent"
          title={open ? "Collapse the title block to save space" : "Expand the title block"}
        >
          {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          Title block
        </button>
        {!open ? (
          <span className="min-w-0 truncate text-[11px] text-txt-muted">
            {[item.titleBlock.drawingNo, item.titleBlock.drawingTitle]
              .filter(Boolean)
              .join(" · ") || "collapsed"}
          </span>
        ) : (
          <button
            type="button"
            onClick={() => onApplyToAll(draft)}
            className="rounded-md border border-border px-2 py-1 text-[11px] font-semibold text-txt-muted transition hover:text-txt"
            title="Copy the shared fields (project, client, consultant, date, signatures, revision, status) to every sheet in the package"
          >
            Apply to all sheets
          </button>
        )}
      </div>

      {open && (
        <>
          <div className="mt-3 flex items-center gap-1.5">
            <select
              value={presetId}
              onChange={(event) => applyPreset(event.target.value)}
              className="min-w-0 flex-1 rounded-md border border-border bg-bg-surface px-2 py-1.5 text-xs text-txt outline-none"
              title="Fill the recurring fields from a saved title block (drawing title, number and date stay as they are)"
            >
              <option value="">Apply saved title block…</option>
              {presets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleSavePreset}
              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1.5 text-[11px] font-semibold text-txt-muted transition hover:text-txt"
              title="Save this title block so you can re-apply it on any sheet without retyping"
            >
              <BookmarkPlus size={12} /> Save
            </button>
            {presetId ? (
              <button
                type="button"
                onClick={() => {
                  onDeletePreset(presetId);
                  setPresetId("");
                }}
                className="inline-flex shrink-0 items-center justify-center rounded-md border border-err/40 p-1.5 text-err transition hover:bg-err/10"
                title="Delete the selected saved title block"
                aria-label="Delete saved title block"
              >
                <Trash2 size={12} />
              </button>
            ) : null}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            {TITLE_BLOCK_FIELDS.map(({ key, label }) => (
              <label key={key} className="block">
                <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-txt-muted">
                  {label}
                </span>
                <input
                  data-tb-field={key}
                  value={draft[key]}
                  onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                  onBlur={(e) => commit({ ...draft, [key]: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                  className="mt-0.5 w-full rounded-md border border-border bg-transparent px-2 py-1.5 text-xs text-txt outline-none focus:border-accent/60"
                />
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const ZOOM_STEP = 0.1;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const PAN_LIMIT = 80;

const clampPan = (value: number) => Math.min(Math.max(value, -PAN_LIMIT), PAN_LIMIT);

const OVERLAY_WIDTH_STEP = 5;
const OVERLAY_WIDTH_MIN = 5;
const OVERLAY_WIDTH_MAX = 100;

// View-only magnifier: lets the user look closer to erase small text or
// dimensions precisely. Never persisted and never part of the printed sheet —
// unlike item.zoom, which changes the document layout.
const VIEW_ZOOM_MAX = 4;
const VIEW_ZOOM_STEP = 0.5;

type SheetView = { z: number; x: number; y: number };

type SheetDrag =
  | {
      kind: "pan";
      startX: number;
      startY: number;
      baseX: number;
      baseY: number;
      lastX: number;
      lastY: number;
    }
  | {
      kind: "overlay";
      overlayId: string;
      startX: number;
      startY: number;
      baseX: number;
      baseY: number;
      lastX: number;
      lastY: number;
      moved: boolean;
    }
  | {
      kind: "viewpan";
      startX: number;
      startY: number;
      baseX: number;
      baseY: number;
      lastX: number;
      lastY: number;
    }
  | {
      kind: "dimension";
      dimId: string;
      /** part the dimension is attached to — drag deltas are % of its box */
      overlayId: string | null;
      /** move the whole line, or stretch one of its ends */
      mode: "move" | "start" | "end";
      horizontal: boolean;
      startX: number;
      startY: number;
      baseX: number;
      baseY: number;
      baseLength: number;
      lastX: number;
      lastY: number;
      lastLength: number;
      moved: boolean;
    };

const DIM_MIN_LENGTH = 3;
const DIM_MAX_LENGTH = 110;
const DIM_SCALE_STEP = 0.25;
const DIM_SCALE_MIN = 0.5;
const DIM_SCALE_MAX = 3;

const clampDimPos = (value: number) => Math.min(Math.max(value, -10), 105);
const clampDimLength = (value: number) =>
  Math.min(Math.max(value, DIM_MIN_LENGTH), DIM_MAX_LENGTH);

function SheetPreview({
  item,
  svgByLibraryId,
  index,
  count,
  onAdjust,
  onUpdateOverlay,
  onRemoveOverlay,
  onAddErasure,
  onUndoErasure,
  onAddDimension,
  onUpdateDimension,
  onRemoveDimension,
}: {
  item: DrawingPackageItem;
  svgByLibraryId: Record<string, string | null>;
  index: number;
  count: number;
  onAdjust: (updates: Partial<Pick<DrawingPackageItem, "zoom" | "panX" | "panY">>) => void;
  onUpdateOverlay: (overlayId: string, updates: Partial<DrawingPackageOverlay>) => void;
  onRemoveOverlay: (overlayId: string) => void;
  onAddErasure: (overlayId: string | null, patch: DrawingErasure) => void;
  onUndoErasure: (overlayId: string | null) => void;
  onAddDimension: (dimension: DrawingPackageDimension) => void;
  onUpdateDimension: (dimId: string, updates: Partial<DrawingPackageDimension>) => void;
  onRemoveDimension: (dimId: string) => void;
}) {
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);
  const [selectedDimensionId, setSelectedDimensionId] = useState<string | null>(null);
  const [eraserOn, setEraserOn] = useState(false);
  // Live erase-drag rectangle (container coordinates, visual only). The
  // committed patch is computed in the target SVG's own units on release.
  const [eraseRect, setEraseRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const eraseDragRef = useRef<{ overlayId: string | null; startX: number; startY: number } | null>(null);
  const eraseHistoryRef = useRef<Array<string | null>>([]);
  const [eraseCount, setEraseCount] = useState(0); // enables/disables Undo
  // View-only magnifier state (px translate + scale of the sheet content).
  const [view, setView] = useState<SheetView>({ z: 1, x: 0, y: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const viewWrapRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    setSelectedOverlayId(null);
    setSelectedDimensionId(null);
    setEraserOn(false);
    setEraseRect(null);
    eraseDragRef.current = null;
    eraseHistoryRef.current = [];
    setEraseCount(0);
    setView({ z: 1, x: 0, y: 0 });
  }, [item.id]);
  const selectedOverlay =
    (item.overlays ?? []).find((overlay) => overlay.id === selectedOverlayId) ?? null;
  const selectedDimension =
    (item.dimensions ?? []).find((dim) => dim.id === selectedDimensionId) ?? null;

  const baseSvg = svgByLibraryId[item.libraryItemId];
  const html = useMemo(
    () =>
      renderPackageSheetHtml(item, svgByLibraryId, index, count, {
        selectedOverlayId,
        selectedDimensionId,
      }),
    [item, svgByLibraryId, index, count, selectedOverlayId, selectedDimensionId],
  );

  const zoom = Math.min(Math.max(item.zoom ?? 1, ZOOM_MIN), ZOOM_MAX);
  const panX = clampPan(item.panX ?? 0);
  const panY = clampPan(item.panY ?? 0);
  const step = (direction: -1 | 1) => {
    const next = Math.min(Math.max(zoom + direction * ZOOM_STEP, ZOOM_MIN), ZOOM_MAX);
    if (next !== zoom) onAdjust({ zoom: Number(next.toFixed(2)) });
  };

  // Drag mechanics: pointer-down on a part drags the part; on empty sheet it
  // pans the base drawing. While dragging, the position is written straight
  // onto the DOM node (re-rendering the sheet HTML per pointer-move would
  // re-parse the SVG each frame); the store commit happens once, on release.
  // A press-without-movement on a part selects it.
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<SheetDrag | null>(null);

  // Keep the magnified content covering the frame — no blank gutters.
  const clampView = (z: number, x: number, y: number): SheetView => {
    const el = containerRef.current;
    const w = el?.clientWidth ?? 0;
    const h = el?.clientHeight ?? 0;
    return {
      z,
      x: Math.min(Math.max(x, w * (1 - z)), 0),
      y: Math.min(Math.max(y, h * (1 - z)), 0),
    };
  };

  const zoomViewTo = (nz: number, anchorX: number, anchorY: number) => {
    const { z, x, y } = viewRef.current;
    if (nz === z) return;
    // Keep the sheet point under the anchor stationary while scaling.
    const next = clampView(nz, anchorX - ((anchorX - x) * nz) / z, anchorY - ((anchorY - y) * nz) / z);
    // Update the ref immediately so rapid button clicks compound on the
    // latest value, not on a stale pre-render one.
    viewRef.current = next;
    setView(next);
  };

  const stepView = (direction: -1 | 1) => {
    const el = containerRef.current;
    const nz = Math.min(Math.max(viewRef.current.z + direction * VIEW_ZOOM_STEP, 1), VIEW_ZOOM_MAX);
    zoomViewTo(nz, (el?.clientWidth ?? 0) / 2, (el?.clientHeight ?? 0) / 2);
  };


  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!baseSvg || event.button !== 0) return;
    const overlayEl = (event.target as Element).closest<HTMLElement>(".dp-overlay");
    const overlayId = overlayEl?.dataset.overlayId;

    if (eraserOn) {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      eraseDragRef.current = {
        overlayId: overlayId ?? null,
        startX: event.clientX,
        startY: event.clientY,
      };
      setEraseRect({
        left: event.clientX - rect.left,
        top: event.clientY - rect.top,
        width: 0,
        height: 0,
      });
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        /* enhancement only */
      }
      return;
    }

    // Dimension hit: middle drags the whole line, the last ~16px of each end
    // stretches that end (length only — the 1px stroke never changes).
    const dimEl = (event.target as Element).closest<HTMLElement>(".dp-dim");
    const dim = dimEl
      ? (item.dimensions ?? []).find((entry) => entry.id === dimEl.dataset.dimId)
      : undefined;
    if (dimEl && dim) {
      const rect = dimEl.getBoundingClientRect();
      const horizontal = dim.orientation === "horizontal";
      const along = horizontal ? event.clientX - rect.left : event.clientY - rect.top;
      const extent = horizontal ? rect.width : rect.height;
      const grip = Math.min(16, extent * 0.25);
      const mode: "move" | "start" | "end" =
        along <= grip ? "start" : along >= extent - grip ? "end" : "move";
      dragRef.current = {
        kind: "dimension",
        dimId: dim.id,
        overlayId: dim.overlayId ?? null,
        mode,
        horizontal,
        startX: event.clientX,
        startY: event.clientY,
        baseX: dim.x,
        baseY: dim.y,
        baseLength: dim.length,
        lastX: dim.x,
        lastY: dim.y,
        lastLength: dim.length,
        moved: false,
      };
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        /* enhancement only */
      }
      return;
    }

    const overlay = overlayId
      ? (item.overlays ?? []).find((entry) => entry.id === overlayId)
      : undefined;
    dragRef.current = overlay
      ? {
          kind: "overlay",
          overlayId: overlay.id,
          startX: event.clientX,
          startY: event.clientY,
          baseX: overlay.x,
          baseY: overlay.y,
          lastX: overlay.x,
          lastY: overlay.y,
          moved: false,
        }
      : view.z > 1
        ? {
            // While magnified, dragging the sheet moves the view — the printed
            // layout must never shift as a side effect of looking closer.
            kind: "viewpan",
            startX: event.clientX,
            startY: event.clientY,
            baseX: view.x,
            baseY: view.y,
            lastX: view.x,
            lastY: view.y,
          }
        : {
            kind: "pan",
            startX: event.clientX,
            startY: event.clientY,
            baseX: panX,
            baseY: panY,
            lastX: panX,
            lastY: panY,
          };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* pointer capture is an enhancement — dragging still works without it */
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const eraseDrag = eraseDragRef.current;
    if (eraseDrag) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setEraseRect({
        left: Math.min(eraseDrag.startX, event.clientX) - rect.left,
        top: Math.min(eraseDrag.startY, event.clientY) - rect.top,
        width: Math.abs(event.clientX - eraseDrag.startX),
        height: Math.abs(event.clientY - eraseDrag.startY),
      });
      return;
    }

    const drag = dragRef.current;
    const container = containerRef.current;
    if (!drag || !container) return;

    if (drag.kind === "viewpan") {
      const next = clampView(
        view.z,
        drag.baseX + (event.clientX - drag.startX),
        drag.baseY + (event.clientY - drag.startY),
      );
      drag.lastX = next.x;
      drag.lastY = next.y;
      const wrap = viewWrapRef.current;
      if (wrap) wrap.style.transform = `translate(${next.x}px, ${next.y}px) scale(${view.z})`;
      return;
    }

    const area = container.querySelector<HTMLElement>(".dp-drawing");
    if (!area) return;
    const rect = area.getBoundingClientRect();
    const dxPct = ((event.clientX - drag.startX) / rect.width) * 100;
    const dyPct = ((event.clientY - drag.startY) / rect.height) * 100;

    if (drag.kind === "pan") {
      const zoomEl = container.querySelector<HTMLElement>(".dp-zoom");
      if (!zoomEl) return;
      drag.lastX = clampPan(drag.baseX + dxPct);
      drag.lastY = clampPan(drag.baseY + dyPct);
      zoomEl.style.transform = `translate(${drag.lastX.toFixed(1)}%, ${drag.lastY.toFixed(1)}%) scale(${zoom.toFixed(2)})`;
      return;
    }

    if (drag.kind === "dimension") {
      if (Math.abs(event.clientX - drag.startX) + Math.abs(event.clientY - drag.startY) > 3) {
        drag.moved = true;
      }
      const dimEl = container.querySelector<HTMLElement>(`[data-dim-id="${drag.dimId}"]`);
      if (!dimEl) return;
      // A part-attached dimension lives in the part's own percentage space,
      // so its drag deltas are measured against the part's box, not the sheet.
      let dx = dxPct;
      let dy = dyPct;
      if (drag.overlayId) {
        const overlayEl = container.querySelector<HTMLElement>(
          `[data-overlay-id="${drag.overlayId}"]`,
        );
        if (!overlayEl) return;
        const overlayRect = overlayEl.getBoundingClientRect();
        dx = ((event.clientX - drag.startX) / overlayRect.width) * 100;
        dy = ((event.clientY - drag.startY) / overlayRect.height) * 100;
      }
      const dAxis = drag.horizontal ? dx : dy;
      if (drag.mode === "move") {
        drag.lastX = clampDimPos(drag.baseX + dx);
        drag.lastY = clampDimPos(drag.baseY + dy);
      } else if (drag.mode === "end") {
        drag.lastLength = clampDimLength(drag.baseLength + dAxis);
      } else {
        // Stretching the start end keeps the far end fixed.
        const shift = Math.min(Math.max(dAxis, -105), drag.baseLength - DIM_MIN_LENGTH);
        drag.lastLength = clampDimLength(drag.baseLength - shift);
        if (drag.horizontal) drag.lastX = clampDimPos(drag.baseX + shift);
        else drag.lastY = clampDimPos(drag.baseY + shift);
      }
      dimEl.style.left = `${drag.lastX.toFixed(1)}%`;
      dimEl.style.top = `${drag.lastY.toFixed(1)}%`;
      if (drag.horizontal) dimEl.style.width = `${drag.lastLength.toFixed(1)}%`;
      else dimEl.style.height = `${drag.lastLength.toFixed(1)}%`;
      return;
    }

    if (Math.abs(event.clientX - drag.startX) + Math.abs(event.clientY - drag.startY) > 3) {
      drag.moved = true;
    }
    const overlayEl = container.querySelector<HTMLElement>(
      `[data-overlay-id="${drag.overlayId}"]`,
    );
    if (!overlayEl) return;
    drag.lastX = Math.min(Math.max(drag.baseX + dxPct, -20), 95);
    drag.lastY = Math.min(Math.max(drag.baseY + dyPct, -20), 95);
    overlayEl.style.left = `${drag.lastX.toFixed(1)}%`;
    overlayEl.style.top = `${drag.lastY.toFixed(1)}%`;
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const eraseDrag = eraseDragRef.current;
    if (eraseDrag) {
      eraseDragRef.current = null;
      setEraseRect(null);
      const container = containerRef.current;
      if (!container) return;
      // Map both corners into the target SVG's own units via its screen CTM —
      // this accounts for zoom/pan transforms, meet-fit letterboxing and any
      // crop viewBox in one step.
      const svgEl = eraseDrag.overlayId
        ? container.querySelector<SVGSVGElement>(
            `[data-overlay-id="${eraseDrag.overlayId}"] svg`,
          )
        : container.querySelector<SVGSVGElement>(".dp-zoom svg");
      const ctm = svgEl?.getScreenCTM();
      if (!svgEl || !ctm) return;
      if (
        Math.abs(event.clientX - eraseDrag.startX) < 4 ||
        Math.abs(event.clientY - eraseDrag.startY) < 4
      ) {
        return; // too small to be a deliberate patch
      }
      const inverse = ctm.inverse();
      const a = new DOMPoint(eraseDrag.startX, eraseDrag.startY).matrixTransform(inverse);
      const b = new DOMPoint(event.clientX, event.clientY).matrixTransform(inverse);
      onAddErasure(eraseDrag.overlayId, {
        x: Math.min(a.x, b.x),
        y: Math.min(a.y, b.y),
        width: Math.abs(b.x - a.x),
        height: Math.abs(b.y - a.y),
      });
      eraseHistoryRef.current.push(eraseDrag.overlayId);
      setEraseCount(eraseHistoryRef.current.length);
      return;
    }

    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    if (drag.kind === "viewpan") {
      if (drag.lastX !== drag.baseX || drag.lastY !== drag.baseY) {
        setView((current) => ({ ...current, x: drag.lastX, y: drag.lastY }));
      } else {
        setSelectedOverlayId(null);
        setSelectedDimensionId(null);
      }
      return;
    }
    if (drag.kind === "pan") {
      if (drag.lastX !== drag.baseX || drag.lastY !== drag.baseY) {
        onAdjust({ panX: Number(drag.lastX.toFixed(1)), panY: Number(drag.lastY.toFixed(1)) });
      } else {
        setSelectedOverlayId(null);
        setSelectedDimensionId(null);
      }
      return;
    }
    if (drag.kind === "dimension") {
      if (drag.moved) {
        setSelectedDimensionId(drag.dimId);
        onUpdateDimension(drag.dimId, {
          x: Number(drag.lastX.toFixed(1)),
          y: Number(drag.lastY.toFixed(1)),
          length: Number(drag.lastLength.toFixed(1)),
        });
      } else {
        setSelectedDimensionId((current) => (current === drag.dimId ? null : drag.dimId));
        setSelectedOverlayId(null);
      }
      return;
    }
    if (drag.moved) {
      setSelectedOverlayId(drag.overlayId);
      onUpdateOverlay(drag.overlayId, {
        x: Number(drag.lastX.toFixed(1)),
        y: Number(drag.lastY.toFixed(1)),
      });
    } else {
      setSelectedOverlayId((current) => (current === drag.overlayId ? null : drag.overlayId));
    }
  };

  const stepOverlayWidth = (direction: -1 | 1) => {
    if (!selectedOverlay) return;
    const next = Math.min(
      Math.max(selectedOverlay.width + direction * OVERLAY_WIDTH_STEP, OVERLAY_WIDTH_MIN),
      OVERLAY_WIDTH_MAX,
    );
    if (next !== selectedOverlay.width) onUpdateOverlay(selectedOverlay.id, { width: next });
  };

  const addDimension = (orientation: "horizontal" | "vertical") => {
    // With a part selected the dimension attaches to it (coordinates become
    // percentages of the part's box, spanning most of it by default), so it
    // moves and resizes with the part from then on.
    const attached = selectedOverlay !== null;
    const dimension: DrawingPackageDimension = {
      id: uuid(),
      orientation,
      x: attached ? (orientation === "horizontal" ? 10 : 50) : orientation === "horizontal" ? 32 : 50,
      y: attached ? (orientation === "horizontal" ? 50 : 10) : orientation === "horizontal" ? 50 : 32,
      length: attached ? 80 : 30,
      text: "",
      scale: 1,
      overlayId: attached ? selectedOverlay.id : null,
    };
    onAddDimension(dimension);
    setSelectedDimensionId(dimension.id);
    setSelectedOverlayId(null);
    setEraserOn(false);
  };

  const stepDimensionScale = (direction: -1 | 1) => {
    if (!selectedDimension) return;
    const current = selectedDimension.scale ?? 1;
    const next = Math.min(
      Math.max(current + direction * DIM_SCALE_STEP, DIM_SCALE_MIN),
      DIM_SCALE_MAX,
    );
    if (next !== current) onUpdateDimension(selectedDimension.id, { scale: next });
  };

  const adjusted = zoom !== 1 || panX !== 0 || panY !== 0;

  return (
    <div className="rounded-2xl border border-border bg-bg-surface p-3">
      {/* Sheet tools, organised into labelled groups. */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-lg border border-border px-1.5 py-1">
          <span className="px-1 text-[9px] font-bold uppercase tracking-[0.1em] text-txt-dim">
            Size
          </span>
          <button
            type="button"
            onClick={() => step(-1)}
            disabled={zoom <= ZOOM_MIN}
            className="flex h-6 w-6 items-center justify-center rounded-md border border-border text-sm font-bold text-txt-muted transition hover:text-txt disabled:opacity-30"
            aria-label="Reduce drawing"
          >
            −
          </button>
          <span className="w-10 text-center text-xs font-semibold tabular-nums text-txt">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => step(1)}
            disabled={zoom >= ZOOM_MAX}
            className="flex h-6 w-6 items-center justify-center rounded-md border border-border text-sm font-bold text-txt-muted transition hover:text-txt disabled:opacity-30"
            aria-label="Enlarge drawing"
          >
            +
          </button>
          {adjusted && (
            <button
              type="button"
              onClick={() => onAdjust({ zoom: 1, panX: 0, panY: 0 })}
              className="rounded-md border border-border px-1.5 py-0.5 text-[10px] font-semibold text-txt-muted transition hover:text-txt"
            >
              Reset
            </button>
          )}
        </div>

        <div
          className="flex items-center gap-1 rounded-lg border border-border px-1.5 py-1"
          title="Magnify the view to inspect or erase small text precisely — never changes the printed sheet. Drag the sheet to move around while magnified."
        >
          <span className="inline-flex items-center gap-1 px-1 text-[9px] font-bold uppercase tracking-[0.1em] text-txt-dim">
            <ZoomIn size={11} /> Magnify
          </span>
          <button
            type="button"
            onClick={() => stepView(-1)}
            disabled={view.z <= 1}
            className="flex h-6 w-6 items-center justify-center rounded-md border border-border text-sm font-bold text-txt-muted transition hover:text-txt disabled:opacity-30"
            aria-label="Magnify less (view only)"
          >
            −
          </button>
          <span className="w-10 text-center text-xs font-semibold tabular-nums text-txt">
            {Math.round(view.z * 100)}%
          </span>
          <button
            type="button"
            onClick={() => stepView(1)}
            disabled={view.z >= VIEW_ZOOM_MAX}
            className="flex h-6 w-6 items-center justify-center rounded-md border border-border text-sm font-bold text-txt-muted transition hover:text-txt disabled:opacity-30"
            aria-label="Magnify more (view only)"
          >
            +
          </button>
          {view.z > 1 && (
            <button
              type="button"
              onClick={() => setView({ z: 1, x: 0, y: 0 })}
              className="rounded-md border border-border px-1.5 py-0.5 text-[10px] font-semibold text-txt-muted transition hover:text-txt"
            >
              Fit
            </button>
          )}
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-border px-1.5 py-1">
          <span className="px-1 text-[9px] font-bold uppercase tracking-[0.1em] text-txt-dim">
            Dimension
          </span>
          <button
            type="button"
            onClick={() => addDimension("horizontal")}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] font-semibold text-txt-muted transition hover:text-txt"
            title="Add a horizontal dimension line — drag its middle to move it, drag an end to stretch it. Select a part first to attach the dimension to it, so it moves and resizes with the part."
          >
            <MoveHorizontal size={12} /> H
          </button>
          <button
            type="button"
            onClick={() => addDimension("vertical")}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] font-semibold text-txt-muted transition hover:text-txt"
            title="Add a vertical dimension line — drag its middle to move it, drag an end to stretch it. Select a part first to attach the dimension to it, so it moves and resizes with the part."
          >
            <MoveVertical size={12} /> V
          </button>
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-border px-1.5 py-1">
          <span className="px-1 text-[9px] font-bold uppercase tracking-[0.1em] text-txt-dim">
            Clean up
          </span>
          <button
            type="button"
            onClick={() => setEraserOn((on) => !on)}
            className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-semibold transition ${
              eraserOn
                ? "border-accent bg-accent/10 text-accent"
                : "border-border text-txt-muted hover:text-txt"
            }`}
            title="Erase unwanted text, labels or dimensions — drag a box over them to white them out (undoable)"
          >
            <Eraser size={12} /> Eraser
          </button>
          {eraseCount > 0 && (
            <button
              type="button"
              onClick={() => {
                const target = eraseHistoryRef.current.pop();
                if (target !== undefined) {
                  onUndoErasure(target);
                  setEraseCount(eraseHistoryRef.current.length);
                }
              }}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] font-semibold text-txt-muted transition hover:text-txt"
              title="Restore the last erased area"
            >
              <Undo2 size={12} /> Undo
            </button>
          )}
        </div>

        <span className="ml-auto hidden text-[10px] text-txt-muted xl:inline">
          Drag the sheet to pan · click a part or dimension to select it
        </span>
      </div>
      {eraserOn && (
        <div className="mb-2 rounded-lg border border-accent/30 bg-accent/5 px-2 py-1.5 text-[11px] text-accent">
          Eraser on — drag a box over text, labels or dimensions to white them out. For small
          text, use the Magnify buttons to zoom in first and erase precisely. It works on the
          drawing and on placed parts, and “Undo” brings the content back.
        </div>
      )}
      {selectedOverlay && (
        <div className="mb-2 flex flex-wrap items-center justify-end gap-1.5 rounded-lg border border-accent/30 bg-accent/5 px-2 py-1.5">
          <span className="mr-auto truncate text-[11px] font-semibold text-accent">
            Part: {selectedOverlay.name}
          </span>
          <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-txt-muted">
            Part size
          </span>
          <button
            type="button"
            onClick={() => stepOverlayWidth(-1)}
            disabled={selectedOverlay.width <= OVERLAY_WIDTH_MIN}
            className="flex h-6 w-6 items-center justify-center rounded-md border border-border text-sm font-bold text-txt-muted transition hover:text-txt disabled:opacity-30"
            aria-label="Reduce part"
          >
            −
          </button>
          <span className="w-11 text-center text-xs font-semibold tabular-nums text-txt">
            {Math.round(selectedOverlay.width)}%
          </span>
          <button
            type="button"
            onClick={() => stepOverlayWidth(1)}
            disabled={selectedOverlay.width >= OVERLAY_WIDTH_MAX}
            className="flex h-6 w-6 items-center justify-center rounded-md border border-border text-sm font-bold text-txt-muted transition hover:text-txt disabled:opacity-30"
            aria-label="Enlarge part"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => {
              onRemoveOverlay(selectedOverlay.id);
              setSelectedOverlayId(null);
            }}
            className="inline-flex items-center gap-1 rounded-md border border-err/40 px-1.5 py-0.5 text-[10px] font-semibold text-err transition hover:bg-err/10"
          >
            <Trash2 size={11} /> Remove
          </button>
        </div>
      )}
      {selectedDimension && (
        <div className="mb-2 flex flex-wrap items-center justify-end gap-1.5 rounded-lg border border-accent/30 bg-accent/5 px-2 py-1.5">
          <span className="mr-auto text-[11px] font-semibold text-accent">
            Dimension — drag middle to move, ends to stretch
            {selectedDimension.overlayId
              ? ` · attached to ${
                  (item.overlays ?? []).find(
                    (overlay) => overlay.id === selectedDimension.overlayId,
                  )?.name || "part"
                }`
              : ""}
          </span>
          <input
            key={selectedDimension.id}
            defaultValue={selectedDimension.text}
            placeholder="Text, e.g. 3500"
            onBlur={(event) => {
              if (event.target.value !== selectedDimension.text) {
                onUpdateDimension(selectedDimension.id, { text: event.target.value });
              }
            }}
            onKeyDown={(event) =>
              event.key === "Enter" && (event.target as HTMLInputElement).blur()
            }
            className="w-28 rounded-md border border-border bg-transparent px-2 py-1 text-xs text-txt outline-none focus:border-accent/60"
          />
          <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-txt-muted">
            Size
          </span>
          <button
            type="button"
            onClick={() => stepDimensionScale(-1)}
            disabled={(selectedDimension.scale ?? 1) <= DIM_SCALE_MIN}
            className="flex h-6 w-6 items-center justify-center rounded-md border border-border text-sm font-bold text-txt-muted transition hover:text-txt disabled:opacity-30"
            aria-label="Reduce dimension size"
          >
            −
          </button>
          <span className="w-11 text-center text-xs font-semibold tabular-nums text-txt">
            {(selectedDimension.scale ?? 1).toFixed(2)}×
          </span>
          <button
            type="button"
            onClick={() => stepDimensionScale(1)}
            disabled={(selectedDimension.scale ?? 1) >= DIM_SCALE_MAX}
            className="flex h-6 w-6 items-center justify-center rounded-md border border-border text-sm font-bold text-txt-muted transition hover:text-txt disabled:opacity-30"
            aria-label="Enlarge dimension size"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => {
              onRemoveDimension(selectedDimension.id);
              setSelectedDimensionId(null);
            }}
            className="inline-flex items-center gap-1 rounded-md border border-err/40 px-1.5 py-0.5 text-[10px] font-semibold text-err transition hover:bg-err/10"
          >
            <Trash2 size={11} /> Remove
          </button>
        </div>
      )}
      <style>{PACKAGE_SHEET_CSS}</style>
      <div
        ref={containerRef}
        className={`relative w-full overflow-hidden rounded-lg ${
          eraserOn ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing"
        }`}
        style={{ aspectRatio: "297 / 210", fontSize: "clamp(6px, 1.05vw, 12px)", touchAction: "none" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {baseSvg === undefined ? (
          <div className="flex h-full items-center justify-center bg-white text-xs text-slate-400">
            <Loader2 size={16} className="mr-2 animate-spin" /> Loading drawing…
          </div>
        ) : (
          <div
            ref={viewWrapRef}
            className="h-full w-full"
            style={
              view.z > 1
                ? {
                    transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})`,
                    transformOrigin: "0 0",
                  }
                : undefined
            }
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )}
        {eraseRect && (
          <div
            className="pointer-events-none absolute border border-dashed border-err bg-white/80"
            style={{
              left: eraseRect.left,
              top: eraseRect.top,
              width: eraseRect.width,
              height: eraseRect.height,
            }}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Picker row tile: shows the stored thumbnail when it has arrived; otherwise
 * asks for it the moment the row scrolls near the viewport. This is what
 * keeps the warehouse picker light — only visible rows cost bandwidth.
 */
function PickerThumb({
  item,
  onRequest,
}: {
  item: LibraryItem;
  onRequest: (id: string) => void;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const isDbItem = !item.thumbnail && !item.svg;
  useEffect(() => {
    if (!isDbItem) return;
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      onRequest(item.id);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          onRequest(item.id);
          io.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [isDbItem, item.id, onRequest]);

  if (item.thumbnail) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={item.thumbnail}
        alt=""
        className="h-10 w-14 shrink-0 rounded border border-border bg-white object-contain"
      />
    );
  }
  if (item.svg) {
    // Seed/demo items carry their SVG inline — rasterize lazily (cached).
    return (
      <LibraryThumbnail
        id={item.id}
        svg={item.svg}
        alt=""
        className="flex h-10 w-14 shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-white"
      />
    );
  }
  return (
    <span
      ref={ref}
      className="flex h-10 w-14 shrink-0 animate-pulse items-center justify-center rounded border border-border bg-white/5"
    />
  );
}

function DrawingPicker({
  open,
  onClose,
  library,
  onConfirm,
  onCrop,
  onRequestThumbnail,
}: {
  open: boolean;
  onClose: () => void;
  library: LibraryItem[] | null;
  onConfirm: (items: LibraryItem[]) => void;
  onCrop: (item: LibraryItem) => void;
  onRequestThumbnail: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [tab, setTab] = useState<"drawings" | "parts">("drawings");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) setSelectedIds(new Set());
  }, [open]);

  // A narrower topic only makes sense inside one category — clear it whenever
  // the category (or tab) changes.
  useEffect(() => {
    setActiveTag(null);
  }, [category, tab]);

  const counts = useMemo(() => {
    const parts = (library ?? []).filter((item) => item.assetType === "object").length;
    return { parts, drawings: (library?.length ?? 0) - parts };
  }, [library]);

  // Sub-selection without a second dropdown: once a category is chosen, offer
  // its most common tags as chips. Derived from the data, so it adapts as the
  // admin curates — no schema, no extra fetch.
  const tagChips = useMemo(() => {
    if (!library || category === "all") return [];
    const counts = new Map<string, number>();
    for (const item of library) {
      const isPart = item.assetType === "object";
      if (tab === "parts" ? !isPart : isPart) continue;
      if (item.category !== category) continue;
      for (const tag of item.tags) {
        const clean = tag.trim().toLowerCase();
        if (clean) counts.set(clean, (counts.get(clean) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag]) => tag);
  }, [library, category, tab]);

  const filtered = useMemo(() => {
    if (!library) return [];
    const q = query.trim().toLowerCase();
    return library.filter((item) => {
      const isPart = item.assetType === "object";
      if (tab === "parts" ? !isPart : isPart) return false;
      if (category !== "all" && item.category !== category) return false;
      if (activeTag && !item.tags.some((tag) => tag.trim().toLowerCase() === activeTag)) {
        return false;
      }
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.tags.some((tag) => tag.toLowerCase().includes(q))
      );
    });
  }, [library, query, category, activeTag, tab]);

  const toggle = (id: string) =>
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Modal open={open} onClose={onClose} title="Add from the warehouse" width={720}>
      <div className="mb-3 flex gap-1 rounded-lg border border-border p-1">
        <button
          type="button"
          onClick={() => setTab("drawings")}
          className={`flex-1 rounded-md px-3 py-1.5 text-xs font-bold transition ${
            tab === "drawings" ? "bg-accent text-white" : "text-txt-muted hover:text-txt"
          }`}
        >
          Drawings ({counts.drawings})
        </button>
        <button
          type="button"
          onClick={() => setTab("parts")}
          className={`flex-1 rounded-md px-3 py-1.5 text-xs font-bold transition ${
            tab === "parts" ? "bg-accent text-white" : "text-txt-muted hover:text-txt"
          }`}
        >
          Parts ({counts.parts})
        </button>
      </div>
      {tab === "parts" ? (
        <p className="mb-2 text-[11px] leading-5 text-txt-muted">
          Parts are reusable details (beams, columns, footings, manholes…) placed on top of the
          selected sheet — drag to position, resize while selected.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-txt-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search drawings…"
            className="w-full rounded-lg border border-border bg-transparent py-2 pl-8 pr-3 text-xs text-txt outline-none focus:border-accent/60"
          />
        </div>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-lg border border-border bg-bg-surface px-2 py-2 text-xs text-txt outline-none"
        >
          <option value="all">All categories</option>
          {LIBRARY_CATEGORIES.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.label}
            </option>
          ))}
        </select>
      </div>

      {tagChips.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {tagChips.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => setActiveTag((current) => (current === tag ? null : tag))}
              className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold transition ${
                activeTag === tag
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border text-txt-muted hover:border-accent/40 hover:text-txt"
              }`}
            >
              {tag}
            </button>
          ))}
          {activeTag && (
            <button
              type="button"
              onClick={() => setActiveTag(null)}
              className="rounded-full px-2 py-1 text-[10px] font-semibold text-txt-muted transition hover:text-txt"
            >
              Clear
            </button>
          )}
        </div>
      )}

      <div className="mt-3 max-h-[46vh] space-y-1 overflow-y-auto pr-1">
        {!library ? (
          <p className="flex items-center justify-center gap-2 py-10 text-xs text-txt-muted">
            <Loader2 size={14} className="animate-spin" /> Loading the warehouse…
          </p>
        ) : filtered.length === 0 ? (
          <p className="py-10 text-center text-xs text-txt-muted">
            No {tab === "parts" ? "parts" : "drawings"} match.
            {tab === "parts" && counts.parts === 0
              ? " Admins create parts in the studio: select a detail, right-click, “Publish selection as part”."
              : ""}
          </p>
        ) : (
          filtered.map((item) => (
            <label
              key={item.id}
              className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 transition ${
                selectedIds.has(item.id)
                  ? "border-accent/60 bg-accent/10"
                  : "border-border hover:border-accent/30"
              }`}
            >
              <input
                type="checkbox"
                checked={selectedIds.has(item.id)}
                onChange={() => toggle(item.id)}
                className="accent-[--accent]"
              />
              <PickerThumb item={item} onRequest={onRequestThumbnail} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold text-txt">{item.name}</span>
                <span className="block truncate text-[10px] text-txt-muted">
                  {LIBRARY_CATEGORIES.find((cat) => cat.id === item.category)?.label ?? item.category}
                  {item.tags.length > 0 ? ` · ${item.tags.slice(0, 4).join(", ")}` : ""}
                </span>
              </span>
              {item.assetType !== "object" ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onCrop(item);
                  }}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] font-semibold text-txt-muted transition hover:border-accent/40 hover:text-accent"
                  title="Add only a section of this drawing — drag a box over the preview to crop"
                >
                  <Crop size={11} /> Crop
                </button>
              ) : null}
            </label>
          ))
        )}
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-txt-muted transition hover:text-txt"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={selectedIds.size === 0}
          onClick={() => library && onConfirm(library.filter((item) => selectedIds.has(item.id)))}
          className="rounded-lg bg-accent px-4 py-2 text-xs font-bold text-white transition hover:bg-accent-strong disabled:opacity-50"
        >
          Add {selectedIds.size > 0 ? selectedIds.size : ""} item
          {selectedIds.size === 1 ? "" : "s"}
        </button>
      </div>
    </Modal>
  );
}

/**
 * Crop-a-section preview: the full drawing renders as plain SVG and the user
 * drags a box over the region they want. On confirm the box is mapped into
 * the drawing's own viewBox units — the sheet stores just the reference plus
 * that window, and the renderer rewrites the viewBox at draw time.
 */
function CropDrawingModal({
  item,
  svg,
  onClose,
  onConfirm,
}: {
  item: LibraryItem;
  svg: string | null | undefined;
  onClose: () => void;
  onConfirm: (crop: SvgViewBox) => void;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [selection, setSelection] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const draggingRef = useRef(false);

  const clean = useMemo(() => (svg ? sanitizeSvgMarkup(svg) : null), [svg]);
  const viewBox = useMemo(() => (clean ? parseSvgViewBox(clean) : null), [clean]);

  const pointInWrap = (event: React.PointerEvent) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      x: Math.min(Math.max(event.clientX - rect.left, 0), rect.width),
      y: Math.min(Math.max(event.clientY - rect.top, 0), rect.height),
    };
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!clean || event.button !== 0) return;
    const point = pointInWrap(event);
    if (!point) return;
    draggingRef.current = true;
    setSelection({ x0: point.x, y0: point.y, x1: point.x, y1: point.y });
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* enhancement only */
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    const point = pointInWrap(event);
    if (!point) return;
    setSelection((current) => (current ? { ...current, x1: point.x, y1: point.y } : current));
  };

  const handlePointerUp = () => {
    draggingRef.current = false;
  };

  const box = selection
    ? {
        left: Math.min(selection.x0, selection.x1),
        top: Math.min(selection.y0, selection.y1),
        width: Math.abs(selection.x1 - selection.x0),
        height: Math.abs(selection.y1 - selection.y0),
      }
    : null;
  const bigEnough = Boolean(box && box.width > 8 && box.height > 8);

  const handleConfirm = () => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect || !box || !viewBox || !bigEnough) return;
    const scaleX = viewBox.width / rect.width;
    const scaleY = viewBox.height / rect.height;
    onConfirm({
      x: viewBox.x + box.left * scaleX,
      y: viewBox.y + box.top * scaleY,
      width: box.width * scaleX,
      height: box.height * scaleY,
    });
  };

  return (
    <Modal open onClose={onClose} title={`Crop a section — ${item.name}`} width={860}>
      <p className="mb-3 text-xs leading-5 text-txt-muted">
        Drag a box over the part of the drawing you want. Only that section is placed on your
        sheet — you can drag and resize it there like any part.
      </p>

      {svg === undefined ? (
        <div className="flex h-64 items-center justify-center rounded-lg border border-border bg-white text-xs text-slate-400">
          <Loader2 size={16} className="mr-2 animate-spin" /> Loading drawing…
        </div>
      ) : !clean || !viewBox ? (
        <div className="rounded-lg border border-border bg-bg-surface px-4 py-8 text-center text-xs text-txt-muted">
          This drawing can&apos;t be cropped (its geometry couldn&apos;t be measured).
        </div>
      ) : (
        <div className="max-h-[58vh] overflow-auto rounded-lg border border-border">
          <div
            ref={wrapRef}
            className="dp-crop-wrap relative w-full cursor-crosshair select-none bg-white"
            style={{ touchAction: "none" }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            <style>{`.dp-crop-wrap svg { display: block; width: 100%; height: auto; }`}</style>
            <div dangerouslySetInnerHTML={{ __html: clean }} />
            {box && (
              <div
                className="pointer-events-none absolute border-2 border-dashed border-accent bg-accent/10"
                style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
              />
            )}
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center justify-end gap-2">
        {box && !bigEnough ? (
          <span className="mr-auto text-[11px] text-txt-muted">Drag a bigger box to crop.</span>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-txt-muted transition hover:text-txt"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={!bigEnough || !viewBox}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-xs font-bold text-white transition hover:bg-accent-strong disabled:opacity-50"
        >
          <Crop size={13} /> Add selection to sheet
        </button>
      </div>
    </Modal>
  );
}
