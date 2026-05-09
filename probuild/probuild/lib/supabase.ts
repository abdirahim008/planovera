export interface Project {
  id: string;
  programId?: string;
  categoryId?: string;
  organizationId?: string;
  name: string;
  type: "construction" | "non-construction";
  role: "contractor" | "supervision" | "employer";
  created_at: string;
  code?: string;
  categoryName?: string;
  contractNumber?: string;
  clientName?: string;
  contractorName?: string;
  consultantName?: string;
  location?: string;
  region?: string;
  town?: string;
  latitude?: string;
  longitude?: string;
  contractTitle?: string;
  currency?: string;
  contractAmount?: string;
  start_date?: string;
  end_date?: string;
  documentBranding?: ProjectDocumentBranding;
}

export interface Program {
  id: string;
  organizationId?: string;
  ownerId?: string;
  name: string;
  code?: string;
  description?: string;
  clientName?: string;
  location?: string;
  currency?: string;
  budgetAmount?: string;
  start_date?: string;
  end_date?: string;
  status: "planning" | "active" | "completed" | "paused";
  created_at: string;
  updated_at?: string;
}

export interface ProjectCategory {
  id: string;
  organizationId?: string;
  ownerId?: string;
  name: string;
  code?: string;
  description?: string;
  color?: string;
  status: "active" | "archived";
  created_at: string;
  updated_at?: string;
}

export interface ProjectDocumentBranding {
  clientLogoDataUrl?: string;
  clientDisplayName?: string;
  clientAddress?: string;
  issuerDisplayName?: string;
  issuerAddress?: string;
  headerTagline?: string;
}

export interface UserSignatureProfile {
  displayName: string;
  roleTitle?: string;
  imageDataUrl: string;
  updatedAt: string;
}

export interface BOQSheet {
  id: string;
  project_id: string;
  name: string;
  sort_order: number;
  rows: BOQRow[];
  showSummary?: boolean;
  summaryGrandTotalTitle?: string;
}

export interface BOQRow {
  id: string;
  type: "item" | "header" | "subtotal" | "grandtotal" | "notes";
  itemNo: string;
  description: string;
  unit: string;
  qty: string;
  rate: string;
  amount: string;
}

export interface PaymentCertSheet {
  id: string;
  name: string;
  items: PaymentItem[];
}

export interface PaymentCertificate {
  id: string;
  project_id: string;
  boqId?: string;
  boqName?: string;
  number: number;
  type: "interim" | "final";
  date: string;
  status: "draft" | "submitted" | "approved" | "paid";
  sheets: PaymentCertSheet[];
  // FIDIC deduction/addition percentages
  contingenciesPercent: number;
  governmentTaxPercent: number;
  retentionPercent: number;
  advancePaymentPercent: number;
  withholdingTaxPercent: number;
  // Signatory info
  contractorName: string;
  contractorCompany: string;
  contractorTitle: string;
  engineerName: string;
  engineerOrg: string;
  engineerTitle: string;
  employerName: string;
  employerOrg: string;
  employerTitle: string;
}

export interface PaymentItem {
  id: string;
  billNo: string;
  description: string;
  unit: string;
  // BOQ Reference
  boqQty: string;
  boqRate: string;
  boqAmount: string;
  // Progress tracking
  previousAmount: string;
  currentAmount: string;
  totalQty: string;
  totalAmount: string;
}

export interface WorkPlanActivity {
  id: string;
  project_id: string;
  /** "section" rows act as BOQ-style section headers and roll up dates from following activities */
  rowType?: "activity" | "section";
  description: string;
  duration: string;
  startDate: string;
  endDate: string;
  status: "pending" | "in-progress" | "completed" | "delayed";
}

export interface WorkPlanSheet {
  id: string;
  name: string;
  sort_order: number;
  activities: WorkPlanActivity[];
}

export interface BOQLibraryItem {
  id: string;
  name: string;
  description: string;
  category: string;
  sheets: BOQSheet[];
  created_at: string;
  updated_at: string;
}

export interface SimpleItem {
  id: string;
  sn: string;
  description: string;
  unit: string;
  qty: string;
  rate: string;
  amount: string;
}

// ─── Saved Record Wrappers ─────────────────────────────────────────
export interface SavedBOQ {
  id: string;
  project_id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  sheets: BOQSheet[];
}

export interface SavedWorkPlan {
  id: string;
  project_id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  sheets: WorkPlanSheet[];
}

