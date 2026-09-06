import { randomUUID } from "node:crypto";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { z } from "zod";

/** One transaction: serialize repeat submissions on the authenticated user,
 * then create the workspace, membership and pipeline together or not at all.
 * Existing members always keep their workspace; this is not a workspace switcher.
 */
export function provisionQueries(query: NeonQueryFunction<false, false>, userId: string, companyName: string) {
  const name = z.string().trim().min(1).max(80).parse(companyName);
  const slug = (name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "workspace") + "-" + randomUUID();
  return [
    query`SELECT id FROM "user" WHERE id = ${userId} FOR UPDATE`,
    query`
      WITH existing AS (
        SELECT workspace_id AS id FROM workspace_members WHERE user_id = ${userId}
        ORDER BY created_at, id LIMIT 1
      ), created AS (
        INSERT INTO workspaces (name, slug)
        SELECT ${name}, ${slug}
        WHERE EXISTS (SELECT 1 FROM "user" WHERE id = ${userId}) AND NOT EXISTS (SELECT 1 FROM existing)
        RETURNING id
      ), membership AS (
        INSERT INTO workspace_members (workspace_id, user_id, role)
        SELECT id, ${userId}, 'owner' FROM created RETURNING workspace_id
      ), pipeline AS (
        INSERT INTO pipelines (workspace_id, name, display_order)
        SELECT workspace_id, 'Sales pipeline', 0 FROM membership RETURNING id
      ), stages AS (
        INSERT INTO pipeline_stages (pipeline_id, name, display_order, win_probability, kind)
        SELECT pipeline.id, s.name, s.position, s.probability, s.kind FROM pipeline CROSS JOIN (VALUES
          ('New', 0, 10, 'open'), ('Qualified', 1, 30, 'open'), ('Proposal', 2, 60, 'open'),
          ('Closed won', 3, 100, 'won'), ('Closed lost', 4, 0, 'lost')
        ) AS s(name, position, probability, kind) RETURNING id
      )
      SELECT id FROM existing UNION ALL SELECT id FROM created
    `,
  ];
}

export async function provisionWorkspace(userId: string, companyName: string): Promise<string> {
  const query = neon(process.env.DATABASE_URL!);
  const result = await query.transaction(provisionQueries(query, userId, companyName), { isolationLevel: "ReadCommitted" });
  const id = result[1][0]?.id;
  if (typeof id !== "string") throw new Error("Could not create your workspace. Sign in and try again.");
  return id;
}
