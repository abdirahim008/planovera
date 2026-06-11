"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  Copy,
  Eye,
  FileText,
  Forward,
  Lock,
  Pencil,
  Plus,
  Settings,
  Trash2,
} from "lucide-react";
import { useAppStore, currency } from "@/lib/store";
import {
  parsePaymentNumber,
  paymentCertificateCalcs,
  paymentLineState,
} from "@/lib/payment-calculations";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import CompactKpiList from "@/components/ui/CompactKpiList";
import CertificateSettings from "./CertificateSettings";
import CertificatePrint from "./CertificatePrint";
import { buildIpcFormalHtml } from "./ipcFormalDoc";
import type { PaymentAdjustmentLine, PaymentCertificate, PaymentCertSheet } from "@/lib/supabase";

const formatCertName = (cert: Pick<PaymentCertificate, "type" | "number" | "revision">) => {
  const base = cert.type === "final" ? "FPC" : "IPC";
  const revision = cert.revision ? ` Rev ${cert.revision}` : "";
  return `${base} ${cert.number.toString().padStart(2, "0")}${revision}`;
};

const statusColor = (status: PaymentCertificate["status"]) =>
  status === "paid" || status === "approved" ? "ok" : status === "submitted" ? "accent" : "warn";

const lockedCertificate = (cert: PaymentCertificate) =>
  cert.locked || cert.status === "approved" || cert.status === "paid";

const sheetTotals = (sheet: PaymentCertSheet) =>
  sheet.items.reduce(
    (totals, item) => {
      const line = paymentLineState(item);
      totals.boq += line.boqAmount;
      totals.previous += line.previousAmount;
      totals.current += line.currentAmount;
      totals.total += line.totalAmount;
      return totals;
    },
    { boq: 0, previous: 0, current: 0, total: 0 }
  );

