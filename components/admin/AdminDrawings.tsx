"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, RefreshCcw, Search, Trash2 } from "lucide-react";

import Modal from "@/components/ui/Modal";
import {
  LIBRARY_CATEGORIES,
  type LibraryCategory,
  type LibraryItem,
} from "@/lib/drawings/appModel";
import { displayLibraryName } from "@/components/drawings/LibraryThumbnail";
import {
  deleteSharedLibraryItem,
  fetchDrawingLibrary,
  updateSharedLibraryItem,
} from "@/lib/drawings/libraryBridge";

type EditState = {
  id: string;
  name: string;
  category: LibraryCategory;
  description: string;
  tags: string;
};

// Admin curation for the shared drawing warehouse. New drawings are uploaded via
// the scripts (scripts/upload-roads-drawings.mjs etc.); here a platform admin
// curates the searchable metadata (name / category / tags / description) and
// removes items. Seed drawings (bundled, not in the DB) aren't editable.
export default function AdminDrawings() {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"all" | LibraryCategory>("all");
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<LibraryItem | null>(null);
  const [editor, setEditor] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const list = await fetchDrawingLibrary();
    // Only DB-backed (curatable) drawings — the bundled seed set is read-only.
    setItems(list.filter((item) => item.source !== "seed"));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return items.filter((item) => {
      if (categoryFilter !== "all" && item.category !== categoryFilter) return false;
      if (!needle) return true;
      return [item.name, item.description, ...item.tags].join(" ").toLowerCase().includes(needle);
    });
  }, [items, search, categoryFilter]);

  const handleDelete = useCallback(async (item: LibraryItem) => {
    setBusyId(item.id);
    const { error } = await deleteSharedLibraryItem(item.id);
    setBusyId(null);
    setConfirmDelete(null);
    if (error) {
      setNotice(`Delete failed: ${error}`);
      return;
    }
    setItems((current) => current.filter((entry) => entry.id !== item.id));
    setNotice(`Removed “${displayLibraryName(item.name)}” from the warehouse.`);
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editor) return;
    setSaving(true);
    const tags = editor.tags
      .split(",")
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean);
    const { error } = await updateSharedLibraryItem(editor.id, {
      name: editor.name.trim(),
      category: editor.category,
      description: editor.description.trim(),
      tags,
    });
    setSaving(false);
    if (error) {
      setNotice(`Save failed: ${error}`);
      return;
    }
    setItems((current) =>
      current.map((entry) =>
        entry.id === editor.id
          ? { ...entry, name: editor.name.trim(), category: editor.category, description: editor.description.trim(), tags }
          : entry,
      ),
    );
    setEditor(null);
    setNotice("Drawing metadata saved.");
  }, [editor]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-txt">Drawing warehouse</h2>
        <p className="mt-1 text-sm leading-6 text-txt-muted">
          Curate the shared drawing library. New drawings are uploaded with the admin scripts; here you edit the
          searchable metadata (name, category, tags) and remove items. Bundled sample drawings aren’t shown — only
          published warehouse items.
        </p>
      </div>

      {notice ? (
        <div className="rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-sm text-accent">{notice}</div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-border bg-bg-surface px-3 py-2">
          <Search size={14} className="shrink-0 text-txt-dim" />
          <input
            className="w-full bg-transparent text-sm text-txt placeholder:text-txt-dim focus:outline-none"
            placeholder="Search name, tag or description…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <select
          className="input w-auto"
          value={categoryFilter}
          onChange={(event) => setCategoryFilter(event.target.value as "all" | LibraryCategory)}
        >
          <option value="all">All categories</option>
          {LIBRARY_CATEGORIES.map((category) => (
            <option key={category.id} value={category.id}>
              {category.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent/10 px-3.5 py-2 text-sm font-medium text-accent transition hover:bg-accent/20 disabled:opacity-40"
        >
          <RefreshCcw size={14} /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-border bg-bg-surface px-4 py-5 text-sm text-txt-muted">
          Loading warehouse drawings…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-txt-muted">
          No published warehouse drawings match. Upload drawings with the admin scripts, then refresh.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item) => (
            <div key={item.id} className="flex flex-col overflow-hidden rounded-xl border border-border bg-bg-surface">
              <div className="flex h-28 items-center justify-center border-b border-border bg-white p-2">
                {item.thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.thumbnail} alt={item.name} className="max-h-full max-w-full object-contain" />
                ) : (
                  <span className="text-xs text-txt-dim">No preview</span>
                )}
              </div>
              <div className="flex flex-1 flex-col gap-1 p-3">
                <div className="text-sm font-medium text-txt">{displayLibraryName(item.name)}</div>
                <div className="text-xs uppercase tracking-[0.1em] text-txt-dim">{item.category}</div>
                {item.tags.length ? (
                  <div className="mt-1 line-clamp-2 text-xs text-txt-muted">{item.tags.join(", ")}</div>
                ) : null}
                <div className="mt-auto flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() =>
                      setEditor({
                        id: item.id,
                        name: item.name,
                        category: item.category,
                        description: item.description,
                        tags: item.tags.join(", "),
                      })
                    }
                    className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-txt transition hover:bg-bg-hover"
                  >
                    <Pencil size={13} /> Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(item)}
                    disabled={busyId === item.id}
                    className="inline-flex items-center gap-1.5 rounded-md border border-danger/40 px-2.5 py-1.5 text-xs font-medium text-danger transition hover:bg-danger/10 disabled:opacity-40"
                  >
                    <Trash2 size={13} /> Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit metadata modal */}
      <Modal open={Boolean(editor)} onClose={() => setEditor(null)} title="Edit drawing metadata" width={520}>
        {editor ? (
          <div className="space-y-4">
            <div>
              <label className="label">Name</label>
              <input
                className="input"
                value={editor.name}
                onChange={(event) => setEditor((current) => (current ? { ...current, name: event.target.value } : current))}
              />
            </div>
            <div>
              <label className="label">Category</label>
              <select
                className="input"
                value={editor.category}
                onChange={(event) =>
                  setEditor((current) => (current ? { ...current, category: event.target.value as LibraryCategory } : current))
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
              <label className="label">Tags (comma separated)</label>
              <input
                className="input"
                value={editor.tags}
                onChange={(event) => setEditor((current) => (current ? { ...current, tags: event.target.value } : current))}
                placeholder="culvert, drainage, headwall"
              />
            </div>
            <div>
              <label className="label">Description</label>
              <textarea
                className="input min-h-[72px] resize-y"
                value={editor.description}
                onChange={(event) =>
                  setEditor((current) => (current ? { ...current, description: event.target.value } : current))
                }
              />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn" onClick={() => setEditor(null)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void handleSaveEdit()} disabled={saving}>
                {saving ? "Saving…" : "Save metadata"}
              </button>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* Delete confirm modal */}
      <Modal open={Boolean(confirmDelete)} onClose={() => setConfirmDelete(null)} title="Remove drawing" width={420}>
        {confirmDelete ? (
          <div className="space-y-4">
            <p className="text-sm leading-6 text-txt">
              Remove <strong>{displayLibraryName(confirmDelete.name)}</strong> from the shared warehouse? This can’t be
              undone (re-upload it with the scripts to restore).
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn" onClick={() => setConfirmDelete(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => void handleDelete(confirmDelete)}
                disabled={busyId === confirmDelete.id}
              >
                {busyId === confirmDelete.id ? "Removing…" : "Remove"}
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
