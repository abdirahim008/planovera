"use client";

import { useState, useEffect } from "react";
import type { PaymentCertificate } from "@/lib/supabase";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";

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
    contingenciesPercent: cert.contingenciesPercent,
    governmentTaxPercent: cert.governmentTaxPercent,
    retentionPercent: cert.retentionPercent,
    advancePaymentPercent: cert.advancePaymentPercent,
    withholdingTaxPercent: cert.withholdingTaxPercent,
    contractorName: cert.contractorName,
    contractorCompany: cert.contractorCompany,
    contractorTitle: cert.contractorTitle,
    engineerName: cert.engineerName,
    engineerOrg: cert.engineerOrg,
    engineerTitle: cert.engineerTitle,
    employerName: cert.employerName,
    employerOrg: cert.employerOrg,
    employerTitle: cert.employerTitle,
    date: cert.date,
    status: cert.status,
  });

  useEffect(() => {
    setSettings({
      contingenciesPercent: cert.contingenciesPercent,
      governmentTaxPercent: cert.governmentTaxPercent,
      retentionPercent: cert.retentionPercent,
      advancePaymentPercent: cert.advancePaymentPercent,
      withholdingTaxPercent: cert.withholdingTaxPercent,
      contractorName: cert.contractorName,
      contractorCompany: cert.contractorCompany,
      contractorTitle: cert.contractorTitle,
      engineerName: cert.engineerName,
      engineerOrg: cert.engineerOrg,
      engineerTitle: cert.engineerTitle,
      employerName: cert.employerName,
      employerOrg: cert.employerOrg,
      employerTitle: cert.employerTitle,
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
          <div className="grid grid-cols-2 gap-3">
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Contingencies %</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={settings.contingenciesPercent}
                onChange={(e) => update("contingenciesPercent", parseFloat(e.target.value) || 0)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Government Tax %</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={settings.governmentTaxPercent}
                onChange={(e) => update("governmentTaxPercent", parseFloat(e.target.value) || 0)}
                className={inputCls}
              />
            </div>
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
              <label className={labelCls}>Advance Payment %</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={settings.advancePaymentPercent}
                onChange={(e) => update("advancePaymentPercent", parseFloat(e.target.value) || 0)}
                className={inputCls}
              />
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

        {/* Signatories */}
        <div className={sectionCls}>
          <h4 className={sectionTitleCls}>
            <span className="w-5 h-5 rounded bg-ok/15 flex items-center justify-center text-ok text-[10px]">✍</span>
            Contractor (Prepared by)
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Name</label>
              <input
                value={settings.contractorName}
                onChange={(e) => update("contractorName", e.target.value)}
                placeholder="e.g. John Doe"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Company</label>
              <input
                value={settings.contractorCompany}
                onChange={(e) => update("contractorCompany", e.target.value)}
                placeholder="e.g. ABC Construction Ltd"
                className={inputCls}
              />
            </div>
            <div className="col-span-2">
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Name</label>
              <input
                value={settings.engineerName}
                onChange={(e) => update("engineerName", e.target.value)}
                placeholder="e.g. Jane Smith"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Organization</label>
              <input
                value={settings.engineerOrg}
                onChange={(e) => update("engineerOrg", e.target.value)}
                placeholder="e.g. UNOPS"
                className={inputCls}
              />
            </div>
            <div className="col-span-2">
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Name</label>
              <input
                value={settings.employerName}
                onChange={(e) => update("employerName", e.target.value)}
                placeholder="e.g. Omar Hussein"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Organization</label>
              <input
                value={settings.employerOrg}
                onChange={(e) => update("employerOrg", e.target.value)}
                placeholder="e.g. Project Implementation Unit"
                className={inputCls}
              />
            </div>
            <div className="col-span-2">
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
