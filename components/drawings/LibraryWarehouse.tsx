"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, X, Star, Clock, LayoutGrid, Check, ZoomIn, Layers, Puzzle, ChevronRight, ChevronDown, SlidersHorizontal, PencilRuler } from "lucide-react";
import {
  LIBRARY_CATEGORIES,
  type LibraryCategory,
  type LibraryItem,
} from "@/lib/drawings/appModel";
import { LibraryThumbnail, displayLibraryName } from "./LibraryThumbnail";

type Scope = "all" | "favorites" | "recent";
type Kind = "all" | "drawing" | "object";

// ── Category taxonomy ────────────────────────────────────────────────────────
// A code-defined tree (category → subcategory → leaf) layered over the existing
// item tags — no DB schema change. Each leaf matches items whose tags include any
// of its `tags` (or, for a category-only leaf, whose category matches). Filtering
// in the warehouse is the union of the selected leaves. Curate this as the
// library grows; items just need decent tags (which the admin can edit).
type WhLeaf = { key: string; label: string; tags?: readonly string[]; category?: LibraryCategory };
type WhSub = { label: string; leaves: WhLeaf[] };

const TAXONOMY: Partial<Record<LibraryCategory, WhSub[]>> = {
  civil: [
    {
      label: "Roads",
      leaves: [
        { key: "civ-xsec", label: "Cross sections", tags: ["cross section", "carriageway", "pavement"] },
        { key: "civ-curb", label: "Curbs & sidewalks", tags: ["kerb", "curb", "sidewalk", "median"] },
        { key: "civ-mark", label: "Markings & signs", tags: ["road marking", "traffic signs", "signage", "sign", "road studs"] },
        { key: "civ-calm", label: "Traffic calming", tags: ["speed hump", "speed bump", "raised crossing", "traffic calming"] },
      ],
    },
    {
      label: "Drainage",
      leaves: [
        { key: "civ-culv", label: "Culverts", tags: ["culvert", "box culvert", "pipe culvert"] },
        { key: "civ-mh", label: "Manholes & catch basins", tags: ["manhole", "catch basin", "gully", "junction box"] },
        { key: "civ-ditch", label: "Ditches & channels", tags: ["ditch", "side drain", "drainage gutter", "gutter"] },
        { key: "civ-head", label: "Headwalls & wing walls", tags: ["headwall", "wing wall", "wingwall"] },
        { key: "civ-trench", label: "Trenches & bedding", tags: ["trench", "pipe bedding", "backfill"] },
      ],
    },
    {
      label: "Structures & utilities",
      leaves: [
        { key: "civ-rw", label: "Retaining walls", tags: ["retaining wall"] },
        { key: "civ-septic", label: "Septic tanks", tags: ["septic tank", "soakaway", "sanitation", "wastewater"] },
        { key: "civ-light", label: "Street & solar lighting", tags: ["street lighting", "solar", "lighting pole", "pv"] },
      ],
    },
  ],
  structural: [
    {
      label: "Reinforced concrete",
      leaves: [
        { key: "str-beam", label: "Beams", tags: ["beam"] },
        { key: "str-col", label: "Columns", tags: ["column"] },
        { key: "str-foot", label: "Footings", tags: ["footing", "foundation"] },
        { key: "str-rebar", label: "Rebar shapes", tags: ["rebar", "stirrup", "bar", "reinforcement"] },
      ],
    },
  ],
  details: [
    {
      label: "Reference details",
      leaves: [
        { key: "det-std", label: "Standard details", tags: ["standard detail"] },
        { key: "det-typ", label: "Typical drawings", tags: ["typical drawing"] },
      ],
    },
  ],
};

// Subcategories for a category — fall back to a single "All" leaf (filter by the
// category itself) for categories without a curated subtree.
const subsFor = (cat: LibraryCategory): WhSub[] =>
  TAXONOMY[cat] ?? [{ label: "", leaves: [{ key: `cat-${cat}`, label: "All", category: cat }] }];

