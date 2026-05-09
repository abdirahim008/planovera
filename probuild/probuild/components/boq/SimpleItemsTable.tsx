"use client";

import { useState, useEffect } from "react";
import {
  Plus,
  Copy,
  ClipboardPaste,
  ArrowUp,
  ArrowDown,
  Trash2,
  ArrowLeft,
  Pencil,
  Save,
  Table,
  ChevronRight,
} from "lucide-react";
import { useAppStore, currency } from "@/lib/store";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import ContextMenu, { type ContextMenuItem } from "@/components/ui/ContextMenu";

const COLS = [
  { key: "sn", label: "S/N", width: "w-14", align: "text-center" },
  { key: "description", label: "Description", width: "min-w-[240px] flex-1", align: "text-left" },
  { key: "unit", label: "Unit", width: "w-16", align: "text-center" },
  { key: "qty", label: "Qty", width: "w-20", align: "text-right", mono: true },
  { key: "rate", label: "Rate", width: "w-24", align: "text-right", mono: true },
  { key: "amount", label: "Amount", width: "w-28", align: "text-right", mono: true },
];

// ─── Create Item Set Modal ────────────────────────────────────────
function CreateItemSetModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { createSimpleItemSet } = useAppStore();
  const [name, setName] = useState("");

  const handleCreate = () => {
    if (!name.trim()) return;
    createSimpleItemSet(name.trim());
    onClose();
    setName("");
  };

  return (
    <Modal open={open} onClose={onClose} title="Create New Item List" width={420}>
      <div className="flex flex-col gap-4">
        <div>
          <label className="text-xs font-semibold text-txt-muted uppercase tracking-wider block mb-1.5">
            List Name
          </label>
          <input
            autoFocus
            className="w-full px-3 py-2.5 bg-bg-input border border-border rounded-lg text-sm text-txt outline-none focus:border-accent transition-colors placeholder:text-txt-dim"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            placeholder="e.g. Equipment List, Deliverables"
          />
        </div>
        <div className="flex justify-end gap-3 mt-1">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!name.trim()} onClick={handleCreate}>
            <Plus size={14} /> Create
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Items List View ──────────────────────────────────────────────
function ItemsListView({
  onOpen,
  onCreateClick,
}: {
  onOpen: (id: string) => void;
  onCreateClick: () => void;
}) {
  const { savedSimpleItemSets, deleteSimpleItemSet, duplicateSimpleItemSet } = useAppStore();
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  return (
    <>
      {savedSimpleItemSets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-20 h-20 rounded-2xl bg-accent/10 flex items-center justify-center mb-5">
            <Table size={32} className="text-accent opacity-60" />
          </div>
          <p className="text-txt-muted text-sm font-medium">No item lists created yet</p>
          <p className="text-xs text-txt-dim mt-1.5 max-w-[280px] text-center">
            Create an item list for your project deliverables and line items
          </p>
          <Button variant="primary" size="md" className="mt-5" onClick={onCreateClick}>
            <Plus size={14} /> Create First Item List
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {savedSimpleItemSets.map((sis, idx) => {
            const itemCount = sis.items.filter((i) => i.description).length;
            const totalAmount = sis.items.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);

            return (
              <div
                key={sis.id}
                className="group flex items-center justify-between p-4 bg-bg-surface border border-border rounded-xl cursor-pointer transition-all duration-200 hover:border-accent/50 hover:shadow-lg hover:shadow-accent/5"
                style={{ animationDelay: `${idx * 60}ms`, animationFillMode: "both" }}
                onClick={() => onOpen(sis.id)}
              >
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-accent/20 to-accent/5 flex items-center justify-center flex-shrink-0">
                    <Table size={20} className="text-accent" />
                  </div>
                  <div>
                    <div className="font-semibold text-sm">{sis.name}</div>
                    <div className="flex gap-3 mt-1.5 text-[11px] text-txt-dim">
                      <span>{itemCount} item{itemCount !== 1 ? "s" : ""}</span>
                      <span>•</span>
                      <span>Modified {new Date(sis.updatedAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {totalAmount > 0 && (
                    <div className="text-right mr-2">
                      <div className="text-[10px] text-txt-dim uppercase tracking-wider">Total</div>
                      <div className="font-mono text-sm font-bold mt-0.5 text-ok">
                        $ {currency(totalAmount)}
                      </div>
                    </div>
                  )}
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => { e.stopPropagation(); duplicateSimpleItemSet(sis.id); }}
                      className="p-1.5 rounded-md bg-transparent border-none text-txt-dim hover:text-accent hover:bg-accent/10 cursor-pointer transition-colors"
                      title="Duplicate"
                    >
                      <Copy size={14} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget({ id: sis.id, name: sis.name }); }}
                      className="p-1.5 rounded-md bg-transparent border-none text-txt-dim hover:text-err hover:bg-err/10 cursor-pointer transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <ChevronRight size={16} className="text-txt-dim group-hover:text-accent transition-colors" />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {deleteTarget && (
        <Modal open={true} onClose={() => setDeleteTarget(null)} title="Delete Item List" width={400}>
          <p className="text-sm text-txt-muted mb-5">
            Are you sure you want to delete <strong>{deleteTarget.name}</strong>? This action cannot be undone.
          </p>
          <div className="flex gap-3">
            <Button variant="ghost" className="flex-1 justify-center" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              className="flex-1 justify-center"
              onClick={() => {
                deleteSimpleItemSet(deleteTarget.id);
                setDeleteTarget(null);
              }}
            >
              <Trash2 size={14} /> Delete
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}

// ─── Items Table (view/edit) ──────────────────────────────────────
function ItemsTable({ readOnly = false }: { readOnly?: boolean }) {
  const {
    simpleItems: items,
    updateSimpleItem: update,
    addSimpleItem: addRow,
    deleteSimpleItem: deleteRow,
    insertSimpleItemAt: insertRowAt,
    moveSimpleItem: moveRow,
    pasteSimpleItemAt: pasteRowAt,
  } = useAppStore();

  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [clipboard, setClipboard] = useState<any[]>([]);

  const handleContextMenu = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation(); // Stop bubbling to backdrop
    setSelectedRowId(id);
    setCtxMenu({ x: e.clientX, y: e.clientY });
  };

  const copyRow = () => {
    if (!selectedRowId) return;
    const item = items.find((r) => r.id === selectedRowId);
    if (item) setClipboard([{ ...item }]);
  };

  const clearRowFields = (id: string) => {
    update(id, "description", "");
    update(id, "unit", "");
    update(id, "qty", "");
    update(id, "rate", "");
    update(id, "sn", "");
  };

  useEffect(() => {
    if (readOnly) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      // ONLY intercept "Delete". "Backspace" is reserved exclusively for typing.
      if (e.key === "Delete") {
        const isInputFocused = document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA" || document.activeElement?.tagName === "SELECT";
        
        if (!isInputFocused && selectedRowId) {
          e.preventDefault();
          clearRowFields(selectedRowId);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedRowId, readOnly]);

  const contextItems: ContextMenuItem[] = [
    { label: "Add Row Above", icon: <Plus size={14} />, action: () => selectedRowId && insertRowAt(selectedRowId, "above"), disabled: readOnly },
    { label: "Add Row Below", icon: <Plus size={14} />, action: () => selectedRowId && insertRowAt(selectedRowId, "below"), disabled: readOnly },
    { divider: true },
    { label: "Copy Row", icon: <Copy size={14} />, action: copyRow },
    { label: "Paste Row Above", icon: <ClipboardPaste size={14} />, action: () => selectedRowId && pasteRowAt(selectedRowId, "above", clipboard), disabled: !clipboard.length || readOnly },
    { label: "Paste Row Below", icon: <ClipboardPaste size={14} />, action: () => selectedRowId && pasteRowAt(selectedRowId, "below", clipboard), disabled: !clipboard.length || readOnly },
    { label: "Move Up", icon: <ArrowUp size={14} />, action: () => selectedRowId && moveRow(selectedRowId, "up"), disabled: readOnly },
    { label: "Move Down", icon: <ArrowDown size={14} />, action: () => selectedRowId && moveRow(selectedRowId, "down"), disabled: readOnly },
    { divider: true },
    { label: "Delete Row", icon: <Trash2 size={14} />, action: () => selectedRowId && deleteRow(selectedRowId), danger: true, disabled: readOnly },
  ];

  const total = items.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);

  return (
    <div className="relative">
      <div className="overflow-auto border border-border rounded-lg" style={{ maxHeight: "calc(100vh - 310px)" }}>
        <table className="border-collapse w-full" style={{ minWidth: 600 }}>
          <thead>
            <tr>
              {COLS.map((col) => (
                <th
                  key={col.key}
                  className={`${col.width} px-2 py-2 bg-bg-raised border-b-2 border-b-accent border-r border-r-border text-[10px] font-semibold uppercase tracking-wider text-txt-dim ${col.align} sticky top-0 z-10`}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr 
                key={item.id} 
                className={`hover:bg-bg-hover transition-colors ${item.id === selectedRowId ? "bg-accent/10 row-selected" : ""}`}
                onContextMenu={(e) => handleContextMenu(e, item.id)}
                onClick={() => !readOnly && setSelectedRowId(item.id)}
              >
                {COLS.map((col) => (
                  <td
                    key={col.key}
                    className={`px-1 h-[34px] border-r border-r-border border-b border-b-border ${col.align} ${col.mono ? "font-mono" : ""}`}
                  >
                    {col.key === "amount" ? (
                      <span className="block px-2 text-[13px] font-mono">
                        {item.amount
                          ? parseFloat(item.amount).toLocaleString("en-US", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })
                          : ""}
                      </span>
                    ) : readOnly ? (
                      <span
                        className={`block px-2 text-[13px] text-txt ${col.mono ? "font-mono" : ""}`}
                        style={{ textAlign: col.align === "text-right" ? "right" : col.align === "text-center" ? "center" : "left" }}
                      >
                        {(item as any)[col.key] || "—"}
                      </span>
                    ) : (
                      <input
                        className={`w-full px-2 py-1 bg-transparent border-none outline-none text-[13px] text-txt focus:ring-1 focus:ring-accent/50 ${col.mono ? "font-mono" : ""}`}
                        style={{ textAlign: col.align === "text-right" ? "right" : col.align === "text-center" ? "center" : "left" }}
                        value={(item as any)[col.key]}
                        onChange={(e) => update(item.id, col.key, e.target.value)}
                        placeholder={col.key === "description" ? "Type description..." : ""}
                      />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {total > 0 && (
            <tfoot>
              <tr className="row-grandtotal">
                <td colSpan={5} className="px-3 py-2 font-bold text-sm border-t-2 border-t-accent">
                  TOTAL
                </td>
                <td className="px-2 py-2 font-bold text-sm font-mono text-right border-t-2 border-t-accent">
                  {total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {ctxMenu && <ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={contextItems} onClose={() => setCtxMenu(null)} />}
    </div>
  );
}

// ─── Main Simple Items Module ─────────────────────────────────────
export default function SimpleItemsTable() {
  const {
    activeSimpleItemsId,
    openSimpleItemSet,
    saveSimpleItemSet,
    savedSimpleItemSets,
    addSimpleItem: addRow,
  } = useAppStore();

  const [mode, setMode] = useState<"list" | "view" | "edit">(activeSimpleItemsId ? "view" : "list");
  const [showCreate, setShowCreate] = useState(false);

  const activeName = savedSimpleItemSets.find((s) => s.id === activeSimpleItemsId)?.name || "Items";

  useEffect(() => {
    if (activeSimpleItemsId && mode === "list") {
      setMode("edit");
    }
  }, [activeSimpleItemsId]);

  const handleOpen = (id: string) => {
    openSimpleItemSet(id);
    setMode("view");
  };

  const handleBack = () => {
    setMode("list");
  };

  const handleEdit = () => {
    setMode("edit");
  };

  const handleSave = () => {
    saveSimpleItemSet();
    setMode("view");
  };

  // ─── LIST VIEW ──────────────────────────────────────────────────
  if (mode === "list") {
    return (
      <div className="animate-fade-in">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-bold tracking-tight">Items / Line Items</h2>
            <p className="text-xs text-txt-muted mt-0.5">
              Manage your project item lists
            </p>
          </div>
          <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
            <Plus size={14} /> Create Item List
          </Button>
        </div>

        <ItemsListView onOpen={handleOpen} onCreateClick={() => setShowCreate(true)} />
        <CreateItemSetModal open={showCreate} onClose={() => setShowCreate(false)} />
      </div>
    );
  }

  // ─── VIEW / EDIT MODE ───────────────────────────────────────────
  const isViewMode = mode === "view";

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Button size="sm" variant="ghost" onClick={handleBack}>
            <ArrowLeft size={14} /> Back
          </Button>
          <div className="h-5 w-px bg-border" />
          <div>
            <h2 className="text-lg font-bold">{activeName}</h2>
            <p className="text-xs text-txt-muted mt-0.5">
              {isViewMode
                ? "View mode — click the edit button to make changes"
                : "Add your project items or deliverables (Right-click rows for options)"}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {isViewMode ? (
            <Button size="sm" variant="primary" onClick={handleEdit}>
              <Pencil size={14} /> Edit
            </Button>
          ) : (
            <>
              <Button size="sm" onClick={addRow}>
                <Plus size={14} /> Add Row
              </Button>
              <Button size="sm" variant="primary" onClick={handleSave}>
                <Save size={14} /> Save
              </Button>
            </>
          )}
        </div>
      </div>

      <ItemsTable readOnly={isViewMode} />
    </div>
  );
}
