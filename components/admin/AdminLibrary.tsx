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
            href="/"
            className="text-txt-muted hover:text-txt transition-colors"
          >
            <ArrowLeft size={18} />
          </a>
          <div>
            <h1 className="text-xl font-bold">BOQ Library Administration</h1>
            <p className="text-xs text-txt-muted mt-0.5">
              Manage reusable BOQ templates for all users
            </p>
          </div>
        </div>
      ) : (
        <div className="mb-6">
          <h2 className="text-xl font-bold">BOQ Library Administration</h2>
          <p className="text-xs text-txt-muted mt-0.5">
            Manage reusable BOQ templates for all users
          </p>
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

      <div className="flex flex-col gap-3">
        {boqLibrary.map((item) => {
          const itemCount = item.sheets.reduce(
            (s, sh) => s + sh.rows.filter((r) => r.type === "item").length,
            0
          );
          return (
            <div
              key={item.id}
              className="bg-bg-surface border border-border rounded-xl p-5 animate-fade-in"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
                    <FileSpreadsheet size={20} className="text-accent" />
                  </div>
                  <div>
                    <div className="font-semibold">{item.name}</div>
                    <div className="text-xs text-txt-muted mt-0.5">
                      {item.description}
                    </div>
                    <div className="flex gap-2 mt-2">
                      <Badge color="accent">{item.category}</Badge>
                      <Badge color="ok">
                        {item.sheets.length} sheet{item.sheets.length !== 1 ? "s" : ""}
                      </Badge>
                      <Badge color="warn">{itemCount} items</Badge>
                    </div>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => setConfirmDelete(item.id)}
                >
                  <Trash2 size={13} />
                </Button>
              </div>

              {/* Preview */}
              <div className="mt-3 ml-13 p-3 bg-bg-raised rounded-lg text-xs">
                {item.sheets[0]?.rows.slice(0, 6).map((r, i) => (
                  <div key={i} className="flex gap-2 py-0.5 text-txt-muted">
                    {r.type === "header" ? (
                      <span className="font-bold text-txt">{r.description}</span>
                    ) : r.type === "notes" ? (
                      <span className="italic text-txt-dim">Note: {r.description}</span>
                    ) : r.type === "subtotal" || r.type === "grandtotal" ? (
                      <span className="font-semibold italic">{r.description}</span>
                    ) : (
                      <>
                        <span className="w-10 text-txt-dim">{r.itemNo}</span>
                        <span className="flex-1 truncate">{r.description}</span>
                        <span className="w-10 text-center">{r.unit}</span>
                      </>
                    )}
                  </div>
                ))}
                {(item.sheets[0]?.rows.length || 0) > 6 && (
                  <div className="text-txt-dim mt-1">
                    ... +{(item.sheets[0]?.rows.length || 0) - 6} more rows
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

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
