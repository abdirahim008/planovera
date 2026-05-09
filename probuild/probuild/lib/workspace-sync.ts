import type {
  ConstructionWorkspacePayload,
  CorrespondenceRecord,
  GeneratedDocument,
  MeetingAttendeeGroup,
  MeetingMinute,
  PaymentCertificate,
  ProgressReport,
  SavedBOQ,
  SavedSimpleItems,
  SavedWorkPlan,
} from "./supabase";
import { normalizeConstructionWorkspacePayload } from "./supabase";

export interface ProjectScopedPayloadRecord<TPayload> {
  id: string;
  project_id: string;
  organization_id?: string | null;
  name: string;
  payload: TPayload;
  created_by?: string | null;
  updated_by?: string | null;
  updated_at?: string | null;
}

export interface WorkspaceOwnedPayloadRecord<TPayload> {
  id: string;
  owner_id: string;
  name: string;
  payload: TPayload;
  updated_at?: string | null;
}

export interface RelationalWorkspaceQueryData {
  boqDocuments?: ProjectScopedPayloadRecord<SavedBOQ>[];
  workPlans?: ProjectScopedPayloadRecord<SavedWorkPlan>[];
  simpleItemSets?: ProjectScopedPayloadRecord<SavedSimpleItems>[];
  certificates?: ProjectScopedPayloadRecord<PaymentCertificate>[];
  progressReports?: ProjectScopedPayloadRecord<ProgressReport>[];
  generatedDocuments?: ProjectScopedPayloadRecord<GeneratedDocument>[];
  correspondenceRecords?: ProjectScopedPayloadRecord<CorrespondenceRecord>[];
  attendeeGroups?: WorkspaceOwnedPayloadRecord<MeetingAttendeeGroup>[];
  meetingMinutes?: WorkspaceOwnedPayloadRecord<MeetingMinute>[];
}

export interface ProjectScopedSyncRows {
  boqDocuments: ProjectScopedPayloadRecord<SavedBOQ>[];
  workPlans: ProjectScopedPayloadRecord<SavedWorkPlan>[];
  simpleItemSets: ProjectScopedPayloadRecord<SavedSimpleItems>[];
  certificates: ProjectScopedPayloadRecord<PaymentCertificate>[];
  progressReports: ProjectScopedPayloadRecord<ProgressReport>[];
  generatedDocuments: ProjectScopedPayloadRecord<GeneratedDocument>[];
  correspondenceRecords: ProjectScopedPayloadRecord<CorrespondenceRecord>[];
}