export interface SavedSimpleItems {
  id: string;
  project_id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  items: SimpleItem[];
}

export interface ProgressItem {
  id: string;
  billNo: string;
  description: string;
  unit: string;
  boqQty: string;
  boqRate: string;
  boqAmount: string;
  previousQty: string;
  currentQty: string;
  totalQty: string;
  earnedAmount: string;
  weightPercent: string;
  plannedPercent: string;
  actualPercent: string;
  variancePercent: string;
  status: "not-started" | "in-progress" | "completed" | "delayed";
  remarks: string;
}

export interface ProgressSheet {
  id: string;
  name: string;
  items: ProgressItem[];
}

export interface ProgressReport {
  id: string;
  project_id: string;
  number: number;
  name: string;
  date: string;
  status: "draft" | "submitted" | "approved";
  sourceType: "boq" | "items";
  inputMode?: "quantity" | "percent";
  weightMode?: "boq-amount" | "equal" | "custom";
  sourceId: string;
  sourceName: string;
  createdAt: string;
  updatedAt: string;
  sheets: ProgressSheet[];
}

export type DocumentTemplateType =
  | "commencement-letter"
  | "instruction-letter"
  | "progress-report"
  | "payment-certificate-summary"
  | "completion-certificate"
  | "site-visit-report";

export type SiteNoteCategory =
  | "observation"
  | "quality"
  | "safety"
  | "progress"
  | "issue"
  | "instruction";

export interface SiteNotePhoto {
  id: string;
  dataUrl: string;
  caption: string;
  takenAt: string;
  sortOrder: number;
}

export interface SiteNote {
  id: string;
  project_id: string;
  title: string;
  category: SiteNoteCategory;
  noteDate: string;
  authorName: string;
  weather: string;
  locationNote: string;
  observationText: string;
  photos: SiteNotePhoto[];
  createdAt: string;
  updatedAt: string;
}

export interface GeneratedDocument {
  id: string;
  project_id: string;
  title: string;
  templateType: DocumentTemplateType;
  referenceNo: string;
  date: string;
  status: "draft" | "issued" | "approved";
  layoutStyle?: "letter" | "report" | "certificate";
  brandingMode?: "project" | "custom";
  letterheadTitle?: string;
  letterheadSubtitle?: string;
  letterheadAddress?: string;
  coverTitle?: string;
  coverSubtitle?: string;
  recipientName?: string;
  recipientRole?: string;
  recipientSignatureSource?: "none" | "saved";
  signatoryName?: string;
  signatoryRole?: string;
  signatorySignatureSource?: "none" | "saved";
  brandLogoDataUrl?: string;
  coverImageDataUrl?: string;
  footerNote?: string;
  content: string;
  linkedProgressReportId?: string;
  linkedCertificateId?: string;
  linkedSiteNoteId?: string;
  siteVisitObservationHtml?: string;
  siteVisitPhotos?: SiteNotePhoto[];
  createdAt: string;
  updatedAt: string;
}

export interface ApprovalStep {
  id: string;
  role: string;
  reviewer: string;
  status: "pending" | "approved" | "rejected";
  date: string;
  comments: string;
}

export type CorrespondenceType =
  | "instruction"
  | "rfi"
  | "submittal"
  | "meeting-minute"
  | "claim-notice"
  | "variation-order";

export interface CorrespondenceRecord {
  id: string;
  project_id: string;
  number: number;
  type: CorrespondenceType;
  referenceNo: string;
  subject: string;
  date: string;
  dueDate: string;
  from: string;
  to: string;
  status: "draft" | "open" | "pending-approval" | "approved" | "closed";
  body: string;
  linkedDocumentId?: string;
  linkedProgressReportId?: string;
  linkedCertificateId?: string;
  estimatedValue?: string;
  approvedValue?: string;
  timeImpactDays?: string;
  approvalSteps: ApprovalStep[];
  createdAt: string;
  updatedAt: string;
}

export type ChecklistStatus = "pending" | "submitted" | "verified" | "rejected" | "waived";

