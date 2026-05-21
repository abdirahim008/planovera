"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { useAppStore } from "@/lib/store";
import Badge from "@/components/ui/Badge";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase-browser";
import {
  ArrowLeft,
  Calendar,
  ClipboardCheck,
  ClipboardList,
  Building2,
  DollarSign,
  FileText,
  Home,
  LayoutGrid,
  LogOut,
  Mail,
  MessagesSquare,
  NotebookPen,
  PenTool,
  PanelLeft,
  PanelLeftClose,
  Table,
  X,
} from "lucide-react";

interface SidebarProps {
  isMobile?: boolean;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
  forceCollapsed?: boolean;
}

export default function Sidebar({
  isMobile = false,
  mobileOpen = false,
  onCloseMobile,
  forceCollapsed = false,
}: SidebarProps) {
  const router = useRouter();
  const authConfigured = isSupabaseConfigured();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const {
    project,
    activeModule,
    setActiveModule,
    clearProjectSelection,
    clearWorkspaceData,
    setProjects,
    sidebarCollapsed,
  } = useAppStore();

  const hasProject = Boolean(project);
  const isConstruction = project?.type === "construction";
  const canPayment =
    hasProject &&
    isConstruction &&
    (project.role === "supervision" || project.role === "employer");

  const navItems = hasProject
    ? [
        { id: "dashboard", label: "Overview", icon: Home },
        ...(isConstruction
          ? [{ id: "boq", label: "BOQ", icon: LayoutGrid }]
          : [{ id: "items", label: "Items", icon: Table }]),
        { id: "progress", label: "Progress", icon: ClipboardList },
        { id: "site-notes", label: "Site Notes", icon: NotebookPen },
        ...(canPayment ? [{ id: "payment", label: "Payments", icon: DollarSign }] : []),
        { id: "workplan", label: "Work Plan", icon: Calendar },
        { id: "drawings", label: "Drawings", icon: PenTool },
        { id: "correspondence", label: "Correspondence", icon: Mail },
        { id: "documents", label: "Documents", icon: FileText },
        { id: "checklist", label: "Checklist", icon: ClipboardCheck },
      ]
    : [
        { id: "dashboard", label: "Portfolio", icon: Home },
        { id: "meetings", label: "Meetings", icon: MessagesSquare },
      ];

  const collapsed = isMobile ? false : forceCollapsed || sidebarCollapsed;
  const handleBrandClick = () => {
    setActiveModule("dashboard");
    router.push("/");

    if (isMobile) {
      onCloseMobile?.();
    }
  };

  const handleNavClick = (moduleId: string) => {
    if (moduleId === "drawings" && project?.id) {
      if (isMobile) onCloseMobile?.();
      const studioUrl = `/drawings/studio?projectId=${encodeURIComponent(project.id)}`;
      const opened = window.open(studioUrl, "_blank");

      if (opened) {
        opened.opener = null;
        opened.focus();
      } else {
        router.push(studioUrl);
      }
      return;
    }

    setActiveModule(moduleId);
    if (isMobile) onCloseMobile?.();
  };

  const handleBackToPortfolio = () => {
    clearProjectSelection();
    if (isMobile) onCloseMobile?.();
  };

  const handleSignOut = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setIsSigningOut(true);
    clearProjectSelection();
    clearWorkspaceData();
    setProjects([]);

    await supabase.auth.signOut();

    router.replace("/login");
    router.refresh();
  };

  const desktopWidth = collapsed ? 72 : 240;

  const content = (
    <div
      className={clsx(
        "flex h-full flex-col border-r border-border bg-bg-surface",
        isMobile ? "w-[280px] shadow-[0_24px_80px_rgba(0,0,0,0.45)]" : "transition-all duration-200"
      )}
      style={isMobile ? undefined : { width: desktopWidth }}
    >
      <div
        className={clsx(
          "flex cursor-pointer items-center gap-2.5 border-b border-border",
          collapsed ? "justify-center px-2 py-4" : "px-4 py-4"
        )}
        onClick={handleBrandClick}
      >
        <img
          src="/brand/planovera-mark.png"
          alt="Planovera"
          className="h-9 w-9 flex-shrink-0 rounded-xl object-contain"
        />
        {!collapsed && (
          <>
            <div className="min-w-0">
              <div className="truncate text-sm font-bold tracking-tight">Planovera</div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-txt-dim">
                Project Controls
              </div>
            </div>
            {isMobile ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onCloseMobile?.();
                }}
                className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-transparent text-txt-dim transition hover:bg-bg-hover hover:text-txt"
                aria-label="Close navigation"
              >
                <X size={16} />
              </button>
            ) : (
              <PanelLeftClose size={16} className="ml-auto flex-shrink-0 text-txt-dim" />
            )}
          </>
        )}
        {collapsed && !isMobile && (
          <div className="hidden">
            <PanelLeft size={16} />
          </div>
        )}
      </div>

      {hasProject && !collapsed && (
        <div className="border-b border-border px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[10px] uppercase tracking-[0.18em] text-txt-dim">Current Project</div>
            <button
              type="button"
              onClick={handleBackToPortfolio}
              className="inline-flex items-center gap-1 rounded-lg border border-border bg-bg-raised px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-txt-dim transition hover:bg-bg-hover hover:text-txt"
            >
              <ArrowLeft size={12} />
              All Projects
            </button>
          </div>
          <div className="mt-2 truncate text-sm font-semibold text-white">{project?.name}</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge color={isConstruction ? "accent" : "purple"}>
              {isConstruction ? "CONSTR" : "NON-C"}
            </Badge>
            <Badge color="ok">{project?.role?.toUpperCase().slice(0, 6) || ""}</Badge>
          </div>
        </div>
      )}

      {!hasProject && !collapsed && (
        <div className="border-b border-border px-4 py-3">
          <div className="text-[10px] uppercase tracking-[0.18em] text-txt-dim">Portfolio Mode</div>
          <div className="mt-2 text-sm font-semibold text-white">Overall Project Dashboard</div>
          <div className="mt-1 text-xs leading-5 text-txt-muted">
            Open a project to access BOQ, progress, payment, work plan, correspondence, and documents.
          </div>
        </div>
      )}

      <nav className="flex-1 overflow-y-auto p-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = activeModule === item.id;

          return (
            <button
              key={item.id}
              onClick={() => handleNavClick(item.id)}
              className={clsx(
                "mb-1 flex w-full cursor-pointer items-center gap-2.5 rounded-xl border text-[13px] transition-all duration-150",
                collapsed ? "justify-center p-3" : "px-3 py-3",
                active
                  ? "border-accent/25 bg-accent/10 font-semibold text-accent"
                  : "border-transparent bg-transparent text-txt-muted hover:bg-bg-hover hover:text-txt"
              )}
              title={collapsed ? item.label : undefined}
            >
              <Icon size={18} />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {!collapsed && hasProject && (
        <div className="border-t border-border p-4">
          <div className="text-[10px] uppercase tracking-[0.18em] text-txt-dim">Workspace</div>
          <div className="mt-1 text-xs leading-5 text-txt-muted">
            {project?.location || "Location not set"}
            <br />
            {project?.contractTitle || "Contract title not set"}
          </div>
        </div>
      )}

      {authConfigured ? (
        <div className={clsx("border-t border-border", collapsed ? "p-2" : "p-4")}>
          <a
            href="/organization"
            className={clsx(
              "mb-2 flex w-full items-center rounded-xl border border-border bg-bg-raised text-sm font-semibold text-txt transition hover:bg-bg-hover",
              collapsed ? "justify-center px-0 py-3" : "gap-2.5 px-3 py-3",
            )}
            title={collapsed ? "Organization" : undefined}
          >
            <Building2 size={16} />
            {!collapsed ? <span>Organization</span> : null}
          </a>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={isSigningOut}
            className={clsx(
              "flex w-full items-center rounded-xl border border-border bg-bg-raised text-sm font-semibold text-txt transition hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-60",
              collapsed ? "justify-center px-0 py-3" : "gap-2.5 px-3 py-3",
            )}
            title={collapsed ? "Sign out" : undefined}
          >
            <LogOut size={16} />
            {!collapsed ? <span>{isSigningOut ? "Signing out..." : "Sign out"}</span> : null}
          </button>
        </div>
      ) : null}
    </div>
  );

  if (!isMobile) {
    return <aside className="hidden h-full flex-shrink-0 lg:flex">{content}</aside>;
  }

  return (
    <div
      className={clsx(
        "fixed inset-0 z-50 lg:hidden",
        mobileOpen ? "pointer-events-auto" : "pointer-events-none"
      )}
      aria-hidden={!mobileOpen}
    >
      <div
        className={clsx(
          "absolute inset-0 bg-black/60 transition-opacity duration-200",
          mobileOpen ? "opacity-100" : "opacity-0"
        )}
        onClick={onCloseMobile}
      />
      <div
        className={clsx(
          "absolute inset-y-0 left-0 transition-transform duration-200",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {content}
      </div>
    </div>
  );
}
