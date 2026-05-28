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
import { labelsForType } from "@/lib/project-labels";
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
function CreateItemSetModal({
  open,
  onClose,
  noun,
}: {
  open: boolean;
  onClose: () => void;
  /** Singular noun for the list type, e.g. "Deliverables" or "Items". */
  noun: string;
}) {
  const { createSimpleItemSet } = useAppStore();
  const [name, setName] = useState("");

  const handleCreate = () => {
    if (!name.trim()) return;
    createSimpleItemSet(name.trim());
    onClose();
    setName("");
  };

  return (
    <Modal open={open} onClose={onClose} title={`Create ${noun} List`} width={420}>
      <div className="flex flex-col gap-4">
        <div>
          <label className="text-[11px] font-semibold text-txt-muted uppercase tracking-[0.16em] block mb-1.5">
            List Name
          </label>
          <input
            autoFocus
            className="w-full px-3 py-2.5 bg-bg-input border border-border rounded-lg text-sm text-txt outline-none focus:border-accent transition-colors placeholder:text-txt-dim"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            placeholder={`e.g. Phase 1 ${noun}, Quarterly ${noun}`}
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
  noun,
  itemNounSingular,
  itemNounPlural,
}: {
  onOpen: (id: string) => void;
  onCreateClick: () => void;
  /** Title-case noun for the list, e.g. "Deliverables" or "Item". */
  noun: string;
  itemNounSingular: string;
  itemNounPlural: string;
}) {
  const { savedSimpleItemSets, deleteSimpleItemSet, duplicateSimpleItemSet } = useAppStore();
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  return (
    <>
      {savedSimpleItemSets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <p className="text-txt-muted text-sm font-medium">No {noun.toLowerCase()} lists yet</p>
          <Button variant="primary" size="md" className="mt-4" onClick={onCreateClick}>
            <Plus size={14} /> Create {noun} List
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
                className="group flex items-center justify-between p-4 bg-bg-surface border border-border rounded-lg cursor-pointer transition-all duration-200 hover:border-accent/50"
                style={{ animationDelay: `${idx * 60}ms`, animationFillMode: "both" }}
                onClick={() => onOpen(sis.id)}
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
                    <Table size={18} className="text-accent" />
                  </div>
                  <div>
                    <div className="font-semibold text-sm">{sis.name}</div>
                    <div className="flex gap-3 mt-1.5 text-[11px] text-txt-dim">
                      <span>{itemCount} {itemCount === 1 ? itemNounSingular : itemNounPlural}</span>
                      <span>•</span>
                      <span>Modified {new Date(sis.updatedAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {totalAmount > 0 && (
                    <div className="text-right mr-2">
                      <div className="text-[11px] font-semibold text-txt-dim uppercase tracking-[0.16em]">Total</div>
                      <div className="font-mono text-sm font-semibold mt-0.5 text-ok">
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
        <Modal open={true} onClose={() => setDeleteTarget(null)} title={`Delete ${noun} List`} width={400}>
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
      <div className="data-table-shell overflow-auto" style={{ maxHeight: "calc(100vh - 310px)" }}>
        <table className="data-table data-table-sticky" style={{ minWidth: 600 }}>
          <thead>
            <tr>
              {COLS.map((col) => (
                <th
                  key={col.key}
                  className={`${col.width} ${col.align}`}
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
                className={item.id === selectedRowId ? "bg-accent/10 row-selected" : ""}
                onContextMenu={(e) => handleContextMenu(e, item.id)}
                onClick={() => !readOnly && setSelectedRowId(item.id)}
              >
                {COLS.map((col) => {
                  const cellClass = col.mono
                    ? "data-cell-num"
                    : col.key === "description"
                    ? "data-cell-wrap"
                    : col.align;
                  const inputAlign =
                    col.align === "text-right" ? "text-right" : col.align === "text-center" ? "text-center" : "";
                  return (
                    <td key={col.key} className={cellClass}>
                      {col.key === "amount" ? (
                        <span>
                          {item.amount
                            ? parseFloat(item.amount).toLocaleString("en-US", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })
                            : ""}
                        </span>
                      ) : readOnly ? (
                        <span className={col.mono ? "font-mono" : ""}>
                          {(item as any)[col.key] || "—"}
                        </span>
                      ) : (
                        <input
                          className={`data-cell-input ${inputAlign} ${col.mono ? "font-mono" : ""}`}
                          value={(item as any)[col.key]}
                          onChange={(e) => update(item.id, col.key, e.target.value)}
                          placeholder={col.key === "description" ? "Type description..." : ""}
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          {total > 0 && (
            <tfoot>
              <tr className="row-grandtotal">
                <td colSpan={5} className="font-bold text-sm border-t-2 border-t-accent">
                  TOTAL
                </td>
                <td className="data-cell-num font-bold text-sm border-t-2 border-t-accent">
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
    project,
    activeSimpleItemsId,
    openSimpleItemSet,
    saveSimpleItemSet,
    savedSimpleItemSets,
    addSimpleItem: addRow,
  } = useAppStore();

  // Project-type-aware nouns. For construction projects the "Items" module is the
  // simple flat-list fallback for non-BOQ work; for non-construction it's the primary
  // way to capture deliverables.
  const isConstruction = project?.type === "construction";
  const noun = isConstruction ? "Item" : "Deliverables";
  const itemNounSingular = isConstruction ? "item" : "deliverable";
  const itemNounPlural = isConstruction ? "items" : "deliverables";
  const moduleTitle = labelsForType(project).pageTitle.boqOrItems;

  const [mode, setMode] = useState<"list" | "view" | "edit">(activeSimpleItemsId ? "view" : "list");
  const [showCreate, setShowCreate] = useState(false);

  const activeName = savedSimpleItemSets.find((s) => s.id === activeSimpleItemsId)?.name || noun;

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
          <h2 className="text-lg font-semibold tracking-tight">{moduleTitle}</h2>
          <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
            <Plus size={14} /> Create {noun} List
          </Button>
        </div>

        <ItemsListView
          onOpen={handleOpen}
          onCreateClick={() => setShowCreate(true)}
          noun={noun}
          itemNounSingular={itemNounSingular}
          itemNounPlural={itemNounPlural}
        />
        <CreateItemSetModal open={showCreate} onClose={() => setShowCreate(false)} noun={noun} />
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
            <h2 className="text-lg font-semibold">{activeName}</h2>
            {!isViewMode && (
              <p className="text-xs text-txt-muted mt-0.5">Right-click rows for options</p>
            )}
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
