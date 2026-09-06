import { cronAuthorized } from "@/lib/cron-auth";
import { pollAllMailboxes } from "@/lib/mailbox/poll";

/*
 * The scheduled reply poll — the backstop, not the mechanism. The Inbox page
 * polls on its own when it is opened and its last look is more than two
 * minutes old, which is what keeps replies near-live for a person who is
 * actually working. This exists so the timeline still fills in on a day
 * nobody opens the Inbox, and it runs as often as the plan allows.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const outcomes = await pollAllMailboxes();
  return Response.json({
    mailboxes: outcomes.length,
    added: outcomes.reduce((n, o) => n + o.added, 0),
    failed: outcomes.filter((o) => !o.ok).length,
  });
}
