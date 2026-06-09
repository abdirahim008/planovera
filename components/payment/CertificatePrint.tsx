"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx-js-style";
import type { PaymentCertificate } from "@/lib/supabase";
import { currency } from "@/lib/store";
import {
  parsePaymentNumber,
  paymentCertificateCalcs,
  paymentLineState,
} from "@/lib/payment-calculations";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";

interface CertificatePrintProps {
  cert: PaymentCertificate;
  projectName: string;
}

const fmt = (value: number) => currency(value);

const certificateTitle = (cert: PaymentCertificate) =>
  `${cert.type === "final" ? "Final Payment Certificate" : "Interim Payment Certificate"} No. ${String(
    cert.number
  ).padStart(2, "0")}${cert.revision ? ` Rev ${cert.revision}` : ""}`;

const selectedSheetTotals = (cert: PaymentCertificate, selectedSheetIds: Set<string>) =>
  cert.sheets
    .filter((sheet) => selectedSheetIds.has(sheet.id))
    .map((sheet, index) => {
      const totals = sheet.items.reduce(
        (acc, item) => {
          const line = paymentLineState(item);
          acc.boq += line.boqAmount;
          acc.previous += line.previousAmount;
          acc.current += line.currentAmount;
          acc.total += line.totalAmount;
          return acc;
        },
        { boq: 0, previous: 0, current: 0, total: 0 }
      );
      return { billNo: index + 1, name: sheet.name, ...totals };
    });

const safeSheetName = (value: string, fallback: string) =>
  (value || fallback).replace(/[\\/?*\[\]:]/g, " ").trim().slice(0, 31) || fallback;

