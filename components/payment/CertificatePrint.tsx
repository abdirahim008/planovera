"use client";

import { useState } from "react";
import * as XLSX from "xlsx-js-style";
import { Eye, FileText, FileSpreadsheet } from "lucide-react";
import type { PaymentCertificate, Project } from "@/lib/supabase";
import { useAppStore } from "@/lib/store";
import { paymentLineState } from "@/lib/payment-calculations";
import { buildIpcFormalHtml, buildIpcDocData } from "./ipcFormalDoc";

interface CertificatePrintProps {
  cert: PaymentCertificate;
  project: Project | null;
}

const certificateTitle = (cert: PaymentCertificate) =>
  `${cert.type === "final" ? "Final Payment Certificate" : "Interim Payment Certificate"} No. ${String(cert.number).padStart(2, "0")}${
    cert.revision ? ` Rev ${cert.revision}` : ""
  }`;

const safeSheetName = (value: string, fallback: string) =>
  (value || fallback).replace(/[\\/?*\[\]:]/g, " ").trim().slice(0, 31) || fallback;

/**
 * Certificate output: a single formal-template path. "Export PDF" / "Preview
 * PDF" render the A4-landscape UNOPS statement (ipcFormalDoc) followed by the
 * per-sheet BOQ line-item detail; "Export Excel" mirrors that — a formal A–M
 * summary sheet plus one detail sheet per BOQ sheet.
 */
