import { after } from "next/server";
import { and, eq } from "drizzle-orm";
import { connections, db } from "@/db";
import { getProvider } from "@/lib/providers";
import { runSync } from "@/lib/sync";

/*
 * The receiver for "these books changed".
 *
 * Ledger runs a pump that watches its own tables and pings every subscriber
 * within about a minute of money moving. That replaces waiting for the daily
 * cron, and it is what lets a payment stop a follow-up sequence while the
 * thanks is still warm rather than a day late.
 *
 * The ping carries no book data — a company id and counts — so this route
 * answers it by running the same sync it already trusts. A forged ping
 * therefore costs a sync that finds nothing, which is why the signature check
 * is about not spending Ledger's rate limit on strangers rather than about
 * keeping anybody's figures safe.
 *
 * Provider-agnostic, like /api/integrations/[provider]: the day Xero pushes,
 * it implements the same three methods and this file does not change.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider: providerId } = await params;
  const provider = getProvider(providerId);
  if (!provider?.webhooks) {
    return Response.json({ error: "unknown_provider" }, { status: 404 });
  }

  /* The raw text, not a re-serialised object: the signature covers the bytes
     that were sent, and JSON.stringify would not reproduce them faithfully. */
  const body = await request.text();

  /*
   * Parsed before it is trusted, only to learn which company it claims to be
   * about — the secret to check it against is the one stored for that
   * connection. Nothing here acts on the contents.
   */
  let claimed: { companyId?: unknown };
  try {
    claimed = JSON.parse(body) as { companyId?: unknown };
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!claimed || typeof claimed.companyId !== "string") {
    return Response.json({ error: "invalid_payload" }, { status: 400 });
  }

  const candidates = await db
    .select()
    .from(connections)
    .where(and(eq(connections.externalCompanyId, claimed.companyId), eq(connections.provider, providerId), eq(connections.status, "connected")));

  /*
   * An unknown company and a bad signature answer identically. Telling a
   * caller which of the two they hit would turn this endpoint into a way to
   * ask whether a given company is connected to Reach.
   */
  const signature = request.headers.get("x-apx-signature") ?? "";
  const connection = candidates.find((candidate) => candidate.webhookSecret && provider.webhooks!.verify(candidate.webhookSecret, body, signature));
  if (
    !connection?.webhookSecret ||
    connection.status !== "connected" ||
    !provider.webhooks.verify(connection.webhookSecret, body, signature)
  ) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  await db
    .update(connections)
    .set({ webhookLastPingAt: new Date() })
    .where(eq(connections.id, connection.id));

  /*
   * Acknowledge now, sync after the response. Ledger gives a receiver ten
   * seconds and counts a timeout as a failure — enough of them disable the
   * endpoint — and a sync that walks a real set of books does not reliably
   * fit in ten seconds. The cursor only advances on a 2xx, so a sync that
   * fails after this point is covered by the next ping.
   */
  const workspaceId = connection.workspaceId;
  after(async () => {
    try {
      await runSync(workspaceId);
    } catch (error) {
      console.error(
        `[webhooks] ${providerId} sync failed for workspace ${workspaceId}:`,
        error instanceof Error ? error.message : error,
      );
    }
  });

  return Response.json({ ok: true });
}
