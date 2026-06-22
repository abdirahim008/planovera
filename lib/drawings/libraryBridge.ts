// Cross-tab bridge for the drawing library.
//
// The library browser lives in its own browser tab (so the canvas tab stays
// lightweight while you browse). When you click "Import" there, the chosen item
// is queued in localStorage; the studio tab drains the queue — on the `storage`
// event (fired in other tabs) and on focus — and inserts it on the canvas.
//
// Also exposes fetchDrawingLibrary(): the same seed+DB item list the studio
// builds, so the standalone library page shows exactly what the studio would.

import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase-browser";
import {
  SEED_LIBRARY_ITEMS,
  loadLibraryItems,
  mapLibraryRecord,
  type LibraryItem,
  type LibraryItemRecord,
} from "./appModel";

const QUEUE_KEY = "drawflow-library-import-queue";

export type LibraryAction = "import" | "edit";

interface QueueEntry {
  token: string;
  libraryId: string;
  action: LibraryAction;
}

function readQueue(): QueueEntry[] {
  try {
    const raw = window.localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    // Tolerate older entries that predate the `action` field.
    const parsed = JSON.parse(raw) as Array<{ token: string; libraryId: string; action?: LibraryAction }>;
    return parsed.map((e) => ({ ...e, action: e.action ?? "import" }));
  } catch {
    return [];
  }
}

function writeQueue(entries: QueueEntry[]) {
  try {
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(entries));
  } catch {
    /* ignore quota / disabled storage */
  }
}

function enqueue(libraryId: string, action: LibraryAction) {
  const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  writeQueue([...readQueue(), { token, libraryId, action }]);
}

// Library tab → enqueue an import for the studio tab to drop on the canvas.
export function postLibraryImport(libraryId: string) {
  enqueue(libraryId, "import");
}

// Library tab → enqueue an admin edit: the studio opens the drawing for editing.
export function postLibraryEdit(libraryId: string) {
  enqueue(libraryId, "edit");
}

/**
 * Studio tab → run `handler` for each freshly-queued library action. Drains on
 * the cross-tab `storage` event and on window focus (so an action raised while
 * the studio was unfocused — or before it was open — still lands). Returns an
 * unsubscribe function.
 */
export function subscribeLibraryActions(
  handler: (libraryId: string, action: LibraryAction) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const processed = new Set<string>();

  const drain = () => {
    const queue = readQueue();
    if (queue.length === 0) return;
    for (const entry of queue) {
      if (processed.has(entry.token)) continue;
      processed.add(entry.token);
      handler(entry.libraryId, entry.action);
    }
    writeQueue([]);
  };

  const onStorage = (event: StorageEvent) => {
    if (event.key === QUEUE_KEY) drain();
  };

  window.addEventListener("storage", onStorage);
  window.addEventListener("focus", drain);
  drain(); // catch anything queued before we subscribed

  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("focus", drain);
  };
}

// Current user's role for the standalone library page (admin gating). Returns
// null when not configured / not signed in.
export async function fetchCurrentUserRole(): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  return (data?.role as string) ?? null;
}

// Admin delete of a shared library item from the standalone library page.
export async function deleteSharedLibraryItem(id: string): Promise<{ error?: string }> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Not connected." };
  const { error } = await supabase.from("drawing_library_items").delete().eq("id", id);
  return error ? { error: error.message } : {};
}

// Admin-only metadata edit for a shared drawing (name / category / description /
// tags). The heavy SVG itself is managed via the upload scripts; this only
// curates the searchable metadata. RLS restricts writes to platform admins.
export async function updateSharedLibraryItem(
  id: string,
  fields: { name: string; category: string; description: string; tags: string[] },
): Promise<{ error?: string }> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Not connected." };
  const { error } = await supabase
    .from("drawing_library_items")
    .update({
      name: fields.name,
      category: fields.category,
      description: fields.description,
      tags: fields.tags,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  return error ? { error: error.message } : {};
}

// Admin warehouse list — metadata only (no svg, no thumbnail), so the grid
// loads instantly even with a large library and never hangs on a multi-MB
// payload. Thumbnails are streamed in afterwards via fetchSharedLibraryThumbnails.
// Returns an error string instead of throwing so the caller can always clear its
// loading state and show what went wrong.
export async function fetchSharedLibraryItems(): Promise<{ items: LibraryItem[]; error?: string }> {
  if (!isSupabaseConfigured()) return { items: [] };
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { items: [] };
  try {
    const { data, error } = await supabase
      .from("drawing_library_items")
      .select("id,name,category,description,tags,author_id,author_name,updated_at")
      .order("updated_at", { ascending: false });
    if (error) return { items: [], error: error.message };
    return { items: (data as LibraryItemRecord[]).map(mapLibraryRecord) };
  } catch (error) {
    return { items: [], error: error instanceof Error ? error.message : String(error) };
  }
}

// Deferred bulk thumbnail fetch for the admin grid: one query, id → thumbnail.
// Kept separate from the list so a slow/large thumbnail payload never blocks (or
// breaks) the drawings from appearing.
export async function fetchSharedLibraryThumbnails(): Promise<Record<string, string>> {
  if (!isSupabaseConfigured()) return {};
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return {};
  try {
    const { data, error } = await supabase.from("drawing_library_items").select("id,thumbnail");
    if (error || !data) return {};
    const map: Record<string, string> = {};
    for (const row of data as Array<{ id: string; thumbnail: string | null }>) {
      if (row.thumbnail) map[row.id] = row.thumbnail;
    }
    return map;
  } catch {
    return {};
  }
}

// Merge remote (DB) library items with the static seed set, de-duped by name.
function mergeWithSeed(remoteItems: LibraryItem[]): LibraryItem[] {
  const seen = new Set(remoteItems.map((item) => item.name.toLowerCase()));
  return [...remoteItems, ...SEED_LIBRARY_ITEMS.filter((item) => !seen.has(item.name.toLowerCase()))];
}

/**
 * Build the full library list for the standalone browser. Mirrors the studio:
 * when Supabase is configured, the shared DB items (metadata only — the heavy
 * svg is fetched lazily on insert) merged with the seed set; otherwise the
 * local seed + personal items.
 */
export async function fetchDrawingLibrary(): Promise<LibraryItem[]> {
  if (!isSupabaseConfigured()) return loadLibraryItems();
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return loadLibraryItems();
  try {
    const { data, error } = await supabase
      .from("drawing_library_items")
      .select("id,name,category,description,tags,thumbnail,author_id,author_name,updated_at")
      .order("updated_at", { ascending: false });
    if (error || !data) return loadLibraryItems();
    return mergeWithSeed((data as LibraryItemRecord[]).map(mapLibraryRecord));
  } catch {
    // Network/transport error — fall back to the local seed set rather than
    // throwing (which would leave callers stuck on their loading state).
    return loadLibraryItems();
  }
}

// Resolve a library item's full SVG for a large preview (seed items carry it;
// DB items load metadata-only, so fetch the heavy svg by id on demand).
export async function fetchLibraryItemSvg(item: LibraryItem): Promise<string> {
  if (item.svg) return item.svg;
  if (!isSupabaseConfigured()) return "";
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return "";
  const { data } = await supabase
    .from("drawing_library_items")
    .select("svg")
    .eq("id", item.id)
    .single();
  return (data?.svg as string) ?? "";
}
