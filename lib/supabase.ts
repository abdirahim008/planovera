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
  /**
   * Optional preset id chosen at creation time. Drives the small badge on project
   * cards and the helper copy in the create flow. Stored in memory + Zustand persist
   * (localStorage) only — there is no DB column for it yet, so projects loaded fresh
   * from Supabase may not have a preset until they're re-saved through the app.
   */
  preset?: string;
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
  /** Contact strip rendered in the letterhead footer (Tel · Email · Web). */
  issuerPhone?: string;
  issuerEmail?: string;
  issuerWebsite?: string;
  /** Letterhead accent colours (hex). Primary drives the tagline + main rule,
   *  secondary the short contrast segment of the two-tone rules. */
  accentPrimary?: string;
  accentSecondary?: string;
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
  type: "item" | "header" | "subtotal" | "sheettotal" | "grandtotal" | "notes" | "specification";
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

export interface PaymentAdjustmentLine {
  id: string;
  label: string;
  type: "addition" | "deduction";
  category: "variation" | "materials" | "withholding" | "liquidated-damages" | "other";
  amount: string;
  note?: string;
}

export interface PaymentCertificate {
  id: string;
  project_id: string;
  boqId?: string;
  boqName?: string;
  number: number;
  revision?: number;
  type: "interim" | "final";
  date: string;
  periodStart?: string;
  periodEnd?: string;
  status: "draft" | "submitted" | "approved" | "paid";
  previousCertificateId?: string | null;
  locked?: boolean;
  sheets: PaymentCertSheet[];
  // FIDIC deduction/addition percentages
  contingenciesPercent: number;
  governmentTaxPercent: number;
  retentionPercent: number;
  advancePaymentPercent: number;
  withholdingTaxPercent: number;
  advancePaymentAmount?: string;
  advanceRecoveredPrevious?: string;
  advanceRecoveryCurrent?: string;
  // Advance recovery schedule: recover advancePaymentPercent% of cumulative work
  // done, starting at this IPC number. advanceRecoverFull sweeps the remaining
  // balance on the current certificate (capped so the net never goes negative).
  advanceRecoveryStartIpc?: number;
  advanceRecoverFull?: boolean;
  retentionReleaseAmount?: string;
  finalAccountNote?: string;
  adjustments?: PaymentAdjustmentLine[];
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
  // Whether each signatory slot shows the user's saved signature image
  // ("saved") or stays blank ("none"/undefined). Defaults to blank.
  contractorSignatureSource?: "saved" | "none";
  engineerSignatureSource?: "saved" | "none";
  employerSignatureSource?: "saved" | "none";
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
  previousQty?: string;
  currentQty?: string;
  previousAmount: string;
  currentAmount: string;
  totalQty: string;
  totalAmount: string;
  balanceQty?: string;
  warningStatus?: "ok" | "over-certified" | "overridden";
  overrideNote?: string;
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
  /** User-flagged key milestone. An activity milestone is "achieved" when its
   *  status is completed; a section milestone when all its child activities are. */
  isMilestone?: boolean;
  /**
   * Finish-to-start predecessors (MS Project-style). Stores the predecessor
   * activities' stable UUIDs — the UI displays/accepts row numbers, which are
   * re-derived from row position so links survive insert/delete/reorder.
   * A linked activity starts the day after its latest predecessor finishes;
   * date changes cascade downstream automatically.
   */
  predecessorIds?: string[];
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
  subcategory: string;
  /** Free-text keywords for searching the library (e.g. "borehole", "uPVC", "water tank"). */
  tags: string[];
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
  /**
   * True once the user has manually set this activity's weight ratio. Locked
   * weights stay fixed while unlocked ones rebalance so the whole-report pool
   * keeps summing to 1. Only meaningful when the report's weightMode is "custom".
   */
  weightLocked?: boolean;
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
  | "site-visit-report"
  // Lightweight, FIDIC-free invoice for non-construction projects (and any project
  // that needs a simple invoice document without the IPC/Final certificate machinery).
  | "milestone-invoice"
  // One-page traffic-light Status Report — universal, much lighter than the full
  // Progress Report. Highlights / Issues / Upcoming / Risks structure.
  | "status-report";

/**
 * A single line on a Milestone Invoice. Stored on GeneratedDocument.invoiceLines so the
 * user can edit them inline without polluting the freeform `content` field.
 */
export interface InvoiceLine {
  id: string;
  description: string;
  /** Optional unit string ("hrs", "ea", "sprints", "deliverables"). */
  unit?: string;
  /** Numeric quantity. Stored as string so partially-entered values don't get coerced. */
  qty: string;
  /** Numeric unit rate. */
  rate: string;
}

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

// ─── Risk Register ─────────────────────────────────────────────────
export type RiskLevel = "low" | "medium" | "high";
export type RiskStatus = "open" | "mitigated" | "closed" | "accepted";
export type RiskCategory =
  | "technical"
  | "commercial"
  | "schedule"
  | "safety"
  | "quality"
  | "resource"
  | "external"
  | "other";

export interface Risk {
  id: string;
  project_id: string;
  /** Sequential reference number scoped per-project (RSK-001, RSK-002, …). */
  reference: string;
  title: string;
  description: string;
  category: RiskCategory;
  likelihood: RiskLevel;
  impact: RiskLevel;
  status: RiskStatus;
  /** Short owner name. */
  owner: string;
  mitigation: string;
  /** Optional ISO date for next review. */
  reviewDate: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Stakeholder Log ───────────────────────────────────────────────
export type StakeholderType =
  | "internal"
  | "client"
  | "vendor"
  | "regulator"
  | "community"
  | "partner"
  | "other";

export interface Stakeholder {
  id: string;
  project_id: string;
  name: string;
  organization: string;
  role: string;
  type: StakeholderType;
  email: string;
  phone: string;
  /** Influence level — how much they can affect the project outcome. */
  influence: RiskLevel;
  /** Interest level — how much they care about the project outcome. */
  interest: RiskLevel;
  /** Free-text engagement strategy / cadence / notes. */
  engagementNotes: string;
  active: boolean;
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
  /** Curated photo gallery for the progress report's "Photos" section (2-up grid,
   *  rendered on its own page in the PDF). Separate from siteVisitPhotos. */
  reportPhotos?: SiteNotePhoto[];
  /** Progress report extras: section toggles + per-section narratives. */
  reportSections?: ReportSectionToggles;
  /** Optional reporting period bounds shown on the cover and used to scope photos. */
  reportPeriodStart?: string;
  reportPeriodEnd?: string;
  /** Optional report number / revision for the cover (e.g. "04" / "A"). */
  reportNumber?: string;
  reportRevision?: string;
  /** Optional narrative sections for the progress report layout. */
  executiveSummary?: string;
  forecastNarrative?: string;
  /** Per-section presentation format. Defaults to "table" when unset. */
  reportItemFormat?: ReportItemFormat;
  reportWorkPlanFormat?: ReportWorkPlanFormat;
  /** Optional window for the work-plan section. Activities whose dates don't
      overlap [start, end] are trimmed from the report; empty = full plan. */
  reportWorkPlanStart?: string;
  reportWorkPlanEnd?: string;
  /** Milestone invoice extras (only used when templateType === "milestone-invoice"). */
  invoiceLines?: InvoiceLine[];
  /** Tax % applied to the subtotal on the invoice (numeric string for partial entry). */
  invoiceTaxPercent?: string;
  /** Discount % applied to the subtotal before tax. */
  invoiceDiscountPercent?: string;
  /** Optional payment due date string (ISO yyyy-mm-dd). */
  invoiceDueDate?: string;
  /** Optional payment terms / notes shown above the totals block. */
  invoicePaymentTerms?: string;
  /** Optional payment-into details rendered at the bottom of the invoice. */
  invoiceBankDetails?: string;
  // ─── Status Report extras (only used when templateType === "status-report") ──
  /** Overall traffic-light status for the report. */
  statusOverall?: "green" | "amber" | "red";
  /** Markdown / plain-text bullets for the Highlights section. */
  statusHighlights?: string;
  /** Markdown / plain-text bullets for the Issues / blockers section. */
  statusIssues?: string;
  /** Markdown / plain-text bullets for the Upcoming milestones section. */
  statusUpcoming?: string;
  /** Markdown / plain-text bullets for the Top Risks section. */
  statusTopRisks?: string;
  /** Optional resource / support asks. */
  statusResourceAsks?: string;
  createdAt: string;
  updatedAt: string;
}

export type ReportSectionId =
  | "cover"
  | "executiveSummary"
  | "keyMetrics"
  | "itemTable"
  | "sheetBreakdown"
  | "workPlan"
  | "paymentCertificates"
  | "actionPoints"
  | "riskRegister"
  | "siteNotes"
  | "correspondenceLog"
  | "qualityControl"
  | "photos"
  | "forecast"
  | "signoff";

export type ReportSectionToggles = Partial<Record<ReportSectionId, boolean>>;

export type ReportItemFormat = "table" | "bars";
export type ReportWorkPlanFormat = "table" | "gantt";

export const DEFAULT_PROGRESS_REPORT_SECTIONS: ReportSectionToggles = {
  cover: true,
  executiveSummary: true,
  keyMetrics: true,
  itemTable: true,
  sheetBreakdown: false,
  workPlan: true,
  paymentCertificates: true,
  actionPoints: true,
  // Risk register renders only when the project has non-closed risks, so it is
  // safe to default on; site notes and correspondence can be long, so opt-in.
  riskRegister: true,
  siteNotes: false,
  correspondenceLog: false,
  qualityControl: false,
  photos: false,
  forecast: true,
  signoff: true,
};

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

export type QualityControlCategory = "material-testing" | "survey" | "ndt" | "other";
export type QualityControlStatus = "pass" | "fail" | "pending" | "conditional";

export interface QualityControlRecord {
  id: string;
  project_id: string;
  number: number;
  category: QualityControlCategory;
  testName: string;
  elementLocation: string;
  sampleRef: string;
  date: string;
  performedBy: string;
  witnessedBy: string;
  specification: string;
  result: string;
  status: QualityControlStatus;
  reportLink: string;
  remarks: string;
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
  /** ISO timestamp of when this action was last set to "closed". Cleared when reopened. */
  closedAt?: string;
}

export interface MeetingActionProjectGroup {
  id: string;
  project_id: string;
  actionItems: MeetingActionItem[];
}

/**
 * First-class action point stored in the workspace-level register (the source of
 * truth for open/in-progress items). Its `id` is the same stable string used as
 * `actionKey` on the meeting snapshot copies — that is how a meeting's action
 * items reconcile back into the register on save and how new meetings know what
 * to carry forward.
 */
export interface ActionPoint {
  /** Stable identity shared with meeting snapshot items (MeetingActionItem.actionKey). */
  id: string;
  project_id: string;
  description: string;
  responsiblePerson: string;
  deadline: string;
  status: "open" | "in-progress" | "closed";
  priority: "low" | "medium" | "high" | "critical";
  notes?: string;
  /** Meeting where this action was first raised. */
  originMeetingId?: string;
  /** Most recent meeting that updated this action. */
  lastMeetingId?: string;
  createdAt: string;
  updatedAt: string;
  /** ISO timestamp of when this action was last set to "closed". Cleared when reopened. */
  closedAt?: string;
}

export interface BOQLibraryItemRecord {
  id: string;
  name: string;
  description: string;
  category: string;
  subcategory?: string | null;
  tags?: string[] | null;
  sheets: BOQSheet[];
  created_at: string;
  updated_at: string;
  author_id?: string | null;
  author_name?: string | null;
}

/**
 * Drawing packages: the lightweight, user-facing face of the drawings module.
 * A package is a set of REFERENCES to curated warehouse drawings plus the
 * title-block text the engineer fills in — never the drawing geometry itself
 * (SVGs are fetched from the shared library at render/export time), so the
 * workspace snapshot stays small.
 */
export interface DrawingPackageTitleBlock {
  projectTitle: string;
  client: string;
  consultant: string;
  drawingTitle: string;
  drawingNo: string;
  scale: string;
  date: string;
  drawnBy: string;
  checkedBy: string;
  approvedBy: string;
  revision: string;
  status: string;
}

/**
 * A reusable part (beam section, column, footing, manhole…) placed on top of
 * a sheet's drawing. Position and width are percentages of the sheet's
 * drawing area; height follows the part's own aspect ratio. Like the sheets
 * themselves this stores only a reference — the part's SVG comes from the
 * shared library at render/export time.
 */
export interface DrawingPackageOverlay {
  id: string;
  libraryItemId: string;
  name: string;
  x: number;
  y: number;
  width: number;
}

export interface DrawingPackageItem {
  id: string;
  /** Reference into the shared drawing library (warehouse). */
  libraryItemId: string;
  name: string;
  titleBlock: DrawingPackageTitleBlock;
  /** Parts stamped on top of the drawing. */
  overlays?: DrawingPackageOverlay[];
  /**
   * Drawing size on the sheet (1 = fit as stored). Many library SVGs carry
   * baked-in margins, so engineers can enlarge to fill the frame (edges crop)
   * or reduce. Saved per sheet so preview and PDF export stay identical.
   */
  zoom?: number;
  /**
   * Drawing offset on the sheet, as a percentage of the drawing area
   * (0 = centred). Set by dragging the preview — picks which part of an
   * enlarged drawing sits in the frame.
   */
  panX?: number;
  panY?: number;
}

export interface DrawingPackage {
  id: string;
  project_id: string;
  name: string;
  items: DrawingPackageItem[];
  createdAt: string;
  updatedAt: string;
}

export const emptyDrawingPackageTitleBlock = (): DrawingPackageTitleBlock => ({
  projectTitle: "",
  client: "",
  consultant: "",
  drawingTitle: "",
  drawingNo: "",
  scale: "",
  date: "",
  drawnBy: "",
  checkedBy: "",
  approvedBy: "",
  revision: "",
  status: "",
});

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
  qualityControlRecords: QualityControlRecord[];
  checklistItems: ChecklistItem[];
  siteNotes: SiteNote[];
  risks: Risk[];
  stakeholders: Stakeholder[];
  drawingPackages: DrawingPackage[];
  attendeeGroups: MeetingAttendeeGroup[];
  meetingMinutes: MeetingMinute[];
  meetingSeries: MeetingSeries[];
  actionPoints: ActionPoint[];
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
  issuer_phone?: string | null;
  issuer_email?: string | null;
  issuer_website?: string | null;
  brand_accent_primary?: string | null;
  brand_accent_secondary?: string | null;
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
    issuerPhone: record.issuer_phone || "",
    issuerEmail: record.issuer_email || "",
    issuerWebsite: record.issuer_website || "",
    accentPrimary: record.brand_accent_primary || "",
    accentSecondary: record.brand_accent_secondary || "",
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
  issuer_phone: project.documentBranding?.issuerPhone || null,
  issuer_email: project.documentBranding?.issuerEmail || null,
  issuer_website: project.documentBranding?.issuerWebsite || null,
  brand_accent_primary: project.documentBranding?.accentPrimary || null,
  brand_accent_secondary: project.documentBranding?.accentSecondary || null,
});

