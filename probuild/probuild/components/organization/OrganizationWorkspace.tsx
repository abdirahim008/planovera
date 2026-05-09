"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BarChart3,
  Building2,
  Copy,
  CreditCard,
  DollarSign,
  FolderKanban,
  Link2,
  MailPlus,
  Pencil,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  TrendingUp,
  Users,
  X,
} from "lucide-react";

import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase-browser";
import type {
  BillingPlanRecord,
  PaymentCertificate,
  ProjectCategoryRecord,
  ProgramRecord,
  ProgressReport,
  ProjectRecord,
  SavedBOQ,
  OrganizationInviteRecord,
  OrganizationMembershipRecord,
  OrganizationRecord,
  OrganizationSubscriptionRecord,
} from "@/lib/supabase";
import { DEFAULT_PROJECT_CATEGORIES } from "@/lib/projectCategories";
import {
  formatSubscriptionExpiry,
  getSubscriptionAccessState,
  isSubscriptionUsable,
  subscriptionBadgeColor,
  subscriptionStateLabel,
} from "@/lib/subscriptions";

type MemberDirectoryEntry = OrganizationMembershipRecord & {
  profiles?:
    | {
        id: string;
        email?: string | null;
        full_name?: string | null;
      }
    | null;
};

type ProjectMembershipEntry = {
  id: string;
  project_id: string;
  organization_id?: string | null;
  user_id: string;
  role: "owner" | "admin" | "editor" | "commenter" | "viewer";
};

type ProjectPayloadRecord<TPayload> = {
  id: string;
  project_id: string;
  organization_id?: string | null;
  name: string;
  payload: TPayload;
  created_at: string;
  updated_at: string;
};

type PortfolioFilters = {
  programId: string;
  categoryId: string;
  location: string;
  client: string;
};

type CategoryEditorState = {
  id: string | null;
  name: string;
  code: string;
  description: string;
  color: string;
  status: ProjectCategoryRecord["status"];
};

const defaultCategoryEditor = (): CategoryEditorState => ({
  id: null,
  name: "",
  code: "",
  description: "",
  color: "#3b82f6",
  status: "active",
});

type ProgramEditorState = {
  id: string | null;
  name: string;
  code: string;
  description: string;
  clientName: string;
  location: string;
  currency: string;
  budgetAmount: string;
  startDate: string;
  endDate: string;
  status: ProgramRecord["status"];
};

const defaultProgramEditor = (): ProgramEditorState => ({
  id: null,
  name: "",
  code: "",
  description: "",
  clientName: "",
  location: "",
  currency: "USD",
  budgetAmount: "",
  startDate: "",
  endDate: "",
  status: "active",
});

const getOne = <T,>(value: T | T[] | null | undefined): T | null =>
  Array.isArray(value) ? value[0] ?? null : value ?? null;

const canManageRole = (role: OrganizationMembershipRecord["role"]) =>
  role === "owner" || role === "admin";

const formatMoney = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);

const parseAmount = (value?: string | number | null) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (!value) return 0;
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatCurrency = (value: number, currency = "USD") =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);

const formatDate = (value?: string | null) => {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return date.toLocaleDateString();
};

const normalizeFilterValue = (value?: string | null) => (value || "").trim().toLowerCase();

const uniqueFilterValues = (values: Array<string | undefined | null>) =>
  Array.from(new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])).sort((a, b) =>
    a.localeCompare(b),
  );

const programLabel = (programs: ProgramRecord[], programId?: string | null) =>
  programs.find((program) => program.id === programId)?.name || "Unassigned";

const categoryLabel = (categories: ProjectCategoryRecord[], categoryId?: string | null, fallback?: string | null) =>
  categories.find((category) => category.id === categoryId)?.name || fallback || "Uncategorized";

const roleBadgeColor = (role: OrganizationMembershipRecord["role"]) => {
  if (role === "owner" || role === "admin") return "accent";
  if (role === "manager") return "ok";
  if (role === "viewer") return "warn";
  return "purple";
};

const progressMetrics = (report?: ProgressReport | null) => {
  const items = report?.sheets.flatMap((sheet) => sheet.items) ?? [];
  const planned = items.reduce(
    (sum, item) => sum + (parseAmount(item.weightPercent) * parseAmount(item.plannedPercent)) / 100,
    0,
  );
  const actual = items.reduce(
    (sum, item) => sum + (parseAmount(item.weightPercent) * parseAmount(item.actualPercent)) / 100,
    0,
  );
  const earned = items.reduce((sum, item) => sum + parseAmount(item.earnedAmount), 0);
  return { planned, actual, variance: actual - planned, earned };
};

const boqTotal = (boq?: SavedBOQ | null) =>
  boq?.sheets.reduce(
    (sheetSum, sheet) =>
      sheetSum +
      sheet.rows.reduce(
        (rowSum, row) => rowSum + (row.type === "item" ? parseAmount(row.amount) : 0),
        0,
      ),
    0,
  ) ?? 0;

const certificateTotal = (certificate?: PaymentCertificate | null) =>
  certificate?.sheets.reduce(
    (sheetSum, sheet) =>
      sheetSum +
      sheet.items.reduce(
        (itemSum, item) =>
          itemSum + parseAmount(item.totalAmount || item.currentAmount || item.previousAmount),
        0,
      ),
    0,
  ) ?? 0;

const newestByProject = <TPayload,>(records: ProjectPayloadRecord<TPayload>[]) => {
  const grouped = new Map<string, ProjectPayloadRecord<TPayload>>();
  records.forEach((record) => {
    const current = grouped.get(record.project_id);
    if (!current || new Date(record.updated_at).getTime() > new Date(current.updated_at).getTime()) {
      grouped.set(record.project_id, record);
    }
  });
  return grouped;
};

