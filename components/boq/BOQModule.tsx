"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { v4 as uuid } from "uuid";
import {
  Plus,
  Upload,
  Copy,
  Trash2,
  Heading,
  Sigma,
  ClipboardPaste,
  ArrowDown,
  ArrowUp,
  Library,
  ChevronRight,
  FileSpreadsheet,
  X,
  ArrowLeft,
  ArrowRight,
  Pencil,
  Save,
  LayoutGrid,
  LayoutList,
  StickyNote,
  Search,
  ListPlus,
  AlertTriangle,
  Sparkles,
} from "lucide-react";
// Type-only import (erased at build); the ~430 KB runtime library is loaded on
// demand inside exportBOQToExcel so it never ships in the BOQ module's chunk.
import type * as XLSXNS from "xlsx-js-style";
import { useAppStore, emptyRow, headerRow, subtotalRow, sheetTotalRow, grandtotalRow, noteRow, specificationRow, recalcRows, currency, resolveCellValue, resolveBOQItemAmount } from "@/lib/store";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase-browser";
import { mapBOQLibraryItemRecord } from "@/lib/supabase";
import type { BOQRow, BOQLibraryItem, BOQLibraryItemRecord, BOQSheet } from "@/lib/supabase";
import {
  parsePastedText,
  parseExcelToRawSheets,
  createDefaultColumnMapping,
  mapRawSheetToBOQRows,
  type RawExcelSheet,
  type BOQColumnMapping,
  type BOQMappedColumnKey,
} from "@/lib/excel-utils";
import ContextMenu, { type ContextMenuItem } from "@/components/ui/ContextMenu";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import ExcelImportPreviewModal from "@/components/boq/ExcelImportPreviewModal";

const BOQ_COLS = [
  { key: "itemNo" as const, label: "Item No.", width: "w-[80px]", align: "text-center" },
  { key: "description" as const, label: "Description", width: "min-w-[140px] sm:min-w-[200px] w-full", align: "text-left" },
  { key: "unit" as const, label: "Unit", width: "w-[70px]", align: "text-center" },
  { key: "qty" as const, label: "Quantity", width: "w-[100px]", align: "text-right", mono: true },
  { key: "rate" as const, label: "Rate", width: "w-[110px]", align: "text-right", mono: true },
  { key: "amount" as const, label: "Amount", width: "w-[130px]", align: "text-right", mono: true },
];

const numberValue = (value: string | number | null | undefined) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (!value) return 0;
  const parsed = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const isFormulaValue = (value: unknown) => typeof value === "string" && value.trim().startsWith("=");

const resolveBOQNumber = (value: string | number | null | undefined, sheets: BOQSheet[]) => {
  if (isFormulaValue(value)) return resolveCellValue(String(value), sheets);
  return numberValue(value);
};

const formatBOQNumberDisplay = (value: string | number | null | undefined, sheets: BOQSheet[]) =>
  currency(resolveBOQNumber(value, sheets));

const blankNonItemBOQColumns = new Set(["unit", "qty", "rate", "amount"]);
const numericBOQColumns = new Set(["qty", "rate", "amount"]);

const formatBOQCellDisplay = (
  row: BOQRow,
  key: string,
  sheets: BOQSheet[],
) => {
  const rowRecord = row as unknown as Record<string, string | number | null | undefined>;
  if (row.type === "header" && blankNonItemBOQColumns.has(key)) return "";
  if ((row.type === "subtotal" || row.type === "sheettotal" || row.type === "grandtotal") && key !== "amount" && key !== "description") return "";
  if ((row.type === "subtotal" || row.type === "sheettotal" || row.type === "grandtotal") && key === "amount") {
    return formatBOQNumberDisplay(row.amount, sheets);
  }
  if (row.type === "item" && numericBOQColumns.has(key)) {
    return formatBOQNumberDisplay(rowRecord[key], sheets);
  }
  return String(rowRecord[key] ?? "");
};

