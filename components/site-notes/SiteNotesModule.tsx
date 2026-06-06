"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { v4 as uuid } from "uuid";
import {
  Bold,
  Camera,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Copy,
  FileText,
  ImagePlus,
  List,
  ListOrdered,
  MoreVertical,
  NotebookPen,
  Plus,
  Save,
  Trash2,
  Type,
  Underline,
} from "lucide-react";
import {
  DEFAULT_SITE_VISIT_REPORT_OPTIONS,
  useAppStore,
  type SiteVisitReportOptions,
  type SiteVisitReportSectionKey,
} from "@/lib/store";
import type { SiteNote, SiteNoteCategory } from "@/lib/supabase";
import {
  normalizeEditorHtml,
  plainTextToRichTextHtml,
  sanitizeRichTextHtml,
  stripRichTextToPlain,
} from "@/lib/richText";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";

type SiteNoteFilter = "all" | SiteNoteCategory;

const categories: SiteNoteCategory[] = [
  "observation",
  "quality",
  "safety",
  "progress",
  "issue",
  "instruction",
];

const categoryLabels: Record<SiteNoteCategory, string> = {
  observation: "Observation",
  quality: "Quality",
  safety: "Safety",
  progress: "Progress",
  issue: "Issue",
  instruction: "Instruction",
};

const reportOptionGroups: Array<{
  title: string;
  helper: string;
  options: Array<{ key: SiteVisitReportSectionKey; label: string }>;
}> = [
  {
    title: "Core project information",
    helper: "Usually useful for every field report.",
    options: [
      { key: "projectName", label: "Project name" },
      { key: "contractReference", label: "Contract number / code" },
      { key: "client", label: "Client" },
      { key: "contractor", label: "Contractor" },
      { key: "consultant", label: "Consultant" },
      { key: "location", label: "Location / site area" },
    ],
  },
  {
    title: "Visit details",
    helper: "Captured from this site note.",
    options: [
      { key: "visitDate", label: "Visit date" },
      { key: "author", label: "Prepared by" },
      { key: "weather", label: "Weather" },
      { key: "observation", label: "Observation text" },
      { key: "photos", label: "Photo gallery" },
    ],
  },
  {
    title: "Optional context",
    helper: "Add only when the report needs more formal context.",
    options: [
      { key: "contractTitle", label: "Contract title" },
      { key: "projectAmount", label: "Project amount" },
      { key: "startEndDate", label: "Start / end dates" },
      { key: "programCategory", label: "Program / category" },
      { key: "progressSummary", label: "Progress summary" },
      { key: "checklistSummary", label: "Checklist summary" },
    ],
  },
];

const todayISO = () => new Date().toISOString().split("T")[0];

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("Unable to read image"));
    reader.readAsDataURL(file);
  });
}

function notePreview(text: string) {
  const normalized = stripRichTextToPlain(text).replace(/\s+/g, " ");
  if (!normalized) return "No observation text added yet.";
  return normalized.length > 140 ? `${normalized.slice(0, 140)}...` : normalized;
}

function RichObservationEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [focused, setFocused] = useState(false);
  const sanitizedValue = useMemo(() => sanitizeRichTextHtml(value), [value]);
  const plainValue = useMemo(() => stripRichTextToPlain(value), [value]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || focused || editor.innerHTML === sanitizedValue) return;
    editor.innerHTML = sanitizedValue;
  }, [focused, sanitizedValue]);

  const syncEditorValue = () => {
    const editor = editorRef.current;
    if (!editor) return;
    onChange(normalizeEditorHtml(editor.innerHTML));
  };

  const commitEditorValue = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const cleanValue = sanitizeRichTextHtml(editor.innerHTML);
    if (editor.innerHTML !== cleanValue) editor.innerHTML = cleanValue;
    onChange(cleanValue);
  };

  const runCommand = (command: string, commandValue?: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    document.execCommand(command, false, commandValue);
    commitEditorValue();
  };

  const handleInput = (_event: FormEvent<HTMLDivElement>) => {
    syncEditorValue();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    document.execCommand(event.shiftKey ? "insertLineBreak" : "insertParagraph");
    requestAnimationFrame(syncEditorValue);
  };

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    const pastedText = event.clipboardData.getData("text/plain");
    document.execCommand("insertHTML", false, plainTextToRichTextHtml(pastedText));
    syncEditorValue();
  };

  const toolbarButtons = [
    { label: "Bold", icon: Bold, action: () => runCommand("bold") },
    { label: "Underline", icon: Underline, action: () => runCommand("underline") },
    { label: "Bullets", icon: List, action: () => runCommand("insertUnorderedList") },
    { label: "Numbering", icon: ListOrdered, action: () => runCommand("insertOrderedList") },
    { label: "Small", icon: Type, action: () => runCommand("fontSize", "1") },
    { label: "Normal", icon: Type, action: () => runCommand("fontSize", "3") },
    { label: "Large", icon: Type, action: () => runCommand("fontSize", "4") },
  ];

  return (
    <div className="mt-2 overflow-hidden rounded-2xl border border-border bg-bg-surface">
      <div className="grid grid-cols-7 gap-1 border-b border-border bg-bg px-2 py-2 sm:flex sm:overflow-x-auto">
        {toolbarButtons.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.label}
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                item.action();
              }}
              className="inline-flex min-h-10 min-w-0 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-border bg-bg-surface px-2 py-2 text-xs font-semibold text-txt-muted transition hover:border-accent hover:text-txt sm:px-3"
              title={item.label}
              aria-label={item.label}
            >
              <Icon size={14} />
              <span className="hidden sm:inline">{item.label}</span>
            </button>
          );
        })}
      </div>
      <div className="relative">
        {!plainValue && !focused ? (
          <div className="pointer-events-none absolute left-4 top-4 text-sm leading-6 text-txt-dim">
            Write your observation...
          </div>
        ) : null}
        <div
          ref={editorRef}
          role="textbox"
          aria-multiline="true"
          contentEditable
          suppressContentEditableWarning
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            commitEditorValue();
          }}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          className="rich-text-editor min-h-[190px] w-full overflow-y-auto px-4 py-4 text-sm leading-6 text-txt outline-none"
        />
      </div>
    </div>
  );
}

