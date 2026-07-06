"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import AdminGate from "@/components/drawings/AdminGate";
import Editor from "@/components/drawings/Editor";
import type { Project } from "@/lib/supabase";
import { useAppStore } from "@/lib/store";
import { isSupabaseConfigured } from "@/lib/supabase-browser";

function toLinkedProject(project: Project) {
  return {
    id: project.id,
    name: project.name,
    clientName: project.clientName,
    contractorName: project.contractorName,
    consultantName: project.consultantName,
    contractTitle: project.contractTitle,
    code: project.code,
    location: project.location,
  };
}

export default function DrawingStudioRoute() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId");
  const editLibraryId = searchParams.get("editLibraryId");
  const projects = useAppStore((state) => state.projects);
  const selectedProject = useAppStore((state) => state.project);
  const selectProject = useAppStore((state) => state.selectProject);
  const loadDemoWorkspace = useAppStore((state) => state.loadDemoWorkspace);
  const activeModule = useAppStore((state) => state.activeModule);
  const setActiveModule = useAppStore((state) => state.setActiveModule);

  useEffect(() => {
    // Every store write re-serializes the whole persisted workspace to
    // localStorage (shared with the main app tab) — skip it when already set.
    if (activeModule !== "drawings") setActiveModule("drawings");

    if (projects.length === 0) {
      // Demo mode only: seed the sample workspace so the studio has a project
      // to link to. With real auth this must never run — loadDemoWorkspace()
      // REPLACES the store (and its localStorage persistence, shared with the
      // main app tab) with demo data; a signed-in user with no local projects
      // just gets the unlinked editor instead.
      if (!isSupabaseConfigured()) loadDemoWorkspace();
      return;
    }

    const targetProject = projectId
      ? projects.find((item) => item.id === projectId)
      : selectedProject ?? projects[0];

    if (targetProject && selectedProject?.id !== targetProject.id) {
      selectProject(targetProject.id);
    }
  }, [activeModule, loadDemoWorkspace, projectId, projects, selectProject, selectedProject, setActiveModule]);

  const activeProject = useMemo(() => {
    if (projectId) return projects.find((item) => item.id === projectId) ?? null;
    return selectedProject ?? projects[0] ?? null;
  }, [projectId, projects, selectedProject]);

  if (!activeProject) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-white">
        <div className="max-w-lg rounded-[28px] border border-white/10 bg-white/8 p-8 text-center shadow-[0_28px_90px_rgba(0,0,0,0.35)] backdrop-blur-xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-sky-300">
            Drawing Studio
          </p>
          <h1 className="mt-3 text-2xl font-semibold">Preparing the full-window editor</h1>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            Loading the project context from Planovera so the drawing workspace can
            open without the dashboard sidebars.
          </p>
          <Link
            href="/workspace"
            className="mt-6 inline-flex rounded-xl border border-white/15 bg-white px-4 py-2 text-sm font-semibold text-slate-950"
          >
            Return to Planovera
          </Link>
        </div>
      </main>
    );
  }

  return (
    <AdminGate>
      <Editor linkedProject={toLinkedProject(activeProject)} editLibraryId={editLibraryId} />
    </AdminGate>
  );
}