// ─── Single Sheet Table ───────────────────────────────────────────
function BOQSheetTable({ readOnly = false }: { readOnly?: boolean }) {
  type BOQColKey = typeof BOQ_COLS[number]["key"];
  type BOQRowExtended = BOQRow & { mergedRange?: { startColumn: BOQColKey; endColumn: BOQColKey } };
  const LOCKABLE_COLUMNS: BOQColKey[] = ["amount"];
  const UNLOCKED_COLUMNS_STORAGE_KEY = "boq.unlockedColumns.v1";
  const {
    boqSheets, 
    activeSheetIndex, 
    setActiveSheetIndex,
    updateSheetRows, 
    pasteBOQRows, 
    toggleSheetSummary, 
    updateSheetSummaryLabel,
    formulaLinking,
    startFormulaLinking,
    selectFormulaSource,
    cancelFormulaLinking,
    completeFormulaLinking,
  } = useAppStore();
  const rows = boqSheets[activeSheetIndex]?.rows || [];

  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [lastSelectedRowId, setLastSelectedRowId] = useState<string | null>(null);
  const [selection, setSelection] = useState<{
    start: { r: number; c: string };
    end: { r: number; c: string };
    isDragging: boolean;
  } | null>(null);

  const [editing, setEditing] = useState<{ id: string; key: string } | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [headerCtxMenu, setHeaderCtxMenu] = useState<{ x: number; y: number; colKey: BOQColKey } | null>(null);
  const [unlockedColumns, setUnlockedColumns] = useState<Set<BOQColKey>>(new Set());
  const [clipboard, setClipboard] = useState<BOQRow[]>([]);
  const [isPasteMode, setIsPasteMode] = useState(false);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  const { clearBOQRange } = useAppStore();

  const setRows = useCallback(
    (newRows: BOQRow[]) => updateSheetRows(activeSheetIndex, newRows),
    [activeSheetIndex, updateSheetRows]
  );

  const formulaSuggestions = [
    { label: "SUM (Add)", value: "=SUM()" },
    { label: "PRODUCT (Multiply)", value: "=PRODUCT()" },
    { label: "SUBTRACT", value: "=SUBTRACT()" },
  ];

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(UNLOCKED_COLUMNS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      const validCols = parsed.filter((x): x is BOQColKey => LOCKABLE_COLUMNS.includes(x));
      setUnlockedColumns(new Set(validCols));
    } catch {
      // Ignore invalid persisted value
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        UNLOCKED_COLUMNS_STORAGE_KEY,
        JSON.stringify(Array.from(unlockedColumns))
      );
    } catch {
      // Ignore storage failures
    }
  }, [unlockedColumns]);

  // ── Paste handler (Ctrl+V on table area) ──
  useEffect(() => {
    if (readOnly) return;
    const container = tableContainerRef.current;
    if (!container) return;

    const handlePaste = (e: ClipboardEvent) => {
      if (editing) return;

      const text = e.clipboardData?.getData("text/plain");
      if (!text) return;

      if (text.includes("\t") || text.includes("\n")) {
        e.preventDefault();
        
        let startR = rows.length;
        let startC = "itemNo";

        if (selection) {
          startR = selection.start.r;
          startC = selection.start.c;
        } else if (lastSelectedRowId) {
          const idx = rows.findIndex(r => r.id === lastSelectedRowId);
          if (idx !== -1) startR = idx;
        }

        pasteBOQRows(activeSheetIndex, startR, startC, text);
      }
    };

    container.addEventListener("paste", handlePaste);
    return () => container.removeEventListener("paste", handlePaste);
  }, [rows, lastSelectedRowId, selection, editing, activeSheetIndex, pasteBOQRows, readOnly]);

  const handleMouseDown = (e: React.MouseEvent, r: number, c: string, id: string) => {
    if (readOnly) return;
    e.preventDefault();
    setSelection({ start: { r, c }, end: { r, c }, isDragging: true });
    
    if (e.shiftKey && lastSelectedRowId) {
      const startIdx = rows.findIndex(row => row.id === lastSelectedRowId);
      if (startIdx !== -1) {
        const minIdx = Math.min(startIdx, r);
        const maxIdx = Math.max(startIdx, r);
        const newSet = new Set(selectedRowIds);
        for (let i = minIdx; i <= maxIdx; i++) {
          newSet.add(rows[i].id);
        }
        setSelectedRowIds(newSet);
        setLastSelectedRowId(id);
      }
    } else if (e.ctrlKey || e.metaKey) {
      const newSet = new Set(selectedRowIds);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      setSelectedRowIds(newSet);
      setLastSelectedRowId(id);
    } else {
      setSelectedRowIds(new Set([id]));
      setLastSelectedRowId(id);
    }
  };

  // ── Global Keyboard Handler for Formula Linking ──
  useEffect(() => {
    if (!formulaLinking?.active) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const target = {
          sheetIndex: formulaLinking.targetSheetIndex,
          rowId: formulaLinking.targetRowId,
          colKey: formulaLinking.targetColKey,
        };
        completeFormulaLinking();
        if (target.sheetIndex !== undefined && target.rowId && target.colKey) {
          setActiveSheetIndex(target.sheetIndex);
          setSelectedRowIds(new Set([target.rowId]));
          setLastSelectedRowId(target.rowId);
          setEditing({ id: target.rowId, key: target.colKey });
          setSelection(null);
        }
      } else if (e.key === "Escape") {
        const target = {
          sheetIndex: formulaLinking.targetSheetIndex,
          rowId: formulaLinking.targetRowId,
          colKey: formulaLinking.targetColKey,
        };
        cancelFormulaLinking();
        if (target.sheetIndex !== undefined && target.rowId && target.colKey) {
          setActiveSheetIndex(target.sheetIndex);
          setSelectedRowIds(new Set([target.rowId]));
          setLastSelectedRowId(target.rowId);
          setEditing({ id: target.rowId, key: target.colKey });
          setSelection(null);
        }
      }
    };
    
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [formulaLinking, completeFormulaLinking, cancelFormulaLinking, setActiveSheetIndex]);

  const handleMouseEnter = (r: number, c: string) => {
    if (readOnly) return;
    if (selection?.isDragging) {
      setSelection((prev) => (prev ? { ...prev, end: { r, c } } : null));
    }
  };

  const clearSelection = useCallback(() => {
    setSelection(null);
  }, []);

  useEffect(() => {
    if (readOnly) return;
    const handleMouseUp = () => {
      setSelection((prev) => (prev ? { ...prev, isDragging: false } : null));
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      // ONLY intercept "Delete". "Backspace" is reserved exclusively for typing.
      if (e.key === "Delete" && !selection?.isDragging) {
        const isInputFocused = document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA" || document.activeElement?.tagName === "SELECT";
        
        if (!isInputFocused) {
          if (selection && (selection.start.r !== selection.end.r || selection.start.c !== selection.end.c)) {
            e.preventDefault();
            clearBOQRange(activeSheetIndex, selection.start.r, selection.end.r, selection.start.c, selection.end.c);
          } else if (selectedRowIds.size > 0) {
            e.preventDefault();
            // CLEAR rows, do not delete them from the array
            const newRows = [...rows];
            selectedRowIds.forEach((id) => {
              const idx = newRows.findIndex((r) => r.id === id);
              if (idx !== -1) {
                 newRows[idx] = { ...newRows[idx], description: "", unit: "", qty: "", rate: "", amount: "" };
              }
            });
            setRows(newRows);
          }
        }
      }
      if (e.key === "Escape") clearSelection();
    };

    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selection, activeSheetIndex, clearBOQRange, clearSelection, selectedRowIds, rows, setRows, readOnly]);

  const isInSelection = (r: number, c: string) => {
    if (!selection) return false;
    const { start, end } = selection;
    const minR = Math.min(start.r, end.r);
    const maxR = Math.max(start.r, end.r);
    const colIdx1 = BOQ_COLS.findIndex((x) => x.key === start.c);
    const colIdx2 = BOQ_COLS.findIndex((x) => x.key === end.c);
    const minC = Math.min(colIdx1, colIdx2);
    const maxC = Math.max(colIdx1, colIdx2);
    const currC = BOQ_COLS.findIndex((x) => x.key === c);
    return r >= minR && r <= maxR && currC >= minC && currC <= maxC;
  };

  const getSelectionBounds = () => {
    if (!selection) return null;
    const { start, end } = selection;
    const startRow = Math.min(start.r, end.r);
    const endRow = Math.max(start.r, end.r);
    const startColIdx = BOQ_COLS.findIndex((x) => x.key === start.c);
    const endColIdx = BOQ_COLS.findIndex((x) => x.key === end.c);
    if (startColIdx === -1 || endColIdx === -1) return null;
    return {
      startRow,
      endRow,
      startColIdx: Math.min(startColIdx, endColIdx),
      endColIdx: Math.max(startColIdx, endColIdx),
      startColKey: BOQ_COLS[Math.min(startColIdx, endColIdx)].key,
      endColKey: BOQ_COLS[Math.max(startColIdx, endColIdx)].key,
    };
  };

  const isMergeableSelection = () => {
    const bounds = getSelectionBounds();
    return !!bounds && bounds.startRow === bounds.endRow && bounds.startColIdx < bounds.endColIdx;
  };

  const getMergedRangeForRow = (row: BOQRowExtended) => row.mergedRange;

  const isSelectionMerged = () => {
    const bounds = getSelectionBounds();
    if (!bounds) return false;
    const targetRow = rows[bounds.startRow] as BOQRowExtended | undefined;
    if (!targetRow?.mergedRange) return false;
    return (
      targetRow.mergedRange.startColumn === bounds.startColKey &&
      targetRow.mergedRange.endColumn === bounds.endColKey
    );
  };

  const mergeSelectedCells = () => {
    if (!isMergeableSelection()) return;
    const bounds = getSelectionBounds();
    if (!bounds) return;
    const row = rows[bounds.startRow] as BOQRowExtended | undefined;
    if (!row) return;
    const mergedRange = { startColumn: bounds.startColKey, endColumn: bounds.endColKey };
    const newRows = rows.map((r, idx) => {
      if (idx !== bounds.startRow) return r;
      const mergedRow = { ...(r as BOQRowExtended), mergedRange };
      BOQ_COLS.slice(bounds.startColIdx + 1, bounds.endColIdx + 1).forEach((col) => {
        (mergedRow as any)[col.key] = "";
      });
      return mergedRow;
    });
    setRows(newRows);
    clearSelection();
  };

  const unmergeSelectedCells = () => {
    const bounds = getSelectionBounds();
    if (!bounds) return;
    const row = rows[bounds.startRow] as BOQRowExtended | undefined;
    if (!row?.mergedRange) return;
    const newRows = rows.map((r, idx) => (idx === bounds.startRow ? { ...(r as BOQRowExtended), mergedRange: undefined } : r));
    setRows(newRows);
    clearSelection();
  };

  const updateCell = (rowId: string, key: string, value: string) => {
    if (value.startsWith("=")) {
      startFormulaLinking(activeSheetIndex, rowId, key, value);
    }
    const newRows = rows.map((r) => (r.id === rowId ? { ...r, [key]: value } : r));
    setRows(newRows);
  };

  const handleRowSelect = (e: React.MouseEvent, id: string) => {
    if (readOnly) return;
    e.stopPropagation();
    if (e.shiftKey && lastSelectedRowId) {
      const startIdx = rows.findIndex((row) => row.id === lastSelectedRowId);
      const targetIdx = rows.findIndex((row) => row.id === id);
      if (startIdx !== -1 && targetIdx !== -1) {
        const minIdx = Math.min(startIdx, targetIdx);
        const maxIdx = Math.max(startIdx, targetIdx);
        const newSet = new Set(selectedRowIds);
        for (let i = minIdx; i <= maxIdx; i++) {
          newSet.add(rows[i].id);
        }
        setSelectedRowIds(newSet);
      }
    } else if (e.ctrlKey || e.metaKey) {
      const newSet = new Set(selectedRowIds);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      setSelectedRowIds(newSet);
      setLastSelectedRowId(id);
    } else {
      setSelectedRowIds(new Set([id]));
      setLastSelectedRowId(id);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, rowId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!selectedRowIds.has(rowId)) {
      setSelectedRowIds(new Set([rowId]));
      setLastSelectedRowId(rowId);
    }
    setCtxMenu({ x: e.clientX, y: e.clientY });
  };

  const isColumnLocked = (colKey: BOQColKey) =>
    LOCKABLE_COLUMNS.includes(colKey) && !unlockedColumns.has(colKey);

  const handleHeaderContextMenu = (e: React.MouseEvent, colKey: BOQColKey) => {
    if (readOnly || !LOCKABLE_COLUMNS.includes(colKey)) return;
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu(null);
    setHeaderCtxMenu({ x: e.clientX, y: e.clientY, colKey });
  };

  const insertRowAt = (type: BOQRow["type"], anchorId: string, position: "above" | "below" = "below") => {
    const idx = rows.findIndex((r) => r.id === anchorId);
    const fn = type === "header" ? headerRow : type === "subtotal" ? subtotalRow : type === "sheettotal" ? sheetTotalRow : type === "grandtotal" ? grandtotalRow : type === "notes" ? noteRow : type === "specification" ? specificationRow : emptyRow;
    const newRows = [...rows];
    newRows.splice(position === "above" ? idx : idx + 1, 0, fn());
    setRows(newRows);
  };

  const convertRowTo = (type: BOQRow["type"]) => {
    if (selectedRowIds.size === 0) return;
    // Guard the single-grand-total rule defensively: ignore a request that would
    // add a second grand total when one already exists elsewhere in the BOQ.
    if (type === "grandtotal") {
      const wouldDuplicate = boqSheets.some((sh) =>
        sh.rows.some((r) => r.type === "grandtotal" && !selectedRowIds.has(r.id))
      );
      if (wouldDuplicate) return;
    }
    // One Sheet Total per sheet — ignore a request that would add a second.
    if (type === "sheettotal") {
      const wouldDuplicate = rows.some((r) => r.type === "sheettotal" && !selectedRowIds.has(r.id));
      if (wouldDuplicate) return;
    }
    setRows(
      rows.map((r) => {
        if (!selectedRowIds.has(r.id)) return r;
        if (type === "header") return { ...r, type: "header", unit: "", qty: "", rate: "", amount: "" };
        if (type === "subtotal") return { ...r, type: "subtotal", description: r.description || "Sub Total", unit: "", qty: "", rate: "" };
        if (type === "sheettotal") return { ...r, type: "sheettotal", description: r.description || "Sheet Total", unit: "", qty: "", rate: "" };
        if (type === "grandtotal") return { ...r, type: "grandtotal", description: r.description || "Grand Total", unit: "", qty: "", rate: "" };
        if (type === "notes") return { ...r, type: "notes", itemNo: "", description: r.description || "Note", unit: "", qty: "", rate: "", amount: "" };
        if (type === "specification") return { ...r, type: "specification", itemNo: "", description: r.description || "Specification", unit: "", qty: "", rate: "", amount: "" };
        return { ...r, type: "item" };
      })
    );
  };

  const deleteSelected = () => {
    if (selectedRowIds.size === 0) return;
    setRows(rows.filter((r) => !selectedRowIds.has(r.id)));
    setSelectedRowIds(new Set());
    setLastSelectedRowId(null);
  };

  const copyRow = () => {
    if (selectedRowIds.size === 0) return;
    const copied = rows.filter((r) => selectedRowIds.has(r.id)).map((r) => ({ ...r }));
    if (copied.length > 0) setClipboard(copied);
  };

  const pasteRowAt = (position: "above" | "below") => {
    if (!clipboard.length || !lastSelectedRowId) return;
    const selectedIndices = rows.map((r, i) => (selectedRowIds.has(r.id) ? i : -1)).filter((i) => i !== -1);
    if (selectedIndices.length === 0) return;
    const anchorIdx = position === "above" ? Math.min(...selectedIndices) : Math.max(...selectedIndices);
    const newRows = [...rows];
    newRows.splice(position === "above" ? anchorIdx : anchorIdx + 1, 0, ...clipboard.map((r) => ({ ...r, id: uuid() })));
    setRows(newRows);
  };

  const moveRow = (dir: "up" | "down") => {
    if (selectedRowIds.size !== 1) return;
    const idx = rows.findIndex((r) => selectedRowIds.has(r.id));
    if (dir === "up" && idx <= 0) return;
    if (dir === "down" && idx >= rows.length - 1) return;
    const newRows = [...rows];
    const swapIdx = dir === "up" ? idx - 1 : idx + 1;
    [newRows[idx], newRows[swapIdx]] = [newRows[swapIdx], newRows[idx]];
    setRows(newRows);
  };

  const selectedRow = lastSelectedRowId ? rows.find((r) => r.id === lastSelectedRowId) : null;
  const hasSelection = selectedRowIds.size > 0;
  const hasCellSelection = !!selection;

  // A BOQ may carry exactly one grand total. Count grand totals across every
  // sheet, excluding the currently selected row so re-converting the existing
  // grand total stays allowed; when one already lives elsewhere, block creating
  // a second (the user should subtotal a sheet and keep one grand total).
  const selectedRowIsGrandTotal = selectedRowIds.size === 1 && selectedRow?.type === "grandtotal";
  const grandTotalExistsElsewhere = boqSheets.some((sh) =>
    sh.rows.some((r) => r.type === "grandtotal" && r.id !== lastSelectedRowId)
  );
  // One Sheet Total per sheet (this sheet only); the summary's Grand Total adds
  // these up across sheets.
  const selectedRowIsSheetTotal = selectedRowIds.size === 1 && selectedRow?.type === "sheettotal";
  const sheetTotalExistsInSheet = rows.some((r) => r.type === "sheettotal" && r.id !== lastSelectedRowId);

  const contextItems: ContextMenuItem[] = [
    { label: "Add Row Above", icon: <Plus size={14} />, action: () => lastSelectedRowId && insertRowAt("item", lastSelectedRowId, "above"), disabled: readOnly },
    { label: "Add Row Below", icon: <Plus size={14} />, action: () => lastSelectedRowId && insertRowAt("item", lastSelectedRowId, "below"), disabled: readOnly },
    { divider: true },
    ...(hasSelection
      ? [
          { label: "Convert to Section Header", icon: <Heading size={14} />, action: () => convertRowTo("header"), disabled: readOnly || (selectedRowIds.size === 1 && selectedRow?.type === "header") },
          { label: "Convert to Notes", icon: <StickyNote size={14} />, action: () => convertRowTo("notes"), disabled: readOnly || (selectedRowIds.size === 1 && selectedRow?.type === "notes") },
          { label: "Convert to Specification", icon: <StickyNote size={14} />, action: () => convertRowTo("specification"), disabled: readOnly || (selectedRowIds.size === 1 && selectedRow?.type === "specification") },
          { label: "Convert to Sub Total", icon: <Sigma size={14} />, action: () => convertRowTo("subtotal"), disabled: readOnly || (selectedRowIds.size === 1 && selectedRow?.type === "subtotal") },
          { label: sheetTotalExistsInSheet && !selectedRowIsSheetTotal ? "Sheet Total already on this sheet" : "Convert to Sheet Total", icon: <Sigma size={14} />, action: () => convertRowTo("sheettotal"), disabled: readOnly || selectedRowIsSheetTotal || sheetTotalExistsInSheet },
          { label: grandTotalExistsElsewhere && !selectedRowIsGrandTotal ? "Grand Total already exists" : "Convert to Grand Total", icon: <Sigma size={14} />, action: () => convertRowTo("grandtotal"), disabled: readOnly || selectedRowIsGrandTotal || grandTotalExistsElsewhere },
          { label: "Convert to Regular Item", icon: <FileSpreadsheet size={14} />, action: () => convertRowTo("item"), disabled: readOnly || (selectedRowIds.size === 1 && selectedRow?.type === "item") },
          { divider: true } as ContextMenuItem,
        ]
      : []),
    ...(hasCellSelection
      ? [
          { label: "Merge Cells", icon: <LayoutGrid size={14} />, action: mergeSelectedCells, disabled: readOnly || !isMergeableSelection() || isSelectionMerged() },
          { label: "Unmerge Cells", icon: <X size={14} />, action: unmergeSelectedCells, disabled: readOnly || !isSelectionMerged() },
          { divider: true } as ContextMenuItem,
        ]
      : []),
    ...(hasSelection
      ? [
          { label: selectedRowIds.size > 1 ? "Delete Rows" : "Delete Row", icon: <Trash2 size={14} />, action: deleteSelected, danger: true, disabled: readOnly },
          { divider: true } as ContextMenuItem,
          { label: selectedRowIds.size > 1 ? "Copy Rows" : "Copy Row", icon: <Copy size={14} />, action: copyRow },
          { label: "Paste Row Above", icon: <ClipboardPaste size={14} />, action: () => pasteRowAt("above"), disabled: !clipboard.length || readOnly },
          { label: "Paste Row Below", icon: <ClipboardPaste size={14} />, action: () => pasteRowAt("below"), disabled: !clipboard.length || readOnly },
          { label: "Move Up", icon: <ArrowUp size={14} />, action: () => moveRow("up"), disabled: selectedRowIds.size > 1 || readOnly },
          { label: "Move Down", icon: <ArrowDown size={14} />, action: () => moveRow("down"), disabled: selectedRowIds.size > 1 || readOnly },
        ]
      : []),
    { divider: true },
    { label: "Toggle Summary of Subtotals", icon: <LayoutList size={14} />, action: () => toggleSheetSummary(activeSheetIndex) },
  ];

  const headerContextItems: ContextMenuItem[] = headerCtxMenu
    ? [
        isColumnLocked(headerCtxMenu.colKey)
          ? {
              label: "Unlock Column",
              icon: <Pencil size={14} />,
              action: () => {
                setUnlockedColumns((prev) => new Set([...Array.from(prev), headerCtxMenu.colKey]));
                setHeaderCtxMenu(null);
              },
            }
          : {
              label: "Lock Column",
              icon: <X size={14} />,
              action: () => {
                setUnlockedColumns((prev) => {
                  const next = new Set(prev);
                  next.delete(headerCtxMenu.colKey);
                  return next;
                });
                setHeaderCtxMenu(null);
              },
            },
      ]
    : [];

  const getRowClass = (row: BOQRow) => {
    if (row.type === "header") return "row-header";
    if (row.type === "notes") return "row-notes";
    if (row.type === "specification") return "row-specification";
    if (row.type === "subtotal") return "row-subtotal";
    if (row.type === "sheettotal") return "row-sheettotal";
    if (row.type === "grandtotal") return "row-grandtotal";
    return "";
  };

  return (
    <>
    {formulaLinking?.active && (
      <div className="mb-3 rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-txt">
        <div className="font-semibold text-accent">Formula mode</div>
        <div className="mt-1 text-xs leading-5 text-txt-muted">
          Click a cell on any sheet, then press <span className="font-semibold text-txt">Enter</span> to confirm or{" "}
          <span className="font-semibold text-txt">Esc</span> to cancel.
          {formulaLinking.currentFormula && formulaLinking.currentFormula !== "=" ? (
            <span className="ml-2 font-mono text-accent">{formulaLinking.currentFormula}</span>
          ) : null}
        </div>
      </div>
    )}
    <div
      ref={tableContainerRef}
      className={`boq-table-shell relative overflow-auto rounded-2xl border border-border bg-bg-surface ${readOnly ? "boq-hide-gutter" : ""}`}
      style={{ maxHeight: "calc(100vh - 310px)" }}
      tabIndex={0}
    >
      {isPasteMode && (
        <div className="paste-overlay">
          <p className="text-accent text-sm font-medium">Paste your data here (Ctrl+V / ⌘V)</p>
        </div>
      )}
      <table className="boq-reference-table w-full select-none table-fixed border-collapse min-w-[660px] sm:min-w-[760px]">
        <thead>
          <tr>
            <th className="boq-gutter-head w-8 min-w-[32px] p-1 bg-bg-raised border-b-2 border-b-accent border-r border-r-border sticky top-0 left-0 z-30 text-[11px] font-semibold text-txt-dim uppercase tracking-[0.16em]">#</th>
            {BOQ_COLS.map((col) => {
              const locked = isColumnLocked(col.key);
              const stickyCol = col.key === "description";
              return (
                <th
                  key={col.key}
                  className={`${col.width} px-2 py-2 bg-bg-raised border-b-2 border-b-accent border-r border-r-border text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim ${col.align} sticky top-0 ${stickyCol ? "left-8 z-30" : "z-10"} ${locked ? "cursor-context-menu" : ""}`}
                  onContextMenu={(e) => handleHeaderContextMenu(e, col.key)}
                >
                  {col.label}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => {
            const isSelected = selectedRowIds.has(row.id);
            return (
              <tr key={row.id} className={`${getRowClass(row)} ${isSelected ? "row-selected" : ""} transition-colors duration-75`} onContextMenu={(e) => handleContextMenu(e, row.id)}>
                <td className={`row-gutter boq-sticky-col left-0 ${isSelected ? "selected" : ""}`} onClick={(e) => handleRowSelect(e, row.id)}>{ri + 1}</td>
                {row.type === "notes" || row.type === "specification" ? (
                  <td
                    colSpan={BOQ_COLS.length}
                    className={`relative border-b border-b-border px-3 py-2 text-left text-[13px] transition-colors ${row.type === "specification" ? "italic" : ""} ${isInSelection(ri, "description") ? "bg-accent/15 ring-1 ring-inset ring-accent/30" : ""}`}
                    onMouseDown={(e) => {
                      if (e.button === 0) {
                        e.preventDefault();
                        handleMouseDown(e, ri, "description", row.id);
                      }
                    }}
                    onMouseEnter={() => handleMouseEnter(ri, "description")}
                    onContextMenu={(e) => handleContextMenu(e, row.id)}
                    onClick={() => !readOnly && setEditing({ id: row.id, key: "description" })}
                  >
                    {editing?.id === row.id && editing?.key === "description" && !readOnly ? (
                      <textarea
                        autoFocus
                        rows={3}
                        className="boq-cell-input outline-none resize-none w-full bg-transparent text-left"
                        value={row.description}
                        onChange={(e) => updateCell(row.id, "description", e.target.value)}
                        onBlur={() => setEditing(null)}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") setEditing(null);
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            setEditing(null);
                          }
                        }}
                      />
                    ) : (
                      <div className="flex gap-3 whitespace-pre-wrap break-words leading-6 text-txt-muted">
                        {row.type !== "specification" ? (
                          <span className="mt-0.5 inline-flex h-5 shrink-0 items-center rounded-full border border-accent/25 bg-accent/10 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-accent not-italic">
                            Note
                          </span>
                        ) : null}
                        <span>{row.description || (row.type === "specification" ? "Double-click to add a specification" : "Double-click to add a note")}</span>
                      </div>
                    )}
                  </td>
                ) : (
                  BOQ_COLS.map((col) => {
                  const colIdx = BOQ_COLS.findIndex((x) => x.key === col.key);
                  const mergedRange = getMergedRangeForRow(row as BOQRowExtended);
                  const mergedStartIdx = mergedRange ? BOQ_COLS.findIndex((x) => x.key === mergedRange.startColumn) : -1;
                  const mergedEndIdx = mergedRange ? BOQ_COLS.findIndex((x) => x.key === mergedRange.endColumn) : -1;
                  const isMergedSkip = mergedRange && colIdx > mergedStartIdx && colIdx <= mergedEndIdx;
                  if (isMergedSkip) return null;

                  const isMergedStart = mergedRange?.startColumn === col.key;
                  const mergedSpanCount = isMergedStart && mergedEndIdx > mergedStartIdx ? mergedEndIdx - mergedStartIdx + 1 : 0;
                  const colSpan = mergedSpanCount ? mergedSpanCount : undefined;
                  const isEditing = !readOnly && editing?.id === row.id && editing?.key === col.key;
                  const locked = isColumnLocked(col.key);
                  const editable = !readOnly && !locked && (row.type === "item" || (col.key === "description" && (row.type === "header" || row.type === "subtotal" || row.type === "sheettotal" || row.type === "grandtotal")) || (col.key === "itemNo" && row.type === "header"));
                  const cellValue = String((row as any)[col.key] ?? "");
                  const showFormulaSuggestions = isEditing && cellValue.startsWith("=");
                  const isFormulaSourceCell =
                    formulaLinking?.active &&
                    formulaLinking.sourceSheetIndex === activeSheetIndex &&
                    formulaLinking.sourceRowId === row.id &&
                    formulaLinking.sourceColKey === col.key;
                  const isFormulaTargetCell =
                    formulaLinking?.active &&
                    formulaLinking.targetSheetIndex === activeSheetIndex &&
                    formulaLinking.targetRowId === row.id &&
                    formulaLinking.targetColKey === col.key;
                  return (
                    <td
                      key={col.key}
                      colSpan={colSpan}
                      className={`relative px-2 py-[6px] min-h-[34px] border-r border-r-border border-b border-b-border ${col.align} text-[13px] transition-colors ${col.mono ? "font-mono" : ""} ${col.key === "description" ? "boq-sticky-col left-8" : ""} ${isInSelection(ri, col.key) ? "bg-accent/15 ring-1 ring-inset ring-accent/30" : ""} ${locked ? "bg-bg-raised/30 cursor-not-allowed select-none" : ""} ${isFormulaSourceCell ? "cell-linking-source" : ""} ${isFormulaTargetCell ? "cell-linking-target" : ""}`}
                      onMouseDown={(e) => {
                        if (formulaLinking?.active) {
                          e.preventDefault();
                          selectFormulaSource(activeSheetIndex, row.id, col.key);
                          setSelectedRowIds(new Set([row.id]));
                          setLastSelectedRowId(row.id);
                          setSelection({ start: { r: ri, c: col.key }, end: { r: ri, c: col.key }, isDragging: false });
                          return;
                        }
                        if (e.button === 0) {
                          e.preventDefault();
                          !locked && handleMouseDown(e, ri, col.key, row.id);
                        }
                      }}
                      onMouseEnter={() => !formulaLinking?.active && !locked && handleMouseEnter(ri, col.key)}
                      onContextMenu={(e) => handleContextMenu(e, row.id)}
                      onClick={() => !formulaLinking?.active && editable && setEditing({ id: row.id, key: col.key })}
                    >
                      {isEditing ? (
                        col.key === "description" ? (
                          <textarea
                            autoFocus
                            rows={3}
                            className={`boq-cell-input outline-none resize-none w-full bg-transparent ${col.mono ? "mono" : ""} ${col.align}`}
                            value={(row as any)[col.key]}
                            onChange={(e) => updateCell(row.id, col.key, e.target.value)}
                            onBlur={() => setEditing(null)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); setEditing(null); const nextRow = rows[ri + 1]; if (nextRow) setEditing({ id: nextRow.id, key: col.key }); }
                              if (e.key === "Tab") { e.preventDefault(); const ci = BOQ_COLS.findIndex((c) => c.key === col.key); const nextCol = BOQ_COLS[ci + 1]; if (nextCol) setEditing({ id: row.id, key: nextCol.key }); else { const nextRow = rows[ri + 1]; if (nextRow) setEditing({ id: nextRow.id, key: BOQ_COLS[0].key }); } }
                              if (e.key === "Escape") setEditing(null);
                            }}
                          />
                        ) : (
                          <input
                            autoFocus
                            className={`boq-cell-input ${col.mono ? "mono" : ""} ${col.align}`}
                            value={(row as any)[col.key]}
                            onChange={(e) => updateCell(row.id, col.key, e.target.value)}
                            onBlur={() => setEditing(null)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") { setEditing(null); const nextRow = rows[ri + 1]; if (nextRow) setEditing({ id: nextRow.id, key: col.key }); }
                              if (e.key === "Tab") { e.preventDefault(); const ci = BOQ_COLS.findIndex((c) => c.key === col.key); const nextCol = BOQ_COLS[ci + 1]; if (nextCol) setEditing({ id: row.id, key: nextCol.key }); else { const nextRow = rows[ri + 1]; if (nextRow) setEditing({ id: nextRow.id, key: BOQ_COLS[0].key }); } }
                              if (e.key === "Escape") setEditing(null);
                            }}
                          />
                        )
                      ) : (
                        <span className={`block ${col.key === "description" ? "whitespace-pre-wrap break-words leading-snug min-w-[140px] sm:min-w-[280px]" : "truncate"}`}>
                          {formatBOQCellDisplay(row, col.key, boqSheets)}
                        </span>
                      )}
                      {showFormulaSuggestions && (
                        <div className="absolute left-1 right-1 top-full mt-1 z-30 rounded-md border border-border bg-bg-surface shadow-xl">
                          {formulaSuggestions.map((suggestion) => (
                            <button
                              key={suggestion.value}
                              type="button"
                              className="w-full text-left px-2 py-1.5 text-xs bg-transparent border-none text-txt-muted hover:text-txt hover:bg-bg-hover cursor-pointer"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => {
                                updateCell(row.id, col.key, suggestion.value);
                                startFormulaLinking(activeSheetIndex, row.id, col.key, suggestion.value);
                                setEditing({ id: row.id, key: col.key });
                              }}
                            >
                              {suggestion.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </td>
                  );
                  })
                )}
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* ─── Summary of Subtotals — Table Style ─── */}
      {boqSheets[activeSheetIndex]?.showSummary && (
        <div className="boq-summary-table mt-12 mb-8 hidden px-4 lg:block">
          <div className="flex items-center gap-4 mb-4 px-1">
            <div className="h-px flex-1 bg-border" />
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim whitespace-nowrap px-4">Summary of Subtotals</h3>
            <div className="h-px flex-1 bg-border" />
          </div>

          <table className="border-collapse w-full text-[11px]" style={{ minWidth: 820 }}>
            <thead>
              <tr className="bg-bg-raised/50">
                <th className="w-8 min-w-[32px] p-1 border border-border text-[10px] font-semibold text-txt-dim uppercase tracking-[0.14em] text-center">#</th>
                <th className="w-[70px] border border-border text-[10px]">&nbsp;</th>
                <th className="min-w-[280px] w-full px-2 py-2 border border-border text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim text-left">Summary Description</th>
                <th className="w-[70px] border border-border text-[10px]">&nbsp;</th>
                <th className="w-[100px] border border-border text-[10px]">&nbsp;</th>
                <th className="w-[110px] border border-border text-[10px]">&nbsp;</th>
                <th className="w-[130px] px-2 py-2 border border-border text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.filter(r => r.type === 'subtotal').map((sub, si) => (
                <tr key={sub.id} className="hover:bg-bg-hover transition-colors group">
                  <td className="w-8 min-w-[32px] p-1 border border-border text-center text-txt-dim font-mono text-[10px]">{si + 1}</td>
                  <td className="w-[70px] border border-border">&nbsp;</td>
                  <td className="min-w-[280px] w-full px-2 py-1.5 border border-border">
                    {readOnly ? (
                      <div className="text-xs font-semibold uppercase text-txt">{sub.description}</div>
                    ) : (
                      <input
                        className="w-full bg-transparent border-none outline-none text-xs font-semibold uppercase focus:ring-1 focus:ring-accent/30 rounded px-1 -ml-1 transition-all"
                        value={sub.description}
                        onChange={(e) => updateCell(sub.id, "description", e.target.value)}
                        placeholder="Unnamed Subtotal"
                      />
                    )}
                  </td>
                  <td className="w-[70px] border border-border">&nbsp;</td>
                  <td className="w-[100px] border border-border">&nbsp;</td>
                  <td className="w-[110px] border border-border">&nbsp;</td>
                  <td className="w-[130px] px-2 py-1.5 border border-border text-right font-mono font-semibold text-txt text-[13px]">
                    {formatBOQNumberDisplay(sub.amount, boqSheets)}
                  </td>
                </tr>
              ))}

              {/* Grand Summary Row */}
              <tr className="bg-accent/5">
                <td className="border border-border">&nbsp;</td>
                <td className="border border-border">&nbsp;</td>
                <td className="px-2 py-3 border border-border">
                  {readOnly ? (
                    <div className="text-sm font-semibold uppercase text-accent">
                      {boqSheets[activeSheetIndex]?.summaryGrandTotalTitle || "GRAND SUMMARY"}
                    </div>
                  ) : (
                    <input
                      className="w-full bg-transparent border-none outline-none text-sm font-semibold uppercase text-accent focus:ring-0"
                      value={boqSheets[activeSheetIndex]?.summaryGrandTotalTitle || "GRAND SUMMARY"}
                      onChange={(e) => updateSheetSummaryLabel(activeSheetIndex, e.target.value)}
                    />
                  )}
                </td>
                <td className="border border-border">&nbsp;</td>
                <td className="border border-border">&nbsp;</td>
                <td className="border border-border">&nbsp;</td>
                <td className="px-2 py-3 border border-border text-right font-mono font-semibold text-accent text-base">
                  {currency(
                    rows.filter(r => r.type === 'subtotal').reduce((acc, r) => acc + resolveBOQNumber(r.amount, boqSheets), 0)
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {ctxMenu && <ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={contextItems} onClose={() => setCtxMenu(null)} />}
      {headerCtxMenu && (
        <ContextMenu
          x={headerCtxMenu.x}
          y={headerCtxMenu.y}
          items={headerContextItems}
          onClose={() => setHeaderCtxMenu(null)}
        />
      )}
    </div>
    </>
  );
}

// ─── Library Browser Modal ────────────────────────────────────────
function LibraryBrowser({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { boqLibrary, boqSheets, loadBOQFromLibrary, appendBOQFromLibrary } = useAppStore();
  const [selected, setSelected] = useState<string | null>(null);

  // True when the current BOQ already holds meaningful content. Used to guard the
  // destructive "replace" action so an import never silently wipes existing work.
  const hasExistingContent = useMemo(
    () =>
      boqSheets.some((sheet) =>
        sheet.rows.some(
          (r) =>
            (r.description && r.description.trim()) ||
            (r.qty && r.qty.trim()) ||
            (r.rate && r.rate.trim())
        )
      ),
    [boqSheets]
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [search, setSearch] = useState("");

  const categories = useMemo(() => {
    const set = new Set<string>();
    boqLibrary.forEach((b) => set.add(b.category?.trim() || "Uncategorized"));
    return Array.from(set).sort();
  }, [boqLibrary]);

  const groups = useMemo(() => {
    const query = search.trim().toLowerCase();
    const terms = query ? query.split(/\s+/) : [];
    const filtered = boqLibrary.filter((b) => {
      if (categoryFilter && (b.category?.trim() || "Uncategorized") !== categoryFilter) return false;
      if (terms.length === 0) return true;
      const haystack = [
        b.name,
        b.description,
        b.category,
        b.subcategory,
        ...(b.tags ?? []),
      ]
        .join(" ")
        .toLowerCase();
      return terms.every((t) => haystack.includes(t));
    });
    const map = new Map<string, BOQLibraryItem[]>();
    for (const item of filtered) {
      const key = `${item.category?.trim() || "Uncategorized"} › ${item.subcategory?.trim() || "General"}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return Array.from(map.entries());
  }, [boqLibrary, categoryFilter, search]);

  const handleLoad = () => {
    const item = boqLibrary.find((b) => b.id === selected);
    if (!item) return;
    if (
      hasExistingContent &&
      !window.confirm(
        `Replace the current BOQ with “${item.name}”?\n\nThis discards all existing sheets and rows. To keep them, use “Add as sheet(s)” instead.`
      )
    ) {
      return;
    }
    loadBOQFromLibrary(item.sheets);
    onClose();
  };

  const handleAppend = () => {
    const item = boqLibrary.find((b) => b.id === selected);
    if (item) {
      appendBOQFromLibrary(item.sheets, item.name);
      onClose();
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="BOQ Library" width={600}>
      <div className="mb-3 relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-txt-dim pointer-events-none" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, keyword or tag (e.g. borehole, water tank, uPVC)"
          className="w-full pl-9 pr-3 py-2 bg-bg-input border border-border rounded-md text-sm text-txt outline-none focus:border-accent"
        />
      </div>
      {categories.length > 1 ? (
        <div className="mb-3 flex flex-wrap gap-1.5">
          <button
            type="button"
            className={`px-2.5 py-1 text-xs rounded-md border cursor-pointer ${
              categoryFilter === ""
                ? "border-accent bg-accent/10 text-accent"
                : "border-border text-txt-muted hover:bg-bg-hover"
            }`}
            onClick={() => setCategoryFilter("")}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`px-2.5 py-1 text-xs rounded-md border cursor-pointer ${
                categoryFilter === cat
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border text-txt-muted hover:bg-bg-hover"
              }`}
              onClick={() => setCategoryFilter(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      ) : null}
      <div className="flex flex-col gap-4 max-h-[400px] overflow-auto">
        {groups.length === 0 ? (
          <div className="py-10 text-center text-sm text-txt-muted">
            {search.trim()
              ? `No templates match “${search.trim()}”.`
              : "No templates in the library yet."}
          </div>
        ) : null}
        {groups.map(([groupKey, items]) => (
          <div key={groupKey} className="flex flex-col gap-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim sticky top-0 bg-bg-surface py-1">
              {groupKey}
            </div>
            {items.map((item) => (
          <div key={item.id}>
            <div
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                selected === item.id
                  ? "border-accent bg-accent/5"
                  : "border-border hover:border-border-light hover:bg-bg-hover"
              }`}
              onClick={() => {
                setSelected(item.id);
                setExpandedId(expandedId === item.id ? null : item.id);
              }}
            >
              <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center">
                <FileSpreadsheet size={18} className="text-accent" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm">{item.name}</div>
                <div className="text-xs text-txt-muted mt-0.5 truncate">{item.description}</div>
                {item.tags && item.tags.length > 0 ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {item.tags.slice(0, 5).map((tag) => (
                      <span
                        key={tag}
                        className="px-1.5 py-0.5 rounded text-[10px] bg-bg-raised text-txt-dim border border-border"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
              <ChevronRight
                size={16}
                className={`text-txt-dim transition-transform ${expandedId === item.id ? "rotate-90" : ""}`}
              />
            </div>

            {/* Preview items */}
            {expandedId === item.id && (
              <div className="ml-12 mt-1 mb-2 p-3 bg-bg-raised rounded-md border border-border text-xs">
                <div className="font-semibold text-txt-muted mb-2">
                  {item.sheets.length} sheet(s) •{" "}
                  {item.sheets.reduce((s, sh) => s + sh.rows.filter((r) => r.type === "item").length, 0)} items
                </div>
                {item.sheets[0]?.rows.slice(0, 8).map((r, i) => (
                  <div key={i} className="flex gap-2 py-0.5 text-txt-muted">
                    {r.type === "header" ? (
                      <span className="font-bold text-txt">{r.description}</span>
                    ) : r.type === "notes" ? (
                      <span className="italic text-txt-dim">Note: {r.description}</span>
                    ) : r.type === "specification" ? (
                      <span className="italic text-txt-dim">Spec: {r.description}</span>
                    ) : r.type === "subtotal" || r.type === "sheettotal" || r.type === "grandtotal" ? (
                      <span className="font-semibold italic">{r.description}</span>
                    ) : (
                      <>
                        <span className="w-10 text-txt-dim">{r.itemNo}</span>
                        <span className="flex-1 truncate">{r.description}</span>
                        <span className="w-8 text-center">{r.unit}</span>
                      </>
                    )}
                  </div>
                ))}
                {(item.sheets[0]?.rows.length || 0) > 8 && (
                  <div className="text-txt-dim mt-1">... and more items</div>
                )}
              </div>
            )}
          </div>
            ))}
          </div>
        ))}
      </div>
      {hasExistingContent && selected ? (
        <div className="mt-4 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-200">
          <AlertTriangle size={15} className="mt-0.5 flex-shrink-0 text-amber-400" />
          <span>
            This project already has a BOQ. <strong>Replace current BOQ</strong> will permanently
            discard all existing sheets and rows. Choose <strong>Add as sheet(s)</strong> to keep
            them and append the template as new tab(s).
          </span>
        </div>
      ) : null}
      <div className="mt-5 flex flex-col-reverse gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[11px] text-txt-dim sm:max-w-[260px]">
          <strong className="text-txt-muted">Add as sheet(s)</strong> appends it as new tab(s) you can reorder — your existing BOQ is kept.{" "}
          <strong className="text-txt-muted">Replace</strong> discards the current BOQ.
        </p>
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="ghost" disabled={!selected} onClick={handleLoad}>
            {hasExistingContent ? "Replace current BOQ" : "Load BOQ"}
          </Button>
          <Button variant="primary" disabled={!selected} onClick={handleAppend}>
            Add as sheet(s)
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── AI Draft Modal ───────────────────────────────────────────────
// Describe the works in plain language; the server route drafts a BOQ via the
// configured AI provider. The draft is reviewed here and applied through the
// same store actions as the library (replace or append) — nothing is written
// until the user accepts it.
function AiDraftModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { boqSheets, loadBOQFromLibrary, appendBOQFromLibrary } = useAppStore();
  const [brief, setBrief] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<BOQSheet[] | null>(null);

  const hasExistingContent = useMemo(
    () =>
      boqSheets.some((sheet) =>
        sheet.rows.some(
          (r) =>
            (r.description && r.description.trim()) ||
            (r.qty && r.qty.trim()) ||
            (r.rate && r.rate.trim())
        )
      ),
    [boqSheets]
  );

  const reset = () => {
    setBrief("");
    setError(null);
    setDraft(null);
    setLoading(false);
  };

  const close = () => {
    reset();
    onClose();
  };

  const itemCount = useMemo(
    () => (draft ? draft.reduce((n, s) => n + s.rows.filter((r) => r.type === "item").length, 0) : 0),
    [draft]
  );

  const generate = async () => {
    const trimmed = brief.trim();
    if (trimmed.length < 3) {
      setError("Describe the works to draft a BOQ.");
      return;
    }
    setError(null);
    setDraft(null);
    setLoading(true);
    try {
      const res = await fetch("/api/ai/boq", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ brief: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Could not generate a draft. Please try again.");
        return;
      }
      const sheets = Array.isArray(data?.sheets) ? (data.sheets as BOQSheet[]) : [];
      if (sheets.length === 0) {
        setError("The draft came back empty. Try a more specific description.");
        return;
      }
      setDraft(sheets);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const apply = (mode: "replace" | "append") => {
    if (!draft) return;
    if (mode === "replace") loadBOQFromLibrary(draft);
    else appendBOQFromLibrary(draft, "AI draft");
    close();
  };

  return (
    <Modal open={open} onClose={close} title="Draft BOQ with AI" width={620}>
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-txt-muted">
            Describe the works
          </label>
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            rows={4}
            placeholder="e.g. 4 km rural gravel road with two 2-cell box culverts and side drains, plus road signs and markings."
            className="w-full resize-y rounded-md border border-border bg-bg-raised px-3 py-2 text-sm text-txt outline-none focus:border-accent"
          />
          <p className="mt-1 text-[11px] text-txt-dim">
            The AI estimates structure, items, units and quantities. Rates are left blank
            for the engineer to fill.
          </p>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-[12px] text-red-300">
            <AlertTriangle size={15} className="mt-0.5 flex-shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        {!draft && (
          <div className="flex justify-end">
            <Button variant="primary" disabled={loading} onClick={generate}>
              <Sparkles size={14} /> {loading ? "Drafting…" : "Generate draft"}
            </Button>
          </div>
        )}

        {draft && (
          <>
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-200">
              <strong>Review before use.</strong> AI-drafted quantities are estimates — check
              every line and set rates before relying on this BOQ.
            </div>

            <div className="max-h-[300px] space-y-3 overflow-auto rounded-md border border-border bg-bg-raised/30 p-3">
              {draft.map((sheet) => (
                <div key={sheet.id}>
                  <div className="mb-1 text-xs font-semibold text-accent">{sheet.name}</div>
                  <div className="space-y-0.5">
                    {sheet.rows.map((r) => (
                      <div key={r.id} className="flex items-baseline gap-2 text-[12px]">
                        {r.type === "item" ? (
                          <>
                            <span className="w-10 flex-shrink-0 text-txt-dim">{r.itemNo}</span>
                            <span className="flex-1 text-txt">{r.description}</span>
                            <span className="flex-shrink-0 text-txt-muted">
                              {r.qty} {r.unit}
                            </span>
                          </>
                        ) : (
                          <span
                            className={`flex-1 ${
                              r.type === "header"
                                ? "font-semibold text-txt"
                                : "italic text-txt-muted"
                            }`}
                          >
                            {r.description}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {hasExistingContent && (
              <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-200">
                <AlertTriangle size={15} className="mt-0.5 flex-shrink-0 text-amber-400" />
                <span>
                  This project already has a BOQ. <strong>Replace</strong> discards it; choose{" "}
                  <strong>Add as sheet(s)</strong> to keep it and append the draft.
                </span>
              </div>
            )}

            <div className="flex flex-col-reverse gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[11px] text-txt-dim">
                {draft.length} sheet{draft.length === 1 ? "" : "s"} · {itemCount} item
                {itemCount === 1 ? "" : "s"}
              </p>
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <Button variant="ghost" onClick={() => setDraft(null)}>
                  Discard
                </Button>
                <Button variant="ghost" onClick={() => apply("replace")}>
                  {hasExistingContent ? "Replace current BOQ" : "Load BOQ"}
                </Button>
                <Button variant="primary" onClick={() => apply("append")}>
                  Add as sheet(s)
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

// ─── Save to Library Modal ────────────────────────────────────────
function SaveToLibraryModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const authConfigured = isSupabaseConfigured();
  const { boqLibrary, boqSheets, addToLibrary, setBOQLibrary } = useAppStore();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [tags, setTags] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const tagList = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const part of tags.split(/[,\n]/)) {
      const t = part.trim();
      if (!t) continue;
      const key = t.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(t);
    }
    return out;
  }, [tags]);

  const handleSave = async () => {
    if (!name.trim()) return;

    if (!authConfigured) {
      addToLibrary(name, description, category || "General", subcategory.trim(), tagList);
      onClose();
      setName("");
      setDescription("");
      setCategory("");
      setSubcategory("");
      setTags("");
      setNotice(null);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setNotice("Supabase environment variables are missing.");
      return;
    }

    setSaving(true);
    setNotice(null);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setSaving(false);
      setNotice("You need to sign in again before publishing BOQ templates.");
      return;
    }

    const { data, error } = await supabase
      .from("boq_library_items")
      .insert({
        name: name.trim(),
        description: description.trim(),
        category: category.trim() || "General",
        subcategory: subcategory.trim(),
        tags: tagList,
        sheets: boqSheets,
        author_id: user.id,
      })
      .select("*")
      .single();

    if (error) {
      setSaving(false);
      setNotice(error.message);
      return;
    }

    const nextItem = mapBOQLibraryItemRecord(data as BOQLibraryItemRecord);
    setBOQLibrary([nextItem, ...boqLibrary]);
    setSaving(false);
    onClose();
    setName("");
    setDescription("");
    setCategory("");
    setSubcategory("");
    setTags("");
    setNotice(null);
  };

  return (
    <Modal open={open} onClose={onClose} title="Save BOQ to Library">
      <div className="flex flex-col gap-4">
        <div>
          <label className="text-[11px] font-semibold text-txt-muted uppercase tracking-[0.16em] block mb-1.5">Name</label>
          <input
            className="w-full px-3 py-2 bg-bg-input border border-border rounded-md text-sm text-txt outline-none focus:border-accent"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Standard Road Works BOQ"
          />
        </div>
        <div>
          <label className="text-[11px] font-semibold text-txt-muted uppercase tracking-[0.16em] block mb-1.5">Description</label>
          <input
            className="w-full px-3 py-2 bg-bg-input border border-border rounded-md text-sm text-txt outline-none focus:border-accent"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief description of this BOQ"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-[11px] font-semibold text-txt-muted uppercase tracking-[0.16em] block mb-1.5">Category</label>
            <input
              className="w-full px-3 py-2 bg-bg-input border border-border rounded-md text-sm text-txt outline-none focus:border-accent"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. Roads & Highways"
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-txt-muted uppercase tracking-[0.16em] block mb-1.5">Subcategory</label>
            <input
              className="w-full px-3 py-2 bg-bg-input border border-border rounded-md text-sm text-txt outline-none focus:border-accent"
              value={subcategory}
              onChange={(e) => setSubcategory(e.target.value)}
              placeholder="e.g. Pavement & Surfacing"
            />
          </div>
        </div>
        <div>
          <label className="text-[11px] font-semibold text-txt-muted uppercase tracking-[0.16em] block mb-1.5">Tags</label>
          <input
            className="w-full px-3 py-2 bg-bg-input border border-border rounded-md text-sm text-txt outline-none focus:border-accent"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="Comma-separated keywords, e.g. borehole, drilling, water tank"
          />
          <p className="mt-1 text-[11px] text-txt-dim">Keywords users can search by. Separate with commas.</p>
        </div>
        {notice ? (
          <div className="rounded-xl border border-err/30 bg-err/10 px-3 py-2 text-sm text-err">
            {notice}
          </div>
        ) : null}
        <div className="mt-2 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="primary" disabled={!name.trim() || saving} onClick={handleSave}>
            {saving ? "Saving..." : "Save to Library"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Create BOQ Modal ─────────────────────────────────────────────
function CreateBOQModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { createBOQ } = useAppStore();
  const [name, setName] = useState("");

  const handleCreate = () => {
    if (!name.trim()) return;
    createBOQ(name.trim());
    onClose();
    setName("");
  };

  return (
    <Modal open={open} onClose={onClose} title="Create New BOQ" width={420}>
      <div className="flex flex-col gap-4">
        <div>
          <label className="text-[11px] font-semibold text-txt-muted uppercase tracking-[0.16em] block mb-1.5">
            BOQ Name
          </label>
          <input
            autoFocus
            className="w-full px-3 py-2.5 bg-bg-input border border-border rounded-lg text-sm text-txt outline-none focus:border-accent transition-colors placeholder:text-txt-dim"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            placeholder="e.g. Main Works BOQ, Drainage BOQ"
          />
        </div>
        <div className="mt-1 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!name.trim()} onClick={handleCreate}>
            <Plus size={14} /> Create
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Delete Confirm Modal ─────────────────────────────────────────
function DeleteConfirmModal({
  open,
  onClose,
  itemName,
  onConfirm,
  title = "Delete BOQ",
}: {
  open: boolean;
  onClose: () => void;
  itemName: string;
  onConfirm: () => void;
  title?: string;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} width={400}>
      <p className="text-sm text-txt-muted mb-5">
        Are you sure you want to delete <strong>{itemName}</strong>? This action cannot be undone.
      </p>
      <div className="flex gap-3">
        <Button variant="ghost" className="flex-1 justify-center" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="danger" className="flex-1 justify-center" onClick={onConfirm}>
          <Trash2 size={14} /> Delete
        </Button>
      </div>
    </Modal>
  );
}

// ─── BOQ List View ────────────────────────────────────────────────
function BOQListView({
  onOpen,
  onCreateClick,
}: {
  onOpen: (id: string) => void;
  onCreateClick: () => void;
}) {
  const { savedBOQs, project, deleteBOQ, duplicateBOQ } = useAppStore();
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const projectBOQs = savedBOQs.filter((b) => b.project_id === project?.id);

  return (
    <>
      {projectBOQs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <p className="text-txt-muted text-sm font-medium">No BOQs yet</p>
          <Button variant="primary" size="md" className="mt-4" onClick={onCreateClick}>
            <Plus size={14} /> Create BOQ
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {projectBOQs.map((boq, idx) => {
            const totalItems = boq.sheets.reduce(
              (s, sh) => s + sh.rows.filter((r) => r.type === "item").length,
              0
            );
            const totalAmount = boq.sheets.reduce(
              (s, sh) =>
                s +
                sh.rows
                  .filter((r) => r.type === "item")
                  .reduce((sum, r) => sum + resolveBOQItemAmount(r, boq.sheets), 0),
              0
            );

            return (
              <div
                key={boq.id}
                className="group flex flex-col gap-3 rounded-lg border border-border bg-bg-surface p-4 cursor-pointer transition-all duration-200 hover:border-accent/50 sm:flex-row sm:items-center sm:justify-between"
                style={{ animationDelay: `${idx * 60}ms`, animationFillMode: "both" }}
                onClick={() => onOpen(boq.id)}
              >
                <div className="flex min-w-0 items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
                    <LayoutGrid size={18} className="text-accent" />
                  </div>
                  <div>
                    <div className="font-semibold text-sm">{boq.name}</div>
                    <div className="mt-1.5 flex flex-wrap gap-2 text-[11px] text-txt-dim md:gap-3">
                      <span>{boq.sheets.length} sheet{boq.sheets.length !== 1 ? "s" : ""}</span>
                      <span>•</span>
                      <span>{totalItems} item{totalItems !== 1 ? "s" : ""}</span>
                      <span>•</span>
                      <span>Modified {new Date(boq.updatedAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 sm:justify-start">
                  {totalAmount > 0 && (
                    <div className="text-right mr-2">
                      <div className="text-[11px] font-semibold text-txt-dim uppercase tracking-[0.16em]">Total</div>
                      <div className="font-mono text-sm font-semibold mt-0.5 text-ok">
                        $ {currency(totalAmount)}
                      </div>
                    </div>
                  )}
                  <div className="flex gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                    <button
                      onClick={(e) => { e.stopPropagation(); duplicateBOQ(boq.id); }}
                      className="p-1.5 rounded-md bg-transparent border-none text-txt-dim hover:text-accent hover:bg-accent/10 cursor-pointer transition-colors"
                      title="Duplicate"
                    >
                      <Copy size={14} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget({ id: boq.id, name: boq.name }); }}
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
        <DeleteConfirmModal
          open={true}
          onClose={() => setDeleteTarget(null)}
          itemName={deleteTarget.name}
          onConfirm={() => {
            deleteBOQ(deleteTarget.id);
            setDeleteTarget(null);
          }}
        />
      )}
    </>
  );
}

// ─── Main BOQ Module ──────────────────────────────────────────────
export default function BOQModule() {
  const {
    boqSheets,
    activeSheetIndex,
    setActiveSheetIndex,
    updateSheetRows,
    addSheet,
    duplicateSheet,
    moveSheet,
    deleteSheet,
    renameSheet,
    activeBOQId,
    openBOQ,
    saveBOQ,
    savedBOQs,
    project,
    generateSummarySheet,
  } = useAppStore();

  // mode: 'list' | 'view' | 'edit'
  const [mode, setMode] = useState<"list" | "view" | "edit">(activeBOQId ? "view" : "list");
  const [showLibrary, setShowLibrary] = useState(false);
  const [showAiDraft, setShowAiDraft] = useState(false);
  const [showSaveLib, setShowSaveLib] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [selectedExportSheetIds, setSelectedExportSheetIds] = useState<Set<string>>(new Set());
  const [showImportPreview, setShowImportPreview] = useState(false);
  const [pendingRawSheets, setPendingRawSheets] = useState<RawExcelSheet[]>([]);
  const [pendingMappings, setPendingMappings] = useState<BOQColumnMapping[][]>([]);
  const [previewSheetIndex, setPreviewSheetIndex] = useState(0);
  const [renamingIdx, setRenamingIdx] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [sheetCtxMenu, setSheetCtxMenu] = useState<{ x: number; y: number; index: number } | null>(null);
  const [deleteSheetTarget, setDeleteSheetTarget] = useState<{ index: number; name: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const projectBOQs = savedBOQs.filter((b) => b.project_id === project?.id);
  const activeBoqName = projectBOQs.find((b) => b.id === activeBOQId)?.name || "BOQ";

  useEffect(() => {
    if (selectedExportSheetIds.size === 0 && boqSheets.length > 0) {
      setSelectedExportSheetIds(new Set(boqSheets.map((s) => s.id)));
    }
  }, [boqSheets, selectedExportSheetIds.size]);

  const exportBOQToExcel = async () => {
    const exportSheets = boqSheets.filter((s) => selectedExportSheetIds.has(s.id));
    if (!exportSheets.length) return;
    const XLSX = await import("xlsx-js-style");
    const wb = XLSX.utils.book_new();
    const cols = ["Item No.", "Description", "Unit", "Quantity", "Rate", "Amount"];
    const border = {
      top: { style: "thin", color: { rgb: "2A2A2A" } },
      bottom: { style: "thin", color: { rgb: "2A2A2A" } },
      left: { style: "thin", color: { rgb: "2A2A2A" } },
      right: { style: "thin", color: { rgb: "2A2A2A" } },
    };
    const baseFont = { name: "Times New Roman", sz: 11, color: { rgb: "111827" } };

    // Live-formula export: qty/rate are written as numbers, amount as =qty*rate,
    // subtotals as =SUM(section), and sheet/grand totals as SUMs (cross-sheet
    // where needed) so the spreadsheet stays editable.
    const toNum = (v: unknown): number | null => {
      const n = parseFloat(String(v ?? "").replace(/,/g, ""));
      return Number.isFinite(n) ? n : null;
    };
    const quoteSheetRef = (name: string) => `'${name.replace(/'/g, "''")}'`;
    const sheetTotalRefs: string[] = [];
    const grandTotalTargets: Array<{ ws: XLSXNS.WorkSheet; excelRow: number; itemRefs: string[]; value: number }> = [];

    exportSheets.forEach((sheet) => {
      const sheetName = (sheet.name || "Sheet").slice(0, 31);
      const aoa: Array<(string | number)>[] = [cols];
      sheet.rows.forEach((r) => {
        // qty/rate/amount get written as numbers/formulas below.
        aoa.push([r.itemNo, r.description, r.unit, "", "", ""]);
      });
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws["!cols"] = [{ wch: 12 }, { wch: 56 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 14 }];

      const setCell = (excelRow: number, col: number, cell: XLSXNS.CellObject) => {
        ws[XLSX.utils.encode_cell({ r: excelRow - 1, c: col })] = cell;
      };
      const itemRowsExcel: number[] = [];
      let sectionStart: number | null = null;
      sheet.rows.forEach((row, idx) => {
        const er = idx + 2; // 1-based Excel row (row 1 is the header)
        if (row.type === "item") {
          const q = toNum(row.qty);
          const rate = toNum(row.rate);
          if (q !== null) setCell(er, 3, { t: "n", v: q });
          if (rate !== null) setCell(er, 4, { t: "n", v: rate });
          // Formula cells must carry a cached value (v) or the writer drops them.
          const amountVal = resolveBOQItemAmount(row, boqSheets);
          const isFormula = typeof row.amount === "string" && row.amount.startsWith("=");
          if (!isFormula && q !== null && rate !== null) {
            setCell(er, 5, { t: "n", f: `D${er}*E${er}`, v: amountVal });
          } else if (amountVal) {
            setCell(er, 5, { t: "n", v: amountVal });
          }
          itemRowsExcel.push(er);
          if (sectionStart === null) sectionStart = er;
        } else if (row.type === "subtotal") {
          const val = resolveBOQNumber(row.amount, boqSheets);
          const isFormula = typeof row.amount === "string" && row.amount.startsWith("=");
          if (!isFormula && sectionStart !== null && er - 1 >= sectionStart) {
            setCell(er, 5, { t: "n", f: `SUM(F${sectionStart}:F${er - 1})`, v: val });
          } else {
            setCell(er, 5, { t: "n", v: val });
          }
          sectionStart = null;
        } else if (row.type === "sheettotal") {
          const refs = itemRowsExcel.map((r) => `F${r}`);
          const val = resolveBOQNumber(row.amount, boqSheets);
          setCell(er, 5, refs.length ? { t: "n", f: `SUM(${refs.join(",")})`, v: val } : { t: "n", v: val });
          sheetTotalRefs.push(`${quoteSheetRef(sheetName)}!F${er}`);
        } else if (row.type === "grandtotal") {
          grandTotalTargets.push({ ws, excelRow: er, itemRefs: itemRowsExcel.map((r) => `F${r}`), value: resolveBOQNumber(row.amount, boqSheets) });
        }
      });

      const styleRow = (rowNumber: number, style: Record<string, any>) => {
        for (let c = 0; c < 6; c++) {
          const addr = XLSX.utils.encode_cell({ r: rowNumber - 1, c });
          const cell = ws[addr];
          if (!cell) continue;
          (cell as any).s = { font: baseFont, ...((cell as any).s || {}), ...style };
        }
      };

      // Header row
      styleRow(1, {
        font: { ...baseFont, bold: true, color: { rgb: "28313F" } },
        fill: { patternType: "solid", fgColor: { rgb: "E7EAEF" } },
        border,
        alignment: { horizontal: "center", vertical: "center", wrapText: true },
      });

      // Data rows
      for (let r = 2; r <= aoa.length; r++) {
        styleRow(r, { border, alignment: { vertical: "center" } });
        // Align text fields
        for (const c of [0, 1, 2]) {
          const addr = XLSX.utils.encode_cell({ r: r - 1, c });
          if (ws[addr]) (ws[addr] as any).s = { ...((ws[addr] as any).s || {}), alignment: { horizontal: c === 1 ? "left" : "center", vertical: "center" } };
        }
        // Align/format numeric fields
        for (const c of [3, 4, 5]) {
          const addr = XLSX.utils.encode_cell({ r: r - 1, c });
          if (ws[addr]) (ws[addr] as any).s = { ...((ws[addr] as any).s || {}), alignment: { horizontal: "right", vertical: "center" }, numFmt: "#,##0.00" };
        }
      }

      // Row type highlighting
      sheet.rows.forEach((row, idx) => {
        const excelRow = idx + 2;
        if (row.type === "header") {
          styleRow(excelRow, {
            font: { ...baseFont, bold: true, color: { rgb: "28313F" } },
            fill: { patternType: "solid", fgColor: { rgb: "E7EAEF" } },
            border,
          });
        } else if (row.type === "subtotal") {
          styleRow(excelRow, {
            font: { ...baseFont, bold: true, color: { rgb: "28313F" } },
            fill: { patternType: "solid", fgColor: { rgb: "EEF1F4" } },
            border,
          });
        } else if (row.type === "grandtotal") {
          styleRow(excelRow, {
            font: { ...baseFont, bold: true, color: { rgb: "28313F" } },
            fill: { patternType: "solid", fgColor: { rgb: "D7DCE3" } },
            border,
          });
        } else if (row.type === "specification") {
          styleRow(excelRow, {
            font: { ...baseFont, italic: true, color: { rgb: "5B4B8A" } },
            fill: { patternType: "solid", fgColor: { rgb: "F1EEF9" } },
            border,
          });
        }
      });

      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    });

    // Resolve Grand Total(s) once every sheet's total cell address is known: sum
    // the per-sheet totals across sheets, or this sheet's items if there are none.
    grandTotalTargets.forEach(({ ws, excelRow, itemRefs, value }) => {
      const addr = XLSX.utils.encode_cell({ r: excelRow - 1, c: 5 });
      const existingStyle = (ws[addr] as Record<string, unknown> | undefined)?.s;
      const formula = sheetTotalRefs.length > 0 ? `SUM(${sheetTotalRefs.join(",")})` : itemRefs.length > 0 ? `SUM(${itemRefs.join(",")})` : null;
      ws[addr] = (formula ? { t: "n", f: formula, v: value } : { t: "n", v: value }) as XLSXNS.CellObject;
      if (existingStyle) (ws[addr] as Record<string, unknown>).s = existingStyle;
    });

    const safeName = `${activeBoqName || "BOQ"}-export.xlsx`.replace(/[<>:"/\\|?*]+/g, "-");
    const wbArray = XLSX.write(wb, { bookType: "xlsx", type: "array", compression: true });
    const blob = new Blob([wbArray], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = safeName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setShowExportModal(false);
  };

  const openExportModal = () => {
    if (!boqSheets.length) return;
    setSelectedExportSheetIds(new Set(boqSheets.map((s) => s.id)));
    setShowExportModal(true);
  };

  const toggleExportSheet = (sheetId: string) => {
    setSelectedExportSheetIds((prev) => {
      const next = new Set(prev);
      if (next.has(sheetId)) next.delete(sheetId);
      else next.add(sheetId);
      return next;
    });
  };

  // When a BOQ is created via the store, switch to edit mode
  useEffect(() => {
    if (activeBOQId && mode === "list") {
      setMode("edit");
    }
  }, [activeBOQId]);

  const handleOpen = (id: string) => {
    openBOQ(id);
    setMode("view");
  };

  const handleBack = () => {
    setMode("list");
  };

  const handleEdit = () => {
    setMode("edit");
  };

  const handleSave = () => {
    saveBOQ();
    setMode("view");
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const rawSheets = await parseExcelToRawSheets(file);
      if (rawSheets.length === 0) {
        alert("The selected file has no importable data.");
        return;
      }
      setPendingRawSheets(rawSheets);
      setPendingMappings(rawSheets.map((sheet) => createDefaultColumnMapping(sheet)));
      setPreviewSheetIndex(0);
      setShowImportPreview(true);
    } catch (err) {
      console.error("Failed to parse Excel:", err);
      alert("Failed to parse the Excel file. Please ensure it has BOQ-like columns.");
    }

    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleMappingChange = (sheetIdx: number, colIdx: number, target: BOQMappedColumnKey) => {
    setPendingMappings((prev) =>
      prev.map((sheetMapping, idx) => {
        if (idx !== sheetIdx) return sheetMapping;
        const next = sheetMapping.map((m) => ({ ...m }));
        const current = next[colIdx];
        if (!current) return sheetMapping;

        if (target !== "ignore") {
          const existingIdx = next.findIndex((m, i) => i !== colIdx && m.target === target);
          if (existingIdx >= 0) {
            // Swap mappings instead of creating duplicates.
            next[existingIdx].target = current.target;
          }
        }
        current.target = target;
        return next;
      })
    );
  };

  const handleReorderColumns = (sheetIdx: number, fromColIdx: number, toColIdx: number) => {
    setPendingMappings((prev) =>
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

  const closeImportPreview = () => {
    setShowImportPreview(false);
    setPendingRawSheets([]);
    setPendingMappings([]);
    setPreviewSheetIndex(0);
  };

  const confirmImportPreview = () => {
    const mappedSheets = pendingRawSheets
      .map((rawSheet, i) => {
        const mapping = pendingMappings[i] || [];
        const rows = mapRawSheetToBOQRows(rawSheet, mapping);
        return { name: rawSheet.name, rows };
      })
      .filter((s) => s.rows.length > 0);

    if (mappedSheets.length === 0) {
      alert("No rows available to import after mapping.");
      return;
    }

    const { setBoqSheets } = useAppStore.getState();
    setBoqSheets(
      mappedSheets.map((s, i) => ({
        id: uuid(),
        project_id: "",
        name: s.name,
        sort_order: i,
        rows: recalcRows(s.rows),
      }))
    );
    closeImportPreview();
  };

  const addRowBottom = () => {
    const current = boqSheets[activeSheetIndex]?.rows || [];
    updateSheetRows(activeSheetIndex, [...current, emptyRow()]);
  };

  const startRename = (idx: number) => {
    if (mode !== "edit") return;
    setRenamingIdx(idx);
    setRenameValue(boqSheets[idx].name);
  };

  const finishRename = () => {
    if (renamingIdx !== null && renameValue.trim()) {
      renameSheet(renamingIdx, renameValue.trim());
    }
    setRenamingIdx(null);
  };

  const handleSheetContextMenu = (event: React.MouseEvent, index: number) => {
    if (isViewMode) return;
    event.preventDefault();
    setActiveSheetIndex(index);
    setRenamingIdx(null);
    setSheetCtxMenu({ x: event.clientX, y: event.clientY, index });
  };

  const activeSheetContext = sheetCtxMenu ? boqSheets[sheetCtxMenu.index] : null;
  const sheetContextItems: ContextMenuItem[] = sheetCtxMenu
    ? [
        {
          label: "Rename sheet",
          icon: <Pencil size={14} />,
          action: () => startRename(sheetCtxMenu.index),
        },
        {
          label: "Duplicate sheet",
          icon: <Copy size={14} />,
          action: () => duplicateSheet(sheetCtxMenu.index),
        },
        { divider: true } as ContextMenuItem,
        {
          label: "Move left",
          icon: <ArrowLeft size={14} />,
          action: () => moveSheet(sheetCtxMenu.index, sheetCtxMenu.index - 1),
          disabled: sheetCtxMenu.index <= 0,
        },
        {
          label: "Move right",
          icon: <ArrowRight size={14} />,
          action: () => moveSheet(sheetCtxMenu.index, sheetCtxMenu.index + 1),
          disabled: sheetCtxMenu.index >= boqSheets.length - 1,
        },
        { divider: true } as ContextMenuItem,
        {
          label: "Delete sheet",
          icon: <Trash2 size={14} />,
          danger: true,
          action: () => {
            const sheet = boqSheets[sheetCtxMenu.index];
            if (sheet) setDeleteSheetTarget({ index: sheetCtxMenu.index, name: sheet.name });
          },
          disabled: boqSheets.length <= 1,
        },
      ]
    : [];

  // ─── LIST VIEW ──────────────────────────────────────────────────
  if (mode === "list") {
    return (
      <div className="animate-fade-in">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Bill of Quantities</h2>
          <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
            <Plus size={14} /> Create BOQ
          </Button>
        </div>

        <BOQListView onOpen={handleOpen} onCreateClick={() => setShowCreate(true)} />
        <CreateBOQModal open={showCreate} onClose={() => setShowCreate(false)} />
      </div>
    );
  }

  // ─── VIEW / EDIT MODE ───────────────────────────────────────────
  const isViewMode = mode === "view";

  return (
    <div className="boq-reference-page animate-fade-in">
      {/* Header */}
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" variant="ghost" onClick={handleBack}>
            <ArrowLeft size={14} /> Back
          </Button>
          <div className="h-5 w-px bg-border" />
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">
              Bill of Quantities
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">{activeBoqName}</h2>
            {!isViewMode && (
              <p className="text-sm text-txt-muted mt-1">
                Right-click for options • Double-click to edit • Ctrl+V to paste from Excel
              </p>
            )}
          </div>
        </div>
        <div className="flex w-full flex-wrap gap-2 lg:w-auto lg:justify-end">
          {isViewMode ? (
            <>
              <Button size="sm" onClick={openExportModal}>
                <FileSpreadsheet size={14} /> Export Excel
              </Button>
              <Button size="sm" variant="primary" onClick={handleEdit}>
                <Pencil size={14} /> Edit
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" onClick={() => setShowAiDraft(true)}>
                <Sparkles size={14} /> Draft with AI
              </Button>
              <Button size="sm" onClick={() => setShowLibrary(true)}>
                <Library size={14} /> Library
              </Button>
              <Button size="sm" onClick={() => setShowSaveLib(true)}>
                <Copy size={14} /> Save to Library
              </Button>
              <Button size="sm" onClick={() => fileInputRef.current?.click()}>
                <Upload size={14} /> Import Excel
              </Button>
              <Button size="sm" onClick={generateSummarySheet}>
                <ListPlus size={14} /> Generate Summary
              </Button>
              <Button size="sm" onClick={openExportModal}>
                <FileSpreadsheet size={14} /> Export Excel
              </Button>
              <Button size="sm" onClick={addRowBottom}>
                <Plus size={14} /> Add Row
              </Button>
              <Button size="sm" variant="primary" onClick={handleSave}>
                <Save size={14} /> Save
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={handleImportExcel}
              />
            </>
          )}
        </div>
      </div>

      {/* Sheet table */}
      <BOQSheetTable readOnly={isViewMode} />

      {/* Sheet tabs */}
      <div className="flex items-center gap-1 mt-2 pt-2 border-t border-border overflow-x-auto">
        {boqSheets.map((sheet, i) => (
          <div
            key={sheet.id}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-md cursor-pointer text-xs whitespace-nowrap transition-all border ${
              i === activeSheetIndex
                ? "border-accent bg-accent/10 text-accent font-semibold"
                : "border-border text-txt-muted hover:bg-bg-hover"
            }`}
            onClick={() => setActiveSheetIndex(i)}
            onDoubleClick={() => startRename(i)}
            onContextMenu={(e) => handleSheetContextMenu(e, i)}
            title={isViewMode ? sheet.name : "Right-click for sheet actions"}
          >
            {renamingIdx === i ? (
              <input
                autoFocus
                className="bg-transparent border-none outline-none text-xs w-20 text-txt"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={finishRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") finishRename();
                  if (e.key === "Escape") setRenamingIdx(null);
                }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              sheet.name
            )}
          </div>
        ))}
        {!isViewMode && (
          <Button size="sm" variant="ghost" onClick={addSheet}>
            <Plus size={14} /> New Sheet
          </Button>
        )}
      </div>

      <LibraryBrowser open={showLibrary} onClose={() => setShowLibrary(false)} />
      <AiDraftModal open={showAiDraft} onClose={() => setShowAiDraft(false)} />
      {sheetCtxMenu && activeSheetContext && (
        <ContextMenu
          x={sheetCtxMenu.x}
          y={sheetCtxMenu.y}
          items={sheetContextItems}
          onClose={() => setSheetCtxMenu(null)}
        />
      )}
      {deleteSheetTarget && (
        <DeleteConfirmModal
          open={true}
          title="Delete Sheet"
          onClose={() => setDeleteSheetTarget(null)}
          itemName={deleteSheetTarget.name}
          onConfirm={() => {
            deleteSheet(deleteSheetTarget.index);
            setDeleteSheetTarget(null);
          }}
        />
      )}
      <SaveToLibraryModal open={showSaveLib} onClose={() => setShowSaveLib(false)} />
      <Modal open={showExportModal} onClose={() => setShowExportModal(false)} title="Export BOQ to Excel" width={520}>
        <div className="space-y-2 max-h-[280px] overflow-auto border border-border rounded-lg p-3 bg-bg-raised/30">
          {boqSheets.map((sheet) => (
            <label key={sheet.id} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={selectedExportSheetIds.has(sheet.id)}
                onChange={() => toggleExportSheet(sheet.id)}
              />
              {sheet.name}
            </label>
          ))}
        </div>
        <div className="flex justify-end gap-3 mt-4">
          <Button variant="ghost" onClick={() => setShowExportModal(false)}>Cancel</Button>
          <Button variant="primary" disabled={selectedExportSheetIds.size === 0} onClick={exportBOQToExcel}>
            Export Selected Sheets
          </Button>
        </div>
      </Modal>
      <ExcelImportPreviewModal
        open={showImportPreview}
        rawSheets={pendingRawSheets}
        mappings={pendingMappings}
        activeSheetIdx={previewSheetIndex}
        onSheetChange={setPreviewSheetIndex}
        onMappingChange={handleMappingChange}
        onReorderColumns={handleReorderColumns}
        onConfirm={confirmImportPreview}
        onClose={closeImportPreview}
      />
    </div>
  );
}