export const mapBOQLibraryItemRecord = (
  record: BOQLibraryItemRecord,
): BOQLibraryItem => ({
  id: record.id,
  name: record.name,
  description: record.description,
  category: record.category,
  subcategory: record.subcategory ?? "",
  tags: Array.isArray(record.tags) ? record.tags : [],
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
    qualityControlRecords: [],
    checklistItems: [],
    siteNotes: [],
    risks: [],
    stakeholders: [],
    drawingPackages: [],
    attendeeGroups: [],
    meetingSeries: [],
    meetingMinutes: [],
    actionPoints: [],
    userSignatureProfile: null,
  });

/**
 * Migration seam: older persisted blobs have meetings but no dedicated action
 * register. Reconstruct the register from the latest snapshot of each action
 * (by meeting date, then updatedAt) so nothing is lost on first load after the
 * register ships. Mirrors getLiveMeetingActionItems in lib/store.ts but kept
 * inline here to avoid a circular import.
 */
export const seedActionPointsFromMeetings = (
  meetingMinutes: MeetingMinute[],
): ActionPoint[] => {
  const latestByKey = new Map<string, ActionPoint>();
  const firstSeenMeetingByKey = new Map<string, string>();

  [...meetingMinutes]
    .sort((a, b) => {
      const dateCompare = (a.meetingDate || "").localeCompare(b.meetingDate || "");
      if (dateCompare !== 0) return dateCompare;
      return (a.updatedAt || "").localeCompare(b.updatedAt || "");
    })
    .forEach((minute) => {
      minute.actionGroups.forEach((group) => {
        group.actionItems.forEach((item) => {
          if (!firstSeenMeetingByKey.has(item.actionKey)) {
            firstSeenMeetingByKey.set(item.actionKey, minute.id);
          }
          latestByKey.set(item.actionKey, {
            id: item.actionKey,
            project_id: item.project_id,
            description: item.description,
            responsiblePerson: item.responsiblePerson,
            deadline: item.deadline,
            status: item.status,
            priority: item.priority,
            notes: item.notes,
            originMeetingId: firstSeenMeetingByKey.get(item.actionKey),
            lastMeetingId: minute.id,
            createdAt: minute.createdAt || minute.updatedAt || new Date().toISOString(),
            updatedAt: minute.updatedAt || new Date().toISOString(),
            closedAt: item.closedAt,
          });
        });
      });
    });

  return Array.from(latestByKey.values());
};

