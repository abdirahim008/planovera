"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import Editor from "@/components/drawings/Editor";
import type { Project } from "@/lib/supabase";
import { useAppStore } from "@/lib/store";

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
  const projects = useAppStore((state) => state.projects);
  const selectedProject = useAppStore((state) => state.project);
  const selectProject = useAppStore((state) => state.selectProject);
  const loadDemoWorkspace = useAppStore((state) => state.loadDemoWorkspace);
  const setActiveModule = useAppStore((state) => state.setActiveModule);

  useEffect(() => {
    setActiveModule("drawings");

    if (projects.length === 0) {
      loadDemoWorkspace();
      return;
    }

    const targetProject = projectId
      ? projects.find((item) => item.id === projectId)
      : selectedProject ?? projects[0];

    if (targetProject && selectedProject?.id !== targetProject.id) {
      selectProject(targetProject.id);
    }
  }, [loadDemoWorkspace, projectId, projects, selectProject, selectedProject, setActiveModule]);

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

  return <Editor linkedProject={toLinkedProject(activeProject)} />;
}
