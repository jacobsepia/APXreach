import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { buildProspectSyncPlan, type SyncSnapshot } from "./prospect-sync-plan";

// One consistent snapshot, including all fields used for matching. The same
// fingerprint is checked under a workspace lock before committing the plan.
function snapshotQuery(
  query: NeonQueryFunction<false, false>,
  workspaceId: string,
) {
  return query`WITH snapshot AS (SELECT jsonb_build_object(
    'prospects', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'raw',raw,'data',data,'status',status,'companyId',company_id) ORDER BY source_sheet,source_row,id) FROM prospects WHERE workspace_id=${workspaceId}), '[]'::jsonb),
    'companies', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'domain',domain) ORDER BY id) FROM companies WHERE workspace_id=${workspaceId}), '[]'::jsonb),
    'contacts', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'companyId',company_id,'firstName',first_name,'lastName',last_name) ORDER BY id) FROM contacts WHERE workspace_id=${workspaceId}), '[]'::jsonb)
  ) AS data) SELECT data, md5(data::text) AS fingerprint FROM snapshot`;
}
export async function syncWorkspaceProspects(
  workspaceId: string,
  options: { preview?: boolean; onlyId?: string } = {},
  query = neon(process.env.DATABASE_URL!),
) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const [snapshot] = await snapshotQuery(query, workspaceId);
    const plan = buildProspectSyncPlan(
      snapshot.data as SyncSnapshot,
      options.onlyId,
    );
    if (
      options.preview ||
      !(plan.companies.length || plan.contacts.length || plan.links.length)
    )
      return plan.summary;
    const snapshotSql = snapshotQuery(query, workspaceId);
    try {
      await query.transaction(
        [
          query`SELECT id FROM workspaces WHERE id=${workspaceId} FOR UPDATE`,
          // A stale plan aborts the entire transaction and is recomputed below.
          query`SELECT 1 / CASE WHEN fingerprint=${snapshot.fingerprint} THEN 1 ELSE 0 END FROM (${snapshotSql}) AS current_snapshot`,
          query`INSERT INTO companies(id,workspace_id,name,domain,city,industry,source)
          SELECT id,${workspaceId},name,domain,city,industry,source FROM jsonb_to_recordset(${JSON.stringify(plan.companies)}::jsonb)
          AS rows(id uuid,name text,domain text,city text,industry text,source text)`,
          query`INSERT INTO contacts(id,workspace_id,company_id,first_name,last_name,title)
          SELECT r.id,${workspaceId},r."companyId",r."firstName",r."lastName",r.title
          FROM jsonb_to_recordset(${JSON.stringify(plan.contacts)}::jsonb) AS r(id uuid,"companyId" uuid,"firstName" text,"lastName" text,title text)
          JOIN companies c ON c.id=r."companyId" AND c.workspace_id=${workspaceId}`,
          query`UPDATE prospects p SET company_id=r."companyId",updated_at=now()
          FROM jsonb_to_recordset(${JSON.stringify(plan.links)}::jsonb) AS r("prospectId" uuid,"companyId" uuid)
          JOIN companies c ON c.id=r."companyId" AND c.workspace_id=${workspaceId}
          WHERE p.id=r."prospectId" AND p.workspace_id=${workspaceId}`,
        ],
        { isolationLevel: "Serializable" },
      );
      return plan.summary;
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (attempt < 2 && ["22012", "40001", "40P01"].includes(code ?? ""))
        continue;
      throw error;
    }
  }
  throw new Error("Records changed while syncing. Please retry.");
}
