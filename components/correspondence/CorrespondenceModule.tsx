"use client";

import { useEffect, useMemo, useState } from "react";
import { v4 as uuid } from "uuid";
import {
  ArrowLeft,
  ChevronRight,
  Copy,
  Mail,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useAppStore, currency } from "@/lib/store";
import type {
  ApprovalStep,
  CorrespondenceRecord,
  CorrespondenceType,
  GeneratedDocument,
  PaymentCertificate,
  ProgressReport,
} from "@/lib/supabase";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Badge from "@/components/ui/Badge";

const typeLabel: Record<CorrespondenceType, string> = {
  instruction: "Instruction",
  rfi: "RFI",
  submittal: "Submittal",
  "meeting-minute": "Meeting Minute",
  "claim-notice": "Claim Notice",
  "variation-order": "Variation Order",
};

const typeShortCode: Record<CorrespondenceType, string> = {
  instruction: "INS",
  rfi: "RFI",
  submittal: "SUB",
  "meeting-minute": "MOM",
  "claim-notice": "CLM",
  "variation-order": "VO",
};

const typeColor: Record<CorrespondenceType, "accent" | "warn" | "ok" | "err" | "purple"> = {
  instruction: "accent",
  rfi: "warn",
  submittal: "accent",
  "meeting-minute": "purple",
  "claim-notice": "err",
  "variation-order": "ok",
};

const statusColor = (status: CorrespondenceRecord["status"]): "warn" | "accent" | "ok" | "err" =>
  status === "approved" || status === "closed"
    ? "ok"
    : status === "pending-approval"
    ? "accent"
    : status === "open"
    ? "warn"
    : "err";

const approvalColor = (status: ApprovalStep["status"]): "warn" | "ok" | "err" =>
  status === "approved" ? "ok" : status === "rejected" ? "err" : "warn";

function toNumber(value: string | number | undefined | null) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  return parseFloat(String(value || "0").replace(/,/g, "")) || 0;
}

function defaultBody(type: CorrespondenceType, subject: string) {
  switch (type) {
    case "instruction":
      return `Reference is made to ${subject}.\n\nYou are hereby instructed to proceed with the required action and confirm implementation, resource implications, and completion date.\n\nPlease provide acknowledgment and execution status.`;
    case "rfi":
      return `Please provide clarification on ${subject}.\n\nKindly respond with the required technical or contractual information and attach any supporting documents.`;
    case "submittal":
      return `Please review the submitted item for ${subject}.\n\nThe receiving party is requested to review and respond with approval, comments, or required revisions.`;
    case "meeting-minute":
      return `Meeting minutes for ${subject}.\n\nAgenda, discussions, decisions, action owners, and deadlines should be recorded here.`;
    case "claim-notice":
      return `This notice is issued in relation to ${subject}.\n\nThe sender reserves contractual rights and will provide supporting particulars regarding time and/or cost implications.`;
    case "variation-order":
      return `Variation order issued for ${subject}.\n\nPlease review the scope change, associated cost, and time implications, then proceed in accordance with the approved instruction.`;
    default:
      return "";
  }
}

function defaultApprovalSteps(): ApprovalStep[] {
  return [
    { id: uuid(), role: "Originator", reviewer: "", status: "pending", date: "", comments: "" },
    { id: uuid(), role: "Consultant Review", reviewer: "", status: "pending", date: "", comments: "" },
    { id: uuid(), role: "Employer Approval", reviewer: "", status: "pending", date: "", comments: "" },
  ];
}

function formatLinkedLabel({
  document,
  progress,
  certificate,
}: {
  document?: GeneratedDocument;
  progress?: ProgressReport;
  certificate?: PaymentCertificate;
}) {
  if (document) return document.title;
  if (progress) return progress.name;
  if (certificate) return `${certificate.type === "final" ? "FPC" : "IPC"} ${certificate.number.toString().padStart(2, "0")}`;
  return "—";
}