export interface ChecklistItem {
  id: string;
  project_id: string;
  title: string;
  category: string;
  responsiblePerson: string;
  dueDate: string;
  status: ChecklistStatus;
  documentUrl: string;
  submittedDate: string;
  verifiedBy: string;
  verifiedDate: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface MeetingAttendee {
  id: string;
  name: string;
  designation: string;
  organization: string;
}

export interface MeetingAttendeeGroup {
  id: string;
  name: string;
  members: MeetingAttendee[];
  createdAt: string;
  updatedAt: string;
}

export interface MeetingAgendaItem {
  id: string;
  title: string;
  discussion: string;
}

export interface MeetingActionItem {
  id: string;
  actionKey: string;
  project_id: string;
  description: string;
  responsiblePerson: string;
  deadline: string;
  status: "open" | "in-progress" | "closed";
  priority: "low" | "medium" | "high" | "critical";
  notes?: string;
  carriedForwardFromMinuteId?: string;
}

export interface MeetingActionProjectGroup {
  id: string;
  project_id: string;
  actionItems: MeetingActionItem[];
}

export interface BOQLibraryItemRecord {
  id: string;
  name: string;
  description: string;
  category: string;
  sheets: BOQSheet[];
  created_at: string;
  updated_at: string;
  author_id?: string | null;
  author_name?: string | null;
}

export interface ConstructionWorkspacePayload {
  savedBOQs: SavedBOQ[];
  activeBOQId: string | null;
  boqSheets: BOQSheet[];
  activeSheetIndex: number;
  savedWorkPlans: SavedWorkPlan[];
  activeWorkPlanId: string | null;
  workPlanSheets: WorkPlanSheet[];
  activeWorkPlanSheetIndex: number;
  savedSimpleItemSets: SavedSimpleItems[];
  activeSimpleItemsId: string | null;
  simpleItems: SimpleItem[];
  certificates: PaymentCertificate[];
  progressReports: ProgressReport[];
  generatedDocuments: GeneratedDocument[];
  correspondenceRecords: CorrespondenceRecord[];
  checklistItems: ChecklistItem[];
  siteNotes: SiteNote[];
  attendeeGroups: MeetingAttendeeGroup[];
  meetingMinutes: MeetingMinute[];
  userSignatureProfile?: UserSignatureProfile | null;
}

export interface ConstructionWorkspaceRecord {
  owner_id: string;
  payload: ConstructionWorkspacePayload | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectRecord {
  id: string;
  owner_id?: string | null;
  organization_id?: string | null;
  program_id?: string | null;
  category_id?: string | null;
  name: string;
  type: Project["type"];
  role: Project["role"];
  created_at: string;
  updated_at?: string | null;
  code?: string | null;
  category_name?: string | null;
  contract_number?: string | null;
  client_name?: string | null;
  contractor_name?: string | null;
  consultant_name?: string | null;
  location?: string | null;
  region?: string | null;
  town?: string | null;
  latitude?: string | null;
  longitude?: string | null;
  contract_title?: string | null;
  currency?: string | null;
  contract_amount?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  client_logo_data_url?: string | null;
  client_display_name?: string | null;
  client_address?: string | null;
  issuer_display_name?: string | null;
  issuer_address?: string | null;
  header_tagline?: string | null;
}

export interface ProgramRecord {
  id: string;
  organization_id?: string | null;
  owner_id?: string | null;
  name: string;
  code?: string | null;
  description?: string | null;
  client_name?: string | null;
  location?: string | null;
  currency?: string | null;
  budget_amount?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  status: Program["status"];
  created_at: string;
  updated_at?: string | null;
}

export interface ProjectCategoryRecord {
  id: string;
  organization_id?: string | null;
  owner_id?: string | null;
  name: string;
  code?: string | null;
  description?: string | null;
  color?: string | null;
  status: ProjectCategory["status"];
  created_at: string;
  updated_at?: string | null;
}

export interface OrganizationRecord {
  id: string;
  name: string;
  slug?: string | null;
  owner_id?: string | null;
  personal: boolean;
  created_at: string;
  updated_at: string;
}

export interface OrganizationMembershipRecord {
  id: string;
  organization_id: string;
  user_id: string;
  role: "owner" | "admin" | "manager" | "member" | "viewer";
  status: "active" | "invited" | "suspended";
  joined_at: string;
  updated_at: string;
  organizations?: OrganizationRecord | OrganizationRecord[] | null;
  profiles?:
    | {
        id: string;
        email?: string | null;
        full_name?: string | null;
        signature_display_name?: string | null;
        signature_role_title?: string | null;
        signature_image_data_url?: string | null;
      }
    | Array<{
        id: string;
        email?: string | null;
        full_name?: string | null;
        signature_display_name?: string | null;
        signature_role_title?: string | null;
        signature_image_data_url?: string | null;
      }>
    | null;
}

export interface BillingPlanRecord {
  id: string;
  code: string;
  name: string;
  audience: "individual" | "organization";
  billing_interval: "monthly" | "yearly";
  base_price_cents: number;
  per_seat_price_cents: number;
  included_seats: number;
  trial_days: number;
  description?: string | null;
  features?: string[] | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface OrganizationSubscriptionRecord {
  id: string;
  organization_id: string;
  plan_code: string;
  audience: "individual" | "organization";
  billing_interval: "monthly" | "yearly";
  status: "trialing" | "active" | "past_due" | "canceled" | "incomplete";
  seat_count: number;
  included_seats: number;
  base_price_cents: number;
  per_seat_price_cents: number;
  provider?: string | null;
  provider_customer_id?: string | null;
  provider_subscription_id?: string | null;
  provider_price_id?: string | null;
  current_period_start?: string | null;
  current_period_end?: string | null;
  trial_ends_at?: string | null;
  cancel_at_period_end?: boolean | null;
  created_at: string;
  updated_at: string;
}

export interface OrganizationInviteRecord {
  id: string;
  organization_id: string;
  email: string;
  full_name?: string | null;
  role: "admin" | "manager" | "member" | "viewer";
  delivery_method: "manual" | "email";
  status: "pending" | "accepted" | "revoked" | "expired";
  seat_reserved: boolean;
  invite_token: string;
  invited_by?: string | null;
  accepted_by?: string | null;
  expires_at?: string | null;
  accepted_at?: string | null;
  created_at: string;
  updated_at: string;
}

export const mapProjectRecord = (record: ProjectRecord): Project => ({
  id: record.id,
  programId: record.program_id || "",
  categoryId: record.category_id || "",
  organizationId: record.organization_id || "",
  name: record.name,
  type: record.type,
  role: record.role,
  created_at: record.created_at,
  code: record.code || "",
  categoryName: record.category_name || "",
  contractNumber: record.contract_number || "",
  clientName: record.client_name || "",
  contractorName: record.contractor_name || "",
  consultantName: record.consultant_name || "",
  location: record.location || "",
  region: record.region || "",
  town: record.town || "",
  latitude: record.latitude || "",
  longitude: record.longitude || "",
  contractTitle: record.contract_title || "",
  currency: record.currency || "USD",
  contractAmount: record.contract_amount || "",
  start_date: record.start_date || "",
  end_date: record.end_date || "",
  documentBranding: {
    clientLogoDataUrl: record.client_logo_data_url || "",
    clientDisplayName: record.client_display_name || "",
    clientAddress: record.client_address || "",
    issuerDisplayName: record.issuer_display_name || "",
    issuerAddress: record.issuer_address || "",
    headerTagline: record.header_tagline || "",
  },
});

export const mapProjectCategoryRecord = (record: ProjectCategoryRecord): ProjectCategory => ({
  id: record.id,
  organizationId: record.organization_id || "",
  ownerId: record.owner_id || "",
  name: record.name,
  code: record.code || "",
  description: record.description || "",
  color: record.color || "#3b82f6",
  status: record.status || "active",
  created_at: record.created_at,
  updated_at: record.updated_at || "",
});

export const mapProgramRecord = (record: ProgramRecord): Program => ({
  id: record.id,
  organizationId: record.organization_id || "",
  ownerId: record.owner_id || "",
  name: record.name,
  code: record.code || "",
  description: record.description || "",
  clientName: record.client_name || "",
  location: record.location || "",
  currency: record.currency || "USD",
  budgetAmount: record.budget_amount || "",
  start_date: record.start_date || "",
  end_date: record.end_date || "",
  status: record.status || "active",
  created_at: record.created_at,
  updated_at: record.updated_at || "",
});

export const toProgramRecord = (
  program: Program,
  ownerId: string,
): Omit<ProgramRecord, "updated_at"> => ({
  id: program.id,
  organization_id: program.organizationId || null,
  owner_id: ownerId,
  name: program.name,
  code: program.code || null,
  description: program.description || null,
  client_name: program.clientName || null,
  location: program.location || null,
  currency: program.currency || "USD",
  budget_amount: program.budgetAmount || null,
  start_date: program.start_date || null,
  end_date: program.end_date || null,
  status: program.status || "active",
  created_at: program.created_at,
});

export const toProjectCategoryRecord = (
  category: ProjectCategory,
  ownerId: string,
): Omit<ProjectCategoryRecord, "updated_at"> => ({
  id: category.id,
  organization_id: category.organizationId || null,
  owner_id: ownerId,
  name: category.name,
  code: category.code || null,
  description: category.description || null,
  color: category.color || null,
  status: category.status || "active",
  created_at: category.created_at,
});

export const toProjectRecord = (
  project: Project,
  ownerId: string,
): Omit<ProjectRecord, "updated_at"> => ({
  id: project.id,
  owner_id: ownerId,
  organization_id: project.organizationId || null,
  program_id: project.programId || null,
  category_id: project.categoryId || null,
  name: project.name,
  type: project.type,
  role: project.role,
  created_at: project.created_at,
  code: project.code || null,
  category_name: project.categoryName || null,
  contract_number: project.contractNumber || null,
  client_name: project.clientName || null,
  contractor_name: project.contractorName || null,
  consultant_name: project.consultantName || null,
  location: project.location || null,
  region: project.region || null,
  town: project.town || null,
  latitude: project.latitude || null,
  longitude: project.longitude || null,
  contract_title: project.contractTitle || null,
  currency: project.currency || "USD",
  contract_amount: project.contractAmount || null,
  start_date: project.start_date || null,
  end_date: project.end_date || null,
  client_logo_data_url: project.documentBranding?.clientLogoDataUrl || null,
  client_display_name: project.documentBranding?.clientDisplayName || null,
  client_address: project.documentBranding?.clientAddress || null,
  issuer_display_name: project.documentBranding?.issuerDisplayName || null,
  issuer_address: project.documentBranding?.issuerAddress || null,
  header_tagline: project.documentBranding?.headerTagline || null,
});

export const mapBOQLibraryItemRecord = (
  record: BOQLibraryItemRecord,
): BOQLibraryItem => ({
  id: record.id,
  name: record.name,
  description: record.description,
  category: record.category,
  sheets: record.sheets ?? [],
  created_at: record.created_at,
  updated_at: record.updated_at,
});

export const emptyConstructionWorkspacePayload =
  (): ConstructionWorkspacePayload => ({
    savedBOQs: [],
    activeBOQId: null,
    boqSheets: [],
    activeSheetIndex: 0,
    savedWorkPlans: [],
    activeWorkPlanId: null,
    workPlanSheets: [],
    activeWorkPlanSheetIndex: 0,
    savedSimpleItemSets: [],
    activeSimpleItemsId: null,
    simpleItems: [],
    certificates: [],
    progressReports: [],
    generatedDocuments: [],
    correspondenceRecords: [],
    checklistItems: [],
    siteNotes: [],
    attendeeGroups: [],
    meetingMinutes: [],
    userSignatureProfile: null,
  });

export const normalizeConstructionWorkspacePayload = (
  payload?: Partial<ConstructionWorkspacePayload> | null,
): ConstructionWorkspacePayload => ({
  ...emptyConstructionWorkspacePayload(),
  ...payload,
  savedBOQs: payload?.savedBOQs ?? [],
  boqSheets: payload?.boqSheets ?? [],
  savedWorkPlans: payload?.savedWorkPlans ?? [],
  workPlanSheets: payload?.workPlanSheets ?? [],
  savedSimpleItemSets: payload?.savedSimpleItemSets ?? [],
  simpleItems: payload?.simpleItems ?? [],
  certificates: payload?.certificates ?? [],
  progressReports: payload?.progressReports ?? [],
  generatedDocuments: payload?.generatedDocuments ?? [],
  correspondenceRecords: payload?.correspondenceRecords ?? [],
  checklistItems: payload?.checklistItems ?? [],
  siteNotes: payload?.siteNotes ?? [],
  attendeeGroups: payload?.attendeeGroups ?? [],
  meetingMinutes: payload?.meetingMinutes ?? [],
  userSignatureProfile: payload?.userSignatureProfile ?? null,
  activeSheetIndex: payload?.activeSheetIndex ?? 0,
  activeWorkPlanSheetIndex: payload?.activeWorkPlanSheetIndex ?? 0,
});

export interface MeetingMinute {
  id: string;
  title: string;
  meetingDate: string;
  status: "draft" | "final";
  referenceNo: string;
  attendees: MeetingAttendee[];
  agendas: MeetingAgendaItem[];
  actionGroups: MeetingActionProjectGroup[];
  createdAt: string;
  updatedAt: string;
}