export default function CertificatePrint({ cert, projectName }: CertificatePrintProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const [showSelector, setShowSelector] = useState(false);
  const [action, setAction] = useState<"print" | "excel">("print");
  const [includeSummary, setIncludeSummary] = useState(true);
  const [selectedSheetIds, setSelectedSheetIds] = useState<Set<string>>(
    new Set(cert.sheets.map((s) => s.id))
  );

  useEffect(() => {
    setSelectedSheetIds(new Set(cert.sheets.map((s) => s.id)));
  }, [cert.id, cert.sheets]);

  const selectedSheets = useMemo(
    () => cert.sheets.filter((sheet) => selectedSheetIds.has(sheet.id)),
    [cert.sheets, selectedSheetIds]
  );
  const sheetSummaries = useMemo(
    () => selectedSheetTotals(cert, selectedSheetIds),
    [cert, selectedSheetIds]
  );
  const calcs = paymentCertificateCalcs(cert);
  const adjustmentAdditions = (cert.adjustments || [])
    .filter((line) => line.type === "addition")
    .reduce((sum, line) => sum + parsePaymentNumber(line.amount), 0);
  const adjustmentDeductions = (cert.adjustments || [])
    .filter((line) => line.type === "deduction")
    .reduce((sum, line) => sum + parsePaymentNumber(line.amount), 0);

  const toggleSheet = (sheetId: string) => {
    setSelectedSheetIds((prev) => {
      const next = new Set(prev);
      if (next.has(sheetId)) next.delete(sheetId);
      else next.add(sheetId);
      return next;
    });
  };

  const printStyles = `
    * { box-sizing: border-box; }
    body { margin: 0; background: #fff; color: #111827; font-family: Arial, Helvetica, sans-serif; font-size: 10.5px; line-height: 1.35; }
    .page { padding: 0; color: #111827; }
    .header { border-bottom: 2px solid #111827; padding-bottom: 8px; margin-bottom: 12px; }
    .kicker { color: #4b5563; font-size: 9px; text-transform: uppercase; letter-spacing: 0.16em; font-weight: 700; }
    .title { margin-top: 3px; font-size: 18px; font-weight: 800; color: #111827; }
    .subtitle { margin-top: 3px; font-size: 10.5px; color: #374151; }
    .meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin: 10px 0 14px; }
    .meta div { border: 1px solid #cbd5e1; padding: 6px; min-height: 38px; }
    .label { display: block; color: #64748b; font-size: 8px; text-transform: uppercase; letter-spacing: 0.13em; font-weight: 700; margin-bottom: 3px; }
    .value { color: #111827; font-weight: 700; overflow-wrap: anywhere; }
    h2 { margin: 14px 0 7px; padding-top: 7px; border-top: 1.5px solid #111827; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: #111827; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; margin-bottom: 12px; page-break-inside: auto; }
    th, td { border: 1px solid #cbd5e1; padding: 4px 5px; color: #111827; vertical-align: top; overflow-wrap: anywhere; word-break: normal; }
    th { background: #f1f5f9; font-size: 8.5px; text-align: center; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 800; }
    td.num { text-align: right; font-variant-numeric: tabular-nums; }
    td.center { text-align: center; }
    td.desc { text-align: left; }
    tr.subtotal td { background: #f8fafc; font-weight: 800; }
    tr.net td { background: #ecfdf5; font-weight: 900; }
    tr.warn td { background: #fff7ed; }
    .signatures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 18px; page-break-inside: avoid; }
    .sig { min-height: 78px; border-top: 1px solid #111827; padding-top: 6px; }
    .footer { margin-top: 14px; color: #64748b; font-size: 8px; text-align: center; }
    .page-break { page-break-before: always; }
    @media print { @page { size: A4 landscape; margin: 12mm 10mm 14mm; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } tr { page-break-inside: avoid; } }
  `;

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${certificateTitle(cert)}</title>
          <style>${printStyles}</style>
        </head>
        <body>${content.innerHTML}</body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 350);
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

    if (includeSummary) {
      const rows: Array<Array<string | number>> = [
        [certificateTitle(cert)],
        [`Project: ${projectName}`],
        [`Period: ${cert.periodStart || cert.date} to ${cert.periodEnd || cert.date}`],
        [],
        ["Bill", "Description", "BOQ Amount", "Previous Amount", "Current Amount", "Cumulative Amount"],
        ...sheetSummaries.map((row) => [row.billNo, row.name, row.boq, row.previous, row.current, row.total]),
        ["", "Works subtotal", calcs.boqSubTotal, calcs.prevSubTotal, calcs.currSubTotal, calcs.totalSubTotal],
        ["", "Gross certified", calcs.boq.grand, calcs.prev.grand, calcs.curr.grand, calcs.total.grand],
        ["", "Retention deducted", "", calcs.prev.ret, calcs.curr.ret, calcs.total.ret],
        ["", "Retention released", "", "", calcs.curr.retentionRelease, calcs.curr.retentionRelease],
        ["", "Advance recovered", "", calcs.prev.advance, calcs.curr.advance, calcs.total.advance],
        ["", "Withholding tax", "", calcs.prev.wh, calcs.curr.wh, calcs.total.wh],
        ["", "Adjustment additions", "", "", adjustmentAdditions, adjustmentAdditions],
        ["", "Adjustment deductions", "", "", adjustmentDeductions, adjustmentDeductions],
        ["", "Current net payable", "", "", calcs.curr.net, calcs.total.net],
        ["", "Retention held", "", "", "", calcs.total.retentionHeld],
        ["", "Advance balance", "", "", "", calcs.total.advanceBalance],
      ];
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws["!cols"] = [{ wch: 8 }, { wch: 34 }, { wch: 16 }, { wch: 18 }, { wch: 18 }, { wch: 18 }];
      (ws as any)["!merges"] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: 5 } },
        { s: { r: 2, c: 0 }, e: { r: 2, c: 5 } },
      ];
      styleRow(ws, 1, 6, { font: { ...baseFont, bold: true, sz: 14 }, alignment: { horizontal: "center" } });
      styleRow(ws, 2, 6, { font: { ...baseFont, bold: true }, alignment: { horizontal: "center" } });
      styleRow(ws, 3, 6, { alignment: { horizontal: "center" } });
      styleRow(ws, 5, 6, { fill: headerFill, font: { ...baseFont, bold: true }, alignment: { horizontal: "center" } });
      for (let row = 6; row <= rows.length; row++) {
        styleRow(ws, row, 6, { alignment: { vertical: "top", wrapText: true }, numFmt: "#,##0.00" });
      }
      XLSX.utils.book_append_sheet(wb, ws, "Summary");
    }

    selectedSheets.forEach((sheet) => {
      const rows: Array<Array<string | number>> = [[
        "#",
        "Item No.",
        "Description",
        "Unit",
        "BOQ Qty",
        "Rate",
        "BOQ Amount",
        "Previous Qty",
        "Current Qty",
        "Cumulative Qty",
        "Balance Qty",
        "Current Amount",
        "Cumulative Amount",
        "Warning / Note",
      ]];
      sheet.items.forEach((item, index) => {
        const line = paymentLineState(item);
        rows.push([
          index + 1,
          item.billNo,
          item.description,
          item.unit,
          line.boqQty,
          line.rate,
          line.boqAmount,
          line.previousQty,
          line.currentQty,
          line.totalQty,
          line.balanceQty,
          line.currentAmount,
          line.totalAmount,
          item.overrideNote || (line.warningStatus === "over-certified" ? "Over BOQ quantity" : ""),
        ]);
      });
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws["!cols"] = [
        { wch: 5 },
        { wch: 12 },
        { wch: 46 },
        { wch: 8 },
        { wch: 11 },
        { wch: 12 },
        { wch: 14 },
        { wch: 12 },
        { wch: 12 },
        { wch: 14 },
        { wch: 12 },
        { wch: 15 },
        { wch: 16 },
        { wch: 28 },
      ];
      styleRow(ws, 1, 14, { fill: headerFill, font: { ...baseFont, bold: true }, alignment: { horizontal: "center" } });
      for (let row = 2; row <= rows.length; row++) {
        styleRow(ws, row, 14, { alignment: { vertical: "top", wrapText: true }, numFmt: "#,##0.00" });
      }
      XLSX.utils.book_append_sheet(wb, ws, safeSheetName(sheet.name, "Sheet"));
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

  const runAction = () => {
    if (!includeSummary && selectedSheets.length === 0) return;
    setShowSelector(false);
    if (action === "excel") exportToExcel();
    else handlePrint();
  };

  return (
    <>
      <button
        onClick={() => {
          setAction("print");
          setShowSelector(true);
        }}
        className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-hover"
      >
        Print Certificate
      </button>
      <button
        onClick={() => {
          setAction("excel");
          setShowSelector(true);
        }}
        className="ml-2 inline-flex items-center gap-1.5 rounded-md border border-border bg-bg-raised px-3 py-1.5 text-xs font-medium text-txt transition-colors hover:bg-bg-hover"
      >
        Export Excel
      </button>

      <div ref={printRef} style={{ position: "absolute", left: "-9999px", top: 0 }}>
        <div className="page">
          {includeSummary && (
            <>
              <div className="header">
                <div className="kicker">Payment certificate</div>
                <div className="title">{certificateTitle(cert)}</div>
                <div className="subtitle">{projectName}</div>
              </div>
              <div className="meta">
                <div>
                  <span className="label">Certificate Date</span>
                  <span className="value">{cert.date}</span>
                </div>
                <div>
                  <span className="label">Period</span>
                  <span className="value">{cert.periodStart || cert.date} to {cert.periodEnd || cert.date}</span>
                </div>
                <div>
                  <span className="label">Status</span>
                  <span className="value">{cert.status.toUpperCase()}</span>
                </div>
                <div>
                  <span className="label">Previous Certificate</span>
                  <span className="value">{cert.previousCertificateId ? "Linked" : "None"}</span>
                </div>
              </div>

              <h2>Summary bills of quantities</h2>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: "7%" }}>Bill</th>
                    <th style={{ width: "31%" }}>Description</th>
                    <th>BOQ Amount</th>
                    <th>Previous Amount</th>
                    <th>Current Amount</th>
                    <th>Cumulative Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {sheetSummaries.map((row) => (
                    <tr key={row.name}>
                      <td className="center">{row.billNo}</td>
                      <td className="desc">{row.name}</td>
                      <td className="num">{fmt(row.boq)}</td>
                      <td className="num">{fmt(row.previous)}</td>
                      <td className="num">{fmt(row.current)}</td>
                      <td className="num">{fmt(row.total)}</td>
                    </tr>
                  ))}
                  <tr className="subtotal">
                    <td />
                    <td className="desc">Works subtotal</td>
                    <td className="num">{fmt(calcs.boqSubTotal)}</td>
                    <td className="num">{fmt(calcs.prevSubTotal)}</td>
                    <td className="num">{fmt(calcs.currSubTotal)}</td>
                    <td className="num">{fmt(calcs.totalSubTotal)}</td>
                  </tr>
                  <tr className="subtotal">
                    <td />
                    <td className="desc">Gross certified</td>
                    <td className="num">{fmt(calcs.boq.grand)}</td>
                    <td className="num">{fmt(calcs.prev.grand)}</td>
                    <td className="num">{fmt(calcs.curr.grand)}</td>
                    <td className="num">{fmt(calcs.total.grand)}</td>
                  </tr>
                  <tr>
                    <td />
                    <td className="desc">Retention deducted</td>
                    <td />
                    <td className="num">{fmt(calcs.prev.ret)}</td>
                    <td className="num">{fmt(calcs.curr.ret)}</td>
                    <td className="num">{fmt(calcs.total.ret)}</td>
                  </tr>
                  <tr>
                    <td />
                    <td className="desc">Retention released</td>
                    <td />
                    <td />
                    <td className="num">{fmt(calcs.curr.retentionRelease)}</td>
                    <td className="num">{fmt(calcs.curr.retentionRelease)}</td>
                  </tr>
                  <tr>
                    <td />
                    <td className="desc">Advance recovered</td>
                    <td />
                    <td className="num">{fmt(calcs.prev.advance)}</td>
                    <td className="num">{fmt(calcs.curr.advance)}</td>
                    <td className="num">{fmt(calcs.total.advance)}</td>
                  </tr>
                  <tr>
                    <td />
                    <td className="desc">Withholding tax</td>
                    <td />
                    <td className="num">{fmt(calcs.prev.wh)}</td>
                    <td className="num">{fmt(calcs.curr.wh)}</td>
                    <td className="num">{fmt(calcs.total.wh)}</td>
                  </tr>
                  {(cert.adjustments || []).map((line) => (
                    <tr key={line.id} className={line.type === "deduction" ? "warn" : undefined}>
                      <td />
                      <td className="desc">
                        {line.type === "deduction" ? "Less" : "Add"} {line.label}
                        {line.note ? ` - ${line.note}` : ""}
                      </td>
                      <td />
                      <td />
                      <td className="num">{fmt(parsePaymentNumber(line.amount))}</td>
                      <td className="num">{fmt(parsePaymentNumber(line.amount))}</td>
                    </tr>
                  ))}
                  <tr className="net">
                    <td />
                    <td className="desc">Current net payable</td>
                    <td />
                    <td className="num">{fmt(calcs.prev.net)}</td>
                    <td className="num">{fmt(calcs.curr.net)}</td>
                    <td className="num">{fmt(calcs.total.net)}</td>
                  </tr>
                </tbody>
              </table>

              <div className="signatures">
                <div className="sig">
                  <span className="label">Prepared by</span>
                  <div className="value">{cert.contractorName || "Contractor representative"}</div>
                  <div>{cert.contractorCompany}</div>
                </div>
                <div className="sig">
                  <span className="label">Checked by</span>
                  <div className="value">{cert.engineerName || "Engineer representative"}</div>
                  <div>{cert.engineerOrg}</div>
                </div>
                <div className="sig">
                  <span className="label">Approved by</span>
                  <div className="value">{cert.employerName || "Employer representative"}</div>
                  <div>{cert.employerOrg}</div>
                </div>
              </div>
              <div className="footer">Generated from Planovera project controls.</div>
            </>
          )}

          {selectedSheets.map((sheet, sheetIndex) => (
            <div key={sheet.id} className={includeSummary || sheetIndex > 0 ? "page-break" : ""}>
              <div className="header">
                <div className="kicker">Certificate detail</div>
                <div className="title">{sheet.name}</div>
                <div className="subtitle">{certificateTitle(cert)} - {projectName}</div>
              </div>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: "4%" }}>#</th>
                    <th style={{ width: "8%" }}>Item No.</th>
                    <th style={{ width: "25%" }}>Description</th>
                    <th style={{ width: "6%" }}>Unit</th>
                    <th>BOQ Qty</th>
                    <th>Rate</th>
                    <th>BOQ Amount</th>
                    <th>Prev Qty</th>
                    <th>Curr Qty</th>
                    <th>Cum Qty</th>
                    <th>Balance</th>
                    <th>Curr Amount</th>
                    <th>Cum Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {sheet.items.map((item, index) => {
                    const line = paymentLineState(item);
                    return (
                      <tr key={item.id} className={line.warningStatus === "over-certified" ? "warn" : ""}>
                        <td className="center">{index + 1}</td>
                        <td className="center">{item.billNo}</td>
                        <td className="desc">
                          {item.description}
                          {item.overrideNote ? <div><strong>Note:</strong> {item.overrideNote}</div> : null}
                        </td>
                        <td className="center">{item.unit}</td>
                        <td className="num">{fmt(line.boqQty)}</td>
                        <td className="num">{fmt(line.rate)}</td>
                        <td className="num">{fmt(line.boqAmount)}</td>
                        <td className="num">{fmt(line.previousQty)}</td>
                        <td className="num">{fmt(line.currentQty)}</td>
                        <td className="num">{fmt(line.totalQty)}</td>
                        <td className="num">{fmt(line.balanceQty)}</td>
                        <td className="num">{fmt(line.currentAmount)}</td>
                        <td className="num">{fmt(line.totalAmount)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </div>

      <Modal
        open={showSelector}
        onClose={() => setShowSelector(false)}
        title={action === "excel" ? "Export to Excel" : "Print Certificate"}
        width={520}
      >
        <p className="mb-3 text-sm text-txt-muted">Select which pages/sheets to include.</p>
        <div className="max-h-[300px] space-y-2 overflow-auto rounded-lg border border-border bg-bg-raised/30 p-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" checked={includeSummary} onChange={(e) => setIncludeSummary(e.target.checked)} />
            Include Summary Page
          </label>
          {cert.sheets.map((sheet) => (
            <label key={sheet.id} className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={selectedSheetIds.has(sheet.id)} onChange={() => toggleSheet(sheet.id)} />
              {sheet.name}
            </label>
          ))}
        </div>
        <div className="mt-4 flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setShowSelector(false)}>Cancel</Button>
          <Button variant="primary" disabled={!includeSummary && selectedSheets.length === 0} onClick={runAction}>
            {action === "excel" ? "Export Selected" : "Print Selected"}
          </Button>
        </div>
      </Modal>
    </>
  );
}
