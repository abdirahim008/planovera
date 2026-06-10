"use client";

import { useState, useEffect } from "react";
import type { PaymentCertificate } from "@/lib/supabase";
import { useAppStore } from "@/lib/store";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import SignatureField from "@/components/ui/SignatureField";

interface CertificateSettingsProps {
  open: boolean;
  onClose: () => void;
  cert: PaymentCertificate;
  onSave: (settings: Partial<PaymentCertificate>) => void;
}

export default function CertificateSettings({
  open,
  onClose,
  cert,
  onSave,
}: CertificateSettingsProps) {
  const [settings, setSettings] = useState({
    periodStart: cert.periodStart || cert.date,
    periodEnd: cert.periodEnd || cert.date,
    contingenciesPercent: cert.contingenciesPercent,
    governmentTaxPercent: cert.governmentTaxPercent,
    retentionPercent: cert.retentionPercent,
    advancePaymentPercent: cert.advancePaymentPercent,
    advanceRecoveryStartIpc: cert.advanceRecoveryStartIpc ?? 1,
    withholdingTaxPercent: cert.withholdingTaxPercent,
    advancePaymentAmount: cert.advancePaymentAmount || "0.00",
    advanceRecoveredPrevious: cert.advanceRecoveredPrevious || "0.00",
    advanceRecoveryCurrent: cert.advanceRecoveryCurrent || "0.00",
    retentionReleaseAmount: cert.retentionReleaseAmount || "0.00",
    finalAccountNote: cert.finalAccountNote || "",
    contractorName: cert.contractorName,
    contractorCompany: cert.contractorCompany,
    contractorTitle: cert.contractorTitle,
    engineerName: cert.engineerName,
    engineerOrg: cert.engineerOrg,
    engineerTitle: cert.engineerTitle,
    employerName: cert.employerName,
    employerOrg: cert.employerOrg,
    employerTitle: cert.employerTitle,
    contractorSignatureSource: cert.contractorSignatureSource ?? "none",
    engineerSignatureSource: cert.engineerSignatureSource ?? "none",
    employerSignatureSource: cert.employerSignatureSource ?? "none",
    date: cert.date,
    status: cert.status,
  });

  useEffect(() => {
    setSettings({
      periodStart: cert.periodStart || cert.date,
      periodEnd: cert.periodEnd || cert.date,
      contingenciesPercent: cert.contingenciesPercent,
      governmentTaxPercent: cert.governmentTaxPercent,
      retentionPercent: cert.retentionPercent,
      advancePaymentPercent: cert.advancePaymentPercent,
      advanceRecoveryStartIpc: cert.advanceRecoveryStartIpc ?? 1,
      withholdingTaxPercent: cert.withholdingTaxPercent,
      advancePaymentAmount: cert.advancePaymentAmount || "0.00",
      advanceRecoveredPrevious: cert.advanceRecoveredPrevious || "0.00",
      advanceRecoveryCurrent: cert.advanceRecoveryCurrent || "0.00",
      retentionReleaseAmount: cert.retentionReleaseAmount || "0.00",
      finalAccountNote: cert.finalAccountNote || "",
      contractorName: cert.contractorName,
      contractorCompany: cert.contractorCompany,
      contractorTitle: cert.contractorTitle,
      engineerName: cert.engineerName,
      engineerOrg: cert.engineerOrg,
      engineerTitle: cert.engineerTitle,
      employerName: cert.employerName,
      employerOrg: cert.employerOrg,
      employerTitle: cert.employerTitle,
    contractorSignatureSource: cert.contractorSignatureSource ?? "none",
    engineerSignatureSource: cert.engineerSignatureSource ?? "none",
    employerSignatureSource: cert.employerSignatureSource ?? "none",
      date: cert.date,
      status: cert.status,
    });
  }, [cert]);

  const update = (key: string, value: string | number) =>
    setSettings((s) => ({ ...s, [key]: value }));

  const handleSave = () => {
    onSave(settings);
    onClose();
  };

  const userSignatureProfile = useAppStore((s) => s.userSignatureProfile);

  const inputCls =
    "w-full px-3 py-2 bg-bg-input border border-border rounded-lg text-sm text-txt outline-none focus:border-accent transition-colors";
  const labelCls = "block text-[11px] uppercase tracking-wider text-txt-dim mb-1.5 font-medium";
  const sectionCls = "mb-6";
  const sectionTitleCls = "text-sm font-semibold mb-3 flex items-center gap-2";

  return (
    <Modal open={open} onClose={onClose} title="Certificate Settings" width={600}>
      <div className="max-h-[65vh] overflow-auto pr-1">
        {/* Certificate Info */}
        <div className={sectionCls}>
          <h4 className={sectionTitleCls}>
            <span className="w-5 h-5 rounded bg-accent/15 flex items-center justify-center text-accent text-[10px]">📋</span>
            Certificate Info
          </h4>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Date</label>
              <input
                type="date"
                value={settings.date}
                onChange={(e) => update("date", e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Period Start</label>
              <input
                type="date"
                value={settings.periodStart}
                onChange={(e) => update("periodStart", e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Period End</label>
              <input
                type="date"
                value={settings.periodEnd}
                onChange={(e) => update("periodEnd", e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Status</label>
              <select
                value={settings.status}
                onChange={(e) => update("status", e.target.value)}
                className={inputCls}
              >
                <option value="draft">Draft</option>
                <option value="submitted">Submitted</option>
                <option value="approved">Approved</option>
                <option value="paid">Paid</option>
              </select>
            </div>
          </div>
        </div>

        {/* Deduction Percentages */}
        <div className={sectionCls}>
          <h4 className={sectionTitleCls}>
            <span className="w-5 h-5 rounded bg-warn/15 flex items-center justify-center text-warn text-[10px]">%</span>
            Additions & Deductions
          </h4>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Retention %</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={settings.retentionPercent}
                onChange={(e) => update("retentionPercent", parseFloat(e.target.value) || 0)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Advance Recovery %</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={settings.advancePaymentPercent}
                onChange={(e) => update("advancePaymentPercent", parseFloat(e.target.value) || 0)}
                className={inputCls}
              />
              <p className="mt-1 text-[11px] text-txt-dim">Applied to cumulative work done each certificate.</p>
            </div>
            <div>
              <label className={labelCls}>Start Recovery at IPC #</label>
              <input
                type="number"
                min="1"
                step="1"
                value={settings.advanceRecoveryStartIpc}
                onChange={(e) => update("advanceRecoveryStartIpc", Math.max(1, parseInt(e.target.value, 10) || 1))}
                className={inputCls}
              />
              <p className="mt-1 text-[11px] text-txt-dim">Recovery begins on this certificate number.</p>
            </div>
            <div>
              <label className={labelCls}>Withholding Tax %</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={settings.withholdingTaxPercent}
                onChange={(e) => update("withholdingTaxPercent", parseFloat(e.target.value) || 0)}
                className={inputCls}
              />
            </div>
          </div>
        </div>

        {/* Advance and retention tracking */}
        <div className={sectionCls}>
          <h4 className={sectionTitleCls}>
            <span className="w-5 h-5 rounded bg-purple-500/15 flex items-center justify-center text-purple-400 text-[10px]">$</span>
            Advance & Retention Tracking
          </h4>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Original Advance</label>
              <input
                value={settings.advancePaymentAmount}
                onChange={(e) => update("advancePaymentAmount", e.target.value)}
                placeholder="0.00"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Previous Advance Recovered</label>
              <input
                value={settings.advanceRecoveredPrevious}
                onChange={(e) => update("advanceRecoveredPrevious", e.target.value)}
                placeholder="0.00"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Current Advance Recovery</label>
              <input
                value={settings.advanceRecoveryCurrent}
                onChange={(e) => update("advanceRecoveryCurrent", e.target.value)}
                placeholder="0.00"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Retention Release</label>
              <input
                value={settings.retentionReleaseAmount}
                onChange={(e) => update("retentionReleaseAmount", e.target.value)}
                placeholder="0.00"
                className={inputCls}
              />
            </div>
            {cert.type === "final" && (
              <div className="sm:col-span-2">
                <label className={labelCls}>Final Account Note</label>
                <textarea
                  value={settings.finalAccountNote}
                  onChange={(e) => update("finalAccountNote", e.target.value)}
                  placeholder="Optional reconciliation note for the final certificate"
                  rows={3}
                  className={inputCls}
                />
              </div>
            )}
          </div>
        </div>

        {/* Signatories */}
        <div className={sectionCls}>
          <h4 className={sectionTitleCls}>
            <span className="w-5 h-5 rounded bg-ok/15 flex items-center justify-center text-ok text-[10px]">✍</span>
            Contractor (Prepared by)
          </h4>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <SignatureField
              label="Name"
              value={settings.contractorName}
              onChange={(v) => update("contractorName", v)}
              source={settings.contractorSignatureSource}
              onSourceChange={(s) => update("contractorSignatureSource", s)}
              profile={userSignatureProfile}
              placeholder="e.g. John Doe"
              inputClassName={inputCls}
              labelClassName={labelCls}
            />
            <div>
              <label className={labelCls}>Company</label>
              <input
                value={settings.contractorCompany}
                onChange={(e) => update("contractorCompany", e.target.value)}
                placeholder="e.g. ABC Construction Ltd"
                className={inputCls}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Title</label>
              <input
                value={settings.contractorTitle}
                onChange={(e) => update("contractorTitle", e.target.value)}
                placeholder="e.g. Site Agent"
                className={inputCls}
              />
            </div>
          </div>
        </div>

        <div className={sectionCls}>
          <h4 className={sectionTitleCls}>
            <span className="w-5 h-5 rounded bg-accent/15 flex items-center justify-center text-accent text-[10px]">✍</span>
            Engineer (Rates & Quantities Confirmed by)
          </h4>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <SignatureField
              label="Name"
              value={settings.engineerName}
              onChange={(v) => update("engineerName", v)}
              source={settings.engineerSignatureSource}
              onSourceChange={(s) => update("engineerSignatureSource", s)}
              profile={userSignatureProfile}
              placeholder="e.g. Jane Smith"
              inputClassName={inputCls}
              labelClassName={labelCls}
            />
            <div>
              <label className={labelCls}>Organization</label>
              <input
                value={settings.engineerOrg}
                onChange={(e) => update("engineerOrg", e.target.value)}
                placeholder="e.g. UNOPS"
                className={inputCls}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Title</label>
              <input
                value={settings.engineerTitle}
                onChange={(e) => update("engineerTitle", e.target.value)}
                placeholder="e.g. Resident Engineer"
                className={inputCls}
              />
            </div>
          </div>
        </div>

        <div className={sectionCls}>
          <h4 className={sectionTitleCls}>
            <span className="w-5 h-5 rounded bg-purple-500/15 flex items-center justify-center text-purple-400 text-[10px]">✍</span>
            Employer (Checked by)
          </h4>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <SignatureField
              label="Name"
              value={settings.employerName}
              onChange={(v) => update("employerName", v)}
              source={settings.employerSignatureSource}
              onSourceChange={(s) => update("employerSignatureSource", s)}
              profile={userSignatureProfile}
              placeholder="e.g. Omar Hussein"
              inputClassName={inputCls}
              labelClassName={labelCls}
            />
            <div>
              <label className={labelCls}>Organization</label>
              <input
                value={settings.employerOrg}
                onChange={(e) => update("employerOrg", e.target.value)}
                placeholder="e.g. Project Implementation Unit"
                className={inputCls}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Title</label>
              <input
                value={settings.employerTitle}
                onChange={(e) => update("employerTitle", e.target.value)}
                placeholder="e.g. Project Coordinator"
                className={inputCls}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-3 mt-4 pt-4 border-t border-border">
        <Button variant="ghost" onClick={onClose} className="flex-1 justify-center">
          Cancel
        </Button>
        <Button variant="primary" onClick={handleSave} className="flex-1 justify-center">
          Save Settings
        </Button>
      </div>
    </Modal>
  );
}
