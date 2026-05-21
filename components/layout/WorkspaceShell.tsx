"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Menu } from "lucide-react";

import { useAppStore } from "@/lib/store";
import Sidebar from "@/components/layout/Sidebar";
import Dashboard from "@/components/layout/Dashboard";
import BOQModule from "@/components/boq/BOQModule";
import SimpleItemsTable from "@/components/boq/SimpleItemsTable";
import PaymentModule from "@/components/payment/PaymentModule";
import WorkPlanModule from "@/components/workplan/WorkPlanModule";
import ProgressModule from "@/components/progress/ProgressModule";
import DocumentsModule from "@/components/documents/DocumentsModule";
import CorrespondenceModule from "@/components/correspondence/CorrespondenceModule";
import ChecklistModule from "@/components/checklist/ChecklistModule";
import SiteNotesModule from "@/components/site-notes/SiteNotesModule";
import MeetingMinutesModule from "@/components/meetings/MeetingMinutesModule";
import ConstructionDrawingsModule from "@/components/drawings/ConstructionDrawingsModule";
import {
  getSupabaseBrowserClient,
  isSupabaseConfigured,
} from "@/lib/supabase-browser";
import {
  mapBOQLibraryItemRecord,
  mapProgramRecord,
  mapProjectCategoryRecord,
  mapProjectRecord,
  normalizeConstructionWorkspacePayload,
  type BOQLibraryItemRecord,
  type ConstructionWorkspaceRecord,
  type OrganizationMembershipRecord,
  type OrganizationSubscriptionRecord,
  type ProjectCategoryRecord,
  type ProgramRecord,
  type ProjectRecord,
} from "@/lib/supabase";
import { formatSubscriptionExpiry, isSubscriptionUsable } from "@/lib/subscriptions";
import {
  buildProjectSyncSignature,
  buildRelationalWorkspacePayload,
  mergeWorkspacePayloadSources,
} from "@/lib/workspace-sync";

const moduleLabels: Record<string, string> = {
  dashboard: "Dashboard",
  boq: "BOQ",
  items: "Items",
  progress: "Progress",
  payment: "Payments",
  workplan: "Work Plan",
  drawings: "Drawings",
  documents: "Documents",
  correspondence: "Correspondence",
  checklist: "Checklist",
  "site-notes": "Site Notes",
  meetings: "Meetings",
};

type CollaboratorPresence = {
  id: string;
  name: string;
  email: string;
  activeModule: string | null;
  lastSeenAt: string;
  isCurrentUser: boolean;
};

type ProjectPresenceRecord = {
  user_id: string;
  active_module?: string | null;
  last_seen_at: string;
  profiles?:
    | {
        full_name?: string | null;
        email?: string | null;
      }
    | Array<{
        full_name?: string | null;
        email?: string | null;
      }>
    | null;
};

type SubscriptionBlockState = {
  organizationName: string;
  expiresAt: string;
  canManage: boolean;
};

