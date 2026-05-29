"use client";

import { type ReactNode, useMemo, useState } from "react";
import { v4 as uuid } from "uuid";
import {
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Copy,
  Plus,
  Printer,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { getLiveMeetingActionItems, useAppStore } from "@/lib/store";
import type {
  MeetingActionItem,
  MeetingActionProjectGroup,
  MeetingAgendaItem,
  MeetingAttendee,
  MeetingAttendeeGroup,
  MeetingMinute,
  MeetingSeries,
  Project,
} from "@/lib/supabase";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import CompactKpiList from "@/components/ui/CompactKpiList";
import RichTextEditor from "@/components/ui/RichTextEditor";
import { sanitizeRichTextHtml, stripRichTextToPlain } from "@/lib/richText";

const todayIso = () => new Date().toISOString().split("T")[0];

const meetingEditableCellClass =
  "w-full border-0 bg-transparent p-0 text-sm leading-5 text-txt outline-none placeholder:text-txt-dim/70 focus:bg-transparent focus:ring-0";

const meetingEditableSelectClass =
  "w-full border-0 bg-transparent p-0 text-sm leading-5 text-txt outline-none focus:bg-bg-raised focus:ring-0";

const resizeMeetingTextarea = (element: HTMLTextAreaElement) => {
  element.style.height = "0px";
  element.style.height = `${element.scrollHeight}px`;
};

const cloneAttendee = (attendee: MeetingAttendee): MeetingAttendee => ({
  ...attendee,
  id: uuid(),
});

const cloneMinute = (minute: MeetingMinute): MeetingMinute => ({
  ...minute,
  attendees: minute.attendees.map((attendee) => ({ ...attendee })),
  agendas: minute.agendas.map((agenda) => ({ ...agenda })),
  actionGroups: minute.actionGroups.map((group) => ({
    ...group,
    actionItems: group.actionItems.map((actionItem) => ({ ...actionItem })),
  })),
});

const createEmptyAttendee = (): MeetingAttendee => ({
  id: uuid(),
  name: "",
  designation: "",
  organization: "",
});

const createEmptyAgenda = (): MeetingAgendaItem => ({
  id: uuid(),
  title: "",
  discussion: "",
});

const createEmptyActionItem = (projectId: string): MeetingActionItem => ({
  id: uuid(),
  actionKey: uuid(),
  project_id: projectId,
  description: "",
  responsiblePerson: "",
  deadline: "",
  status: "open",
  priority: "medium",
  notes: "",
});

const createEmptySeries = (): MeetingSeries => ({
  id: uuid(),
  name: "",
  description: "",
  cadence: "biweekly",
  projectIds: [],
  defaultAttendees: [],
  defaultAgendas: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

const createEmptyGroup = (): MeetingAttendeeGroup => ({
  id: uuid(),
  name: "",
  members: [createEmptyAttendee()],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

const statusBadge = (status: MeetingActionItem["status"]) =>
  status === "closed" ? "ok" : status === "in-progress" ? "accent" : "warn";

const escapeMeetingPrintHtml = (value: string | number | null | undefined) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const meetingStatusLabel = (status: MeetingMinute["status"]) =>
  status === "final" ? "Final" : "Draft";

const meetingActionStatusLabel = (status: MeetingActionItem["status"]) =>
  status === "in-progress" ? "In Progress" : status.charAt(0).toUpperCase() + status.slice(1);

const meetingPrintDate = (value: string) => {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const meetingPrintStyles = () => `
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    background: #f1f5f9;
    color: #111827;
    font-family: Arial, Helvetica, sans-serif;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  body { font-size: 11px; line-height: 1.45; }
  .print-root { padding: 18px 0 36px; }
  .page {
    width: 210mm;
    min-height: 297mm;
    margin: 0 auto 18px;
    background: #ffffff;
    box-shadow: 0 18px 60px rgba(15, 23, 42, 0.18);
  }
  .page-inner { padding: 18mm 16mm 16mm; }
  .letterhead {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 12px;
    align-items: center;
    border-bottom: 2px solid #111827;
    padding-bottom: 12px;
    margin-bottom: 18px;
  }
  .logo-mark {
    width: 48px;
    height: 48px;
    border: 1.5px solid #0f172a;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 800;
    letter-spacing: 0.08em;
    color: #0f172a;
  }
  .logo-mark img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .logo-mark-empty { display: none; }
  .brand-name {
    font-size: 18px;
    font-weight: 800;
    color: #0f172a;
    overflow-wrap: anywhere;
  }
  .brand-subtitle {
    margin-top: 3px;
    font-size: 10px;
    color: #334155;
    overflow-wrap: anywhere;
  }
  h1 {
    margin: 0;
    font-size: 25px;
    line-height: 1.16;
    color: #0f172a;
    overflow-wrap: anywhere;
  }
  .title-row {
    margin-bottom: 14px;
  }
  .meta-label,
  th {
    font-size: 8px;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    color: #64748b;
    font-weight: 800;
  }
  .meta-value {
    font-size: 10px;
    color: #111827;
    font-weight: 700;
    overflow-wrap: anywhere;
  }
  .meta-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 16px;
    border-top: 1px solid #dbe3ef;
    border-bottom: 1px solid #dbe3ef;
    padding: 8px 0;
    margin: 12px 0 16px;
  }
  .meta-item {
    border: 0;
    padding: 0;
    min-width: 0;
    display: inline-flex;
    align-items: baseline;
    gap: 6px;
  }
  .section {
    margin-top: 15px;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .section-title {
    border-top: 1.5px solid #111827;
    padding-top: 8px;
    margin-bottom: 8px;
  }
  .section-title h2 {
    margin: 0;
    font-size: 13px;
    color: #111827;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    color: #111827;
  }
  th, td {
    border: 1px solid #cbd5e1;
    padding: 6px 7px;
    vertical-align: top;
    overflow-wrap: anywhere;
    word-break: normal;
  }
  th {
    background: #f1f5f9;
    color: #334155;
  }
  .number-col {
    width: 5%;
    text-align: center;
  }
  td { font-size: 10px; }
  .empty {
    border: 1px dashed #cbd5e1;
    padding: 12px;
    color: #475569;
    font-style: italic;
  }
  .agenda-card {
    border: 1px solid #cbd5e1;
    margin-bottom: 8px;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .agenda-heading {
    display: grid;
    grid-template-columns: 40px 1fr;
    border-bottom: 1px solid #cbd5e1;
    background: #f8fafc;
  }
  .agenda-index {
    border-right: 1px solid #cbd5e1;
    padding: 7px;
    text-align: center;
    font-weight: 800;
    color: #0f172a;
  }
  .agenda-title {
    padding: 7px 9px;
    font-weight: 800;
    color: #0f172a;
    overflow-wrap: anywhere;
  }
  .agenda-discussion {
    padding: 9px;
    min-height: 32px;
    color: #111827;
    white-space: normal;
    overflow-wrap: anywhere;
  }
  .agenda-discussion p { margin: 0 0 6px; }
  .agenda-discussion p:last-child { margin-bottom: 0; }
  .agenda-discussion ul { list-style: disc; margin: 0 0 6px; padding-left: 22px; }
  .agenda-discussion ol { list-style: decimal; margin: 0 0 6px; padding-left: 22px; }
  .agenda-discussion li { margin-bottom: 2px; }
  .agenda-discussion strong { font-weight: 700; color: #0f172a; }
  .agenda-discussion u { text-underline-offset: 2px; }
  .project-group {
    margin-bottom: 10px;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .project-group-title {
    padding: 7px 9px;
    border: 1px solid #cbd5e1;
    border-bottom: none;
    background: #eef2f7;
    font-weight: 800;
    color: #0f172a;
    overflow-wrap: anywhere;
  }
  .notes {
    margin-top: 4px;
    color: #475569;
    font-size: 9px;
  }
  .signature-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
    margin-top: 26px;
    break-inside: avoid;
  }
  .signature-box {
    padding-top: 28px;
    border-top: 1px solid #111827;
    color: #111827;
  }
  .signature-role {
    margin-top: 3px;
    color: #64748b;
    font-size: 9px;
  }
  .footer {
    margin-top: 16px;
    border-top: 1px solid #cbd5e1;
    padding-top: 8px;
    color: #64748b;
    font-size: 8px;
    display: flex;
    justify-content: space-between;
    gap: 12px;
  }
  @page { size: A4; margin: 14mm 13mm 16mm; }
  @media print {
    html, body { background: #ffffff; }
    .print-root { padding: 0; }
    .page {
      width: auto;
      min-height: auto;
      margin: 0;
      box-shadow: none;
    }
    .page-inner { padding: 0; }
    .section { break-inside: avoid; page-break-inside: avoid; }
    tr { break-inside: avoid; page-break-inside: avoid; }
  }
`;

function buildMeetingMinutePrintHtml(minute: MeetingMinute, projects: Project[]) {
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const involvedProjects = minute.actionGroups
    .map((group) => projectById.get(group.project_id))
    .filter(Boolean) as Project[];
  const brandingProject = involvedProjects[0] || projects[0] || null;
  const branding = brandingProject?.documentBranding;
  const brandName =
    branding?.issuerDisplayName ||
    brandingProject?.consultantName ||
    brandingProject?.clientName ||
    "Planovera Project Controls";
  const brandSubtitle =
    branding?.headerTagline ||
    brandingProject?.contractTitle ||
    brandingProject?.name ||
    "Professional meeting minutes and action register";
  const logo = branding?.clientLogoDataUrl;
  const projectNames =
    involvedProjects.length > 0
      ? Array.from(new Set(involvedProjects.map((project) => project.name))).join(", ")
      : "Portfolio meeting";
  const preparedDate = meetingPrintDate(minute.updatedAt || minute.createdAt);

  const attendeeRows = minute.attendees
    .map(
      (attendee, index) => `
        <tr>
          <td class="number-col">${index + 1}</td>
          <td style="width:39%">${escapeMeetingPrintHtml(attendee.name || "Unnamed attendee")}</td>
          <td style="width:28%">${escapeMeetingPrintHtml(attendee.designation || "-")}</td>
          <td style="width:28%">${escapeMeetingPrintHtml(attendee.organization || "-")}</td>
        </tr>
      `
    )
    .join("");

  const agendaHtml = minute.agendas.length
    ? minute.agendas
        .map(
          (agenda, index) => `
            <div class="agenda-card">
              <div class="agenda-heading">
                <div class="agenda-index">${index + 1}</div>
                <div class="agenda-title">${escapeMeetingPrintHtml(agenda.title || "Agenda topic")}</div>
              </div>
              <div class="agenda-discussion">${
                agenda.discussion && stripRichTextToPlain(agenda.discussion)
                  ? sanitizeRichTextHtml(agenda.discussion)
                  : "No discussion notes recorded."
              }</div>
            </div>
          `
        )
        .join("")
    : `<div class="empty">No agenda items recorded.</div>`;

  const actionGroupsHtml = minute.actionGroups.length
    ? minute.actionGroups
        .map((group) => {
          const projectName = projectById.get(group.project_id)?.name || "Unassigned project";
          const rows = group.actionItems
            .map(
              (actionItem, index) => `
                <tr>
                  <td style="width:6%">${index + 1}</td>
                  <td style="width:48%">
                    ${escapeMeetingPrintHtml(actionItem.description || "Action item")}
                  </td>
                  <td style="width:20%">${escapeMeetingPrintHtml(actionItem.responsiblePerson || "-")}</td>
                  <td style="width:13%">${escapeMeetingPrintHtml(meetingPrintDate(actionItem.deadline))}</td>
                  <td style="width:13%">${escapeMeetingPrintHtml(meetingActionStatusLabel(actionItem.status))}</td>
                </tr>
              `
            )
            .join("");

          return `
            <div class="project-group">
              <div class="project-group-title">${escapeMeetingPrintHtml(projectName)}</div>
              ${
                rows
                  ? `
                    <table>
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Action Item</th>
                          <th>Responsible</th>
                          <th>Deadline</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>${rows}</tbody>
                    </table>
                  `
                  : `<div class="empty">No action items recorded for this project.</div>`
              }
            </div>
          `;
        })
        .join("")
    : `<div class="empty">No project action register recorded.</div>`;

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeMeetingPrintHtml(minute.title || "Meeting Minutes")}</title>
        <style>${meetingPrintStyles()}</style>
      </head>
      <body>
        <div class="print-root">
          <section class="page">
            <div class="page-inner">
              <div class="letterhead">
                <div class="${logo ? "logo-mark" : "logo-mark-empty"}">${
                  logo
                    ? `<img src="${escapeMeetingPrintHtml(logo)}" alt="Logo" />`
                    : ""
                }</div>
                <div>
                  <div class="brand-name">${escapeMeetingPrintHtml(brandName)}</div>
                  <div class="brand-subtitle">${escapeMeetingPrintHtml(brandSubtitle)}</div>
                </div>
              </div>

              <div class="title-row">
                <h1>${escapeMeetingPrintHtml(minute.title || "Meeting Minutes")}</h1>
              </div>

              <div class="meta-grid">
                <div class="meta-item"><div class="meta-label">Meeting Date</div><div class="meta-value">${escapeMeetingPrintHtml(meetingPrintDate(minute.meetingDate))}</div></div>
                <div class="meta-item"><div class="meta-label">Reference</div><div class="meta-value">${escapeMeetingPrintHtml(minute.referenceNo || "Not set")}</div></div>
                <div class="meta-item"><div class="meta-label">Project(s)</div><div class="meta-value">${escapeMeetingPrintHtml(projectNames)}</div></div>
                <div class="meta-item"><div class="meta-label">Attendees</div><div class="meta-value">${minute.attendees.length}</div></div>
                <div class="meta-item"><div class="meta-label">Prepared / Updated</div><div class="meta-value">${escapeMeetingPrintHtml(preparedDate)}</div></div>
              </div>

              <section class="section">
                <div class="section-title"><h2>Attendance</h2></div>
                ${
                  attendeeRows
                    ? `
                      <table>
                        <thead>
                          <tr>
                            <th class="number-col">#</th>
                            <th>Name</th>
                            <th>Designation</th>
                            <th>Organization</th>
                          </tr>
                        </thead>
                        <tbody>${attendeeRows}</tbody>
                      </table>
                    `
                    : `<div class="empty">No attendees recorded.</div>`
                }
              </section>

              <section class="section">
                <div class="section-title"><h2>Agenda and Discussion</h2></div>
                ${agendaHtml}
              </section>

              <section class="section">
                <div class="section-title"><h2>Project Action Register</h2></div>
                ${actionGroupsHtml}
              </section>

              <div class="signature-grid">
                <div class="signature-box">
                  <strong>Prepared by</strong>
                  <div class="signature-role">Name / Signature / Date</div>
                </div>
                <div class="signature-box">
                  <strong>Chair / Reviewer</strong>
                  <div class="signature-role">Name / Signature / Date</div>
                </div>
              </div>

              <div class="footer">
                <span>${escapeMeetingPrintHtml(minute.referenceNo || "Meeting minutes")}</span>
                <span>Generated from Planovera</span>
              </div>
            </div>
          </section>
        </div>
      </body>
    </html>
  `;
}

function openMeetingMinutePdf(minute: MeetingMinute, projects: Project[]) {
  const html = buildMeetingMinutePrintHtml(minute, projects);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const printWindow = window.open(url, "_blank");

  if (!printWindow) {
    URL.revokeObjectURL(url);
    const frame = document.createElement("iframe");
    frame.style.position = "fixed";
    frame.style.right = "0";
    frame.style.bottom = "0";
    frame.style.width = "0";
    frame.style.height = "0";
    frame.style.border = "0";
    frame.srcdoc = html;
    document.body.appendChild(frame);
    frame.onload = () => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      setTimeout(() => frame.remove(), 1000);
    };
    return;
  }

  let printed = false;
  const triggerPrint = () => {
    if (printed) return;
    printed = true;
    printWindow.focus();
    printWindow.print();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  printWindow.addEventListener?.("load", () => setTimeout(triggerPrint, 250), { once: true });
  setTimeout(triggerPrint, 1200);
}

function createMinuteDraft(
  projects: Project[],
  meetingMinutes: MeetingMinute[],
  series?: MeetingSeries | null,
) {
  const now = new Date().toISOString();
  const date = todayIso();

  // If a series is provided, restrict carry-forward to projects in the series scope.
  const scopedProjectIds = series ? new Set(series.projectIds) : null;
  const scopedProjects = scopedProjectIds
    ? projects.filter((project) => scopedProjectIds.has(project.id))
    : projects;

  const liveActions = getLiveMeetingActionItems(meetingMinutes)
    .filter((action) => action.status !== "closed")
    .filter((action) => (scopedProjectIds ? scopedProjectIds.has(action.project_id) : true));

  const groupsByProject = new Map<string, MeetingActionItem[]>();
  liveActions.forEach((action) => {
    const current = groupsByProject.get(action.project_id) || [];
    current.push({
      id: uuid(),
      actionKey: action.actionKey,
      project_id: action.project_id,
      description: action.description,
      responsiblePerson: action.responsiblePerson,
      deadline: action.deadline,
      status: action.status,
      priority: action.priority,
      notes: action.notes,
      carriedForwardFromMinuteId: action.meetingMinuteId,
    });
    groupsByProject.set(action.project_id, current);
  });

  const actionGroups: MeetingActionProjectGroup[] = Array.from(groupsByProject.entries()).map(
    ([projectId, actionItems]) => ({
      id: uuid(),
      project_id: projectId,
      actionItems,
    })
  );

  // Default attendees from series (deep-copied so future edits to the series don't mutate this minute).
  const defaultAttendees = series?.defaultAttendees?.length
    ? series.defaultAttendees.map((attendee) => ({ ...attendee, id: uuid() }))
    : [];

  // Default agendas from series (deep-copied). Falls back to a single blank agenda.
  const defaultAgendas = series?.defaultAgendas?.length
    ? series.defaultAgendas.map((agenda) => ({ ...agenda, id: uuid() }))
    : [createEmptyAgenda()];

  const fallbackProject = scopedProjects[0] ?? projects[0];

  const titlePrefix = series?.name ? series.name : "Project Review Meeting";

  return {
    id: uuid(),
    title: `${titlePrefix} - ${new Date(date).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })}`,
    meetingDate: date,
    status: "draft" as const,
    referenceNo: `MM-${String(meetingMinutes.length + 1).padStart(3, "0")}`,
    meetingSeriesId: series?.id,
    attendees: defaultAttendees,
    agendas: defaultAgendas,
    actionGroups:
      actionGroups.length > 0 && fallbackProject
        ? actionGroups
        : fallbackProject
        ? [{ id: uuid(), project_id: fallbackProject.id, actionItems: [createEmptyActionItem(fallbackProject.id)] }]
        : [],
    createdAt: now,
    updatedAt: now,
  };
}

function AttendeeGroupsModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { attendeeGroups, saveAttendeeGroup, deleteAttendeeGroup } = useAppStore();
  const [draftGroup, setDraftGroup] = useState<MeetingAttendeeGroup>(createEmptyGroup());
  const [editingId, setEditingId] = useState<string | null>(null);

  const startEdit = (group: MeetingAttendeeGroup) => {
    setDraftGroup({
      ...group,
      members: group.members.map((member) => ({ ...member })),
    });
    setEditingId(group.id);
  };

  const resetDraft = () => {
    setDraftGroup(createEmptyGroup());
    setEditingId(null);
  };

  const saveGroup = () => {
    if (!draftGroup.name.trim()) return;
    const cleanMembers = draftGroup.members
      .map((member) => ({
        ...member,
        name: member.name.trim(),
        designation: member.designation.trim(),
        organization: member.organization.trim(),
      }))
      .filter((member) => member.name);

    if (cleanMembers.length === 0) return;

    saveAttendeeGroup({
      ...draftGroup,
      id: editingId || draftGroup.id,
      name: draftGroup.name.trim(),
      members: cleanMembers,
      createdAt: editingId ? draftGroup.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    resetDraft();
  };

  return (
    <Modal open={open} onClose={onClose} title="Attendee Groups" width={980}>
      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-3">
          <div className="rounded-2xl border border-border bg-bg-raised p-4">
            <div className="text-[11px] uppercase tracking-[0.18em] text-txt-dim">Saved Groups</div>
            <div className="mt-3 flex flex-col gap-2">
              {attendeeGroups.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-4 text-sm text-txt-muted">
                  No attendee groups yet.
                </div>
              ) : (
                attendeeGroups.map((group) => (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => startEdit(group)}
                    className="rounded-xl border border-border bg-bg-surface p-3 text-left transition hover:border-accent/30"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-white">{group.name}</div>
                        <div className="mt-1 text-xs text-txt-muted">
                          {group.members.length} attendee{group.members.length !== 1 ? "s" : ""}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          deleteAttendeeGroup(group.id);
                          if (editingId === group.id) resetDraft();
                        }}
                        className="rounded-lg border border-border bg-transparent p-2 text-txt-dim transition hover:border-err/30 hover:text-err"
                        aria-label="Delete group"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-bg-raised p-4">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-base font-semibold text-white">
              {editingId ? "Edit Group" : "Create Group"}
            </h3>
            <Button variant="ghost" size="sm" onClick={resetDraft}>
              <X size={14} /> Clear
            </Button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-[11px] uppercase tracking-[0.18em] text-txt-dim">
                Group Name
              </label>
              <input
                value={draftGroup.name}
                onChange={(event) =>
                  setDraftGroup((current) => ({ ...current, name: event.target.value }))
                }
                className="w-full rounded-xl border border-border bg-bg-input px-4 py-3 text-sm text-txt outline-none transition focus:border-accent"
                placeholder="e.g. Bi-weekly meeting package"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-[11px] uppercase tracking-[0.18em] text-txt-dim">Members</div>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() =>
                    setDraftGroup((current) => ({
                      ...current,
                      members: [...current.members, createEmptyAttendee()],
                    }))
                  }
                >
                  <Plus size={14} /> Add Member
                </Button>
              </div>

              <div className="space-y-2">
                {draftGroup.members.map((member, index) => (
                  <div key={member.id} className="grid gap-2 rounded-xl border border-border bg-bg-surface p-3 lg:grid-cols-[60px_1.2fr_1fr_1fr_48px]">
                    <div className="flex items-center text-sm text-txt-dim">{index + 1}</div>
                    <input
                      value={member.name}
                      onChange={(event) =>
                        setDraftGroup((current) => ({
                          ...current,
                          members: current.members.map((item) =>
                            item.id === member.id ? { ...item, name: event.target.value } : item
                          ),
                        }))
                      }
                      className="rounded-lg border border-border bg-bg-input px-3 py-2.5 text-sm text-txt outline-none transition focus:border-accent"
                      placeholder="Full name"
                    />
                    <input
                      value={member.designation}
                      onChange={(event) =>
                        setDraftGroup((current) => ({
                          ...current,
                          members: current.members.map((item) =>
                            item.id === member.id
                              ? { ...item, designation: event.target.value }
                              : item
                          ),
                        }))
                      }
                      className="rounded-lg border border-border bg-bg-input px-3 py-2.5 text-sm text-txt outline-none transition focus:border-accent"
                      placeholder="Designation / role"
                    />
                    <input
                      value={member.organization}
                      onChange={(event) =>
                        setDraftGroup((current) => ({
                          ...current,
                          members: current.members.map((item) =>
                            item.id === member.id
                              ? { ...item, organization: event.target.value }
                              : item
                          ),
                        }))
                      }
                      className="rounded-lg border border-border bg-bg-input px-3 py-2.5 text-sm text-txt outline-none transition focus:border-accent"
                      placeholder="Organization"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setDraftGroup((current) => ({
                          ...current,
                          members:
                            current.members.length > 1
                              ? current.members.filter((item) => item.id !== member.id)
                              : [createEmptyAttendee()],
                        }))
                      }
                      className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-transparent text-txt-dim transition hover:border-err/30 hover:text-err"
                      aria-label="Remove member"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-col-reverse gap-3 border-t border-border pt-4 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            <Button variant="primary" onClick={saveGroup}>
              Save Group
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function MeetingSeriesModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { projects, meetingSeries, saveMeetingSeries, deleteMeetingSeries } = useAppStore();
  const [draft, setDraft] = useState<MeetingSeries>(createEmptySeries());
  const [editingId, setEditingId] = useState<string | null>(null);

  const startEdit = (series: MeetingSeries) => {
    setDraft({
      ...series,
      projectIds: [...series.projectIds],
      defaultAttendees: series.defaultAttendees.map((attendee) => ({ ...attendee })),
      defaultAgendas: series.defaultAgendas.map((agenda) => ({ ...agenda })),
    });
    setEditingId(series.id);
  };

  const resetDraft = () => {
    setDraft(createEmptySeries());
    setEditingId(null);
  };

  const toggleProject = (projectId: string) => {
    setDraft((current) => ({
      ...current,
      projectIds: current.projectIds.includes(projectId)
        ? current.projectIds.filter((id) => id !== projectId)
        : [...current.projectIds, projectId],
    }));
  };

  const saveSeries = () => {
    if (!draft.name.trim()) return;
    saveMeetingSeries({
      ...draft,
      id: editingId || draft.id,
      name: draft.name.trim(),
      description: draft.description?.trim() || "",
      defaultAttendees: draft.defaultAttendees
        .map((attendee) => ({
          ...attendee,
          name: attendee.name.trim(),
          designation: attendee.designation.trim(),
          organization: attendee.organization.trim(),
        }))
        .filter((attendee) => attendee.name),
      defaultAgendas: draft.defaultAgendas
        .map((agenda) => ({
          ...agenda,
          title: agenda.title.trim(),
          discussion: agenda.discussion.trim(),
        }))
        .filter((agenda) => agenda.title),
      createdAt: editingId ? draft.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    resetDraft();
  };

  const cadenceOptions: Array<{ value: NonNullable<MeetingSeries["cadence"]>; label: string }> = [
    { value: "weekly", label: "Weekly" },
    { value: "biweekly", label: "Bi-weekly" },
    { value: "monthly", label: "Monthly" },
    { value: "adhoc", label: "Ad hoc" },
  ];

  return (
    <Modal open={open} onClose={onClose} title="Meeting Series" width={1040}>
      <div className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
        <div className="space-y-3">
          <div className="rounded-2xl border border-border bg-bg-raised p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">Saved series</div>
            <div className="mt-3 flex flex-col gap-2">
              {meetingSeries.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-4 text-sm text-txt-muted">
                  No series yet. Create one to scope a recurring meeting to specific projects.
                </div>
              ) : (
                meetingSeries.map((series) => (
                  <button
                    key={series.id}
                    type="button"
                    onClick={() => startEdit(series)}
                    className={`rounded-xl border bg-bg-surface p-3 text-left transition ${
                      editingId === series.id ? "border-accent/50" : "border-border hover:border-accent/30"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-white">{series.name}</div>
                        <div className="mt-1 truncate text-xs text-txt-muted">
                          {series.projectIds.length} project{series.projectIds.length !== 1 ? "s" : ""} ·{" "}
                          {series.defaultAttendees.length} default attendee
                          {series.defaultAttendees.length !== 1 ? "s" : ""}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          if (window.confirm(`Delete series "${series.name}"? Past minutes will be kept but unlinked.`)) {
                            deleteMeetingSeries(series.id);
                            if (editingId === series.id) resetDraft();
                          }
                        }}
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-txt-dim transition hover:bg-err/15 hover:text-err"
                        aria-label="Delete series"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-bg-raised p-4">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-base font-semibold text-white">
              {editingId ? "Edit series" : "Create series"}
            </h3>
            <Button variant="ghost" size="sm" onClick={resetDraft}>
              <X size={14} /> Clear
            </Button>
          </div>

          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr]">
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">
                  Series name
                </label>
                <input
                  value={draft.name}
                  onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                  className="w-full rounded-lg border border-border bg-bg-input px-3 py-2 text-sm text-txt outline-none focus:border-accent"
                  placeholder="e.g. Bi-weekly Road Package Review"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">
                  Cadence
                </label>
                <select
                  value={draft.cadence}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      cadence: event.target.value as MeetingSeries["cadence"],
                    }))
                  }
                  className="w-full rounded-lg border border-border bg-bg-input px-3 py-2 text-sm text-txt outline-none focus:border-accent"
                >
                  {cadenceOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">
                Description
              </label>
              <input
                value={draft.description ?? ""}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, description: event.target.value }))
                }
                className="w-full rounded-lg border border-border bg-bg-input px-3 py-2 text-sm text-txt outline-none focus:border-accent"
                placeholder="Optional note about the series"
              />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">
                  Projects in scope
                </div>
                <span className="text-[11px] text-txt-muted">
                  {draft.projectIds.length} selected
                </span>
              </div>
              {projects.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-3 text-xs text-txt-muted">
                  Create a project first to assign it to a series.
                </div>
              ) : (
                <div className="max-h-44 overflow-y-auto rounded-lg border border-border bg-bg-input">
                  {projects.map((project) => {
                    const checked = draft.projectIds.includes(project.id);
                    return (
                      <label
                        key={project.id}
                        className="flex cursor-pointer items-center gap-2.5 border-b border-border/50 px-3 py-2 text-[13px] last:border-b-0 hover:bg-bg-hover"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleProject(project.id)}
                          className="h-4 w-4 cursor-pointer accent-accent"
                        />
                        <span className="min-w-0 flex-1 truncate text-txt">{project.name}</span>
                        <span className="shrink-0 text-[10px] text-txt-dim">
                          {project.type === "construction" ? "Constr" : "Non-c"}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">
                  Default attendees
                </div>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      defaultAttendees: [...current.defaultAttendees, createEmptyAttendee()],
                    }))
                  }
                >
                  <Plus size={13} /> Add
                </Button>
              </div>
              {draft.defaultAttendees.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-txt-muted">
                  Add attendees to pre-fill the attendee list when a new meeting is created from this series.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {draft.defaultAttendees.map((attendee) => (
                    <div
                      key={attendee.id}
                      className="grid gap-1.5 rounded-lg border border-border bg-bg-input p-2 sm:grid-cols-[1.2fr_1fr_1fr_36px]"
                    >
                      <input
                        value={attendee.name}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            defaultAttendees: current.defaultAttendees.map((item) =>
                              item.id === attendee.id ? { ...item, name: event.target.value } : item,
                            ),
                          }))
                        }
                        className="data-cell-input px-2 py-1 text-sm"
                        placeholder="Name"
                      />
                      <input
                        value={attendee.designation}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            defaultAttendees: current.defaultAttendees.map((item) =>
                              item.id === attendee.id
                                ? { ...item, designation: event.target.value }
                                : item,
                            ),
                          }))
                        }
                        className="data-cell-input px-2 py-1 text-sm"
                        placeholder="Designation"
                      />
                      <input
                        value={attendee.organization}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            defaultAttendees: current.defaultAttendees.map((item) =>
                              item.id === attendee.id
                                ? { ...item, organization: event.target.value }
                                : item,
                            ),
                          }))
                        }
                        className="data-cell-input px-2 py-1 text-sm"
                        placeholder="Organization"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setDraft((current) => ({
                            ...current,
                            defaultAttendees: current.defaultAttendees.filter(
                              (item) => item.id !== attendee.id,
                            ),
                          }))
                        }
                        className="inline-flex h-8 w-8 items-center justify-center self-center rounded-md text-txt-dim transition hover:bg-err/15 hover:text-err"
                        aria-label="Remove attendee"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">
                  Default agenda topics
                </div>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      defaultAgendas: [...current.defaultAgendas, createEmptyAgenda()],
                    }))
                  }
                >
                  <Plus size={13} /> Add
                </Button>
              </div>
              {draft.defaultAgendas.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-txt-muted">
                  Add standing agenda topics (e.g. Safety, Progress, Variations). They&apos;ll be pre-filled
                  in each new meeting from this series.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {draft.defaultAgendas.map((agenda, index) => (
                    <div
                      key={agenda.id}
                      className="grid gap-1.5 rounded-lg border border-border bg-bg-input p-2 sm:grid-cols-[24px_1fr_36px]"
                    >
                      <div className="flex items-center justify-center text-xs font-medium text-txt-dim">
                        {index + 1}
                      </div>
                      <input
                        value={agenda.title}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            defaultAgendas: current.defaultAgendas.map((item) =>
                              item.id === agenda.id ? { ...item, title: event.target.value } : item,
                            ),
                          }))
                        }
                        className="data-cell-input px-2 py-1 text-sm"
                        placeholder="Agenda topic (e.g. Progress per package)"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setDraft((current) => ({
                            ...current,
                            defaultAgendas: current.defaultAgendas.filter(
                              (item) => item.id !== agenda.id,
                            ),
                          }))
                        }
                        className="inline-flex h-8 w-8 items-center justify-center self-center rounded-md text-txt-dim transition hover:bg-err/15 hover:text-err"
                        aria-label="Remove agenda"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="mt-5 flex flex-col-reverse gap-3 border-t border-border pt-4 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={onClose}>Close</Button>
            <Button variant="primary" onClick={saveSeries} disabled={!draft.name.trim()}>
              {editingId ? "Update series" : "Create series"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function SeriesPickerModal({
  open,
  seriesList,
  onCancel,
  onPick,
}: {
  open: boolean;
  seriesList: MeetingSeries[];
  onCancel: () => void;
  onPick: (series: MeetingSeries | null) => void;
}) {
  return (
    <Modal open={open} onClose={onCancel} title="Start a new meeting" width={520}>
      <div className="space-y-2">
        <p className="text-[13px] text-txt-muted">
          Choose a series to pre-fill projects, attendees, and agenda — or skip to start an ad-hoc meeting.
        </p>
        <div className="mt-2 space-y-1.5">
          {seriesList.map((series) => (
            <button
              key={series.id}
              type="button"
              onClick={() => onPick(series)}
              className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-bg-surface px-3 py-2.5 text-left transition hover:border-accent/40 hover:bg-bg-hover"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-white">{series.name}</div>
                <div className="mt-0.5 truncate text-[11px] text-txt-muted">
                  {series.projectIds.length} project{series.projectIds.length !== 1 ? "s" : ""}
                  {series.cadence ? ` · ${series.cadence}` : ""}
                  {series.defaultAttendees.length
                    ? ` · ${series.defaultAttendees.length} default attendee${
                        series.defaultAttendees.length !== 1 ? "s" : ""
                      }`
                    : ""}
                </div>
              </div>
              <span className="shrink-0 text-[11px] font-medium text-accent">Use series ›</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => onPick(null)}
            className="flex w-full items-center justify-between gap-3 rounded-lg border border-dashed border-border bg-bg-surface/60 px-3 py-2.5 text-left transition hover:border-txt-muted/50 hover:bg-bg-hover"
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-txt">No series</div>
              <div className="mt-0.5 text-[11px] text-txt-muted">
                Pull open action points from all projects (ad-hoc).
              </div>
            </div>
            <span className="shrink-0 text-[11px] font-medium text-txt-muted">Continue ›</span>
          </button>
        </div>
      </div>
      <div className="mt-4 flex justify-end border-t border-border pt-3">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </Modal>
  );
}

export default function MeetingMinutesModule() {
  const {
    projects,
    attendeeGroups,
    meetingMinutes,
    saveMeetingMinute,
    deleteMeetingMinute,
    duplicateMeetingMinute,
    reopenMeetingAction,
    meetingSeries,
  } = useAppStore();

  const [showGroupsModal, setShowGroupsModal] = useState(false);
  const [showSeriesModal, setShowSeriesModal] = useState(false);
  const [showSeriesPicker, setShowSeriesPicker] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [draftMinute, setDraftMinute] = useState<MeetingMinute | null>(null);
  const [showNoProjectHint, setShowNoProjectHint] = useState(false);

  const seriesById = useMemo(
    () => Object.fromEntries(meetingSeries.map((series) => [series.id, series])),
    [meetingSeries],
  );

  const sortedMinutes = useMemo(
    () =>
      meetingMinutes
        .slice()
        .sort((a, b) => b.meetingDate.localeCompare(a.meetingDate) || b.updatedAt.localeCompare(a.updatedAt)),
    [meetingMinutes]
  );

  const liveActions = useMemo(() => getLiveMeetingActionItems(meetingMinutes), [meetingMinutes]);
  const openActions = liveActions.filter((action) => action.status !== "closed");
  const overdueActions = openActions.filter(
    (action) => action.deadline && action.deadline < todayIso()
  );

  const projectNameById = useMemo(
    () =>
      Object.fromEntries(projects.map((project) => [project.id, project.name])),
    [projects]
  );

  const selectedGroup = attendeeGroups.find((group) => group.id === selectedGroupId) || null;

  const openEditor = (minute: MeetingMinute) => {
    setDraftMinute(cloneMinute(minute));
    setSelectedGroupId("");
  };

  const startNewMinute = (series?: MeetingSeries | null) => {
    setDraftMinute(createMinuteDraft(projects, meetingMinutes, series));
    setSelectedGroupId("");
    setShowSeriesPicker(false);
  };

  const handleClickNewMinute = () => {
    // If at least one series exists, prompt the user to pick one (or none).
    // Otherwise, fall straight through to an ad-hoc minute (current behavior).
    if (meetingSeries.length > 0) {
      setShowSeriesPicker(true);
    } else {
      startNewMinute(null);
    }
  };

  const saveCurrentMinute = () => {
    if (!draftMinute) return;

    const cleanMinute: MeetingMinute = {
      ...draftMinute,
      title: draftMinute.title.trim() || "Untitled Meeting Minutes",
      attendees: draftMinute.attendees
        .map((attendee) => ({
          ...attendee,
          name: attendee.name.trim(),
          designation: attendee.designation.trim(),
          organization: attendee.organization.trim(),
        }))
        .filter((attendee) => attendee.name),
      agendas: draftMinute.agendas
        .map((agenda) => ({
          ...agenda,
          title: agenda.title.trim(),
          discussion: agenda.discussion.trim(),
        }))
        .filter((agenda) => agenda.title || agenda.discussion),
      actionGroups: draftMinute.actionGroups
        .map((group) => ({
          ...group,
          actionItems: group.actionItems
            .map((actionItem) => ({
              ...actionItem,
              description: actionItem.description.trim(),
              responsiblePerson: actionItem.responsiblePerson.trim(),
              notes: actionItem.notes?.trim() || "",
            }))
            .filter((actionItem) => actionItem.description),
        }))
        .filter((group) => group.project_id && group.actionItems.length > 0),
      updatedAt: new Date().toISOString(),
    };

    saveMeetingMinute(cleanMinute);
    setDraftMinute(null);
  };

  const updateAgenda = (agendaId: string, patch: Partial<MeetingAgendaItem>) => {
    setDraftMinute((current) =>
      current
        ? {
            ...current,
            agendas: current.agendas.map((agenda) =>
              agenda.id === agendaId ? { ...agenda, ...patch } : agenda
            ),
          }
        : current
    );
  };

  const updateActionItem = (
    groupId: string,
    actionItemId: string,
    patch: Partial<MeetingActionItem>
  ) => {
    setDraftMinute((current) =>
      current
        ? {
            ...current,
            actionGroups: current.actionGroups.map((group) =>
              group.id === groupId
                ? {
                    ...group,
                    actionItems: group.actionItems.map((actionItem) => {
                      if (actionItem.id !== actionItemId) return actionItem;
                      const merged = { ...actionItem, ...patch };
                      // Stamp / clear closedAt automatically when status flips.
                      if (patch.status !== undefined) {
                        if (patch.status === "closed" && actionItem.status !== "closed") {
                          merged.closedAt = new Date().toISOString();
                        } else if (patch.status !== "closed" && actionItem.status === "closed") {
                          merged.closedAt = undefined;
                        }
                      }
                      return merged;
                    }),
                  }
                : group
            ),
          }
        : current
    );
  };

  const addProjectActionGroup = () => {
    if (!draftMinute) return;
    if (projects.length === 0) {
      setShowNoProjectHint(true);
      return;
    }
    setShowNoProjectHint(false);
    setDraftMinute((current) =>
      current
        ? {
            ...current,
            actionGroups: [
              ...current.actionGroups,
              {
                id: uuid(),
                project_id: projects[0].id,
                actionItems: [createEmptyActionItem(projects[0].id)],
              },
            ],
          }
        : current
    );
  };

  if (!draftMinute) {
    return (
      <div className="animate-fade-in">
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <h2 className="text-lg font-semibold tracking-tight text-white">Meeting Minutes</h2>
          <div className="flex flex-wrap gap-2">
            <Button variant="default" size="sm" onClick={() => setShowSeriesModal(true)}>
              <CalendarDays size={14} /> Meeting Series
            </Button>
            <Button variant="default" size="sm" onClick={() => setShowGroupsModal(true)}>
              <Users size={14} /> Attendee Groups
            </Button>
            <Button variant="primary" size="sm" onClick={handleClickNewMinute}>
              <Plus size={14} /> New Minutes
            </Button>
          </div>
        </div>

        <div className="mb-6 sm:hidden">
          <CompactKpiList
            rows={[
              { label: "Meeting Minutes", value: String(sortedMinutes.length), icon: CalendarDays, tone: "accent" },
              { label: "Open Actions", value: String(openActions.length), icon: ClipboardList, tone: "warn" },
              {
                label: "Overdue Actions",
                value: String(overdueActions.length),
                icon: CheckCircle2,
                tone: overdueActions.length > 0 ? "err" : "ok",
              },
              { label: "Attendee Groups", value: String(attendeeGroups.length), icon: Users, tone: "accent" },
            ]}
          />
        </div>
        <div className="mb-6 hidden gap-4 sm:grid sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            title="Meeting Minutes"
            value={String(sortedMinutes.length)}
            tone="accent"
            icon={<CalendarDays size={18} />}
          />
          <SummaryCard
            title="Open Actions"
            value={String(openActions.length)}
            tone="warn"
            icon={<ClipboardList size={18} />}
          />
          <SummaryCard
            title="Overdue Actions"
            value={String(overdueActions.length)}
            tone={overdueActions.length > 0 ? "err" : "ok"}
            icon={<CheckCircle2 size={18} />}
          />
          <SummaryCard
            title="Attendee Groups"
            value={String(attendeeGroups.length)}
            tone="accent"
            icon={<Users size={18} />}
          />
        </div>

        <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-2xl border border-border bg-bg-surface p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold text-white">Minutes Register</h3>
            </div>

            {sortedMinutes.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-txt-muted">
                No meeting minutes yet. Create your first meeting and action register.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {sortedMinutes.map((minute) => {
                  const minuteOpen = minute.actionGroups
                    .flatMap((group) => group.actionItems)
                    .filter((actionItem) => actionItem.status !== "closed").length;
                  const minuteAttendees = minute.attendees.length;
                  const minuteProjects = new Set(minute.actionGroups.map((group) => group.project_id)).size;

                  return (
                    <div
                      key={minute.id}
                      className="rounded-2xl border border-border bg-bg-raised p-4 transition hover:border-accent/30"
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <button
                          type="button"
                          onClick={() => openEditor(minute)}
                          className="bg-transparent text-left"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-lg font-bold text-white">{minute.title}</div>
                            <Badge color={minute.status === "final" ? "ok" : "warn"}>
                              {minute.status.toUpperCase()}
                            </Badge>
                            {minute.meetingSeriesId && seriesById[minute.meetingSeriesId] ? (
                              <Badge color="accent">
                                {seriesById[minute.meetingSeriesId].name}
                              </Badge>
                            ) : null}
                          </div>
                          <div className="mt-2 text-xs text-txt-muted">
                            {minute.meetingDate} • {minute.referenceNo} • {minuteAttendees} attendees •{" "}
                            {minuteProjects} project registr{minuteProjects === 1 ? "y" : "ies"}
                          </div>
                        </button>
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="rounded-full border border-border bg-black/10 px-3 py-1 text-[11px] text-txt-muted">
                            {minuteOpen} open action{minuteOpen !== 1 ? "s" : ""}
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => openMeetingMinutePdf(minute, projects)}>
                            <Printer size={14} /> Export PDF
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => duplicateMeetingMinute(minute.id)}>
                            <Copy size={14} /> Duplicate
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setShowDeleteConfirm(minute.id)}>
                            <Trash2 size={14} /> Delete
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-bg-surface p-5">
            <div className="mb-4">
              <h3 className="text-base font-semibold text-white">Live Action Register</h3>
            </div>

            <div className="space-y-3">
              {liveActions.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border p-5 text-sm text-txt-muted">
                  No action points yet.
                </div>
              ) : (
                liveActions.slice(0, 8).map((action) => {
                  const overdue = action.status !== "closed" && action.deadline && action.deadline < todayIso();
                  const isClosed = action.status === "closed";
                  const closedAtIso = (action as { closedAt?: string }).closedAt;
                  return (
                    <div key={action.id} className="rounded-2xl border border-border bg-bg-raised p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-white">{action.description}</div>
                          <div className="mt-1 text-xs text-txt-muted">
                            {projectNameById[action.project_id] || "Unassigned project"} • {action.responsiblePerson || "Responsible person not set"}
                          </div>
                        </div>
                        <div className="flex flex-wrap justify-end gap-2">
                          <Badge color={statusBadge(action.status)}>{action.status.toUpperCase()}</Badge>
                          {overdue ? <Badge color="err">OVERDUE</Badge> : null}
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-txt-muted">
                        <span>
                          {isClosed && closedAtIso
                            ? `Closed ${new Date(closedAtIso).toLocaleDateString()}`
                            : `Due ${action.deadline || "not set"}`}
                          {" • "}
                          {action.meetingTitle}
                          {action.meetingDate ? ` (${action.meetingDate})` : ""}
                        </span>
                        {isClosed ? (
                          <button
                            type="button"
                            onClick={() => reopenMeetingAction(action.actionKey)}
                            className="inline-flex items-center gap-1 rounded-md border border-accent/30 bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent transition hover:border-accent/60 hover:bg-accent/15"
                            title="Reopen this action point so it appears in the next meeting"
                          >
                            Reopen
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {showDeleteConfirm && (
          <Modal
            open={true}
            onClose={() => setShowDeleteConfirm(null)}
            title="Delete Meeting Minutes"
            width={420}
          >
            <p className="mb-5 text-sm text-txt-muted">
              Delete this meeting record?
            </p>
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button variant="ghost" onClick={() => setShowDeleteConfirm(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  deleteMeetingMinute(showDeleteConfirm);
                  setShowDeleteConfirm(null);
                }}
              >
                Delete
              </Button>
            </div>
          </Modal>
        )}

        <AttendeeGroupsModal open={showGroupsModal} onClose={() => setShowGroupsModal(false)} />
        <MeetingSeriesModal open={showSeriesModal} onClose={() => setShowSeriesModal(false)} />
        <SeriesPickerModal
          open={showSeriesPicker}
          seriesList={meetingSeries}
          onCancel={() => setShowSeriesPicker(false)}
          onPick={(series) => startNewMinute(series)}
        />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <input
            value={draftMinute.title}
            onChange={(event) =>
              setDraftMinute((current) =>
                current ? { ...current, title: event.target.value } : current
              )
            }
            className="w-full max-w-3xl rounded-xl border border-border bg-bg-input px-4 py-3 text-xl font-bold text-white outline-none transition focus:border-accent"
            placeholder="Meeting title"
          />
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-txt-muted">
            <input
              type="date"
              value={draftMinute.meetingDate}
              onChange={(event) =>
                setDraftMinute((current) =>
                  current ? { ...current, meetingDate: event.target.value } : current
                )
              }
              className="rounded-lg border border-border bg-bg-input px-3 py-2 text-sm text-txt outline-none transition focus:border-accent"
            />
            <input
              value={draftMinute.referenceNo}
              onChange={(event) =>
                setDraftMinute((current) =>
                  current ? { ...current, referenceNo: event.target.value } : current
                )
              }
              className="rounded-lg border border-border bg-bg-input px-3 py-2 text-sm text-txt outline-none transition focus:border-accent"
              placeholder="Reference no"
            />
            <select
              value={draftMinute.status}
              onChange={(event) =>
                setDraftMinute((current) =>
                  current
                    ? { ...current, status: event.target.value as MeetingMinute["status"] }
                    : current
                )
              }
              className="rounded-lg border border-border bg-bg-input px-3 py-2 text-sm text-txt outline-none transition focus:border-accent"
            >
              <option value="draft">Draft</option>
              <option value="final">Final</option>
            </select>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="default" onClick={() => openMeetingMinutePdf(draftMinute, projects)}>
            <Printer size={14} /> Export PDF
          </Button>
          <Button variant="default" onClick={() => setShowGroupsModal(true)}>
            <Users size={14} /> Manage Groups
          </Button>
          <Button variant="ghost" onClick={() => setDraftMinute(null)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={saveCurrentMinute}>
            Update & Sync
          </Button>
        </div>
      </div>

      <div className="space-y-5">
        <section className="rounded-2xl border border-border bg-bg-surface p-5">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <h3 className="text-base font-semibold text-white">Attendees</h3>
            <div className="flex flex-wrap gap-2">
              <select
                value={selectedGroupId}
                onChange={(event) => setSelectedGroupId(event.target.value)}
                className="rounded-lg border border-border bg-bg-input px-3 py-2 text-sm text-txt outline-none transition focus:border-accent"
              >
                <option value="">Select attendee group</option>
                {attendeeGroups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
              <Button
                variant="default"
                onClick={() => {
                  if (!selectedGroup) return;
                  setDraftMinute((current) =>
                    current
                      ? {
                          ...current,
                          attendees: [
                            ...current.attendees,
                            ...selectedGroup.members.map((member) => cloneAttendee(member)),
                          ],
                        }
                      : current
                  );
                }}
                disabled={!selectedGroup}
              >
                <Users size={14} /> Add Group
              </Button>
              <Button
                variant="primary"
                onClick={() =>
                  setDraftMinute((current) =>
                    current
                      ? { ...current, attendees: [...current.attendees, createEmptyAttendee()] }
                      : current
                  )
                }
              >
                <Plus size={14} /> Add Attendee
              </Button>
            </div>
          </div>

          {draftMinute.attendees.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-4 py-3 text-[13px] text-txt-muted">
              No attendees added yet. Load a group or add attendees manually.
            </div>
          ) : (
            <div className="data-table-shell">
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: 44 }}>#</th>
                    <th>Name</th>
                    <th>Designation / role</th>
                    <th>Organization</th>
                    <th style={{ width: 36 }} aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {draftMinute.attendees.map((attendee, index) => (
                    <tr key={attendee.id}>
                      <td className="data-cell-index">{index + 1}</td>
                      <td>
                        <input
                          value={attendee.name}
                          onChange={(event) =>
                            setDraftMinute((current) =>
                              current
                                ? {
                                    ...current,
                                    attendees: current.attendees.map((item) =>
                                      item.id === attendee.id ? { ...item, name: event.target.value } : item
                                    ),
                                  }
                                : current
                            )
                          }
                          className="data-cell-input"
                          placeholder="Name"
                        />
                      </td>
                      <td>
                        <input
                          value={attendee.designation}
                          onChange={(event) =>
                            setDraftMinute((current) =>
                              current
                                ? {
                                    ...current,
                                    attendees: current.attendees.map((item) =>
                                      item.id === attendee.id
                                        ? { ...item, designation: event.target.value }
                                        : item
                                    ),
                                  }
                                : current
                            )
                          }
                          className="data-cell-input"
                          placeholder="Designation / role"
                        />
                      </td>
                      <td>
                        <input
                          value={attendee.organization}
                          onChange={(event) =>
                            setDraftMinute((current) =>
                              current
                                ? {
                                    ...current,
                                    attendees: current.attendees.map((item) =>
                                      item.id === attendee.id
                                        ? { ...item, organization: event.target.value }
                                        : item
                                    ),
                                  }
                                : current
                            )
                          }
                          className="data-cell-input"
                          placeholder="Organization"
                        />
                      </td>
                      <td className="data-cell-action">
                        <button
                          type="button"
                          onClick={() =>
                            setDraftMinute((current) =>
                              current
                                ? {
                                    ...current,
                                    attendees: current.attendees.filter((item) => item.id !== attendee.id),
                                  }
                                : current
                            )
                          }
                          className="data-row-action danger"
                          aria-label="Remove attendee"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-bg-surface p-5">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <h3 className="text-base font-semibold text-white">Agenda</h3>
            <Button
              variant="primary"
              onClick={() =>
                setDraftMinute((current) =>
                  current ? { ...current, agendas: [...current.agendas, createEmptyAgenda()] } : current
                )
              }
            >
              <Plus size={14} /> Add Agenda Topic
            </Button>
          </div>

          <div className="space-y-4">
            {draftMinute.agendas.map((agenda, index) => (
              <div key={agenda.id} className="rounded-2xl border border-border bg-bg-raised p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-white">Agenda {index + 1}</div>
                  <button
                    type="button"
                    onClick={() =>
                      setDraftMinute((current) =>
                        current && current.agendas.length > 1
                          ? { ...current, agendas: current.agendas.filter((item) => item.id !== agenda.id) }
                          : current
                      )
                    }
                    className="rounded-lg border border-border bg-transparent p-2 text-txt-dim transition hover:border-err/30 hover:text-err"
                    aria-label="Remove agenda"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <input
                  value={agenda.title}
                  onChange={(event) => updateAgenda(agenda.id, { title: event.target.value })}
                  className="mb-3 w-full rounded-lg border border-border bg-bg-input px-3 py-2.5 text-sm text-txt outline-none transition focus:border-accent"
                  placeholder="Agenda description"
                />
                <RichTextEditor
                  value={agenda.discussion}
                  onChange={(next) => updateAgenda(agenda.id, { discussion: next })}
                  placeholder="Discussion notes, decisions, and comments"
                  minHeight={140}
                />
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-bg-surface p-5">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <h3 className="text-base font-semibold text-white">Project Action Registry</h3>
            <Button
              variant="primary"
              onClick={addProjectActionGroup}
              aria-disabled={projects.length === 0}
              className={projects.length === 0 ? "opacity-40" : undefined}
              title={projects.length === 0 ? "Add a project to your workspace first" : undefined}
            >
              <Plus size={14} /> Assign Action Points to Project
            </Button>
          </div>
          {projects.length === 0 && showNoProjectHint ? (
            <p className="mb-4 rounded-lg border border-warn/25 bg-warn/10 px-3 py-2 text-[13px] text-warn">
              Add a project to your workspace before assigning action points to it.
            </p>
          ) : null}

          <div className="space-y-4">
            {draftMinute.actionGroups.map((group) => (
              <div key={group.id} className="rounded-2xl border border-border bg-bg-raised p-4">
                <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                  <div className="flex flex-1 gap-3">
                    <select
                      value={group.project_id}
                      onChange={(event) =>
                        setDraftMinute((current) =>
                          current
                            ? {
                                ...current,
                                actionGroups: current.actionGroups.map((item) =>
                                  item.id === group.id
                                    ? {
                                        ...item,
                                        project_id: event.target.value,
                                        actionItems: item.actionItems.map((actionItem) => ({
                                          ...actionItem,
                                          project_id: event.target.value,
                                        })),
                                      }
                                    : item
                                ),
                              }
                            : current
                        )
                      }
                      className="w-full rounded-xl border border-border bg-bg-input px-4 py-3 text-sm text-txt outline-none transition focus:border-accent"
                    >
                      {projects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() =>
                        setDraftMinute((current) =>
                          current
                            ? {
                                ...current,
                                actionGroups: current.actionGroups.filter((item) => item.id !== group.id),
                              }
                            : current
                        )
                      }
                      className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-transparent text-txt-dim transition hover:border-err/30 hover:text-err"
                      aria-label="Remove project action group"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                  <div className="text-xs text-txt-muted">
                    {projectNameById[group.project_id] || "Selected project"} action registry
                  </div>
                </div>

                <div className="space-y-3 lg:hidden">
                  {group.actionItems.map((actionItem, index) => (
                    <div key={`${actionItem.id}-compact`} className="rounded-2xl border border-border bg-bg-raised/40 p-4">
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-txt-dim">
                          Action {index + 1}
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setDraftMinute((current) =>
                              current
                                ? {
                                    ...current,
                                    actionGroups: current.actionGroups.map((item) =>
                                      item.id === group.id
                                        ? {
                                            ...item,
                                            actionItems: item.actionItems.filter(
                                              (candidate) => candidate.id !== actionItem.id
                                            ),
                                          }
                                        : item
                                    ),
                                  }
                                : current
                            )
                          }
                          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-transparent text-txt-dim transition hover:border-err/30 hover:text-err"
                          aria-label="Delete action item"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <div className="space-y-2">
                        <textarea
                          value={actionItem.description}
                          onChange={(event) =>
                            updateActionItem(group.id, actionItem.id, {
                              description: event.target.value,
                            })
                          }
                          className="min-h-[92px] w-full resize-y rounded-xl border border-transparent bg-transparent px-3 py-2.5 text-sm leading-6 text-txt outline-none transition hover:bg-black/10 focus:border-accent/40 focus:bg-black/10"
                          placeholder="Action item description"
                        />
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <input
                          value={actionItem.responsiblePerson}
                          onChange={(event) =>
                            updateActionItem(group.id, actionItem.id, {
                              responsiblePerson: event.target.value,
                            })
                          }
                          className="w-full rounded-xl border border-border bg-bg-input px-3 py-2.5 text-sm text-txt outline-none transition focus:border-accent"
                          placeholder="Responsible person"
                        />
                        <input
                          type="date"
                          value={actionItem.deadline}
                          onChange={(event) =>
                            updateActionItem(group.id, actionItem.id, {
                              deadline: event.target.value,
                            })
                          }
                          className="w-full rounded-xl border border-border bg-bg-input px-3 py-2.5 text-sm text-txt outline-none transition focus:border-accent [color-scheme:dark]"
                        />
                        <select
                          value={actionItem.status}
                          onChange={(event) =>
                            updateActionItem(group.id, actionItem.id, {
                              status: event.target.value as MeetingActionItem["status"],
                            })
                          }
                          className="w-full rounded-xl border border-border bg-bg-input px-3 py-2.5 text-sm text-txt outline-none transition focus:border-accent"
                        >
                          <option value="open">Open</option>
                          <option value="in-progress">In Progress</option>
                          <option value="closed">Closed</option>
                        </select>
                      </div>
                      {actionItem.carriedForwardFromMinuteId && (
                        <Badge color="accent" className="mt-3">Carried Forward</Badge>
                      )}
                    </div>
                  ))}
                </div>
                <div className="hidden overflow-x-auto lg:block">
                  <table className="w-full min-w-[860px] border-collapse">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-[0.16em] text-txt-dim">
                        <th className="px-3 py-2">#</th>
                        <th className="px-3 py-2">Action Item Description</th>
                        <th className="px-3 py-2">Responsible Person</th>
                        <th className="px-3 py-2">Deadline</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.actionItems.map((actionItem, index) => (
                        <tr key={actionItem.id} className="border-t border-border/70">
                          <td className="data-cell-index px-3 py-1.5 align-middle">{index + 1}</td>
                          <td className="px-3 py-1.5 align-middle">
                            <div className="space-y-1.5">
                              <textarea
                                ref={(element) => {
                                  if (element) resizeMeetingTextarea(element);
                                }}
                                value={actionItem.description}
                                onChange={(event) => {
                                  resizeMeetingTextarea(event.currentTarget);
                                  updateActionItem(group.id, actionItem.id, {
                                    description: event.target.value,
                                  });
                                }}
                                rows={1}
                                className="data-cell-textarea"
                                placeholder="Action item description"
                              />
                              {actionItem.carriedForwardFromMinuteId && (
                                <Badge color="accent">Carried Forward</Badge>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-1.5 align-middle">
                            <input
                              value={actionItem.responsiblePerson}
                              onChange={(event) =>
                                updateActionItem(group.id, actionItem.id, {
                                  responsiblePerson: event.target.value,
                                })
                              }
                              className="data-cell-input"
                              placeholder="Responsible person"
                            />
                          </td>
                          <td className="px-3 py-1.5 align-middle">
                            <input
                              type="date"
                              value={actionItem.deadline}
                              onChange={(event) =>
                                updateActionItem(group.id, actionItem.id, {
                                  deadline: event.target.value,
                                })
                              }
                              className="data-cell-input [color-scheme:dark]"
                            />
                          </td>
                          <td className="px-3 py-1.5 align-middle">
                            <select
                              value={actionItem.status}
                              onChange={(event) =>
                                updateActionItem(group.id, actionItem.id, {
                                  status: event.target.value as MeetingActionItem["status"],
                                })
                              }
                              className="data-cell-select"
                            >
                              <option value="open">Open</option>
                              <option value="in-progress">In Progress</option>
                              <option value="closed">Closed</option>
                            </select>
                          </td>
                          <td className="data-cell-action px-3 py-1.5 align-middle">
                            <button
                              type="button"
                              onClick={() =>
                                setDraftMinute((current) =>
                                  current
                                    ? {
                                        ...current,
                                        actionGroups: current.actionGroups.map((item) =>
                                          item.id === group.id
                                            ? {
                                                ...item,
                                                actionItems: item.actionItems.filter(
                                                  (candidate) => candidate.id !== actionItem.id
                                                ),
                                              }
                                            : item
                                        ),
                                      }
                                    : current
                                )
                              }
                              className="data-row-action danger"
                              aria-label="Delete action item"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setDraftMinute((current) =>
                      current
                        ? {
                            ...current,
                            actionGroups: current.actionGroups.map((item) =>
                              item.id === group.id
                                ? {
                                    ...item,
                                    actionItems: [...item.actionItems, createEmptyActionItem(item.project_id)],
                                  }
                                : item
                            ),
                          }
                        : current
                    )
                  }
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-transparent px-4 py-3 text-sm text-txt-muted transition hover:border-accent/30 hover:text-white"
                >
                  <Plus size={14} />
                  Create New Action Point
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>

      <AttendeeGroupsModal open={showGroupsModal} onClose={() => setShowGroupsModal(false)} />
      <MeetingSeriesModal open={showSeriesModal} onClose={() => setShowSeriesModal(false)} />
    </div>
  );
}

function SummaryCard({
  title,
  value,
  subtitle,
  tone,
  icon,
}: {
  title: string;
  value: string;
  subtitle?: string;
  tone: "accent" | "ok" | "warn" | "err";
  icon: ReactNode;
}) {
  const toneClass =
    tone === "ok"
      ? "bg-ok/10 text-ok"
      : tone === "warn"
      ? "bg-warn/10 text-warn"
      : tone === "err"
      ? "bg-err/10 text-err"
      : "bg-accent/10 text-accent";

  return (
    <div className="rounded-2xl border border-border bg-bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">{title}</div>
          <div className="mt-3 text-2xl font-semibold text-white">{value}</div>
          {subtitle ? <div className="mt-2 text-xs text-txt-muted">{subtitle}</div> : null}
        </div>
        <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${toneClass}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}
