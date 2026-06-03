"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuid } from "uuid";

import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import TaxonomySelect from "@/components/admin/TaxonomySelect";
import { calculateBOQLineAmount } from "@/lib/boq-calculations";
import { BOQ_LIBRARY_CATEGORIES, subcategoriesForCategory } from "@/lib/boqLibrary";
import type { BOQLibraryItem, BOQRow, BOQSheet } from "@/lib/supabase";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

export interface TemplatePayload {
  name: string;
  description: string;
  category: string;
  subcategory: string;
  sheets: BOQSheet[];
}

const ROW_TYPES: { value: BOQRow["type"]; label: string }[] = [
  { value: "item", label: "Item" },
  { value: "header", label: "Header" },
  { value: "subtotal", label: "Subtotal" },
  { value: "grandtotal", label: "Grand total" },
  { value: "notes", label: "Notes" },
];

const blankRow = (): BOQRow => ({
  id: uuid(),
  type: "item",
  itemNo: "",
  description: "",
  unit: "",
  qty: "",
  rate: "",
  amount: "",
});

/** Deep-clone sheets so edits never mutate the live store object. */
const cloneSheets = (sheets: BOQSheet[]): BOQSheet[] =>
  sheets.map((sh) => ({ ...sh, rows: sh.rows.map((r) => ({ ...r })) }));

