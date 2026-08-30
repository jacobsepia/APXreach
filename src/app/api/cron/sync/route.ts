import { eq } from "drizzle-orm";
import { connections, db, workspaces } from "@/db";
import { runSync } from "@/lib/sync";

/*
 * The scheduled sync. Until now the books only moved when somebody pressed
 * Sync now, which means the dashboard was as current as the last time a person
 * happened to look at it — the opposite of the promise the connection makes.
 *
 * Vercel invokes this on the schedule in vercel.json with
 * `Authorization: Bearer $CRON_SECRET`. Nothing else may: the route walks
 * every workspace and talks to the books, so an open endpoint would let anyone
 * spend Ledger's rate limit and Reach's compute at will.
 *
 * Webhooks replace the polling when Ledger ships them; this is the same
 * runSync the button calls, so that swap changes only what pulls the trigger.
 */

export const dynamic = "force-dynamic";
/* A walk over several workspaces, each doing paged reads against the books. */
export const maxDuration = 60;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  /*
   * No secret configured is a refusal, not a pass. The failure mode of the
   * other choice is an endpoint that is open in exactly the environment where
   * it matters, and it fails silently — the sync would still work.
   */
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  /* Only workspaces with live books: the rest have nothing to pull. */
  const due = await db
    .select({ workspaceId: workspaces.id, name: workspaces.name })
    .from(workspaces)
    .innerJoin(connections, eq(connections.workspaceId, workspaces.id))
    .where(eq(connections.status, "connected"));

  /*
   * Serial, and each failure contained. runSync records its own error on the
   * connection, so one workspace whose grant has lapsed must not stop the
   * next one from syncing.
   */
  let synced = 0;
  for (const workspace of due) {
    try {
      await runSync(workspace.workspaceId);
      synced++;
    } catch (error) {
      console.error(
        `[cron] sync failed for workspace ${workspace.workspaceId}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  return Response.json({ workspaces: due.length, synced });
}