export default function CorrespondenceModule() {
  const {
    project,
    generatedDocuments,
    progressReports,
    certificates,
    correspondenceRecords,
    addCorrespondenceRecord,
    updateCorrespondenceRecord,
    deleteCorrespondenceRecord,
    duplicateCorrespondenceRecord,
    updateApprovalStep,
  } = useAppStore();

  const [activeRecordId, setActiveRecordId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [newType, setNewType] = useState<CorrespondenceType>("instruction");
  const [newSubject, setNewSubject] = useState("");
  const [newFrom, setNewFrom] = useState("");
  const [newTo, setNewTo] = useState("");
  const [newDueDate, setNewDueDate] = useState("");

  const projectRecords = correspondenceRecords.filter((record) => record.project_id === project?.id);
  const projectDocuments = generatedDocuments.filter((doc) => doc.project_id === project?.id);
  const projectProgress = progressReports.filter((report) => report.project_id === project?.id);
  const projectCertificates = certificates.filter((cert) => cert.project_id === project?.id);
  const activeRecord = projectRecords.find((record) => record.id === activeRecordId) || null;

  useEffect(() => {
    if (!showCreate) return;
    if (!newSubject) setNewSubject(typeLabel[newType]);
    if (!newFrom) setNewFrom(project?.consultantName || "Project Team");
    if (!newTo) setNewTo(project?.contractorName || project?.clientName || "Recipient");
    if (!newDueDate) {
      const due = new Date();
      due.setDate(due.getDate() + 7);
      setNewDueDate(due.toISOString().split("T")[0]);
    }
  }, [showCreate, newType, newSubject, newFrom, newTo, newDueDate, project]);

  const summary = useMemo(() => {
    return projectRecords.reduce(
      (acc, record) => {
        if (record.status === "open") acc.open += 1;
        if (record.status === "pending-approval") acc.pendingApproval += 1;
        if (record.status === "approved") acc.approved += 1;
        if (record.type === "variation-order") {
          acc.variationEstimate += toNumber(record.estimatedValue);
          acc.variationApproved += toNumber(record.approvedValue);
        }
        return acc;
      },
      { open: 0, pendingApproval: 0, approved: 0, variationEstimate: 0, variationApproved: 0 }
    );
  }, [projectRecords]);

  if (!activeRecord) {
    return (
      <div className="animate-fade-in">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-bold tracking-tight">Correspondence</h2>
            <p className="text-xs text-txt-muted mt-0.5">
              Manage instructions, RFIs, submittals, meeting minutes, claims, and variation orders with approvals.
            </p>
          </div>
          <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
            <Plus size={14} /> New Record
          </Button>
        </div>

        {projectRecords.length > 0 && (
          <div className="grid grid-cols-5 gap-3 mb-5">
            {[
              { label: "Open", value: summary.open, suffix: "items", color: "warn" },
              { label: "Pending Approval", value: summary.pendingApproval, suffix: "items", color: "accent" },
              { label: "Approved", value: summary.approved, suffix: "items", color: "ok" },
              { label: "Variation Estimate", value: `${project?.currency || "USD"} ${currency(summary.variationEstimate)}`, suffix: "", color: "warn" },
              { label: "Variation Approved", value: `${project?.currency || "USD"} ${currency(summary.variationApproved)}`, suffix: "", color: "ok" },
            ].map((card) => (
              <div key={card.label} className="bg-bg-surface border border-border rounded-xl p-4">
                <div className="text-[10px] uppercase tracking-wider text-txt-dim mb-2">{card.label}</div>
                <div className="text-lg font-bold">{card.value}{card.suffix ? ` ${card.suffix}` : ""}</div>
                <Badge color={card.color as any} className="mt-3">Register Snapshot</Badge>
              </div>
            ))}
          </div>
        )}

        {projectRecords.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-20 h-20 rounded-2xl bg-accent/10 flex items-center justify-center mb-5">
              <Mail size={32} className="text-accent opacity-60" />
            </div>
            <p className="text-txt-muted text-sm font-medium">No correspondence records yet</p>
            <p className="text-xs text-txt-dim mt-1.5 max-w-[330px] text-center">
              Start your project register with instructions, RFIs, submittals, meeting minutes, claim notices, and variation orders.
            </p>
            <Button variant="primary" size="md" className="mt-5" onClick={() => setShowCreate(true)}>
              <Plus size={14} /> Create First Record
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {projectRecords
              .sort((a, b) => b.date.localeCompare(a.date))
              .map((record, idx) => (
                <div
                  key={record.id}
                  onClick={() => {
                    setActiveRecordId(record.id);
                    setIsEditMode(false);
                  }}
                  className="group flex items-center justify-between p-4 bg-bg-surface border border-border rounded-xl cursor-pointer transition-all duration-200 hover:border-accent/50 hover:shadow-lg hover:shadow-accent/5"
                  style={{ animationDelay: `${idx * 60}ms`, animationFillMode: "both" }}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-accent/20 to-accent/5 flex items-center justify-center flex-shrink-0">
                      <span className="text-accent font-bold font-mono text-sm">{typeShortCode[record.type]}</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">{record.subject}</span>
                        <Badge color={typeColor[record.type]}>{typeLabel[record.type].toUpperCase()}</Badge>
                        <Badge color={statusColor(record.status)}>{record.status.toUpperCase()}</Badge>
                      </div>
                      <div className="flex gap-3 mt-1.5 text-[11px] text-txt-dim">
                        <span>{record.referenceNo}</span>
                        <span>•</span>
                        <span>{record.date}</span>
                        <span>•</span>
                        <span>Due {record.dueDate || "—"}</span>
                        {record.type === "variation-order" && (
                          <>
                            <span>•</span>
                            <span>{project?.currency || "USD"} {currency(record.estimatedValue || "0")}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        duplicateCorrespondenceRecord(record.id);
                      }}
                      className="p-1.5 rounded-md bg-transparent border-none text-txt-dim hover:text-accent hover:bg-accent/10 cursor-pointer transition-colors"
                      title="Duplicate"
                    >
                      <Copy size={14} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteCorrespondenceRecord(record.id);
                        if (activeRecordId === record.id) setActiveRecordId(null);
                      }}
                      className="p-1.5 rounded-md bg-transparent border-none text-txt-dim hover:text-err hover:bg-err/10 cursor-pointer transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                    <ChevronRight size={16} className="text-txt-dim group-hover:text-accent transition-colors" />
                  </div>
                </div>
              ))}
          </div>
        )}

        <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Correspondence Record" width={580}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-txt-dim mb-1.5 font-medium">Type</label>
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as CorrespondenceType)}
                  className="w-full px-3 py-2.5 bg-bg-input border border-border rounded-lg text-sm text-txt outline-none focus:border-accent transition-colors"
                >
                  {Object.entries(typeLabel).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-txt-dim mb-1.5 font-medium">Due Date</label>
                <input
                  type="date"
                  value={newDueDate}
                  onChange={(e) => setNewDueDate(e.target.value)}
                  className="w-full px-3 py-2.5 bg-bg-input border border-border rounded-lg text-sm text-txt outline-none focus:border-accent transition-colors"
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-txt-dim mb-1.5 font-medium">Subject</label>
              <input
                value={newSubject}
                onChange={(e) => setNewSubject(e.target.value)}
                className="w-full px-3 py-2.5 bg-bg-input border border-border rounded-lg text-sm text-txt outline-none focus:border-accent transition-colors"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-txt-dim mb-1.5 font-medium">From</label>
                <input
                  value={newFrom}
                  onChange={(e) => setNewFrom(e.target.value)}
                  className="w-full px-3 py-2.5 bg-bg-input border border-border rounded-lg text-sm text-txt outline-none focus:border-accent transition-colors"
                />
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-txt-dim mb-1.5 font-medium">To</label>
                <input
                  value={newTo}
                  onChange={(e) => setNewTo(e.target.value)}
                  className="w-full px-3 py-2.5 bg-bg-input border border-border rounded-lg text-sm text-txt outline-none focus:border-accent transition-colors"
                />
              </div>
            </div>
          </div>
          <div className="flex gap-3 mt-5 pt-4 border-t border-border">
            <Button variant="ghost" onClick={() => setShowCreate(false)} className="flex-1 justify-center">Cancel</Button>
            <Button
              variant="primary"
              className="flex-1 justify-center"
              onClick={() => {
                const now = new Date().toISOString();
                const date = now.split("T")[0];
                const count = projectRecords.length + 1;
                const record: CorrespondenceRecord = {
                  id: uuid(),
                  project_id: project?.id || "",
                  number: count,
                  type: newType,
      referenceNo: `${(project?.contractNumber || project?.code || "PB").toUpperCase()}/${typeShortCode[newType]}/${String(count).padStart(2, "0")}`,
                  subject: newSubject || typeLabel[newType],
                  date,
                  dueDate: newDueDate,
                  from: newFrom || project?.consultantName || "Project Team",
                  to: newTo || project?.contractorName || project?.clientName || "Recipient",
                  status: "draft",
                  body: defaultBody(newType, newSubject || typeLabel[newType]),
                  estimatedValue: "",
                  approvedValue: "",
                  timeImpactDays: "",
                  approvalSteps: defaultApprovalSteps(),
                  createdAt: now,
                  updatedAt: now,
                };
                addCorrespondenceRecord(record);
                setShowCreate(false);
                setActiveRecordId(record.id);
                setIsEditMode(true);
                setNewSubject("");
              }}
            >
              Create Record
            </Button>
          </div>
        </Modal>
      </div>
    );
  }

  const linkedDocument = projectDocuments.find((doc) => doc.id === activeRecord.linkedDocumentId);
  const linkedProgress = projectProgress.find((report) => report.id === activeRecord.linkedProgressReportId);
  const linkedCertificate = projectCertificates.find((cert) => cert.id === activeRecord.linkedCertificateId);

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Button size="sm" variant="ghost" onClick={() => { setActiveRecordId(null); setIsEditMode(false); }}>
            <ArrowLeft size={14} /> Back
          </Button>
          <div className="h-5 w-px bg-border" />
          <div>
            <h2 className="text-lg font-bold">{activeRecord.subject}</h2>
            <p className="text-xs text-txt-muted mt-0.5">{activeRecord.referenceNo}</p>
          </div>
          <Badge color={typeColor[activeRecord.type]}>{typeLabel[activeRecord.type].toUpperCase()}</Badge>
          <Badge color={statusColor(activeRecord.status)}>{activeRecord.status.toUpperCase()}</Badge>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="default" onClick={() => duplicateCorrespondenceRecord(activeRecord.id)}>
            <Copy size={14} /> Duplicate
          </Button>
          {isEditMode ? (
            <Button size="sm" variant="primary" onClick={() => setIsEditMode(false)}>Done</Button>
          ) : (
            <Button size="sm" variant="primary" onClick={() => setIsEditMode(true)}>
              <Pencil size={14} /> Edit
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-5">
        <div className="bg-bg-surface border border-border rounded-xl p-4">
          <div className="text-[10px] uppercase tracking-wider text-txt-dim mb-2">From / To</div>
          <div className="text-sm font-semibold">{activeRecord.from}</div>
          <div className="text-xs text-txt-muted mt-1">to {activeRecord.to}</div>
        </div>
        <div className="bg-bg-surface border border-border rounded-xl p-4">
          <div className="text-[10px] uppercase tracking-wider text-txt-dim mb-2">Dates</div>
          <div className="text-sm font-semibold">{activeRecord.date}</div>
          <div className="text-xs text-txt-muted mt-1">Due {activeRecord.dueDate || "—"}</div>
        </div>
        <div className="bg-bg-surface border border-border rounded-xl p-4">
          <div className="text-[10px] uppercase tracking-wider text-txt-dim mb-2">Linked Reference</div>
          <div className="text-sm font-semibold">{formatLinkedLabel({ document: linkedDocument, progress: linkedProgress, certificate: linkedCertificate })}</div>
        </div>
        <div className="bg-bg-surface border border-border rounded-xl p-4">
          <div className="text-[10px] uppercase tracking-wider text-txt-dim mb-2">Variation Impact</div>
          <div className="text-sm font-semibold">{project?.currency || "USD"} {currency(activeRecord.estimatedValue || "0")}</div>
          <div className="text-xs text-txt-muted mt-1">{activeRecord.timeImpactDays || "0"} days</div>
        </div>
      </div>

      <div className="bg-bg-surface border border-border rounded-xl p-4 space-y-5">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-txt-dim mb-1.5 font-medium">Subject</label>
            <input
              value={activeRecord.subject}
              disabled={!isEditMode}
              onChange={(e) => updateCorrespondenceRecord(activeRecord.id, { subject: e.target.value })}
              className="w-full px-3 py-2.5 bg-bg-input border border-border rounded-lg text-sm text-txt outline-none focus:border-accent transition-colors disabled:opacity-70"
            />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-txt-dim mb-1.5 font-medium">Status</label>
            <select
              value={activeRecord.status}
              disabled={!isEditMode}
              onChange={(e) => updateCorrespondenceRecord(activeRecord.id, { status: e.target.value as CorrespondenceRecord["status"] })}
              className="w-full px-3 py-2.5 bg-bg-input border border-border rounded-lg text-sm text-txt outline-none focus:border-accent transition-colors disabled:opacity-70"
            >
              <option value="draft">Draft</option>
              <option value="open">Open</option>
              <option value="pending-approval">Pending Approval</option>
              <option value="approved">Approved</option>
              <option value="closed">Closed</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-txt-dim mb-1.5 font-medium">Type</label>
            <select
              value={activeRecord.type}
              disabled={!isEditMode}
              onChange={(e) => updateCorrespondenceRecord(activeRecord.id, { type: e.target.value as CorrespondenceType })}
              className="w-full px-3 py-2.5 bg-bg-input border border-border rounded-lg text-sm text-txt outline-none focus:border-accent transition-colors disabled:opacity-70"
            >
              {Object.entries(typeLabel).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3">
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-txt-dim mb-1.5 font-medium">Date</label>
            <input
              type="date"
              value={activeRecord.date}
              disabled={!isEditMode}
              onChange={(e) => updateCorrespondenceRecord(activeRecord.id, { date: e.target.value })}
              className="w-full px-3 py-2.5 bg-bg-input border border-border rounded-lg text-sm text-txt outline-none focus:border-accent transition-colors disabled:opacity-70"
            />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-txt-dim mb-1.5 font-medium">Due Date</label>
            <input
              type="date"
              value={activeRecord.dueDate}
              disabled={!isEditMode}
              onChange={(e) => updateCorrespondenceRecord(activeRecord.id, { dueDate: e.target.value })}
              className="w-full px-3 py-2.5 bg-bg-input border border-border rounded-lg text-sm text-txt outline-none focus:border-accent transition-colors disabled:opacity-70"
            />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-txt-dim mb-1.5 font-medium">From</label>
            <input
              value={activeRecord.from}
              disabled={!isEditMode}
              onChange={(e) => updateCorrespondenceRecord(activeRecord.id, { from: e.target.value })}
              className="w-full px-3 py-2.5 bg-bg-input border border-border rounded-lg text-sm text-txt outline-none focus:border-accent transition-colors disabled:opacity-70"
            />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-txt-dim mb-1.5 font-medium">To</label>
            <input
              value={activeRecord.to}
              disabled={!isEditMode}
              onChange={(e) => updateCorrespondenceRecord(activeRecord.id, { to: e.target.value })}
              className="w-full px-3 py-2.5 bg-bg-input border border-border rounded-lg text-sm text-txt outline-none focus:border-accent transition-colors disabled:opacity-70"
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-txt-dim mb-1.5 font-medium">Linked Document</label>
            <select
              value={activeRecord.linkedDocumentId || ""}
              disabled={!isEditMode}
              onChange={(e) => updateCorrespondenceRecord(activeRecord.id, { linkedDocumentId: e.target.value || undefined })}
              className="w-full px-3 py-2.5 bg-bg-input border border-border rounded-lg text-sm text-txt outline-none focus:border-accent transition-colors disabled:opacity-70"
            >
              <option value="">None</option>
              {projectDocuments.map((doc) => (
                <option key={doc.id} value={doc.id}>{doc.title}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-txt-dim mb-1.5 font-medium">Linked Progress</label>
            <select
              value={activeRecord.linkedProgressReportId || ""}
              disabled={!isEditMode}
              onChange={(e) => updateCorrespondenceRecord(activeRecord.id, { linkedProgressReportId: e.target.value || undefined })}
              className="w-full px-3 py-2.5 bg-bg-input border border-border rounded-lg text-sm text-txt outline-none focus:border-accent transition-colors disabled:opacity-70"
            >
              <option value="">None</option>
              {projectProgress.map((report) => (
                <option key={report.id} value={report.id}>{report.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-txt-dim mb-1.5 font-medium">Linked Certificate</label>
            <select
              value={activeRecord.linkedCertificateId || ""}
              disabled={!isEditMode}
              onChange={(e) => updateCorrespondenceRecord(activeRecord.id, { linkedCertificateId: e.target.value || undefined })}
              className="w-full px-3 py-2.5 bg-bg-input border border-border rounded-lg text-sm text-txt outline-none focus:border-accent transition-colors disabled:opacity-70"
            >
              <option value="">None</option>
              {projectCertificates.map((cert) => (
                <option key={cert.id} value={cert.id}>
                  {cert.type === "final" ? "FPC" : "IPC"} {cert.number.toString().padStart(2, "0")}
                </option>
              ))}
            </select>
          </div>
        </div>

        {(activeRecord.type === "variation-order" || activeRecord.type === "claim-notice") && (
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-txt-dim mb-1.5 font-medium">Estimated Value</label>
              <input
                value={activeRecord.estimatedValue || ""}
                disabled={!isEditMode}
                onChange={(e) => updateCorrespondenceRecord(activeRecord.id, { estimatedValue: e.target.value })}
                className="w-full px-3 py-2.5 bg-bg-input border border-border rounded-lg text-sm text-txt outline-none focus:border-accent transition-colors disabled:opacity-70"
              />
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-txt-dim mb-1.5 font-medium">Approved Value</label>
              <input
                value={activeRecord.approvedValue || ""}
                disabled={!isEditMode}
                onChange={(e) => updateCorrespondenceRecord(activeRecord.id, { approvedValue: e.target.value })}
                className="w-full px-3 py-2.5 bg-bg-input border border-border rounded-lg text-sm text-txt outline-none focus:border-accent transition-colors disabled:opacity-70"
              />
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-txt-dim mb-1.5 font-medium">Time Impact (days)</label>
              <input
                value={activeRecord.timeImpactDays || ""}
                disabled={!isEditMode}
                onChange={(e) => updateCorrespondenceRecord(activeRecord.id, { timeImpactDays: e.target.value })}
                className="w-full px-3 py-2.5 bg-bg-input border border-border rounded-lg text-sm text-txt outline-none focus:border-accent transition-colors disabled:opacity-70"
              />
            </div>
          </div>
        )}

        <div>
          <label className="block text-[11px] uppercase tracking-wider text-txt-dim mb-1.5 font-medium">Body</label>
          {isEditMode ? (
            <textarea
              value={activeRecord.body}
              onChange={(e) => updateCorrespondenceRecord(activeRecord.id, { body: e.target.value })}
              className="w-full min-h-[220px] px-4 py-3 bg-bg-input border border-border rounded-xl text-sm text-txt outline-none focus:border-accent transition-colors resize-y"
            />
          ) : (
            <pre className="whitespace-pre-wrap text-sm leading-7 text-txt-muted bg-bg-input border border-border rounded-xl p-4 overflow-auto min-h-[220px]">
              {activeRecord.body}
            </pre>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold">Approval Workflow</h3>
              <p className="text-xs text-txt-dim mt-0.5">Track internal review and employer/consultant approvals.</p>
            </div>
            <Badge color="accent">{activeRecord.approvalSteps.length} Steps</Badge>
          </div>
          <div className="overflow-auto border border-border rounded-xl">
            <div className="space-y-3 p-3 lg:hidden">
              {activeRecord.approvalSteps.map((step) => (
                <div key={`${step.id}-compact`} className="rounded-2xl border border-border bg-bg-raised/40 p-4">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-txt-dim">Role</div>
                      <div className="mt-1 text-sm font-semibold text-txt">{step.role}</div>
                    </div>
                    {isEditMode ? (
                      <select
                        value={step.status}
                        onChange={(e) =>
                          updateApprovalStep(activeRecord.id, step.id, {
                            status: e.target.value as ApprovalStep["status"],
                            date: e.target.value === "pending" ? "" : new Date().toISOString().split("T")[0],
                          })
                        }
                        className="rounded-xl border border-border bg-bg-input px-3 py-2 text-xs font-semibold text-txt outline-none focus:border-accent"
                      >
                        <option value="pending">Pending</option>
                        <option value="approved">Approved</option>
                        <option value="rejected">Rejected</option>
                      </select>
                    ) : (
                      <Badge color={approvalColor(step.status)}>{step.status.toUpperCase()}</Badge>
                    )}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label>
                      <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.14em] text-txt-dim">Reviewer</span>
                      {isEditMode ? (
                        <input
                          value={step.reviewer}
                          onChange={(e) => updateApprovalStep(activeRecord.id, step.id, { reviewer: e.target.value })}
                          className="w-full rounded-xl border border-border bg-bg-input px-3 py-2 text-sm text-txt outline-none focus:border-accent"
                        />
                      ) : (
                        <div className="rounded-xl border border-border bg-bg-surface px-3 py-2 text-sm text-txt">{step.reviewer || "—"}</div>
                      )}
                    </label>
                    <label>
                      <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.14em] text-txt-dim">Date</span>
                      {isEditMode ? (
                        <input
                          type="date"
                          value={step.date}
                          onChange={(e) => updateApprovalStep(activeRecord.id, step.id, { date: e.target.value })}
                          className="w-full rounded-xl border border-border bg-bg-input px-3 py-2 text-sm text-txt outline-none focus:border-accent [color-scheme:dark]"
                        />
                      ) : (
                        <div className="rounded-xl border border-border bg-bg-surface px-3 py-2 text-sm text-txt-muted">{step.date || "—"}</div>
                      )}
                    </label>
                  </div>
                  <label className="mt-3 block">
                    <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.14em] text-txt-dim">Comments</span>
                    {isEditMode ? (
                      <input
                        value={step.comments}
                        onChange={(e) => updateApprovalStep(activeRecord.id, step.id, { comments: e.target.value })}
                        className="w-full rounded-xl border border-border bg-bg-input px-3 py-2 text-sm text-txt outline-none focus:border-accent"
                      />
                    ) : (
                      <div className="rounded-xl border border-border bg-bg-surface px-3 py-2 text-sm text-txt-muted">{step.comments || "—"}</div>
                    )}
                  </label>
                </div>
              ))}
            </div>
            <table className="hidden w-full border-collapse lg:table" style={{ minWidth: 760 }}>
              <thead>
                <tr>
                  {["Role", "Reviewer", "Status", "Date", "Comments"].map((heading) => (
                    <th key={heading} className="px-3 py-2 bg-bg-raised border-b border-border text-[10px] uppercase tracking-wider text-txt-dim text-left">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeRecord.approvalSteps.map((step) => (
                  <tr key={step.id} className="hover:bg-bg-hover transition-colors">
                    <td className="px-3 py-3 border-b border-border text-sm font-medium">{step.role}</td>
                    <td className="px-3 py-3 border-b border-border text-sm">
                      {isEditMode ? (
                        <input
                          value={step.reviewer}
                          onChange={(e) => updateApprovalStep(activeRecord.id, step.id, { reviewer: e.target.value })}
                          className="w-full px-2 py-1 bg-transparent border border-border rounded outline-none focus:border-accent"
                        />
                      ) : (
                        step.reviewer || "—"
                      )}
                    </td>
                    <td className="px-3 py-3 border-b border-border text-sm">
                      {isEditMode ? (
                        <select
                          value={step.status}
                          onChange={(e) =>
                            updateApprovalStep(activeRecord.id, step.id, {
                              status: e.target.value as ApprovalStep["status"],
                              date: e.target.value === "pending" ? "" : new Date().toISOString().split("T")[0],
                            })
                          }
                          className="w-full px-2 py-1 bg-bg-input border border-border rounded outline-none focus:border-accent"
                        >
                          <option value="pending">Pending</option>
                          <option value="approved">Approved</option>
                          <option value="rejected">Rejected</option>
                        </select>
                      ) : (
                        <Badge color={approvalColor(step.status)}>{step.status.toUpperCase()}</Badge>
                      )}
                    </td>
                    <td className="px-3 py-3 border-b border-border text-sm text-txt-muted">
                      {isEditMode ? (
                        <input
                          type="date"
                          value={step.date}
                          onChange={(e) => updateApprovalStep(activeRecord.id, step.id, { date: e.target.value })}
                          className="w-full px-2 py-1 bg-transparent border border-border rounded outline-none focus:border-accent"
                        />
                      ) : (
                        step.date || "—"
                      )}
                    </td>
                    <td className="px-3 py-3 border-b border-border text-sm min-w-[220px]">
                      {isEditMode ? (
                        <input
                          value={step.comments}
                          onChange={(e) => updateApprovalStep(activeRecord.id, step.id, { comments: e.target.value })}
                          className="w-full px-2 py-1 bg-transparent border border-border rounded outline-none focus:border-accent"
                        />
                      ) : (
                        step.comments || "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            variant="danger"
            onClick={() => {
              deleteCorrespondenceRecord(activeRecord.id);
              setActiveRecordId(null);
              setIsEditMode(false);
            }}
          >
            <Trash2 size={14} /> Delete Record
          </Button>
        </div>
      </div>
    </div>
  );
}