/** Borderless, auto-growing cell textarea so long descriptions wrap to multiple lines. */
function CellTextarea({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  const resize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  useEffect(() => {
    resize();
  }, [value]);

  return (
    <textarea
      ref={ref}
      rows={1}
      className="data-cell-textarea"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export default function TemplateEditorModal({
  open,
  item,
  saving,
  notice,
  onSave,
  onClose,
}: {
  open: boolean;
  item: BOQLibraryItem | null;
  saving: boolean;
  notice: string | null;
  onSave: (payload: TemplatePayload) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [sheets, setSheets] = useState<BOQSheet[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [localNotice, setLocalNotice] = useState<string | null>(null);

  // Reset local form whenever a different template is opened.
  useEffect(() => {
    if (!open || !item) return;
    setName(item.name);
    setDescription(item.description);
    setCategory(item.category);
    setSubcategory(item.subcategory);
    const cloned = cloneSheets(item.sheets);
    setSheets(cloned.length ? cloned : [{ id: uuid(), project_id: "", name: "Sheet 1", sort_order: 0, rows: [blankRow()] }]);
    setActiveIdx(0);
    setLocalNotice(null);
  }, [open, item]);

  const activeSheet = sheets[activeIdx];

  const itemCount = useMemo(
    () => sheets.reduce((s, sh) => s + sh.rows.filter((r) => r.type === "item").length, 0),
    [sheets]
  );

  const patchRow = (rowId: string, patch: Partial<BOQRow>) => {
    setSheets((prev) =>
      prev.map((sh, i) => {
        if (i !== activeIdx) return sh;
        return {
          ...sh,
          rows: sh.rows.map((r) => {
            if (r.id !== rowId) return r;
            const next = { ...r, ...patch };
            if (next.type === "item") {
              next.amount = String(calculateBOQLineAmount(next.qty, next.rate, next.unit));
            } else if (patch.type && patch.type !== "item") {
              // non-item rows carry no computed amount
              next.amount = "";
            }
            return next;
          }),
        };
      })
    );
  };

  const addRow = () => {
    setSheets((prev) =>
      prev.map((sh, i) => (i === activeIdx ? { ...sh, rows: [...sh.rows, blankRow()] } : sh))
    );
  };

  const deleteRow = (rowId: string) => {
    setSheets((prev) =>
      prev.map((sh, i) => (i === activeIdx ? { ...sh, rows: sh.rows.filter((r) => r.id !== rowId) } : sh))
    );
  };

  const moveRow = (rowId: string, dir: -1 | 1) => {
    setSheets((prev) =>
      prev.map((sh, i) => {
        if (i !== activeIdx) return sh;
        const idx = sh.rows.findIndex((r) => r.id === rowId);
        const target = idx + dir;
        if (idx < 0 || target < 0 || target >= sh.rows.length) return sh;
        const rows = sh.rows.slice();
        [rows[idx], rows[target]] = [rows[target], rows[idx]];
        return { ...sh, rows };
      })
    );
  };

  const addSheet = () => {
    setSheets((prev) => {
      const next = [
        ...prev,
        { id: uuid(), project_id: "", name: `Sheet ${prev.length + 1}`, sort_order: prev.length, rows: [blankRow()] },
      ];
      setActiveIdx(next.length - 1);
      return next;
    });
  };

  const renameSheet = (value: string) => {
    setSheets((prev) => prev.map((sh, i) => (i === activeIdx ? { ...sh, name: value } : sh)));
  };

  const deleteSheet = () => {
    setSheets((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.filter((_, i) => i !== activeIdx).map((sh, i) => ({ ...sh, sort_order: i }));
      setActiveIdx((cur) => Math.max(0, Math.min(cur, next.length - 1)));
      return next;
    });
  };

  const handleSave = () => {
    if (!name.trim()) {
      setLocalNotice("Please enter a template name.");
      return;
    }
    if (sheets.every((sh) => sh.rows.length === 0)) {
      setLocalNotice("Add at least one row before saving.");
      return;
    }
    setLocalNotice(null);
    onSave({
      name: name.trim(),
      description: description.trim(),
      category: category.trim() || "Uncategorized",
      subcategory: subcategory.trim(),
      sheets: sheets.map((sh, i) => ({ ...sh, sort_order: i })),
    });
  };

  const shownNotice = notice ?? localNotice;

  return (
    <Modal open={open} onClose={onClose} title="Edit BOQ Template" width={1120}>
      <div className="flex flex-col gap-4">
        <div>
          <label className="text-[11px] font-semibold text-txt-muted uppercase tracking-[0.16em] block mb-1.5">
            Name
          </label>
          <input
            className="w-full px-3 py-2 bg-bg-input border border-border rounded-md text-sm text-txt outline-none focus:border-accent"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Asphalt Road Works BOQ"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TaxonomySelect
            label="Category"
            value={category}
            options={BOQ_LIBRARY_CATEGORIES}
            placeholder="Select category"
            onChange={(next) => {
              setCategory(next);
              setSubcategory("");
            }}
          />
          <TaxonomySelect
            label="Subcategory"
            value={subcategory}
            options={subcategoriesForCategory(category)}
            placeholder="Select subcategory"
            onChange={setSubcategory}
          />
        </div>

        <div>
          <label className="text-[11px] font-semibold text-txt-muted uppercase tracking-[0.16em] block mb-1.5">
            Description
          </label>
          <input
            className="w-full px-3 py-2 bg-bg-input border border-border rounded-md text-sm text-txt outline-none focus:border-accent"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief description of this template"
          />
        </div>

        {/* BOQ content editor */}
        <div className="rounded-xl border border-border bg-bg-raised/40 p-3">
          <div className="flex items-center justify-between gap-3 mb-2.5">
            <div className="text-xs font-semibold text-txt-muted uppercase tracking-[0.16em]">
              BOQ Content
            </div>
            <span className="text-[11px] text-txt-dim">
              {sheets.length} sheet{sheets.length !== 1 ? "s" : ""} • {itemCount} item
              {itemCount !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Sheet tabs */}
          <div className="flex flex-wrap items-center gap-1.5 mb-3">
            {sheets.map((sh, i) => (
              <button
                key={sh.id}
                type="button"
                onClick={() => setActiveIdx(i)}
                className={`rounded-md px-2.5 py-1 text-xs border transition-colors ${
                  i === activeIdx
                    ? "border-accent bg-accent/15 text-txt"
                    : "border-border text-txt-muted hover:text-txt hover:bg-bg-hover"
                }`}
              >
                {sh.name || `Sheet ${i + 1}`}
              </button>
            ))}
            <button
              type="button"
              onClick={addSheet}
              className="rounded-md border border-border px-2 py-1 text-xs text-txt-muted hover:text-txt hover:bg-bg-hover inline-flex items-center gap-1"
            >
              <Plus size={12} /> Sheet
            </button>
          </div>

          {activeSheet ? (
            <>
              <div className="flex items-center gap-2 mb-2.5">
                <input
                  className="flex-1 px-2.5 py-1.5 bg-bg-input border border-border rounded-md text-xs text-txt outline-none focus:border-accent"
                  value={activeSheet.name}
                  onChange={(e) => renameSheet(e.target.value)}
                  placeholder="Sheet name"
                />
                <button
                  type="button"
                  onClick={deleteSheet}
                  disabled={sheets.length <= 1}
                  className="shrink-0 rounded-md border border-border px-2 py-1.5 text-xs text-err hover:bg-err/10 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1"
                >
                  <Trash2 size={12} /> Sheet
                </button>
              </div>

              <div className="data-table-shell">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ width: 56 }} aria-label="Order" />
                      <th style={{ width: 110 }}>Type</th>
                      <th style={{ width: 80 }}>Item No</th>
                      <th style={{ minWidth: 320 }}>Description</th>
                      <th style={{ width: 64 }}>Unit</th>
                      <th style={{ width: 72 }}>Qty</th>
                      <th style={{ width: 84 }}>Rate</th>
                      <th style={{ width: 104 }}>Amount</th>
                      <th style={{ width: 36 }} aria-label="Delete" />
                    </tr>
                  </thead>
                  <tbody>
                    {activeSheet.rows.map((row, rIdx) => {
                      const isItem = row.type === "item";
                      return (
                        <tr key={row.id}>
                          <td>
                            <div className="flex items-center gap-0.5">
                              <button
                                type="button"
                                className="data-row-action"
                                onClick={() => moveRow(row.id, -1)}
                                disabled={rIdx === 0}
                                aria-label="Move up"
                              >
                                <ArrowUp size={12} />
                              </button>
                              <button
                                type="button"
                                className="data-row-action"
                                onClick={() => moveRow(row.id, 1)}
                                disabled={rIdx === activeSheet.rows.length - 1}
                                aria-label="Move down"
                              >
                                <ArrowDown size={12} />
                              </button>
                            </div>
                          </td>
                          <td>
                            <select
                              className="data-cell-select"
                              value={row.type}
                              onChange={(e) => patchRow(row.id, { type: e.target.value as BOQRow["type"] })}
                            >
                              {ROW_TYPES.map((t) => (
                                <option key={t.value} value={t.value}>
                                  {t.label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <input
                              className="data-cell-input"
                              value={row.itemNo}
                              onChange={(e) => patchRow(row.id, { itemNo: e.target.value })}
                            />
                          </td>
                          <td className="data-cell-wrap" style={{ verticalAlign: "top" }}>
                            <CellTextarea
                              value={row.description}
                              onChange={(next) => patchRow(row.id, { description: next })}
                              placeholder="Description"
                            />
                          </td>
                          <td>
                            <input
                              className="data-cell-input disabled:opacity-40"
                              value={row.unit}
                              disabled={!isItem}
                              onChange={(e) => patchRow(row.id, { unit: e.target.value })}
                            />
                          </td>
                          <td>
                            <input
                              className="data-cell-input disabled:opacity-40"
                              style={{ textAlign: "right" }}
                              value={row.qty}
                              disabled={!isItem}
                              onChange={(e) => patchRow(row.id, { qty: e.target.value })}
                            />
                          </td>
                          <td>
                            <input
                              className="data-cell-input disabled:opacity-40"
                              style={{ textAlign: "right" }}
                              value={row.rate}
                              disabled={!isItem}
                              onChange={(e) => patchRow(row.id, { rate: e.target.value })}
                            />
                          </td>
                          <td className="data-cell-num text-txt-muted">
                            {isItem
                              ? calculateBOQLineAmount(row.qty, row.rate, row.unit).toLocaleString(undefined, {
                                  maximumFractionDigits: 2,
                                })
                              : "—"}
                          </td>
                          <td className="data-cell-action">
                            <button
                              type="button"
                              className="data-row-action danger"
                              onClick={() => deleteRow(row.id)}
                              aria-label="Delete row"
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {activeSheet.rows.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="text-center text-xs text-txt-dim py-4">
                          No rows yet. Click <strong>Add Row</strong> below.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>

              <div className="mt-2.5">
                <Button size="sm" variant="ghost" onClick={addRow}>
                  <Plus size={14} /> Add Row
                </Button>
              </div>
            </>
          ) : null}
        </div>

        {shownNotice ? (
          <div className="rounded-xl border border-err/30 bg-err/10 px-3 py-2 text-sm text-err">
            {shownNotice}
          </div>
        ) : null}

        <div className="mt-1 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" disabled={saving} onClick={handleSave}>
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
