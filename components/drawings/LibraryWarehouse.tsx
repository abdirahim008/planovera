"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, X, Star, Clock, LayoutGrid, Check } from "lucide-react";
import {
  LIBRARY_CATEGORIES,
  type LibraryCategory,
  type LibraryItem,
} from "@/lib/drawings/appModel";
import { LibraryThumbnail, displayLibraryName } from "./LibraryThumbnail";

type Scope = LibraryCategory | "all" | "favorites" | "recent";

interface LibraryWarehouseProps {
  libraryItems: LibraryItem[];
  favoriteIds: string[];
  recentIds: string[];
  onToggleFavorite: (libraryId: string) => void;
  // Import sends the item to the studio tab (or canvas). The browser stays open
  // so several items can be imported in a row.
  onImport: (item: LibraryItem) => void | Promise<void>;
  onClose?: () => void;
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
  onClose,
}: LibraryWarehouseProps) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<Scope>("all");
  const [assetFilter, setAssetFilter] = useState<"all" | "object" | "drawing">("all");
  const [justImported, setJustImported] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of libraryItems) map.set(item.category, (map.get(item.category) ?? 0) + 1);
    return map;
  }, [libraryItems]);

  const items = useMemo(() => {
    const needle = query.trim().toLowerCase();
    let pool = libraryItems;
    if (scope === "favorites") pool = pool.filter((i) => favoriteIds.includes(i.id));
    else if (scope === "recent")
      pool = recentIds.map((id) => pool.find((i) => i.id === id)).filter((i): i is LibraryItem => Boolean(i));
    else if (scope !== "all") pool = pool.filter((i) => i.category === scope);

    return pool.filter((item) => {
      const effectiveType = item.assetType ?? "object";
      if (assetFilter !== "all" && effectiveType !== assetFilter) return false;
      if (!needle) return true;
      const haystack = [item.name, item.description, ...item.tags, item.author].join(" ").toLowerCase();
      return haystack.includes(needle);
    });
  }, [assetFilter, favoriteIds, libraryItems, query, recentIds, scope]);

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
    <div className="flex h-screen w-screen flex-col bg-[#141519]" aria-label="Drawing library">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-[#34353c] bg-[#202127] px-4 py-3">
        <span className="flex items-center gap-2 text-[15px] font-medium text-slate-100">
          <LayoutGrid className="h-5 w-5 text-[#f0a13a]" />
          Drawing library
        </span>
        <div className="flex max-w-md flex-1 items-center gap-2 rounded-lg border border-[#3a3b42] bg-[#15161a] px-3 py-2">
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

      {/* Body */}
      <div className="flex min-h-0 flex-1">
        {/* Left rail */}
        <div className="w-48 shrink-0 overflow-y-auto border-r border-[#34353c] bg-[#1a1b20] p-2">
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

          <div className="px-2 pb-1.5 pt-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            Categories
          </div>
          {LIBRARY_CATEGORIES.map((category) => (
            <button key={category.id} className={railBtn(scope === category.id)} onClick={() => setScope(category.id)}>
              <span className="truncate">{category.label}</span>
              <span className="ml-auto text-[11px] opacity-70">{counts.get(category.id) ?? 0}</span>
            </button>
          ))}

          <div className="mx-2 my-3 border-t border-[#34353c]" />
          <div className="inline-flex w-full rounded-lg border border-[#3a3b42] bg-[#15161a] p-0.5 text-[11px] font-medium">
            {[
              { id: "all" as const, label: "All" },
              { id: "object" as const, label: "Objects" },
              { id: "drawing" as const, label: "Templates" },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setAssetFilter(f.id)}
                className={`flex-1 rounded-md px-2 py-1.5 transition ${
                  assetFilter === f.id ? "bg-[#f0a13a] text-[#1c1206]" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Grid */}
        <div className="min-w-0 flex-1 overflow-y-auto p-4">
          {items.length === 0 ? (
            <div className="mx-auto mt-16 max-w-sm rounded-2xl border border-dashed border-[#3a3b42] px-6 py-10 text-center text-[13px] text-slate-400">
              No drawings match the current search.
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-3.5">
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
    </div>
  );
}
