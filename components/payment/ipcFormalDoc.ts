import type { PaymentCertificate, Project, UserSignatureProfile } from "@/lib/supabase";
import { paymentCertificateCalcs, paymentLineState } from "@/lib/payment-calculations";

/* ------------------------------------------------------------------ *
 * Formal A4-landscape "Summary of Statement for Payment on Account"
 * (UNOPS-style IPC). Faithful port of the Claude Design prototype's
 * PrintDoc + ipc-doc styles, wired to the live certificate. The same
 * HTML drives both the on-screen Ledger preview (in an iframe) and the
 * exported PDF, so the two can never drift apart.
 * ------------------------------------------------------------------ */

const esc = (v: unknown) =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Accounting format: negatives wrapped in parentheses, like the reference IPC.
const fmt = (n: number) => {
  const v = Number.isFinite(n) ? n : 0;
  const s = Math.abs(Math.round((v + Number.EPSILON) * 100) / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return v < 0 ? `(${s})` : s;
};

export type IpcDocData = ReturnType<typeof buildIpcDocData>;

/** Map the live certificate calc onto the formal A–M row model. */
export function buildIpcDocData(
  cert: PaymentCertificate,
  project: Project | null | undefined,
  signatureProfile?: UserSignatureProfile | null,
) {
  const c = paymentCertificateCalcs(cert);
  const variationsThis = c.additions - c.deductions;
  // A signatory's signature image only appears when that slot is explicitly
  // linked to the user's saved signature; otherwise the line stays blank.
  const savedSig = signatureProfile?.imageDataUrl || "";
  const sigImg = (src: "saved" | "none" | undefined) => (src === "saved" ? savedSig : "");

  const col = (g: number, ret: number, wh: number, varr: number, advance: number, repay: number) => {
    const workDone = g;
    const D = workDone + varr;
    const tax = 0; // government tax removed from the model; row kept at 0 for fidelity
    const F = D - tax - ret - wh;
    return { workDone, material: 0, variations: varr, D, tax, retention: ret, wh, F, advance, repay, balanceI: Math.max(0, advance - repay), J: 0, K: 0, L: 0 };
  };

  const prev = col(c.prev.grand, c.prev.ret, c.prev.wh, 0, c.advancePaymentAmount, c.previousAdvanceRecovered);
  const cur = col(c.curr.grand, c.curr.ret, c.curr.wh, variationsThis, 0, c.currentAdvanceRecovery);
  const total: Record<string, number> = {};
  ["workDone", "material", "variations", "D", "tax", "retention", "wh", "F", "advance", "repay", "J", "K", "L"].forEach((k) => {
    total[k] = (prev as Record<string, number>)[k] + (cur as Record<string, number>)[k];
  });
  total.balanceI = c.total.advanceBalance;

  const M = { prev: c.prev.net, cur: c.curr.net, total: c.total.net };

  const periodLabel = `${cert.periodStart || cert.date} → ${cert.periodEnd || cert.date}`;
  return {
    header: {
      title: "SUMMARY OF STATEMENT FOR PAYMENT ON ACCOUNT",
      projectTitle: project?.name || "Project",
      certificateNo: String(cert.number ?? 1).padStart(2, "0"),
      contractNo: (cert.boqName || "—").toUpperCase(),
      valuationDate: cert.date,
      contractor: cert.contractorCompany || cert.contractorName || "—",
      contractPrice: project?.contractAmount ? parseFloat(String(project.contractAmount).replace(/,/g, "")) || 0 : 0,
      period: periodLabel,
      currency: project?.currency || "USD",
      docType: cert.type === "final" ? "FINAL PAYMENT CERTIFICATE" : "INTERIM PAYMENT CERTIFICATE",
      docSub: `${project?.name || "Project"}${project?.role ? " · " + project.role : ""}`,
    },
    prev,
    cur,
    total,
    M,
    previousCertificates: c.prev.net,
    nowDue: c.curr.net,
    sign: {
      contractor: { heading: "Prepared by", role: "Contractor", agentLabel: cert.contractorTitle || "Site Agent", agent: cert.contractorName || "", note: cert.contractorCompany || "", signatureImage: sigImg(cert.contractorSignatureSource) },
      engineer: { heading: "Rates and quantities confirmed by", role: cert.engineerOrg || "Engineer", agentLabel: cert.engineerTitle || "Resident Engineer", agent: cert.engineerName || "", note: "Confirmed that the above rates and quantities are correct.", signatureImage: sigImg(cert.engineerSignatureSource) },
      employer: { heading: "Checked by", role: "Employer", agentLabel: cert.employerTitle || "Project Coordinator", agent: cert.employerName || "", note: cert.employerOrg || "", signatureImage: sigImg(cert.employerSignatureSource) },
    },
  };
}

const IPC_DOC_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&family=Caveat:wght@600&display=swap');
*{box-sizing:border-box;}
:root{--mono:"JetBrains Mono",ui-monospace,monospace;--sans:"Inter",system-ui,sans-serif;}
body{margin:0;background:#fff;font-family:var(--sans);color:#000;}
.ipc-doc{font-family:var(--sans);color:#000;padding:8px 6px;}
.ipc-brand{display:flex;align-items:flex-end;justify-content:space-between;padding-bottom:10px;margin-bottom:8px;border-bottom:2px solid #111;}
.ipc-brand-left{display:flex;align-items:center;gap:9px;}
.ipc-brand-name{font-weight:700;font-size:18px;letter-spacing:-.01em;}
.ipc-brand-right{text-align:right;}
.ipc-brand-doc{font-size:11px;font-weight:700;letter-spacing:.1em;color:#222;}
.ipc-brand-proj{font-size:10.5px;color:#555;margin-top:2px;}
.ipc-tbl{width:100%;border-collapse:collapse;table-layout:fixed;}
.ipc-tbl td,.ipc-tbl th{border:1px solid #111;padding:3px 6px;font-size:11px;line-height:1.25;vertical-align:middle;word-wrap:break-word;}
.ipc-tbl--fin,.ipc-tbl--sig{border-top:none;}
.ipc-title-row .ipc-title{text-align:center;font-weight:700;font-size:11.5px;letter-spacing:.01em;}
.ipc-rmk-head{text-align:center;font-weight:600;}
.ipc-k{font-weight:600;white-space:nowrap;font-size:10.5px;}
.ipc-v{font-size:10.5px;}
.ipc-v2{font-size:10px;}
.ipc-c{text-align:center;}
.ipc-colhead th{text-align:center;font-weight:700;font-size:10px;letter-spacing:.02em;}
.ipc-num{text-align:right;font-family:var(--mono);font-size:11px;font-variant-numeric:tabular-nums;}
.ipc-lbl{font-size:10.5px;}
.ipc-code{display:inline-block;min-width:15px;font-weight:600;}
.ipc-tbl .b td,.ipc-tbl tr.b .ipc-lbl,.ipc-tbl tr.b .ipc-num,.ipc-num.b,.ipc-spanlbl.b{font-weight:700;}
.lvl1 .ipc-lbl{padding-left:24px;}
.lvl2 .ipc-lbl{padding-left:46px;}
.ipc-due td{background:#F2F2F2;}
.ipc-spanlbl{text-align:right;font-weight:600;font-size:10.5px;}
.ipc-tbl--sig td{vertical-align:top;padding:0;height:120px;}
.ipc-sigcell{padding:8px 10px;display:flex;flex-direction:column;height:100%;}
.ipc-sig-head{text-align:center;font-weight:700;font-size:11px;}
.ipc-sig-role{text-align:center;font-weight:700;font-size:11px;margin:18px 0 14px;}
.ipc-sig-line{display:flex;align-items:flex-end;gap:6px;font-size:10px;border-bottom:1px solid #111;padding-bottom:2px;margin-bottom:5px;}
.ipc-sig-key{color:#333;}
.ipc-sig-mark{font-family:"Caveat",cursive;font-size:20px;line-height:1;color:#0b1f4a;flex:1;}
.ipc-sig-img{max-height:34px;max-width:150px;object-fit:contain;flex:1;}
.ipc-sig-blank{flex:1;}
.ipc-sig-agent{font-size:10px;margin-top:auto;}
.ipc-sig-note{font-size:8.5px;color:#333;margin-top:4px;line-height:1.3;}
@page{size:A4 landscape;margin:7mm;}
.ipc-detail{page-break-before:always;margin-top:18px;}
.ipc-detail-head{display:flex;align-items:baseline;justify-content:space-between;border-bottom:2px solid #111;padding-bottom:6px;margin-bottom:8px;}
.ipc-detail-title{font-weight:700;font-size:13px;}
.ipc-detail-sub{font-size:10px;color:#555;}
.ipc-dtbl{width:100%;border-collapse:collapse;table-layout:fixed;}
.ipc-dtbl th,.ipc-dtbl td{border:1px solid #999;padding:2px 4px;font-size:9px;line-height:1.2;word-wrap:break-word;vertical-align:top;}
.ipc-dtbl th{background:#eef0f3;font-weight:700;text-align:center;}
.ipc-dtbl td.dn{text-align:right;font-family:var(--mono);font-variant-numeric:tabular-nums;}
.ipc-dtbl td.dc{text-align:center;}
.ipc-dtbl tfoot td{font-weight:700;background:#f5f6f8;}
@media print{.ipc-tbl td,.ipc-tbl th{font-size:8.4pt;padding:2px 4px;}.ipc-num,.ipc-lbl,.ipc-k,.ipc-v{font-size:8.4pt;}.ipc-v2{font-size:7.8pt;}.ipc-brand-name{font-size:14pt;}.ipc-tbl--sig td{height:88px;}.ipc-dtbl th,.ipc-dtbl td{font-size:7.6pt;}}
`;

function row(code: string, label: string, lvl: number, prev: number, cur: number, tot: number, bold = false) {
  const b = bold ? "b" : "";
  return `<tr class="${b} lvl${lvl}"><td class="ipc-lbl">${code ? `<span class="ipc-code">${code}.</span>` : ""}<span>${esc(label)}</span></td><td class="ipc-num ${b}">${fmt(prev)}</td><td class="ipc-num ${b}">${fmt(cur)}</td><td class="ipc-num ${b}">${fmt(tot)}</td><td class="ipc-rmk"></td></tr>`;
}

function sigCell(s: { heading: string; role: string; agentLabel: string; agent: string; note: string; signatureImage: string }) {
  const mark = s.signatureImage
    ? `<img class="ipc-sig-img" src="${esc(s.signatureImage)}" alt="signature" />`
    : `<span class="ipc-sig-blank"></span>`;
  return `<div class="ipc-sigcell"><div class="ipc-sig-head">${esc(s.heading)}</div><div class="ipc-sig-role">${esc(s.role)}</div><div class="ipc-sig-line"><span class="ipc-sig-key">Signed:</span>${mark}</div><div class="ipc-sig-agent"><b>${esc(s.agentLabel)}:</b> ${esc(s.agent || "—")}</div><div class="ipc-sig-note">${esc(s.note)}</div></div>`;
}

/** Inner formal-document markup (no <html> wrapper) — for the on-screen iframe. */
export function ipcDocInnerHtml(d: IpcDocData): string {
  const H = d.header;
  const { prev, cur, total, M } = d;
  return `
  <div class="ipc-doc">
    <div class="ipc-brand">
      <div class="ipc-brand-left"></div>
      <div class="ipc-brand-right"><div class="ipc-brand-doc">${esc(H.docType)}</div><div class="ipc-brand-proj">${esc(H.docSub)}</div></div>
    </div>
    <table class="ipc-tbl ipc-tbl--head"><colgroup><col style="width:16%"/><col style="width:37%"/><col style="width:16%"/><col style="width:21%"/><col style="width:10%"/></colgroup><tbody>
      <tr class="ipc-title-row"><td colspan="4" class="ipc-title">${esc(H.title)}</td><td class="ipc-rmk-head">Remarks</td></tr>
      <tr><td class="ipc-k">PROJECT TITLE</td><td class="ipc-v">: ${esc(H.projectTitle)}</td><td class="ipc-k">CERTIFICATE NO:</td><td class="ipc-v ipc-c">${esc(H.certificateNo)}</td><td class="ipc-rmk" rowspan="2"></td></tr>
      <tr><td class="ipc-k">CONTRACT NO</td><td class="ipc-v">: ${esc(H.contractNo)}</td><td class="ipc-k ipc-c">VALUATION</td><td class="ipc-v ipc-c">${esc(H.valuationDate)}</td></tr>
      <tr><td class="ipc-k">CONTRACTOR</td><td class="ipc-v" colspan="3">: ${esc(H.contractor)}</td><td class="ipc-rmk"></td></tr>
      <tr><td class="ipc-k">CONTRACT PRICE</td><td class="ipc-v">: ${fmt(H.contractPrice)}</td><td class="ipc-v2" colspan="2">PERIOD: ${esc(H.period)}</td><td class="ipc-rmk"></td></tr>
      <tr><td class="ipc-k">REVISED CONTRACT PRICE</td><td class="ipc-v">: N/A</td><td class="ipc-v2" colspan="2">REVISED CONTRACT PERIOD&nbsp;&nbsp; FROM: —&nbsp;&nbsp; TO: —</td><td class="ipc-rmk"></td></tr>
      <tr><td class="ipc-k" colspan="4">ACCOUNT DETAILS:</td><td class="ipc-rmk"></td></tr>
    </tbody></table>
    <table class="ipc-tbl ipc-tbl--fin"><colgroup><col style="width:37%"/><col style="width:16%"/><col style="width:16%"/><col style="width:21%"/><col style="width:10%"/></colgroup>
    <thead><tr class="ipc-colhead"><th></th><th class="ipc-num">PREV. CERTIFICATE</th><th class="ipc-num">THIS CERTIFICATE</th><th class="ipc-num">TOTAL (${esc(H.currency)})</th><th class="ipc-rmk"></th></tr></thead>
    <tbody>
      ${row("A", "TOTAL OF WORK DONE", 0, prev.workDone, cur.workDone, total.workDone)}
      ${row("B", "MATERIAL ON SITE", 0, prev.material, cur.material, total.material)}
      ${row("C", "VARIATIONS", 0, prev.variations, cur.variations, total.variations)}
      ${row("D", "SUB-TOTAL", 0, prev.D, cur.D, total.D, true)}
      ${row("E", "LESS 5% tax", 1, prev.tax, cur.tax, total.tax)}
      ${row("E", "LESS RETENTION MONEY", 1, prev.retention, cur.retention, total.retention)}
      ${row("E", "LESS WITHHOLDING TAX", 1, prev.wh, cur.wh, total.wh)}
      ${row("F", "SUB-TOTAL", 1, prev.F, cur.F, total.F, true)}
      ${row("G", "ADVANCE PAYMENT", 2, prev.advance, cur.advance, total.advance)}
      ${row("H", "REPAYMENT OF ADVANCE", 2, prev.repay, cur.repay, total.repay)}
      ${row("I", "BALANCE OF ADVANCE ( G-H )", 2, prev.balanceI, cur.balanceI, total.balanceI)}
      ${row("J", "COMPENSATION COSTS/CLAIMS", 2, prev.J, cur.J, total.J)}
      ${row("K", "INTEREST ON DELAYED PAYMENT", 2, prev.K, cur.K, total.K)}
      ${row("L", "LIQUIDATED DAMAGE", 2, prev.L, cur.L, total.L)}
      ${row("M", "TOTAL OF PAYMENT", 2, M.prev, M.cur, M.total, true)}
      <tr class="ipc-spanrow"><td class="ipc-spanlbl" colspan="3">PREVIOUS CERTIFICATES</td><td class="ipc-num">${fmt(d.previousCertificates)}</td><td class="ipc-rmk"></td></tr>
      <tr class="ipc-spanrow ipc-due"><td class="ipc-spanlbl b" colspan="3">NOW DUE TO CONTRACTOR</td><td class="ipc-num b">${fmt(d.nowDue)}</td><td class="ipc-rmk"></td></tr>
    </tbody></table>
    <table class="ipc-tbl ipc-tbl--sig"><colgroup><col style="width:33.34%"/><col style="width:33.33%"/><col style="width:33.33%"/></colgroup><tbody><tr>
      <td>${sigCell(d.sign.contractor)}</td><td>${sigCell(d.sign.engineer)}</td><td>${sigCell(d.sign.employer)}</td>
    </tr></tbody></table>
  </div>`;
}

/** Per-sheet BOQ line-item detail pages appended after the formal statement. */
function ipcSheetsHtml(cert: PaymentCertificate, currencyCode: string): string {
  const sheets = cert.sheets || [];
  if (!sheets.length) return "";
  return sheets
    .map((sheet) => {
      let bBoq = 0;
      let bCur = 0;
      let bTot = 0;
      const body = sheet.items
        .map((item, i) => {
          const l = paymentLineState(item);
          bBoq += l.boqAmount;
          bCur += l.currentAmount;
          bTot += l.totalAmount;
          return `<tr><td class="dc">${i + 1}</td><td class="dc">${esc(item.billNo || "")}</td><td>${esc(item.description || "")}</td><td class="dc">${esc(item.unit || "")}</td><td class="dn">${fmt(l.boqQty)}</td><td class="dn">${fmt(l.rate)}</td><td class="dn">${fmt(l.boqAmount)}</td><td class="dn">${fmt(l.previousQty)}</td><td class="dn">${fmt(l.currentQty)}</td><td class="dn">${fmt(l.totalQty)}</td><td class="dn">${fmt(l.currentAmount)}</td><td class="dn">${fmt(l.totalAmount)}</td></tr>`;
        })
        .join("");
      return `<div class="ipc-detail">
        <div class="ipc-detail-head"><div class="ipc-detail-title">${esc(sheet.name || "Sheet")}</div><div class="ipc-detail-sub">Certificate detail — quantities and amounts</div></div>
        <table class="ipc-dtbl"><colgroup><col style="width:3%"/><col style="width:8%"/><col style="width:27%"/><col style="width:5%"/><col style="width:8%"/><col style="width:8%"/><col style="width:9%"/><col style="width:7%"/><col style="width:7%"/><col style="width:7%"/><col style="width:10%"/><col style="width:11%"/></colgroup>
        <thead><tr><th>#</th><th>Item No.</th><th>Description</th><th>Unit</th><th>BOQ Qty</th><th>Rate</th><th>BOQ Amount</th><th>Prev Qty</th><th>Curr Qty</th><th>Cum Qty</th><th>Curr Amount</th><th>Cum Amount</th></tr></thead>
        <tbody>${body}</tbody>
        <tfoot><tr><td class="dc" colspan="6">Bill total (${esc(currencyCode)})</td><td class="dn">${fmt(bBoq)}</td><td colspan="3"></td><td class="dn">${fmt(bCur)}</td><td class="dn">${fmt(bTot)}</td></tr></tfoot>
        </table>
      </div>`;
    })
    .join("");
}

/** Full standalone HTML document (for the iframe srcDoc and the print window). */
export function buildIpcFormalHtml(
  cert: PaymentCertificate,
  project: Project | null | undefined,
  signatureProfile?: UserSignatureProfile | null,
  autoPrint = false,
): string {
  const d = buildIpcDocData(cert, project, signatureProfile);
  const detail = ipcSheetsHtml(cert, d.header.currency);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>IPC ${esc(d.header.certificateNo)} — ${esc(d.header.projectTitle)}</title><style>${IPC_DOC_CSS}</style></head><body>${ipcDocInnerHtml(d)}${detail}${autoPrint ? "<script>window.onload=function(){setTimeout(function(){window.print();},250);};</script>" : ""}</body></html>`;
}
