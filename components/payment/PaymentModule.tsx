"use client";

import { useEffect, useState } from "react";
import { Plus, FileText, ArrowLeft, Settings, Trash2, ChevronRight, Pencil, Save } from "lucide-react";
import { useAppStore, currency } from "@/lib/store";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import CertificateSettings from "./CertificateSettings";
import CertificatePrint from "./CertificatePrint";
import type { PaymentCertificate, PaymentCertSheet } from "@/lib/supabase";

/** Format certificate number as IPC 01, IPC 02 etc. */
const formatCertName = (cert: { type: string; number: number }) =>
  cert.type === "final"
    ? `FPC ${cert.number.toString().padStart(2, "0")}`
    : `IPC ${cert.number.toString().padStart(2, "0")}`;

/** Compute per-sheet totals */
const sheetTotals = (sh: PaymentCertSheet) => ({
  boq: sh.items.reduce((s, i) => s + (parseFloat(i.boqAmount) || 0), 0),
  prev: sh.items.reduce((s, i) => s + (parseFloat(i.previousAmount) || 0), 0),
  curr: sh.items.reduce((s, i) => s + (parseFloat(i.currentAmount) || 0), 0),
  total: sh.items.reduce((s, i) => s + (parseFloat(i.totalAmount) || 0), 0),
});

/** Compute grand totals for a certificate */
const certCalcs = (c: PaymentCertificate) => {
  const allItems = c.sheets.flatMap((sh) => sh.items);
  const boqSubTotal = allItems.reduce((s, i) => s + (parseFloat(i.boqAmount) || 0), 0);
  const prevSubTotal = allItems.reduce((s, i) => s + (parseFloat(i.previousAmount) || 0), 0);
  const currSubTotal = allItems.reduce((s, i) => s + (parseFloat(i.currentAmount) || 0), 0);
  const totalSubTotal = allItems.reduce((s, i) => s + (parseFloat(i.totalAmount) || 0), 0);

  const calc = (sub: number) => {
    const cont = (sub * c.contingenciesPercent) / 100;
    const afterCont = sub + cont;
    const gov = (afterCont * c.governmentTaxPercent) / 100;
    const grand = afterCont + gov;
    const ret = (grand * c.retentionPercent) / 100;
    const adv = (grand * c.advancePaymentPercent) / 100;
    const wh = (grand * c.withholdingTaxPercent) / 100;
    const net = grand - ret - adv - wh;
    return { cont, gov, grand, ret, adv, wh, net };
  };

  const boq = calc(boqSubTotal);
  const prev = calc(prevSubTotal);
  const curr = calc(currSubTotal);
  const total = calc(totalSubTotal);

  return {
    boqSubTotal, prevSubTotal, currSubTotal, totalSubTotal,
    boq, prev, curr, total,
  };
};

const statusColor = (status: PaymentCertificate["status"]) =>
  status === "paid" ? "ok" : status === "approved" ? "ok" : status === "submitted" ? "accent" : "warn";

const commercialSummary = (certs: PaymentCertificate[]) =>
  certs.reduce(
    (summary, cert) => {
      const calc = certCalcs(cert);
      summary.netCertified += calc.total.net;
      summary.retentionHeld += calc.total.ret;
      if (cert.status === "submitted") summary.submitted += calc.total.net;
      if (cert.status === "approved") summary.approved += calc.total.net;
      if (cert.status === "paid") summary.paid += calc.total.net;
      return summary;
    },
    { netCertified: 0, retentionHeld: 0, submitted: 0, approved: 0, paid: 0 }
  );

