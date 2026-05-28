"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { useAppStore } from "@/lib/store";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase-browser";
import { labelsForType, isConstructionProject } from "@/lib/project-labels";
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
  Shield,
  Table,
  Users,
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
  const isConstruction = isConstructionProject(project);
  const labels = labelsForType(project);
  // Non-construction projects don't have FIDIC payment certificates — for now we only
  // surface a "Payments" / "Invoices" entry to construction supervisors/employers. The
  // lightweight non-construction milestone invoice flow lives behind the Documents module.
  const canPayment =
    hasProject &&
    isConstruction &&
    (project?.role === "supervision" || project?.role === "employer");

  // Drawings (Fabric.js technical drawings) and Site Notes (site inspection records) are
  // construction-only modules. They're hidden for non-construction projects rather than
  // renamed, because the underlying tooling doesn't make sense outside a construction site.
  const showDrawings = isConstruction;
  const showSiteNotes = isConstruction;

  // Risks + Stakeholders are universal — surfaced on every project type. They live
  // toward the end of the nav so the construction-first chrome at the top stays familiar.
  const navItems = hasProject
    ? [
        { id: "dashboard", label: "Overview", icon: Home },
        ...(isConstruction
          ? [{ id: "boq", label: labels.nav.boqOrItems, icon: LayoutGrid }]
          : [{ id: "items", label: labels.nav.boqOrItems, icon: Table }]),
        { id: "progress", label: labels.nav.progress, icon: ClipboardList },
        ...(showSiteNotes ? [{ id: "site-notes", label: labels.nav.siteNotes, icon: NotebookPen }] : []),
        ...(canPayment ? [{ id: "payment", label: labels.nav.payment, icon: DollarSign }] : []),
        { id: "workplan", label: labels.nav.workPlan, icon: Calendar },
        ...(showDrawings ? [{ id: "drawings", label: labels.nav.drawings, icon: PenTool }] : []),
        { id: "correspondence", label: labels.nav.correspondence, icon: Mail },
        { id: "documents", label: labels.nav.documents, icon: FileText },
        { id: "checklist", label: labels.nav.checklist, icon: ClipboardCheck },
        { id: "risks", label: "Risks", icon: Shield },
        { id: "stakeholders", label: "Stakeholders", icon: Users },
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
            <div className="min-w-0 truncate text-sm font-semibold tracking-tight text-white">
              Planovera
            </div>
            {isMobile ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onCloseMobile?.();
                }}
                className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-lg text-txt-dim transition hover:bg-bg-hover hover:text-txt"
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
          <button
            type="button"
            onClick={handleBackToPortfolio}
            className="inline-flex items-center gap-1.5 text-[11px] font-medium text-txt-dim transition hover:text-txt"
          >
            <ArrowLeft size={12} />
            All projects
          </button>
          <div className="mt-2 truncate text-sm font-semibold text-white">{project?.name}</div>
          {project?.role ? (
            <div className="mt-1.5 text-[11px] capitalize text-txt-muted">
              {project.role}
            </div>
          ) : null}
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
                "mb-0.5 flex w-full cursor-pointer items-center gap-2.5 rounded-lg text-[13px] font-medium transition-colors duration-150",
                collapsed ? "justify-center p-2.5" : "px-3 py-2",
                active
                  ? "bg-accent/12 text-accent"
                  : "text-txt-muted hover:bg-bg-hover hover:text-txt"
              )}
              title={collapsed ? item.label : undefined}
            >
              <Icon size={17} />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {authConfigured ? (
        <div className={clsx("border-t border-border", collapsed ? "p-2" : "p-3")}>
          <a
            href="/organization"
            className={clsx(
              "mb-1 flex w-full items-center rounded-lg text-[13px] font-medium text-txt-muted transition-colors duration-150 hover:bg-bg-hover hover:text-txt",
              collapsed ? "justify-center p-2.5" : "gap-2.5 px-3 py-2",
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
              "flex w-full items-center rounded-lg text-[13px] font-medium text-txt-muted transition-colors duration-150 hover:bg-bg-hover hover:text-txt disabled:cursor-not-allowed disabled:opacity-60",
              collapsed ? "justify-center p-2.5" : "gap-2.5 px-3 py-2",
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
