"use client";

import { useCallback, useEffect, useState } from "react";
import LibraryWarehouse from "@/components/drawings/LibraryWarehouse";
import {
  loadFavoriteIds,
  loadRecentIds,
  persistFavoriteIds,
  type LibraryItem,
} from "@/lib/drawings/appModel";
import {
  fetchCurrentUserRole,
  fetchDrawingLibrary,
  fetchLibraryItemSvg,
  postLibraryEdit,
  postLibraryImport,
} from "@/lib/drawings/libraryBridge";

// Standalone library browser — opened in its own tab from the studio so the
// canvas tab stays light. "Import" hands the chosen drawing to the studio tab
// (via the cross-tab queue); only then is it inserted on the canvas.
export default function DrawingLibraryPage() {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    document.title = "Drawing library · Planovera";
    setFavoriteIds(loadFavoriteIds());
    setRecentIds(loadRecentIds());
    void fetchCurrentUserRole().then((role) => setIsAdmin(role === "admin"));
    let active = true;
    fetchDrawingLibrary()
      .then((list) => {
        if (active) setItems(list);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleToggleFavorite = useCallback((libraryId: string) => {
    setFavoriteIds((current) => {
      const next = current.includes(libraryId)
        ? current.filter((id) => id !== libraryId)
        : [...current, libraryId];
      persistFavoriteIds(next);
      return next;
    });
  }, []);

  const handleImport = useCallback((item: LibraryItem) => {
    postLibraryImport(item.id);
    // Reflect it locally as recently used too.
    setRecentIds((current) => [item.id, ...current.filter((id) => id !== item.id)]);
  }, []);

  // Admin: open the drawing on the studio canvas for a clean-up. Mirrors the
  // admin panel — enqueue the edit, then open/focus the studio tab; the studio
  // loads it on a fresh sheet and offers "Save changes to library".
  const handleEditInCanvas = useCallback((item: LibraryItem) => {
    postLibraryEdit(item.id);
    window.open("/drawings/studio", "planovera-studio");
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#141519] text-[13px] text-slate-400">
        Loading library…
      </div>
    );
  }

  return (
    <LibraryWarehouse
      libraryItems={items}
      favoriteIds={favoriteIds}
      recentIds={recentIds}
      onToggleFavorite={handleToggleFavorite}
      onImport={handleImport}
      onEdit={isAdmin ? handleEditInCanvas : undefined}
      onResolveSvg={fetchLibraryItemSvg}
      onClose={() => window.close()}
    />
  );
}
