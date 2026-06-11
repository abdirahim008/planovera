"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Filter,
  Copy,
  CreditCard,
  DollarSign,
  FolderKanban,
  Link2,
  MailPlus,
  MapPin,
  Maximize2,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  TrendingUp,
  Users,
  Wallet,
  X,
} from "lucide-react";

import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase-browser";
import {
  normalizeConstructionWorkspacePayload,
  type ChecklistItem,
  type ConstructionWorkspacePayload,
  type MeetingMinute,
  type PaymentCertificate,
  type ProjectCategoryRecord,
  type ProgramRecord,
  type ProgressReport,
  type ProjectRecord,
  type SavedBOQ,
  type OrganizationInviteRecord,
  type OrganizationMembershipRecord,
  type OrganizationRecord,
  type OrganizationSubscriptionRecord,
} from "@/lib/supabase";
import { findSomaliaTown } from "@/lib/somaliaLocations";
import { getLiveMeetingActionItems, type MeetingActionSnapshot } from "@/lib/store";
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

type WorkspaceOwnedPayloadRecord<TPayload> = {
  id: string;
  owner_id: string;
  name: string;
  payload: TPayload;
  created_at: string;
  updated_at: string;
};

type WorkspaceSnapshotRecord = {
  owner_id: string;
  payload: ConstructionWorkspacePayload;
  created_at?: string | null;
  updated_at?: string | null;
};

type PortfolioFilters = {
  userId: string;
  programId: string;
  categoryId: string;
  location: string;
  client: string;
};

type OrganizationConsoleTab = "dashboard" | "team" | "programs" | "categories";

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

const memberDisplayName = (member?: MemberDirectoryEntry | null) =>
  member?.profiles?.full_name || member?.profiles?.email || "Unassigned";

const projectResponsibleName = (
  project: ProjectRecord,
  organizationMembers: MemberDirectoryEntry[],
  projectMemberships: ProjectMembershipEntry[],
) => {
  const owner = organizationMembers.find((member) => member.user_id === project.owner_id);
  if (owner) return memberDisplayName(owner);

  const assignment = projectMemberships.find((membership) => membership.project_id === project.id);
  const assignedMember = organizationMembers.find((member) => member.user_id === assignment?.user_id);
  return memberDisplayName(assignedMember);
};

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

const todayAtStart = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
};

const isPastDate = (value?: string | null) => {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  date.setHours(0, 0, 0, 0);
  return date < todayAtStart();
};

const clampPercent = (value: number) => Math.max(0, Math.min(100, value));

const projectLocationLabel = (project: ProjectRecord) =>
  [project.town, project.region].filter(Boolean).join(", ") || project.location || "";

const parseCoordinate = (value?: string | null) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const resolveProjectCoordinates = (project: ProjectRecord) => {
  const latitude = parseCoordinate(project.latitude);
  const longitude = parseCoordinate(project.longitude);

  if (latitude !== null && longitude !== null) {
    return { latitude, longitude, source: "Exact coordinates" };
  }

  const town = findSomaliaTown(project.region || undefined, project.town || undefined);
  if (!town) return null;
  return { latitude: town.latitude, longitude: town.longitude, source: "Town fallback" };
};

const checklistStatusColor = (status: ChecklistItem["status"]) => {
  if (status === "verified") return "ok";
  if (status === "submitted") return "accent";
  if (status === "rejected") return "err";
  if (status === "waived") return "purple";
  return "warn";
};

const actionStatusColor = (status: MeetingActionSnapshot["status"]) => {
  if (status === "closed") return "ok";
  if (status === "in-progress") return "accent";
  return "warn";
};

const escapeMapHtml = (value: string | number) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

type OrganizationProjectCard = {
  project: ProjectRecord;
  progress: ReturnType<typeof progressMetrics>;
  contractValue: number;
  boqValue: number;
  commercialValue: number;
  certifiedValue: number;
  updatedAt?: string | null;
};

type OrganizationMapPoint = {
  id: string;
  label: string;
  subtitle: string;
  latitude: number;
  longitude: number;
  source: string;
  count: number;
  projects: Array<{
    id: string;
    name: string;
    code: string;
    contractNumber: string;
    value: number;
    currency: string;
    physical: number;
    financial: number;
  }>;
};

const buildOrganizationMapPoints = (cards: OrganizationProjectCard[]) => {
  const grouped = new Map<string, OrganizationMapPoint>();

  cards.forEach((card) => {
    const coordinates = resolveProjectCoordinates(card.project);
    if (!coordinates) return;

    const label = projectLocationLabel(card.project) || card.project.name;
    const key = `${coordinates.latitude.toFixed(3)}:${coordinates.longitude.toFixed(3)}:${label}`;
    const projectEntry = {
      id: card.project.id,
      name: card.project.name,
      code: card.project.code || "",
      contractNumber: card.project.contract_number || "",
      value: card.commercialValue,
      currency: card.project.currency || "USD",
      physical: card.progress.actual,
      financial: card.commercialValue > 0 ? (card.certifiedValue / card.commercialValue) * 100 : 0,
    };
    const existing = grouped.get(key);

    if (existing) {
      existing.count += 1;
      existing.subtitle = `${existing.count} projects in this location`;
      existing.projects.push(projectEntry);
      return;
    }

    grouped.set(key, {
      id: key,
      label,
      subtitle: card.project.name,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      source: coordinates.source,
      count: 1,
      projects: [projectEntry],
    });
  });

  return Array.from(grouped.values());
};

function organizationMapPopupHtml(point: OrganizationMapPoint) {
  const projectRows = point.projects
    .map(
      (project) => `
        <div class="planovera-map-project">
          <div class="planovera-map-project-title">${escapeMapHtml(project.name)}</div>
          <div class="planovera-map-project-meta">
            ${escapeMapHtml(project.contractNumber || project.code || "No reference")} · ${escapeMapHtml(formatCurrency(project.value, project.currency))}
          </div>
          <div class="planovera-map-project-meta">
            Physical ${escapeMapHtml(project.physical.toFixed(1))}% · Financial ${escapeMapHtml(project.financial.toFixed(1))}%
          </div>
        </div>
      `,
    )
    .join("");

  return `
    <div class="planovera-map-popup">
      <div class="planovera-map-popup-label">${escapeMapHtml(point.label)}</div>
      <div class="planovera-map-popup-source">${escapeMapHtml(point.source)}</div>
      ${projectRows}
    </div>
  `;
}

function OrganizationLocationMap({
  points,
  missingCount,
  large = false,
}: {
  points: OrganizationMapPoint[];
  missingCount: number;
  large?: boolean;
}) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const markerLayerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const height = large ? "h-[560px]" : "h-[280px]";

  useEffect(() => {
    let cancelled = false;

    async function initMap() {
      if (!mapContainerRef.current) return;
      const L = await import("leaflet");
      if (cancelled || !mapContainerRef.current) return;

      if (!mapRef.current) {
        mapRef.current = L.map(mapContainerRef.current, {
          zoomControl: large,
          scrollWheelZoom: large,
          attributionControl: large,
        }).setView([5.15, 46.2], 5);

        L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
          maxZoom: 19,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        }).addTo(mapRef.current);

        markerLayerRef.current = L.layerGroup().addTo(mapRef.current);
      }

      const map = mapRef.current;
      const markerLayer = markerLayerRef.current;
      markerLayer?.clearLayers();

      const bounds: Array<[number, number]> = [];
      points.forEach((point) => {
        const marker = L.marker([point.latitude, point.longitude], {
          icon: L.divIcon({
            className: "planovera-map-marker",
            html: `<span>${point.count}</span>`,
            iconAnchor: [18, 18],
            iconSize: [36, 36],
          }),
          title: `${point.label} - ${point.subtitle}`,
        }).bindPopup(organizationMapPopupHtml(point), {
          className: "planovera-map-popup-shell",
          maxWidth: large ? 340 : 280,
        });

        marker.addTo(markerLayer!);
        bounds.push([point.latitude, point.longitude]);
      });

      if (bounds.length > 0) {
        map.fitBounds(bounds, {
          padding: large ? [64, 64] : [36, 36],
          maxZoom: large ? 13 : 9,
        });
      } else {
        map.setView([5.15, 46.2], 5);
      }

      window.setTimeout(() => map.invalidateSize(), 0);
    }

    initMap().catch(() => {
      if (!cancelled) setMapError("Map tiles could not be loaded. Project locations are still listed below.");
    });

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerLayerRef.current = null;
      }
    };
  }, [large, points]);

  return (
    <div className={`relative ${height} overflow-hidden bg-bg-surface`}>
      <div ref={mapContainerRef} className="h-full w-full" />
      <div className="pointer-events-none absolute left-5 top-5 rounded-2xl border border-border bg-bg-surface/85 px-4 py-3 shadow-soft backdrop-blur">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">
          Organization map
        </div>
        <div className="mt-1 text-sm font-bold text-txt">
          {points.reduce((sum, point) => sum + point.count, 0)} plotted projects
        </div>
      </div>
      {missingCount > 0 ? (
        <div className="pointer-events-none absolute right-5 top-5 rounded-full border border-warn/30 bg-bg-surface/85 px-3 py-1 text-xs font-bold text-warn backdrop-blur">
          {missingCount} missing location
        </div>
      ) : null}
      {mapError ? (
        <div className="absolute inset-x-5 bottom-5 rounded-2xl border border-warn/30 bg-bg-surface/90 px-4 py-3 text-sm text-warn shadow-soft backdrop-blur">
          {mapError}
        </div>
      ) : null}
    </div>
  );
}

