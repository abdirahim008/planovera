"use client";

import { useState } from "react";
import { useAppStore } from "@/lib/store";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase-browser";
import { FileSpreadsheet, Trash2, Plus, ArrowLeft } from "lucide-react";

export default function AdminLibrary({ embedded = false }: { embedded?: boolean }) {
  const authConfigured = isSupabaseConfigured();
  const { boqLibrary, deleteFromLibrary, setBOQLibrary } = useAppStore();
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyDeleteId, setBusyDeleteId] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!confirmDelete) return;

    if (!authConfigured) {
      deleteFromLibrary(confirmDelete);
      setConfirmDelete(null);
      setNotice(null);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setNotice("Supabase environment variables are missing.");
      return;
    }

    setBusyDeleteId(confirmDelete);
    setNotice(null);

    const { error } = await supabase
      .from("boq_library_items")
      .delete()
      .eq("id", confirmDelete);

    if (error) {
      setBusyDeleteId(null);
      setNotice(error.message);
      return;
    }

    setBOQLibrary(boqLibrary.filter((item) => item.id !== confirmDelete));
    setBusyDeleteId(null);
    setConfirmDelete(null);
  };

  const content = (
    <>
      {!embedded ? (
        <div className="flex items-center gap-3 mb-6">
          <a
            href="/workspace"
            className="text-txt-muted hover:text-txt transition-colors"
          >
            <ArrowLeft size={18} />
          </a>
          <div>
            <h1 className="text-xl font-semibold">BOQ library</h1>
          </div>
        </div>
      ) : (
        <div className="mb-6">
          <h2 className="text-xl font-semibold">BOQ library</h2>
        </div>
      )}

      {notice ? (
        <div className="mb-4 rounded-xl border border-err/30 bg-err/10 px-4 py-3 text-sm text-err">
          {notice}
        </div>
      ) : null}

      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-txt-muted">
          {boqLibrary.length} template{boqLibrary.length !== 1 ? "s" : ""} in library
        </span>
        <Button size="sm" variant="primary" disabled>
          <Plus size={14} /> Add Template
        </Button>
      </div>

      {boqLibrary.length === 0 ? null : (
        <div className="data-table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 36 }} aria-label="" />
                <th>Name</th>
                <th>Category</th>
                <th>Description</th>
                <th>Sheets</th>
                <th>Items</th>
                <th style={{ width: 36 }} aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {boqLibrary.map((item) => {
                const itemCount = item.sheets.reduce(
                  (s, sh) => s + sh.rows.filter((r) => r.type === "item").length,
                  0
                );
                return (
                  <tr key={item.id}>
                    <td>
                      <FileSpreadsheet size={16} className="text-accent" />
                    </td>
                    <td className="data-cell-wrap font-semibold">{item.name}</td>
                    <td>
                      <Badge color="accent">{item.category}</Badge>
                    </td>
                    <td className="data-cell-wrap text-txt-muted">
                      {item.description}
                    </td>
                    <td className="data-cell-num">{item.sheets.length}</td>
                    <td className="data-cell-num">{itemCount}</td>
                    <td className="data-cell-action">
                      <button
                        type="button"
                        className="data-row-action danger"
                        onClick={() => setConfirmDelete(item.id)}
                        aria-label="Delete template"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete Template"
        width={380}
      >
        <p className="text-sm text-txt-muted mb-4">
          Are you sure you want to delete this template? This action cannot be
          undone.
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={handleDelete}
            disabled={busyDeleteId === confirmDelete}
          >
            {busyDeleteId === confirmDelete ? "Deleting..." : "Delete"}
          </Button>
        </div>
      </Modal>
    </>
  );

  if (embedded) {
    return content;
  }

  return (
    <div className="min-h-screen bg-bg p-6 max-w-4xl mx-auto">
      {content}
    </div>
  );
}
