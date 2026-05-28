import { NextResponse } from "next/server";

import { normalizeConstructionWorkspacePayload } from "@/lib/supabase";
import { getSupabaseServerClient, isServerSupabaseConfigured } from "@/lib/supabase-server";
import {
  buildProjectScopedSyncRows,
  buildWorkspaceOwnedSyncRows,
  type ProjectScopedPayloadRecord,
  type WorkspaceOwnedPayloadRecord,
} from "@/lib/workspace-sync";

type SyncRequestBody = {
  payload?: unknown;
  activeProjectId?: string | null;
  activeModule?: string | null;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const serializeProjectRow = <TPayload,>(row: {
  organization_id?: string | null;
  name: string;
  payload: TPayload;
}) =>
  JSON.stringify({
    organization_id: row.organization_id ?? null,
    name: row.name,
    payload: row.payload,
  });

const serializeWorkspaceRow = <TPayload,>(row: {
  name: string;
  payload: TPayload;
}) =>
  JSON.stringify({
    name: row.name,
    payload: row.payload,
  });

async function syncProjectTable<TPayload>(
  table: string,
  projectId: string,
  desiredRows: ProjectScopedPayloadRecord<TPayload>[],
) {
  const supabase = getSupabaseServerClient();
  const { data: existingRows, error: existingError } = await supabase
    .from(table)
    .select("id, organization_id, name, payload, created_by")
    .eq("project_id", projectId);

  if (existingError) {
    throw new Error(existingError.message);
  }

  const existingMap = new Map(
    ((existingRows ?? []) as ProjectScopedPayloadRecord<TPayload>[]).map((row) => [row.id, row]),
  );
  const desiredIds = new Set(desiredRows.map((row) => row.id));
  const rowsToUpsert = desiredRows
    .map((row) => {
      const existing = existingMap.get(row.id);
      return {
        ...row,
        created_by: existing?.created_by ?? row.created_by ?? null,
      };
    })
    .filter((row) => {
      const existing = existingMap.get(row.id);
      if (!existing) return true;
      return serializeProjectRow(existing) !== serializeProjectRow(row);
    });
  const idsToDelete = ((existingRows ?? []) as ProjectScopedPayloadRecord<TPayload>[])
    .filter((row) => !desiredIds.has(row.id))
    .map((row) => row.id);

  if (idsToDelete.length > 0) {
    const { error: deleteError } = await supabase
      .from(table)
      .delete()
      .eq("project_id", projectId)
      .in("id", idsToDelete);

    if (deleteError) {
      throw new Error(deleteError.message);
    }
  }

  if (rowsToUpsert.length > 0) {
    const { error: upsertError } = await supabase
      .from(table)
      .upsert(rowsToUpsert, { onConflict: "id" });

    if (upsertError) {
      throw new Error(upsertError.message);
    }
  }

  return {
    upserted: rowsToUpsert.length,
    deleted: idsToDelete.length,
  };
}

async function syncWorkspaceTable<TPayload>(
  table: string,
  ownerId: string,
  desiredRows: WorkspaceOwnedPayloadRecord<TPayload>[],
) {
  const supabase = getSupabaseServerClient();
  const { data: existingRows, error: existingError } = await supabase
    .from(table)
    .select("id, name, payload")
    .eq("owner_id", ownerId);

  if (existingError) {
    throw new Error(existingError.message);
  }

  const existingMap = new Map(
    ((existingRows ?? []) as WorkspaceOwnedPayloadRecord<TPayload>[]).map((row) => [row.id, row]),
  );
  const desiredIds = new Set(desiredRows.map((row) => row.id));
  const rowsToUpsert = desiredRows.filter((row) => {
    const existing = existingMap.get(row.id);
    if (!existing) return true;
    return serializeWorkspaceRow(existing) !== serializeWorkspaceRow(row);
  });
  const idsToDelete = ((existingRows ?? []) as WorkspaceOwnedPayloadRecord<TPayload>[])
    .filter((row) => !desiredIds.has(row.id))
    .map((row) => row.id);

  if (idsToDelete.length > 0) {
    const { error: deleteError } = await supabase
      .from(table)
      .delete()
      .eq("owner_id", ownerId)
      .in("id", idsToDelete);

    if (deleteError) {
      throw new Error(deleteError.message);
    }
  }

  if (rowsToUpsert.length > 0) {
    const { error: upsertError } = await supabase
      .from(table)
      .upsert(rowsToUpsert, { onConflict: "id" });

    if (upsertError) {
      throw new Error(upsertError.message);
    }
  }

  return {
    upserted: rowsToUpsert.length,
    deleted: idsToDelete.length,
  };
}

export async function POST(request: Request) {
  if (!isServerSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Supabase environment variables are missing." },
      { status: 503 },
    );
  }

  const supabase = getSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = ((await request.json().catch(() => null)) ?? null) as SyncRequestBody | null;
  const payload = normalizeConstructionWorkspacePayload(
    body?.payload as Record<string, unknown> | null | undefined,
  );
  const activeProjectId =
    typeof body?.activeProjectId === "string" && body.activeProjectId
      ? body.activeProjectId
      : null;
  const syncProjectId =
    activeProjectId && uuidPattern.test(activeProjectId) ? activeProjectId : null;
  const activeModule =
    typeof body?.activeModule === "string" && body.activeModule ? body.activeModule : null;

  let organizationId: string | null = null;

  if (syncProjectId) {
    const { data: projectRow, error: projectError } = await supabase
      .from("projects")
      .select("id, organization_id")
      .eq("id", syncProjectId)
      .maybeSingle();

    if (projectError || !projectRow) {
      return NextResponse.json(
        { error: projectError?.message || "Project not found." },
        { status: 403 },
      );
    }

    organizationId = projectRow.organization_id ?? null;
  }

  const projectRows = syncProjectId
    ? buildProjectScopedSyncRows(payload, syncProjectId, organizationId, user.id)
    : {
        boqDocuments: [],
        workPlans: [],
        simpleItemSets: [],
        certificates: [],
        progressReports: [],
        generatedDocuments: [],
        correspondenceRecords: [],
      };
  const workspaceRows = buildWorkspaceOwnedSyncRows(payload, user.id);

  try {
    const [
      boqSync,
      workPlanSync,
      simpleItemsSync,
      certificateSync,
      progressSync,
      documentsSync,
      correspondenceSync,
      attendeeSync,
      minutesSync,
    ] = await Promise.all([
      syncProjectId
        ? syncProjectTable("project_boq_documents", syncProjectId, projectRows.boqDocuments)
        : Promise.resolve({ upserted: 0, deleted: 0 }),
      syncProjectId
        ? syncProjectTable("project_work_plans", syncProjectId, projectRows.workPlans)
        : Promise.resolve({ upserted: 0, deleted: 0 }),
      syncProjectId
        ? syncProjectTable("project_simple_item_sets", syncProjectId, projectRows.simpleItemSets)
        : Promise.resolve({ upserted: 0, deleted: 0 }),
      syncProjectId
        ? syncProjectTable(
            "project_payment_certificates",
            syncProjectId,
            projectRows.certificates,
          )
        : Promise.resolve({ upserted: 0, deleted: 0 }),
      syncProjectId
        ? syncProjectTable("project_progress_reports", syncProjectId, projectRows.progressReports)
        : Promise.resolve({ upserted: 0, deleted: 0 }),
      syncProjectId
        ? syncProjectTable(
            "project_generated_documents",
            syncProjectId,
            projectRows.generatedDocuments,
          )
        : Promise.resolve({ upserted: 0, deleted: 0 }),
      syncProjectId
        ? syncProjectTable(
            "project_correspondence_records",
            syncProjectId,
            projectRows.correspondenceRecords,
          )
        : Promise.resolve({ upserted: 0, deleted: 0 }),
      syncWorkspaceTable("workspace_attendee_groups", user.id, workspaceRows.attendeeGroups),
      syncWorkspaceTable("workspace_meeting_minutes", user.id, workspaceRows.meetingMinutes),
    ]);

    if (syncProjectId) {
      const { error: presenceError } = await supabase.from("project_presence").upsert({
        project_id: syncProjectId,
        user_id: user.id,
        active_module: activeModule,
        cursor_state: {},
        last_seen_at: new Date().toISOString(),
      });

      if (presenceError) {
        throw new Error(presenceError.message);
      }
    }

    return NextResponse.json({
      ok: true,
      skippedProjectSync: Boolean(activeProjectId && !syncProjectId),
      synced: {
        boqDocuments: boqSync,
        workPlans: workPlanSync,
        simpleItemSets: simpleItemsSync,
        certificates: certificateSync,
        progressReports: progressSync,
        generatedDocuments: documentsSync,
        correspondenceRecords: correspondenceSync,
        attendeeGroups: attendeeSync,
        meetingMinutes: minutesSync,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not synchronize workspace tables.",
      },
      { status: 500 },
    );
  }
}
