"use client";

import { useCallback, useEffect, useState } from "react";
import AdminGate from "@/components/drawings/AdminGate";
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
  postLibraryImport,
  subscribeLibraryChanges,
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

  // Thumbnails stream in per-batch after the metadata list lands, so the grid
  // is browsable immediately instead of waiting on one multi-MB response.
  const mergeThumbnails = useCallback((batch: Record<string, string>) => {
    setItems((current) =>
      current.map((item) => (batch[item.id] ? { ...item, thumbnail: batch[item.id] } : item)),
    );
  }, []);

  // A refreshed list arrives without thumbnails (metadata-only) — keep the
  // ones already on screen so focus-driven refreshes don't blank the grid;
  // changed thumbnails are replaced when their stream batch lands.
  const applyList = useCallback((list: LibraryItem[]) => {
    setItems((current) => {
      const known = new Map(current.map((item) => [item.id, item.thumbnail]));
      return list.map((item) =>
        item.thumbnail ? item : { ...item, thumbnail: known.get(item.id) },
      );
    });
  }, []);

  useEffect(() => {
    document.title = "Drawing library · Planovera";
    setFavoriteIds(loadFavoriteIds());
    setRecentIds(loadRecentIds());
    void fetchCurrentUserRole().then((role) => setIsAdmin(role === "admin"));
    let active = true;
    fetchDrawingLibrary((batch) => {
      if (active) mergeThumbnails(batch);
    })
      .then((list) => {
        if (active) applyList(list);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [applyList, mergeThumbnails]);

  const refreshLibrary = useCallback(async () => {
    const list = await fetchDrawingLibrary(mergeThumbnails);
    applyList(list);
  }, [applyList, mergeThumbnails]);

  useEffect(() => {
    // The studio saves admin edits in a separate tab; without a refresh here the
    // grid keeps showing pre-edit thumbnails until a manual reload. Refetch when
    // the studio broadcasts a change, and when this tab regains focus.
    const onFocus = () => {
      void refreshLibrary();
    };
    window.addEventListener("focus", onFocus);
    const unsubscribe = subscribeLibraryChanges(() => {
      void refreshLibrary();
    });
    return () => {
      window.removeEventListener("focus", onFocus);
      unsubscribe();
    };
  }, [refreshLibrary]);

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

  // Admin: open the drawing on the studio canvas for a clean-up. The id rides in
  // the URL so the studio loads it deterministically once booted, then offers
  // "Save changes to library".
  const handleEditInCanvas = useCallback((item: LibraryItem) => {
    const url = `/drawings/studio?editLibraryId=${encodeURIComponent(item.id)}`;
    window.open(url, "planovera-studio");
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#141519] text-[13px] text-slate-400">
        Loading library…
      </div>
    );
  }

  return (
    <AdminGate>
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
    </AdminGate>
  );
}