const adjustmentId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `adjustment-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const adjustmentDefaults = (type: "addition" | "deduction"): PaymentAdjustmentLine => ({
  id: adjustmentId(),
  type,
  category: type === "addition" ? "variation" : "other",
  label: type === "addition" ? "Approved variation" : "Other deduction",
  amount: "0.00",
  note: "",
});

const statusOptions: { value: PaymentCertificate["status"]; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "submitted", label: "Submitted" },
  { value: "approved", label: "Approved" },
  { value: "paid", label: "Paid" },
];

// A locked status (approved/paid) freezes the certificate. Moving FROM one of
// these back to an open status (draft/submitted) reopens it for editing, so we
// require an explicit confirmation to guard against accidental mis-taps.
const isLockedStatus = (status: PaymentCertificate["status"]) =>
  status === "approved" || status === "paid";

const statusToneClass = (status: PaymentCertificate["status"]) =>
  status === "paid"
    ? "bg-ok/15 text-ok hover:bg-ok/20"
    : status === "approved"
      ? "bg-accent/15 text-accent hover:bg-accent/20"
      : status === "submitted"
        ? "bg-warn/15 text-warn hover:bg-warn/20"
        : "bg-bg-raised text-txt-muted hover:bg-bg-hover";

function StatusPill({
  status,
  onChange,
}: {
  status: PaymentCertificate["status"];
  onChange: (next: PaymentCertificate["status"]) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide transition ${statusToneClass(status)}`}
      >
        {status}
        <ChevronDown size={12} />
      </button>
      {open && (
        <div className="absolute left-0 top-[calc(100%+4px)] z-30 min-w-[160px] rounded-lg border border-border bg-bg-surface py-1 shadow-[0_14px_40px_rgba(0,0,0,0.4)]">
          {statusOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                setOpen(false);
                if (option.value === status) return;
                // Reverting out of a locked (approved/paid) state reopens the
                // certificate — confirm before doing so.
                if (isLockedStatus(status) && !isLockedStatus(option.value)) {
                  const ok = window.confirm(
                    `This certificate is marked "${status}". Changing it to "${option.label}" will reopen it for editing and recalculation. Continue?`
                  );
                  if (!ok) return;
                }
                onChange(option.value);
              }}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] transition ${
                option.value === status
                  ? "text-accent"
                  : "text-txt hover:bg-bg-hover"
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${
                option.value === "paid"
                  ? "bg-ok"
                  : option.value === "approved"
                    ? "bg-accent"
                    : option.value === "submitted"
                      ? "bg-warn"
                      : "bg-txt-dim"
              }`} />
              {option.label}
              {option.value === status && <span className="ml-auto text-[10px] text-txt-dim">Current</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PaymentModule() {
  const {
    certificates,
    addCertificate,
    updateCertItem,
    updateCertSettings,
    reviseCertificate,
    deleteCertificate,
    savedBOQs,
    project,
    userSignatureProfile,
  } = useAppStore();

  const [activeCertId, setActiveCertId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [activeSheetIdx, setActiveSheetIdx] = useState(-1);
  const [newCertType, setNewCertType] = useState<"interim" | "final">("interim");
  const [selectedBOQId, setSelectedBOQId] = useState("");
  const [selectedPrevCertId, setSelectedPrevCertId] = useState("");
  // Which section's columns the narrow (mobile) IPC table shows; Description +
  // BOQ Qty + Rate stay pinned, this toggles the trailing numeric columns.
  const [mobileCertSection, setMobileCertSection] = useState<"previous" | "current" | "cumulative">("current");
  // Advance-recovery panel is collapsed by default so it doesn't dominate the
  // certificate view; the user expands it when they need to set recovery.
  const [advanceOpen, setAdvanceOpen] = useState(false);
  // IPC summary view direction: the modern in-app statement, or the formal
  // A4-landscape "Ledger / PDF" preview (identical markup to the exported PDF).
  const [ipcView, setIpcView] = useState<"modern" | "ledger">("modern");

  const projectCerts = useMemo(
    () =>
      certificates
        .filter((cert) => cert.project_id === project?.id)
        .sort((a, b) => a.type.localeCompare(b.type) || a.number - b.number || (a.revision || 0) - (b.revision || 0)),
    [certificates, project?.id]
  );
  const activeCert = projectCerts.find((cert) => cert.id === activeCertId) || null;
  const activeCalcs = activeCert ? paymentCertificateCalcs(activeCert) : null;
  const activeLocked = activeCert ? lockedCertificate(activeCert) : false;
  const boqOptions = savedBOQs.filter(
    (boq) =>
      boq.project_id === project?.id &&
      boq.sheets.some((sheet) => sheet.rows.some((row) => row.type === "item" && row.description))
  );
  const selectedBOQ = boqOptions.find((boq) => boq.id === selectedBOQId) || null;
  const previousOptions = projectCerts
    .filter((cert) => cert.type === "interim" && (cert.status === "approved" || cert.status === "paid"))
    .sort((a, b) => b.number - a.number || (b.revision || 0) - (a.revision || 0));
  const latestPrevious = previousOptions[0] || null;
  const selectedPrevCert = previousOptions.find((cert) => cert.id === selectedPrevCertId) || null;
  const isCrossBoqPrevious = Boolean(
    selectedPrevCert && selectedBOQId && selectedPrevCert.boqId && selectedPrevCert.boqId !== selectedBOQId
  );
  const hasBOQItems = boqOptions.length > 0;

  const summary = projectCerts.reduce(
    (acc, cert) => {
      const calc = paymentCertificateCalcs(cert);
      acc.currentNet += calc.curr.net;
      if (cert.status === "submitted") acc.submitted += calc.curr.net;
      if (cert.status === "approved") acc.approved += calc.curr.net;
      if (cert.status === "paid") acc.paid += calc.curr.net;
      acc.retentionHeld = calc.total.retentionHeld;
      acc.advanceBalance = calc.total.advanceBalance;
      return acc;
    },
    { currentNet: 0, submitted: 0, approved: 0, paid: 0, retentionHeld: 0, advanceBalance: 0 }
  );

  useEffect(() => {
    if (!showNew) return;
    if (!selectedBOQId && boqOptions.length > 0) {
      setSelectedBOQId(boqOptions[0].id);
    }
  }, [boqOptions, selectedBOQId, showNew]);

  useEffect(() => {
    if (!showNew) return;
    setSelectedPrevCertId(latestPrevious?.id || "none");
  }, [latestPrevious?.id, newCertType, selectedBOQId, showNew]);

  const openCreateModal = (type: "interim" | "final") => {
    setNewCertType(type);
    setShowNew(true);
  };

  const createCertificate = () => {
    if (!selectedBOQId) return;
    addCertificate(
      newCertType,
      selectedBOQId,
      selectedPrevCertId === "none" ? null : selectedPrevCertId || undefined
    );
    setShowNew(false);
    setTimeout(() => {
      const state = useAppStore.getState();
      const last = state.certificates[state.certificates.length - 1];
      if (!last) return;
      setActiveCertId(last.id);
      setIsEditMode(true);
      setActiveSheetIdx(-1);
    }, 50);
  };

  const updateAdjustments = (adjustments: PaymentAdjustmentLine[]) => {
    if (!activeCert || activeLocked) return;
    updateCertSettings(activeCert.id, { adjustments });
  };

  const addAdjustment = (type: "addition" | "deduction") => {
    updateAdjustments([...(activeCert?.adjustments || []), adjustmentDefaults(type)]);
  };

  const changeAdjustment = (lineId: string, patch: Partial<PaymentAdjustmentLine>) => {
    updateAdjustments(
      (activeCert?.adjustments || []).map((line) =>
        line.id === lineId ? { ...line, ...patch } : line
      )
    );
  };

  const removeAdjustment = (lineId: string) => {
    updateAdjustments((activeCert?.adjustments || []).filter((line) => line.id !== lineId));
  };

  return (
    <div className="animate-fade-in">
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <h2 className="text-lg font-semibold tracking-tight">Payment Certificates</h2>
        {!activeCert && (
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" size="sm" onClick={() => openCreateModal("interim")} disabled={!hasBOQItems}>
              <Plus size={14} /> New IPC
            </Button>
            <Button variant="success" size="sm" onClick={() => openCreateModal("final")} disabled={!hasBOQItems}>
              <FileText size={14} /> New Final Certificate
            </Button>
          </div>
        )}
      </div>

      {!activeCert && (
        <>
          {projectCerts.length > 0 && (
            <>
              <div className="mb-5 sm:hidden">
                <CompactKpiList
                  rows={[
                    { label: "Current Net Certified", value: `$ ${currency(summary.currentNet)}`, tone: "accent" },
                    { label: "Submitted", value: `$ ${currency(summary.submitted)}`, tone: "warn" },
                    { label: "Approved", value: `$ ${currency(summary.approved)}`, tone: "accent" },
                    { label: "Retention Held", value: `$ ${currency(summary.retentionHeld)}`, tone: "err" },
                    { label: "Advance Balance", value: `$ ${currency(summary.advanceBalance)}`, tone: "neutral" },
                  ]}
                />
              </div>
              <div className="mb-5 hidden grid-cols-1 gap-3 sm:grid sm:grid-cols-2 xl:grid-cols-5">
                {[
                  { label: "Current Net Certified", value: summary.currentNet, color: "accent" },
                  { label: "Submitted", value: summary.submitted, color: "warn" },
                  { label: "Approved", value: summary.approved, color: "accent" },
                  { label: "Retention Held", value: summary.retentionHeld, color: "err" },
                  { label: "Advance Balance", value: summary.advanceBalance, color: "purple" },
                ].map((card) => (
                  <div key={card.label} className="rounded-xl border border-border bg-bg-surface p-4">
                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">{card.label}</div>
                    <div className="font-mono text-lg font-semibold">$ {currency(card.value)}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          {projectCerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <p className="text-sm font-medium text-txt-muted">No payment certificates yet</p>
              {!hasBOQItems && (
                <p className="mt-1 text-xs text-txt-dim">Add BOQ items first.</p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="hidden data-table-shell overflow-auto xl:block">
                <table className="data-table data-table-sticky" style={{ minWidth: 1120 }}>
                  <thead>
                    <tr>
                      <th>Certificate</th>
                      <th>Period</th>
                      <th>Status</th>
                      <th className="text-right">Current Net</th>
                      <th className="text-right">Cumulative Net</th>
                      <th className="text-right">Retention Held</th>
                      <th className="text-right">Advance Balance</th>
                      <th>Lock</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projectCerts.map((cert) => {
                      const calc = paymentCertificateCalcs(cert);
                      return (
                        <tr
                          key={cert.id}
                          onClick={() => {
                            setActiveCertId(cert.id);
                            setIsEditMode(false);
                            setActiveSheetIdx(-1);
                          }}
                          className="cursor-pointer"
                        >
                          <td className="font-semibold">{formatCertName(cert)}</td>
                          <td className="text-sm text-txt-muted">
                            {cert.periodStart || cert.date} → {cert.periodEnd || cert.date}
                          </td>
                          <td>
                            <Badge color={statusColor(cert.status)}>{cert.status}</Badge>
                          </td>
                          <td className="data-cell-num">{currency(calc.curr.net)}</td>
                          <td className="data-cell-num">{currency(calc.total.net)}</td>
                          <td className="data-cell-num text-err">{currency(calc.total.retentionHeld)}</td>
                          <td className="data-cell-num text-purple-300">{currency(calc.total.advanceBalance)}</td>
                          <td className="text-xs text-txt-muted">
                            {lockedCertificate(cert) ? "Locked" : "Editable"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="data-table-shell overflow-x-auto xl:hidden">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Certificate</th>
                      <th className="text-right">Gross</th>
                      <th className="text-right">Net Paid</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projectCerts.map((cert) => {
                      const calc = paymentCertificateCalcs(cert);
                      return (
                        <tr
                          key={cert.id}
                          onClick={() => {
                            setActiveCertId(cert.id);
                            setIsEditMode(false);
                            setActiveSheetIdx(-1);
                          }}
                          className="cursor-pointer"
                        >
                          <td className="font-semibold">{formatCertName(cert)}</td>
                          <td className="data-cell-num">{currency(calc.curr.grand)}</td>
                          <td className="data-cell-num">{currency(calc.curr.net)}</td>
                          <td>
                            <Badge color={statusColor(cert.status)}>{cert.status}</Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {activeCert && activeCalcs && (
        <div>
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm" variant="ghost" onClick={() => { setActiveCertId(null); setIsEditMode(false); }}>
                <ArrowLeft size={14} /> Back
              </Button>
              <div className="h-5 w-px bg-border" />
              <h3 className="text-sm font-semibold">{formatCertName(activeCert)}</h3>
              <StatusPill
                status={activeCert.status}
                onChange={(next) => updateCertSettings(activeCert.id, { status: next })}
              />
              {activeLocked && <Badge color="err"><Lock size={11} className="mr-1" /> Locked</Badge>}
              {activeCalcs.unresolvedWarnings > 0 && (
                <span title="One or more line items are certified beyond their BOQ quantity (over-certified). Reduce the cumulative quantity, or add a note on the line explaining the over-certification (e.g. an approved variation) to clear it.">
                  <Badge color="warn">{activeCalcs.unresolvedWarnings} unresolved warning{activeCalcs.unresolvedWarnings === 1 ? "" : "s"}</Badge>
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <CertificatePrint cert={activeCert} project={project} />
              {activeLocked ? (
                <>
                  {activeCert.type === "interim" && (
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => {
                        setNewCertType("interim");
                        setSelectedBOQId(activeCert.boqId || "");
                        setShowNew(true);
                      }}
                    >
                      <Forward size={14} /> Next IPC
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => {
                      reviseCertificate(activeCert.id);
                      setTimeout(() => {
                        const last = useAppStore.getState().certificates.at(-1);
                        if (last) {
                          setActiveCertId(last.id);
                          setIsEditMode(true);
                        }
                      }, 50);
                    }}
                  >
                    <Copy size={14} /> Create revision
                  </Button>
                </>
              ) : isEditMode ? (
                <>
                  <Button size="sm" variant="default" onClick={() => setShowSettings(true)}><Settings size={14} /> Settings</Button>
                  <Button size="sm" variant="danger" onClick={() => setShowDeleteConfirm(true)}><Trash2 size={14} /></Button>
                  <Button size="sm" variant="primary" onClick={() => setIsEditMode(false)}><Eye size={14} /> Done editing</Button>
                </>
              ) : (
                <Button size="sm" variant="primary" onClick={() => setIsEditMode(true)}><Pencil size={14} /> Edit</Button>
              )}
            </div>
          </div>

          <div className="mb-4 rounded-2xl border border-border bg-bg-surface p-4">
            <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">
                  {activeCert.type === "final" ? "Final account certificate" : "Interim payment certificate"}
                </div>
                <div className="mt-1 text-base font-semibold">{project?.name || "Project"}</div>
                {isEditMode && !activeLocked ? (
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-txt-muted">
                    <span>Period</span>
                    <input
                      type="date"
                      value={activeCert.periodStart || activeCert.date}
                      onChange={(e) => updateCertSettings(activeCert.id, { periodStart: e.target.value })}
                      className="rounded-md border border-border bg-bg-raised px-2 py-1 text-xs text-txt outline-none focus:border-accent [color-scheme:light]"
                    />
                    <span>→</span>
                    <input
                      type="date"
                      value={activeCert.periodEnd || activeCert.date}
                      onChange={(e) => updateCertSettings(activeCert.id, { periodEnd: e.target.value })}
                      className="rounded-md border border-border bg-bg-raised px-2 py-1 text-xs text-txt outline-none focus:border-accent [color-scheme:light]"
                    />
                  </div>
                ) : (
                  <div className="mt-1 text-xs text-txt-muted">
                    Period {activeCert.periodStart || activeCert.date} → {activeCert.periodEnd || activeCert.date}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-xl border border-border bg-bg-raised/50 p-3">
                  <span className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">Current payable</span>
                  <span className="font-mono text-lg font-semibold text-ok">$ {currency(activeCalcs.curr.net)}</span>
                </div>
                <div className="rounded-xl border border-border bg-bg-raised/50 p-3">
                  <span className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">Advance balance</span>
                  <span className="font-mono text-lg font-semibold text-purple-300">$ {currency(activeCalcs.total.advanceBalance)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mb-3 flex items-center gap-1 overflow-x-auto border-b border-border">
            <button
              className={`whitespace-nowrap border-b-2 bg-transparent px-4 py-2 text-xs font-semibold transition-all ${
                activeSheetIdx === -1 ? "border-b-accent text-accent" : "border-b-transparent text-txt-dim hover:text-txt"
              }`}
              onClick={() => setActiveSheetIdx(-1)}
            >
              IPC Summary Page
            </button>
            {activeCert.sheets.map((sheet, index) => (
              <button
                key={sheet.id}
                className={`whitespace-nowrap border-b-2 bg-transparent px-4 py-2 text-xs font-medium transition-all ${
                  activeSheetIdx === index ? "border-b-accent text-accent" : "border-b-transparent text-txt-dim hover:text-txt"
                }`}
                onClick={() => setActiveSheetIdx(index)}
              >
                {sheet.name}
              </button>
            ))}
          </div>

          {activeSheetIdx === -1 && (
            <div className="space-y-5">
              {/* On-screen view switcher. PDF/Excel export lives in the top toolbar. */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-lg border border-border bg-bg p-0.5 text-xs font-semibold">
                  {([["modern", "Modern"], ["ledger", "Ledger / PDF"]] as const).map(([k, l]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setIpcView(k)}
                      className={`rounded-md px-3 py-1.5 transition ${ipcView === k ? "bg-bg-surface text-txt shadow-sm" : "text-txt-dim hover:text-txt"}`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              {ipcView === "ledger" ? (
                <div className="overflow-hidden rounded-xl border border-border bg-white p-3">
                  <div className="mb-2 text-center text-[11px] text-txt-muted">
                    Exact PDF preview (A4 landscape). Edit figures in the <b className="text-txt">Modern</b> view.
                  </div>
                  <iframe
                    title="IPC formal certificate"
                    className="h-[72vh] w-full rounded-lg border border-border bg-white"
                    srcDoc={buildIpcFormalHtml(activeCert, project, userSignatureProfile)}
                  />
                </div>
              ) : (
              <>
              {/* Contract header — formal "Statement for Payment on Account" block. */}
              <div className="rounded-2xl border border-border bg-bg-surface p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-txt-dim">
                      Summary of statement for payment on account
                    </div>
                    <h2 className="mt-1 truncate text-lg font-bold tracking-tight text-txt sm:text-xl">{project?.name || "Project"}</h2>
                  </div>
                  <div className="flex flex-shrink-0 gap-2">
                    <div className="rounded-lg border border-border bg-bg px-3 py-2 text-center">
                      <div className="text-[10px] uppercase tracking-[0.14em] text-txt-dim">Certificate</div>
                      <div className="font-mono text-sm font-semibold text-txt">No. {String(activeCert.number).padStart(2, "0")}</div>
                    </div>
                    <div className="rounded-lg border border-border bg-bg px-3 py-2 text-center">
                      <div className="text-[10px] uppercase tracking-[0.14em] text-txt-dim">Valuation</div>
                      <div className="font-mono text-sm font-semibold text-txt">{activeCert.date}</div>
                    </div>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3 lg:grid-cols-3">
                  {[
                    ["Contractor", activeCert.contractorCompany || activeCert.contractorName || "—"],
                    ["Contract price", project?.contractAmount ? `$ ${currency(project.contractAmount)} ${project?.currency || "USD"}` : "—"],
                    ["Period", `${activeCert.periodStart || activeCert.date} → ${activeCert.periodEnd || activeCert.date}`],
                  ].map(([k, v]) => (
                    <div key={k} className="min-w-0">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-txt-dim">{k}</div>
                      <div className="mt-0.5 truncate text-sm font-medium text-txt" title={v}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Headline figures — hidden on mobile (the table carries them). */}
              <div className="hidden gap-3 md:grid md:grid-cols-2 xl:grid-cols-4">
                {[
                  { label: "1. Valuation this period", value: activeCalcs.curr.grand, color: "accent" },
                  { label: "2. Retention held", value: activeCalcs.total.retentionHeld, color: "err" },
                  { label: "3. Advance recovered", value: activeCalcs.currentAdvanceRecovery, color: "purple" },
                  { label: "4. Now due to contractor", value: activeCalcs.curr.net, color: "ok" },
                ].map((card) => (
                  <div key={card.label} className="rounded-xl border border-border bg-bg-surface p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">{card.label}</div>
                    <div className="mt-2 font-mono text-xl font-semibold">$ {currency(card.value)}</div>
                  </div>
                ))}
              </div>

              {/* Formal A–M statement table (UNOPS-style), wired to the live cert. */}
              <div className="data-table-shell overflow-auto">
                <table className="data-table" style={{ minWidth: 520 }}>
                  <thead>
                    <tr>
                      <th className="w-[180px]">Description</th>
                      <th className="text-right">Previous</th>
                      <th className="text-right">Current</th>
                      <th className="text-right">Cumulative</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const c = activeCalcs;
                      const varCur = c.additions - c.deductions;
                      const prevF = c.prev.grand - c.prev.ret - c.prev.wh;
                      const curF = c.curr.grand + varCur - c.curr.ret - c.curr.wh;
                      const hasWh = Math.abs(c.prev.wh) + Math.abs(c.curr.wh) > 0.005;
                      const hasVar = Math.abs(varCur) > 0.005;
                      const hasAdvance = c.advancePaymentAmount > 0.5 || c.total.advance > 0.5;
                      type Row = {
                        code?: string; label: string; prev: number; cur: number; tot: number;
                        kind?: "group" | "sub" | "due";
                      };
                      const rows: Row[] = [
                        { kind: "group", label: "Work executed", prev: 0, cur: 0, tot: 0 },
                        { code: "A", label: "Total of work done", prev: c.prev.grand, cur: c.curr.grand, tot: c.total.grand },
                        ...(hasVar ? [{ code: "C", label: "Variations", prev: 0, cur: varCur, tot: varCur } as Row] : []),
                        { code: "D", label: "Sub-total", prev: c.prev.grand, cur: c.curr.grand + varCur, tot: c.total.grand + varCur, kind: "sub" },
                        { kind: "group", label: "Statutory deductions", prev: 0, cur: 0, tot: 0 },
                        { code: "E", label: "Less retention money", prev: -c.prev.ret, cur: -c.curr.ret, tot: -c.total.retentionHeld },
                        ...(hasWh ? [{ code: "E", label: "Less withholding tax", prev: -c.prev.wh, cur: -c.curr.wh, tot: -(c.prev.wh + c.curr.wh) } as Row] : []),
                        { code: "F", label: "Sub-total", prev: prevF, cur: curF, tot: prevF + curF, kind: "sub" },
                        ...(hasAdvance
                          ? ([
                              { kind: "group", label: "Advance & adjustments", prev: 0, cur: 0, tot: 0 },
                              { code: "G", label: "Advance payment", prev: c.advancePaymentAmount, cur: 0, tot: c.advancePaymentAmount },
                              { code: "H", label: "Repayment of advance", prev: -c.previousAdvanceRecovered, cur: -c.currentAdvanceRecovery, tot: -c.total.advance },
                              { code: "I", label: "Balance of advance (G − H)", prev: 0, cur: 0, tot: c.total.advanceBalance },
                            ] as Row[])
                          : []),
                        { code: "M", label: "Total of payment", prev: c.prev.net, cur: c.curr.net, tot: c.total.net, kind: "sub" },
                        { kind: "due", label: "Now due to contractor", prev: c.prev.net, cur: c.curr.net, tot: c.total.net },
                      ];
                      const num = (v: number) => currency(v);
                      return rows.map((r, i) => {
                        if (r.kind === "group") {
                          return (
                            <tr key={`g-${i}`}>
                              <td colSpan={4} className="bg-bg px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-txt-dim">
                                {r.label}
                              </td>
                            </tr>
                          );
                        }
                        if (r.kind === "due") {
                          return (
                            <tr key={`d-${i}`} className="bg-accent/5">
                              <td className="text-sm font-bold text-txt">{r.label}</td>
                              <td className="data-cell-num text-txt-muted">{num(r.prev)}<span className="ml-1 text-[10px] uppercase tracking-wide text-txt-dim">prev</span></td>
                              <td className="data-cell-num" />
                              <td className="data-cell-num text-base font-bold text-accent">{num(r.cur)}</td>
                            </tr>
                          );
                        }
                        const sub = r.kind === "sub";
                        return (
                          <tr key={`r-${i}`} className={sub ? "bg-bg/60 font-semibold" : undefined}>
                            <td className="text-sm">
                              {r.code ? (
                                <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded bg-bg-hover font-mono text-[10px] font-bold text-txt-muted">{r.code}</span>
                              ) : null}
                              <span className={sub ? "font-semibold text-txt" : "font-medium text-txt"}>{r.label}</span>
                            </td>
                            <td className="data-cell-num">{num(r.prev)}</td>
                            <td className="data-cell-num">{num(r.cur)}</td>
                            <td className={`data-cell-num ${sub ? "font-bold" : ""}`}>{num(r.tot)}</td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>

              {activeCert.type !== "final" && (() => {
                const outstandingBefore = activeCalcs.outstandingAdvance;
                const recoveryPct = activeCert.advancePaymentPercent || 0;
                // Cumulative proposal: recovery% of cumulative work done, less
                // what's already recovered, capped to the outstanding advance and
                // to what this certificate pays (so the net can't go negative).
                const cumulativeTarget = Math.min(
                  activeCalcs.advancePaymentAmount,
                  (activeCalcs.total.grand * recoveryPct) / 100
                );
                const payableBeforeAdvance = activeCalcs.curr.net + activeCalcs.currentAdvanceRecovery;
                const proposed = Math.max(
                  0,
                  Math.min(cumulativeTarget - activeCalcs.previousAdvanceRecovered, outstandingBefore, payableBeforeAdvance)
                );
                const completion = activeCalcs.completionPercent;
                const balanceOutstanding = activeCalcs.total.advanceBalance > 0.5;
                const hardWarn = balanceOutstanding && completion >= 99;
                const softWarn = balanceOutstanding && completion >= 90 && completion < 99;
                const sweepOn = Boolean(activeCert.advanceRecoverFull);
                return (
                  <div className="rounded-2xl border border-purple-400/30 bg-purple-500/5 p-4">
                    <button
                      type="button"
                      onClick={() => setAdvanceOpen((v) => !v)}
                      className="flex w-full items-center justify-between gap-3 text-left"
                      aria-expanded={advanceOpen}
                    >
                      <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">Advance recovery</span>
                      <span className="flex items-center gap-2 text-xs text-txt-muted">
                        Balance:{" "}
                        <span className="font-mono font-semibold text-purple-300">$ {currency(activeCalcs.total.advanceBalance)}</span>
                        <ChevronDown size={16} className={`shrink-0 transition-transform ${advanceOpen ? "rotate-180" : ""}`} />
                      </span>
                    </button>

                    {(hardWarn || softWarn) && (
                      <div className={`mt-3 flex items-start gap-2 rounded-lg border p-3 text-xs ${hardWarn ? "border-err/40 bg-err/10 text-err" : "border-warn/40 bg-warn/10 text-warn"}`}>
                        <span className="mt-0.5 font-bold">!</span>
                        <span>
                          {hardWarn
                            ? `Works are ${completion.toFixed(0)}% certified and $ ${currency(activeCalcs.total.advanceBalance)} of advance is still outstanding — recover it on this certificate before only retention remains.`
                            : `Works are ${completion.toFixed(0)}% certified with $ ${currency(activeCalcs.total.advanceBalance)} advance outstanding — clear it over the remaining certificates while there is still payment to deduct from.`}
                        </span>
                      </div>
                    )}

                    {advanceOpen && (<div className="mt-3 space-y-3">

                    {(() => {
                      const advRows: Array<[string, string]> = [
                        ["Original advance", `$ ${currency(activeCalcs.advancePaymentAmount)}`],
                        ["Previously recovered", `$ ${currency(activeCalcs.previousAdvanceRecovered)}`],
                        ["Recovered to date", `$ ${currency(activeCalcs.total.advance)}`],
                        ["Outstanding before this", `$ ${currency(outstandingBefore)}`],
                      ];
                      return (
                        <>
                          {/* Mobile: tight label/value list instead of four cards. */}
                          <div className="divide-y divide-border rounded-xl border border-border bg-bg-raised/50 sm:hidden">
                            {advRows.map(([label, value]) => (
                              <div key={label} className="flex items-center justify-between gap-3 px-3 py-2">
                                <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-txt-dim">{label}</span>
                                <span className="font-mono text-sm font-semibold text-txt">{value}</span>
                              </div>
                            ))}
                          </div>
                          {/* Desktop: card grid. */}
                          <div className="hidden gap-2 text-xs sm:grid sm:grid-cols-4">
                            {advRows.map(([label, value]) => (
                              <div key={label} className="rounded-xl border border-border bg-bg-raised/50 p-3">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">{label}</div>
                                <div className="mt-1 font-mono font-semibold text-txt">{value}</div>
                              </div>
                            ))}
                          </div>
                        </>
                      );
                    })()}

                    {isEditMode && !activeLocked && (
                      <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-txt">
                        <input
                          type="checkbox"
                          checked={sweepOn}
                          onChange={(e) => updateCertSettings(activeCert.id, { advanceRecoverFull: e.target.checked })}
                          className="h-4 w-4 accent-purple-500"
                        />
                        Recover the full remaining advance on this certificate ($ {currency(outstandingBefore)})
                      </label>
                    )}

                    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                      <label className="flex-1">
                        <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">Recovery this period</span>
                        {isEditMode && !activeLocked && !sweepOn ? (
                          <input
                            value={activeCert.advanceRecoveryCurrent ?? ""}
                            onChange={(e) => updateCertSettings(activeCert.id, { advanceRecoveryCurrent: e.target.value })}
                            placeholder={proposed.toFixed(2)}
                            className="w-full rounded-lg border border-border bg-bg-input px-3 py-2 text-right font-mono text-sm text-txt outline-none focus:border-accent"
                          />
                        ) : (
                          <div className="font-mono font-semibold text-purple-300">$ {currency(activeCalcs.currentAdvanceRecovery)}</div>
                        )}
                      </label>
                      {isEditMode && !activeLocked && !sweepOn && (
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => updateCertSettings(activeCert.id, { advanceRecoveryCurrent: proposed.toFixed(2) })}
                        >
                          Propose {recoveryPct}% of cumulative
                        </Button>
                      )}
                    </div>
                    <div className="mt-2 text-[11px] text-txt-dim">
                      {sweepOn
                        ? "Recovering the full remaining advance this certificate (capped so the net stays positive)."
                        : `Proposed = ${recoveryPct}% of cumulative work done ($ ${currency(activeCalcs.total.grand)}) less already recovered, capped at the outstanding advance and this certificate's payable.`}
                    </div>

                    </div>)}
                  </div>
                );
              })()}

              <div className="rounded-2xl border border-border bg-bg-surface p-4">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">Deductions and adjustments</div>
                  {isEditMode && !activeLocked && (
                    <div className="flex gap-2">
                      <Button size="sm" variant="success" onClick={() => addAdjustment("addition")}><Plus size={14} /> Addition</Button>
                      <Button size="sm" variant="warning" onClick={() => addAdjustment("deduction")}><Plus size={14} /> Deduction</Button>
                    </div>
                  )}
                </div>
                {(activeCert.adjustments || []).length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border p-4 text-sm text-txt-muted">No adjustment lines added.</div>
                ) : (
                  <div className="data-table-shell">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th style={{ width: 130 }}>Type</th>
                          <th style={{ width: 150 }}>Category</th>
                          <th>Label</th>
                          <th style={{ width: 150 }} className="text-right">Amount</th>
                          {isEditMode && !activeLocked && <th style={{ width: 36 }} aria-label="Actions" />}
                        </tr>
                      </thead>
                      <tbody>
                        {(activeCert.adjustments || []).map((line) => (
                          <tr key={line.id}>
                            <td>
                              <select
                                value={line.type}
                                disabled={!isEditMode || activeLocked}
                                onChange={(e) => changeAdjustment(line.id, { type: e.target.value as "addition" | "deduction" })}
                                className="data-cell-select"
                              >
                                <option value="addition">Addition</option>
                                <option value="deduction">Deduction</option>
                              </select>
                            </td>
                            <td>
                              <select
                                value={line.category}
                                disabled={!isEditMode || activeLocked}
                                onChange={(e) => changeAdjustment(line.id, { category: e.target.value as PaymentAdjustmentLine["category"] })}
                                className="data-cell-select"
                              >
                                <option value="variation">Variation</option>
                                <option value="materials">Materials</option>
                                <option value="withholding">Withholding</option>
                                <option value="liquidated-damages">LD</option>
                                <option value="other">Other</option>
                              </select>
                            </td>
                            <td className="data-cell-wrap">
                              <input
                                value={line.label}
                                disabled={!isEditMode || activeLocked}
                                onChange={(e) => changeAdjustment(line.id, { label: e.target.value })}
                                className="data-cell-input"
                                placeholder="Label"
                              />
                            </td>
                            <td className="data-cell-num">
                              <input
                                value={line.amount}
                                disabled={!isEditMode || activeLocked}
                                onChange={(e) => changeAdjustment(line.id, { amount: e.target.value })}
                                className="data-cell-input text-right font-mono"
                                placeholder="0.00"
                              />
                            </td>
                            {isEditMode && !activeLocked && (
                              <td className="data-cell-action">
                                <button
                                  type="button"
                                  onClick={() => removeAdjustment(line.id)}
                                  className="data-row-action danger"
                                  aria-label="Remove adjustment"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              </>
              )}
            </div>
          )}

          {activeSheetIdx >= 0 && activeCert.sheets[activeSheetIdx] && (() => {
            const sheet = activeCert.sheets[activeSheetIdx];
            return (
              <>
                <div className="xl:hidden" data-variant="mobile" data-cert-sheet={sheet.id}>
                  <div className="mb-3 flex items-center gap-1 rounded-xl border border-border bg-bg-raised/50 p-1 text-[11px] font-semibold">
                    {([
                      ["previous", "Previous"],
                      ["current", "This Cert"],
                      ["cumulative", "Cumulative"],
                    ] as const).map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setMobileCertSection(key)}
                        className={`flex-1 rounded-lg px-2 py-1.5 uppercase tracking-[0.1em] transition-colors ${mobileCertSection === key ? "bg-accent text-white" : "text-txt-dim"}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="data-table-shell overflow-auto" style={{ maxHeight: "calc(100vh - 470px)" }}>
                    <table className="data-table data-table-sticky text-[11px] min-w-[520px]">
                      <thead>
                        <tr>
                          <th className="data-sticky-col left-0 data-sticky-edge min-w-[150px]">Description</th>
                          <th className="text-right">BOQ Qty</th>
                          <th className="text-right">Rate</th>
                          {mobileCertSection === "previous" && (
                            <>
                              <th className="text-right">Prev Qty</th>
                              <th className="text-right">Prev Amount</th>
                            </>
                          )}
                          {mobileCertSection === "current" && (
                            <>
                              <th className="text-right">Current Qty <span className="font-normal text-txt-dim">(auto)</span></th>
                              <th className="text-right">Current Amount</th>
                              <th className="text-right">Cum Qty <span className="font-normal text-accent">(enter)</span></th>
                            </>
                          )}
                          {mobileCertSection === "cumulative" && (
                            <>
                              <th className="text-right">Cum Qty</th>
                              <th className="text-right">Balance Qty</th>
                              <th className="text-right">Cum Amount</th>
                            </>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {sheet.items.map((item, index) => {
                          const line = paymentLineState(item);
                          const warn = line.warningStatus === "over-certified";
                          return (
                            <tr key={`${item.id}-m`} className={warn ? "bg-warn/5" : ""}>
                              <td className="data-cell-wrap data-sticky-col left-0 data-sticky-edge min-w-[150px]">
                                <div className="font-medium text-txt">{item.description}</div>
                                <div className="mt-0.5 text-[10px] uppercase tracking-[0.08em] text-txt-dim">{[item.billNo, item.unit].filter(Boolean).join(" · ")}</div>
                              </td>
                              <td className="data-cell-num">{currency(line.boqQty)}</td>
                              <td className="data-cell-num">{currency(line.rate)}</td>
                              {mobileCertSection === "previous" && (
                                <>
                                  <td className="data-cell-num">{currency(line.previousQty)}</td>
                                  <td className="data-cell-num">{currency(line.previousAmount)}</td>
                                </>
                              )}
                              {mobileCertSection === "current" && (
                                <>
                                  <td className="data-cell-num text-txt-muted">{currency(line.currentQty)}</td>
                                  <td className="data-cell-num">{currency(line.currentAmount)}</td>
                                  <td className="data-cell-num bg-accent/5">
                                    {isEditMode && !activeLocked ? (
                                      <input
                                        data-field="cumulative-qty"
                                        data-variant="mobile"
                                        data-item-id={item.id}
                                        value={item.totalQty ?? ""}
                                        onChange={(e) => updateCertItem(activeCert.id, sheet.id, item.id, "totalQty", e.target.value)}
                                        className="data-cell-input text-right font-mono"
                                        placeholder="0.00"
                                      />
                                    ) : (
                                      <span className="font-bold text-accent">{currency(line.totalQty)}</span>
                                    )}
                                  </td>
                                </>
                              )}
                              {mobileCertSection === "cumulative" && (
                                <>
                                  <td className="data-cell-num font-bold text-accent">{currency(line.totalQty)}</td>
                                  <td className={`data-cell-num ${line.balanceQty < 0 ? "text-warn" : "text-txt-muted"}`}>{currency(line.balanceQty)}</td>
                                  <td className="data-cell-num font-bold text-ok">{currency(line.totalAmount)}</td>
                                </>
                              )}
                            </tr>
                          );
                        })}
                        {(() => {
                          const totals = sheetTotals(sheet);
                          return (
                            <tr className="bg-accent/10 font-bold">
                              <td className="data-sticky-col left-0 data-sticky-edge border-t-2 border-t-accent">Sheet total</td>
                              <td className="data-cell-num border-t-2 border-t-accent">{currency(totals.boq)}</td>
                              <td className="border-t-2 border-t-accent" />
                              {mobileCertSection === "previous" && (
                                <>
                                  <td className="border-t-2 border-t-accent" />
                                  <td className="data-cell-num border-t-2 border-t-accent">{currency(totals.previous)}</td>
                                </>
                              )}
                              {mobileCertSection === "current" && (
                                <>
                                  <td className="border-t-2 border-t-accent" />
                                  <td className="data-cell-num border-t-2 border-t-accent">{currency(totals.current)}</td>
                                  <td className="border-t-2 border-t-accent" />
                                </>
                              )}
                              {mobileCertSection === "cumulative" && (
                                <>
                                  <td className="border-t-2 border-t-accent" />
                                  <td className="border-t-2 border-t-accent" />
                                  <td className="data-cell-num border-t-2 border-t-accent text-ok">{currency(totals.total)}</td>
                                </>
                              )}
                            </tr>
                          );
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="hidden data-table-shell overflow-auto xl:block" data-variant="desktop" data-cert-sheet={sheet.id} style={{ maxHeight: "calc(100vh - 425px)" }}>
                  <table className="data-table data-table-sticky text-[11px]" style={{ minWidth: 1500 }}>
                    <thead>
                      <tr>
                        <th className="data-cell-index" style={{ width: 36 }}>#</th>
                        <th>Item No.</th>
                        <th>Description</th>
                        <th>Unit</th>
                        <th className="text-right">BOQ Qty</th>
                        <th className="text-right">Rate</th>
                        <th className="text-right">BOQ Amount</th>
                        <th className="text-right">Prev Qty</th>
                        <th className="text-right">Prev Amount</th>
                        <th className="text-right" title="Derived automatically = Cumulative Qty − Previous Qty">Current Qty <span className="font-normal text-txt-dim">(auto)</span></th>
                        <th className="text-right">Current Amount</th>
                        <th className="text-right" title="Enter the total quantity completed to date. Current Qty is derived from this.">Cumulative Qty <span className="font-normal text-accent">(enter)</span></th>
                        <th className="text-right">Balance Qty</th>
                        <th className="text-right">Cumulative Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sheet.items.map((item, index) => {
                        const line = paymentLineState(item);
                        const warn = line.warningStatus === "over-certified";
                        return (
                          <tr key={item.id} className={warn ? "bg-warn/5" : ""}>
                            <td className="data-cell-index">{index + 1}</td>
                            <td className="font-mono text-txt-muted">{item.billNo}</td>
                            <td className="data-cell-wrap min-w-[260px]">{item.description}</td>
                            <td className="text-center uppercase text-txt-dim">{item.unit}</td>
                            <td className="data-cell-num">{currency(line.boqQty)}</td>
                            <td className="data-cell-num">{currency(line.rate)}</td>
                            <td className="data-cell-num">{currency(line.boqAmount)}</td>
                            <td className="data-cell-num">{currency(line.previousQty)}</td>
                            <td className="data-cell-num">{currency(line.previousAmount)}</td>
                            <td className="data-cell-num text-txt-muted">{currency(line.currentQty)}</td>
                            <td className="data-cell-num">{currency(line.currentAmount)}</td>
                            <td className="data-cell-num bg-accent/5">
                              {isEditMode && !activeLocked ? (
                                <input
                                  data-field="cumulative-qty"
                                  data-variant="desktop"
                                  data-item-id={item.id}
                                  value={item.totalQty ?? ""}
                                  onChange={(e) => updateCertItem(activeCert.id, sheet.id, item.id, "totalQty", e.target.value)}
                                  className="data-cell-input text-right font-mono"
                                  placeholder="0.00"
                                />
                              ) : (
                                <span className="font-bold text-accent">{currency(line.totalQty)}</span>
                              )}
                            </td>
                            <td className={`data-cell-num ${line.balanceQty < 0 ? "text-warn" : "text-txt-muted"}`}>{currency(line.balanceQty)}</td>
                            <td className="data-cell-num font-bold text-ok">{currency(line.totalAmount)}</td>
                          </tr>
                        );
                      })}
                      {(() => {
                        const totals = sheetTotals(sheet);
                        return (
                          <tr className="bg-accent/10 font-bold">
                            <td colSpan={6} className="border-t-2 border-t-accent">Sheet total — {sheet.name}</td>
                            <td className="data-cell-num border-t-2 border-t-accent">{currency(totals.boq)}</td>
                            <td className="border-t-2 border-t-accent" />
                            <td className="data-cell-num border-t-2 border-t-accent">{currency(totals.previous)}</td>
                            <td className="border-t-2 border-t-accent" />
                            <td className="data-cell-num border-t-2 border-t-accent">{currency(totals.current)}</td>
                            <td className="border-t-2 border-t-accent" />
                            <td className="border-t-2 border-t-accent" />
                            <td className="data-cell-num border-t-2 border-t-accent text-ok">{currency(totals.total)}</td>
                          </tr>
                        );
                      })()}
                    </tbody>
                  </table>
                </div>
              </>
            );
          })()}

          {activeSheetIdx === -1 && (
            <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
              {[
                { heading: "Prepared by", role: "Contractor", titleField: activeCert.contractorTitle, nameField: activeCert.contractorName, org: activeCert.contractorCompany },
                { heading: "Rates and quantities confirmed by", role: activeCert.engineerOrg || "Engineer", titleField: activeCert.engineerTitle, nameField: activeCert.engineerName, org: "" },
                { heading: "Checked by", role: "Employer", titleField: activeCert.employerTitle, nameField: activeCert.employerName, org: activeCert.employerOrg },
              ].map((signatory) => (
                <div key={signatory.heading} className="rounded-xl border border-border bg-bg-surface p-4">
                  <div className="mb-3 border-b border-border pb-2 text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">{signatory.heading}</div>
                  <div className="mb-3 text-center text-xs font-semibold">{signatory.role}</div>
                  <div className="space-y-2 text-xs">
                    <div><span className="text-txt-dim">Signed:</span><div className="mb-2 mt-4 border-b border-border/60" /></div>
                    <div><span className="text-txt-dim">{signatory.titleField}:</span><span className="ml-1 font-semibold">{signatory.nameField || "—"}</span></div>
                    {signatory.org && <div className="text-txt-muted">{signatory.org}</div>}
                    <div><span className="text-txt-dim">Date:</span><div className="mt-3 border-b border-border/60" /></div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {showSettings && (
            <CertificateSettings
              open={showSettings}
              onClose={() => setShowSettings(false)}
              cert={activeCert}
              onSave={(settings) => updateCertSettings(activeCert.id, settings)}
            />
          )}

          <Modal open={showDeleteConfirm} onClose={() => setShowDeleteConfirm(false)} title="Delete Certificate" width={400}>
            <p className="mb-5 text-sm text-txt-muted">
              Are you sure you want to delete <strong>{formatCertName(activeCert)}</strong>? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <Button variant="ghost" className="flex-1 justify-center" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
              <Button
                variant="danger"
                className="flex-1 justify-center"
                onClick={() => {
                  deleteCertificate(activeCert.id);
                  setActiveCertId(null);
                  setShowDeleteConfirm(false);
                  setIsEditMode(false);
                }}
              >
                <Trash2 size={14} /> Delete
              </Button>
            </div>
          </Modal>
        </div>
      )}

      <Modal
        open={showNew}
        onClose={() => setShowNew(false)}
        title={newCertType === "final" ? "New Final Payment Certificate" : "New Interim Payment Certificate"}
        width={560}
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-bg-raised p-3">
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">1. Select BOQ</div>
            <select
              value={selectedBOQId}
              onChange={(e) => setSelectedBOQId(e.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/50"
            >
              <option value="" disabled>Select BOQ</option>
              {boqOptions.map((boq) => <option key={boq.id} value={boq.id}>{boq.name}</option>)}
            </select>
          </div>

          <div className="rounded-lg border border-border bg-bg-raised p-3">
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">2. Previous approved IPC</div>
            <select
              value={selectedPrevCertId}
              onChange={(e) => setSelectedPrevCertId(e.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/50"
            >
              <option value="none">None - start from zero</option>
              {previousOptions.map((cert) => {
                const certBoq = savedBOQs.find((boq) => boq.id === cert.boqId);
                const boqLabel = certBoq?.name ? ` (BOQ: ${certBoq.name})` : "";
                return (
                  <option key={cert.id} value={cert.id}>
                    {formatCertName(cert)} - {cert.date} - Net $ {currency(paymentCertificateCalcs(cert).curr.net)}{boqLabel}
                  </option>
                );
              })}
            </select>
            {isCrossBoqPrevious && (
              <div className="mt-2 rounded-md border border-warn/30 bg-warn/5 px-3 py-2 text-[12px] leading-5 text-warn">
                Previous IPC is from a different BOQ. Items matching by description and bill number will carry forward; new items start at zero.
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border bg-bg-raised p-3">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">3. Included sheets</div>
            <div className="max-h-[140px] overflow-auto pr-1">
              {(selectedBOQ?.sheets || []).map((sheet, index) => {
                const total = sheet.rows
                  .filter((row) => row.type === "item")
                  .reduce((sum, row) => sum + parsePaymentNumber(row.amount), 0);
                return (
                  <div key={sheet.id} className="flex items-center justify-between py-1.5 text-xs text-txt-muted">
                    <span><span className="mr-2 font-mono font-medium text-txt">{index + 1}</span>{sheet.name}</span>
                    <span className="font-mono opacity-70">{currency(total)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div className="mt-6 flex gap-3">
          <Button variant="ghost" className="flex-1 justify-center" onClick={() => setShowNew(false)}>Cancel</Button>
          <Button variant={newCertType === "final" ? "success" : "primary"} className="flex-1 justify-center" disabled={!selectedBOQId} onClick={createCertificate}>
            <FileText size={14} /> Create {newCertType === "final" ? "Final Certificate" : "IPC"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
