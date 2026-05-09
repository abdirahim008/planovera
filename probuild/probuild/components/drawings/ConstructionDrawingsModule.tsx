"use client";

import { ExternalLink, Maximize2 } from "lucide-react";

import { useAppStore } from "@/lib/store";

export default function ConstructionDrawingsModule() {
  const project = useAppStore((state) => state.project);
  const studioUrl = project?.id
    ? `/drawings/studio?projectId=${encodeURIComponent(project.id)}`
    : "/drawings/studio";

  const handleOpenStudio = () => {
    const opened = window.open(studioUrl, "_blank");

    if (opened) {
      opened.opener = null;
      opened.focus();
      return;
    }

    window.location.assign(studioUrl);
  };

  if (!project) {
    return (
      <div className="rounded-[28px] border border-border bg-bg-surface p-8 text-center text-sm text-txt-muted">
        Open a project to access the technical drawing workspace.
      </div>
    );
  }

  return (
    <section className="flex min-h-[360px] items-center justify-center rounded-[32px] border border-border bg-bg-surface p-8 text-center shadow-[0_24px_90px_rgba(0,0,0,0.24)]">
      <div className="max-w-md">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-accent/30 bg-accent/10 text-accent">
          <Maximize2 size={20} />
        </div>
        <p className="mt-5 text-[11px] font-black uppercase tracking-[0.24em] text-accent">
          Drawing studio
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white">
          Open the full-window canvas.
        </h1>
        <p className="mt-3 text-sm leading-6 text-txt-muted">
          The drawing editor is a separate professional workspace, so your dashboard remains open while
          the canvas gets the available screen space.
        </p>
        <button
          type="button"
          onClick={handleOpenStudio}
          className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-bold text-white shadow-[0_18px_40px_rgba(37,99,235,0.28)] transition hover:bg-accent-strong"
        >
          Open Drawing Studio
          <ExternalLink size={16} />
        </button>
      </div>
    </section>
  );
}
