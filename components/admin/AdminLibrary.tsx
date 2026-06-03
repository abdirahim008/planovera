"use client";

import { useMemo, useRef, useState } from "react";
import { v4 as uuid } from "uuid";

import { useAppStore } from "@/lib/store";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase-browser";
import { mapBOQLibraryItemRecord } from "@/lib/supabase";
import type { BOQLibraryItem, BOQLibraryItemRecord, BOQSheet } from "@/lib/supabase";
import {
  parseExcelToRawSheets,
  createDefaultColumnMapping,
  mapRawSheetToBOQRows,
  type RawExcelSheet,
  type BOQColumnMapping,
  type BOQMappedColumnKey,
} from "@/lib/excel-utils";
import {
  BOQ_LIBRARY_CATEGORIES,
  subcategoriesForCategory,
} from "@/lib/boqLibrary";
import ExcelImportPreviewModal from "@/components/boq/ExcelImportPreviewModal";
import { FileSpreadsheet, Trash2, Plus, ArrowLeft, Download, Upload } from "lucide-react";

const CUSTOM = "__custom__";

/** Dropdown of curated options that falls back to a free-text input when "Custom…" is picked. */
function TaxonomySelect({
  label,
  value,
  options,
  placeholder,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  options: string[];
  placeholder: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  // Treat a value not in the curated list (and non-empty) as "custom".
  const isCustom = value !== "" && !options.includes(value);
  const [customMode, setCustomMode] = useState(isCustom);

  return (
    <div>
      <label className="text-[11px] font-semibold text-txt-muted uppercase tracking-[0.16em] block mb-1.5">
        {label}
      </label>
      {customMode || isCustom ? (
        <div className="flex gap-2">
          <input
            className="w-full px-3 py-2 bg-bg-input border border-border rounded-md text-sm text-txt outline-none focus:border-accent"
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            autoFocus
          />
          {options.length > 0 ? (
            <button
              type="button"
              className="shrink-0 rounded-md border border-border px-2.5 text-xs text-txt-muted hover:text-txt hover:bg-bg-hover"
              onClick={() => {
                setCustomMode(false);
                onChange("");
              }}
            >
              List
            </button>
          ) : null}
        </div>
      ) : (
        <select
          className="w-full px-3 py-2 bg-bg-input border border-border rounded-md text-sm text-txt outline-none focus:border-accent"
          value={options.includes(value) ? value : ""}
          disabled={disabled}
          onChange={(e) => {
            if (e.target.value === CUSTOM) {
              setCustomMode(true);
              onChange("");
            } else {
              onChange(e.target.value);
            }
          }}
        >
          <option value="">{placeholder}</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
          <option value={CUSTOM}>+ Custom…</option>
        </select>
      )}
    </div>
  );
}

export default function AdminLibrary({ embedded = false }: { embedded?: boolean }) {
  const authConfigured = isSupabaseConfigured();
  const { boqLibrary, deleteFromLibrary, setBOQLibrary } = useAppStore();
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyDeleteId, setBusyDeleteId] = useState<string | null>(null);

  // Add-template flow
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [pendingSheets, setPendingSheets] = useState<BOQSheet[]>([]);
  const [addNotice, setAddNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Excel cleaning sub-flow
  const [rawSheets, setRawSheets] = useState<RawExcelSheet[]>([]);
  const [mappings, setMappings] = useState<BOQColumnMapping[][]>([]);
  const [previewIdx, setPreviewIdx] = useState(0);
  const [showPreview, setShowPreview] = useState(false);

  const pendingItemCount = useMemo(
    () => pendingSheets.reduce((s, sh) => s + sh.rows.filter((r) => r.type === "item").length, 0),
    [pendingSheets]
  );

  const grouped = useMemo(() => {
    const map = new Map<string, Map<string, BOQLibraryItem[]>>();
    for (const item of boqLibrary) {
      const cat = item.category?.trim() || "Uncategorized";
      const sub = item.subcategory?.trim() || "General";
      if (!map.has(cat)) map.set(cat, new Map());
      const subMap = map.get(cat)!;
      if (!subMap.has(sub)) subMap.set(sub, []);
      subMap.get(sub)!.push(item);
    }
    return map;
  }, [boqLibrary]);

  const resetAddForm = () => {
    setName("");
    setDescription("");
    setCategory("");
    setSubcategory("");
    setPendingSheets([]);
    setAddNotice(null);
  };

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

  const handlePickExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file) return;
    try {
      const sheets = await parseExcelToRawSheets(file);
      if (sheets.length === 0) {
        setAddNotice("The selected file has no importable data.");
        return;
      }
      setRawSheets(sheets);
      setMappings(sheets.map((sheet) => createDefaultColumnMapping(sheet)));
      setPreviewIdx(0);
      setShowPreview(true);
      setAddNotice(null);
    } catch (err) {
      console.error("Failed to parse Excel:", err);
      setAddNotice("Failed to parse the Excel file. Please ensure it has BOQ-like columns.");
    }
  };

  const handleMappingChange = (sheetIdx: number, colIdx: number, target: BOQMappedColumnKey) => {
    setMappings((prev) =>
      prev.map((sheetMapping, idx) => {
        if (idx !== sheetIdx) return sheetMapping;
        const next = sheetMapping.map((m) => ({ ...m }));
        const current = next[colIdx];
        if (!current) return sheetMapping;
        if (target !== "ignore") {
          const existingIdx = next.findIndex((m, i) => i !== colIdx && m.target === target);
          if (existingIdx >= 0) next[existingIdx].target = current.target;
        }
        current.target = target;
        return next;
      })
    );
  };

  const handleReorderColumns = (sheetIdx: number, fromColIdx: number, toColIdx: number) => {
    setMappings((prev) =>
      prev.map((sheetMapping, idx) => {
        if (idx !== sheetIdx) return sheetMapping;
        if (fromColIdx < 0 || toColIdx < 0 || fromColIdx >= sheetMapping.length || toColIdx >= sheetMapping.length) {
          return sheetMapping;
        }
        const next = sheetMapping.map((m) => ({ ...m }));
        const [moved] = next.splice(fromColIdx, 1);
        next.splice(toColIdx, 0, moved);
        return next;
      })
    );
  };

  const confirmImport = () => {
    const sheets: BOQSheet[] = rawSheets
      .map((rawSheet, i) => ({
        rawSheet,
        rows: mapRawSheetToBOQRows(rawSheet, mappings[i] || []),
      }))
      .filter((s) => s.rows.length > 0)
      .map((s, i) => ({
        id: uuid(),
        project_id: "",
        name: s.rawSheet.name || `Sheet ${i + 1}`,
        sort_order: i,
        rows: s.rows,
      }));

    if (sheets.length === 0) {
      setAddNotice("No rows available to import after mapping.");
      return;
    }
    setPendingSheets(sheets);
    setShowPreview(false);
    setRawSheets([]);
    setMappings([]);
  };

  const downloadTemplate = async () => {
    const XLSX = await import("xlsx");
    const rows = [
      ["Item No", "Description", "Unit", "Qty", "Rate"],
      ["1.0", "PRELIMINARY & GENERAL", "", "", ""],
      ["1.1", "Mobilization and demobilization", "LS", "1", ""],
      ["1.2", "Site clearance", "m2", "", ""],
      ["2.0", "EARTHWORKS", "", "", ""],
      ["2.1", "Excavation to spoil", "m3", "", ""],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 10 }, { wch: 40 }, { wch: 8 }, { wch: 10 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "BOQ Template");
    XLSX.writeFile(wb, "boq-library-template.xlsx");
  };

  const handleSaveTemplate = async () => {
    if (!name.trim()) {
      setAddNotice("Please enter a template name.");
      return;
    }
    if (pendingSheets.length === 0) {
      setAddNotice("Import an Excel file to provide the BOQ content first.");
      return;
    }

    const cat = category.trim() || "Uncategorized";
    const sub = subcategory.trim();

    if (!authConfigured) {
      const now = new Date().toISOString();
      const newItem: BOQLibraryItem = {
        id: uuid(),
        name: name.trim(),
        description: description.trim(),
        category: cat,
        subcategory: sub,
        sheets: pendingSheets,
        created_at: now,
        updated_at: now,
      };
      setBOQLibrary([newItem, ...boqLibrary]);
      setShowAdd(false);
      resetAddForm();
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setAddNotice("Supabase environment variables are missing.");
      return;
    }

    setSaving(true);
    setAddNotice(null);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setSaving(false);
      setAddNotice("You need to sign in again before publishing BOQ templates.");
      return;
    }

    const { data, error } = await supabase
      .from("boq_library_items")
      .insert({
        name: name.trim(),
        description: description.trim(),
        category: cat,
        subcategory: sub,
        sheets: pendingSheets,
        author_id: user.id,
      })
      .select("*")
      .single();

    if (error) {
      setSaving(false);
      setAddNotice(error.message);
      return;
    }

    const nextItem = mapBOQLibraryItemRecord(data as BOQLibraryItemRecord);
    setBOQLibrary([nextItem, ...boqLibrary]);
    setSaving(false);
    setShowAdd(false);
    resetAddForm();
  };

  const content = (
    <>
      {!embedded ? (
        <div className="flex items-center gap-3 mb-6">
          <a href="/workspace" className="text-txt-muted hover:text-txt transition-colors">
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
        <Button
          size="sm"
          variant="primary"
          onClick={() => {
            resetAddForm();
            setShowAdd(true);
          }}
        >
          <Plus size={14} /> Add Template
        </Button>
      </div>

      {boqLibrary.length === 0 ? (
        <div className="rounded-xl border border-border bg-bg-surface px-4 py-10 text-center text-sm text-txt-muted">
          No templates yet. Click <strong>Add Template</strong> to import one from Excel.
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {Array.from(grouped.entries()).map(([cat, subMap]) => (
            <div key={cat}>
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-sm font-semibold text-txt">{cat}</h3>
                <span className="text-[11px] text-txt-dim">
                  {Array.from(subMap.values()).reduce((s, arr) => s + arr.length, 0)} template(s)
                </span>
              </div>
              {Array.from(subMap.entries()).map(([sub, items]) => (
                <div key={sub} className="mb-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim mb-1.5">
                    {sub}
                  </div>
                  <div className="data-table-shell">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th style={{ width: 36 }} aria-label="" />
                          <th>Name</th>
                          <th>Description</th>
                          <th>Sheets</th>
                          <th>Items</th>
                          <th style={{ width: 36 }} aria-label="Actions" />
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item) => {
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
                              <td className="data-cell-wrap text-txt-muted">{item.description}</td>
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
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Add template modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add BOQ Template" width={560}>
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

          <div className="rounded-xl border border-border bg-bg-raised/40 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-semibold text-txt-muted uppercase tracking-[0.16em]">
                BOQ Content
              </div>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 text-xs text-accent hover:underline"
                onClick={downloadTemplate}
              >
                <Download size={13} /> Download Excel template
              </button>
            </div>
            {pendingSheets.length === 0 ? (
              <p className="mt-2 text-xs text-txt-dim">
                Import an Excel workbook, then clean the columns (map, reorder, delete) before saving.
              </p>
            ) : (
              <p className="mt-2 text-xs text-ok">
                {pendingSheets.length} sheet{pendingSheets.length !== 1 ? "s" : ""} •{" "}
                {pendingItemCount} item{pendingItemCount !== 1 ? "s" : ""} ready.
              </p>
            )}
            <div className="mt-2.5">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={handlePickExcel}
              />
              <Button size="sm" variant="ghost" onClick={() => fileInputRef.current?.click()}>
                <Upload size={14} /> {pendingSheets.length ? "Re-import Excel" : "Import Excel"}
              </Button>
            </div>
          </div>

          {addNotice ? (
            <div className="rounded-xl border border-err/30 bg-err/10 px-3 py-2 text-sm text-err">
              {addNotice}
            </div>
          ) : null}

          <div className="mt-1 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={() => setShowAdd(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!name.trim() || pendingSheets.length === 0 || saving}
              onClick={handleSaveTemplate}
            >
              {saving ? "Saving..." : "Save Template"}
            </Button>
          </div>
        </div>
      </Modal>

      <ExcelImportPreviewModal
        open={showPreview}
        rawSheets={rawSheets}
        mappings={mappings}
        activeSheetIdx={previewIdx}
        onSheetChange={setPreviewIdx}
        onMappingChange={handleMappingChange}
        onReorderColumns={handleReorderColumns}
        onConfirm={confirmImport}
        onClose={() => setShowPreview(false)}
        title="Clean Imported BOQ"
        confirmLabel="Use This Mapping"
      />

      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete Template"
        width={380}
      >
        <p className="text-sm text-txt-muted mb-4">
          Are you sure you want to delete this template? This action cannot be undone.
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

  return <div className="min-h-screen bg-bg p-6 max-w-4xl mx-auto">{content}</div>;
}
