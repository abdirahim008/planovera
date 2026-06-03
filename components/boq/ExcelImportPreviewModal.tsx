"use client";

import { useMemo, useState } from "react";

import {
  mapRawSheetToBOQRows,
  type RawExcelSheet,
  type BOQColumnMapping,
  type BOQMappedColumnKey,
} from "@/lib/excel-utils";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";

export const BOQ_IMPORT_TARGET_OPTIONS: Array<{ value: BOQMappedColumnKey; label: string }> = [
  { value: "itemNo", label: "Item No." },
  { value: "description", label: "Description" },
  { value: "unit", label: "Unit" },
  { value: "qty", label: "Quantity" },
  { value: "rate", label: "Rate" },
  { value: "amount", label: "Amount" },
  { value: "ignore", label: "Ignore Column" },
];

export default function ExcelImportPreviewModal({
  open,
  rawSheets,
  mappings,
  activeSheetIdx,
  onSheetChange,
  onMappingChange,
  onReorderColumns,
  onConfirm,
  onClose,
  title = "Import Excel Preview",
  confirmLabel = "Import Confirmed Mapping",
}: {
  open: boolean;
  rawSheets: RawExcelSheet[];
  mappings: BOQColumnMapping[][];
  activeSheetIdx: number;
  onSheetChange: (idx: number) => void;
  onMappingChange: (sheetIdx: number, colIdx: number, target: BOQMappedColumnKey) => void;
  onReorderColumns: (sheetIdx: number, fromColIdx: number, toColIdx: number) => void;
  onConfirm: () => void;
  onClose: () => void;
  title?: string;
  confirmLabel?: string;
}) {
  const activeSheet = rawSheets[activeSheetIdx];
  const activeMapping = mappings[activeSheetIdx] || [];

  const mappedPreviewRows = useMemo(() => {
    if (!activeSheet) return [];
    return mapRawSheetToBOQRows(activeSheet, activeMapping).slice(0, 30);
  }, [activeSheet, activeMapping]);

  const mappingErrors = useMemo(() => {
    const errors: string[] = [];
    mappings.forEach((sheetMapping, idx) => {
      const mappedTargets = sheetMapping
        .map((m) => m.target)
        .filter((target) => target !== "ignore");
      const hasDescription = mappedTargets.includes("description");
      if (!hasDescription) {
        errors.push(`Sheet "${rawSheets[idx]?.name || idx + 1}" needs a Description column mapping.`);
      }
      const uniqueTargets = new Set(mappedTargets);
      if (uniqueTargets.size !== mappedTargets.length) {
        errors.push(`Sheet "${rawSheets[idx]?.name || idx + 1}" has duplicate target mappings.`);
      }
    });
    return errors;
  }, [mappings, rawSheets]);

  const canConfirm = rawSheets.length > 0 && mappingErrors.length === 0;
  const previewColumnCount = activeSheet?.rows.reduce((max, r) => Math.max(max, r.length), 0) || 0;
  const totalSheets = rawSheets.length;
  const sheetRowCount = activeSheet?.rows.length || 0;
  const sheetColCount = activeSheet?.rows.reduce((max, r) => Math.max(max, r.length), 0) || 0;
  const [draggingColIdx, setDraggingColIdx] = useState<number | null>(null);
  const [dragOverColIdx, setDragOverColIdx] = useState<number | null>(null);

  return (
    <Modal open={open} onClose={onClose} title={title} width={1100}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {rawSheets.map((sheet, idx) => {
            const colCount = sheet.rows.reduce((max, r) => Math.max(max, r.length), 0);
            return (
              <button
                key={sheet.name + idx}
                type="button"
                className={`flex items-center gap-2 px-3 py-1.5 text-xs rounded-md border cursor-pointer ${
                  idx === activeSheetIdx
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border text-txt-muted bg-transparent hover:bg-bg-hover"
                }`}
                onClick={() => onSheetChange(idx)}
              >
                <span className="font-medium truncate max-w-[140px]">{sheet.name}</span>
                <span className="rounded-full bg-bg-input px-2 py-0.5 text-[10px] text-txt-dim">
                  {sheet.rows.length}r × {colCount}c
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-border bg-bg-surface/70 px-3 py-2 text-[11px] text-txt-dim">
          <div>
            Showing sheet <strong>{activeSheetIdx + 1}</strong> of <strong>{totalSheets}</strong> — <strong>{activeSheet?.name || `Sheet ${activeSheetIdx + 1}`}</strong>
          </div>
          <div>
            {sheetRowCount} rows, {sheetColCount} columns
          </div>
        </div>

        <div className="overflow-auto border border-border rounded-lg max-h-[58vh]">
          <table className="w-full border-collapse text-xs" style={{ minWidth: 920 }}>
            <thead>
              <tr className="bg-bg-raised/50">
                <th className="sticky top-0 z-20 w-12 p-2 border border-border text-center bg-bg-raised/50">#</th>
                {Array.from({ length: previewColumnCount }, (_, colIdx) => (
                  <th
                    key={colIdx}
                    className={`sticky top-0 z-20 min-w-[140px] p-2 border border-border align-top bg-bg-raised/50 ${dragOverColIdx === colIdx ? "bg-accent/10" : ""}`}
                    draggable
                    onDragStart={(e) => {
                      setDraggingColIdx(colIdx);
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", String(colIdx));
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (dragOverColIdx !== colIdx) setDragOverColIdx(colIdx);
                      e.dataTransfer.dropEffect = "move";
                    }}
                    onDragLeave={() => {
                      if (dragOverColIdx === colIdx) setDragOverColIdx(null);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const fromRaw = e.dataTransfer.getData("text/plain");
                      const fromColIdx = Number(fromRaw);
                      if (!Number.isNaN(fromColIdx) && fromColIdx !== colIdx) {
                        onReorderColumns(activeSheetIdx, fromColIdx, colIdx);
                      }
                      setDraggingColIdx(null);
                      setDragOverColIdx(null);
                    }}
                    onDragEnd={() => {
                      setDraggingColIdx(null);
                      setDragOverColIdx(null);
                    }}
                  >
                    <div className="flex flex-col gap-1.5">
                      <div className="text-[10px] text-txt-dim">
                        Excel Col {colIdx + 1}
                        {draggingColIdx === colIdx ? " (moving)" : ""}
                      </div>
                      <select
                        className="w-full bg-bg-input border border-border rounded px-1.5 py-1 text-xs text-txt outline-none"
                        value={activeMapping[colIdx]?.target || "ignore"}
                        onChange={(e) =>
                          onMappingChange(activeSheetIdx, colIdx, e.target.value as BOQMappedColumnKey)
                        }
                      >
                        {BOQ_IMPORT_TARGET_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="text-[10px] px-1.5 py-1 rounded border border-border bg-transparent text-txt-dim hover:text-txt hover:bg-bg-hover cursor-pointer"
                        onClick={() => onMappingChange(activeSheetIdx, colIdx, "ignore")}
                      >
                        Delete/Ignore
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(activeSheet?.rows || []).slice(0, 25).map((row, rowIdx) => (
                <tr key={rowIdx}>
                  <td className="p-2 border border-border text-center text-txt-dim">{rowIdx + 1}</td>
                  {Array.from({ length: previewColumnCount }, (_, colIdx) => (
                    <td key={colIdx} className="p-2 border border-border text-txt-muted">
                      {row[colIdx] || ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="border border-border rounded-lg p-3 bg-bg-raised/30">
          <div className="text-xs font-semibold mb-2">Mapped BOQ Preview (first 30 rows)</div>
          <div className="overflow-auto max-h-[220px]">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-bg-raised/60">
                  <th className="sticky top-0 z-20 border border-border px-2 py-1 text-left bg-bg-raised/60">Item No.</th>
                  <th className="sticky top-0 z-20 border border-border px-2 py-1 text-left bg-bg-raised/60">Description</th>
                  <th className="sticky top-0 z-20 border border-border px-2 py-1 text-left bg-bg-raised/60">Unit</th>
                  <th className="sticky top-0 z-20 border border-border px-2 py-1 text-right bg-bg-raised/60">Qty</th>
                  <th className="sticky top-0 z-20 border border-border px-2 py-1 text-right bg-bg-raised/60">Rate</th>
                  <th className="sticky top-0 z-20 border border-border px-2 py-1 text-right bg-bg-raised/60">Amount</th>
                </tr>
              </thead>
              <tbody>
                {mappedPreviewRows.map((r) => (
                  <tr key={r.id}>
                    <td className="border border-border px-2 py-1">{r.itemNo}</td>
                    <td className="border border-border px-2 py-1">{r.description}</td>
                    <td className="border border-border px-2 py-1">{r.unit}</td>
                    <td className="border border-border px-2 py-1 text-right">{r.qty}</td>
                    <td className="border border-border px-2 py-1 text-right">{r.rate}</td>
                    <td className="border border-border px-2 py-1 text-right">{r.amount}</td>
                  </tr>
                ))}
                {mappedPreviewRows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="border border-border px-2 py-3 text-center text-txt-dim">
                      No preview rows after mapping.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {mappingErrors.length > 0 && (
          <div className="rounded-md border border-err/40 bg-err/10 px-3 py-2 text-xs text-err">
            {mappingErrors.map((err) => (
              <div key={err}>{err}</div>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-1">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onConfirm} disabled={!canConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