/**
 * Migration seam: the Progress module is now percent-only — the site team enters
 * Actual % per activity, while detailed quantity-vs-quantity-done measurement
 * lives in the payment certificate. Coerce any persisted quantity-mode report to
 * percent, preserving the already-computed actualPercent so the visible progress
 * is unchanged on reload.
 */
const migrateProgressReportsToPercent = (
  reports: ProgressReport[],
): ProgressReport[] =>
  reports.map((report) =>
    report.inputMode === "percent" ? report : { ...report, inputMode: "percent" as const },
  );

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
  progressReports: migrateProgressReportsToPercent(payload?.progressReports ?? []),
  generatedDocuments: payload?.generatedDocuments ?? [],
  correspondenceRecords: payload?.correspondenceRecords ?? [],
  qualityControlRecords: payload?.qualityControlRecords ?? [],
  checklistItems: payload?.checklistItems ?? [],
  siteNotes: payload?.siteNotes ?? [],
  risks: payload?.risks ?? [],
  stakeholders: payload?.stakeholders ?? [],
  drawingPackages: payload?.drawingPackages ?? [],
  attendeeGroups: payload?.attendeeGroups ?? [],
  meetingMinutes: payload?.meetingMinutes ?? [],
  meetingSeries: payload?.meetingSeries ?? [],
  // Seed the register from existing meetings the first time a blob without an
  // action register is loaded; otherwise honour the stored register.
  actionPoints:
    payload?.actionPoints && payload.actionPoints.length > 0
      ? payload.actionPoints
      : seedActionPointsFromMeetings(payload?.meetingMinutes ?? []),
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
  /** Optional back-pointer to the series this minute belongs to. */
  meetingSeriesId?: string;
  createdAt: string;
  updatedAt: string;
}

export type MeetingSeriesCadence = "weekly" | "biweekly" | "monthly" | "adhoc";

export interface MeetingSeries {
  id: string;
  name: string;
  description?: string;
  cadence?: MeetingSeriesCadence;
  /** Projects in scope for this series. Carry-forward action points are filtered to these. */
  projectIds: string[];
  /** Default attendees pre-filled into each new meeting from this series. */
  defaultAttendees: MeetingAttendee[];
  /** Default agenda templates pre-filled into each new meeting from this series. */
  defaultAgendas: MeetingAgendaItem[];
  createdAt: string;
  updatedAt: string;
}