function OrganizationMapCard({ cards }: { cards: OrganizationProjectCard[] }) {
  const [open, setOpen] = useState(false);
  const points = useMemo(() => buildOrganizationMapPoints(cards), [cards]);
  const plottedCount = points.reduce((sum, point) => sum + point.count, 0);
  const missingCount = Math.max(cards.length - plottedCount, 0);

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") setOpen(true);
        }}
        className="mt-5 w-full overflow-hidden rounded-2xl border border-border bg-bg-surface text-left transition hover:border-accent/50"
      >
        <div className="grid gap-0 lg:grid-cols-[0.72fr_1.28fr]">
          <div className="border-b border-border p-5 lg:border-b-0 lg:border-r">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">
                  <MapPin size={14} className="text-accent" /> Project locations
                </div>
                <div className="mt-2 text-xl font-semibold text-txt">Portfolio map</div>
              </div>
              <span className="rounded-xl border border-border bg-bg p-2 text-txt-muted">
                <Maximize2 size={16} />
              </span>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-3">
              <div className="rounded-2xl border border-border bg-bg p-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">Dots</div>
                <div className="mt-1 text-2xl font-semibold text-txt">{points.length}</div>
              </div>
              <div className="rounded-2xl border border-border bg-bg p-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">Projects</div>
                <div className="mt-1 text-2xl font-semibold text-ok">{plottedCount}</div>
              </div>
              <div className="rounded-2xl border border-border bg-bg p-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">Missing</div>
                <div className="mt-1 text-2xl font-semibold text-warn">{missingCount}</div>
              </div>
            </div>
          </div>
          <OrganizationLocationMap points={points} missingCount={missingCount} />
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Organization Project Locations" width={1080}>
        <div className="space-y-4">
          <OrganizationLocationMap points={points} missingCount={missingCount} large />
          <div className="grid gap-3 md:grid-cols-2">
            {points.length === 0 ? (
              <div className="rounded-2xl border border-border bg-bg p-4 text-sm text-txt-muted">
                No projects in the current filter have region/town or exact coordinates yet.
              </div>
            ) : (
              points.map((point) => (
                <div key={point.id} className="rounded-2xl border border-border bg-bg p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-bold text-txt">{point.label}</div>
                      <div className="mt-1 text-xs text-txt-muted">{point.subtitle}</div>
                    </div>
                    <Badge color="accent">{point.count}</Badge>
                  </div>
                  <div className="mt-3 text-[11px] text-txt-dim">
                    {point.source} - {point.latitude.toFixed(4)}, {point.longitude.toFixed(4)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}

function ProgressGaugeCard({
  title,
  value,
  subtitle,
  accentClass,
  accentHex,
  children,
}: {
  title: string;
  value: number;
  subtitle: string;
  accentClass: string;
  accentHex: string;
  children: ReactNode;
}) {
  const percent = clampPercent(value);

  return (
    <div className="rounded-2xl border border-border bg-bg-raised p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">{title}</div>
        </div>
        <div
          className="grid h-28 w-28 shrink-0 place-items-center rounded-full"
          style={{
            background: `conic-gradient(${accentHex} ${percent * 3.6}deg, rgba(148, 163, 184, 0.16) 0deg)`,
          }}
        >
          <div className="grid h-20 w-20 place-items-center rounded-full bg-bg-surface">
            <div className="text-center">
              <div className={`text-2xl font-semibold ${accentClass}`}>{percent.toFixed(0)}</div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">%</div>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">{children}</div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-bg p-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">{label}</div>
      <div className="mt-1 text-lg font-semibold text-txt">{value}</div>
    </div>
  );
}

export default function OrganizationWorkspace({ joined = false }: { joined?: boolean }) {
  const configured = isSupabaseConfigured();
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(
    joined ? "The organization invite was accepted successfully." : null,
  );
  const [memberships, setMemberships] = useState<OrganizationMembershipRecord[]>([]);
  const [members, setMembers] = useState<MemberDirectoryEntry[]>([]);
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
  const [workspaceSnapshots, setWorkspaceSnapshots] = useState<WorkspaceSnapshotRecord[]>([]);
  const [meetingMinuteRecords, setMeetingMinuteRecords] =
    useState<WorkspaceOwnedPayloadRecord<MeetingMinute>[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [activeOrgTab, setActiveOrgTab] = useState<OrganizationConsoleTab>("dashboard");
  const [complianceModalOpen, setComplianceModalOpen] = useState(false);
  const [actionModalOpen, setActionModalOpen] = useState(false);
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
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [freshInviteLink, setFreshInviteLink] = useState<string | null>(null);
  const [viewerUserId, setViewerUserId] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<MemberDirectoryEntry | null>(null);
  const [removeTransferTo, setRemoveTransferTo] = useState<string>("");
  // Drill-down modal mode (null = closed). Each mode renders the same filter row
  // and a metric-specific table with a live total at the bottom that updates as
  // the user filters inside the modal.
  const [drillMode, setDrillMode] = useState<
    "contract" | "paid" | "outstanding" | "delayed" | null
  >(null);
  const [portfolioMapOpen, setPortfolioMapOpen] = useState(false);
  const [portfolioFilters, setPortfolioFilters] = useState<PortfolioFilters>({
    userId: "",
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
  const selectedProjectIds = selectedProjects.map((project) => project.id);
  const selectedProjectMembers = projectMembers.filter(
    (membership) =>
      membership.organization_id === selectedOrganization?.id ||
      selectedProjectIds.includes(membership.project_id),
  );
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
          normalizeFilterValue(projectLocationLabel(project)) ===
            normalizeFilterValue(portfolioFilters.location);
        const matchesClient =
          !portfolioFilters.client ||
          normalizeFilterValue(project.client_name) === normalizeFilterValue(portfolioFilters.client);
        const matchesUser =
          !portfolioFilters.userId ||
          project.owner_id === portfolioFilters.userId ||
          selectedProjectMembers.some(
            (membership) =>
              membership.project_id === project.id && membership.user_id === portfolioFilters.userId,
          );

        return matchesUser && matchesProgram && matchesCategory && matchesLocation && matchesClient;
      }),
    [portfolioFilters, selectedProjectMembers, selectedProjects],
  );
  const activeMembers = selectedMembers.filter((membership) => membership.status === "active");
  const reservedSeats = selectedInvites.filter((invite) => invite.seat_reserved).length;
  const totalSeats = selectedSubscription?.seat_count ?? 1;
  const seatsUsed = activeMembers.length + reservedSeats;
  const seatsAvailable = Math.max(totalSeats - seatsUsed, 0);
  const selectedAccessState = getSubscriptionAccessState(selectedSubscription);
  const selectedSubscriptionUsable = isSubscriptionUsable(selectedSubscription);
  const selectedLocations = uniqueFilterValues(selectedProjects.map(projectLocationLabel));
  const selectedClients = uniqueFilterValues(selectedProjects.map((project) => project.client_name));
  const hasUnassignedProjects = selectedProjects.some((project) => !project.program_id);
  const hasUncategorizedProjects = selectedProjects.some((project) => !project.category_id && !project.category_name);
  const activeFilterCount = [
    portfolioFilters.userId,
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
    const filteredProjectIdSet = new Set(projectCards.map((item) => item.project.id));
    const checklistItems = workspaceSnapshots
      .flatMap((snapshot) => snapshot.payload.checklistItems)
      .filter((item) => filteredProjectIdSet.has(item.project_id));
    const overdueChecklistItems = checklistItems.filter(
      (item) => item.status === "pending" && isPastDate(item.dueDate),
    );
    const submittedChecklistItems = checklistItems.filter((item) => item.status === "submitted");
    const verifiedChecklistItems = checklistItems.filter((item) => item.status === "verified");
    const actionItems = getLiveMeetingActionItems(
      meetingMinuteRecords
        .map((record) => record.payload)
        .filter((minute) =>
          minute.actionGroups.some((group) => filteredProjectIdSet.has(group.project_id)),
        ),
    ).filter((action) => filteredProjectIdSet.has(action.project_id));
    const openActionItems = actionItems.filter((action) => action.status !== "closed");
    const overdueActionItems = openActionItems.filter((action) => isPastDate(action.deadline));
    const earned = projectCards.reduce((sum, item) => sum + item.progress.earned, 0);
    const certified = projectCards.reduce((sum, item) => sum + item.certifiedValue, 0);
    const financial = portfolioValue > 0 ? (certified / portfolioValue) * 100 : 0;
    const delayedProjects = projectCards.filter((item) => item.progress.variance < -5).length;

    return {
      projectCards,
      portfolioValue,
      planned,
      actual,
      variance: actual - planned,
      earned,
      certified,
      financial,
      delayedProjects,
      checklistItems,
      overdueChecklistItems,
      submittedChecklistItems,
      verifiedChecklistItems,
      actionItems,
      openActionItems,
      overdueActionItems,
      openActions: openActionItems.length,
      overdueActions: overdueActionItems.length,
    };
  }, [boqRecords, certificateRecords, filteredProjects, meetingMinuteRecords, progressRecords, workspaceSnapshots]);

  // Currency for portfolio-wide totals. Falls back gracefully when no projects
  // are loaded yet. Assumes the portfolio shares one display currency.
  const portfolioCurrency = useMemo(
    () =>
      filteredProjects[0]?.currency || selectedProjects[0]?.currency || "USD",
    [filteredProjects, selectedProjects],
  );

  // Per-mode portfolio totals, recomputed live whenever filters narrow the
  // project set. The drill modal reads from these so the bottom total always
  // matches the visible rows.
  const portfolioTotals = useMemo(() => {
    const cards = portfolio.projectCards;
    const contract = cards.reduce((sum, item) => sum + item.contractValue, 0);
    const paid = cards.reduce((sum, item) => sum + item.certifiedValue, 0);
    const outstanding = cards.reduce(
      (sum, item) => sum + Math.max(item.contractValue - item.certifiedValue, 0),
      0,
    );
    const delayed = cards.filter((item) => item.progress.variance < -5);
    return { contract, paid, outstanding, delayed };
  }, [portfolio.projectCards]);

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

      setViewerUserId(user.id);
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
        { data: subscriptionRows, error: subscriptionError },
        { data: memberRows, error: membersError },
        { data: inviteRows, error: invitesError },
        { data: programRows, error: programsError },
        { data: categoryRows, error: categoriesError },
        { data: projectRows, error: projectsError },
      ] = await Promise.all([
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
                "id, owner_id, organization_id, program_id, category_id, category_name, name, type, role, code, contract_number, client_name, contractor_name, consultant_name, location, region, town, latitude, longitude, contract_title, contract_amount, currency, start_date, end_date, created_at, updated_at",
              )
              .in("organization_id", allOrgIds)
              .order("updated_at", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (!active) return;

      const nextProjects = (projectRows ?? []) as ProjectRecord[];
      const projectIds = nextProjects.map((project) => project.id);
      const memberUserIds = Array.from(
        new Set(((memberRows ?? []) as MemberDirectoryEntry[]).map((member) => member.user_id)),
      );
      const [
        { data: projectMemberRows, error: projectMembersError },
        { data: boqRows, error: boqError },
        { data: progressRows, error: progressError },
        { data: certificateRows, error: certificateError },
        { data: snapshotRows, error: snapshotError },
        { data: meetingMinuteRows, error: meetingMinuteError },
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
        memberUserIds.length > 0
          ? supabase
              .from("construction_workspace_snapshots")
              .select("owner_id, payload, created_at, updated_at")
              .in("owner_id", memberUserIds)
          : Promise.resolve({ data: [], error: null }),
        memberUserIds.length > 0
          ? supabase
              .from("workspace_meeting_minutes")
              .select("id, owner_id, name, payload, created_at, updated_at")
              .in("owner_id", memberUserIds)
              .order("updated_at", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (!active) return;

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
      setWorkspaceSnapshots(
        ((snapshotRows ?? []) as Array<{
          owner_id: string;
          payload: Partial<ConstructionWorkspacePayload> | null;
          created_at?: string | null;
          updated_at?: string | null;
        }>).map((snapshot) => ({
          ...snapshot,
          payload: normalizeConstructionWorkspacePayload(snapshot.payload),
        })),
      );
      setMeetingMinuteRecords((meetingMinuteRows ?? []) as WorkspaceOwnedPayloadRecord<MeetingMinute>[]);

      if (!selectedOrgId || !allOrgIds.includes(selectedOrgId)) {
        setSelectedOrgId(manageableOrgIds[0] ?? allOrgIds[0] ?? null);
      }

      const firstError =
        membershipError ||
        subscriptionError ||
        membersError ||
        invitesError ||
        programsError ||
        categoriesError ||
        projectsError ||
        projectMembersError ||
        boqError ||
        progressError ||
        certificateError ||
        snapshotError ||
        meetingMinuteError;
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
                "id, owner_id, organization_id, program_id, category_id, category_name, name, type, role, code, contract_number, client_name, contractor_name, consultant_name, location, region, town, latitude, longitude, contract_title, contract_amount, currency, start_date, end_date, created_at, updated_at",
              )
              .in("organization_id", allOrgIds)
              .order("updated_at", { ascending: false })
          : Promise.resolve({ data: [] }),
      ]);

    const nextProjects = (projectRows ?? []) as ProjectRecord[];
    const projectIds = nextProjects.map((project) => project.id);
    const memberUserIds = Array.from(
      new Set(((memberRows ?? []) as MemberDirectoryEntry[]).map((member) => member.user_id)),
    );
    const [
      { data: projectMemberRows },
      { data: boqRows },
      { data: progressRows },
      { data: certificateRows },
      { data: snapshotRows },
      { data: meetingMinuteRows },
    ] =
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
        memberUserIds.length > 0
          ? supabase
              .from("construction_workspace_snapshots")
              .select("owner_id, payload, created_at, updated_at")
              .in("owner_id", memberUserIds)
          : Promise.resolve({ data: [] }),
        memberUserIds.length > 0
          ? supabase
              .from("workspace_meeting_minutes")
              .select("id, owner_id, name, payload, created_at, updated_at")
              .in("owner_id", memberUserIds)
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
    setWorkspaceSnapshots(
      ((snapshotRows ?? []) as Array<{
        owner_id: string;
        payload: Partial<ConstructionWorkspacePayload> | null;
        created_at?: string | null;
        updated_at?: string | null;
      }>).map((snapshot) => ({
        ...snapshot,
        payload: normalizeConstructionWorkspacePayload(snapshot.payload),
      })),
    );
    setMeetingMinuteRecords((meetingMinuteRows ?? []) as WorkspaceOwnedPayloadRecord<MeetingMinute>[]);
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
    setNotice("Organization workspace created. A platform admin can assign seats and activate access from Billing Ops.");
    await reloadData();
  };

  const handleInvite = async () => {
    if (!selectedOrganization) return;
    if (!selectedSubscriptionUsable) {
      setNotice("This organization does not have active access. A platform admin can activate or extend it from Billing Ops.");
      return;
    }
    if (seatsAvailable <= 0) {
      setNotice("No seats available. Ask a platform admin to increase the assigned seat count.");
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

  const handleSetMemberStatus = async (
    member: MemberDirectoryEntry,
    nextStatus: "active" | "suspended",
  ) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setNotice("Supabase environment variables are missing.");
      return;
    }
    if (!selectedOrganization) return;

    setBusyAction(`member-status:${member.user_id}`);
    setNotice(null);
    const { error } = await supabase.rpc("set_organization_member_status", {
      org_uuid: selectedOrganization.id,
      target_user: member.user_id,
      new_status: nextStatus,
    });

    if (error) {
      setBusyAction(null);
      setNotice(error.message);
      return;
    }

    setBusyAction(null);
    setNotice(
      nextStatus === "suspended"
        ? `${memberDisplayName(member)} was deactivated. Their seat is now available.`
        : `${memberDisplayName(member)} was reactivated.`,
    );
    await reloadData();
  };

  const openRemoveDialog = (member: MemberDirectoryEntry) => {
    setRemoveTarget(member);
    setRemoveTransferTo("");
  };

  const handleConfirmRemove = async () => {
    if (!removeTarget) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setNotice("Supabase environment variables are missing.");
      return;
    }
    if (!selectedOrganization) return;

    setBusyAction(`remove:${removeTarget.user_id}`);
    setNotice(null);
    const { error } = await supabase.rpc("remove_organization_member", {
      org_uuid: selectedOrganization.id,
      target_user: removeTarget.user_id,
      transfer_to: removeTransferTo || null,
    });

    if (error) {
      setBusyAction(null);
      setNotice(error.message);
      return;
    }

    const transferredName = removeTransferTo
      ? memberDisplayName(
          selectedMembers.find((entry) => entry.user_id === removeTransferTo) ?? null,
        )
      : null;
    setBusyAction(null);
    setRemoveTarget(null);
    setRemoveTransferTo("");
    setNotice(
      transferredName
        ? `Member removed and projects reassigned to ${transferredName}.`
        : "Member removed. Their seat is now available.",
    );
    await reloadData();
  };

  const organizationConsoleTabs: Array<{
    id: OrganizationConsoleTab;
    label: string;
    description: string;
    icon: typeof BarChart3;
  }> = [
    {
      id: "dashboard",
      label: "Dashboard",
      description: "Organization-wide project performance",
      icon: BarChart3,
    },
    {
      id: "team",
      label: "Team & Seats",
      description: "Assigned seats, members, and invites",
      icon: Users,
    },
    {
      id: "programs",
      label: "Programs",
      description: "Official program names for projects",
      icon: FolderKanban,
    },
    {
      id: "categories",
      label: "Categories",
      description: "Official sectors and asset categories",
      icon: Sparkles,
    },
  ];

  return (
    <div className="min-h-screen bg-bg px-6 py-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <a
              href="/workspace"
              className="inline-flex items-center gap-2 text-sm font-semibold text-txt-muted transition hover:text-txt"
            >
              <ArrowLeft size={16} />
              Back to workspace
            </a>
            <h1 className="mt-4 text-2xl font-semibold text-txt">
              Organization
            </h1>
          </div>

          <div className="flex flex-wrap justify-end gap-3">
            <Button
              variant="ghost"
              onClick={() => setCreateOrgOpen(true)}
              title="Create a shared organization workspace. You will become the organization owner and can invite teammates."
              aria-label="Create a shared organization workspace. You will become the organization owner and can invite teammates."
            >
              <Building2 size={15} /> New organization
            </Button>
            {selectedOrganization && canManageSelectedOrganization ? (
              <>
                {activeOrgTab === "programs" ? (
                <Button variant="ghost" onClick={openCreateProgram}>
                  <Plus size={15} /> Add program
                </Button>
                ) : null}
                {activeOrgTab === "categories" ? (
                <>
                <Button
                  variant="ghost"
                  onClick={handleSeedDefaultCategories}
                  disabled={busyAction === "seed-categories"}
                >
                  <Sparkles size={15} /> Add defaults
                </Button>
                <Button variant="ghost" onClick={openCreateCategory}>
                  <Plus size={15} /> Add category
                </Button>
                </>
                ) : null}
              </>
            ) : null}
            {selectedOrganization &&
            canManageRole(selectedMembership?.role || "viewer") &&
            activeOrgTab === "team" ? (
              <Button
                variant="primary"
                onClick={() => setInviteOpen(true)}
                disabled={!selectedSubscriptionUsable || seatsAvailable <= 0}
                title={
                  seatsAvailable <= 0
                    ? "No seats available. Ask a platform admin to increase the assigned seat count."
                    : undefined
                }
              >
                <MailPlus size={15} /> {seatsAvailable <= 0 ? "No seats available" : "Invite teammate"}
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
          <div className="mt-8 rounded-2xl border border-warn/30 bg-warn/10 p-6 text-sm text-warn">
            Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` before opening the
            organization console.
          </div>
        ) : loading ? (
          <div className="mt-8 rounded-2xl border border-border bg-bg-surface p-8 text-sm text-txt-muted">
            Loading...
          </div>
        ) : (
          <div className="mt-8 grid gap-6 lg:grid-cols-[300px,minmax(0,1fr)]">
            <section className="space-y-4">
              <div className="rounded-2xl border border-border bg-bg-surface p-5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">
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
                            <div className="font-semibold text-txt">{organization.name}</div>
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

              <div className="rounded-2xl border border-border bg-bg-surface p-3">
                <div className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">
                  Console
                </div>
                <div className="space-y-1">
                  {organizationConsoleTabs.map((tab) => {
                    const Icon = tab.icon;
                    const active = activeOrgTab === tab.id;

                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveOrgTab(tab.id)}
                        className={`w-full rounded-2xl border px-3 py-3 text-left transition ${
                          active
                            ? "border-accent/40 bg-accent/10 text-txt"
                            : "border-transparent text-txt-muted hover:border-border hover:bg-bg-raised hover:text-txt"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Icon size={16} className={active ? "text-accent" : "text-txt-dim"} />
                          <div>
                            <div className="text-sm font-semibold">{tab.label}</div>
                            <div className="mt-1 text-[11px] leading-4 text-txt-dim">{tab.description}</div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>

            <section className="space-y-6">
              {selectedOrganization ? (
                <>
                  {activeOrgTab === "team" ? (
                  <div className="grid gap-4 xl:grid-cols-2">
                    <div className="rounded-2xl border border-border bg-bg-surface p-5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                            <CreditCard size={15} />
                          </span>
                          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-txt-dim">
                            Current plan
                          </span>
                        </div>
                        <Badge color={subscriptionBadgeColor(selectedAccessState)}>
                          {subscriptionStateLabel(selectedAccessState).toUpperCase()}
                        </Badge>
                      </div>
                      <div className="mt-3 text-xl font-semibold capitalize tracking-tight text-txt">
                        {selectedSubscription
                          ? selectedSubscription.plan_code.replace(/-/g, " ")
                          : "No plan configured"}
                      </div>
                      <div className="mt-1 text-xs text-txt-dim">
                        Access expires: {formatSubscriptionExpiry(selectedSubscription)}
                      </div>
                      {!selectedSubscriptionUsable && (
                        <div className="mt-3 rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-xs leading-5 text-red-700">
                          Workspace access is paused.
                        </div>
                      )}
                    </div>

                    <div className="rounded-2xl border border-border bg-bg-surface p-5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                            <Users size={15} />
                          </span>
                          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-txt-dim">
                            Seats
                          </span>
                        </div>
                        <span className="text-[11px] tabular-nums text-txt-muted">
                          {Math.max(totalSeats - seatsUsed, 0)} available
                        </span>
                      </div>
                      <div className="mt-3 text-xl font-semibold tracking-tight text-txt">
                        {seatsUsed}
                        <span className="text-sm font-medium text-txt-muted"> of {totalSeats} used</span>
                      </div>
                      <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-black/5">
                        {totalSeats > 0 && activeMembers.length > 0 ? (
                          <div
                            className="bg-accent"
                            style={{ width: `${Math.min(100, (activeMembers.length / totalSeats) * 100)}%` }}
                          />
                        ) : null}
                        {totalSeats > 0 && reservedSeats > 0 ? (
                          <div
                            className="bg-warn"
                            style={{ width: `${Math.min(100, (reservedSeats / totalSeats) * 100)}%` }}
                          />
                        ) : null}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-txt-muted">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-accent" />
                          Active <span className="font-semibold tabular-nums text-txt">{activeMembers.length}</span>
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-warn" />
                          Reserved invites <span className="font-semibold tabular-nums text-txt">{reservedSeats}</span>
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-black/20" />
                          Available <span className="font-semibold tabular-nums text-txt">{Math.max(totalSeats - seatsUsed, 0)}</span>
                        </span>
                      </div>
                    </div>
                  </div>
                  ) : null}

                  {activeOrgTab === "dashboard" ? (
                  <div className="rounded-2xl border border-border bg-bg-surface p-6">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <h2 className="text-xl font-semibold text-txt">
                        Portfolio
                      </h2>
                      <Badge color={portfolio.variance >= 0 ? "ok" : "warn"}>
                        {portfolio.variance >= 0 ? "+" : ""}
                        {portfolio.variance.toFixed(1)}% variance
                      </Badge>
                    </div>

                    <div className="mt-5 rounded-2xl border border-border bg-bg-raised p-3.5">
                      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">
                          <Filter size={12} /> Filters
                        </span>
                        <span className="text-[11px] tabular-nums text-txt-muted">
                          Showing {filteredProjects.length} of {selectedProjects.length} projects
                        </span>
                      </div>
                      <div className="grid gap-2.5 md:grid-cols-3 xl:grid-cols-[1fr_1fr_1fr_1fr_1fr_auto]">
                        <label className="space-y-1.5">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">
                            User
                          </span>
                          <select
                            className="w-full rounded-lg border border-border bg-bg-input px-2.5 py-2 text-xs font-medium text-txt outline-none transition focus:border-accent"
                            value={portfolioFilters.userId}
                            onChange={(event) =>
                              setPortfolioFilters((prev) => ({ ...prev, userId: event.target.value }))
                            }
                          >
                            <option value="">All users</option>
                            {activeMembers.map((member) => (
                              <option key={member.user_id} value={member.user_id}>
                                {memberDisplayName(member)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="space-y-1.5">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">
                            Program
                          </span>
                          <select
                            className="w-full rounded-lg border border-border bg-bg-input px-2.5 py-2 text-xs font-medium text-txt outline-none transition focus:border-accent"
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
                        <label className="space-y-1.5">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">
                            Category
                          </span>
                          <select
                            className="w-full rounded-lg border border-border bg-bg-input px-2.5 py-2 text-xs font-medium text-txt outline-none transition focus:border-accent"
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
                        <label className="space-y-1.5">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">
                            Location
                          </span>
                          <select
                            className="w-full rounded-lg border border-border bg-bg-input px-2.5 py-2 text-xs font-medium text-txt outline-none transition focus:border-accent"
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
                        <label className="space-y-1.5">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">
                            Client
                          </span>
                          <select
                            className="w-full rounded-lg border border-border bg-bg-input px-2.5 py-2 text-xs font-medium text-txt outline-none transition focus:border-accent"
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
                              setPortfolioFilters({
                                userId: "",
                                programId: "",
                                categoryId: "",
                                location: "",
                                client: "",
                              })
                            }
                          >
                            <X size={14} /> Clear
                          </Button>
                        </div>
                      </div>
                      {activeFilterCount > 0 ? (
                      <div className="mt-2.5 flex flex-wrap gap-2 text-xs text-txt-muted">
                        {portfolioFilters.userId ? (
                          <span className="rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-accent">
                            User:{" "}
                            {memberDisplayName(
                              activeMembers.find((member) => member.user_id === portfolioFilters.userId),
                            )}
                          </span>
                        ) : null}
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
                      ) : null}
                    </div>

                    {/* Top KPI strip — 4 high-signal numbers, each clickable to
                        open a filtered drill-down table with a live total. */}
                    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <button
                        type="button"
                        onClick={() => setDrillMode("contract")}
                        className="rounded-2xl border border-border bg-bg-raised p-4 text-left transition hover:border-accent/60 hover:shadow-sm"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                            <DollarSign size={15} />
                          </span>
                          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-txt-dim">
                            Contract value
                          </span>
                        </div>
                        <div className="mt-2.5 text-xl font-semibold tracking-tight text-txt">
                          {formatCurrency(portfolioTotals.contract, portfolioCurrency)}
                        </div>
                        <div className="mt-0.5 text-xs text-txt-muted">
                          across {filteredProjects.length} project{filteredProjects.length === 1 ? "" : "s"}
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setDrillMode("paid")}
                        className="rounded-2xl border border-border bg-bg-raised p-4 text-left transition hover:border-ok/60 hover:shadow-sm"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ok/10 text-ok">
                            <CheckCircle2 size={15} />
                          </span>
                          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-txt-dim">
                            Paid to date
                          </span>
                        </div>
                        <div className="mt-2.5 text-xl font-semibold tracking-tight text-txt">
                          {formatCurrency(portfolioTotals.paid, portfolioCurrency)}
                        </div>
                        <div className="mt-0.5 text-xs text-txt-muted">
                          {portfolioTotals.contract > 0
                            ? `${((portfolioTotals.paid / portfolioTotals.contract) * 100).toFixed(1)}% of contract`
                            : "—"}
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setDrillMode("outstanding")}
                        className="rounded-2xl border border-border bg-bg-raised p-4 text-left transition hover:border-warn/60 hover:shadow-sm"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-warn/10 text-warn">
                            <Wallet size={15} />
                          </span>
                          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-txt-dim">
                            Outstanding
                          </span>
                        </div>
                        <div className="mt-2.5 text-xl font-semibold tracking-tight text-txt">
                          {formatCurrency(portfolioTotals.outstanding, portfolioCurrency)}
                        </div>
                        <div className="mt-0.5 text-xs text-txt-muted">
                          {portfolioTotals.contract > 0
                            ? `${((portfolioTotals.outstanding / portfolioTotals.contract) * 100).toFixed(1)}% remaining`
                            : "—"}
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setDrillMode("delayed")}
                        className={`rounded-2xl border bg-bg-raised p-4 text-left transition hover:shadow-sm ${
                          portfolioTotals.delayed.length > 0
                            ? "border-err/40 hover:border-err"
                            : "border-border hover:border-ok/60"
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                              portfolioTotals.delayed.length > 0 ? "bg-err/10 text-err" : "bg-ok/10 text-ok"
                            }`}
                          >
                            <AlertTriangle size={15} />
                          </span>
                          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-txt-dim">
                            Delayed projects
                          </span>
                        </div>
                        <div
                          className={`mt-2.5 text-xl font-semibold tracking-tight ${
                            portfolioTotals.delayed.length > 0 ? "text-err" : "text-txt"
                          }`}
                        >
                          {portfolioTotals.delayed.length}
                        </div>
                        <div className="mt-0.5 text-xs text-txt-muted">
                          actual &lt; planned by more than 5%
                        </div>
                      </button>
                    </div>

                    {/* Plan vs Actual beside the two register KPIs — one compact row. */}
                    <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-[1.6fr_1fr_1fr]">
                      <div className="rounded-2xl border border-border bg-bg-raised p-4 sm:col-span-2 xl:col-span-1">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                            <TrendingUp size={15} />
                          </span>
                          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-txt-dim">
                            Plan vs Actual
                          </span>
                        </div>
                        <div className="mt-3 space-y-2.5">
                          <div>
                            <div className="mb-1 flex items-center justify-between text-[11px] text-txt-muted">
                              <span>Planned</span>
                              <span className="font-mono tabular-nums text-txt">{portfolio.planned.toFixed(1)}%</span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-black/5">
                              <div
                                className="h-full rounded-full transition-[width] duration-300"
                                style={{
                                  width: `${Math.min(Math.max(portfolio.planned, 0), 100)}%`,
                                  background: "linear-gradient(90deg, #3b82f6 0%, rgba(59, 130, 246, 0.45) 100%)",
                                }}
                              />
                            </div>
                          </div>
                          <div>
                            <div className="mb-1 flex items-center justify-between text-[11px] text-txt-muted">
                              <span>Actual</span>
                              <span
                                className={`font-mono tabular-nums ${
                                  portfolio.variance >= -0.5 ? "text-ok" : "text-warn"
                                }`}
                              >
                                {portfolio.actual.toFixed(1)}%
                              </span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-black/5">
                              <div
                                className="h-full rounded-full transition-[width] duration-300"
                                style={{
                                  width: `${Math.min(Math.max(portfolio.actual, 0), 100)}%`,
                                  background:
                                    portfolio.variance >= -0.5
                                      ? "linear-gradient(90deg, #22c55e 0%, rgba(34, 197, 94, 0.45) 100%)"
                                      : "linear-gradient(90deg, #f59e0b 0%, rgba(245, 158, 11, 0.45) 100%)",
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setComplianceModalOpen(true)}
                        className="rounded-2xl border border-border bg-bg-raised p-4 text-left transition hover:border-accent/60 hover:shadow-sm"
                      >
                        <div className="flex items-center gap-2.5">
                          <span
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                              portfolio.overdueChecklistItems.length > 0 ? "bg-err/10 text-err" : "bg-ok/10 text-ok"
                            }`}
                          >
                            <ClipboardCheck size={15} />
                          </span>
                          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-txt-dim">
                            Checklist
                          </span>
                        </div>
                        <div
                          className={`mt-2.5 text-xl font-semibold tracking-tight ${
                            portfolio.overdueChecklistItems.length > 0 ? "text-err" : "text-txt"
                          }`}
                        >
                          {portfolio.overdueChecklistItems.length}
                        </div>
                        <div className="mt-0.5 text-xs text-txt-muted">
                          overdue from {portfolio.checklistItems.length} required
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setActionModalOpen(true)}
                        className="rounded-2xl border border-border bg-bg-raised p-4 text-left transition hover:border-accent/60 hover:shadow-sm"
                      >
                        <div className="flex items-center gap-2.5">
                          <span
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                              portfolio.overdueActions > 0 ? "bg-err/10 text-err" : "bg-ok/10 text-ok"
                            }`}
                          >
                            <CheckCircle2 size={15} />
                          </span>
                          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-txt-dim">
                            Action points
                          </span>
                        </div>
                        <div
                          className={`mt-2.5 text-xl font-semibold tracking-tight ${
                            portfolio.overdueActions > 0 ? "text-err" : "text-txt"
                          }`}
                        >
                          {portfolio.overdueActions}
                        </div>
                        <div className="mt-0.5 text-xs text-txt-muted">
                          overdue from {portfolio.openActions} open
                        </div>
                      </button>
                    </div>

                    {/* Map collapsed by default — keep status check uncluttered. */}
                    <div className="mt-4">
                      <button
                        type="button"
                        onClick={() => setPortfolioMapOpen((open) => !open)}
                        className="inline-flex items-center gap-2 rounded-lg border border-border bg-bg-raised px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-txt-dim transition hover:border-accent/60 hover:text-txt"
                      >
                        <MapPin size={14} />
                        {portfolioMapOpen ? "Hide" : "Show"} portfolio map
                        {portfolioMapOpen ? (
                          <ChevronUp size={14} />
                        ) : (
                          <ChevronDown size={14} />
                        )}
                      </button>
                      {portfolioMapOpen ? (
                        <OrganizationMapCard cards={portfolio.projectCards} />
                      ) : null}
                    </div>

                    <div className="mt-4 overflow-hidden rounded-2xl border border-border">
                      <div className="space-y-3 p-3 lg:hidden">
                        {portfolio.projectCards.length === 0 ? (
                          <div className="rounded-2xl border border-border bg-bg-raised/50 px-4 py-6 text-sm text-txt-muted">
                            No organization projects yet. Once employees create or are assigned to
                            projects, this portfolio dashboard will aggregate their progress here.
                          </div>
                        ) : (
                          portfolio.projectCards.slice(0, 8).map((item) => (
                            <div key={`${item.project.id}-compact`} className="rounded-2xl border border-border bg-bg-raised/50 p-4">
                              <div className="text-sm font-semibold text-txt">{item.project.name}</div>
                              <div className="mt-1 text-xs text-txt-muted">
                                {programLabel(selectedPrograms, item.project.program_id)} · {categoryLabel(selectedCategories, item.project.category_id, item.project.category_name)} · {item.project.code || item.project.role} · {item.project.type}
                              </div>
                              <div className="mt-2 text-xs text-txt-dim">
                                Responsible: {projectResponsibleName(item.project, selectedMembers, selectedProjectMembers)}
                              </div>
                              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                                <div className="rounded-xl border border-border bg-bg-surface p-3">
                                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">Value</div>
                                  <div className="mt-1 font-mono font-bold text-txt">
                                    {formatCurrency(item.commercialValue, item.project.currency || selectedProjects[0]?.currency || "USD")}
                                  </div>
                                </div>
                                <div className="rounded-xl border border-border bg-bg-surface p-3">
                                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">Physical</div>
                                  <div className={`mt-1 font-mono font-bold ${item.progress.variance >= -5 ? "text-ok" : "text-warn"}`}>
                                    {item.progress.actual.toFixed(1)}%
                                  </div>
                                  <div className="text-[11px] text-txt-dim">plan {item.progress.planned.toFixed(1)}%</div>
                                </div>
                                <div className="rounded-xl border border-border bg-bg-surface p-3">
                                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">Earned</div>
                                  <div className="mt-1 font-mono font-bold text-txt">
                                    {formatCurrency(item.progress.earned, item.project.currency || selectedProjects[0]?.currency || "USD")}
                                  </div>
                                </div>
                                <div className="rounded-xl border border-border bg-bg-surface p-3">
                                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">Updated</div>
                                  <div className="mt-1 text-xs font-semibold text-txt">{formatDate(item.updatedAt)}</div>
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                      <div className="hidden lg:block">
                      <div className="grid grid-cols-[minmax(220px,1.4fr)_140px_140px_105px_95px_105px_105px] bg-bg-raised px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">
                        <div>Project</div>
                        <div>Responsible</div>
                        <div>Program / category</div>
                        <div className="text-right">Value</div>
                        <div className="text-right">Physical</div>
                        <div className="text-right">Financial</div>
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
                            className="grid grid-cols-[minmax(220px,1.4fr)_140px_140px_105px_95px_105px_105px] items-center border-t border-border px-4 py-3 text-sm"
                          >
                            <div>
                              <div className="font-semibold text-txt">{item.project.name}</div>
                              <div className="mt-1 text-xs text-txt-muted">
                                {item.project.code || item.project.role} · {item.project.location || "No location"}
                              </div>
                            </div>
                            <div className="text-sm text-txt-muted">
                              {projectResponsibleName(item.project, selectedMembers, selectedProjectMembers)}
                            </div>
                            <div className="text-xs text-txt-muted">
                              <div className="font-semibold text-txt">
                                {programLabel(selectedPrograms, item.project.program_id)}
                              </div>
                              <div className="mt-1">
                                {categoryLabel(selectedCategories, item.project.category_id, item.project.category_name)}
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
                              {item.commercialValue > 0
                                ? `${((item.certifiedValue / item.commercialValue) * 100).toFixed(1)}%`
                                : "0.0%"}
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
                  ) : null}

                  {activeOrgTab === "programs" ? (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h2 className="text-xl font-semibold text-txt">Programs</h2>
                      {!canManageSelectedOrganization ? <Badge color="warn">READ ONLY</Badge> : null}
                    </div>

                    {selectedPrograms.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-border bg-bg-surface px-5 py-8 text-sm text-txt-muted">
                        No programs yet.
                      </div>
                    ) : (
                    <div className="data-table-shell">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Program</th>
                            <th>Client / location</th>
                            <th>Dates</th>
                            <th>Budget</th>
                            <th>Linked</th>
                            <th>Status</th>
                            {canManageSelectedOrganization ? <th aria-label="Actions" /> : null}
                          </tr>
                        </thead>
                        <tbody>
                          {selectedPrograms.map((program) => {
                            const usageCount = programUsageCounts.get(program.id) ?? 0;
                            const archived = program.status !== "active";

                            return (
                              <tr key={program.id} className={archived ? "opacity-70" : undefined}>
                                <td className="data-cell-wrap">
                                  <div className="font-semibold text-txt">
                                    {program.code ? `${program.code} - ${program.name}` : program.name}
                                  </div>
                                  {program.description ? (
                                    <div className="mt-1 text-xs text-txt-dim">{program.description}</div>
                                  ) : null}
                                </td>
                                <td className="data-cell-wrap text-txt-muted">
                                  {[program.client_name, program.location].filter(Boolean).join(" · ") || "—"}
                                </td>
                                <td className="data-cell-wrap text-txt-muted">
                                  {formatDate(program.start_date)} - {formatDate(program.end_date)}
                                </td>
                                <td className="data-cell-wrap text-txt-muted">
                                  {program.budget_amount ? `${program.budget_amount} ${program.currency || "USD"}` : "—"}
                                </td>
                                <td className="data-cell-num">{usageCount}</td>
                                <td>
                                  <Badge color={archived ? "warn" : "ok"}>
                                    {program.status.toUpperCase()}
                                  </Badge>
                                </td>
                                {canManageSelectedOrganization ? (
                                  <td>
                                    <div className="flex flex-wrap justify-end gap-2">
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
                                        <Trash2 size={13} />
                                      </Button>
                                    </div>
                                  </td>
                                ) : null}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    )}
                  </div>
                  ) : null}

                  {activeOrgTab === "categories" ? (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h2 className="text-xl font-semibold text-txt">Categories</h2>
                      {!canManageSelectedOrganization ? <Badge color="warn">READ ONLY</Badge> : null}
                    </div>

                    {selectedCategories.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-border bg-bg-surface px-5 py-8 text-sm text-txt-muted">
                        No categories yet.
                      </div>
                    ) : (
                    <div className="data-table-shell">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th style={{ width: 28 }} aria-label="" />
                            <th>Category</th>
                            <th>Description</th>
                            <th>Linked</th>
                            <th>Status</th>
                            {canManageSelectedOrganization ? <th aria-label="Actions" /> : null}
                          </tr>
                        </thead>
                        <tbody>
                          {selectedCategories.map((category) => {
                            const usageCount = categoryUsageCounts.get(category.id) ?? 0;
                            const archived = category.status !== "active";

                            return (
                              <tr key={category.id} className={archived ? "opacity-70" : undefined}>
                                <td>
                                  <span
                                    className="inline-block h-3 w-3 rounded-full border border-border"
                                    style={{ backgroundColor: category.color || "#3b82f6" }}
                                  />
                                </td>
                                <td className="data-cell-wrap font-semibold text-txt">
                                  {category.code ? `${category.code} - ${category.name}` : category.name}
                                </td>
                                <td className="data-cell-wrap text-txt-muted">
                                  {category.description || "—"}
                                </td>
                                <td className="data-cell-num">{usageCount}</td>
                                <td>
                                  <Badge color={archived ? "warn" : "ok"}>{category.status.toUpperCase()}</Badge>
                                </td>
                                {canManageSelectedOrganization ? (
                                  <td>
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
                                        <Trash2 size={13} />
                                      </Button>
                                    </div>
                                  </td>
                                ) : null}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    )}
                  </div>
                  ) : null}

                  {activeOrgTab === "team" ? (
                  <>
                  {/* Full-width stack: the members table carries up to 8 columns and
                      letter-wraps when squeezed into a half-width column. */}
                  <div className="grid gap-6">
                    <div className="rounded-2xl border border-border bg-bg-surface p-6">
                      <div className="flex items-center justify-between gap-3">
                        <h2 className="text-xl font-semibold text-txt">Members</h2>
                        <Badge color="ok">{activeMembers.length} active</Badge>
                      </div>

                      <div className="mt-5">
                        {selectedMembers.length === 0 ? (
                          <div className="rounded-2xl border border-dashed border-border px-4 py-5 text-sm text-txt-muted">
                            No members yet.
                          </div>
                        ) : (
                          <>
                            {/* Mobile: stacked cards so actions stay reachable. */}
                            <div className="space-y-3 sm:hidden">
                              {selectedMembers.map((member) => {
                                const assigned = memberUsage.assignedCounts.get(member.user_id) ?? 0;
                                const created = memberUsage.createdCounts.get(member.user_id) ?? 0;
                                const isSelf = member.user_id === viewerUserId;
                                const isSuspended = member.status === "suspended";
                                const statusBusy =
                                  busyAction === `member-status:${member.user_id}` ||
                                  busyAction === `remove:${member.user_id}`;
                                return (
                                  <div
                                    key={member.id}
                                    className="rounded-2xl border border-border bg-bg-raised p-4 space-y-3"
                                  >
                                    <div className="flex flex-wrap items-start justify-between gap-2">
                                      <div>
                                        <div className="font-semibold text-txt">
                                          {member.profiles?.full_name || member.profiles?.email || "User"}
                                        </div>
                                        {member.profiles?.email ? (
                                          <div className="text-xs text-txt-muted">{member.profiles.email}</div>
                                        ) : null}
                                      </div>
                                      <div className="flex flex-wrap items-center gap-1.5">
                                        <Badge color={roleBadgeColor(member.role)}>
                                          {member.role.toUpperCase()}
                                        </Badge>
                                        <Badge color={isSuspended ? "warn" : "ok"}>
                                          {member.status.toUpperCase()}
                                        </Badge>
                                      </div>
                                    </div>

                                    <div className="grid grid-cols-3 gap-2 text-xs">
                                      <div>
                                        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-txt-dim">Joined</div>
                                        <div className="text-txt">{formatDate(member.joined_at)}</div>
                                      </div>
                                      <div>
                                        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-txt-dim">Assigned</div>
                                        <div className="font-mono tabular-nums text-txt">{assigned}</div>
                                      </div>
                                      <div>
                                        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-txt-dim">Created</div>
                                        <div className="font-mono tabular-nums text-txt">{created}</div>
                                      </div>
                                    </div>

                                    {canManageSelectedOrganization ? (
                                      isSelf ? (
                                        <div className="text-xs text-txt-dim">This is you.</div>
                                      ) : (
                                        <div className="flex flex-wrap gap-2">
                                          {isSuspended ? (
                                            <Button
                                              variant="success"
                                              size="sm"
                                              disabled={statusBusy}
                                              onClick={() => handleSetMemberStatus(member, "active")}
                                            >
                                              <CheckCircle2 size={13} /> Reactivate
                                            </Button>
                                          ) : (
                                            <Button
                                              variant="warning"
                                              size="sm"
                                              disabled={statusBusy}
                                              onClick={() => handleSetMemberStatus(member, "suspended")}
                                            >
                                              <X size={13} /> Deactivate
                                            </Button>
                                          )}
                                          <Button
                                            variant="danger"
                                            size="sm"
                                            disabled={statusBusy}
                                            onClick={() => openRemoveDialog(member)}
                                          >
                                            <Trash2 size={13} /> Remove
                                          </Button>
                                        </div>
                                      )
                                    ) : null}
                                  </div>
                                );
                              })}
                            </div>

                            {/* Desktop: tabular layout. */}
                            <div className="hidden data-table-shell sm:block">
                              <table className="data-table">
                                <thead>
                                  <tr>
                                    <th>Name</th>
                                    <th>Email</th>
                                    <th>Role</th>
                                    <th>Joined</th>
                                    <th>Status</th>
                                    <th>Assigned</th>
                                    <th>Created</th>
                                    {canManageSelectedOrganization ? (
                                      <th aria-label="Actions" />
                                    ) : null}
                                  </tr>
                                </thead>
                                <tbody>
                                  {selectedMembers.map((member) => {
                                    const assigned = memberUsage.assignedCounts.get(member.user_id) ?? 0;
                                    const created = memberUsage.createdCounts.get(member.user_id) ?? 0;
                                    const isSelf = member.user_id === viewerUserId;
                                    const isSuspended = member.status === "suspended";
                                    const statusBusy =
                                      busyAction === `member-status:${member.user_id}` ||
                                      busyAction === `remove:${member.user_id}`;
                                    return (
                                      <tr key={member.id}>
                                        <td className="font-semibold text-txt">
                                          <span
                                            className="block max-w-[240px] truncate"
                                            title={member.profiles?.full_name || member.profiles?.email || "User"}
                                          >
                                            {member.profiles?.full_name || member.profiles?.email || "User"}
                                          </span>
                                        </td>
                                        <td className="text-txt-muted">
                                          <span className="block max-w-[240px] truncate" title={member.profiles?.email || undefined}>
                                            {member.profiles?.email || "—"}
                                          </span>
                                        </td>
                                        <td>
                                          <Badge color={roleBadgeColor(member.role)}>
                                            {member.role.toUpperCase()}
                                          </Badge>
                                        </td>
                                        <td className="whitespace-nowrap text-txt-muted">{formatDate(member.joined_at)}</td>
                                        <td>
                                          <Badge color={isSuspended ? "warn" : "ok"}>
                                            {member.status.toUpperCase()}
                                          </Badge>
                                        </td>
                                        <td className="data-cell-num">{assigned}</td>
                                        <td className="data-cell-num">{created}</td>
                                        {canManageSelectedOrganization ? (
                                          <td>
                                            {isSelf ? (
                                              <span className="text-xs text-txt-dim">You</span>
                                            ) : (
                                              <div className="flex flex-wrap justify-end gap-2">
                                                {isSuspended ? (
                                                  <Button
                                                    variant="success"
                                                    size="sm"
                                                    disabled={statusBusy}
                                                    onClick={() => handleSetMemberStatus(member, "active")}
                                                  >
                                                    <CheckCircle2 size={13} /> Reactivate
                                                  </Button>
                                                ) : (
                                                  <Button
                                                    variant="warning"
                                                    size="sm"
                                                    disabled={statusBusy}
                                                    onClick={() => handleSetMemberStatus(member, "suspended")}
                                                  >
                                                    <X size={13} /> Deactivate
                                                  </Button>
                                                )}
                                                <Button
                                                  variant="danger"
                                                  size="sm"
                                                  disabled={statusBusy}
                                                  onClick={() => openRemoveDialog(member)}
                                                >
                                                  <Trash2 size={13} /> Remove
                                                </Button>
                                              </div>
                                            )}
                                          </td>
                                        ) : null}
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-border bg-bg-surface p-6">
                      <div className="flex items-center justify-between gap-3">
                        <h2 className="text-xl font-semibold text-txt">Pending invites</h2>
                        <Badge color="accent">{selectedInvites.length} pending</Badge>
                      </div>

                      <div className="mt-5">
                        {selectedInvites.length === 0 ? (
                          <div className="rounded-2xl border border-dashed border-border px-4 py-5 text-sm text-txt-muted">
                            No pending invites.
                          </div>
                        ) : (
                          <div className="data-table-shell">
                            <table className="data-table">
                              <thead>
                                <tr>
                                  <th>Name</th>
                                  <th>Email</th>
                                  <th>Role</th>
                                  <th>Delivery</th>
                                  <th>Expires</th>
                                  <th aria-label="Actions" />
                                </tr>
                              </thead>
                              <tbody>
                                {selectedInvites.map((invite) => (
                                  <tr key={invite.id}>
                                    <td className="font-semibold text-txt">
                                      <span className="block max-w-[240px] truncate" title={invite.full_name || invite.email}>
                                        {invite.full_name || invite.email}
                                      </span>
                                    </td>
                                    <td className="text-txt-muted">
                                      <span className="block max-w-[240px] truncate" title={invite.email}>
                                        {invite.email}
                                      </span>
                                    </td>
                                    <td>
                                      <Badge color={roleBadgeColor(invite.role)}>
                                        {invite.role.toUpperCase()}
                                      </Badge>
                                    </td>
                                    <td className="text-txt-muted">{invite.delivery_method}</td>
                                    <td className="whitespace-nowrap text-txt-muted">{formatDate(invite.expires_at)}</td>
                                    <td>
                                      <div className="flex flex-wrap justify-end gap-2">
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
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {freshInviteLink ? (
                    <div className="rounded-2xl border border-ok/30 bg-ok/10 p-6">
                      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-ok">
                        <Link2 size={14} />
                        Fresh invite link
                      </div>
                      <div className="mt-4 rounded-lg border border-border bg-bg-surface px-4 py-3 font-mono text-xs text-txt">
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
                  ) : null}
                </>
              ) : (
                <div className="rounded-2xl border border-border bg-bg-surface p-6 text-sm text-txt-muted">
                  No organization memberships yet. Create one to start.
                </div>
              )}
            </section>
          </div>
        )}
      </div>

      <Modal
        open={complianceModalOpen}
        onClose={() => setComplianceModalOpen(false)}
        title="Checklist Compliance"
        width={980}
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <MiniMetric label="Required" value={String(portfolio.checklistItems.length)} />
            <MiniMetric label="Overdue" value={String(portfolio.overdueChecklistItems.length)} />
            <MiniMetric label="Submitted" value={String(portfolio.submittedChecklistItems.length)} />
            <MiniMetric label="Verified" value={String(portfolio.verifiedChecklistItems.length)} />
          </div>

          {portfolio.checklistItems.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-bg-raised px-5 py-8 text-sm text-txt-muted">
              No checklist items were found for the current organization dashboard filter.
            </div>
          ) : (
            <>
              <div className="hidden overflow-hidden rounded-2xl border border-border lg:block">
                <div className="grid grid-cols-[1.35fr_1fr_120px_130px_120px] bg-bg-raised px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">
                  <div>Item</div>
                  <div>Project</div>
                  <div>Status</div>
                  <div>Due / expiry</div>
                  <div>Responsible</div>
                </div>
                {portfolio.checklistItems.map((item) => {
                  const project = selectedProjects.find((entry) => entry.id === item.project_id);
                  return (
                    <div
                      key={item.id}
                      className="grid grid-cols-[1.35fr_1fr_120px_130px_120px] items-center border-t border-border px-4 py-3 text-sm"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-txt">{item.title}</div>
                        {item.documentUrl ? (
                          <a
                            href={item.documentUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 inline-flex text-xs font-semibold text-accent hover:underline"
                          >
                            Open document
                          </a>
                        ) : null}
                      </div>
                      <div className="truncate text-txt-muted">{project?.name || "Unknown project"}</div>
                      <div>
                        <Badge color={checklistStatusColor(item.status)}>{item.status.toUpperCase()}</Badge>
                      </div>
                      <div className={item.status === "pending" && isPastDate(item.dueDate) ? "font-semibold text-err" : "text-txt-muted"}>
                        {formatDate(item.dueDate)}
                      </div>
                      <div className="truncate text-txt-muted">{item.responsiblePerson || "Unassigned"}</div>
                    </div>
                  );
                })}
              </div>

              <div className="space-y-3 lg:hidden">
                {portfolio.checklistItems.map((item) => {
                  const project = selectedProjects.find((entry) => entry.id === item.project_id);
                  return (
                    <div key={`${item.id}-card`} className="rounded-2xl border border-border bg-bg-raised p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold text-txt">{item.title}</div>
                          <div className="mt-1 text-xs text-txt-muted">{project?.name || "Unknown project"}</div>
                        </div>
                        <Badge color={checklistStatusColor(item.status)}>{item.status.toUpperCase()}</Badge>
                      </div>
                      <div className="mt-3 grid gap-2 text-xs text-txt-muted sm:grid-cols-2">
                        <div>Due: {formatDate(item.dueDate)}</div>
                        <div>Responsible: {item.responsiblePerson || "Unassigned"}</div>
                      </div>
                      {item.documentUrl ? (
                        <a
                          href={item.documentUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-3 inline-flex text-xs font-semibold text-accent hover:underline"
                        >
                          Open document
                        </a>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </Modal>

      <Modal
        open={actionModalOpen}
        onClose={() => setActionModalOpen(false)}
        title="Organization Action Points"
        width={980}
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <MiniMetric label="Open" value={String(portfolio.openActionItems.length)} />
            <MiniMetric label="Overdue" value={String(portfolio.overdueActionItems.length)} />
            <MiniMetric label="Total tracked" value={String(portfolio.actionItems.length)} />
          </div>

          {portfolio.actionItems.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-bg-raised px-5 py-8 text-sm text-txt-muted">
              No meeting action points were found for the current organization dashboard filter.
            </div>
          ) : (
            <>
              <div className="hidden overflow-hidden rounded-2xl border border-border lg:block">
                <div className="grid grid-cols-[1.4fr_1fr_130px_120px_1fr] bg-bg-raised px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">
                  <div>Action item</div>
                  <div>Project</div>
                  <div>Responsible</div>
                  <div>Deadline</div>
                  <div>Meeting</div>
                </div>
                {portfolio.actionItems.map((item) => {
                  const project = selectedProjects.find((entry) => entry.id === item.project_id);
                  return (
                    <div
                      key={`${item.meetingMinuteId}-${item.id}`}
                      className="grid grid-cols-[1.4fr_1fr_130px_120px_1fr] items-start border-t border-border px-4 py-3 text-sm"
                    >
                      <div>
                        <div className="font-semibold text-txt">{item.description}</div>
                        <div className="mt-1">
                          <Badge color={actionStatusColor(item.status)}>{item.status.toUpperCase()}</Badge>
                        </div>
                      </div>
                      <div className="text-txt-muted">{project?.name || "Unknown project"}</div>
                      <div className="text-txt-muted">{item.responsiblePerson || "Unassigned"}</div>
                      <div className={item.status !== "closed" && isPastDate(item.deadline) ? "font-semibold text-err" : "text-txt-muted"}>
                        {formatDate(item.deadline)}
                      </div>
                      <div className="text-txt-muted">
                        <div>{item.meetingTitle}</div>
                        <div className="mt-1 text-xs text-txt-dim">{formatDate(item.meetingDate)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="space-y-3 lg:hidden">
                {portfolio.actionItems.map((item) => {
                  const project = selectedProjects.find((entry) => entry.id === item.project_id);
                  return (
                    <div key={`${item.meetingMinuteId}-${item.id}-card`} className="rounded-2xl border border-border bg-bg-raised p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="font-semibold text-txt">{item.description}</div>
                        <Badge color={actionStatusColor(item.status)}>{item.status.toUpperCase()}</Badge>
                      </div>
                      <div className="mt-3 grid gap-2 text-xs text-txt-muted sm:grid-cols-2">
                        <div>Project: {project?.name || "Unknown project"}</div>
                        <div>Responsible: {item.responsiblePerson || "Unassigned"}</div>
                        <div>Deadline: {formatDate(item.deadline)}</div>
                        <div>Meeting: {item.meetingTitle}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </Modal>

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

      <Modal
        open={!!removeTarget}
        onClose={() => {
          if (busyAction?.startsWith("remove:")) return;
          setRemoveTarget(null);
          setRemoveTransferTo("");
        }}
        title="Remove member"
        width={480}
      >
        {removeTarget ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-warn/30 bg-warn/10 px-4 py-3 text-sm text-txt">
              You are removing <strong>{memberDisplayName(removeTarget)}</strong> from{" "}
              <strong>{selectedOrganization?.name}</strong>. Their seat will be released.
            </div>

            <div>
              <label className="label">Transfer their projects to (optional)</label>
              <select
                className="input"
                value={removeTransferTo}
                onChange={(event) => setRemoveTransferTo(event.target.value)}
              >
                <option value="">Keep ownership unchanged</option>
                {selectedMembers
                  .filter(
                    (entry) =>
                      entry.user_id !== removeTarget.user_id && entry.status === "active",
                  )
                  .map((entry) => (
                    <option key={entry.user_id} value={entry.user_id}>
                      {memberDisplayName(entry)}
                      {entry.profiles?.email ? ` · ${entry.profiles.email}` : ""}
                    </option>
                  ))}
              </select>
              <p className="mt-1.5 text-xs text-txt-muted">
                Reassigns projects, programs, and categories owned by this user inside the
                organization. Recommended when an employee leaves so the work is retained.
              </p>
            </div>

            <div className="flex justify-end gap-3">
              <Button
                variant="ghost"
                onClick={() => {
                  setRemoveTarget(null);
                  setRemoveTransferTo("");
                }}
                disabled={busyAction === `remove:${removeTarget.user_id}`}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={handleConfirmRemove}
                disabled={busyAction === `remove:${removeTarget.user_id}`}
              >
                {busyAction === `remove:${removeTarget.user_id}`
                  ? "Removing..."
                  : removeTransferTo
                    ? "Transfer & Remove"
                    : "Remove member"}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* Portfolio drill-down modal — one component, four modes. Title and table
          columns vary by mode; filters are shared with the dashboard so the
          bottom total updates live as the user narrows the set. */}
      <Modal
        open={drillMode !== null}
        onClose={() => setDrillMode(null)}
        title={
          drillMode === "contract"
            ? `Contract value — ${formatCurrency(portfolioTotals.contract, portfolioCurrency)}`
            : drillMode === "paid"
              ? `Paid to date — ${formatCurrency(portfolioTotals.paid, portfolioCurrency)}`
              : drillMode === "outstanding"
                ? `Outstanding — ${formatCurrency(portfolioTotals.outstanding, portfolioCurrency)}`
                : drillMode === "delayed"
                  ? `Delayed projects — ${portfolioTotals.delayed.length}`
                  : ""
        }
        width={1000}
      >
        {drillMode ? (() => {
          const visibleCards =
            drillMode === "delayed" ? portfolioTotals.delayed : portfolio.projectCards;
          const headers =
            drillMode === "contract"
              ? ["Project", "Program", "Contract value", "% of total"]
              : drillMode === "paid"
                ? ["Project", "Program", "Contract", "Paid", "% paid"]
                : drillMode === "outstanding"
                  ? ["Project", "Program", "Contract", "Paid", "Outstanding", "% remaining"]
                  : ["Project", "Due date", "Planned", "Actual", "Variance"];
          const totalLine =
            drillMode === "contract"
              ? `Total contract: ${formatCurrency(portfolioTotals.contract, portfolioCurrency)}`
              : drillMode === "paid"
                ? `Total paid: ${formatCurrency(portfolioTotals.paid, portfolioCurrency)}${
                    portfolioTotals.contract > 0
                      ? ` (${((portfolioTotals.paid / portfolioTotals.contract) * 100).toFixed(1)}% of contract)`
                      : ""
                  }`
                : drillMode === "outstanding"
                  ? `Total outstanding: ${formatCurrency(portfolioTotals.outstanding, portfolioCurrency)}`
                  : `${portfolioTotals.delayed.length} project${
                      portfolioTotals.delayed.length === 1 ? "" : "s"
                    } delayed`;
          return (
            <div className="space-y-4">
              {/* Compact filter row, same state as the dashboard so changes flow both ways. */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <label className="space-y-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">
                    Program
                  </span>
                  <select
                    className="input"
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
                      <option value="__unassigned__">Unassigned</option>
                    ) : null}
                  </select>
                </label>
                <label className="space-y-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">
                    Category
                  </span>
                  <select
                    className="input"
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
                      <option value="__uncategorized__">Uncategorized</option>
                    ) : null}
                  </select>
                </label>
                <label className="space-y-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">
                    Client
                  </span>
                  <select
                    className="input"
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
                <label className="space-y-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">
                    Location
                  </span>
                  <select
                    className="input"
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
                <label className="space-y-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-dim">
                    User
                  </span>
                  <select
                    className="input"
                    value={portfolioFilters.userId}
                    onChange={(event) =>
                      setPortfolioFilters((prev) => ({ ...prev, userId: event.target.value }))
                    }
                  >
                    <option value="">All users</option>
                    {activeMembers.map((member) => (
                      <option key={member.user_id} value={member.user_id}>
                        {memberDisplayName(member)}
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
                      setPortfolioFilters({
                        userId: "",
                        programId: "",
                        categoryId: "",
                        location: "",
                        client: "",
                      })
                    }
                  >
                    <X size={14} /> Clear filters
                  </Button>
                </div>
              </div>

              {/* Drill table */}
              <div className="data-table-shell max-h-[55vh] overflow-auto">
                <table className="data-table data-table-sticky">
                  <thead>
                    <tr>
                      {headers.map((label) => (
                        <th key={label}>{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleCards.length === 0 ? (
                      <tr>
                        <td colSpan={headers.length} className="text-center text-sm text-txt-muted py-6">
                          No projects match the current filters.
                        </td>
                      </tr>
                    ) : (
                      visibleCards.map((item) => {
                        const currency = item.project.currency || portfolioCurrency;
                        const outstandingValue = Math.max(
                          item.contractValue - item.certifiedValue,
                          0,
                        );
                        const pctOfContract =
                          item.contractValue > 0
                            ? (item.certifiedValue / item.contractValue) * 100
                            : 0;
                        const pctOfPortfolio =
                          portfolioTotals.contract > 0
                            ? (item.contractValue / portfolioTotals.contract) * 100
                            : 0;
                        const pctRemaining =
                          item.contractValue > 0
                            ? (outstandingValue / item.contractValue) * 100
                            : 0;
                        if (drillMode === "delayed") {
                          return (
                            <tr key={item.project.id}>
                              <td className="data-cell-wrap font-semibold text-txt">
                                {item.project.name}
                              </td>
                              <td className="text-txt-muted">{formatDate(item.project.end_date)}</td>
                              <td className="data-cell-num text-accent">
                                {item.progress.planned.toFixed(1)}%
                              </td>
                              <td className="data-cell-num text-warn">
                                {item.progress.actual.toFixed(1)}%
                              </td>
                              <td className="data-cell-num text-err">
                                {item.progress.variance.toFixed(1)}%
                              </td>
                            </tr>
                          );
                        }
                        if (drillMode === "contract") {
                          return (
                            <tr key={item.project.id}>
                              <td className="data-cell-wrap font-semibold text-txt">
                                {item.project.name}
                              </td>
                              <td className="text-txt-muted">
                                {programLabel(selectedPrograms, item.project.program_id)}
                              </td>
                              <td className="data-cell-num font-mono text-txt">
                                {formatCurrency(item.contractValue, currency)}
                              </td>
                              <td className="data-cell-num text-txt-muted">
                                {pctOfPortfolio.toFixed(1)}%
                              </td>
                            </tr>
                          );
                        }
                        if (drillMode === "paid") {
                          return (
                            <tr key={item.project.id}>
                              <td className="data-cell-wrap font-semibold text-txt">
                                {item.project.name}
                              </td>
                              <td className="text-txt-muted">
                                {programLabel(selectedPrograms, item.project.program_id)}
                              </td>
                              <td className="data-cell-num font-mono text-txt">
                                {formatCurrency(item.contractValue, currency)}
                              </td>
                              <td className="data-cell-num font-mono text-ok">
                                {formatCurrency(item.certifiedValue, currency)}
                              </td>
                              <td className="data-cell-num text-txt-muted">
                                {pctOfContract.toFixed(1)}%
                              </td>
                            </tr>
                          );
                        }
                        // outstanding
                        return (
                          <tr key={item.project.id}>
                            <td className="data-cell-wrap font-semibold text-txt">
                              {item.project.name}
                            </td>
                            <td className="text-txt-muted">
                              {programLabel(selectedPrograms, item.project.program_id)}
                            </td>
                            <td className="data-cell-num font-mono text-txt">
                              {formatCurrency(item.contractValue, currency)}
                            </td>
                            <td className="data-cell-num font-mono text-ok">
                              {formatCurrency(item.certifiedValue, currency)}
                            </td>
                            <td className="data-cell-num font-mono text-warn">
                              {formatCurrency(outstandingValue, currency)}
                            </td>
                            <td className="data-cell-num text-txt-muted">
                              {pctRemaining.toFixed(1)}%
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Sticky live total */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-bg-raised px-4 py-3 text-sm">
                <span className="text-txt-dim">
                  Showing {visibleCards.length} of {portfolio.projectCards.length} projects
                </span>
                <span className="font-mono font-semibold text-txt">{totalLine}</span>
              </div>
            </div>
          );
        })() : null}
      </Modal>
    </div>
  );
}