const leafMatches = (leaf: WhLeaf, item: LibraryItem): boolean => {
  if (leaf.category) return item.category === leaf.category;
  if (!leaf.tags) return false;
  const itemTags = item.tags.map((t) => t.toLowerCase());
  return leaf.tags.some((t) => itemTags.includes(t));
};

// A "part" is a reusable individual detail (a parametric block, an explicit
// object, or an imported single-structure standard detail); a "drawing" is a
// complete multi-purpose sheet/assembly. DB items don't carry an asset type, so
// we fall back to: parametric → part; tagged "standard detail" → part (the
// roadway/WASH standard details are self-contained, single-structure details);
// otherwise drawing.
const itemKind = (item: LibraryItem): "drawing" | "object" => {
  if (item.assetType) return item.assetType;
  if (item.parametricKind) return "object";
  if (item.tags.includes("standard detail")) return "object";
  return "drawing";
};

interface LibraryWarehouseProps {
  libraryItems: LibraryItem[];
  favoriteIds: string[];
  recentIds: string[];
  onToggleFavorite: (libraryId: string) => void;
  // Import sends the item to the studio tab (or canvas). The browser stays open
  // so several items can be imported in a row.
  onImport: (item: LibraryItem) => void | Promise<void>;
  // Admin-only: open a warehouse drawing on the studio canvas for a clean-up.
  // When omitted (non-admins), the Edit affordance is hidden entirely.
  onEdit?: (item: LibraryItem) => void;
  // Resolve an item's full SVG for the large preview (seed items carry it; DB
  // items fetch it by id on demand).
  onResolveSvg?: (item: LibraryItem) => Promise<string>;
  onClose?: () => void;
}

interface PreviewState {
  item: LibraryItem;
  svg: string;
  loading: boolean;
}

/**
 * Full-page "warehouse" browser for the drawing library. Lives in its own tab so
 * the canvas tab stays light — the heavy thumbnail grid renders here, and only
 * the chosen drawing crosses to the canvas on Import. Reuses the lazy
 * LibraryThumbnail (only visible cards rasterize; full svgs are fetched on the
 * studio side at insert time), so a large library stays light here too.
 */