export default function OrganizationWorkspace({ joined = false }: { joined?: boolean }) {
  const configured = isSupabaseConfigured();
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(
    joined ? "The organization invite was accepted successfully." : null,
  );
  const [memberships, setMemberships] = useState<OrganizationMembershipRecord[]>([]);
  const [members, setMembers] = useState<MemberDirectoryEntry[]>([]);
  const [plans, setPlans] = useState<BillingPlanRecord[]>([]);
  const [subscriptions, setSubscriptions] = useState<OrganizationSubscriptionRecord[]>([]);
  const [invites, setInvites] = useState<OrganizationInviteRecord[]>([]);
  const [programs, setPrograms] = useState<ProgramRecord[]>([]);
  const [categories, setCategories] = useState<ProjectCategoryRecord[]>([]);
  const [organizationProjects, setOrganizationProjects] = useState<ProjectRecord[]>([]);
  const [projectMembers, setProjectMembers] = useState<ProjectMembershipEntry[]>([]);
  const [boqRecords, setBoqRecords] = useState<ProjectPayloadRecord<SavedBOQ>[]>([]);
  const [progressRecords, setProgressRecords] = useState<ProjectPayloadRecord<ProgressReport>[]>([]);
  const [certificateRecords, setCertificateRecords] =
    useState<ProjectPayloadRecord<PaymentCertificate>[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [createOrgOpen, setCreateOrgOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [programOpen, setProgramOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [programEditor, setProgramEditor] = useState<ProgramEditorState>(defaultProgramEditor);
  const [categoryEditor, setCategoryEditor] = useState<CategoryEditorState>(defaultCategoryEditor);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] =
    useState<OrganizationInviteRecord["role"]>("member");
  const [inviteMode, setInviteMode] =
    useState<OrganizationInviteRecord["delivery_method"]>("email");
  const [seatCount, setSeatCount] = useState("5");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [freshInviteLink, setFreshInviteLink] = useState<string | null>(null);
  const [portfolioFilters, setPortfolioFilters] = useState<PortfolioFilters>({
    programId: "",
    categoryId: "",
    location: "",
    client: "",
  });

  const normalizedMemberships = memberships.map((membership) => ({
    ...membership,
    organizations: getOne(membership.organizations),
  }));
  const manageableMemberships = normalizedMemberships.filter((membership) =>
    canManageRole(membership.role),
  );
  const visibleOrganizations = manageableMemberships.length > 0 ? manageableMemberships : normalizedMemberships;
  const selectedMembership =
    visibleOrganizations.find((membership) => membership.organization_id === selectedOrgId) ??
    visibleOrganizations[0] ??
    null;
  const selectedOrganization = getOne(selectedMembership?.organizations as OrganizationRecord | null);
  const selectedSubscription =
    subscriptions.find((subscription) => subscription.organization_id === selectedOrganization?.id) ??
    null;
  const selectedMembers = members.filter(
    (membership) => membership.organization_id === selectedOrganization?.id,
  );
  const selectedInvites = invites.filter(
    (invite) => invite.organization_id === selectedOrganization?.id && invite.status === "pending",
  );
  const selectedProjects = organizationProjects.filter(
    (project) => project.organization_id === selectedOrganization?.id,
  );
  const selectedPrograms = programs.filter(
    (program) => program.organization_id === selectedOrganization?.id,
  );
  const selectedCategories = categories.filter(
    (category) => category.organization_id === selectedOrganization?.id,
  );
  const canManageSelectedOrganization = canManageRole(selectedMembership?.role || "viewer");
  const programUsageCounts = useMemo(() => {
    const counts = new Map<string, number>();
    selectedProjects.forEach((project) => {
      if (project.program_id) counts.set(project.program_id, (counts.get(project.program_id) ?? 0) + 1);
    });
    return counts;
  }, [selectedProjects]);
  const categoryUsageCounts = useMemo(() => {
    const counts = new Map<string, number>();
    selectedProjects.forEach((project) => {
      if (project.category_id) counts.set(project.category_id, (counts.get(project.category_id) ?? 0) + 1);
    });
    return counts;
  }, [selectedProjects]);
  const filteredProjects = useMemo(
    () =>
      selectedProjects.filter((project) => {
        const matchesProgram =
          !portfolioFilters.programId ||
          (portfolioFilters.programId === "__unassigned__"
            ? !project.program_id
            : project.program_id === portfolioFilters.programId);
        const matchesCategory =
          !portfolioFilters.categoryId ||
          (portfolioFilters.categoryId === "__uncategorized__"
            ? !project.category_id && !project.category_name
            : project.category_id === portfolioFilters.categoryId);
        const matchesLocation =
          !portfolioFilters.location ||
          normalizeFilterValue(project.location) === normalizeFilterValue(portfolioFilters.location);
        const matchesClient =
          !portfolioFilters.client ||
          normalizeFilterValue(project.client_name) === normalizeFilterValue(portfolioFilters.client);

        return matchesProgram && matchesCategory && matchesLocation && matchesClient;
      }),
    [portfolioFilters, selectedProjects],
  );
  const selectedProjectIds = selectedProjects.map((project) => project.id);
  const selectedProjectMembers = projectMembers.filter(
    (membership) =>
      membership.organization_id === selectedOrganization?.id ||
      selectedProjectIds.includes(membership.project_id),
  );
  const activeMembers = selectedMembers.filter((membership) => membership.status === "active");
  const reservedSeats = selectedInvites.filter((invite) => invite.seat_reserved).length;
  const totalSeats = selectedSubscription?.seat_count ?? 1;
  const seatsUsed = activeMembers.length + reservedSeats;
  const seatsAvailable = Math.max(totalSeats - seatsUsed, 0);
  const currentPlanCode = selectedSubscription?.plan_code ?? null;
  const selectedAccessState = getSubscriptionAccessState(selectedSubscription);
  const selectedSubscriptionUsable = isSubscriptionUsable(selectedSubscription);
  const selectedLocations = uniqueFilterValues(selectedProjects.map((project) => project.location));
  const selectedClients = uniqueFilterValues(selectedProjects.map((project) => project.client_name));
  const hasUnassignedProjects = selectedProjects.some((project) => !project.program_id);
  const hasUncategorizedProjects = selectedProjects.some((project) => !project.category_id && !project.category_name);
  const activeFilterCount = [
    portfolioFilters.programId,
    portfolioFilters.categoryId,
    portfolioFilters.location,
    portfolioFilters.client,
  ].filter(Boolean).length;

  const portfolio = useMemo(() => {
    const latestProgressByProject = newestByProject(progressRecords);
    const latestBoqByProject = newestByProject(boqRecords);
    const latestCertificateByProject = newestByProject(certificateRecords);
    const projectCards = filteredProjects.map((project) => {
      const latestProgress = latestProgressByProject.get(project.id)?.payload ?? null;
      const latestBoq = latestBoqByProject.get(project.id)?.payload ?? null;
      const latestCertificate = latestCertificateByProject.get(project.id)?.payload ?? null;
      const progress = progressMetrics(latestProgress);
      const contractValue = parseAmount(project.contract_amount);
      const boqValue = boqTotal(latestBoq);
      const commercialValue = contractValue || boqValue || progress.earned || 0;
      const certifiedValue = certificateTotal(latestCertificate);
      const updatedAt =
        latestProgressByProject.get(project.id)?.updated_at ||
        latestCertificateByProject.get(project.id)?.updated_at ||
        latestBoqByProject.get(project.id)?.updated_at ||
        project.updated_at ||
        project.created_at;

      return {
        project,
        progress,
        contractValue,
        boqValue,
        commercialValue,
        certifiedValue,
        updatedAt,
      };
    });

    const portfolioValue = projectCards.reduce(
      (sum, item) => sum + Math.max(item.commercialValue, 0),
      0,
    );
    const fallbackWeight = projectCards.length > 0 ? 1 : 0;
    const weightedTotal = portfolioValue || projectCards.length * fallbackWeight;
    const planned =
      weightedTotal > 0
        ? projectCards.reduce(
            (sum, item) =>
              sum +
              item.progress.planned *
                ((portfolioValue ? item.commercialValue : fallbackWeight) / weightedTotal),
            0,
          )
        : 0;
    const actual =
      weightedTotal > 0
        ? projectCards.reduce(
            (sum, item) =>
              sum +
              item.progress.actual *
                ((portfolioValue ? item.commercialValue : fallbackWeight) / weightedTotal),
            0,
          )
        : 0;
    const earned = projectCards.reduce((sum, item) => sum + item.progress.earned, 0);
    const certified = projectCards.reduce((sum, item) => sum + item.certifiedValue, 0);
    const delayedProjects = projectCards.filter((item) => item.progress.variance < -5).length;

    return {
      projectCards,
      portfolioValue,
      planned,
      actual,
      variance: actual - planned,
      earned,
      certified,
      delayedProjects,
    };
  }, [boqRecords, certificateRecords, filteredProjects, progressRecords]);

  const memberUsage = useMemo(() => {
    const createdCounts = new Map<string, number>();
    filteredProjects.forEach((project) => {
      if (project.owner_id) {
        createdCounts.set(project.owner_id, (createdCounts.get(project.owner_id) ?? 0) + 1);
      }
    });

    const assignedCounts = new Map<string, number>();
    selectedProjectMembers.forEach((membership) => {
      assignedCounts.set(membership.user_id, (assignedCounts.get(membership.user_id) ?? 0) + 1);
    });

    return {
      createdCounts,
      assignedCounts,
      activeContributors: Array.from(assignedCounts.values()).filter((count) => count > 0).length,
    };
  }, [filteredProjects, selectedProjectMembers]);

  useEffect(() => {
    if (selectedSubscription) {
      setSeatCount(String(selectedSubscription.seat_count));
    }
  }, [selectedSubscription?.id, selectedSubscription?.seat_count]);

  useEffect(() => {
    if (!configured) {
      setLoading(false);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setLoading(false);
      setNotice("Supabase environment variables are missing.");
      return;
    }

    let active = true;

    const loadData = async () => {
      setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!active) return;

      if (!user) {
        setNotice("Sign in again to manage organizations.");
        setLoading(false);
        return;
      }

      await supabase.rpc("expire_overdue_organization_subscriptions");

      const { data: membershipRows, error: membershipError } = await supabase
        .from("organization_members")
        .select("id, organization_id, user_id, role, status, joined_at, updated_at, organizations(*)")
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("joined_at", { ascending: true });

      if (!active) return;

      if (membershipError) {
        setNotice(membershipError.message);
        setLoading(false);
        return;
      }

      const nextMemberships = (membershipRows ?? []) as OrganizationMembershipRecord[];
      const manageableOrgIds = nextMemberships
        .filter((membership) => canManageRole(membership.role))
        .map((membership) => membership.organization_id);
      const allOrgIds = nextMemberships.map((membership) => membership.organization_id);

      const [
        { data: planRows, error: planError },
        { data: subscriptionRows, error: subscriptionError },
        { data: memberRows, error: membersError },
        { data: inviteRows, error: invitesError },
        { data: programRows, error: programsError },
        { data: categoryRows, error: categoriesError },
        { data: projectRows, error: projectsError },
      ] = await Promise.all([
        supabase.from("billing_plans").select("*").eq("active", true).order("base_price_cents"),
        allOrgIds.length > 0
          ? supabase.from("organization_subscriptions").select("*").in("organization_id", allOrgIds)
          : Promise.resolve({ data: [], error: null }),
        allOrgIds.length > 0
          ? supabase
              .from("organization_members")
              .select("id, organization_id, user_id, role, status, joined_at, updated_at, profiles(id,email,full_name)")
              .in("organization_id", allOrgIds)
              .order("joined_at", { ascending: true })
          : Promise.resolve({ data: [], error: null }),
        manageableOrgIds.length > 0
          ? supabase
              .from("organization_invites")
              .select("*")
              .in("organization_id", manageableOrgIds)
              .order("created_at", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        allOrgIds.length > 0
          ? supabase
              .from("programs")
              .select("*")
              .in("organization_id", allOrgIds)
              .order("updated_at", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        allOrgIds.length > 0
          ? supabase
              .from("project_categories")
              .select("*")
              .in("organization_id", allOrgIds)
              .order("updated_at", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        allOrgIds.length > 0
          ? supabase
              .from("projects")
              .select(
                "id, owner_id, organization_id, program_id, category_id, category_name, name, type, role, code, client_name, location, contract_title, contract_amount, currency, start_date, end_date, created_at, updated_at",
              )
              .in("organization_id", allOrgIds)
              .order("updated_at", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (!active) return;

      const nextProjects = (projectRows ?? []) as ProjectRecord[];
      const projectIds = nextProjects.map((project) => project.id);
      const [
        { data: projectMemberRows, error: projectMembersError },
        { data: boqRows, error: boqError },
        { data: progressRows, error: progressError },
        { data: certificateRows, error: certificateError },
      ] = await Promise.all([
        projectIds.length > 0
          ? supabase
              .from("project_members")
              .select("id, project_id, organization_id, user_id, role")
              .in("project_id", projectIds)
          : Promise.resolve({ data: [], error: null }),
        projectIds.length > 0
          ? supabase
              .from("project_boq_documents")
              .select("id, project_id, organization_id, name, payload, created_at, updated_at")
              .in("project_id", projectIds)
              .order("updated_at", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        projectIds.length > 0
          ? supabase
              .from("project_progress_reports")
              .select("id, project_id, organization_id, name, payload, created_at, updated_at")
              .in("project_id", projectIds)
              .order("updated_at", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        projectIds.length > 0
          ? supabase
              .from("project_payment_certificates")
              .select("id, project_id, organization_id, name, payload, created_at, updated_at")
              .in("project_id", projectIds)
              .order("updated_at", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (!active) return;

      setMemberships(nextMemberships);
      setPlans((planRows ?? []) as BillingPlanRecord[]);
      setSubscriptions((subscriptionRows ?? []) as OrganizationSubscriptionRecord[]);
      setMembers((memberRows ?? []) as MemberDirectoryEntry[]);
      setInvites((inviteRows ?? []) as OrganizationInviteRecord[]);
      setPrograms((programRows ?? []) as ProgramRecord[]);
      setCategories((categoryRows ?? []) as ProjectCategoryRecord[]);
      setOrganizationProjects(nextProjects);
      setProjectMembers((projectMemberRows ?? []) as ProjectMembershipEntry[]);
      setBoqRecords((boqRows ?? []) as ProjectPayloadRecord<SavedBOQ>[]);
      setProgressRecords((progressRows ?? []) as ProjectPayloadRecord<ProgressReport>[]);
      setCertificateRecords((certificateRows ?? []) as ProjectPayloadRecord<PaymentCertificate>[]);

      if (!selectedOrgId || !allOrgIds.includes(selectedOrgId)) {
        setSelectedOrgId(manageableOrgIds[0] ?? allOrgIds[0] ?? null);
      }

      const firstError =
        membershipError ||
        planError ||
        subscriptionError ||
        membersError ||
        invitesError ||
        programsError ||
        categoriesError ||
        projectsError ||
        projectMembersError ||
        boqError ||
        progressError ||
        certificateError;
      setNotice((current) => current ?? firstError?.message ?? null);
      setLoading(false);
    };

    void loadData();

    return () => {
      active = false;
    };
  }, [configured, selectedOrgId]);

  const reloadData = async () => {
    setSelectedOrgId((current) => current);
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    await supabase.rpc("expire_overdue_organization_subscriptions");
    const { data: membershipRows } = await supabase
      .from("organization_members")
      .select("id, organization_id, user_id, role, status, joined_at, updated_at, organizations(*)")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("joined_at", { ascending: true });
    const nextMemberships = (membershipRows ?? []) as OrganizationMembershipRecord[];
    const manageableOrgIds = nextMemberships
      .filter((membership) => canManageRole(membership.role))
      .map((membership) => membership.organization_id);
    const allOrgIds = nextMemberships.map((membership) => membership.organization_id);
    const [
      { data: subscriptionRows },
      { data: memberRows },
      { data: inviteRows },
      { data: programRows },
      { data: categoryRows },
      { data: projectRows },
    ] = await Promise.all([
        allOrgIds.length > 0
          ? supabase.from("organization_subscriptions").select("*").in("organization_id", allOrgIds)
          : Promise.resolve({ data: [] }),
        allOrgIds.length > 0
          ? supabase
              .from("organization_members")
              .select("id, organization_id, user_id, role, status, joined_at, updated_at, profiles(id,email,full_name)")
              .in("organization_id", allOrgIds)
              .order("joined_at", { ascending: true })
          : Promise.resolve({ data: [] }),
        manageableOrgIds.length > 0
          ? supabase
              .from("organization_invites")
              .select("*")
              .in("organization_id", manageableOrgIds)
              .order("created_at", { ascending: false })
          : Promise.resolve({ data: [] }),
        allOrgIds.length > 0
          ? supabase
              .from("programs")
              .select("*")
              .in("organization_id", allOrgIds)
              .order("updated_at", { ascending: false })
          : Promise.resolve({ data: [] }),
        allOrgIds.length > 0
          ? supabase
              .from("project_categories")
              .select("*")
              .in("organization_id", allOrgIds)
              .order("updated_at", { ascending: false })
          : Promise.resolve({ data: [] }),
        allOrgIds.length > 0
          ? supabase
              .from("projects")
              .select(
                "id, owner_id, organization_id, program_id, category_id, category_name, name, type, role, code, client_name, location, contract_title, contract_amount, currency, start_date, end_date, created_at, updated_at",
              )
              .in("organization_id", allOrgIds)
              .order("updated_at", { ascending: false })
          : Promise.resolve({ data: [] }),
      ]);

    const nextProjects = (projectRows ?? []) as ProjectRecord[];
    const projectIds = nextProjects.map((project) => project.id);
    const [{ data: projectMemberRows }, { data: boqRows }, { data: progressRows }, { data: certificateRows }] =
      await Promise.all([
        projectIds.length > 0
          ? supabase
              .from("project_members")
              .select("id, project_id, organization_id, user_id, role")
              .in("project_id", projectIds)
          : Promise.resolve({ data: [] }),
        projectIds.length > 0
          ? supabase
              .from("project_boq_documents")
              .select("id, project_id, organization_id, name, payload, created_at, updated_at")
              .in("project_id", projectIds)
              .order("updated_at", { ascending: false })
          : Promise.resolve({ data: [] }),
        projectIds.length > 0
          ? supabase
              .from("project_progress_reports")
              .select("id, project_id, organization_id, name, payload, created_at, updated_at")
              .in("project_id", projectIds)
              .order("updated_at", { ascending: false })
          : Promise.resolve({ data: [] }),
        projectIds.length > 0
          ? supabase
              .from("project_payment_certificates")
              .select("id, project_id, organization_id, name, payload, created_at, updated_at")
              .in("project_id", projectIds)
              .order("updated_at", { ascending: false })
          : Promise.resolve({ data: [] }),
      ]);

    setMemberships(nextMemberships);
    setSubscriptions((subscriptionRows ?? []) as OrganizationSubscriptionRecord[]);
    setMembers((memberRows ?? []) as MemberDirectoryEntry[]);
    setInvites((inviteRows ?? []) as OrganizationInviteRecord[]);
    setPrograms((programRows ?? []) as ProgramRecord[]);
    setCategories((categoryRows ?? []) as ProjectCategoryRecord[]);
    setOrganizationProjects(nextProjects);
    setProjectMembers((projectMemberRows ?? []) as ProjectMembershipEntry[]);
    setBoqRecords((boqRows ?? []) as ProjectPayloadRecord<SavedBOQ>[]);
    setProgressRecords((progressRows ?? []) as ProjectPayloadRecord<ProgressReport>[]);
    setCertificateRecords((certificateRows ?? []) as ProjectPayloadRecord<PaymentCertificate>[]);
    setLoading(false);
  };

  const handleCreateOrganization = async () => {
    if (!orgName.trim()) {
      setNotice("Enter an organization name first.");
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setNotice("Supabase environment variables are missing.");
      return;
    }

    setBusyAction("create-organization");
    setNotice(null);
    const { data, error } = await supabase.rpc("create_organization_workspace", {
      org_name: orgName.trim(),
    });

    if (error) {
      setBusyAction(null);
      setNotice(error.message);
      return;
    }

    const createdOrg = Array.isArray(data) ? data[0] : data;
    setCreateOrgOpen(false);
    setOrgName("");
    setSelectedOrgId(createdOrg?.id ?? null);
    setBusyAction(null);
    setNotice("Organization workspace created. Configure billing and start inviting teammates.");
    await reloadData();
  };

  const handlePlanChange = async (plan: BillingPlanRecord) => {
    if (!selectedOrganization) return;

    const requestedSeats = Number(seatCount);
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setNotice("Supabase environment variables are missing.");
      return;
    }

    setBusyAction(`plan:${plan.code}`);
    setNotice(null);
    const { error } = await supabase.rpc("configure_organization_subscription", {
      org_uuid: selectedOrganization.id,
      plan_code_param: plan.code,
      seat_count_param: Number.isFinite(requestedSeats) ? requestedSeats : null,
    });

    if (error) {
      setBusyAction(null);
      setNotice(error.message);
      return;
    }

    setBusyAction(null);
    setNotice(
      "Billing configuration updated. Platform admins can manually activate or extend access from Billing Ops.",
    );
    await reloadData();
  };

  const handleInvite = async () => {
    if (!selectedOrganization) return;
    if (!selectedSubscriptionUsable) {
      setNotice("This organization subscription has expired. Reactivate it before reserving new seats.");
      return;
    }
    if (!inviteEmail.trim()) {
      setNotice("Enter an email address to reserve a seat.");
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setNotice("Supabase environment variables are missing.");
      return;
    }

    setBusyAction("create-invite");
    setNotice(null);
    const { data, error } = await supabase.rpc("create_organization_invite", {
      org_uuid: selectedOrganization.id,
      invite_email: inviteEmail.trim(),
      invite_role: inviteRole,
      invite_name: inviteName.trim() || null,
      delivery_method_param: inviteMode,
    });

    if (error) {
      setBusyAction(null);
      setNotice(error.message);
      return;
    }

    const inviteRecord = (Array.isArray(data) ? data[0] : data) as OrganizationInviteRecord | null;
    const inviteLink =
      inviteRecord && typeof window !== "undefined"
        ? `${window.location.origin}/invite?token=${encodeURIComponent(
            inviteRecord.invite_token,
          )}&email=${encodeURIComponent(inviteRecord.email)}`
        : null;

    setInviteOpen(false);
    setInviteEmail("");
    setInviteName("");
    setInviteRole("member");
    setInviteMode("email");
    setBusyAction(null);
    setFreshInviteLink(inviteLink);
    setNotice(
      inviteMode === "email"
        ? "Invite created. The link is ready to copy now; wire your email provider next so this sends automatically."
        : "Seat reserved. Share the generated registration link or let the invited user sign in with the reserved email.",
    );
    await reloadData();
  };

  const handleCopyLink = async (invite: OrganizationInviteRecord) => {
    if (typeof window === "undefined") return;
    const link = `${window.location.origin}/invite?token=${encodeURIComponent(
      invite.invite_token,
    )}&email=${encodeURIComponent(invite.email)}`;
    await navigator.clipboard.writeText(link);
    setNotice(`Invite link copied for ${invite.email}.`);
  };

  const openCreateProgram = () => {
    setProgramEditor({
      ...defaultProgramEditor(),
      currency: selectedProjects[0]?.currency || "USD",
      clientName: selectedOrganization?.name || "",
    });
    setProgramOpen(true);
  };

  const openEditProgram = (program: ProgramRecord) => {
    setProgramEditor({
      id: program.id,
      name: program.name || "",
      code: program.code || "",
      description: program.description || "",
      clientName: program.client_name || "",
      location: program.location || "",
      currency: program.currency || "USD",
      budgetAmount: program.budget_amount || "",
      startDate: program.start_date || "",
      endDate: program.end_date || "",
      status: program.status || "active",
    });
    setProgramOpen(true);
  };

  const handleSaveProgram = async () => {
    if (!selectedOrganization || !canManageSelectedOrganization) {
      setNotice("Only organization owners and admins can manage official program names.");
      return;
    }
    if (!programEditor.name.trim()) {
      setNotice("Enter a program name first.");
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setNotice("Supabase environment variables are missing.");
      return;
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      setNotice("Sign in again before saving an organization program.");
      return;
    }

    setBusyAction("save-program");
    setNotice(null);
    const programPayload = {
      name: programEditor.name.trim(),
      code: programEditor.code.trim() || null,
      description: programEditor.description.trim() || null,
      client_name: programEditor.clientName.trim() || null,
      location: programEditor.location.trim() || null,
      currency: programEditor.currency.trim() || "USD",
      budget_amount: programEditor.budgetAmount.trim() || null,
      start_date: programEditor.startDate || null,
      end_date: programEditor.endDate || null,
      status: programEditor.status,
    };

    const { error } = programEditor.id
      ? await supabase.from("programs").update(programPayload).eq("id", programEditor.id)
      : await supabase.from("programs").insert({
          id: crypto.randomUUID(),
          organization_id: selectedOrganization.id,
          owner_id: user.id,
          created_at: new Date().toISOString(),
          ...programPayload,
        });

    if (error) {
      setBusyAction(null);
      setNotice(error.message);
      return;
    }

    setProgramOpen(false);
    setProgramEditor(defaultProgramEditor());
    setBusyAction(null);
    setNotice(programEditor.id ? "Program updated." : "Official organization program created.");
    await reloadData();
  };

  const handleProgramStatus = async (program: ProgramRecord, status: ProgramRecord["status"]) => {
    if (!canManageSelectedOrganization) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setBusyAction(`program-status:${program.id}`);
    setNotice(null);
    const { error } = await supabase.from("programs").update({ status }).eq("id", program.id);
    setBusyAction(null);
    if (error) {
      setNotice(error.message);
      return;
    }
    setNotice(status === "active" ? "Program activated." : "Program archived.");
    await reloadData();
  };

  const handleDeleteProgram = async (program: ProgramRecord) => {
    if (!canManageSelectedOrganization) return;
    const usageCount = programUsageCounts.get(program.id) ?? 0;
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        usageCount > 0
          ? `Delete this program and move ${usageCount} linked project${usageCount === 1 ? "" : "s"} to Unassigned?`
          : "Delete this organization program?",
      )
    ) {
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setBusyAction(`program-delete:${program.id}`);
    setNotice(null);
    const { error } = await supabase.from("programs").delete().eq("id", program.id);
    setBusyAction(null);
    if (error) {
      setNotice(error.message);
      return;
    }
    setNotice("Program deleted. Linked projects are now unassigned.");
    await reloadData();
  };

  const openCreateCategory = () => {
    setCategoryEditor(defaultCategoryEditor());
    setCategoryOpen(true);
  };

  const openEditCategory = (category: ProjectCategoryRecord) => {
    setCategoryEditor({
      id: category.id,
      name: category.name || "",
      code: category.code || "",
      description: category.description || "",
      color: category.color || "#3b82f6",
      status: category.status || "active",
    });
    setCategoryOpen(true);
  };

  const handleSaveCategory = async () => {
    if (!selectedOrganization || !canManageSelectedOrganization) {
      setNotice("Only organization owners and admins can manage official project categories.");
      return;
    }
    if (!categoryEditor.name.trim()) {
      setNotice("Enter a category name first.");
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      setNotice("Sign in again before saving an organization category.");
      return;
    }

    setBusyAction("save-category");
    setNotice(null);
    const categoryPayload = {
      name: categoryEditor.name.trim(),
      code: categoryEditor.code.trim() || null,
      description: categoryEditor.description.trim() || null,
      color: categoryEditor.color.trim() || "#3b82f6",
      status: categoryEditor.status,
    };
    const { error } = categoryEditor.id
      ? await supabase.from("project_categories").update(categoryPayload).eq("id", categoryEditor.id)
      : await supabase.from("project_categories").insert({
          id: crypto.randomUUID(),
          organization_id: selectedOrganization.id,
          owner_id: user.id,
          created_at: new Date().toISOString(),
          ...categoryPayload,
        });

    setBusyAction(null);
    if (error) {
      setNotice(error.message);
      return;
    }
    setCategoryOpen(false);
    setCategoryEditor(defaultCategoryEditor());
    setNotice(categoryEditor.id ? "Category updated." : "Official organization category created.");
    await reloadData();
  };

  const handleCategoryStatus = async (category: ProjectCategoryRecord, status: ProjectCategoryRecord["status"]) => {
    if (!canManageSelectedOrganization) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setBusyAction(`category-status:${category.id}`);
    setNotice(null);
    const { error } = await supabase.from("project_categories").update({ status }).eq("id", category.id);
    setBusyAction(null);
    if (error) {
      setNotice(error.message);
      return;
    }
    setNotice(status === "active" ? "Category activated." : "Category archived.");
    await reloadData();
  };

  const handleDeleteCategory = async (category: ProjectCategoryRecord) => {
    if (!canManageSelectedOrganization) return;
    const usageCount = categoryUsageCounts.get(category.id) ?? 0;
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        usageCount > 0
          ? `Delete this category and keep ${usageCount} linked project${usageCount === 1 ? "" : "s"} with only their saved category name?`
          : "Delete this organization category?",
      )
    ) {
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setBusyAction(`category-delete:${category.id}`);
    setNotice(null);
    const { error } = await supabase.from("project_categories").delete().eq("id", category.id);
    setBusyAction(null);
    if (error) {
      setNotice(error.message);
      return;
    }
    setNotice("Category deleted.");
    await reloadData();
  };

  const handleSeedDefaultCategories = async () => {
    if (!selectedOrganization || !canManageSelectedOrganization) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const existing = new Set(selectedCategories.map((category) => category.name.toLowerCase()));
    const missing = DEFAULT_PROJECT_CATEGORIES.filter((category) => !existing.has(category.name.toLowerCase()));
    if (missing.length === 0) {
      setNotice("All default categories already exist in this organization catalog.");
      return;
    }

    setBusyAction("seed-categories");
    setNotice(null);
    const { error } = await supabase.from("project_categories").insert(
      missing.map((category) => ({
        id: crypto.randomUUID(),
        organization_id: selectedOrganization.id,
        owner_id: user.id,
        name: category.name,
        code: category.code,
        description: category.description,
        color: category.color,
        status: "active",
        created_at: new Date().toISOString(),
      })),
    );
    setBusyAction(null);
    if (error) {
      setNotice(error.message);
      return;
    }
    setNotice(`${missing.length} default categories added to the organization catalog.`);
    await reloadData();
  };

  const handleRevokeInvite = async (inviteId: string) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setNotice("Supabase environment variables are missing.");
      return;
    }

    setBusyAction(`revoke:${inviteId}`);
    setNotice(null);
    const { error } = await supabase.from("organization_invites").delete().eq("id", inviteId);

    if (error) {
      setBusyAction(null);
      setNotice(error.message);
      return;
    }

    setBusyAction(null);
    setNotice("Invite revoked and the reserved seat was released.");
    await reloadData();
  };

  return (
    <div className="min-h-screen bg-bg px-6 py-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <a
              href="/"
              className="inline-flex items-center gap-2 text-sm font-semibold text-txt-muted transition hover:text-txt"
            >
              <ArrowLeft size={16} />
              Back to workspace
            </a>
            <div className="mt-4 inline-flex rounded-full border border-border bg-bg-surface px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-accent">
              Organization Console
            </div>
            <h1 className="mt-4 text-3xl font-semibold text-white">
              Billing, seats, and team access in one place
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-txt-muted">
              Individuals keep a personal workspace. Teams can switch to a seat-based
              organization plan, reserve seats for employees, and share invite links that
              feel straightforward for both admins and first-time users.
            </p>
          </div>

          <div className="flex gap-3">
            <Button variant="ghost" onClick={() => setCreateOrgOpen(true)}>
              <Building2 size={15} /> New organization
            </Button>
            {selectedOrganization && canManageRole(selectedMembership?.role || "viewer") ? (
              <Button
                variant="primary"
                onClick={() => setInviteOpen(true)}
                disabled={!selectedSubscriptionUsable}
              >
                <MailPlus size={15} /> Invite teammate
              </Button>
            ) : null}
          </div>
        </div>

        {notice ? (
          <div className="mt-6 rounded-2xl border border-accent/25 bg-accent/10 px-4 py-3 text-sm text-txt">
            {notice}
          </div>
        ) : null}

        {!configured ? (
          <div className="mt-8 rounded-3xl border border-warn/30 bg-warn/10 p-6 text-sm text-warn">
            Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` before opening the
            organization console.
          </div>
        ) : loading ? (
          <div className="mt-8 rounded-3xl border border-border bg-bg-surface p-8 text-sm text-txt-muted">
            Loading your organizations, plan settings, seats, and pending invites...
          </div>
        ) : (
          <div className="mt-8 grid gap-6 lg:grid-cols-[300px,minmax(0,1fr)]">
            <section className="space-y-4">
              <div className="rounded-3xl border border-border bg-bg-surface p-5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-txt-dim">
                  Your workspaces
                </div>
                <div className="mt-4 space-y-3">
                  {visibleOrganizations.map((membership) => {
                    const organization = getOne(membership.organizations as OrganizationRecord | null);
                    if (!organization) return null;
                    const activeSubscription = subscriptions.find(
                      (subscription) => subscription.organization_id === organization.id,
                    );

                    return (
                      <button
                        key={membership.id}
                        type="button"
                        onClick={() => setSelectedOrgId(organization.id)}
                        className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                          organization.id === selectedOrganization?.id
                            ? "border-accent/35 bg-accent/10"
                            : "border-border bg-bg-raised hover:bg-bg-hover"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-semibold text-white">{organization.name}</div>
                            <div className="mt-1 text-xs text-txt-muted">
                              {organization.personal ? "Personal workspace" : "Shared organization"}
                            </div>
                          </div>
                          <Badge color={roleBadgeColor(membership.role)}>
                            {membership.role.toUpperCase()}
                          </Badge>
                        </div>
                        <div className="mt-3 text-xs text-txt-dim">
                          {activeSubscription
                            ? `${activeSubscription.plan_code.replace(/-/g, " ")} · ${activeSubscription.seat_count} seats`
                            : "No active plan yet"}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-3xl border border-border bg-bg-surface p-5">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-txt-dim">
                  <Sparkles size={14} className="text-accent" />
                  Suggested setup
                </div>
                <p className="mt-3 text-sm leading-7 text-txt-muted">
                  Keep solo users on the personal plan and only upgrade to an organization when
                  they need shared seats, centralized templates, and delegated access. It feels
                  simpler than forcing every signup into a company structure.
                </p>
              </div>
            </section>

            <section className="space-y-6">
              {selectedOrganization ? (
                <>
                  <div className="grid gap-4 xl:grid-cols-3">
                    <div className="rounded-3xl border border-border bg-bg-surface p-5">
                      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-txt-dim">
                        <CreditCard size={14} className="text-accent" />
                        Current plan
                      </div>
                      <div className="mt-4">
                        <Badge color={subscriptionBadgeColor(selectedAccessState)}>
                          {subscriptionStateLabel(selectedAccessState).toUpperCase()}
                        </Badge>
                      </div>
                      <div className="mt-4 text-xl font-semibold text-white">
                        {selectedSubscription
                          ? selectedSubscription.plan_code.replace(/-/g, " ")
                          : "No plan configured"}
                      </div>
                      <div className="mt-2 text-sm text-txt-muted">
                        {selectedSubscription
                          ? `${selectedSubscription.billing_interval} billing · ${selectedSubscription.status}`
                          : "Create a plan to unlock seats and invite teammates."}
                      </div>
                      <div className="mt-4 text-xs text-txt-dim">
                        Access expires: {formatSubscriptionExpiry(selectedSubscription)}
                      </div>
                      {!selectedSubscriptionUsable && (
                        <div className="mt-4 rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-xs leading-5 text-red-100">
                          Workspace access is paused until a platform admin manually reactivates
                          this organization.
                        </div>
                      )}
                    </div>

                    <div className="rounded-3xl border border-border bg-bg-surface p-5">
                      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-txt-dim">
                        <Users size={14} className="text-accent" />
                        Seats
                      </div>
                      <div className="mt-4 text-xl font-semibold text-white">
                        {seatsUsed}/{totalSeats}
                      </div>
                      <div className="mt-2 text-sm text-txt-muted">
                        {seatsAvailable} seat{seatsAvailable === 1 ? "" : "s"} still available
                      </div>
                      <div className="mt-4 text-xs text-txt-dim">
                        Active members: {activeMembers.length} · Reserved invites: {reservedSeats}
                      </div>
                    </div>

                    <div className="rounded-3xl border border-border bg-bg-surface p-5">
                      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-txt-dim">
                        <ShieldCheck size={14} className="text-accent" />
                        Access model
                      </div>
                      <div className="mt-4 text-xl font-semibold text-white">
                        {selectedOrganization.personal ? "Individual-first" : "Organization-first"}
                      </div>
                      <div className="mt-2 text-sm text-txt-muted">
                        {selectedOrganization.personal
                          ? "One person owns the workspace, but it can still be upgraded into a team later."
                          : "Seats can be reserved before employees sign up, which keeps onboarding cleaner."}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-border bg-bg-surface p-6">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-txt-dim">
                          <BarChart3 size={14} className="text-accent" />
                          Organization portfolio
                        </div>
                        <h2 className="mt-2 text-xl font-semibold text-white">
                          Project performance across {selectedOrganization.name}
                        </h2>
                        <p className="mt-2 max-w-3xl text-sm leading-6 text-txt-muted">
                          Aggregates project value, latest progress reports, payment certificates,
                          and team assignments so organization admins can see what employees are
                          delivering without opening every project one by one.
                        </p>
                      </div>
                      <Badge color={portfolio.variance >= 0 ? "ok" : "warn"}>
                        {portfolio.variance >= 0 ? "+" : ""}
                        {portfolio.variance.toFixed(1)}% variance
                      </Badge>
                    </div>

                    <div className="mt-5 rounded-2xl border border-border bg-bg-raised p-4">
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1fr_auto]">
                        <label className="space-y-2">
                          <span className="text-[10px] font-black uppercase tracking-[0.18em] text-txt-dim">
                            Program
                          </span>
                          <select
                            className="w-full rounded-xl border border-border bg-bg-input px-3 py-2.5 text-sm font-semibold text-txt outline-none focus:border-accent"
                            value={portfolioFilters.programId}
                            onChange={(event) =>
                              setPortfolioFilters((prev) => ({ ...prev, programId: event.target.value }))
                            }
                          >
                            <option value="">All programs</option>
                            {selectedPrograms.map((program) => (
                              <option key={program.id} value={program.id}>
                                {program.code ? `${program.code} - ${program.name}` : program.name}
                              </option>
                            ))}
                            {hasUnassignedProjects ? (
                              <option value="__unassigned__">Unassigned projects</option>
                            ) : null}
                          </select>
                        </label>
                        <label className="space-y-2">
                          <span className="text-[10px] font-black uppercase tracking-[0.18em] text-txt-dim">
                            Category
                          </span>
                          <select
                            className="w-full rounded-xl border border-border bg-bg-input px-3 py-2.5 text-sm font-semibold text-txt outline-none focus:border-accent"
                            value={portfolioFilters.categoryId}
                            onChange={(event) =>
                              setPortfolioFilters((prev) => ({ ...prev, categoryId: event.target.value }))
                            }
                          >
                            <option value="">All categories</option>
                            {selectedCategories
                              .filter((category) => category.status === "active")
                              .map((category) => (
                                <option key={category.id} value={category.id}>
                                  {category.code ? `${category.code} - ${category.name}` : category.name}
                                </option>
                              ))}
                            {hasUncategorizedProjects ? (
                              <option value="__uncategorized__">Uncategorized projects</option>
                            ) : null}
                          </select>
                        </label>
                        <label className="space-y-2">
                          <span className="text-[10px] font-black uppercase tracking-[0.18em] text-txt-dim">
                            Location
                          </span>
                          <select
                            className="w-full rounded-xl border border-border bg-bg-input px-3 py-2.5 text-sm font-semibold text-txt outline-none focus:border-accent"
                            value={portfolioFilters.location}
                            onChange={(event) =>
                              setPortfolioFilters((prev) => ({ ...prev, location: event.target.value }))
                            }
                          >
                            <option value="">All locations</option>
                            {selectedLocations.map((location) => (
                              <option key={location} value={location}>
                                {location}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="space-y-2">
                          <span className="text-[10px] font-black uppercase tracking-[0.18em] text-txt-dim">
                            Client
                          </span>
                          <select
                            className="w-full rounded-xl border border-border bg-bg-input px-3 py-2.5 text-sm font-semibold text-txt outline-none focus:border-accent"
                            value={portfolioFilters.client}
                            onChange={(event) =>
                              setPortfolioFilters((prev) => ({ ...prev, client: event.target.value }))
                            }
                          >
                            <option value="">All clients</option>
                            {selectedClients.map((client) => (
                              <option key={client} value={client}>
                                {client}
                              </option>
                            ))}
                          </select>
                        </label>
                        <div className="flex items-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={activeFilterCount === 0}
                            onClick={() =>
                              setPortfolioFilters({ programId: "", categoryId: "", location: "", client: "" })
                            }
                          >
                            <X size={14} /> Clear
                          </Button>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-txt-muted">
                        <span className="rounded-full border border-border bg-black/10 px-3 py-1">
                          Showing {filteredProjects.length} of {selectedProjects.length} projects
                        </span>
                        {portfolioFilters.programId ? (
                          <span className="rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-accent">
                            Program:{" "}
                            {portfolioFilters.programId === "__unassigned__"
                              ? "Unassigned"
                              : programLabel(selectedPrograms, portfolioFilters.programId)}
                          </span>
                        ) : null}
                        {portfolioFilters.categoryId ? (
                          <span className="rounded-full border border-ok/30 bg-ok/10 px-3 py-1 text-ok">
                            Category:{" "}
                            {portfolioFilters.categoryId === "__uncategorized__"
                              ? "Uncategorized"
                              : categoryLabel(selectedCategories, portfolioFilters.categoryId)}
                          </span>
                        ) : null}
                        {portfolioFilters.location ? (
                          <span className="rounded-full border border-border px-3 py-1">
                            {portfolioFilters.location}
                          </span>
                        ) : null}
                        {portfolioFilters.client ? (
                          <span className="rounded-full border border-border px-3 py-1">
                            {portfolioFilters.client}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-2xl border border-border bg-bg-raised p-4">
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-txt-dim">
                          <FolderKanban size={14} className="text-accent" />
                          Projects
                        </div>
                        <div className="mt-3 text-2xl font-semibold text-white">
                          {filteredProjects.length}
                        </div>
                        <div className="mt-1 text-xs text-txt-muted">
                          {portfolio.delayedProjects} need management attention
                        </div>
                      </div>

                      <div className="rounded-2xl border border-border bg-bg-raised p-4">
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-txt-dim">
                          <TrendingUp size={14} className="text-ok" />
                          Physical progress
                        </div>
                        <div className="mt-3 text-2xl font-semibold text-white">
                          {portfolio.actual.toFixed(1)}%
                        </div>
                        <div className="mt-1 text-xs text-txt-muted">
                          Planned {portfolio.planned.toFixed(1)}%
                        </div>
                      </div>

                      <div className="rounded-2xl border border-border bg-bg-raised p-4">
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-txt-dim">
                          <DollarSign size={14} className="text-warn" />
                          Portfolio value
                        </div>
                        <div className="mt-3 text-2xl font-semibold text-white">
                          {formatCurrency(
                            portfolio.portfolioValue,
                            filteredProjects[0]?.currency || selectedProjects[0]?.currency || "USD",
                          )}
                        </div>
                        <div className="mt-1 text-xs text-txt-muted">
                          Earned {formatCurrency(portfolio.earned, filteredProjects[0]?.currency || selectedProjects[0]?.currency || "USD")}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-border bg-bg-raised p-4">
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-txt-dim">
                          <Users size={14} className="text-accent" />
                          Employee activity
                        </div>
                        <div className="mt-3 text-2xl font-semibold text-white">
                          {memberUsage.activeContributors}
                        </div>
                        <div className="mt-1 text-xs text-txt-muted">
                          contributors assigned to active projects
                        </div>
                      </div>
                    </div>

                    <div className="mt-6 overflow-hidden rounded-2xl border border-border">
                      <div className="space-y-3 p-3 lg:hidden">
                        {portfolio.projectCards.length === 0 ? (
                          <div className="rounded-2xl border border-border bg-bg-raised/50 px-4 py-6 text-sm text-txt-muted">
                            No organization projects yet. Once employees create or are assigned to
                            projects, this portfolio dashboard will aggregate their progress here.
                          </div>
                        ) : (
                          portfolio.projectCards.slice(0, 8).map((item) => (
                            <div key={`${item.project.id}-compact`} className="rounded-2xl border border-border bg-bg-raised/50 p-4">
                              <div className="text-sm font-semibold text-white">{item.project.name}</div>
                              <div className="mt-1 text-xs text-txt-muted">
                                {programLabel(selectedPrograms, item.project.program_id)} · {categoryLabel(selectedCategories, item.project.category_id, item.project.category_name)} · {item.project.code || item.project.role} · {item.project.type}
                              </div>
                              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                                <div className="rounded-xl border border-border bg-bg-surface p-3">
                                  <div className="text-[10px] uppercase tracking-[0.14em] text-txt-dim">Value</div>
                                  <div className="mt-1 font-mono font-bold text-txt">
                                    {formatCurrency(item.commercialValue, item.project.currency || selectedProjects[0]?.currency || "USD")}
                                  </div>
                                </div>
                                <div className="rounded-xl border border-border bg-bg-surface p-3">
                                  <div className="text-[10px] uppercase tracking-[0.14em] text-txt-dim">Physical</div>
                                  <div className={`mt-1 font-mono font-bold ${item.progress.variance >= -5 ? "text-ok" : "text-warn"}`}>
                                    {item.progress.actual.toFixed(1)}%
                                  </div>
                                  <div className="text-[11px] text-txt-dim">plan {item.progress.planned.toFixed(1)}%</div>
                                </div>
                                <div className="rounded-xl border border-border bg-bg-surface p-3">
                                  <div className="text-[10px] uppercase tracking-[0.14em] text-txt-dim">Earned</div>
                                  <div className="mt-1 font-mono font-bold text-txt">
                                    {formatCurrency(item.progress.earned, item.project.currency || selectedProjects[0]?.currency || "USD")}
                                  </div>
                                </div>
                                <div className="rounded-xl border border-border bg-bg-surface p-3">
                                  <div className="text-[10px] uppercase tracking-[0.14em] text-txt-dim">Updated</div>
                                  <div className="mt-1 text-xs font-semibold text-txt">{formatDate(item.updatedAt)}</div>
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                      <div className="hidden lg:block">
                      <div className="grid grid-cols-[minmax(220px,1.6fr)_120px_120px_130px_120px] bg-bg-raised px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">
                        <div>Project</div>
                        <div className="text-right">Value</div>
                        <div className="text-right">Physical</div>
                        <div className="text-right">Earned / Certified</div>
                        <div className="text-right">Updated</div>
                      </div>
                      {portfolio.projectCards.length === 0 ? (
                        <div className="px-4 py-6 text-sm text-txt-muted">
                          No organization projects yet. Once employees create or are assigned to
                          projects, this portfolio dashboard will aggregate their progress here.
                        </div>
                      ) : (
                        portfolio.projectCards.slice(0, 8).map((item) => (
                          <div
                            key={item.project.id}
                            className="grid grid-cols-[minmax(220px,1.6fr)_120px_120px_130px_120px] items-center border-t border-border px-4 py-3 text-sm"
                          >
                            <div>
                              <div className="font-semibold text-white">{item.project.name}</div>
                              <div className="mt-1 text-xs text-txt-muted">
                                {programLabel(selectedPrograms, item.project.program_id)} · {categoryLabel(selectedCategories, item.project.category_id, item.project.category_name)} · {item.project.code || item.project.role} · {item.project.type}
                              </div>
                            </div>
                            <div className="text-right font-mono text-txt">
                              {formatCurrency(
                                item.commercialValue,
                                item.project.currency || selectedProjects[0]?.currency || "USD",
                              )}
                            </div>
                            <div className="text-right">
                              <span
                                className={`font-mono ${
                                  item.progress.variance >= -5 ? "text-ok" : "text-warn"
                                }`}
                              >
                                {item.progress.actual.toFixed(1)}%
                              </span>
                              <div className="text-[11px] text-txt-dim">
                                plan {item.progress.planned.toFixed(1)}%
                              </div>
                            </div>
                            <div className="text-right font-mono text-txt">
                              {formatCurrency(
                                item.progress.earned,
                                item.project.currency || selectedProjects[0]?.currency || "USD",
                              )}
                              <div className="text-[11px] text-txt-dim">
                                cert{" "}
                                {formatCurrency(
                                  item.certifiedValue,
                                  item.project.currency || selectedProjects[0]?.currency || "USD",
                                )}
                              </div>
                            </div>
                            <div className="text-right text-xs text-txt-muted">
                              {formatDate(item.updatedAt)}
                            </div>
                          </div>
                        ))
                      )}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-border bg-bg-surface p-6">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-txt-dim">
                          Official program catalog
                        </div>
                        <h2 className="mt-2 text-xl font-semibold text-white">
                          Standard program names for employee project setup
                        </h2>
                        <p className="mt-2 max-w-3xl text-sm leading-6 text-txt-muted">
                          These organization programs appear in employee project dropdowns and keep
                          portfolio filters consistent. Employees can still create private programs,
                          but private names will not become organization-wide options.
                        </p>
                      </div>
                      {canManageSelectedOrganization ? (
                        <Button variant="primary" onClick={openCreateProgram}>
                          <Plus size={15} /> Add program
                        </Button>
                      ) : (
                        <Badge color="warn">READ ONLY</Badge>
                      )}
                    </div>

                    <div className="mt-5 grid gap-3">
                      {selectedPrograms.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-border px-4 py-6 text-sm text-txt-muted">
                          No official programs yet. Add programs such as SURP2, health facilities,
                          or municipal roads so employee-created projects use the same reporting
                          categories.
                        </div>
                      ) : null}

                      {selectedPrograms.map((program) => {
                        const usageCount = programUsageCounts.get(program.id) ?? 0;
                        const archived = program.status !== "active";

                        return (
                          <div
                            key={program.id}
                            className={`rounded-2xl border px-4 py-4 ${
                              archived
                                ? "border-border bg-bg-raised/60 opacity-75"
                                : "border-border bg-bg-raised"
                            }`}
                          >
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <div className="text-base font-semibold text-white">
                                    {program.code ? `${program.code} - ${program.name}` : program.name}
                                  </div>
                                  <Badge color={archived ? "warn" : "ok"}>
                                    {program.status.toUpperCase()}
                                  </Badge>
                                  <span className="rounded-full border border-border bg-bg px-3 py-1 text-xs text-txt-muted">
                                    {usageCount} linked project{usageCount === 1 ? "" : "s"}
                                  </span>
                                </div>
                                <div className="mt-2 text-sm text-txt-muted">
                                  {[program.client_name, program.location].filter(Boolean).join(" · ") ||
                                    "No client or location metadata set"}
                                </div>
                                {program.description ? (
                                  <p className="mt-2 max-w-3xl text-sm leading-6 text-txt-dim">
                                    {program.description}
                                  </p>
                                ) : null}
                                <div className="mt-3 flex flex-wrap gap-2 text-xs text-txt-dim">
                                  <span>Budget: {program.budget_amount || "Not set"}</span>
                                  <span>Currency: {program.currency || "USD"}</span>
                                  <span>
                                    Dates: {formatDate(program.start_date)} - {formatDate(program.end_date)}
                                  </span>
                                </div>
                              </div>

                              {canManageSelectedOrganization ? (
                                <div className="flex flex-wrap gap-2">
                                  <Button variant="ghost" size="sm" onClick={() => openEditProgram(program)}>
                                    <Pencil size={13} /> Edit
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={busyAction === `program-status:${program.id}`}
                                    onClick={() =>
                                      handleProgramStatus(program, archived ? "active" : "paused")
                                    }
                                  >
                                    {archived ? "Activate" : "Archive"}
                                  </Button>
                                  <Button
                                    variant="danger"
                                    size="sm"
                                    disabled={busyAction === `program-delete:${program.id}`}
                                    onClick={() => handleDeleteProgram(program)}
                                  >
                                    <Trash2 size={13} /> Delete
                                  </Button>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="rounded-3xl border border-border bg-bg-surface p-6">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-txt-dim">
                          Official category catalog
                        </div>
                        <h2 className="mt-2 text-xl font-semibold text-white">
                          Standard project sectors and asset categories
                        </h2>
                        <p className="mt-2 max-w-3xl text-sm leading-6 text-txt-muted">
                          Add categories such as WASH, Roads, Buildings, Drainage, Health, and
                          Solar / Energy so employee-created projects can be filtered consistently.
                        </p>
                      </div>
                      {canManageSelectedOrganization ? (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="ghost"
                            onClick={handleSeedDefaultCategories}
                            disabled={busyAction === "seed-categories"}
                          >
                            <Sparkles size={15} /> Add defaults
                          </Button>
                          <Button variant="primary" onClick={openCreateCategory}>
                            <Plus size={15} /> Add category
                          </Button>
                        </div>
                      ) : (
                        <Badge color="warn">READ ONLY</Badge>
                      )}
                    </div>

                    <div className="mt-5 grid gap-3 md:grid-cols-2">
                      {selectedCategories.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-border px-4 py-6 text-sm text-txt-muted md:col-span-2">
                          No official categories yet. Add the default catalog or create a custom
                          category for your organization.
                        </div>
                      ) : null}

                      {selectedCategories.map((category) => {
                        const usageCount = categoryUsageCounts.get(category.id) ?? 0;
                        const archived = category.status !== "active";

                        return (
                          <div
                            key={category.id}
                            className={`rounded-2xl border px-4 py-4 ${
                              archived
                                ? "border-border bg-bg-raised/60 opacity-75"
                                : "border-border bg-bg-raised"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span
                                    className="h-3 w-3 rounded-full border border-white/20"
                                    style={{ backgroundColor: category.color || "#3b82f6" }}
                                  />
                                  <div className="font-semibold text-white">
                                    {category.code ? `${category.code} - ${category.name}` : category.name}
                                  </div>
                                  <Badge color={archived ? "warn" : "ok"}>{category.status.toUpperCase()}</Badge>
                                </div>
                                <p className="mt-2 text-sm text-txt-muted">
                                  {category.description || "No description"}
                                </p>
                                <div className="mt-3 text-xs text-txt-dim">
                                  {usageCount} linked project{usageCount === 1 ? "" : "s"}
                                </div>
                              </div>
                              {canManageSelectedOrganization ? (
                                <div className="flex flex-wrap justify-end gap-2">
                                  <Button variant="ghost" size="sm" onClick={() => openEditCategory(category)}>
                                    <Pencil size={13} /> Edit
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={busyAction === `category-status:${category.id}`}
                                    onClick={() =>
                                      handleCategoryStatus(category, archived ? "active" : "archived")
                                    }
                                  >
                                    {archived ? "Activate" : "Archive"}
                                  </Button>
                                  <Button
                                    variant="danger"
                                    size="sm"
                                    disabled={busyAction === `category-delete:${category.id}`}
                                    onClick={() => handleDeleteCategory(category)}
                                  >
                                    <Trash2 size={13} /> Delete
                                  </Button>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="rounded-3xl border border-border bg-bg-surface p-6">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-txt-dim">
                          Plan catalog
                        </div>
                        <h2 className="mt-2 text-xl font-semibold text-white">
                          Monthly and yearly pricing built for individuals and teams
                        </h2>
                      </div>
                      <div className="w-full max-w-[180px]">
                        <label className="label">Seats</label>
                        <input
                          className="input"
                          value={seatCount}
                          onChange={(event) => setSeatCount(event.target.value)}
                          placeholder="Enter seats"
                          disabled={!canManageRole(selectedMembership?.role || "viewer")}
                        />
                      </div>
                    </div>

                    <div className="mt-5 grid gap-4 xl:grid-cols-2">
                      {plans.map((plan) => {
                        const effectiveSeats = Math.max(
                          Number(seatCount) || plan.included_seats,
                          plan.included_seats,
                        );
                        const extraSeats = Math.max(effectiveSeats - plan.included_seats, 0);
                        const estimated = plan.base_price_cents + extraSeats * plan.per_seat_price_cents;

                        return (
                          <div
                            key={plan.id}
                            className={`rounded-3xl border p-5 ${
                              plan.code === currentPlanCode
                                ? "border-accent/35 bg-accent/10"
                                : "border-border bg-bg-raised"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="text-lg font-semibold text-white">{plan.name}</div>
                                <div className="mt-1 text-sm text-txt-muted">{plan.description}</div>
                              </div>
                              <Badge color={plan.audience === "organization" ? "accent" : "ok"}>
                                {plan.audience.toUpperCase()}
                              </Badge>
                            </div>

                            <div className="mt-4 text-3xl font-semibold text-white">
                              {formatMoney(estimated)}
                              <span className="ml-2 text-sm font-medium text-txt-dim">
                                / {plan.billing_interval === "yearly" ? "year" : "month"}
                              </span>
                            </div>
                            <div className="mt-2 text-xs text-txt-dim">
                              Includes {plan.included_seats} seat{plan.included_seats === 1 ? "" : "s"}.
                              {plan.per_seat_price_cents > 0
                                ? ` Extra seats estimated at ${formatMoney(plan.per_seat_price_cents)} each.`
                                : " No extra seat charge on this plan."}
                            </div>

                            <div className="mt-4 flex flex-wrap gap-2">
                              {(plan.features || []).map((feature) => (
                                <span
                                  key={feature}
                                  className="rounded-full border border-border px-3 py-1 text-xs text-txt-muted"
                                >
                                  {feature}
                                </span>
                              ))}
                            </div>

                            <div className="mt-5">
                              <Button
                                variant={plan.code === currentPlanCode ? "ghost" : "primary"}
                                disabled={
                                  busyAction === `plan:${plan.code}` ||
                                  !canManageRole(selectedMembership?.role || "viewer")
                                }
                                onClick={() => handlePlanChange(plan)}
                              >
                                {busyAction === `plan:${plan.code}`
                                  ? "Updating..."
                                  : plan.code === currentPlanCode
                                    ? "Current plan"
                                    : "Use this plan"}
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid gap-6 xl:grid-cols-2">
                    <div className="rounded-3xl border border-border bg-bg-surface p-6">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-txt-dim">
                            Team members
                          </div>
                          <h2 className="mt-2 text-xl font-semibold text-white">
                            Assigned seats and access levels
                          </h2>
                        </div>
                        <Badge color="ok">{activeMembers.length} active</Badge>
                      </div>

                      <div className="mt-5 space-y-3">
                        {selectedMembers.map((member) => (
                          <div
                            key={member.id}
                            className="rounded-2xl border border-border bg-bg-raised px-4 py-4"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="font-semibold text-white">
                                  {member.profiles?.full_name || member.profiles?.email || "User"}
                                </div>
                                <div className="mt-1 text-xs text-txt-muted">
                                  {member.profiles?.email || "Email unavailable"}
                                </div>
                              </div>
                              <Badge color={roleBadgeColor(member.role)}>
                                {member.role.toUpperCase()}
                              </Badge>
                            </div>
                            <div className="mt-3 text-xs text-txt-dim">
                              Joined {formatDate(member.joined_at)} · Status {member.status}
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2 text-xs">
                              <span className="rounded-full border border-border bg-bg px-3 py-1 text-txt-muted">
                                {memberUsage.assignedCounts.get(member.user_id) ?? 0} project
                                {(memberUsage.assignedCounts.get(member.user_id) ?? 0) === 1
                                  ? ""
                                  : "s"}{" "}
                                assigned
                              </span>
                              <span className="rounded-full border border-border bg-bg px-3 py-1 text-txt-muted">
                                {memberUsage.createdCounts.get(member.user_id) ?? 0} created
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-3xl border border-border bg-bg-surface p-6">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-txt-dim">
                            Pending invites
                          </div>
                          <h2 className="mt-2 text-xl font-semibold text-white">
                            Reserved seats waiting for sign-up
                          </h2>
                        </div>
                        <Badge color="accent">{selectedInvites.length} pending</Badge>
                      </div>

                      <div className="mt-5 space-y-3">
                        {selectedInvites.length === 0 ? (
                          <div className="rounded-2xl border border-dashed border-border px-4 py-5 text-sm text-txt-muted">
                            No pending invites yet. Reserve a seat and share the link with the employee.
                          </div>
                        ) : null}

                        {selectedInvites.map((invite) => (
                          <div
                            key={invite.id}
                            className="rounded-2xl border border-border bg-bg-raised px-4 py-4"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="font-semibold text-white">
                                  {invite.full_name || invite.email}
                                </div>
                                <div className="mt-1 text-xs text-txt-muted">
                                  {invite.email} · {invite.delivery_method} invite
                                </div>
                              </div>
                              <Badge color={roleBadgeColor(invite.role)}>{invite.role.toUpperCase()}</Badge>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <Button variant="ghost" size="sm" onClick={() => handleCopyLink(invite)}>
                                <Copy size={13} /> Copy link
                              </Button>
                              <Button
                                variant="danger"
                                size="sm"
                                disabled={busyAction === `revoke:${invite.id}`}
                                onClick={() => handleRevokeInvite(invite.id)}
                              >
                                {busyAction === `revoke:${invite.id}` ? "Revoking..." : "Revoke"}
                              </Button>
                            </div>
                            <div className="mt-3 text-xs text-txt-dim">
                              Expires {formatDate(invite.expires_at)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {freshInviteLink ? (
                    <div className="rounded-3xl border border-ok/30 bg-ok/10 p-6">
                      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-ok">
                        <Link2 size={14} />
                        Fresh invite link
                      </div>
                      <div className="mt-4 rounded-2xl border border-border bg-bg-surface px-4 py-3 font-mono text-xs text-txt">
                        {freshInviteLink}
                      </div>
                      <div className="mt-4">
                        <Button
                          variant="ghost"
                          onClick={async () => {
                            await navigator.clipboard.writeText(freshInviteLink);
                            setNotice("Invite link copied.");
                          }}
                        >
                          <Copy size={14} /> Copy invite link
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="rounded-3xl border border-border bg-bg-surface p-6 text-sm text-txt-muted">
                  No organization memberships were found yet. Create an organization to start
                  inviting teammates and assigning seats.
                </div>
              )}
            </section>
          </div>
        )}
      </div>

      <Modal open={createOrgOpen} onClose={() => setCreateOrgOpen(false)} title="Create organization" width={460}>
        <div className="space-y-4">
          <div>
            <label className="label">Organization name</label>
            <input
              className="input"
              value={orgName}
              onChange={(event) => setOrgName(event.target.value)}
              placeholder="Engineering company or department"
            />
          </div>
          <p className="text-sm leading-6 text-txt-muted">
            This creates a shared organization workspace with an owner seat and a team-ready trial
            subscription. You can still keep your personal workspace alongside it.
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setCreateOrgOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleCreateOrganization}
              disabled={busyAction === "create-organization"}
            >
              {busyAction === "create-organization" ? "Creating..." : "Create organization"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={programOpen}
        onClose={() => setProgramOpen(false)}
        title={programEditor.id ? "Edit official program" : "Add official program"}
        width={720}
      >
        <div className="space-y-4">
          <div className="rounded-2xl border border-accent/25 bg-accent/10 px-4 py-3 text-sm leading-6 text-txt">
            Official programs are shared with the organization and appear in every employee’s
            project program dropdown. Personal/private programs stay outside this catalog.
          </div>

          <div className="grid gap-4 md:grid-cols-[1fr_160px]">
            <div>
              <label className="label">Program name</label>
              <input
                className="input"
                value={programEditor.name}
                onChange={(event) =>
                  setProgramEditor((prev) => ({ ...prev, name: event.target.value }))
                }
                placeholder="SURP2 - Mogadishu Municipality"
              />
            </div>
            <div>
              <label className="label">Code</label>
              <input
                className="input"
                value={programEditor.code}
                onChange={(event) =>
                  setProgramEditor((prev) => ({ ...prev, code: event.target.value }))
                }
                placeholder="SURP2"
              />
            </div>
          </div>

          <div>
            <label className="label">Description</label>
            <textarea
              className="input min-h-[96px]"
              value={programEditor.description}
              onChange={(event) =>
                setProgramEditor((prev) => ({ ...prev, description: event.target.value }))
              }
              placeholder="Short program description for admins and reporting users"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="label">Client / funding body</label>
              <input
                className="input"
                value={programEditor.clientName}
                onChange={(event) =>
                  setProgramEditor((prev) => ({ ...prev, clientName: event.target.value }))
                }
                placeholder="World Bank / Municipality / NGO"
              />
            </div>
            <div>
              <label className="label">Location</label>
              <input
                className="input"
                value={programEditor.location}
                onChange={(event) =>
                  setProgramEditor((prev) => ({ ...prev, location: event.target.value }))
                }
                placeholder="Mogadishu, Banadir"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <label className="label">Currency</label>
              <input
                className="input"
                value={programEditor.currency}
                onChange={(event) =>
                  setProgramEditor((prev) => ({ ...prev, currency: event.target.value }))
                }
                placeholder="USD"
              />
            </div>
            <div>
              <label className="label">Budget</label>
              <input
                className="input"
                value={programEditor.budgetAmount}
                onChange={(event) =>
                  setProgramEditor((prev) => ({ ...prev, budgetAmount: event.target.value }))
                }
                placeholder="15000000"
              />
            </div>
            <div>
              <label className="label">Start date</label>
              <input
                className="input"
                type="date"
                value={programEditor.startDate}
                onChange={(event) =>
                  setProgramEditor((prev) => ({ ...prev, startDate: event.target.value }))
                }
              />
            </div>
            <div>
              <label className="label">End date</label>
              <input
                className="input"
                type="date"
                value={programEditor.endDate}
                onChange={(event) =>
                  setProgramEditor((prev) => ({ ...prev, endDate: event.target.value }))
                }
              />
            </div>
          </div>

          <div>
            <label className="label">Status</label>
            <select
              className="input"
              value={programEditor.status}
              onChange={(event) =>
                setProgramEditor((prev) => ({
                  ...prev,
                  status: event.target.value as ProgramRecord["status"],
                }))
              }
            >
              <option value="planning">Planning</option>
              <option value="active">Active</option>
              <option value="paused">Archived / Paused</option>
              <option value="completed">Completed</option>
            </select>
          </div>

          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setProgramOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSaveProgram}
              disabled={busyAction === "save-program"}
            >
              {busyAction === "save-program" ? "Saving..." : "Save program"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={categoryOpen}
        onClose={() => setCategoryOpen(false)}
        title={categoryEditor.id ? "Edit official category" : "Add official category"}
        width={560}
      >
        <div className="space-y-4">
          <div className="rounded-2xl border border-accent/25 bg-accent/10 px-4 py-3 text-sm leading-6 text-txt">
            Official categories appear in employee project forms and portfolio filters. Use them to
            standardize sectors and construction asset types across the organization.
          </div>
          <div className="grid gap-4 md:grid-cols-[1fr_140px]">
            <div>
              <label className="label">Category name</label>
              <input
                className="input"
                value={categoryEditor.name}
                onChange={(event) =>
                  setCategoryEditor((prev) => ({ ...prev, name: event.target.value }))
                }
                placeholder="Roads"
              />
            </div>
            <div>
              <label className="label">Code</label>
              <input
                className="input"
                value={categoryEditor.code}
                onChange={(event) =>
                  setCategoryEditor((prev) => ({ ...prev, code: event.target.value }))
                }
                placeholder="ROAD"
              />
            </div>
          </div>
          <div>
            <label className="label">Description</label>
            <textarea
              className="input min-h-[96px]"
              value={categoryEditor.description}
              onChange={(event) =>
                setCategoryEditor((prev) => ({ ...prev, description: event.target.value }))
              }
              placeholder="Short explanation for admins and reporting users"
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="label">Color</label>
              <input
                className="input"
                type="color"
                value={categoryEditor.color}
                onChange={(event) =>
                  setCategoryEditor((prev) => ({ ...prev, color: event.target.value }))
                }
              />
            </div>
            <div>
              <label className="label">Status</label>
              <select
                className="input"
                value={categoryEditor.status}
                onChange={(event) =>
                  setCategoryEditor((prev) => ({
                    ...prev,
                    status: event.target.value as ProjectCategoryRecord["status"],
                  }))
                }
              >
                <option value="active">Active</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setCategoryOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSaveCategory}
              disabled={busyAction === "save-category"}
            >
              {busyAction === "save-category" ? "Saving..." : "Save category"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} title="Invite teammate" width={520}>
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="label">Employee email</label>
              <input
                className="input"
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                placeholder="engineer@company.com"
              />
            </div>
            <div>
              <label className="label">Name (optional)</label>
              <input
                className="input"
                value={inviteName}
                onChange={(event) => setInviteName(event.target.value)}
                placeholder="Project engineer"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="label">Role</label>
              <select
                className="input"
                value={inviteRole}
                onChange={(event) =>
                  setInviteRole(event.target.value as OrganizationInviteRecord["role"])
                }
              >
                <option value="member">Member</option>
                <option value="viewer">Viewer</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div>
              <label className="label">Invite flow</label>
              <select
                className="input"
                value={inviteMode}
                onChange={(event) =>
                  setInviteMode(event.target.value as OrganizationInviteRecord["delivery_method"])
                }
              >
                <option value="email">Generate email invite link</option>
                <option value="manual">Reserve seat manually</option>
              </select>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            The easiest flow is to reserve the seat immediately, then let the employee sign up with
            the same email. If you share the link, it pre-fills the invited address and feels closer
            to Monday.com style onboarding without forcing an admin to create passwords for staff.
          </div>

          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleInvite}
              disabled={busyAction === "create-invite"}
            >
              {busyAction === "create-invite" ? "Creating..." : "Reserve seat"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
