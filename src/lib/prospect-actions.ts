"use server";

import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { and, eq, sql as expression } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, prospects } from "@/db";
import { requireTenantOrThrow } from "./workspace";
import { readProspectWorkbook } from "./prospect-workbook";
import { clean, prospectStatuses } from "./prospect-data";
import { syncWorkspaceProspects } from "./prospect-sync-store";

function refreshProspectCrm() {
  for (const path of ["/prospects", "/companies", "/contacts", "/dashboard"])
    revalidatePath(path);
  revalidatePath("/companies/[id]", "page");
  revalidatePath("/prospects/[id]", "page");
}

export async function syncQualifiedProspects(
  mode: "preview" | "sync" = "preview",
) {
  const tenant = await requireTenantOrThrow();
  z.enum(["preview", "sync"]).parse(mode);
  try {
    const summary = await syncWorkspaceProspects(tenant.workspaceId, {
      preview: mode === "preview",
    });
    if (mode === "sync") refreshProspectCrm();
    return { ok: true as const, summary };
  } catch {
    return {
      ok: false as const,
      error:
        "CRM sync could not finish. Retry safely; existing company and contact details are preserved.",
    };
  }
}

export async function uploadProspects(form: FormData) {
  try {
    const tenant = await requireTenantOrThrow();
    const file = form.get("file");
    if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".xlsx"))
      throw new Error("Choose an .xlsx workbook.");
    if (file.size > 3 * 1024 * 1024)
      throw new Error("Use a workbook smaller than 3 MB.");
    const bytes = Buffer.from(await file.arrayBuffer());
    const rows = await readProspectWorkbook(bytes);
    if (form.get("mode") !== "import")
      return { ok: true as const, preview: rows, count: rows.length };
    const sql = neon(process.env.DATABASE_URL!);
    const hash = createHash("sha256").update(bytes).digest("hex");
    const results = await sql.transaction([
      sql`SELECT id FROM workspaces WHERE id = ${tenant.workspaceId} FOR UPDATE`,
      sql`WITH batch AS (
        INSERT INTO prospect_imports(workspace_id,file_name,file_hash,row_count,created_by)
        VALUES(${tenant.workspaceId},${file.name},${hash},${rows.length},${tenant.userId})
        ON CONFLICT(workspace_id,file_hash) DO NOTHING RETURNING id
      ), inserted AS (
        INSERT INTO prospects(workspace_id,import_id,source_sheet,source_row,raw,data,status)
        SELECT ${tenant.workspaceId}, batch.id, r.sheet, r.row, r.raw, r.data, r.status
        FROM batch CROSS JOIN jsonb_to_recordset(${JSON.stringify(rows)}::jsonb)
          AS r(sheet text,row integer,raw jsonb,data jsonb,status text) RETURNING id
      ) SELECT count(*)::integer AS count FROM inserted`,
    ]);
    // Import is already committed. A sync failure must not masquerade as a
    // failed import, and the bulk action can resume it without re-uploading.
    let syncSummary;
    let syncError: string | undefined;
    try {
      syncSummary = await syncWorkspaceProspects(tenant.workspaceId);
    } catch {
      syncError =
        "Research was imported, but automatic CRM sync needs a retry. Use Sync qualified records to CRM.";
    }
    refreshProspectCrm();
    return {
      ok: true as const,
      count: Number(results[1][0].count),
      preview: undefined,
      syncSummary,
      syncError,
    };
  } catch (error) {
    console.error(
      "Prospect import failed",
      error instanceof Error ? error.message : "Unknown error",
    );
    return {
      ok: false as const,
      error:
        error instanceof Error &&
        !/sql|relation|database|query|connection/i.test(error.message)
          ? error.message
          : "Import could not complete. Check the prospect migration and try again. No partial import was saved.",
    };
  }
}

export async function updateProspect(form: FormData) {
  const { workspaceId } = await requireTenantOrThrow();
  const id = z.string().uuid().parse(form.get("id"));
  const status = z.enum(prospectStatuses).parse(form.get("status"));
  const text = (key: string) =>
    clean(
      z
        .string()
        .max(10000)
        .parse(form.get(key) ?? ""),
    );
  const due = text("nextActionDate");
  if (
    due &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(due) ||
      Number.isNaN(Date.parse(due)) ||
      new Date(due).toISOString().slice(0, 10) !== due)
  )
    throw new Error("Choose a valid date.");
  const fitRaw = text("fit");
  const fit = fitRaw
    ? z.coerce.number().int().min(1).max(5).parse(fitRaw)
    : null;
  const reviewed = JSON.stringify({ fit, rationale: text("rationale") });
  await db
    .update(prospects)
    .set({
      status,
      ownerName: text("ownerName"),
      nextAction: text("nextAction"),
      data: expression`${prospects.data} || ${reviewed}::jsonb`,
      nextActionDate: due,
      reviewNotes: text("reviewNotes"),
      updatedAt: new Date(),
    })
    .where(and(eq(prospects.id, id), eq(prospects.workspaceId, workspaceId)));
  revalidatePath("/prospects");
  revalidatePath(`/prospects/${id}`);
}

/** Individual and bulk sync share matching and exclusion rules. */
export async function linkProspect(form: FormData) {
  const { workspaceId } = await requireTenantOrThrow();
  const id = z.string().uuid().parse(form.get("id"));
  const result = await syncWorkspaceProspects(workspaceId, { onlyId: id });
  refreshProspectCrm();
  if (result.recordsLinked || result.contactsCreated || result.alreadyLinked)
    return { ok: true, error: null };
  return {
    ok: false,
    error: result.held[0]?.reason ?? "This record is excluded or unavailable.",
  };
}

export async function createProspectTask(form: FormData) {
  const { workspaceId, userName } = await requireTenantOrThrow();
  const id = z.string().uuid().parse(form.get("id"));
  const sql = neon(process.env.DATABASE_URL!);
  const result = await sql.transaction([
    sql`SELECT id FROM workspaces WHERE id=${workspaceId} FOR UPDATE`,
    sql`WITH p AS (SELECT * FROM prospects WHERE id=${id} AND workspace_id=${workspaceId}
      AND company_id IS NOT NULL AND next_action IS NOT NULL AND status NOT IN ('disqualified','duplicate')),
    created AS (INSERT INTO activities(workspace_id,type,subject,company_id,actor_name,due_at)
      SELECT ${workspaceId},'task',next_action,company_id,${userName},next_action_date::timestamp AT TIME ZONE 'America/Toronto'
      FROM p WHERE task_id IS NULL RETURNING id),
    refreshed AS (UPDATE activities SET subject=p.next_action,
      due_at=p.next_action_date::timestamp AT TIME ZONE 'America/Toronto'
      FROM p WHERE activities.id=p.task_id AND activities.workspace_id=${workspaceId} AND completed_at IS NULL RETURNING activities.id)
    UPDATE prospects SET task_id=COALESCE((SELECT id FROM created),task_id),updated_at=now()
    WHERE prospects.id=${id} AND prospects.workspace_id=${workspaceId}
      AND (EXISTS(SELECT 1 FROM created) OR EXISTS(SELECT 1 FROM refreshed)) RETURNING task_id`,
  ]);
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  revalidatePath(`/prospects/${id}`);
  return {
    ok: Boolean(result[1].length),
    error: result[1].length
      ? null
      : "Save a next action and link a company first. A completed task is not reopened.",
  };
}