export default function LibraryWarehouse({
  libraryItems,
  favoriteIds,
  recentIds,
  onToggleFavorite,
  onImport,
  onEdit,
  onResolveSvg,
  onClose,
}: LibraryWarehouseProps) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<Scope>("all");
  const [kindTab, setKindTab] = useState<Kind>("all");
  const [showFilters, setShowFilters] = useState(false);
  const [justImported, setJustImported] = useState<Record<string, number>>({});
  const [preview, setPreview] = useState<PreviewState | null>(null);
  // Sector categories are small groups — start them all open; thumbnails are
  // viewport-lazy so expansion costs nothing until tiles scroll into view.
  const [expanded, setExpanded] = useState<Set<LibraryCategory>>(
    () => new Set<LibraryCategory>(LIBRARY_CATEGORIES.map((cat) => cat.id)),
  );
  const [selectedLeaves, setSelectedLeaves] = useState<Set<string>>(() => new Set());

  const toggleExpanded = (cat: LibraryCategory) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  const toggleLeaf = (key: string) =>
    setSelectedLeaves((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const leafIndex = useMemo(() => {
    const m = new Map<string, WhLeaf>();
    for (const cat of LIBRARY_CATEGORIES) for (const sub of subsFor(cat.id)) for (const leaf of sub.leaves) m.set(leaf.key, leaf);
    return m;
  }, []);
  const leafCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const item of libraryItems)
      leafIndex.forEach((leaf, key) => {
        if (leafMatches(leaf, item)) m.set(key, (m.get(key) ?? 0) + 1);
      });
    return m;
  }, [libraryItems, leafIndex]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (preview) setPreview(null);
      else onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, preview]);

  const openPreview = async (item: LibraryItem) => {
    setPreview({ item, svg: item.svg || "", loading: !item.svg });
    if (!item.svg && onResolveSvg) {
      const svg = await onResolveSvg(item);
      setPreview((prev) => (prev && prev.item.id === item.id ? { ...prev, svg, loading: false } : prev));
    }
  };

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of libraryItems) map.set(item.category, (map.get(item.category) ?? 0) + 1);
    return map;
  }, [libraryItems]);

  const kindCounts = useMemo(() => {
    let drawing = 0;
    let object = 0;
    for (const item of libraryItems) (itemKind(item) === "object" ? object++ : drawing++);
    return { all: libraryItems.length, drawing, object };
  }, [libraryItems]);

  const items = useMemo(() => {
    const needle = query.trim().toLowerCase();
    let pool = libraryItems;
    if (scope === "favorites") pool = pool.filter((i) => favoriteIds.includes(i.id));
    else if (scope === "recent")
      pool = recentIds.map((id) => pool.find((i) => i.id === id)).filter((i): i is LibraryItem => Boolean(i));

    const selected = Array.from(selectedLeaves).map((k) => leafIndex.get(k)).filter(Boolean) as WhLeaf[];

    return pool.filter((item) => {
      if (kindTab !== "all" && itemKind(item) !== kindTab) return false;
      if (selected.length && !selected.some((l) => leafMatches(l, item))) return false;
      if (!needle) return true;
      const haystack = [item.name, item.description, ...item.tags, item.author].join(" ").toLowerCase();
      return haystack.includes(needle);
    });
  }, [favoriteIds, kindTab, leafIndex, libraryItems, query, recentIds, scope, selectedLeaves]);

  const handleImport = async (item: LibraryItem) => {
    await onImport(item);
    // Brief per-card confirmation, then fade.
    setJustImported((prev) => ({ ...prev, [item.id]: (prev[item.id] ?? 0) + 1 }));
    window.setTimeout(() => {
      setJustImported((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
    }, 1400);
  };

  const railBtn = (active: boolean) =>
    `flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] transition ${
      active ? "bg-[#f0a13a] font-medium text-[#1c1206]" : "text-slate-300 hover:bg-white/5 hover:text-white"
    }`;

  return (
    <div className="flex h-screen w-full flex-col overflow-x-hidden bg-[#141519]" aria-label="Drawing library">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[#34353c] bg-[#202127] px-4 py-3">
        <span className="flex items-center gap-2 text-[15px] font-medium text-slate-100">
          <LayoutGrid className="h-5 w-5 text-[#f0a13a]" />
          Drawing library
        </span>
        <div className="order-last flex w-full items-center gap-2 rounded-lg border border-[#3a3b42] bg-[#15161a] px-3 py-2 md:order-none md:w-auto md:max-w-md md:flex-1">
          <Search className="h-4 w-4 shrink-0 text-slate-500" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search culverts, guardrail, curb, tank…"
            className="w-full bg-transparent text-[13px] text-slate-100 placeholder:text-slate-500 focus:outline-none"
          />
          {query ? (
            <button onClick={() => setQuery("")} aria-label="Clear search" className="text-slate-500 hover:text-slate-300">
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-[12px] text-slate-400">{items.length} drawings</span>
          {onClose ? (
            <button
              onClick={onClose}
              className="flex items-center gap-1.5 rounded-lg border border-[#3a3b42] px-3 py-1.5 text-[12px] text-slate-300 transition hover:bg-white/5 hover:text-white"
            >
              <X className="h-4 w-4" /> Close
            </button>
          ) : null}
        </div>
      </div>

      {/* Type tabs — Drawings (complete sheets) vs Parts (reusable details). */}
      <div className="flex items-center gap-2 border-b border-[#34353c] bg-[#17181c] px-3 py-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {([
          { id: "all", label: "All", icon: LayoutGrid, count: kindCounts.all },
          { id: "drawing", label: "Drawings", icon: Layers, count: kindCounts.drawing },
          { id: "object", label: "Parts", icon: Puzzle, count: kindCounts.object },
        ] as const).map((t) => {
          const active = kindTab === t.id;
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setKindTab(t.id)}
              className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] transition ${
                active ? "bg-[#f0a13a] font-medium text-[#1c1206]" : "text-slate-300 hover:bg-white/5 hover:text-white"
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
              <span className={`text-[11px] ${active ? "opacity-80" : "text-slate-500"}`}>{t.count}</span>
            </button>
          );
        })}
        </div>
        <button
          type="button"
          onClick={() => setShowFilters(true)}
          className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border border-[#3a3b42] px-3 py-1.5 text-[13px] text-slate-300 transition hover:bg-white/5 hover:text-white md:hidden"
        >
          <SlidersHorizontal className="h-4 w-4" /> Filters
          {selectedLeaves.size > 0 ? (
            <span className="rounded-full bg-[#f0a13a] px-1.5 text-[10px] font-semibold text-[#1c1206]">{selectedLeaves.size}</span>
          ) : null}
        </button>
      </div>

      {/* Body */}
      <div className="relative flex min-h-0 flex-1">
        {/* Backdrop for the mobile filter drawer */}
        {showFilters ? (
          <div onClick={() => setShowFilters(false)} className="absolute inset-0 z-20 bg-black/50 md:hidden" aria-hidden />
        ) : null}
        {/* Left rail — inline on desktop, slide-over filter drawer on mobile/tablet */}
        <div
          className={`${showFilters ? "block" : "hidden"} absolute inset-y-0 left-0 z-30 w-64 max-w-[80%] overflow-y-auto border-r border-[#34353c] bg-[#1a1b20] p-2 shadow-2xl md:static md:block md:w-48 md:max-w-none md:shrink-0 md:shadow-none`}
        >
          <div className="mb-1 flex items-center justify-between px-1 md:hidden">
            <span className="text-[12px] font-semibold text-slate-200">Filters</span>
            <button
              onClick={() => setShowFilters(false)}
              aria-label="Close filters"
              className="rounded-md p-1 text-slate-400 transition hover:bg-white/5 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="px-2 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            Browse
          </div>
          <button className={railBtn(scope === "all")} onClick={() => setScope("all")}>
            <LayoutGrid className="h-4 w-4" /> All drawings
            <span className="ml-auto text-[11px] opacity-70">{libraryItems.length}</span>
          </button>
          <button className={railBtn(scope === "favorites")} onClick={() => setScope("favorites")}>
            <Star className="h-4 w-4" /> Favorites
            <span className="ml-auto text-[11px] opacity-70">{favoriteIds.length}</span>
          </button>
          <button className={railBtn(scope === "recent")} onClick={() => setScope("recent")}>
            <Clock className="h-4 w-4" /> Recent
          </button>

          <div className="flex items-center justify-between px-2 pb-1.5 pt-3">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Categories</span>
            {selectedLeaves.size > 0 ? (
              <button
                onClick={() => setSelectedLeaves(new Set())}
                className="text-[10px] font-medium text-[#f0a13a] hover:text-[#f6b75e]"
              >
                Clear ({selectedLeaves.size})
              </button>
            ) : null}
          </div>

          {/* Expandable category tree — click a category to expand, tick
              subcategories to filter (union of the selected leaves). */}
          {LIBRARY_CATEGORIES.map((category) => {
            const subs = subsFor(category.id);
            const isOpen = expanded.has(category.id);
            return (
              <div key={category.id}>
                <button
                  className="flex w-full items-center gap-1.5 rounded-lg px-2 py-2 text-left text-[13px] text-slate-200 transition hover:bg-white/5 hover:text-white"
                  onClick={() => toggleExpanded(category.id)}
                  aria-expanded={isOpen}
                >
                  {isOpen ? (
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                  )}
                  <span className="flex-1 truncate font-medium">{category.label}</span>
                  <span className="text-[11px] text-slate-500">{counts.get(category.id) ?? 0}</span>
                </button>
                {isOpen ? (
                  <div className="mb-1 ml-2 border-l border-[#34353c] pl-1.5">
                    {subs.map((sub) => (
                      <div key={sub.label || category.id} className="mb-0.5">
                        {sub.label ? (
                          <div className="px-2 pb-0.5 pt-1.5 text-[10px] uppercase tracking-[0.1em] text-slate-600">
                            {sub.label}
                          </div>
                        ) : null}
                        {sub.leaves.map((leaf) => {
                          const on = selectedLeaves.has(leaf.key);
                          const count = leafCounts.get(leaf.key) ?? 0;
                          return (
                            <button
                              key={leaf.key}
                              onClick={() => toggleLeaf(leaf.key)}
                              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] transition ${
                                on ? "text-white" : "text-slate-300 hover:bg-white/5 hover:text-white"
                              }`}
                            >
                              <span
                                className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${
                                  on ? "border-[#f0a13a] bg-[#f0a13a] text-[#1c1206]" : "border-[#4a4b52]"
                                }`}
                              >
                                {on ? <Check className="h-2.5 w-2.5" strokeWidth={3} /> : null}
                              </span>
                              <span className="flex-1 truncate">{leaf.label}</span>
                              <span className={`text-[11px] ${on ? "text-[#f0a13a]" : "text-slate-600"}`}>{count}</span>
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        {/* Grid */}
        <div className="min-w-0 flex-1 overflow-y-auto p-4">
          {items.length === 0 ? (
            <div className="mx-auto mt-16 max-w-sm rounded-2xl border border-dashed border-[#3a3b42] px-6 py-10 text-center text-[13px] text-slate-400">
              No drawings match the current search.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] sm:gap-3.5">
              {items.map((item) => {
                const isFavorite = favoriteIds.includes(item.id);
                const imported = Boolean(justImported[item.id]);
                return (
                  <div
                    key={item.id}
                    className="group relative overflow-hidden rounded-xl border border-[#34353c] bg-[#202127] transition hover:border-[#f0a13a]"
                    title={[
                      item.name,
                      `${item.category} · ${item.assetType === "drawing" ? "Template" : "Object"}`,
                      item.tags.length ? `Tags: ${item.tags.join(", ")}` : "",
                    ]
                      .filter(Boolean)
                      .join("\n")}
                  >
                    <button
                      type="button"
                      onClick={() => void handleImport(item)}
                      className="block w-full"
                      aria-label={`Import ${displayLibraryName(item.name)}`}
                    >
                      <LibraryThumbnail
                        id={item.id}
                        svg={item.svg}
                        thumbnail={item.thumbnail}
                        alt={item.name}
                        className="flex h-24 items-center justify-center overflow-hidden bg-white p-1.5"
                      />
                      <div
                        className={`pointer-events-none absolute inset-x-0 top-0 flex h-24 items-center justify-center transition ${
                          imported ? "bg-[#0f3d2e]/80 opacity-100" : "bg-[#141519]/55 opacity-0 group-hover:opacity-100"
                        }`}
                      >
                        <span className="flex items-center gap-1.5 rounded-lg bg-[#f0a13a] px-3 py-1.5 text-[12px] font-medium text-[#1c1206]">
                          {imported ? (
                            <>
                              <Check className="h-3.5 w-3.5" /> Imported
                            </>
                          ) : (
                            "Import"
                          )}
                        </span>
                      </div>
                    </button>

                    {/* Admin: open this warehouse drawing on the canvas to clean
                        it up and save it back. Seed (bundled) items aren't
                        DB-backed, so there's nothing to overwrite — hide it. */}
                    {onEdit && item.source !== "seed" ? (
                      <button
                        type="button"
                        onClick={() => onEdit(item)}
                        aria-label={`Edit ${displayLibraryName(item.name)} in canvas`}
                        title="Edit in canvas"
                        className="absolute left-1.5 top-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-lg border border-[#3a3b42] bg-[#141519]/70 text-slate-200 opacity-0 transition hover:bg-[#f0a13a] hover:text-[#1c1206] group-hover:opacity-100"
                      >
                        <PencilRuler className="h-4 w-4" />
                      </button>
                    ) : null}

                    {/* Zoom / preview — larger crisp view without importing. */}
                    <button
                      type="button"
                      onClick={() => void openPreview(item)}
                      aria-label={`Preview ${displayLibraryName(item.name)}`}
                      title="Preview"
                      className="absolute right-1.5 top-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-lg border border-[#3a3b42] bg-[#141519]/70 text-slate-200 opacity-0 transition hover:bg-[#f0a13a] hover:text-[#1c1206] group-hover:opacity-100"
                    >
                      <ZoomIn className="h-4 w-4" />
                    </button>

                    <div className="flex items-start gap-1.5 px-2.5 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[12.5px] leading-tight text-slate-100">
                          {displayLibraryName(item.name)}
                        </div>
                        <div className="mt-0.5 truncate text-[11px] text-slate-500">
                          {item.category}
                          {item.assetType === "drawing" ? " · template" : ""}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onToggleFavorite(item.id)}
                        className={`shrink-0 text-base leading-none transition ${
                          isFavorite ? "text-[#f0a13a]" : "text-slate-600 hover:text-[#f0a13a]"
                        }`}
                        aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
                      >
                        {isFavorite ? "★" : "☆"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {preview ? (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-[#0c0d10]/85 p-6"
          role="dialog"
          aria-modal="true"
          aria-label={`Preview: ${displayLibraryName(preview.item.name)}`}
          onClick={() => setPreview(null)}
        >
          <div
            className="mx-auto flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[#34353c] bg-[#1c1d22]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-[#34353c] px-4 py-3">
              <div className="min-w-0">
                <div className="truncate text-[14px] font-medium text-slate-100">
                  {displayLibraryName(preview.item.name)}
                </div>
                <div className="truncate text-[11px] text-slate-500">
                  {preview.item.category}
                  {preview.item.tags.length ? ` · ${preview.item.tags.slice(0, 4).join(", ")}` : ""}
                </div>
              </div>
              <div className="ml-auto flex items-center gap-2">
                {onEdit && preview.item.source !== "seed" ? (
                  <button
                    type="button"
                    onClick={() => {
                      onEdit(preview.item);
                      setPreview(null);
                    }}
                    className="flex items-center gap-1.5 rounded-lg border border-[#3a3b42] px-3 py-1.5 text-[12px] font-medium text-slate-200 transition hover:bg-white/5 hover:text-white"
                  >
                    <PencilRuler className="h-4 w-4" /> Edit in canvas
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    void handleImport(preview.item);
                    setPreview(null);
                  }}
                  className="flex items-center gap-1.5 rounded-lg bg-[#f0a13a] px-3 py-1.5 text-[12px] font-medium text-[#1c1206]"
                >
                  Import
                </button>
                <button
                  type="button"
                  onClick={() => setPreview(null)}
                  aria-label="Close preview"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#3a3b42] text-slate-300 transition hover:bg-white/5"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-white p-4">
              {preview.loading ? (
                <span className="text-[13px] text-slate-400">Loading preview…</span>
              ) : preview.svg ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`data:image/svg+xml;utf8,${encodeURIComponent(preview.svg)}`}
                  alt={preview.item.name}
                  className="max-h-[78vh] max-w-full object-contain"
                />
              ) : preview.item.thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview.item.thumbnail} alt={preview.item.name} className="max-h-[78vh] max-w-full object-contain" />
              ) : (
                <span className="text-[13px] text-slate-400">No preview available.</span>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
