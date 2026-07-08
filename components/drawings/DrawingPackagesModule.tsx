"use client";

import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileDown,
  FolderOpen,
  Loader2,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import Modal from "@/components/ui/Modal";
import { LIBRARY_CATEGORIES, type LibraryItem } from "@/lib/drawings/appModel";
import {
  fetchCurrentUserRole,
  fetchDrawingLibrary,
  fetchLibraryItemSvg,
  subscribeLibraryChanges,
} from "@/lib/drawings/libraryBridge";
import {
  PACKAGE_SHEET_CSS,
  buildPackagePrintHtml,
  renderPackageSheetHtml,
} from "@/lib/drawings/packageSheet";
import {
  emptyDrawingPackageTitleBlock,
  type DrawingPackage,
  type DrawingPackageItem,
  type DrawingPackageTitleBlock,
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
  const ensureLibrary = useCallback((): Promise<LibraryItem[]> => {
    if (!libraryPromiseRef.current) {
      libraryPromiseRef.current = fetchDrawingLibrary(mergeThumbnails).then((items) => {
        applyLibrary(items);
        return items;
      });
    }
    return libraryPromiseRef.current;
  }, [applyLibrary, mergeThumbnails]);

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
          const items = await ensureLibrary();
          const entry = items.find((item) => item.id === libraryItemId);
          const svg = entry ? (await fetchLibraryItemSvg(entry)) || null : null;
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
    selectedPackage?.items.forEach((item) => void ensureSvg(item.libraryItemId));
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

  // The picker needs the warehouse list however it was opened.
  useEffect(() => {
    if (pickerOpen) void ensureLibrary();
  }, [pickerOpen, ensureLibrary]);

  // Re-pull the warehouse after an admin curates it in the studio (another tab),
  // so this module doesn't keep serving the memoized pre-edit list. Skip when the
  // library was never loaded — nothing to refresh, and no need to fetch for users
  // who never open the picker. `clearSvgCache` drops cached drawing SVGs so an
  // edited drawing re-renders; focus (a cheap fallback) only re-syncs metadata.
  const refreshLibrary = useCallback(
    (clearSvgCache: boolean) => {
      if (!libraryPromiseRef.current) return;
      const promise = fetchDrawingLibrary(mergeThumbnails).then((items) => {
        applyLibrary(items);
        return items;
      });
      libraryPromiseRef.current = promise;
      if (clearSvgCache) setSvgCache({});
      void promise;
    },
    [applyLibrary, mergeThumbnails],
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

  const handleAddDrawings = (items: LibraryItem[]) => {
    if (!selectedPackage || items.length === 0) return;
    const base = selectedPackage.items.length;
    addDrawingPackageItems(
      selectedPackage.id,
      items.map((item, index) => ({
        libraryItemId: item.id,
        name: item.name,
        titleBlock: makeTitleBlock(item, base + index + 1),
      })),
    );
    setPickerOpen(false);
  };

  const handleExport = async () => {
    if (!selectedPackage || selectedPackage.items.length === 0 || exporting) return;
    setExporting(true);
    try {
      const svgByItemId: Record<string, string | null> = Object.fromEntries(
        await Promise.all(
          selectedPackage.items.map(
            async (item) => [item.id, await ensureSvg(item.libraryItemId)] as const,
          ),
        ),
      );
      const printWindow = window.open("", "_blank");
      if (!printWindow) return;
      printWindow.document.write(buildPackagePrintHtml(selectedPackage, svgByItemId));
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
    <section className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-bg-surface px-5 py-4">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.24em] text-accent">
            Drawing packages
          </p>
          <p className="mt-1 text-sm text-txt-muted">
            Pick ready-made drawings from the warehouse, fill the title block, export as PDF.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <a
              href="/drawings/studio"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-txt-muted transition hover:text-txt"
            >
              Curate library (studio)
              <ExternalLink size={13} />
            </a>
          )}
          <button
            type="button"
            onClick={handleCreatePackage}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-xs font-bold text-white transition hover:bg-accent-strong"
          >
            <Plus size={14} />
            New package
          </button>
        </div>
      </header>

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
        <div className="space-y-4">
          {/* Packages as a horizontal strip so the sheet preview below gets
              the full content width — engineers work on one package at a time. */}
          <div className="flex flex-wrap gap-2">
            {projectPackages.map((pkg) => (
              <PackageCard
                key={pkg.id}
                pkg={pkg}
                active={pkg.id === selectedPackage?.id}
                onSelect={() => {
                  setSelectedPackageId(pkg.id);
                  setSelectedItemId(null);
                }}
                onRename={(name) => renameDrawingPackage(pkg.id, name)}
                onDelete={() => {
                  deleteDrawingPackage(pkg.id);
                  if (selectedPackageId === pkg.id) setSelectedPackageId(null);
                }}
              />
            ))}
          </div>

          {/* Selected package detail */}
          {selectedPackage && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-bg-surface px-4 py-3">
                <p className="text-sm font-semibold text-txt">
                  {selectedPackage.name}
                  <span className="ml-2 text-xs font-normal text-txt-muted">
                    {selectedPackage.items.length} sheet
                    {selectedPackage.items.length === 1 ? "" : "s"}
                  </span>
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      void ensureLibrary();
                      setPickerOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-txt-muted transition hover:text-txt"
                  >
                    <Plus size={13} />
                    Add drawings
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleExport()}
                    disabled={selectedPackage.items.length === 0 || exporting}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-bold text-white transition hover:bg-accent-strong disabled:opacity-50"
                  >
                    {exporting ? <Loader2 size={13} className="animate-spin" /> : <FileDown size={13} />}
                    Export PDF
                  </button>
                </div>
              </div>

              {selectedPackage.items.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-bg-surface p-8 text-center text-sm text-txt-muted">
                  No drawings in this package yet — click “Add drawings” to pick from the
                  warehouse.
                </div>
              ) : (
                <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_1fr]">
                  {/* Sheet list + title-block form */}
                  <div className="space-y-2">
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
                        svg={svgCache[selectedItem.libraryItemId]}
                        index={selectedPackage.items.findIndex((i) => i.id === selectedItem.id)}
                        count={selectedPackage.items.length}
                        onZoomChange={(zoom) =>
                          updateDrawingPackageItem(selectedPackage.id, selectedItem.id, { zoom })
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
        onConfirm={handleAddDrawings}
      />
    </section>
  );
}

function PackageCard({
  pkg,
  active,
  onSelect,
  onRename,
  onDelete,
}: {
  pkg: DrawingPackage;
  active: boolean;
  onSelect: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(pkg.name);
  useEffect(() => setName(pkg.name), [pkg.name]);

  return (
    <div
      className={`w-full cursor-pointer rounded-2xl border px-4 py-3 transition sm:w-[260px] ${
        active ? "border-accent/60 bg-accent/10" : "border-border bg-bg-surface hover:border-accent/30"
      }`}
      onClick={onSelect}
    >
      <div className="flex items-center justify-between gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name !== pkg.name && onRename(name)}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          onClick={(e) => e.stopPropagation()}
          className="w-full bg-transparent text-sm font-semibold text-txt outline-none"
        />
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (window.confirm(`Delete "${pkg.name}"? The warehouse drawings themselves are not affected.`)) {
              onDelete();
            }
          }}
          className="text-txt-muted transition hover:text-red-400"
          aria-label="Delete package"
        >
          <Trash2 size={14} />
        </button>
      </div>
      <p className="mt-1 text-xs text-txt-muted">
        {pkg.items.length} sheet{pkg.items.length === 1 ? "" : "s"} · updated{" "}
        {pkg.updatedAt.slice(0, 10)}
      </p>
    </div>
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
function TitleBlockForm({
  item,
  onCommit,
  onApplyToAll,
}: {
  item: DrawingPackageItem;
  onCommit: (titleBlock: DrawingPackageTitleBlock) => void;
  onApplyToAll: (titleBlock: DrawingPackageTitleBlock) => void;
}) {
  const [draft, setDraft] = useState<DrawingPackageTitleBlock>(item.titleBlock);
  useEffect(() => setDraft(item.titleBlock), [item.titleBlock]);

  const commit = (next: DrawingPackageTitleBlock) => {
    if (JSON.stringify(next) !== JSON.stringify(item.titleBlock)) onCommit(next);
  };

  return (
    <div className="rounded-2xl border border-border bg-bg-surface p-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-accent">Title block</p>
        <button
          type="button"
          onClick={() => onApplyToAll(draft)}
          className="rounded-md border border-border px-2 py-1 text-[11px] font-semibold text-txt-muted transition hover:text-txt"
          title="Copy the shared fields (project, client, consultant, date, signatures, revision, status) to every sheet in the package"
        >
          Apply to all sheets
        </button>
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
    </div>
  );
}

const ZOOM_STEP = 0.1;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;

function SheetPreview({
  item,
  svg,
  index,
  count,
  onZoomChange,
}: {
  item: DrawingPackageItem;
  svg: string | null | undefined;
  index: number;
  count: number;
  onZoomChange: (zoom: number) => void;
}) {
  const html = useMemo(
    () => renderPackageSheetHtml(item, svg ?? null, index, count),
    [item, svg, index, count],
  );

  const zoom = Math.min(Math.max(item.zoom ?? 1, ZOOM_MIN), ZOOM_MAX);
  const step = (direction: -1 | 1) => {
    const next = Math.min(Math.max(zoom + direction * ZOOM_STEP, ZOOM_MIN), ZOOM_MAX);
    if (next !== zoom) onZoomChange(Number(next.toFixed(2)));
  };

  return (
    <div className="rounded-2xl border border-border bg-bg-surface p-3">
      <div className="mb-2 flex items-center justify-end gap-1.5">
        <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-txt-muted">
          Drawing size
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
        <span className="w-11 text-center text-xs font-semibold tabular-nums text-txt">
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
        {zoom !== 1 && (
          <button
            type="button"
            onClick={() => onZoomChange(1)}
            className="rounded-md border border-border px-1.5 py-0.5 text-[10px] font-semibold text-txt-muted transition hover:text-txt"
          >
            Reset
          </button>
        )}
      </div>
      <style>{PACKAGE_SHEET_CSS}</style>
      <div
        className="relative w-full overflow-hidden rounded-lg"
        style={{ aspectRatio: "297 / 210", fontSize: "clamp(6px, 1.05vw, 12px)" }}
      >
        {svg === undefined ? (
          <div className="flex h-full items-center justify-center bg-white text-xs text-slate-400">
            <Loader2 size={16} className="mr-2 animate-spin" /> Loading drawing…
          </div>
        ) : (
          <div className="h-full w-full" dangerouslySetInnerHTML={{ __html: html }} />
        )}
      </div>
    </div>
  );
}

function DrawingPicker({
  open,
  onClose,
  library,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  library: LibraryItem[] | null;
  onConfirm: (items: LibraryItem[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) setSelectedIds(new Set());
  }, [open]);

  const filtered = useMemo(() => {
    if (!library) return [];
    const q = query.trim().toLowerCase();
    return library.filter((item) => {
      if (category !== "all" && item.category !== category) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.tags.some((tag) => tag.toLowerCase().includes(q))
      );
    });
  }, [library, query, category]);

  const toggle = (id: string) =>
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Modal open={open} onClose={onClose} title="Add drawings from the warehouse" width={720}>
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

      <div className="mt-3 max-h-[46vh] space-y-1 overflow-y-auto pr-1">
        {!library ? (
          <p className="flex items-center justify-center gap-2 py-10 text-xs text-txt-muted">
            <Loader2 size={14} className="animate-spin" /> Loading the warehouse…
          </p>
        ) : filtered.length === 0 ? (
          <p className="py-10 text-center text-xs text-txt-muted">No drawings match.</p>
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
              {item.thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.thumbnail}
                  alt=""
                  className="h-10 w-14 shrink-0 rounded border border-border bg-white object-contain"
                />
              ) : (
                <span className="flex h-10 w-14 shrink-0 items-center justify-center rounded border border-border bg-white/5 text-[9px] text-txt-muted">
                  No preview
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold text-txt">{item.name}</span>
                <span className="block truncate text-[10px] text-txt-muted">
                  {LIBRARY_CATEGORIES.find((cat) => cat.id === item.category)?.label ?? item.category}
                  {item.tags.length > 0 ? ` · ${item.tags.slice(0, 4).join(", ")}` : ""}
                </span>
              </span>
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
          Add {selectedIds.size > 0 ? selectedIds.size : ""} drawing
          {selectedIds.size === 1 ? "" : "s"}
        </button>
      </div>
    </Modal>
  );
}