function SubscriptionExpiredScreen({ block }: { block: SubscriptionBlockState }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-6">
      <div className="w-full max-w-2xl rounded-[32px] border border-err/25 bg-bg-surface p-8 text-center shadow-[0_28px_90px_rgba(0,0,0,0.36)]">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-err/30 bg-err/10 text-err">
          <Menu size={22} />
        </div>
        <p className="mt-5 text-[11px] font-black uppercase tracking-[0.24em] text-err">
          Subscription expired
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-white">
          {block.organizationName} needs manual reactivation.
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-txt-muted">
          Access ended on {block.expiresAt}. Project dashboards, drawings, documents, and
          collaboration are paused until Planovera reactivates or extends this organization.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <a
            href="/organization"
            className="inline-flex items-center justify-center rounded-xl border border-border bg-bg-raised px-4 py-2 text-sm font-semibold text-txt transition hover:bg-bg-hover"
          >
            View organization status
          </a>
          {block.canManage ? (
            <a
              href="mailto:support@planovera.com?subject=Planovera subscription reactivation"
              className="inline-flex items-center justify-center rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-hover"
            >
              Contact Planovera
            </a>
          ) : (
            <span className="inline-flex items-center justify-center rounded-xl border border-warn/25 bg-warn/10 px-4 py-2 text-sm font-semibold text-warn">
              Ask your organization admin to renew access
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function Workspace({
  notice,
  collaborators = [],
}: {
  notice?: string | null;
  collaborators?: CollaboratorPresence[];
}) {
  const pathname = usePathname();
  const { project, activeModule } = useAppStore();
  const setActiveModule = useAppStore((state) => state.setActiveModule);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const hasProject = Boolean(project);
  const isConstruction = project?.type === "construction";
  const routeSafeModule = pathname === "/" && activeModule === "drawings" ? "dashboard" : activeModule;
  const module = hasProject ? routeSafeModule : routeSafeModule === "meetings" ? "meetings" : "dashboard";
  const activeLabel =
    module === "dashboard"
      ? hasProject
        ? "Project Overview"
        : "Portfolio Dashboard"
      : moduleLabels[module] || "Workspace";
  const visibleCollaborators = hasProject ? collaborators : [];
  const isDrawingWorkspace = module === "drawings";

  useEffect(() => {
    if (pathname === "/" && activeModule === "drawings") {
      setActiveModule("dashboard");
    }
  }, [activeModule, pathname, setActiveModule]);

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      <Sidebar forceCollapsed={isDrawingWorkspace} />
      <Sidebar
        isMobile
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-border bg-bg-surface px-3 py-3 lg:hidden">
          <button
            type="button"
            onClick={() => setMobileSidebarOpen(true)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-bg-raised text-txt transition hover:bg-bg-hover"
            aria-label="Open navigation"
          >
            <Menu size={18} />
          </button>
          <div className="min-w-0">
            <div className="truncate text-sm font-bold text-white">
              {project?.name || "Planovera"}
            </div>
            <div className="truncate text-[11px] uppercase tracking-[0.18em] text-txt-dim">
              {activeLabel}
            </div>
          </div>
        </header>

        <main className={`flex-1 overflow-auto bg-bg ${isDrawingWorkspace ? "p-2 lg:p-3" : "p-3 sm:p-4 lg:p-6"}`}>
          {hasProject && visibleCollaborators.length > 0 ? (
            <div className="mb-4 rounded-2xl border border-accent/25 bg-accent/10 px-4 py-3 text-sm text-txt">
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-accent">
                Collaboration
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {visibleCollaborators.map((collaborator) => (
                  <div
                    key={collaborator.id}
                    className="rounded-xl border border-border bg-bg-surface px-3 py-2"
                  >
                    <div className="text-sm font-semibold text-white">
                      {collaborator.isCurrentUser ? "You" : collaborator.name}
                    </div>
                    <div className="text-[11px] uppercase tracking-[0.14em] text-txt-dim">
                      {moduleLabels[collaborator.activeModule || ""] || "Workspace"} · Active
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {notice ? (
            <div className="mb-4 rounded-2xl border border-warn/30 bg-warn/10 px-4 py-3 text-sm text-warn">
              {notice}
            </div>
          ) : null}
          {module === "dashboard" && <Dashboard />}
          {module === "meetings" && !hasProject && <MeetingMinutesModule />}
          {module === "boq" && hasProject && isConstruction && <BOQModule />}
          {module === "items" && hasProject && !isConstruction && <SimpleItemsTable />}
          {module === "progress" && hasProject && <ProgressModule />}
          {module === "payment" && hasProject && <PaymentModule />}
          {module === "workplan" && hasProject && <WorkPlanModule />}
          {module === "drawings" && hasProject && <ConstructionDrawingsModule />}
          {module === "documents" && hasProject && <DocumentsModule />}
          {module === "correspondence" && hasProject && <CorrespondenceModule />}
          {module === "checklist" && hasProject && <ChecklistModule />}
          {module === "site-notes" && hasProject && <SiteNotesModule />}
        </main>
      </div>
    </div>
  );
}

export default function WorkspaceShell() {
  const router = useRouter();
  const authConfigured = isSupabaseConfigured();
  const lastSavedWorkspaceRef = useRef("");
  const lastNormalizedSyncRef = useRef("");
  const [hasHydrated, setHasHydrated] = useState(false);
  const [projectsReady, setProjectsReady] = useState(() => !authConfigured);
  const [workspaceNotice, setWorkspaceNotice] = useState<string | null>(null);
  const [subscriptionBlock, setSubscriptionBlock] = useState<SubscriptionBlockState | null>(null);
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [collaborators, setCollaborators] = useState<CollaboratorPresence[]>([]);
  const projects = useAppStore((state) => state.projects);
  const project = useAppStore((state) => state.project);
  const activeModule = useAppStore((state) => state.activeModule);
  const setActiveModule = useAppStore((state) => state.setActiveModule);
  const setPrograms = useAppStore((state) => state.setPrograms);
  const setCategories = useAppStore((state) => state.setCategories);
  const setProjects = useAppStore((state) => state.setProjects);
  const setBOQLibrary = useAppStore((state) => state.setBOQLibrary);
  const hydrateWorkspaceSnapshot = useAppStore((state) => state.hydrateWorkspaceSnapshot);
  const clearWorkspaceData = useAppStore((state) => state.clearWorkspaceData);
  const loadDemoWorkspace = useAppStore((state) => state.loadDemoWorkspace);
  const workspacePayload = useAppStore((state) => ({
    savedBOQs: state.savedBOQs,
    activeBOQId: state.activeBOQId,
    boqSheets: state.boqSheets,
    activeSheetIndex: state.activeSheetIndex,
    savedWorkPlans: state.savedWorkPlans,
    activeWorkPlanId: state.activeWorkPlanId,
    workPlanSheets: state.workPlanSheets,
    activeWorkPlanSheetIndex: state.activeWorkPlanSheetIndex,
    savedSimpleItemSets: state.savedSimpleItemSets,
    activeSimpleItemsId: state.activeSimpleItemsId,
    simpleItems: state.simpleItems,
    certificates: state.certificates,
    progressReports: state.progressReports,
    generatedDocuments: state.generatedDocuments,
    userSignatureProfile: state.userSignatureProfile,
    correspondenceRecords: state.correspondenceRecords,
    checklistItems: state.checklistItems,
    siteNotes: state.siteNotes,
    attendeeGroups: state.attendeeGroups,
    meetingMinutes: state.meetingMinutes,
  }));

  useEffect(() => {
    setHasHydrated(true);

    const handleGlobalUndo = (event: KeyboardEvent) => {
      const isInputFocused =
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA";

      if (!isInputFocused) {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
          event.preventDefault();
          const temporal = useAppStore.temporal.getState();
          if (event.shiftKey) temporal.redo();
          else temporal.undo();
        } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
          event.preventDefault();
          useAppStore.temporal.getState().redo();
        }
      }
    };

    window.addEventListener("keydown", handleGlobalUndo);
    return () => window.removeEventListener("keydown", handleGlobalUndo);
  }, []);

  useEffect(() => {
    if (!hasHydrated) return;
    setActiveModule("dashboard");
  }, [hasHydrated, setActiveModule]);

  useEffect(() => {
    if (!hasHydrated) return;

    if (authConfigured) return;

    setActiveUserId(null);
    setCollaborators([]);
    setSubscriptionBlock(null);
    setPrograms([]);
    setCategories([]);
    setProjectsReady(true);
    setWorkspaceNotice(null);
    lastSavedWorkspaceRef.current = "";
    lastNormalizedSyncRef.current = "";

    if (projects.length === 0) {
      loadDemoWorkspace();
    }
  }, [authConfigured, hasHydrated, loadDemoWorkspace, projects.length]);

  useEffect(() => {
    if (!hasHydrated || !authConfigured) return;

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setActiveUserId(null);
      setCollaborators([]);
      setSubscriptionBlock(null);
      setPrograms([]);
      setCategories([]);
      setProjects([]);
      clearWorkspaceData();
      setProjectsReady(true);
      setWorkspaceNotice("Supabase environment variables are missing for the shared Planovera workspace.");
      return;
    }

    let active = true;

    const syncProjects = async (redirectIfLoggedOut = false) => {
      setProjectsReady(false);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (!active) return;

      if (userError || !user) {
        setActiveUserId(null);
        setCollaborators([]);
        setSubscriptionBlock(null);
        setPrograms([]);
        setCategories([]);
        setProjects([]);
        clearWorkspaceData();
        setProjectsReady(true);
        setWorkspaceNotice(null);
        lastSavedWorkspaceRef.current = "";
        lastNormalizedSyncRef.current = "";

        if (redirectIfLoggedOut || !user) {
          router.replace("/login");
          router.refresh();
        }
        return;
      }

      setActiveUserId(user.id);
      setSubscriptionBlock(null);
      await supabase.rpc("accept_organization_invites", {
        invite_token_param: null,
      });
      await supabase.rpc("expire_overdue_organization_subscriptions");

      const [
        { data: profileRow },
        { data: membershipRows, error: membershipError },
      ] = await Promise.all([
        supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
        supabase
          .from("organization_members")
          .select("id, organization_id, role, status, organizations(id,name,personal)")
          .eq("user_id", user.id)
          .eq("status", "active"),
      ]);

      const memberships = (membershipRows ?? []) as OrganizationMembershipRecord[];
      const organizationIds = memberships.map((membership) => membership.organization_id);
      const { data: subscriptionRows, error: accessSubscriptionError } =
        organizationIds.length > 0
          ? await supabase
              .from("organization_subscriptions")
              .select("*")
              .in("organization_id", organizationIds)
          : { data: [], error: null };
      const userIsAdmin = profileRow?.role === "admin";
      const subscriptions = (subscriptionRows ?? []) as OrganizationSubscriptionRecord[];
      const hasUsableSubscription = subscriptions.some((subscription) =>
        isSubscriptionUsable(subscription),
      );

      if (
        !userIsAdmin &&
        memberships.length > 0 &&
        !hasUsableSubscription &&
        !membershipError &&
        !accessSubscriptionError
      ) {
        const firstMembership = memberships[0];
        const firstOrganization = Array.isArray(firstMembership.organizations)
          ? firstMembership.organizations[0]
          : firstMembership.organizations;
        const firstSubscription = subscriptions[0] ?? null;
        setPrograms([]);
        setCategories([]);
        setProjects([]);
        clearWorkspaceData();
        setCollaborators([]);
        setSubscriptionBlock({
          organizationName: firstOrganization?.name || "Your organization",
          expiresAt: formatSubscriptionExpiry(firstSubscription),
          canManage: firstMembership.role === "owner" || firstMembership.role === "admin",
        });
        setWorkspaceNotice(null);
        setProjectsReady(true);
        return;
      }

      const [
        { data: projectRows, error: projectError },
        { data: programRows, error: programError },
        { data: categoryRows, error: categoryError },
        { data: snapshotRow, error: snapshotError },
        { data: libraryRows, error: libraryError },
        { data: boqRows, error: boqError },
        { data: workPlanRows, error: workPlanError },
        { data: simpleItemRows, error: simpleItemError },
        { data: certificateRows, error: certificateError },
        { data: progressRows, error: progressError },
        { data: generatedDocumentRows, error: generatedDocumentError },
        { data: correspondenceRows, error: correspondenceError },
        { data: attendeeGroupRows, error: attendeeGroupError },
        { data: meetingMinuteRows, error: meetingMinuteError },
      ] = await Promise.all([
        supabase
          .from("projects")
          .select("*")
          .order("updated_at", { ascending: false })
          .order("created_at", { ascending: false }),
        supabase
          .from("programs")
          .select("*")
          .order("updated_at", { ascending: false })
          .order("created_at", { ascending: false }),
        supabase
          .from("project_categories")
          .select("*")
          .order("updated_at", { ascending: false })
          .order("created_at", { ascending: false }),
        supabase
          .from("construction_workspace_snapshots")
          .select("*")
          .eq("owner_id", user.id)
          .maybeSingle(),
        supabase.from("boq_library_items").select("*").order("updated_at", { ascending: false }),
        supabase
          .from("project_boq_documents")
          .select("*")
          .order("updated_at", { ascending: false }),
        supabase
          .from("project_work_plans")
          .select("*")
          .order("updated_at", { ascending: false }),
        supabase
          .from("project_simple_item_sets")
          .select("*")
          .order("updated_at", { ascending: false }),
        supabase
          .from("project_payment_certificates")
          .select("*")
          .order("updated_at", { ascending: false }),
        supabase
          .from("project_progress_reports")
          .select("*")
          .order("updated_at", { ascending: false }),
        supabase
          .from("project_generated_documents")
          .select("*")
          .order("updated_at", { ascending: false }),
        supabase
          .from("project_correspondence_records")
          .select("*")
          .order("updated_at", { ascending: false }),
        supabase
          .from("workspace_attendee_groups")
          .select("*")
          .order("updated_at", { ascending: false }),
        supabase
          .from("workspace_meeting_minutes")
          .select("*")
          .order("updated_at", { ascending: false }),
      ]);

      if (!active) return;

      if (projectError) {
        setProjects([]);
        setWorkspaceNotice(`Could not load shared projects: ${projectError.message}`);
      } else {
        setProjects(((projectRows ?? []) as ProjectRecord[]).map(mapProjectRecord));
      }

      if (programError) {
        setPrograms([]);
        setWorkspaceNotice((current) =>
          current ?? `Could not load programs: ${programError.message}`,
        );
      } else {
        setPrograms(((programRows ?? []) as ProgramRecord[]).map(mapProgramRecord));
      }

      if (categoryError) {
        setCategories([]);
        setWorkspaceNotice((current) =>
          current ?? `Could not load project categories: ${categoryError.message}`,
        );
      } else {
        setCategories(((categoryRows ?? []) as ProjectCategoryRecord[]).map(mapProjectCategoryRecord));
      }

      if (snapshotError && snapshotError.code !== "PGRST116") {
        clearWorkspaceData();
        lastSavedWorkspaceRef.current = JSON.stringify(
          normalizeConstructionWorkspacePayload(null),
        );
        lastNormalizedSyncRef.current = "";
        setWorkspaceNotice((current) =>
          current ?? `Could not load project workspace data: ${snapshotError.message}`,
        );
      } else {
        const relationalPayload = buildRelationalWorkspacePayload({
          boqDocuments: (boqRows ?? []) as any,
          workPlans: (workPlanRows ?? []) as any,
          simpleItemSets: (simpleItemRows ?? []) as any,
          certificates: (certificateRows ?? []) as any,
          progressReports: (progressRows ?? []) as any,
          generatedDocuments: (generatedDocumentRows ?? []) as any,
          correspondenceRecords: (correspondenceRows ?? []) as any,
          attendeeGroups: (attendeeGroupRows ?? []) as any,
          meetingMinutes: (meetingMinuteRows ?? []) as any,
        });
        const normalizedSnapshot = normalizeConstructionWorkspacePayload(
          (snapshotRow as ConstructionWorkspaceRecord | null)?.payload,
        );
        const mergedWorkspace = mergeWorkspacePayloadSources(
          normalizedSnapshot,
          relationalPayload,
        );
        hydrateWorkspaceSnapshot(mergedWorkspace);
        lastSavedWorkspaceRef.current = JSON.stringify(mergedWorkspace);
        lastNormalizedSyncRef.current = "";
      }

      if (libraryError) {
        setWorkspaceNotice((current) =>
          current ?? `Could not load BOQ library templates: ${libraryError.message}`,
        );
      } else {
        setBOQLibrary(
          ((libraryRows ?? []) as BOQLibraryItemRecord[]).map(mapBOQLibraryItemRecord),
        );
        if (
          !projectError &&
          !programError &&
          !snapshotError &&
          !boqError &&
          !workPlanError &&
          !simpleItemError &&
          !certificateError &&
          !progressError &&
          !generatedDocumentError &&
          !correspondenceError &&
          !attendeeGroupError &&
          !meetingMinuteError
        ) {
          setWorkspaceNotice(null);
        }
      }

      const relationalErrors = [
        boqError,
        workPlanError,
        simpleItemError,
        certificateError,
        progressError,
        generatedDocumentError,
        correspondenceError,
        attendeeGroupError,
        meetingMinuteError,
      ].filter(Boolean);

      if (relationalErrors.length > 0) {
        setWorkspaceNotice((current) =>
          current ??
          `Could not load shared project records: ${relationalErrors[0]?.message || "Unknown error"}`,
        );
      }

      setProjectsReady(true);
    };

    void syncProjects();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;

      if (!session?.user) {
        setActiveUserId(null);
        setCollaborators([]);
        setSubscriptionBlock(null);
        setPrograms([]);
        setCategories([]);
        setProjects([]);
        clearWorkspaceData();
        router.replace("/login");
        router.refresh();
        return;
      }

      void syncProjects(true);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [
    authConfigured,
    clearWorkspaceData,
    hasHydrated,
    hydrateWorkspaceSnapshot,
    router,
    setBOQLibrary,
    setCategories,
    setPrograms,
    setProjects,
  ]);

  useEffect(() => {
    if (!authConfigured || !hasHydrated || !projectsReady || !activeUserId) return;

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const normalizedPayload = normalizeConstructionWorkspacePayload(workspacePayload);
    const serializedPayload = JSON.stringify(normalizedPayload);
    const normalizedSyncSignature = buildProjectSyncSignature(
      normalizedPayload,
      project?.id ?? null,
      activeModule,
    );

    if (
      serializedPayload === lastSavedWorkspaceRef.current &&
      normalizedSyncSignature === lastNormalizedSyncRef.current
    ) {
      return;
    }

    let active = true;
    const timer = window.setTimeout(async () => {
      if (serializedPayload !== lastSavedWorkspaceRef.current) {
        const { error } = await supabase.from("construction_workspace_snapshots").upsert({
          owner_id: activeUserId,
          payload: normalizedPayload,
        });

        if (!active) return;

        if (error) {
          setWorkspaceNotice(`Could not save workspace changes: ${error.message}`);
          return;
        }

        lastSavedWorkspaceRef.current = serializedPayload;
      }

      if (normalizedSyncSignature !== lastNormalizedSyncRef.current) {
        const response = await fetch("/api/workspace/sync", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            payload: normalizedPayload,
            activeProjectId: project?.id ?? null,
            activeModule,
          }),
        });

        if (!active) return;

        if (!response.ok) {
          const result = (await response.json().catch(() => null)) as
            | {
                error?: string;
              }
            | null;
          setWorkspaceNotice(
            `Could not synchronize project records: ${
              result?.error || "Unexpected server response."
            }`,
          );
          return;
        }

        lastNormalizedSyncRef.current = normalizedSyncSignature;
      }

      setWorkspaceNotice((current) =>
        current?.startsWith("Could not save workspace changes") ||
        current?.startsWith("Could not synchronize project records")
          ? null
          : current,
      );
    }, 900);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [
    activeModule,
    activeUserId,
    authConfigured,
    hasHydrated,
    project?.id,
    projectsReady,
    workspacePayload,
  ]);

  useEffect(() => {
    if (!authConfigured || !hasHydrated || !projectsReady || !activeUserId || !project?.id) {
      setCollaborators([]);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setCollaborators([]);
      return;
    }

    let active = true;

    const heartbeat = async () => {
      const { error } = await supabase.from("project_presence").upsert({
        project_id: project.id,
        user_id: activeUserId,
        active_module: activeModule,
        cursor_state: {},
        last_seen_at: new Date().toISOString(),
      });

      if (!active || !error) return;

      setWorkspaceNotice((current) =>
        current ?? `Could not update collaboration presence: ${error.message}`,
      );
    };

    const loadCollaborators = async () => {
      const threshold = new Date(Date.now() - 45000).toISOString();
      const { data, error } = await supabase
        .from("project_presence")
        .select("user_id, active_module, last_seen_at, profiles(full_name,email)")
        .eq("project_id", project.id)
        .gte("last_seen_at", threshold)
        .order("last_seen_at", { ascending: false });

      if (!active) return;

      if (error) {
        setWorkspaceNotice((current) =>
          current ?? `Could not load collaborator presence: ${error.message}`,
        );
        return;
      }

      const mappedCollaborators = ((data ?? []) as ProjectPresenceRecord[]).map((entry) => {
        const profile = Array.isArray(entry.profiles) ? entry.profiles[0] : entry.profiles;
        const name =
          profile?.full_name?.trim() ||
          profile?.email?.split("@")[0] ||
          "Collaborator";

        return {
          id: entry.user_id,
          name,
          email: profile?.email || "",
          activeModule: entry.active_module ?? null,
          lastSeenAt: entry.last_seen_at,
          isCurrentUser: entry.user_id === activeUserId,
        } satisfies CollaboratorPresence;
      });

      setCollaborators(mappedCollaborators);
      setWorkspaceNotice((current) =>
        current?.startsWith("Could not update collaboration presence") ||
        current?.startsWith("Could not load collaborator presence")
          ? null
          : current,
      );
    };

    void heartbeat();
    void loadCollaborators();

    const timer = window.setInterval(() => {
      void heartbeat();
      void loadCollaborators();
    }, 12000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [activeModule, activeUserId, authConfigured, hasHydrated, project?.id, projectsReady]);

  if (!hasHydrated) return null;
  if (!projectsReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg px-6">
        <div className="w-full max-w-lg rounded-[28px] border border-border bg-bg-surface p-8 text-center shadow-[0_24px_80px_rgba(0,0,0,0.32)]">
          <div className="text-[11px] font-black uppercase tracking-[0.24em] text-accent">
            Planovera Sync
          </div>
          <h1 className="mt-3 text-2xl font-semibold text-white">
            Loading your shared workspace
          </h1>
          <p className="mt-3 text-sm leading-6 text-txt-muted">
            Pulling construction projects from Supabase so the controls modules and
            drawing workspace stay attached to the same account.
          </p>
        </div>
      </div>
    );
  }

  if (subscriptionBlock) {
    return <SubscriptionExpiredScreen block={subscriptionBlock} />;
  }

  return <Workspace notice={workspaceNotice} collaborators={collaborators} />;
}