export default function CertificatePrint({ cert, project }: CertificatePrintProps) {
  const userSignatureProfile = useAppStore((s) => s.userSignatureProfile);
  const [preview, setPreview] = useState(false);

  const formalHtml = (autoPrint = false) => buildIpcFormalHtml(cert, project, userSignatureProfile, autoPrint);

  const exportPdf = () => {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(formalHtml(true));
    w.document.close();
  };

  const excelBorder = {
    top: { style: "thin", color: { rgb: "CBD5E1" } },
    bottom: { style: "thin", color: { rgb: "CBD5E1" } },
    left: { style: "thin", color: { rgb: "CBD5E1" } },
    right: { style: "thin", color: { rgb: "CBD5E1" } },
  };
  const baseFont = { name: "Arial", sz: 10, color: { rgb: "111827" } };
  const headerFill = { patternType: "solid", fgColor: { rgb: "E2E8F0" } };

  const styleRow = (ws: XLSX.WorkSheet, rowNumber: number, colCount: number, style: Record<string, any>) => {
    for (let c = 0; c < colCount; c++) {
      const addr = XLSX.utils.encode_cell({ r: rowNumber - 1, c });
      const cell = ws[addr];
      if (!cell) continue;
      (cell as any).s = {
        font: baseFont,
        border: excelBorder,
        alignment: { vertical: "top", wrapText: true },
        ...((cell as any).s || {}),
        ...style,
      };
    }
  };

  const exportToExcel = () => {
    const wb = XLSX.utils.book_new();
    const d = buildIpcDocData(cert, project, userSignatureProfile);
    const H = d.header;

    // Formal A–M statement, mirroring the PDF.
    const rows: Array<Array<string | number>> = [
      [H.title],
      [`Project: ${H.projectTitle}`],
      [`Contract No: ${H.contractNo}`, "", `Certificate No: ${H.certificateNo}`, `Valuation: ${H.valuationDate}`],
      [`Contractor: ${H.contractor}`],
      [`Contract Price: ${H.contractPrice}`, "", `Period: ${H.period}`],
      [],
      ["Account details", "Prev. Certificate", "This Certificate", `Total (${H.currency})`],
      ["A. Total of work done", d.prev.workDone, d.cur.workDone, d.total.workDone],
      ["B. Material on site", d.prev.material, d.cur.material, d.total.material],
      ["C. Variations", d.prev.variations, d.cur.variations, d.total.variations],
      ["D. Sub-total", d.prev.D, d.cur.D, d.total.D],
      ["E. Less 5% tax", d.prev.tax, d.cur.tax, d.total.tax],
      ["E. Less retention money", d.prev.retention, d.cur.retention, d.total.retention],
      ["E. Less withholding tax", d.prev.wh, d.cur.wh, d.total.wh],
      ["E. Add retention released", d.prev.release, d.cur.release, d.total.release],
      ["F. Sub-total", d.prev.F, d.cur.F, d.total.F],
      ["G. Advance payment", d.prev.advance, d.cur.advance, d.total.advance],
      ["H. Repayment of advance", d.prev.repay, d.cur.repay, d.total.repay],
      ["I. Balance of advance (G-H)", d.prev.balanceI, d.cur.balanceI, d.total.balanceI],
      ["J. Compensation costs/claims", d.prev.J, d.cur.J, d.total.J],
      ["K. Interest on delayed payment", d.prev.K, d.cur.K, d.total.K],
      ["L. Liquidated damage", d.prev.L, d.cur.L, d.total.L],
      ["M. Total of payment", d.M.prev, d.M.cur, d.M.total],
      ["Previous certificates", "", "", d.previousCertificates],
      ["Now due to contractor", "", "", d.nowDue],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 36 }, { wch: 18 }, { wch: 18 }, { wch: 18 }];
    (ws as any)["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 3 } },
      { s: { r: 3, c: 0 }, e: { r: 3, c: 3 } },
    ];
    // Make the statement's derivations live (formula cells carry a cached value
    // so the writer keeps them): D = A+B+C, F = D − deductions, and the Total
    // column = Previous + This for the additive lines. Balance/M/now-due stay as
    // computed values since they aren't simple additions.
    const sumF = (r1: number, c0: number, f: string, v: number) => {
      ws[XLSX.utils.encode_cell({ r: r1 - 1, c: c0 })] = { t: "n", f, v };
    };
    (
      [
        [8, d.total.workDone], [9, d.total.material], [10, d.total.variations],
        [12, d.total.tax], [13, d.total.retention], [14, d.total.wh], [15, d.total.release],
        [17, d.total.advance], [18, d.total.repay], [20, d.total.J], [21, d.total.K], [22, d.total.L],
      ] as Array<[number, number]>
    ).forEach(([r, total]) => sumF(r, 3, `B${r}+C${r}`, total));
    sumF(11, 1, "B8+B9+B10", d.prev.D); sumF(11, 2, "C8+C9+C10", d.cur.D); sumF(11, 3, "D8+D9+D10", d.total.D);
    sumF(16, 1, "B11-B12-B13-B14+B15", d.prev.F); sumF(16, 2, "C11-C12-C13-C14+C15", d.cur.F); sumF(16, 3, "D11-D12-D13-D14+D15", d.total.F);

    styleRow(ws, 1, 4, { font: { ...baseFont, bold: true, sz: 14 }, alignment: { horizontal: "center" } });
    styleRow(ws, 2, 4, { font: { ...baseFont, bold: true }, alignment: { horizontal: "center" } });
    styleRow(ws, 7, 4, { fill: headerFill, font: { ...baseFont, bold: true }, alignment: { horizontal: "center" } });
    for (let row = 8; row <= rows.length; row++) {
      styleRow(ws, row, 4, { alignment: { vertical: "top", wrapText: true }, numFmt: "#,##0.00" });
    }
    // Bold the sub-total / total / now-due lines (D, F, M, Now due).
    [11, 16, 23, 25].forEach((r) => styleRow(ws, r, 4, { font: { ...baseFont, bold: true } }));
    XLSX.utils.book_append_sheet(wb, ws, cert.type === "final" ? "FPC Summary" : "IPC Summary");

    // Per-sheet BOQ line-item detail — written with live formulas so editing a
    // quantity or rate recalculates the amounts, cumulative and bill totals.
    // Columns: A# B"Item No" C"Desc" D"Unit" E"BOQ Qty" F"Rate" G"BOQ Amount"
    // H"Prev Qty" I"Curr Qty" J"Cum Qty" K"Balance" L"Curr Amount" M"Cum Amount" N"Note".
    (cert.sheets || []).forEach((sheet) => {
      const detailRows: Array<Array<string | number>> = [
        ["#", "Item No.", "Description", "Unit", "BOQ Qty", "Rate", "BOQ Amount", "Previous Qty", "Current Qty", "Cumulative Qty", "Balance Qty", "Current Amount", "Cumulative Amount", "Warning / Note"],
      ];
      const lines = sheet.items.map((item) => paymentLineState(item));
      sheet.items.forEach((item, index) => {
        const line = lines[index];
        detailRows.push([
          index + 1, item.billNo, item.description, item.unit,
          line.boqQty, line.rate, line.boqAmount,
          line.previousQty, line.currentQty, line.totalQty, line.balanceQty,
          line.currentAmount, line.totalAmount,
          item.overrideNote || (line.warningStatus === "over-certified" ? "Over BOQ quantity" : ""),
        ]);
      });
      const itemCount = sheet.items.length;
      const sumOf = (sel: (l: (typeof lines)[number]) => number) => lines.reduce((s, l) => s + sel(l), 0);
      detailRows.push(["", "", "Bill total", "", "", "", sumOf((l) => l.boqAmount), "", "", "", "", sumOf((l) => l.currentAmount), sumOf((l) => l.totalAmount), ""]);

      const dws = XLSX.utils.aoa_to_sheet(detailRows);
      dws["!cols"] = [
        { wch: 5 }, { wch: 12 }, { wch: 46 }, { wch: 8 }, { wch: 11 }, { wch: 12 }, { wch: 14 },
        { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 15 }, { wch: 16 }, { wch: 28 },
      ];
      const setF = (r1: number, c0: number, f: string, v: number) => {
        dws[XLSX.utils.encode_cell({ r: r1 - 1, c: c0 })] = { t: "n", f, v };
      };
      sheet.items.forEach((_, idx) => {
        const er = idx + 2;
        const line = lines[idx];
        setF(er, 6, `E${er}*F${er}`, line.boqAmount); // BOQ Amount = BOQ Qty × Rate
        setF(er, 9, `H${er}+I${er}`, line.totalQty); // Cumulative Qty = Prev + Current
        setF(er, 10, `E${er}-J${er}`, line.balanceQty); // Balance = BOQ Qty − Cumulative
        setF(er, 11, `I${er}*F${er}`, line.currentAmount); // Current Amount = Current Qty × Rate
        setF(er, 12, `J${er}*F${er}`, line.totalAmount); // Cumulative Amount = Cum Qty × Rate
      });
      if (itemCount > 0) {
        const totalRow = itemCount + 2;
        const last = itemCount + 1;
        setF(totalRow, 6, `SUM(G2:G${last})`, sumOf((l) => l.boqAmount));
        setF(totalRow, 11, `SUM(L2:L${last})`, sumOf((l) => l.currentAmount));
        setF(totalRow, 12, `SUM(M2:M${last})`, sumOf((l) => l.totalAmount));
      }

      styleRow(dws, 1, 14, { fill: headerFill, font: { ...baseFont, bold: true }, alignment: { horizontal: "center" } });
      for (let row = 2; row <= detailRows.length; row++) {
        styleRow(dws, row, 14, { alignment: { vertical: "top", wrapText: true }, numFmt: "#,##0.00" });
      }
      if (itemCount > 0) styleRow(dws, itemCount + 2, 14, { font: { ...baseFont, bold: true } });
      XLSX.utils.book_append_sheet(wb, dws, safeSheetName(sheet.name, "Sheet"));
    });

    const safeDate = String(cert.date || "").replace(/[^\d-]/g, "") || "date";
    const safeName = `${certificateTitle(cert)}-${safeDate}.xlsx`.replace(/[<>:"/\\|?*]+/g, "-");
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

  const btnCls =
    "inline-flex items-center gap-1.5 rounded-md border border-border bg-bg-raised px-3 py-1.5 text-xs font-medium text-txt transition-colors hover:bg-bg-hover";

  return (
    <>
      <button type="button" onClick={() => setPreview(true)} className={btnCls}>
        <Eye size={14} /> Preview PDF
      </button>
      <button
        type="button"
        onClick={exportPdf}
        className="ml-2 inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-hover"
      >
        <FileText size={14} /> Export PDF
      </button>
      <button type="button" onClick={exportToExcel} className={`${btnCls} ml-2`}>
        <FileSpreadsheet size={14} /> Export Excel
      </button>

      {preview ? (
        <div
          className="fixed inset-0 z-[200] flex flex-col items-center overflow-auto bg-[rgba(16,24,38,0.6)] p-4"
          onClick={() => setPreview(false)}
        >
          <div
            className="mb-3 flex w-full max-w-5xl items-center justify-between text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="text-sm font-semibold">PDF preview — A4 landscape</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={exportPdf}
                className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-accent-hover"
              >
                Save as PDF
              </button>
              <button
                type="button"
                onClick={() => setPreview(false)}
                className="rounded-lg border border-white/40 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/10"
              >
                Close
              </button>
            </div>
          </div>
          <div className="w-full max-w-5xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <iframe title="IPC formal preview" className="h-[80vh] w-full border-0 bg-white" srcDoc={formalHtml(false)} />
          </div>
        </div>
      ) : null}
    </>
  );
}
