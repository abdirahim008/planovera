"use client";

import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx-js-style";
import type { PaymentCertificate } from "@/lib/supabase";
import { currency } from "@/lib/store";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";

interface CertificatePrintProps {
  cert: PaymentCertificate;
  projectName: string;
}

export default function CertificatePrint({ cert, projectName }: CertificatePrintProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const [showSelector, setShowSelector] = useState(false);
  const [action, setAction] = useState<"print" | "excel">("print");
  const [includeSummary, setIncludeSummary] = useState(true);
  const [selectedSheetIds, setSelectedSheetIds] = useState<Set<string>>(new Set(cert.sheets.map((s) => s.id)));

  const allItems = cert.sheets.flatMap((sh) => sh.items);
  const subTotal = allItems.reduce((s, i) => s + (parseFloat(i.currentAmount) || 0), 0);
  const prevSubTotal = allItems.reduce((s, i) => s + (parseFloat(i.previousAmount) || 0), 0);
  const totalSubTotal = allItems.reduce((s, i) => s + (parseFloat(i.totalAmount) || 0), 0);
  const boqSubTotal = allItems.reduce((s, i) => s + (parseFloat(i.boqAmount) || 0), 0);

  const contingencies = (boqSubTotal * cert.contingenciesPercent) / 100;
  const afterContingencies = boqSubTotal + contingencies;
  const govTax = (afterContingencies * cert.governmentTaxPercent) / 100;
  const grandTotalBoq = afterContingencies + govTax;

  const prevContingencies = (prevSubTotal * cert.contingenciesPercent) / 100;
  const prevAfterCont = prevSubTotal + prevContingencies;
  const prevGovTax = (prevAfterCont * cert.governmentTaxPercent) / 100;
  const prevGrandTotal = prevAfterCont + prevGovTax;

  const currContingencies = (subTotal * cert.contingenciesPercent) / 100;
  const currAfterCont = subTotal + currContingencies;
  const currGovTax = (currAfterCont * cert.governmentTaxPercent) / 100;
  const currGrandTotal = currAfterCont + currGovTax;

  const totalContingencies = (totalSubTotal * cert.contingenciesPercent) / 100;
  const totalAfterCont = totalSubTotal + totalContingencies;
  const totalGovTax = (totalAfterCont * cert.governmentTaxPercent) / 100;
  const totalGrandTotal = totalAfterCont + totalGovTax;

  const prevRetention = (prevGrandTotal * cert.retentionPercent) / 100;
  const prevAdvance = (prevGrandTotal * cert.advancePaymentPercent) / 100;
  const prevWithholding = (prevGrandTotal * cert.withholdingTaxPercent) / 100;
  const prevNet = prevGrandTotal - prevRetention - prevAdvance - prevWithholding;

  const currRetention = (currGrandTotal * cert.retentionPercent) / 100;
  const currAdvance = (currGrandTotal * cert.advancePaymentPercent) / 100;
  const currWithholding = (currGrandTotal * cert.withholdingTaxPercent) / 100;
  const currNet = currGrandTotal - currRetention - currAdvance - currWithholding;

  const totalRetention = (totalGrandTotal * cert.retentionPercent) / 100;
  const totalAdvance = (totalGrandTotal * cert.advancePaymentPercent) / 100;
  const totalWithholding = (totalGrandTotal * cert.withholdingTaxPercent) / 100;
  const totalNet = totalGrandTotal - totalRetention - totalAdvance - totalWithholding;

  const fmt = (v: number) => currency(v);
  const sheetSummaries = cert.sheets.map((sh, i) => {
    const boq = sh.items.reduce((s, item) => s + (parseFloat(item.boqAmount) || 0), 0);
    const prev = sh.items.reduce((s, item) => s + (parseFloat(item.previousAmount) || 0), 0);
    const curr = sh.items.reduce((s, item) => s + (parseFloat(item.currentAmount) || 0), 0);
    const total = sh.items.reduce((s, item) => s + (parseFloat(item.totalAmount) || 0), 0);
    return { billNo: i + 1, name: sh.name, boq, prev, curr, total };
  });

  const selectedSheets = useMemo(
    () => cert.sheets.filter((s) => selectedSheetIds.has(s.id)),
    [cert.sheets, selectedSheetIds]
  );

  const toggleSheet = (sheetId: string) => {
    setSelectedSheetIds((prev) => {
      const next = new Set(prev);
      if (next.has(sheetId)) next.delete(sheetId);
      else next.add(sheetId);
      return next;
    });
  };

  const excelBorder = {
    top: { style: "thin", color: { rgb: "2A2A2A" } },
    bottom: { style: "thin", color: { rgb: "2A2A2A" } },
    left: { style: "thin", color: { rgb: "2A2A2A" } },
    right: { style: "thin", color: { rgb: "2A2A2A" } },
  };
  const baseFont = { name: "Times New Roman", sz: 11, color: { rgb: "111827" } };
  const greenFill = { patternType: "solid", fgColor: { rgb: "0D7C66" } };
  const softGreenFill = { patternType: "solid", fgColor: { rgb: "D1FAE5" } };

  const styleRow = (
    ws: XLSX.WorkSheet,
    rowNumber: number,
    colCount: number,
    style: Record<string, any>,
    startCol = 0
  ) => {
    for (let c = startCol; c < colCount; c++) {
      const addr = XLSX.utils.encode_cell({ r: rowNumber - 1, c });
      const cell = ws[addr];
      if (!cell) continue;
      (cell as any).s = {
        font: baseFont,
        ...((cell as any).s || {}),
        ...style,
      };
    }
  };

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <!DOCTYPE html><html><head><title>Payment Certificate #${cert.number}</title>
      <style>
      * { margin: 0; padding: 0; box-sizing: border-box; } body { font-family: Arial, sans-serif; font-size: 11px; color: #1a1a1a; background: #fff; padding: 20px; }
      .cert-title { text-align: center; font-size: 14px; font-weight: 700; margin-bottom: 4px; text-transform: uppercase; }
      .cert-subtitle { text-align: center; font-size: 12px; margin-bottom: 16px; color: #444; } .cert-info { display: flex; justify-content: space-between; margin-bottom: 12px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 20px; } th, td { border: 1px solid #333; padding: 5px 8px; text-align: right; font-size: 10.5px; } th { background: #f0f0f0; text-align: center; }
      .row-subtotal td { font-weight: 600; background: #f8f8f8; } .row-addition td { background: #fafafa; } .row-grandtotal td { font-weight: 700; background: #eef; } .row-deduction td { color: #c00; } .row-net td { font-weight: 700; background: #e8f5e9; }
      @media print { @page { margin: 15mm; size: landscape; } }
      </style></head><body>${content.innerHTML}</body></html>
    `);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 400);
  };

  const exportToExcel = () => {
    const wb = XLSX.utils.book_new();
    if (includeSummary) {
      const rows: Array<(string | number)>[] = [
        [`${cert.type === "final" ? "FINAL" : "INTERIM"} PAYMENT CERTIFICATE No. ${cert.number}`],
        [`PROJECT: ${projectName.toUpperCase()}`],
        [`DATE: ${cert.date}`],
        [],
        ["BILL NO.", "DESCRIPTION", "BOQ AMOUNT (USD)", "PREVIOUS AMOUNT (USD)", "CURRENT AMOUNT (USD)", "TOTAL AMOUNT (USD)"],
      ];
      sheetSummaries.filter((row) => selectedSheets.some((s) => s.name === row.name)).forEach((row) => {
        rows.push([row.billNo, row.name, row.boq, row.prev, row.curr, row.total]);
      });
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws["!cols"] = [{ wch: 10 }, { wch: 36 }, { wch: 18 }, { wch: 22 }, { wch: 22 }, { wch: 20 }];
      const subtotalRow = rows.length + 1;
      XLSX.utils.sheet_add_aoa(ws, [
        ["", "Sub - Total", boqSubTotal, prevSubTotal, subTotal, totalSubTotal],
        ["", `Add ${cert.contingenciesPercent}% Contingencies`, contingencies, "", "", ""],
        ["", `Add ${cert.governmentTaxPercent}% Government Tax`, govTax, prevGovTax, currGovTax, totalGovTax],
        ["", "Grand Total", grandTotalBoq, prevGrandTotal, currGrandTotal, totalGrandTotal],
        ["", `Less Retention = ${cert.retentionPercent}%`, "", prevRetention, currRetention, totalRetention],
        ["", `Less Advance Payment = ${cert.advancePaymentPercent}%`, "", prevAdvance, currAdvance, totalAdvance],
        ["", `Less Withholding Tax = ${cert.withholdingTaxPercent}%`, "", prevWithholding, currWithholding, totalWithholding],
        ["", "Final Net Amount", "", prevNet, currNet, totalNet],
      ], { origin: -1 });
      ws[`C${subtotalRow}`] = { t: "n", f: `SUM(C6:C${subtotalRow - 1})` };
      ws[`D${subtotalRow}`] = { t: "n", f: `SUM(D6:D${subtotalRow - 1})` };
      ws[`E${subtotalRow}`] = { t: "n", f: `SUM(E6:E${subtotalRow - 1})` };
      ws[`F${subtotalRow}`] = { t: "n", f: `SUM(F6:F${subtotalRow - 1})` };

      // Merge top title rows to match print layout
      (ws as any)["!merges"] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: 5 } },
        { s: { r: 2, c: 0 }, e: { r: 2, c: 5 } },
      ];

      // Header + table formatting
      styleRow(ws, 1, 6, {
        font: { ...baseFont, bold: true, sz: 14, color: { rgb: "FFFFFF" } },
        fill: greenFill,
        border: excelBorder,
        alignment: { horizontal: "center", vertical: "center" },
      });
      styleRow(ws, 2, 6, {
        font: { ...baseFont, bold: true, sz: 12, color: { rgb: "FFFFFF" } },
        fill: greenFill,
        border: excelBorder,
        alignment: { horizontal: "center", vertical: "center" },
      });
      styleRow(ws, 3, 6, {
        font: { ...baseFont, bold: true, sz: 11, color: { rgb: "FFFFFF" } },
        fill: greenFill,
        border: excelBorder,
        alignment: { horizontal: "center", vertical: "center" },
      });

      styleRow(ws, 5, 6, {
        font: { ...baseFont, bold: true, color: { rgb: "FFFFFF" } },
        fill: greenFill,
        border: excelBorder,
        alignment: { horizontal: "center", vertical: "center", wrapText: true },
      });

      for (let r = 6; r < subtotalRow; r++) {
        styleRow(ws, r, 6, {
          border: excelBorder,
          font: baseFont,
          alignment: { vertical: "center" },
        });
        // text alignment for first two cols, numbers right-aligned
        styleRow(ws, r, 2, { alignment: { horizontal: "left", vertical: "center" } }, 1);
        styleRow(ws, r, 6, { alignment: { horizontal: "right", vertical: "center" }, numFmt: "#,##0.00" }, 2);
      }

      const summaryStyles: Array<{ row: number; fill: any; bold?: boolean; textColor?: string }> = [
        { row: subtotalRow, fill: softGreenFill, bold: true, textColor: "065F46" },
        { row: subtotalRow + 1, fill: softGreenFill },
        { row: subtotalRow + 2, fill: softGreenFill },
        { row: subtotalRow + 3, fill: greenFill, bold: true, textColor: "FFFFFF" },
        { row: subtotalRow + 4, fill: softGreenFill, textColor: "065F46" },
        { row: subtotalRow + 5, fill: softGreenFill, textColor: "065F46" },
        { row: subtotalRow + 6, fill: softGreenFill, textColor: "065F46" },
        { row: subtotalRow + 7, fill: greenFill, bold: true, textColor: "FFFFFF" },
      ];
      summaryStyles.forEach(({ row, fill, bold, textColor }) => {
        styleRow(ws, row, 6, {
          font: { ...baseFont, bold: !!bold, color: textColor ? { rgb: textColor } : baseFont.color },
          fill,
          border: excelBorder,
          alignment: { vertical: "center" },
        });
        styleRow(ws, row, 2, { alignment: { horizontal: "left", vertical: "center" } }, 1);
        styleRow(ws, row, 6, { alignment: { horizontal: "right", vertical: "center" }, numFmt: "#,##0.00" }, 2);
      });

      XLSX.utils.book_append_sheet(wb, ws, "Summary");
    }
    selectedSheets.forEach((sheet) => {
      const rows: Array<(string | number)>[] = [["#", "Item No.", "Description", "Unit", "BOQ Qty", "Rate", "BOQ Amount", "Previous Amount", "Current Amount", "Total Qty", "Total Amount"]];
      sheet.items.forEach((item, idx) => rows.push([
        idx + 1, item.billNo, item.description, item.unit,
        parseFloat(item.boqQty) || 0, parseFloat(item.boqRate) || 0, parseFloat(item.boqAmount) || 0,
        parseFloat(item.previousAmount) || 0, parseFloat(item.currentAmount) || 0, parseFloat(item.totalQty) || 0, parseFloat(item.totalAmount) || 0,
      ]));
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws["!cols"] = [{ wch: 6 }, { wch: 12 }, { wch: 42 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 14 }];
      styleRow(ws, 1, 11, {
        font: { ...baseFont, bold: true, color: { rgb: "FFFFFF" } },
        fill: greenFill,
        border: excelBorder,
        alignment: { horizontal: "center", vertical: "center", wrapText: true },
      });
      for (let r = 2; r <= rows.length; r++) {
        styleRow(ws, r, 11, { border: excelBorder, alignment: { vertical: "center" }, font: baseFont });
        styleRow(ws, r, 4, { alignment: { horizontal: "left", vertical: "center" } }, 1);
        styleRow(ws, r, 11, { alignment: { horizontal: "right", vertical: "center" }, numFmt: "#,##0.00" }, 4);
      }
      XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31) || "Sheet");
    });
    const safeDate = String(cert.date || "").replace(/[^\d-]/g, "") || "date";
    const safeName = `certificate-${cert.number}-${safeDate}.xlsx`.replace(/[<>:"/\\|?*]+/g, "-");
    const wbArray = XLSX.write(wb, { bookType: "xlsx", type: "array", compression: true });
    const blob = new Blob([wbArray], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = safeName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const runAction = () => {
    if (!includeSummary && selectedSheets.length === 0) return;
    setShowSelector(false);
    if (action === "excel") exportToExcel();
    else handlePrint();
  };

  return (
    <>
      <button
        onClick={() => { setAction("print"); setShowSelector(true); }}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-accent text-white rounded-md text-xs font-medium hover:bg-accent-hover transition-colors cursor-pointer"
      >
        Print Certificate
      </button>
      <button
        onClick={() => { setAction("excel"); setShowSelector(true); }}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-bg-raised text-txt rounded-md text-xs font-medium hover:bg-bg-hover transition-colors cursor-pointer border border-border ml-2"
      >
        Export Excel
      </button>

      <div ref={printRef} style={{ position: "absolute", left: "-9999px", top: 0 }}>
        {includeSummary && (
          <>
            <div className="cert-title">{cert.type === "final" ? "FINAL" : "INTERIM"} PAYMENT CERTIFICATE No. {cert.number}</div>
            <div className="cert-subtitle">SUMMARY BILLS OF QUANTITIES: {projectName.toUpperCase()}</div>
            <div className="cert-info"><span>Certificate Date: {cert.date}</span><span>Status: {cert.status.toUpperCase()}</span></div>
            <table>
              <thead>
                <tr><th rowSpan={2}>BILL NO.</th><th rowSpan={2}>DESCRIPTION</th><th>1</th><th>2</th><th>3</th><th>4</th></tr>
                <tr><th>BoQ AMOUNT (USD)</th><th>PREVIOUS AMOUNT (USD)</th><th>CURRENT AMOUNT (USD)</th><th>TOTAL AMOUNT (USD)</th></tr>
              </thead>
              <tbody>
                {sheetSummaries.filter((row) => selectedSheets.some((s) => s.name === row.name)).map((row) => (
                  <tr key={row.billNo}><td>{row.billNo}</td><td>{row.name}</td><td>{fmt(row.boq)}</td><td>{fmt(row.prev)}</td><td>{fmt(row.curr)}</td><td>{fmt(row.total)}</td></tr>
                ))}
                <tr className="row-subtotal"><td></td><td>Sub - Total</td><td>{fmt(boqSubTotal)}</td><td>{fmt(prevSubTotal)}</td><td>{fmt(subTotal)}</td><td>{fmt(totalSubTotal)}</td></tr>
                <tr className="row-addition"><td></td><td>Add {cert.contingenciesPercent}% Contingencies</td><td>{fmt(contingencies)}</td><td></td><td></td><td></td></tr>
                <tr className="row-addition"><td></td><td>Add {cert.governmentTaxPercent}% Government Tax</td><td>{fmt(govTax)}</td><td>{fmt(prevGovTax)}</td><td>{fmt(currGovTax)}</td><td>{fmt(totalGovTax)}</td></tr>
                <tr className="row-grandtotal"><td></td><td>Grand Total</td><td>{fmt(grandTotalBoq)}</td><td>{fmt(prevGrandTotal)}</td><td>{fmt(currGrandTotal)}</td><td>{fmt(totalGrandTotal)}</td></tr>
                <tr className="row-deduction"><td></td><td>Less Retention = {cert.retentionPercent}%</td><td></td><td>{fmt(prevRetention)}</td><td>{fmt(currRetention)}</td><td>{fmt(totalRetention)}</td></tr>
                <tr className="row-deduction"><td></td><td>Less Advance Payment = {cert.advancePaymentPercent}%</td><td></td><td>{fmt(prevAdvance)}</td><td>{fmt(currAdvance)}</td><td>{fmt(totalAdvance)}</td></tr>
                <tr className="row-deduction"><td></td><td>Less Withholding Tax = {cert.withholdingTaxPercent}%</td><td></td><td>{fmt(prevWithholding)}</td><td>{fmt(currWithholding)}</td><td>{fmt(totalWithholding)}</td></tr>
                <tr className="row-net"><td></td><td>Final Net Amount</td><td></td><td>{fmt(prevNet)}</td><td>{fmt(currNet)}</td><td>{fmt(totalNet)}</td></tr>
              </tbody>
            </table>
          </>
        )}
        {selectedSheets.map((sheet, i) => (
          <div key={sheet.id} style={{ pageBreakBefore: includeSummary || i > 0 ? "always" : "auto" }}>
            <div className="cert-title">CERTIFICATE DETAIL — {sheet.name}</div>
            <table>
              <thead><tr><th>#</th><th>Item No.</th><th>Description</th><th>Unit</th><th>BOQ Qty</th><th>Rate</th><th>BOQ Amt</th><th>Prev Amt</th><th>Curr Amt</th><th>Total Qty</th><th>Total Amt</th></tr></thead>
              <tbody>
                {sheet.items.map((item, idx) => (
                  <tr key={item.id}><td>{idx + 1}</td><td>{item.billNo}</td><td>{item.description}</td><td>{item.unit}</td><td>{currency(item.boqQty)}</td><td>{currency(item.boqRate)}</td><td>{currency(item.boqAmount)}</td><td>{currency(item.previousAmount)}</td><td>{currency(item.currentAmount)}</td><td>{currency(item.totalQty)}</td><td>{currency(item.totalAmount)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      <Modal open={showSelector} onClose={() => setShowSelector(false)} title={action === "excel" ? "Export to Excel" : "Print Certificate"} width={520}>
        <p className="text-sm text-txt-muted mb-3">Select which pages/sheets to include.</p>
        <div className="space-y-2 max-h-[300px] overflow-auto border border-border rounded-lg p-3 bg-bg-raised/30">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={includeSummary} onChange={(e) => setIncludeSummary(e.target.checked)} />
            Include Summary Page
          </label>
          {cert.sheets.map((sheet) => (
            <label key={sheet.id} className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={selectedSheetIds.has(sheet.id)} onChange={() => toggleSheet(sheet.id)} />
              {sheet.name}
            </label>
          ))}
        </div>
        <div className="flex justify-end gap-3 mt-4">
          <Button variant="ghost" onClick={() => setShowSelector(false)}>Cancel</Button>
          <Button variant="primary" disabled={!includeSummary && selectedSheets.length === 0} onClick={runAction}>
            {action === "excel" ? "Export Selected" : "Print Selected"}
          </Button>
        </div>
      </Modal>
    </>
  );
}
