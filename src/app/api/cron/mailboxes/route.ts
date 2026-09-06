import { cronAuthorized } from "@/lib/cron-auth";
import { pollAllMailboxes } from "@/lib/mailbox/poll";
import { runDueEnrollments } from "@/lib/sequences/run";

/*
 * The morning run. Two things, in this order:
 *
 *   1. Poll every mailbox for replies. The Inbox page polls on its own when
 *      it is opened, so this is the backstop for a day nobody opens it.
 *   2. Send the sequence steps that are due. After the poll on purpose: a
 *      reply that arrived overnight stops the series before a reminder goes.
 *
 * One route for both because the plan allows two schedules and the books
 * sync has the other.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const outcomes = await pollAllMailboxes();
  const sequences = await runDueEnrollments();
  return Response.json({
    mailboxes: outcomes.length,
    added: outcomes.reduce((n, o) => n + o.added, 0),
    failed: outcomes.filter((o) => !o.ok).length,
    sequences: {
      due: sequences.length,
      sent: sequences.filter((o) => o.result === "sent" || o.result === "completed").length,
      stopped: sequences.filter((o) => o.result === "stopped").length,
      failed: sequences.filter((o) => o.result === "failed").length,
    },
  });
}
