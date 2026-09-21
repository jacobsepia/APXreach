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
    revalidatePath("/prospects");
    return {
      ok: true as const,
      count: Number(results[1][0].count),
      preview: undefined,
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

/** Explicit promotion. Serialize within the workspace to prevent concurrent duplicate companies. */
export async function linkProspect(form: FormData) {
  const { workspaceId } = await requireTenantOrThrow();
  const id = z.string().uuid().parse(form.get("id"));
  const sql = neon(process.env.DATABASE_URL!);
  const result = await sql.transaction([
    sql`SELECT id FROM workspaces WHERE id = ${workspaceId} FOR UPDATE`,
    sql`WITH p AS (SELECT * FROM prospects WHERE id=${id} AND workspace_id=${workspaceId}
      AND status NOT IN ('disqualified','duplicate') AND company_id IS NULL),
    matches AS (SELECT c.id FROM companies c, p WHERE c.workspace_id=${workspaceId}
      AND (lower(trim(c.name))=lower(trim(p.data->>'company')) OR
        (p.data->>'domain' IS NOT NULL AND lower(regexp_replace(c.domain,'^www\\.','','i'))=p.data->>'domain'))),
    created AS (INSERT INTO companies(workspace_id,name,domain,city,industry,source)
      SELECT ${workspaceId},data->>'company',data->>'domain',data->>'location',data->>'industry',data->>'source'
      FROM p WHERE NOT EXISTS(SELECT 1 FROM matches) RETURNING id),
    chosen AS (SELECT id FROM matches WHERE (SELECT count(*) FROM matches)=1 UNION ALL SELECT id FROM created),
    linked AS (UPDATE prospects SET company_id=chosen.id,updated_at=now() FROM chosen
      WHERE prospects.id=${id} AND prospects.workspace_id=${workspaceId} RETURNING prospects.*),
    person AS (INSERT INTO contacts(workspace_id,company_id,first_name,last_name,title)
      SELECT ${workspaceId},company_id,data->>'contact','',data->>'contactTitle' FROM linked
      WHERE data->>'contact' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM contacts c
        WHERE c.workspace_id=${workspaceId} AND c.company_id=linked.company_id
        AND lower(trim(c.first_name || ' ' || c.last_name))=lower(trim(linked.data->>'contact'))) RETURNING id)
    SELECT company_id FROM linked`,
  ]);
  revalidatePath("/prospects");
  revalidatePath(`/prospects/${id}`);
  revalidatePath("/companies");
  revalidatePath("/contacts");
  if (!result[1].length)
    return {
      ok: false,
      error:
        "This record is excluded, already linked, or matches multiple companies. Review it before linking.",
    };
  return { ok: true, error: null };
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