export default function SiteNotesModule() {
  const {
    project,
    siteNotes,
    addSiteNote,
    updateSiteNote,
    deleteSiteNote,
    duplicateSiteNote,
    addSiteNotePhoto,
    updateSiteNotePhoto,
    deleteSiteNotePhoto,
    createSiteVisitReportFromNote,
    setActiveModule,
  } = useAppStore();
  const [filter, setFilter] = useState<SiteNoteFilter>("all");
  const [deleteTarget, setDeleteTarget] = useState<SiteNote | null>(null);
  const [uploadingNoteId, setUploadingNoteId] = useState<string | null>(null);
  const [expandedNotes, setExpandedNotes] = useState<Record<string, boolean>>({});
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [dirtyNoteIds, setDirtyNoteIds] = useState<Record<string, boolean>>({});
  const [savedNoteId, setSavedNoteId] = useState<string | null>(null);
  const [openMenuNoteId, setOpenMenuNoteId] = useState<string | null>(null);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [reportTarget, setReportTarget] = useState<SiteNote | null>(null);
  const [reportOptions, setReportOptions] = useState<SiteVisitReportOptions>({
    ...DEFAULT_SITE_VISIT_REPORT_OPTIONS,
  });

  const projectNotes = useMemo(
    () =>
      siteNotes
        .filter((note) => note.project_id === project?.id)
        .sort((a, b) => b.noteDate.localeCompare(a.noteDate) || b.updatedAt.localeCompare(a.updatedAt)),
    [project?.id, siteNotes]
  );

  const visibleNotes = useMemo(() => {
    if (filter === "all") return projectNotes;
    return projectNotes.filter((note) => note.category === filter);
  }, [filter, projectNotes]);

  const metrics = useMemo(() => {
    const photoCount = projectNotes.reduce((sum, note) => sum + note.photos.length, 0);
    const latest = projectNotes[0]?.noteDate || "No visits";
    const openObservations = projectNotes.filter((note) =>
      ["observation", "issue", "safety", "instruction"].includes(note.category)
    ).length;

    return {
      total: projectNotes.length,
      photos: photoCount,
      latest,
      openObservations,
    };
  }, [projectNotes]);

  useEffect(() => {
    if (!activeNoteId && projectNotes[0]) {
      setActiveNoteId(projectNotes[0].id);
    }
  }, [activeNoteId, projectNotes]);

  const openNote = (noteId: string) => {
    setActiveNoteId(noteId);
    setExpandedNotes((current) => ({ ...current, [noteId]: true }));
    setOpenMenuNoteId(null);
  };

  const markNoteDirty = (noteId: string) => {
    setDirtyNoteIds((current) => ({ ...current, [noteId]: true }));
    if (savedNoteId === noteId) setSavedNoteId(null);
  };

  const handleUpdateNote = (noteId: string, updates: Partial<SiteNote>) => {
    updateSiteNote(noteId, updates);
    markNoteDirty(noteId);
  };

  const handleSaveNote = (noteId: string) => {
    updateSiteNote(noteId, {});
    setDirtyNoteIds((current) => {
      const next = { ...current };
      delete next[noteId];
      return next;
    });
    setSavedNoteId(noteId);
    window.setTimeout(() => {
      setSavedNoteId((current) => (current === noteId ? null : current));
    }, 2400);
  };

  const addBlankNote = () => {
    const noteId = uuid();
    addSiteNote({
      id: noteId,
      title: "New site observation",
      category: "observation",
      noteDate: todayISO(),
      authorName: project?.consultantName || "",
      weather: "",
      locationNote: project?.location || "",
      observationText: "",
    });
    setActiveNoteId(noteId);
    setExpandedNotes((current) => ({ ...current, [noteId]: true }));
    setDirtyNoteIds((current) => ({ ...current, [noteId]: true }));
  };

  const handlePhotoUpload = async (noteId: string, event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    setUploadingNoteId(noteId);
    try {
      for (const file of files) {
        const dataUrl = await readFileAsDataUrl(file);
        if (!dataUrl) continue;
        addSiteNotePhoto(noteId, {
          dataUrl,
          caption: file.name.replace(/\.[^.]+$/, ""),
          takenAt: todayISO(),
        });
      }
      setExpandedNotes((current) => ({ ...current, [noteId]: true }));
      markNoteDirty(noteId);
    } finally {
      setUploadingNoteId(null);
      event.target.value = "";
    }
  };

  const openReportModal = (note: SiteNote) => {
    setReportTarget(note);
    setReportOptions({ ...DEFAULT_SITE_VISIT_REPORT_OPTIONS });
  };

  const generateReport = () => {
    if (!reportTarget) return;
    createSiteVisitReportFromNote(reportTarget.id, reportOptions);
    setReportTarget(null);
    setActiveModule("documents");
  };

  const toggleReportOption = (key: SiteVisitReportSectionKey) => {
    setReportOptions((current) => ({ ...current, [key]: !current[key] }));
  };

  const activeNote = visibleNotes.find((note) => note.id === activeNoteId) ?? visibleNotes[0] ?? null;
  const filterLabel = filter === "all" ? "All" : categoryLabels[filter];
  const filterOptions: Array<{ id: SiteNoteFilter; label: string }> = [
    { id: "all", label: "All" },
    ...categories.map((category) => ({ id: category, label: categoryLabels[category] })),
  ];

  const renderNoteMenu = (note: SiteNote) => {
    const isOpen = openMenuNoteId === note.id;
    return (
      <div className="relative shrink-0">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setOpenMenuNoteId((current) => (current === note.id ? null : note.id));
          }}
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-bg-surface text-txt-muted transition hover:border-accent hover:text-txt"
          aria-label={`Actions for ${note.title || "site note"}`}
          aria-expanded={isOpen}
        >
          <MoreVertical size={16} />
        </button>
        {isOpen ? (
          <div
            className="absolute right-0 top-10 z-40 w-48 overflow-hidden rounded-2xl border border-border bg-bg-surface py-1 shadow-[0_18px_55px_rgba(0,0,0,0.45)]"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => openNote(note.id)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold text-txt-muted transition hover:bg-bg-hover hover:text-txt"
            >
              <NotebookPen size={14} /> Open
            </button>
            <button
              type="button"
              onClick={() => {
                setOpenMenuNoteId(null);
                openReportModal(note);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold text-txt-muted transition hover:bg-bg-hover hover:text-ok"
            >
              <FileText size={14} /> Prepare report
            </button>
            <button
              type="button"
              onClick={() => {
                duplicateSiteNote(note.id);
                setOpenMenuNoteId(null);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold text-txt-muted transition hover:bg-bg-hover hover:text-txt"
            >
              <Copy size={14} /> Duplicate
            </button>
            <button
              type="button"
              onClick={() => {
                setDeleteTarget(note);
                setOpenMenuNoteId(null);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold text-err transition hover:bg-err/10"
            >
              <Trash2 size={14} /> Delete
            </button>
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="mx-auto w-full max-w-[1500px] animate-fade-in px-2 sm:px-0">
      <div className="mb-4 flex flex-col gap-3 sm:mb-5 lg:flex-row lg:items-center lg:justify-between">
        <h2 className="text-lg font-semibold tracking-tight text-txt">Site Notes</h2>
        <Button size="sm" variant="primary" onClick={addBlankNote} className="w-full justify-center sm:w-auto">
          <Plus size={14} /> Add note
        </Button>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
        {[
          { label: "Notes", value: metrics.total, tone: "text-txt" },
          { label: "Photos", value: metrics.photos, tone: "text-accent" },
          { label: "Latest", value: metrics.latest, tone: "text-txt" },
          { label: "Open", value: metrics.openObservations, tone: "text-warn" },
        ].map((card) => (
          <div key={card.label} className="rounded-2xl border border-border bg-bg-surface p-3 sm:p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">
              {card.label}
            </div>
            <div className={`mt-2 truncate text-xl font-semibold sm:text-2xl ${card.tone}`}>{card.value}</div>
          </div>
        ))}
      </div>

      {projectNotes.length > 0 ? (
        <section className="mb-4 overflow-visible rounded-2xl border border-border bg-bg-surface p-3 sm:p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-base font-semibold text-txt sm:text-lg">Saved notes</h3>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="rounded-xl border border-border bg-bg px-3 py-2 text-xs font-semibold text-txt-muted">
                Showing: <span className="text-txt">{filterLabel}</span> · {visibleNotes.length} / {projectNotes.length}
              </div>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowFilterMenu((current) => !current)}
                  className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-border bg-bg px-3 py-2 text-sm font-semibold text-txt transition hover:bg-bg-hover sm:w-auto"
                  aria-expanded={showFilterMenu}
                >
                  <ChevronDown size={15} /> Filter
                </button>
                {showFilterMenu ? (
                  <div className="absolute right-0 top-12 z-40 w-full min-w-52 overflow-hidden rounded-2xl border border-border bg-bg-surface py-1 shadow-[0_18px_55px_rgba(0,0,0,0.45)] sm:w-56">
                    {filterOptions.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setFilter(item.id);
                          setShowFilterMenu(false);
                        }}
                        className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm font-semibold transition ${
                          filter === item.id
                            ? "bg-accent/15 text-txt"
                            : "text-txt-muted hover:bg-bg-hover hover:text-txt"
                        }`}
                      >
                        {item.label}
                        {filter === item.id ? <CheckCircle2 size={14} className="text-accent" /> : null}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
          <div className="mt-3 space-y-3 sm:hidden">
            {visibleNotes.map((note) => {
              const isActive = activeNote?.id === note.id;
              const isDirty = Boolean(dirtyNoteIds[note.id]);
              return (
                <div
                  key={note.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setActiveNoteId(note.id);
                    setExpandedNotes((current) => ({ ...current, [note.id]: true }));
                    setOpenMenuNoteId(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    setActiveNoteId(note.id);
                    setExpandedNotes((current) => ({ ...current, [note.id]: true }));
                    setOpenMenuNoteId(null);
                  }}
                  className={`flex w-full items-start gap-3 rounded-2xl border bg-bg-surface p-3 text-left transition ${
                    isActive ? "border-accent" : "border-border"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-accent">{categoryLabels[note.category]}</span>
                      <span className="text-xs font-semibold text-txt-muted">{note.noteDate || "No date"}</span>
                    </div>
                    <div className="mt-1 truncate text-sm font-semibold text-txt">{note.title || "Site observation"}</div>
                    <div className="mt-0.5 truncate text-xs leading-5 text-txt-muted">
                      {note.authorName ? `${note.authorName} · ` : ""}
                      {notePreview(note.observationText)}
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-xs">
                      <span className="font-semibold text-txt-muted">
                        {note.photos.length} photo{note.photos.length === 1 ? "" : "s"}
                      </span>
                      <span className={`font-semibold ${isDirty ? "text-warn" : "text-txt-dim"}`}>
                        {isDirty ? "Unsaved" : "Saved"}
                      </span>
                    </div>
                  </div>
                  {renderNoteMenu(note)}
                </div>
              );
            })}
          </div>
          <div className="data-table-shell mt-3 hidden sm:block">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 110 }}>Date</th>
                  <th style={{ width: 120 }}>Category</th>
                  <th>Title</th>
                  <th style={{ width: 90 }}>Photos</th>
                  <th style={{ width: 100 }}>Status</th>
                  <th style={{ width: 44 }} aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {visibleNotes.map((note) => {
                  const isActive = activeNote?.id === note.id;
                  const isDirty = Boolean(dirtyNoteIds[note.id]);
                  return (
                    <tr
                      key={note.id}
                      onClick={() => {
                        setActiveNoteId(note.id);
                        setExpandedNotes((current) => ({ ...current, [note.id]: true }));
                        setOpenMenuNoteId(null);
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        setActiveNoteId(note.id);
                        setExpandedNotes((current) => ({ ...current, [note.id]: true }));
                        setOpenMenuNoteId(null);
                      }}
                      tabIndex={0}
                      className={`cursor-pointer ${isActive ? "bg-accent/10" : ""}`}
                    >
                      <td className="text-xs font-semibold text-txt-muted">{note.noteDate || "No date"}</td>
                      <td className="text-xs font-bold text-accent">{categoryLabels[note.category]}</td>
                      <td className="data-cell-wrap">
                        <div className="truncate text-sm font-semibold text-txt">{note.title || "Site observation"}</div>
                        <div className="mt-0.5 truncate text-xs leading-5 text-txt-muted">
                          {note.authorName ? `${note.authorName} · ` : ""}
                          {notePreview(note.observationText)}
                        </div>
                      </td>
                      <td className="text-xs font-semibold text-txt-muted">
                        {note.photos.length} photo{note.photos.length === 1 ? "" : "s"}
                      </td>
                      <td className={`text-xs font-semibold ${isDirty ? "text-warn" : "text-txt-dim"}`}>
                        {isDirty ? "Unsaved" : "Saved"}
                      </td>
                      <td className="data-cell-action" onClick={(event) => event.stopPropagation()}>
                        {renderNoteMenu(note)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {visibleNotes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-bg-surface p-6 text-center sm:p-8">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl border border-border bg-bg">
            <NotebookPen size={22} className="text-accent" />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-txt">
            {projectNotes.length > 0 && filter !== "all" ? `No ${filterLabel} notes` : "No site notes yet"}
          </h3>
          <div className="mt-4 flex flex-col justify-center gap-2 sm:flex-row">
            {projectNotes.length > 0 && filter !== "all" ? (
              <Button size="md" onClick={() => setFilter("all")} className="justify-center">
                Clear filter
              </Button>
            ) : null}
            <Button variant="primary" size="md" onClick={addBlankNote} className="justify-center">
              <Plus size={14} /> Add note
            </Button>
          </div>
        </div>
      ) : activeNote ? (
        <div className="grid gap-3">
          {(() => {
            const note = activeNote;
            const expanded = Boolean(expandedNotes[note.id]);
            const isDirty = Boolean(dirtyNoteIds[note.id]);
            const recentlySaved = savedNoteId === note.id;
            return (
              <article
                key={note.id}
                className="rounded-2xl border border-border bg-bg-surface p-3 transition sm:p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-accent">{categoryLabels[note.category]}</span>
                      <span className="rounded-lg border border-border bg-bg px-2 py-1 text-[11px] font-semibold text-txt-muted">
                        {note.noteDate || "No date"}
                      </span>
                      <span className="rounded-lg border border-border bg-bg px-2 py-1 text-[11px] font-semibold text-txt-muted">
                        {note.photos.length} photo{note.photos.length === 1 ? "" : "s"}
                      </span>
                      <span
                        className={`rounded-lg border px-2 py-1 text-[11px] font-semibold ${
                          isDirty
                            ? "border-warn/30 bg-warn/10 text-warn"
                            : "border-ok/25 bg-ok/10 text-ok"
                        }`}
                      >
                        {isDirty ? "Unsaved changes" : recentlySaved ? "Saved now" : "Saved"}
                      </span>
                    </div>
                    <h3 className="mt-3 break-words text-lg font-semibold leading-tight text-txt">
                      {note.title || "Site observation"}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-txt-muted">{notePreview(note.observationText)}</p>
                  </div>
                  {renderNoteMenu(note)}
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  <label className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-border bg-bg-raised px-3 py-2 text-sm font-semibold text-txt transition hover:bg-bg-hover">
                    <ImagePlus size={15} />
                    {uploadingNoteId === note.id ? "Uploading..." : "Add photos"}
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(event) => handlePhotoUpload(note.id, event)}
                      className="sr-only"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => openReportModal(note)}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-ok/25 bg-ok/10 px-3 py-2 text-sm font-semibold text-ok transition hover:bg-ok/20"
                  >
                    <FileText size={15} /> Prepare report
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveNoteId(note.id);
                      setExpandedNotes((current) => ({ ...current, [note.id]: !expanded }));
                    }}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-bg px-3 py-2 text-sm font-semibold text-txt transition hover:bg-bg-hover"
                  >
                    {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                    {expanded ? "Hide details" : "Edit details"}
                  </button>
                </div>

                {expanded ? (
                  <div className="mt-4 rounded-2xl border border-border bg-bg p-3 sm:p-4">
                    <div className="mb-4 flex flex-col gap-2 rounded-2xl border border-border bg-bg-surface p-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <CheckCircle2 size={16} className={isDirty ? "text-warn" : "text-ok"} />
                        <span className={isDirty ? "text-warn" : "text-ok"}>
                          {isDirty ? "Unsaved changes" : recentlySaved ? "Saved just now" : "Saved"}
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => handleSaveNote(note.id)}
                        className="justify-center"
                      >
                        <Save size={14} /> Save note
                      </Button>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="block md:col-span-2">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">Title</span>
                        <input
                          value={note.title}
                          onChange={(event) => handleUpdateNote(note.id, { title: event.target.value })}
                          className="mt-2 w-full rounded-lg border border-border bg-bg-surface px-3 py-3 text-base font-semibold text-txt outline-none focus:border-accent"
                        />
                      </label>
                      <label className="block">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">Category</span>
                        <select
                          value={note.category}
                          onChange={(event) => handleUpdateNote(note.id, { category: event.target.value as SiteNoteCategory })}
                          className="mt-2 w-full rounded-lg border border-border bg-bg-surface px-3 py-3 text-txt outline-none focus:border-accent"
                        >
                          {categories.map((category) => (
                            <option key={category} value={category}>
                              {categoryLabels[category]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">Visit date</span>
                        <input
                          type="date"
                          value={note.noteDate}
                          onChange={(event) => handleUpdateNote(note.id, { noteDate: event.target.value })}
                          className="mt-2 w-full rounded-lg border border-border bg-bg-surface px-3 py-3 text-txt outline-none focus:border-accent"
                        />
                      </label>
                      <label className="block">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">Author</span>
                        <input
                          value={note.authorName}
                          onChange={(event) => handleUpdateNote(note.id, { authorName: event.target.value })}
                          placeholder="Prepared by"
                          className="mt-2 w-full rounded-lg border border-border bg-bg-surface px-3 py-3 text-txt outline-none focus:border-accent"
                        />
                      </label>
                      <label className="block">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">Weather</span>
                        <input
                          value={note.weather}
                          onChange={(event) => handleUpdateNote(note.id, { weather: event.target.value })}
                          placeholder="Clear, rainy, windy..."
                          className="mt-2 w-full rounded-lg border border-border bg-bg-surface px-3 py-3 text-txt outline-none focus:border-accent"
                        />
                      </label>
                      <label className="block md:col-span-2">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">Site area / location note</span>
                        <input
                          value={note.locationNote}
                          onChange={(event) => handleUpdateNote(note.id, { locationNote: event.target.value })}
                          placeholder="Block A, drainage line, chainage..."
                          className="mt-2 w-full rounded-lg border border-border bg-bg-surface px-3 py-3 text-txt outline-none focus:border-accent"
                        />
                      </label>
                      <div className="block md:col-span-2">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">Observation text</span>
                        <RichObservationEditor
                          value={note.observationText}
                          onChange={(observationText) => handleUpdateNote(note.id, { observationText })}
                        />
                      </div>
                    </div>

                    <div className="mt-4">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">Photo gallery</div>
                      {note.photos.length > 0 ? (
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          {[...note.photos]
                            .sort((a, b) => a.sortOrder - b.sortOrder)
                            .map((photo) => (
                              <div key={photo.id} className="overflow-hidden rounded-2xl border border-border bg-bg-surface">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={photo.dataUrl} alt={photo.caption || "Site note photo"} className="h-48 w-full object-cover" />
                                <div className="space-y-2 p-3">
                                  <input
                                    value={photo.caption}
                                    onChange={(event) => {
                                      updateSiteNotePhoto(note.id, photo.id, { caption: event.target.value });
                                      markNoteDirty(note.id);
                                    }}
                                    placeholder="Photo caption"
                                    className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-txt outline-none focus:border-accent"
                                  />
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-[11px] text-txt-dim">{photo.takenAt || note.noteDate}</span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        deleteSiteNotePhoto(note.id, photo.id);
                                        markNoteDirty(note.id);
                                      }}
                                      className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-err/25 bg-err/10 px-2 py-1 text-[11px] font-semibold text-err transition hover:bg-err/20"
                                    >
                                      <Trash2 size={12} /> Remove
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))}
                        </div>
                      ) : (
                        <div className="mt-3 rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-txt-muted">
                          <Camera size={20} className="mx-auto mb-2 text-txt-dim" />
                          No photos attached to this note yet.
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })()}
        </div>
      ) : null}

      <Modal
        open={Boolean(reportTarget)}
        onClose={() => setReportTarget(null)}
        title="Prepare Site Visit Report"
        width={720}
      >
        <div className="space-y-4">
          {reportOptionGroups.map((group) => (
            <section key={group.title} className="rounded-2xl border border-border bg-bg p-3">
              <div className="text-sm font-semibold text-txt">{group.title}</div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {group.options.map((option) => (
                  <label
                    key={option.key}
                    className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-border bg-bg-surface px-3 py-2 text-sm font-semibold text-txt transition hover:bg-bg-hover"
                  >
                    <input
                      type="checkbox"
                      checked={reportOptions[option.key]}
                      onChange={() => toggleReportOption(option.key)}
                      className="h-4 w-4 accent-accent"
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </section>
          ))}
        </div>
        <div className="mt-5 grid gap-2 sm:flex sm:justify-end">
          <Button onClick={() => setReportTarget(null)} className="justify-center">
            Cancel
          </Button>
          <Button variant="primary" onClick={generateReport} className="justify-center">
            <FileText size={14} /> Generate report
          </Button>
        </div>
      </Modal>

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete Site Note"
      >
        <p className="text-sm leading-6 text-txt-muted">
          Delete <span className="font-semibold text-txt">{deleteTarget?.title}</span>?
        </p>
        <div className="mt-5 grid gap-2 sm:flex sm:justify-end">
          <Button onClick={() => setDeleteTarget(null)} className="justify-center">
            Cancel
          </Button>
          <Button
            variant="danger"
            className="justify-center"
            onClick={() => {
              if (deleteTarget) {
                deleteSiteNote(deleteTarget.id);
                setDirtyNoteIds((current) => {
                  const next = { ...current };
                  delete next[deleteTarget.id];
                  return next;
                });
                if (activeNoteId === deleteTarget.id) setActiveNoteId(null);
              }
              setDeleteTarget(null);
            }}
          >
            Delete note
          </Button>
        </div>
      </Modal>
    </div>
  );
}