export interface WorkspaceOwnedSyncRows {
  attendeeGroups: WorkspaceOwnedPayloadRecord<MeetingAttendeeGroup>[];
  meetingMinutes: WorkspaceOwnedPayloadRecord<MeetingMinute>[];
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const getItemTimestamp = (item: Record<string, unknown>) => {
  const updatedAt = item.updatedAt;
  if (typeof updatedAt === "string" && updatedAt) return updatedAt;

  const updated_at = item.updated_at;
  if (typeof updated_at === "string" && updated_at) return updated_at;

  const createdAt = item.createdAt;
  if (typeof createdAt === "string" && createdAt) return createdAt;

  const created_at = item.created_at;
  if (typeof created_at === "string" && created_at) return created_at;

  return "";
};

const sortByNewest = <T,>(items: T[]): T[] =>
  [...items].sort((left, right) =>
    getItemTimestamp(right as Record<string, unknown>).localeCompare(
      getItemTimestamp(left as Record<string, unknown>),
    ),
  );

const paymentCertificateName = (certificate: PaymentCertificate) =>
  certificate.type === "final"
    ? `Final Payment Certificate ${certificate.number}`
    : `Interim Payment Certificate ${certificate.number}`;

const progressReportName = (report: ProgressReport) =>
  report.name?.trim() || `Progress Report ${report.number}`;

const documentName = (document: GeneratedDocument) =>
  document.title?.trim() || document.referenceNo?.trim() || "Untitled Document";

const correspondenceName = (record: CorrespondenceRecord) =>
  record.subject?.trim() || record.referenceNo?.trim() || `Correspondence ${record.number}`;

export const buildProjectScopedSyncRows = (
  payload: ConstructionWorkspacePayload,
  projectId: string,
  organizationId: string | null,
  actorId: string,
): ProjectScopedSyncRows => ({
  boqDocuments: payload.savedBOQs
    .filter((item) => item.project_id === projectId)
    .map((item) => ({
      id: item.id,
      project_id: item.project_id,
      organization_id: organizationId,
      name: item.name,
      payload: clone(item),
      created_by: actorId,
      updated_by: actorId,
    })),
  workPlans: payload.savedWorkPlans
    .filter((item) => item.project_id === projectId)
    .map((item) => ({
      id: item.id,
      project_id: item.project_id,
      organization_id: organizationId,
      name: item.name,
      payload: clone(item),
      created_by: actorId,
      updated_by: actorId,
    })),
  simpleItemSets: payload.savedSimpleItemSets
    .filter((item) => item.project_id === projectId)
    .map((item) => ({
      id: item.id,
      project_id: item.project_id,
      organization_id: organizationId,
      name: item.name,
      payload: clone(item),
      created_by: actorId,
      updated_by: actorId,
    })),
  certificates: payload.certificates
    .filter((item) => item.project_id === projectId)
    .map((item) => ({
      id: item.id,
      project_id: item.project_id,
      organization_id: organizationId,
      name: paymentCertificateName(item),
      payload: clone(item),
      created_by: actorId,
      updated_by: actorId,
    })),
  progressReports: payload.progressReports
    .filter((item) => item.project_id === projectId)
    .map((item) => ({
      id: item.id,
      project_id: item.project_id,
      organization_id: organizationId,
      name: progressReportName(item),
      payload: clone(item),
      created_by: actorId,
      updated_by: actorId,
    })),
  generatedDocuments: payload.generatedDocuments
    .filter((item) => item.project_id === projectId)
    .map((item) => ({
      id: item.id,
      project_id: item.project_id,
      organization_id: organizationId,
      name: documentName(item),
      payload: clone(item),
      created_by: actorId,
      updated_by: actorId,
    })),
  correspondenceRecords: payload.correspondenceRecords
    .filter((item) => item.project_id === projectId)
    .map((item) => ({
      id: item.id,
      project_id: item.project_id,
      organization_id: organizationId,
      name: correspondenceName(item),
      payload: clone(item),
      created_by: actorId,
      updated_by: actorId,
    })),
});

export const buildWorkspaceOwnedSyncRows = (
  payload: ConstructionWorkspacePayload,
  ownerId: string,
): WorkspaceOwnedSyncRows => ({
  attendeeGroups: payload.attendeeGroups.map((item) => ({
    id: item.id,
    owner_id: ownerId,
    name: item.name,
    payload: clone(item),
  })),
  meetingMinutes: payload.meetingMinutes.map((item) => ({
    id: item.id,
    owner_id: ownerId,
    name: item.title,
    payload: clone(item),
  })),
});

export const buildRelationalWorkspacePayload = (
  data: RelationalWorkspaceQueryData,
): Partial<ConstructionWorkspacePayload> => ({
  savedBOQs: sortByNewest<SavedBOQ>(
    (data.boqDocuments ?? []).map((item) => clone(item.payload)),
  ),
  savedWorkPlans: sortByNewest<SavedWorkPlan>(
    (data.workPlans ?? []).map((item) => clone(item.payload)),
  ),
  savedSimpleItemSets: sortByNewest<SavedSimpleItems>(
    (data.simpleItemSets ?? []).map((item) => clone(item.payload)),
  ),
  certificates: sortByNewest<PaymentCertificate>(
    (data.certificates ?? []).map((item) => clone(item.payload)),
  ),
  progressReports: sortByNewest<ProgressReport>(
    (data.progressReports ?? []).map((item) => clone(item.payload)),
  ),
  generatedDocuments: sortByNewest<GeneratedDocument>(
    (data.generatedDocuments ?? []).map((item) => clone(item.payload)),
  ),
  correspondenceRecords: sortByNewest<CorrespondenceRecord>(
    (data.correspondenceRecords ?? []).map((item) => clone(item.payload)),
  ),
  attendeeGroups: sortByNewest<MeetingAttendeeGroup>(
    (data.attendeeGroups ?? []).map((item) => clone(item.payload)),
  ),
  meetingMinutes: sortByNewest<MeetingMinute>(
    (data.meetingMinutes ?? []).map((item) => clone(item.payload)),
  ),
});

export const mergeWorkspacePayloadSources = (
  snapshotPayload?: Partial<ConstructionWorkspacePayload> | null,
  relationalPayload?: Partial<ConstructionWorkspacePayload> | null,
): ConstructionWorkspacePayload => {
  const snapshot = normalizeConstructionWorkspacePayload(snapshotPayload);
  const relational = normalizeConstructionWorkspacePayload(relationalPayload);
  const useRelational = <T,>(snapshotItems: T[], relationalItems: T[]) =>
    relationalItems.length > 0 || snapshotItems.length === 0 ? relationalItems : snapshotItems;

  const merged = normalizeConstructionWorkspacePayload({
    ...snapshot,
    savedBOQs: useRelational(snapshot.savedBOQs, relational.savedBOQs),
    savedWorkPlans: useRelational(snapshot.savedWorkPlans, relational.savedWorkPlans),
    savedSimpleItemSets: useRelational(
      snapshot.savedSimpleItemSets,
      relational.savedSimpleItemSets,
    ),
    certificates: useRelational(snapshot.certificates, relational.certificates),
    progressReports: useRelational(snapshot.progressReports, relational.progressReports),
    generatedDocuments: useRelational(
      snapshot.generatedDocuments,
      relational.generatedDocuments,
    ),
  correspondenceRecords: useRelational(
      snapshot.correspondenceRecords,
      relational.correspondenceRecords,
    ),
    checklistItems: snapshot.checklistItems,
    siteNotes: snapshot.siteNotes,
    attendeeGroups: useRelational(snapshot.attendeeGroups, relational.attendeeGroups),
    meetingMinutes: useRelational(snapshot.meetingMinutes, relational.meetingMinutes),
  });

  if (merged.activeBOQId) {
    const activeBOQ = merged.savedBOQs.find((item) => item.id === merged.activeBOQId);
    if (activeBOQ) {
      merged.boqSheets = clone(activeBOQ.sheets);
    }
  }

  if (merged.activeWorkPlanId) {
    const activeWorkPlan = merged.savedWorkPlans.find(
      (item) => item.id === merged.activeWorkPlanId,
    );
    if (activeWorkPlan) {
      merged.workPlanSheets = clone(activeWorkPlan.sheets);
    }
  }

  if (merged.activeSimpleItemsId) {
    const activeSimpleItems = merged.savedSimpleItemSets.find(
      (item) => item.id === merged.activeSimpleItemsId,
    );
    if (activeSimpleItems) {
      merged.simpleItems = clone(activeSimpleItems.items);
    }
  }

  return merged;
};

export const buildProjectSyncSignature = (
  payload: ConstructionWorkspacePayload,
  activeProjectId: string | null,
  activeModule: string,
) =>
  JSON.stringify({
    activeProjectId,
    activeModule,
    savedBOQs: activeProjectId
      ? payload.savedBOQs.filter((item) => item.project_id === activeProjectId)
      : [],
    savedWorkPlans: activeProjectId
      ? payload.savedWorkPlans.filter((item) => item.project_id === activeProjectId)
      : [],
    savedSimpleItemSets: activeProjectId
      ? payload.savedSimpleItemSets.filter((item) => item.project_id === activeProjectId)
      : [],
    certificates: activeProjectId
      ? payload.certificates.filter((item) => item.project_id === activeProjectId)
      : [],
    progressReports: activeProjectId
      ? payload.progressReports.filter((item) => item.project_id === activeProjectId)
      : [],
    generatedDocuments: activeProjectId
      ? payload.generatedDocuments.filter((item) => item.project_id === activeProjectId)
      : [],
    correspondenceRecords: activeProjectId
      ? payload.correspondenceRecords.filter((item) => item.project_id === activeProjectId)
      : [],
    checklistItems: activeProjectId
      ? payload.checklistItems.filter((item) => item.project_id === activeProjectId)
      : [],
    siteNotes: activeProjectId
      ? payload.siteNotes.filter((item) => item.project_id === activeProjectId)
      : [],
    attendeeGroups: payload.attendeeGroups,
    meetingMinutes: payload.meetingMinutes,
  });