export default function PaymentModule() {
  const {
    certificates,
    addCertificate,
    updateCertItem,
    updateCertSettings,
    deleteCertificate,
    savedBOQs,
    project,
  } = useAppStore();

  const [activeCertId, setActiveCertId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [activeSheetIdx, setActiveSheetIdx] = useState(-1); // -1 = Summary tab
  const [selectedPrevCertId, setSelectedPrevCertId] = useState<string>(""); // "" = None
  const [selectedBOQId, setSelectedBOQId] = useState<string>("");

  const projectCerts = certificates.filter((c) => c.project_id === project?.id);
  const cert = projectCerts.find((c) => c.id === activeCertId);
  const boqOptions = savedBOQs.filter((b) =>
    b.project_id === project?.id &&
    b.sheets.some((s) => s.rows.some((r) => r.type === "item" && r.description))
  );
  const hasBOQItems = boqOptions.length > 0;
  const selectedBOQ = boqOptions.find((b) => b.id === selectedBOQId) || null;
  const allSheets = selectedBOQ?.sheets || [];
  const previousCertOptions = projectCerts.filter(
    (c) => !selectedBOQId || c.boqId === selectedBOQId || !c.boqId
  );
  const d = cert ? certCalcs(cert) : null;
  const fmt = (v: number) => currency(v);
  const summary = commercialSummary(projectCerts);

  useEffect(() => {
    if (!showNew) return;
    if (!selectedBOQId && boqOptions.length > 0) {
      setSelectedBOQId(boqOptions[0].id);
    }
  }, [showNew, selectedBOQId, boqOptions]);

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold tracking-tight">Payment Certificates</h2>
          <p className="text-xs text-txt-muted mt-0.5">FIDIC-compliant interim & final payment certificates</p>
        </div>
        {!activeCertId && (
          <Button variant="primary" size="sm" onClick={() => setShowNew(true)} disabled={!hasBOQItems}>
            <Plus size={14} /> New Certificate
          </Button>
        )}
      </div>

      {/* ═══════════════════ LIST VIEW ═══════════════════ */}
      {!activeCertId && (
        <>
          {projectCerts.length > 0 && (
            <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {[
                { label: "Net Certified", value: summary.netCertified, color: "accent" },
                { label: "Submitted", value: summary.submitted, color: "warn" },
                { label: "Approved", value: summary.approved, color: "accent" },
                { label: "Paid", value: summary.paid, color: "ok" },
                { label: "Retention Held", value: summary.retentionHeld, color: "err" },
              ].map((card) => (
                <div key={card.label} className="bg-bg-surface border border-border rounded-xl p-4">
                  <div className="text-[10px] uppercase tracking-wider text-txt-dim mb-2">{card.label}</div>
                  <div className="text-lg font-bold font-mono">$ {fmt(card.value)}</div>
                  <Badge color={card.color as any} className="mt-3">
                    Commercial Snapshot
                  </Badge>
                </div>
              ))}
            </div>
          )}

          {projectCerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-20 h-20 rounded-2xl bg-accent/10 flex items-center justify-center mb-5">
                <FileText size={32} className="text-accent opacity-60" />
              </div>
              <p className="text-txt-muted text-sm font-medium">No payment certificates yet</p>
              <p className="text-xs text-txt-dim mt-1.5 max-w-[280px] text-center">
                {hasBOQItems ? "Create your first FIDIC payment certificate to start tracking payments" : "Add items to your BOQ first, then create certificates"}
              </p>
              {hasBOQItems && (
                <Button variant="primary" size="md" className="mt-5" onClick={() => setShowNew(true)}>
                  <Plus size={14} /> Create First Certificate
                </Button>
              )}
            </div>
              ) : (
            <div className="flex flex-col gap-2.5">
              <div className="hidden overflow-auto border border-border rounded-xl bg-bg-surface xl:block">
                <table className="w-full border-collapse" style={{ minWidth: 880 }}>
                  <thead>
                    <tr>
                      {["Cert", "Date", "Status", "Net Amount", "Retention", "Source BOQ", "Sheets"].map((heading) => (
                        <th
                          key={heading}
                          className="text-left px-4 py-3 text-[11px] uppercase tracking-wider text-txt-dim border-b border-border"
                        >
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {projectCerts.map((c) => {
                      const calc = certCalcs(c);
                      return (
                        <tr
                          key={`${c.id}-ledger`}
                          onClick={() => {
                            setActiveCertId(c.id);
                            setIsEditMode(false);
                            setActiveSheetIdx(-1);
                          }}
                          className="hover:bg-bg-hover transition-colors cursor-pointer"
                        >
                          <td className="px-4 py-3 border-b border-border font-semibold">{formatCertName(c)}</td>
                          <td className="px-4 py-3 border-b border-border text-sm text-txt-muted">{c.date}</td>
                          <td className="px-4 py-3 border-b border-border">
                            <Badge color={statusColor(c.status)}>{c.status.toUpperCase()}</Badge>
                          </td>
                          <td className="px-4 py-3 border-b border-border font-mono">$ {fmt(calc.total.net)}</td>
                          <td className="px-4 py-3 border-b border-border font-mono text-err">$ {fmt(calc.total.ret)}</td>
                          <td className="px-4 py-3 border-b border-border text-sm text-txt-muted">{c.boqName || "—"}</td>
                          <td className="px-4 py-3 border-b border-border text-sm text-txt-muted">{c.sheets.length}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="space-y-2.5 xl:hidden">
              {projectCerts.map((c, idx) => {
                const ct = certCalcs(c);
                return (
                  <div
                    key={c.id}
                    onClick={() => { setActiveCertId(c.id); setIsEditMode(false); setActiveSheetIdx(-1); }}
                    className="group flex flex-col gap-3 p-4 bg-bg-surface border border-border rounded-xl cursor-pointer transition-all duration-200 hover:border-accent/50 hover:shadow-lg hover:shadow-accent/5 sm:flex-row sm:items-center sm:justify-between"
                    style={{ animationDelay: `${idx * 60}ms`, animationFillMode: "both" }}
                  >
                    <div className="flex min-w-0 items-center gap-4">
                      <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-accent/20 to-accent/5 flex items-center justify-center flex-shrink-0">
                        <span className="text-accent font-bold font-mono text-base">{c.number.toString().padStart(2, "0")}</span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm">{formatCertName(c)}</span>
                        </div>
                        <div className="flex gap-2 mt-1.5">
                          <Badge color={c.type === "final" ? "ok" : "accent"}>{c.type.toUpperCase()}</Badge>
                          <Badge color={statusColor(c.status)}>{c.status.toUpperCase()}</Badge>
                          <span className="text-[10px] text-txt-dim self-center">{c.sheets.length} sheet{c.sheets.length !== 1 ? "s" : ""}</span>
                          <span className="text-[10px] text-txt-dim self-center">{c.date}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-4 sm:justify-start">
                      <div className="text-right">
                        <div className="text-[10px] text-txt-dim uppercase tracking-wider">Net Amount</div>
                        <div className="font-mono text-sm font-bold mt-0.5 text-ok">$ {fmt(ct.total.net)}</div>
                      </div>
                      <ChevronRight size={16} className="text-txt-dim group-hover:text-accent transition-colors" />
                    </div>
                  </div>
                );
              })}
              </div>
            </div>
          )}
        </>
      )}

      {/* ═══════════════════ DETAIL VIEW ═══════════════════ */}
      {cert && d && (
        <div>
          {/* Top Bar */}
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm" variant="ghost" onClick={() => { setActiveCertId(null); setIsEditMode(false); }}>
                <ArrowLeft size={14} /> Back
              </Button>
              <div className="h-5 w-px bg-border" />
              <h3 className="text-sm font-bold">{formatCertName(cert)}</h3>
              <Badge color={statusColor(cert.status)}>
                {cert.status.toUpperCase()}
              </Badge>
              {!isEditMode && (
                <span className="text-[10px] text-txt-dim bg-bg-raised px-2 py-0.5 rounded-full border border-border">VIEW MODE</span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <CertificatePrint cert={cert} projectName={project?.name || "Project"} />
              {isEditMode ? (
                <>
                  <Button size="sm" variant="default" onClick={() => setShowSettings(true)}><Settings size={14} /> Settings</Button>
                  <Button size="sm" variant="danger" onClick={() => setShowDeleteConfirm(true)}><Trash2 size={14} /></Button>
                  <Button size="sm" variant="primary" onClick={() => setIsEditMode(false)}><Save size={14} /> Done</Button>
                </>
              ) : (
                <Button size="sm" variant="primary" onClick={() => setIsEditMode(true)}><Pencil size={14} /> Edit</Button>
              )}
            </div>
          </div>

          {/* Certificate Title */}
          <div className="bg-bg-surface border border-border rounded-xl p-4 mb-4 text-center">
            <div className="text-[10px] text-txt-dim uppercase tracking-[0.2em] mb-1">Summary Bills of Quantities</div>
            <div className="text-sm font-bold tracking-tight">{project?.name?.toUpperCase() || "PROJECT"}</div>
            <div className="text-xs text-txt-muted mt-1">Date: {cert.date}</div>
          </div>

          {/* ════ SHEET TABS ════ */}
          <div className="flex items-center gap-1 mb-3 border-b border-border overflow-x-auto">
            <button
              className={`px-4 py-2 text-xs font-semibold border-b-2 transition-all whitespace-nowrap cursor-pointer bg-transparent
                ${activeSheetIdx === -1 ? "border-b-accent text-accent" : "border-b-transparent text-txt-dim hover:text-txt"}`}
              onClick={() => setActiveSheetIdx(-1)}
            >
              📊 Summary
            </button>
            {cert.sheets.map((sh, i) => (
              <button
                key={sh.id}
                className={`px-4 py-2 text-xs font-medium border-b-2 transition-all whitespace-nowrap cursor-pointer bg-transparent
                  ${activeSheetIdx === i ? "border-b-accent text-accent" : "border-b-transparent text-txt-dim hover:text-txt"}`}
                onClick={() => setActiveSheetIdx(i)}
              >
                {sh.name}
              </button>
            ))}
          </div>

          {/* ════ SUMMARY TAB ════ */}
          {activeSheetIdx === -1 && (
            <>
            <div className="space-y-3 xl:hidden">
              {cert.sheets.map((sh, i) => {
                const t = sheetTotals(sh);
                return (
                  <button
                    key={`${sh.id}-summary-card`}
                    type="button"
                    onClick={() => setActiveSheetIdx(i)}
                    className="w-full rounded-2xl border border-border bg-bg-surface p-4 text-left transition hover:border-accent/50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-txt-dim">Bill {i + 1}</div>
                        <div className="mt-1 text-sm font-semibold text-txt">{sh.name}</div>
                      </div>
                      <ChevronRight size={16} className="text-txt-dim" />
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-xl border border-border bg-bg-raised/50 p-3">
                        <div className="text-[10px] uppercase tracking-[0.14em] text-txt-dim">BOQ</div>
                        <div className="mt-1 font-mono font-bold text-txt">{fmt(t.boq)}</div>
                      </div>
                      <div className="rounded-xl border border-border bg-bg-raised/50 p-3">
                        <div className="text-[10px] uppercase tracking-[0.14em] text-txt-dim">Current</div>
                        <div className="mt-1 font-mono font-bold text-accent">$ {fmt(t.curr)}</div>
                      </div>
                      <div className="rounded-xl border border-border bg-bg-raised/50 p-3">
                        <div className="text-[10px] uppercase tracking-[0.14em] text-txt-dim">Previous</div>
                        <div className="mt-1 font-mono font-bold text-txt-muted">$ {fmt(t.prev)}</div>
                      </div>
                      <div className="rounded-xl border border-border bg-bg-raised/50 p-3">
                        <div className="text-[10px] uppercase tracking-[0.14em] text-txt-dim">Total</div>
                        <div className="mt-1 font-mono font-bold text-ok">$ {fmt(t.total)}</div>
                      </div>
                    </div>
                  </button>
                );
              })}
              <div className="rounded-2xl border border-ok/25 bg-ok/10 p-4">
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-txt-dim">Final Net Amount</div>
                <div className="mt-2 font-mono text-xl font-black text-ok">$ {fmt(d.total.net)}</div>
              </div>
            </div>
            <div className="hidden overflow-auto border border-border rounded-xl xl:block" style={{ maxHeight: "calc(100vh - 420px)" }}>
              <table className="border-collapse w-full" style={{ minWidth: 900 }}>
                <thead>
                  <tr>
                    <th rowSpan={2} className="px-3 py-2.5 bg-bg-raised border-b-2 border-b-accent border-r border-r-border text-[10px] font-semibold uppercase tracking-wider text-txt-dim sticky top-0 z-10 w-[60px] text-center">Bill No.</th>
                    <th rowSpan={2} className="px-3 py-2.5 bg-bg-raised border-b-2 border-b-accent border-r border-r-border text-[10px] font-semibold uppercase tracking-wider text-txt-dim sticky top-0 z-10 text-left min-w-[220px]">Description</th>
                    <th className="px-3 py-1 bg-bg-raised border-b border-b-border border-r border-r-border text-[9px] font-bold text-center text-txt-dim sticky top-0 z-10">1</th>
                    <th className="px-3 py-1 bg-bg-raised border-b border-b-border border-r border-r-border text-[9px] font-bold text-center text-txt-dim sticky top-0 z-10">2</th>
                    <th className="px-3 py-1 bg-bg-raised border-b border-b-border border-r border-r-border text-[9px] font-bold text-center text-txt-dim sticky top-0 z-10">3</th>
                    <th className="px-3 py-1 bg-bg-raised border-b border-b-border text-[9px] font-bold text-center text-txt-dim sticky top-0 z-10">4</th>
                  </tr>
                  <tr>
                    <th className="px-3 py-2 bg-bg-raised border-b-2 border-b-accent border-r border-r-border text-[10px] font-semibold uppercase tracking-wider text-txt-dim sticky top-[25px] z-10 text-center w-[130px]">BoQ Amount (USD)</th>
                    <th className="px-3 py-2 bg-bg-raised border-b-2 border-b-accent border-r border-r-border text-[10px] font-semibold uppercase tracking-wider text-txt-dim sticky top-[25px] z-10 text-center w-[140px]">Previous Amount (USD)</th>
                    <th className="px-3 py-2 bg-bg-raised border-b-2 border-b-accent border-r border-r-border text-[10px] font-semibold uppercase tracking-wider text-txt-dim sticky top-[25px] z-10 text-center w-[140px]">Current Amount (USD)</th>
                    <th className="px-3 py-2 bg-bg-raised border-b-2 border-b-accent text-[10px] font-semibold uppercase tracking-wider text-txt-dim sticky top-[25px] z-10 text-center w-[140px]">Total Amount (USD)</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Per-sheet summary rows */}
                  {cert.sheets.map((sh, i) => {
                    const t = sheetTotals(sh);
                    return (
                      <tr key={sh.id} className="hover:bg-bg-hover transition-colors cursor-pointer" onClick={() => setActiveSheetIdx(i)}>
                        <td className="px-3 h-[36px] border-r border-r-border border-b border-b-border text-xs text-center font-semibold text-txt-muted">{i + 1}</td>
                        <td className="px-3 h-[36px] border-r border-r-border border-b border-b-border text-xs">{sh.name}</td>
                        <td className="px-3 h-[36px] border-r border-r-border border-b border-b-border text-xs text-right font-mono">{currency(t.boq)}</td>
                        <td className="px-3 h-[36px] border-r border-r-border border-b border-b-border text-xs text-right font-mono">$ {currency(t.prev)}</td>
                        <td className="px-3 h-[36px] border-r border-r-border border-b border-b-border text-xs text-right font-mono">$ {currency(t.curr)}</td>
                        <td className="px-3 h-[36px] border-b border-b-border text-xs text-right font-mono font-semibold">$ {currency(t.total)}</td>
                      </tr>
                    );
                  })}

                  {/* Sub-Total */}
                  <tr className="row-subtotal">
                    <td className="px-3 py-2.5 border-r border-r-border border-b border-b-border" />
                    <td className="px-3 py-2.5 border-r border-r-border border-b border-b-border text-xs font-bold">Sub - Total</td>
                    <td className="px-3 py-2.5 border-r border-r-border border-b border-b-border text-xs text-right font-mono font-bold">{fmt(d.boqSubTotal)}</td>
                    <td className="px-3 py-2.5 border-r border-r-border border-b border-b-border text-xs text-right font-mono font-semibold">{fmt(d.prevSubTotal)}</td>
                    <td className="px-3 py-2.5 border-r border-r-border border-b border-b-border text-xs text-right font-mono font-semibold">{fmt(d.currSubTotal)}</td>
                    <td className="px-3 py-2.5 border-b border-b-border text-xs text-right font-mono font-bold">{fmt(d.totalSubTotal)}</td>
                  </tr>

                  {/* Contingencies */}
                  <tr className="bg-bg-surface/50">
                    <td className="px-3 py-2 border-r border-r-border border-b border-b-border" />
                    <td className="px-3 py-2 border-r border-r-border border-b border-b-border text-xs text-txt-muted italic">Add {cert.contingenciesPercent}% Contingencies</td>
                    <td className="px-3 py-2 border-r border-r-border border-b border-b-border text-xs text-right font-mono text-txt-muted">{fmt(d.boq.cont)}</td>
                    <td className="px-3 py-2 border-r border-r-border border-b border-b-border" />
                    <td className="px-3 py-2 border-r border-r-border border-b border-b-border" />
                    <td className="px-3 py-2 border-b border-b-border" />
                  </tr>

                  {/* Government Tax */}
                  <tr className="bg-bg-surface/50">
                    <td className="px-3 py-2 border-r border-r-border border-b border-b-border" />
                    <td className="px-3 py-2 border-r border-r-border border-b border-b-border text-xs text-txt-muted italic">Add {cert.governmentTaxPercent}% Government Tax</td>
                    <td className="px-3 py-2 border-r border-r-border border-b border-b-border text-xs text-right font-mono text-txt-muted">{fmt(d.boq.gov)}</td>
                    <td className="px-3 py-2 border-r border-r-border border-b border-b-border text-xs text-right font-mono text-txt-muted">{fmt(d.prev.gov)}</td>
                    <td className="px-3 py-2 border-r border-r-border border-b border-b-border text-xs text-right font-mono text-txt-muted">{fmt(d.curr.gov)}</td>
                    <td className="px-3 py-2 border-b border-b-border text-xs text-right font-mono text-txt-muted">{fmt(d.total.gov)}</td>
                  </tr>

                  {/* Grand Total */}
                  <tr className="row-grandtotal">
                    <td className="px-3 py-3 border-r border-r-border border-b-2 border-b-accent border-t-2 border-t-accent" />
                    <td className="px-3 py-3 border-r border-r-border border-b-2 border-b-accent border-t-2 border-t-accent text-xs font-bold">Grand Total</td>
                    <td className="px-3 py-3 border-r border-r-border border-b-2 border-b-accent border-t-2 border-t-accent text-xs text-right font-mono font-bold">{fmt(d.boq.grand)}</td>
                    <td className="px-3 py-3 border-r border-r-border border-b-2 border-b-accent border-t-2 border-t-accent text-xs text-right font-mono font-bold">$ {fmt(d.prev.grand)}</td>
                    <td className="px-3 py-3 border-r border-r-border border-b-2 border-b-accent border-t-2 border-t-accent text-xs text-right font-mono font-bold">$ {fmt(d.curr.grand)}</td>
                    <td className="px-3 py-3 border-b-2 border-b-accent border-t-2 border-t-accent text-xs text-right font-mono font-bold">$ {fmt(d.total.grand)}</td>
                  </tr>

                  {/* Deductions */}
                  {[
                    { label: `Less Retention = ${cert.retentionPercent}%`, prev: d.prev.ret, curr: d.curr.ret, total: d.total.ret },
                    { label: `Less Advance Payment = ${cert.advancePaymentPercent}%`, prev: d.prev.adv, curr: d.curr.adv, total: d.total.adv },
                    { label: `Less Withholding Tax = ${cert.withholdingTaxPercent}%`, prev: d.prev.wh, curr: d.curr.wh, total: d.total.wh },
                  ].map((row, i) => (
                    <tr key={i} className="hover:bg-bg-hover transition-colors">
                      <td className="px-3 py-2 border-r border-r-border border-b border-b-border" />
                      <td className="px-3 py-2 border-r border-r-border border-b border-b-border text-xs text-err">{row.label}</td>
                      <td className="px-3 py-2 border-r border-r-border border-b border-b-border" />
                      <td className="px-3 py-2 border-r border-r-border border-b border-b-border text-xs text-right font-mono text-err">$ {fmt(row.prev)}</td>
                      <td className="px-3 py-2 border-r border-r-border border-b border-b-border text-xs text-right font-mono text-err">$ {fmt(row.curr)}</td>
                      <td className="px-3 py-2 border-b border-b-border text-xs text-right font-mono text-err">$ {fmt(row.total)}</td>
                    </tr>
                  ))}

                  {/* Final Net */}
                  <tr>
                    <td className="px-3 py-3 border-r border-r-border border-t-2 border-t-ok bg-ok/5" />
                    <td className="px-3 py-3 border-r border-r-border border-t-2 border-t-ok bg-ok/5 text-xs font-bold text-ok">Final Net Amount</td>
                    <td className="px-3 py-3 border-r border-r-border border-t-2 border-t-ok bg-ok/5" />
                    <td className="px-3 py-3 border-r border-r-border border-t-2 border-t-ok bg-ok/5 text-xs text-right font-mono font-bold">$ {fmt(d.prev.net)}</td>
                    <td className="px-3 py-3 border-r border-r-border border-t-2 border-t-ok bg-ok/5 text-xs text-right font-mono font-bold">$ {fmt(d.curr.net)}</td>
                    <td className="px-3 py-3 border-t-2 border-t-ok bg-ok/5 text-xs text-right font-mono font-bold text-ok">$ {fmt(d.total.net)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            </>
          )}

          {/* ════ DETAIL SHEET TAB ════ */}
          {activeSheetIdx >= 0 && cert.sheets[activeSheetIdx] && (() => {
            const sh = cert.sheets[activeSheetIdx];
            return (
              <>
              <div className="space-y-3 xl:hidden">
                {sh.items.map((item, i) => (
                  <div key={`${item.id}-compact`} className="rounded-2xl border border-border bg-bg-surface p-4">
                    <div className="mb-3">
                      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-txt-dim">
                        Item {i + 1} {item.billNo ? `• ${item.billNo}` : ""}
                      </div>
                      <div className="mt-1 text-sm font-semibold text-txt">{item.description}</div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-xl border border-border bg-bg-raised/50 p-3">
                        <div className="text-[10px] uppercase tracking-[0.14em] text-txt-dim">BOQ Qty</div>
                        <div className="mt-1 font-mono font-bold text-txt">{currency(item.boqQty)} {item.unit}</div>
                      </div>
                      <div className="rounded-xl border border-border bg-bg-raised/50 p-3">
                        <div className="text-[10px] uppercase tracking-[0.14em] text-txt-dim">BOQ Amt</div>
                        <div className="mt-1 font-mono font-bold text-txt-muted">{currency(item.boqAmount)}</div>
                      </div>
                      <div className="rounded-xl border border-border bg-bg-raised/50 p-3">
                        <div className="text-[10px] uppercase tracking-[0.14em] text-txt-dim">Previous</div>
                        <div className="mt-1 font-mono font-bold text-txt-muted">$ {currency(item.previousAmount)}</div>
                      </div>
                      <label className="rounded-xl border border-accent/30 bg-accent/5 p-3">
                        <span className="block text-[10px] uppercase tracking-[0.14em] text-txt-dim">Total Qty</span>
                        {isEditMode ? (
                          <input
                            value={item.totalQty}
                            onChange={(e) => updateCertItem(cert.id, sh.id, item.id, "totalQty", e.target.value)}
                            className="mt-1 w-full rounded-lg border border-border bg-bg-input px-2 py-1 text-right font-mono text-sm text-txt outline-none focus:border-accent"
                          />
                        ) : (
                          <div className="mt-1 font-mono font-bold text-accent">{currency(item.totalQty)}</div>
                        )}
                      </label>
                    </div>
                    <div className="mt-3 rounded-xl border border-border bg-bg-raised/50 px-3 py-2 text-right font-mono text-sm font-bold text-ok">
                      $ {currency(item.totalAmount)}
                    </div>
                  </div>
                ))}
              </div>
              <div className="hidden overflow-auto border border-border rounded-xl xl:block" style={{ maxHeight: "calc(100vh - 425px)" }}>
                <table className="border-collapse w-full text-[11px]" style={{ minWidth: 1200 }}>
                  <thead>
                    <tr className="bg-bg-raised">
                      <th colSpan={4} className="px-3 py-1 border-b border-r border-r-border text-[9px] font-bold uppercase tracking-tighter text-txt-dim text-center">Reference Info</th>
                      <th colSpan={3} className="px-3 py-1 border-b border-r border-r-border text-[9px] font-bold uppercase tracking-tighter text-txt-dim text-center bg-bg-raised/50">Contract BOQ</th>
                      <th className="px-3 py-1 border-b border-r border-r-border text-[9px] font-bold uppercase tracking-tighter text-txt-dim text-center">Previous</th>
                      <th className="px-3 py-1 border-b border-r border-r-border text-[9px] font-bold uppercase tracking-tighter text-txt-dim text-center">Current Period</th>
                      <th colSpan={2} className="px-3 py-1 border-b text-[9px] font-bold uppercase tracking-tighter text-txt-dim text-center bg-accent/5">Total to Date (Measured)</th>
                    </tr>
                    <tr>
                      <th className="px-2 py-2 bg-bg-raised border-b-2 border-b-accent border-r border-r-border font-semibold uppercase sticky top-0 z-10 w-[40px] text-center">#</th>
                      <th className="px-2 py-2 bg-bg-raised border-b-2 border-b-accent border-r border-r-border font-semibold uppercase sticky top-0 z-10 w-[70px] text-center">Item No.</th>
                      <th className="px-2 py-2 bg-bg-raised border-b-2 border-b-accent border-r border-r-border font-semibold uppercase sticky top-0 z-10 text-left min-w-[180px]">Description</th>
                      <th className="px-2 py-2 bg-bg-raised border-b-2 border-b-accent border-r border-r-border font-semibold uppercase sticky top-0 z-10 text-center w-[50px]">Unit</th>
                      
                      <th className="px-2 py-2 bg-bg-raised border-b-2 border-b-accent border-r border-r-border font-semibold uppercase sticky top-0 z-10 text-right w-[80px]">BOQ Qty</th>
                      <th className="px-2 py-2 bg-bg-raised border-b-2 border-b-accent border-r border-r-border font-semibold uppercase sticky top-0 z-10 text-right w-[80px]">Rate</th>
                      <th className="px-2 py-2 bg-bg-raised border-b-2 border-b-accent border-r border-r-border font-semibold uppercase sticky top-0 z-10 text-right w-[100px]">BOQ Amt</th>

                      <th className="px-2 py-2 bg-bg-raised border-b-2 border-b-accent border-r border-r-border font-semibold uppercase sticky top-0 z-10 text-right w-[100px]">Prev Amt</th>
                      <th className="px-2 py-2 bg-bg-raised border-b-2 border-b-accent border-r border-r-border font-semibold uppercase sticky top-0 z-10 text-right w-[110px]">Curr Amt</th>
                      
                      <th className="px-2 py-2 bg-bg-raised border-b-2 border-b-accent border-r border-r-border font-semibold uppercase sticky top-0 z-10 text-right w-[90px] bg-accent/5">Total Qty</th>
                      <th className="px-2 py-2 bg-bg-raised border-b-2 border-b-accent font-semibold uppercase sticky top-0 z-10 text-right w-[110px] bg-accent/5">Total Amt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sh.items.map((item, i) => (
                      <tr key={item.id} className="hover:bg-bg-hover transition-colors group">
                        <td className="px-2 h-[34px] border-r border-r-border border-b border-b-border text-[10px] text-center text-txt-dim">{i + 1}</td>
                        <td className="px-2 h-[34px] border-r border-r-border border-b border-b-border text-center font-mono text-txt-muted">{item.billNo}</td>
                        <td className="px-2 h-[34px] border-r border-r-border border-b border-b-border truncate max-w-[250px]" title={item.description}>{item.description}</td>
                        <td className="px-2 h-[34px] border-r border-r-border border-b border-b-border text-center text-txt-dim uppercase">{item.unit}</td>
                        
                        <td className="px-2 h-[34px] border-r border-r-border border-b border-b-border text-right font-mono text-txt-muted">{currency(item.boqQty)}</td>
                        <td className="px-2 h-[34px] border-r border-r-border border-b border-b-border text-right font-mono text-txt-muted">{currency(item.boqRate)}</td>
                        <td className="px-2 h-[34px] border-r border-r-border border-b border-b-border text-right font-mono text-txt-muted bg-bg-raised/30">{currency(item.boqAmount)}</td>

                        <td className="px-2 h-[34px] border-r border-r-border border-b border-b-border text-right font-mono text-txt-muted">$ {currency(item.previousAmount)}</td>
                        <td className="px-2 h-[34px] border-r border-r-border border-b border-b-border text-right font-mono text-txt-dim font-medium italic">
                          $ {currency(item.currentAmount)}
                        </td>

                        <td className="px-1 h-[34px] border-r border-r-border border-b border-b-border text-right font-mono bg-accent/5">
                          {isEditMode ? (
                            <input
                              value={item.totalQty}
                              onChange={(e) => updateCertItem(cert.id, sh.id, item.id, "totalQty", e.target.value)}
                              className="w-full h-full px-2 py-1 bg-transparent border-none outline-none text-right font-mono text-txt focus:bg-accent/10 focus:ring-1 focus:ring-accent transition-all animate-pulse-subtle"
                              placeholder="0.00"
                            />
                          ) : (
                            <span className="block px-2 font-bold">{currency(item.totalQty)}</span>
                          )}
                        </td>
                        <td className="px-2 h-[34px] border-b border-b-border text-right font-mono font-bold bg-accent/5 text-accent">
                          $ {currency(item.totalAmount)}
                        </td>
                      </tr>
                    ))}

                    {/* Sheet total row */}
                    {(() => {
                      const t = sheetTotals(sh);
                      return (
                        <tr className="row-subtotal">
                          <td colSpan={4} className="px-3 py-2.5 border-r border-r-border border-t-2 border-t-accent text-xs font-bold">Sheet Total — {sh.name}</td>
                          <td colSpan={3} className="px-2 py-2.5 border-r border-r-border border-t-2 border-t-accent text-right font-mono font-bold bg-bg-raised/30">{currency(t.boq)}</td>
                          <td className="px-2 py-2.5 border-r border-r-border border-t-2 border-t-accent text-right font-mono font-bold">$ {currency(t.prev)}</td>
                          <td className="px-2 py-2.5 border-r border-r-border border-t-2 border-t-accent text-right font-mono font-bold text-txt-dim italic">$ {currency(t.curr)}</td>
                          <td colSpan={2} className="px-2 py-2.5 border-t-2 border-t-accent text-right font-mono font-bold bg-accent/10 text-accent">
                            $ {currency(t.total)}
                          </td>
                        </tr>
                      );
                    })()}
                  </tbody>
                </table>
              </div>
              </>
            );
          })()}

          {/* ════ SIGNATURE SECTION (only on Summary) ════ */}
          {activeSheetIdx === -1 && (
            <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
              {[
                { heading: "Prepared by", role: "Contractor", titleField: cert.contractorTitle, nameField: cert.contractorName, org: cert.contractorCompany },
                { heading: "Rates and quantities confirmed by", role: cert.engineerOrg || "Engineer", titleField: cert.engineerTitle, nameField: cert.engineerName, org: "", note: "Confirmed that the above rates and quantities are correct." },
                { heading: "Checked by", role: "Employer", titleField: cert.employerTitle, nameField: cert.employerName, org: cert.employerOrg },
              ].map((s, i) => (
                <div key={i} className="bg-bg-surface border border-border rounded-xl p-4">
                  <div className="text-[10px] uppercase tracking-wider text-txt-dim font-semibold text-center mb-3 pb-2 border-b border-border">{s.heading}</div>
                  <div className="text-xs font-bold text-center mb-3">{s.role}</div>
                  <div className="space-y-2">
                    <div><span className="text-[10px] text-txt-dim">Signed:</span><div className="border-b border-border/60 mt-4 mb-2" /></div>
                    <div><span className="text-[10px] text-txt-dim">{s.titleField}:</span><span className="text-xs font-semibold ml-1">{s.nameField || "—"}</span></div>
                    {s.org && <div className="text-xs text-txt-muted">{s.org}</div>}
                    {s.note && <div className="text-xs text-txt-muted italic">{s.note}</div>}
                    <div><span className="text-[10px] text-txt-dim">Date:</span><div className="border-b border-border/60 mt-3" /></div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Settings Modal */}
          {showSettings && (
            <CertificateSettings open={showSettings} onClose={() => setShowSettings(false)} cert={cert} onSave={(settings) => updateCertSettings(cert.id, settings)} />
          )}

          {/* Delete Confirm */}
          <Modal open={showDeleteConfirm} onClose={() => setShowDeleteConfirm(false)} title="Delete Certificate" width={400}>
            <p className="text-sm text-txt-muted mb-5">
              Are you sure you want to delete <strong>{formatCertName(cert)}</strong>? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <Button variant="ghost" className="flex-1 justify-center" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
              <Button variant="danger" className="flex-1 justify-center" onClick={() => { deleteCertificate(cert.id); setActiveCertId(null); setShowDeleteConfirm(false); setIsEditMode(false); }}>
                <Trash2 size={14} /> Delete
              </Button>
            </div>
          </Modal>
        </div>
      )}

      {/* ═══════════════════ NEW CERTIFICATE MODAL ═══════════════════ */}
      <Modal open={showNew} onClose={() => setShowNew(false)} title="New Payment Certificate" width={520}>
        <p className="text-sm text-txt-muted mb-4">Create a FIDIC-compliant payment certificate. Bill items will be auto-populated from your BOQ sheets, and previous amounts carried forward.</p>
        
        <div className="space-y-4">
          <div className="bg-bg-raised rounded-lg p-3 border border-border">
            <div className="text-[10px] uppercase tracking-wider text-txt-dim mb-3 font-semibold">1. Select BOQ</div>
            <div className="relative">
              <select
                value={selectedBOQId}
                onChange={(e) => {
                  setSelectedBOQId(e.target.value);
                  setSelectedPrevCertId("");
                }}
                className="w-full h-10 px-3 py-2 bg-bg-surface border border-border rounded-lg text-sm appearance-none outline-none focus:ring-2 focus:ring-accent/50 transition-all font-medium cursor-pointer"
              >
                <option value="" disabled>
                  Select BOQ to create certificate from
                </option>
                {boqOptions.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-txt-muted opacity-50">
                <ChevronRight size={14} className="rotate-90" />
              </div>
            </div>
            <p className="text-[10px] text-txt-muted mt-2 italic">
              Certificate sheets and bill items will be loaded only from the selected BOQ.
            </p>
          </div>

          <div className="bg-bg-raised rounded-lg p-3 border border-border">
            <div className="text-[10px] uppercase tracking-wider text-txt-dim mb-3 font-semibold">2. Link Previous Certificate (IPC)</div>
            <div className="relative">
              <select 
                value={selectedPrevCertId} 
                onChange={(e) => setSelectedPrevCertId(e.target.value)}
                className="w-full h-10 px-3 py-2 bg-bg-surface border border-border rounded-lg text-sm appearance-none outline-none focus:ring-2 focus:ring-accent/50 transition-all font-medium cursor-pointer"
              >
                <option value="">None (Start from zero / First IPC)</option>
                {previousCertOptions.sort((a, b) => b.number - a.number).map((c) => (
                  <option key={c.id} value={c.id}>
                    {formatCertName(c)} — {c.date} (Net: $ {currency(certCalcs(c).total.net)})
                  </option>
                ))}
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-txt-muted opacity-50">
                <ChevronRight size={14} className="rotate-90" />
              </div>
            </div>
            <p className="text-[10px] text-txt-muted mt-2 italic">
              Linking a previous IPC will automatically populate the "Previous" column with cumulative totals to date.
            </p>
          </div>

          <div className="bg-bg-raised rounded-lg p-3 border border-border">
            <div className="text-[10px] uppercase tracking-wider text-txt-dim mb-2 font-semibold">
              3. Sheets to include (from {selectedBOQ?.name || "selected BOQ"})
            </div>
            <div className="max-h-[140px] overflow-auto pr-1">
              {allSheets.length === 0 && (
                <div className="text-xs text-txt-dim py-2">Select a BOQ to preview included sheets.</div>
              )}
              {allSheets.map((sh, i) => {
                const total = sh.rows.filter((r) => r.type === "item").reduce((s, r) => s + (parseFloat(r.qty) || 0) * (parseFloat(r.rate) || 0), 0);
                return (
                  <div key={sh.id} className="flex items-center justify-between py-1.5 text-xs text-txt-muted">
                    <span><span className="font-mono font-semibold text-txt mr-2">{i + 1}</span>{sh.name}</span>
                    <span className="font-mono opacity-60">{currency(total)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <Button variant="primary" className="flex-1 justify-center h-10" disabled={!selectedBOQId} onClick={() => {
            addCertificate("interim", selectedBOQId, selectedPrevCertId || null); setShowNew(false);
            setTimeout(() => { const state = useAppStore.getState(); const last = state.certificates[state.certificates.length - 1]; if (last) { setActiveCertId(last.id); setIsEditMode(true); setActiveSheetIdx(-1); } }, 50);
          }}>
            <FileText size={14} /> Interim Certificate
          </Button>
          <Button variant="success" className="flex-1 justify-center h-10" disabled={!selectedBOQId} onClick={() => {
            addCertificate("final", selectedBOQId, selectedPrevCertId || null); setShowNew(false);
            setTimeout(() => { const state = useAppStore.getState(); const last = state.certificates[state.certificates.length - 1]; if (last) { setActiveCertId(last.id); setIsEditMode(true); setActiveSheetIdx(-1); } }, 50);
          }}>
            <FileText size={14} /> Final Certificate
          </Button>
        </div>
      </Modal>
    </div>
  );
}
