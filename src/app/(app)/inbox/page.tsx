import { and, desc, eq } from "drizzle-orm";
import { companies, contacts, db, emailMessages, mailboxes } from "@/db";
import { requireTenant } from "@/lib/workspace";
import { pollMailboxesNow } from "@/lib/actions";
import { isFresh, pollMailbox } from "@/lib/mailbox/poll";
import { sanitizeEmailHtml } from "@/lib/email-content";
import { EmptyState } from "@/components/ui";
import { InboxView, type InboxItem } from "@/components/inbox-view";
import { RefreshCw } from "lucide-react";

/*
 * The Inbox: every email between the workspace and the people in it, both
 * directions, newest first. Not a mail client — the mailbox is still the
 * person's own, and this is the CRM's view of it: only mail to or from
 * someone on a record, each one a step from that record.
 *
 * Opening the page polls the signed-in person's mailboxes when the last look
 * is more than two minutes old. That is what keeps replies near-live on a
 * plan whose scheduled jobs run once a day, without a poll on every render.
 */

export const dynamic = "force-dynamic";

export const metadata = { title: "Inbox" };

const stamp = new Intl.DateTimeFormat("en-CA", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export default async function InboxPage() {
  /* Membership is resolved on the server; everything below is one workspace. */
  const { workspaceId, userId } = await requireTenant();

  const mine = await db
    .select()
    .from(mailboxes)
    .where(
      and(
        eq(mailboxes.userId, userId),
        eq(mailboxes.workspaceId, workspaceId),
        eq(mailboxes.status, "connected"),
      ),
    );

  /* Poll only what has gone stale; a page refresh is not a reason to call
     Zoho twice in a minute. Errors land on the mailbox row, shown below. */
  for (const mailbox of mine) {
    if (!isFresh(mailbox)) await pollMailbox(mailbox);
  }
  const refreshed = await db
    .select({
      id: mailboxes.id,
      emailAddress: mailboxes.emailAddress,
      providerLabel: mailboxes.providerLabel,
      lastPolledAt: mailboxes.lastPolledAt,
      lastError: mailboxes.lastError,
    })
    .from(mailboxes)
    .where(
      and(
        eq(mailboxes.userId, userId),
        eq(mailboxes.workspaceId, workspaceId),
        eq(mailboxes.status, "connected"),
      ),
    );

  const messages = await db
    .select({
      id: emailMessages.id,
      direction: emailMessages.direction,
      fromAddress: emailMessages.fromAddress,
      toAddress: emailMessages.toAddress,
      subject: emailMessages.subject,
      bodyText: emailMessages.bodyText,
      bodyHtml: emailMessages.bodyHtml,
      attachments: emailMessages.attachments,
      sentAt: emailMessages.sentAt,
      contactId: contacts.id,
      contactFirst: contacts.firstName,
      contactLast: contacts.lastName,
      contactEmail: contacts.email,
      companyId: companies.id,
      companyName: companies.name,
    })
    .from(emailMessages)
    .leftJoin(contacts, eq(emailMessages.contactId, contacts.id))
    .leftJoin(companies, eq(emailMessages.companyId, companies.id))
    .where(eq(emailMessages.workspaceId, workspaceId))
    .orderBy(desc(emailMessages.sentAt))
    .limit(100);

  const from = refreshed[0]?.emailAddress ?? null;
  const inboundCount = messages.filter((m) => m.direction === "inbound").length;

  if (mine.length === 0) {
    return (
      <EmptyState
        title="Inbox"
        body="Connect your mailbox in Settings and the conversation with every contact — what you sent, what they answered — lands here and on their record."
        phase="Needs a connected mailbox"
      />
    );
  }

  /* Bodies are sanitized here, once, so the client renders what it is given.
     Inbound HTML came from a stranger's mail client and is never trusted raw. */
  const items: InboxItem[] = messages.map((m) => {
    const inbound = m.direction === "inbound";
    const contactName = m.contactId
      ? `${m.contactFirst} ${m.contactLast}`.replace(/ —$/, "").trim()
      : inbound
        ? m.fromAddress
        : m.toAddress;
    return {
      id: m.id,
      direction: inbound ? "inbound" : "outbound",
      fromAddress: m.fromAddress,
      toAddress: m.toAddress,
      subject: m.subject || "(no subject)",
      bodyText: m.bodyText,
      bodyHtml: m.bodyHtml ? sanitizeEmailHtml(m.bodyHtml) : null,
      attachments: m.attachments ?? [],
      sentAt: m.sentAt.toISOString(),
      contactId: m.contactId,
      contactName,
      contactEmail: m.contactEmail,
      companyId: m.companyId,
      companyName: m.companyName,
    };
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-[-0.035em]">
            <span className="gradient-text-flow">Inbox</span>
          </h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {messages.length} messages · {inboundCount} received · only mail to or from
            people on a record
          </p>
        </div>
        <form action={pollMailboxesNow}>
          <button
            type="submit"
            className="flex h-8 items-center gap-1.5 rounded-[10px] border border-input bg-white px-3 text-[13px] font-medium text-foreground hover:border-[#6b21a8]"
          >
            <RefreshCw className="size-3.5" />
            <span>Check for replies</span>
          </button>
        </form>
      </div>

      {refreshed.map((box) => (
        <p key={box.id} className="text-xs text-[var(--text-tertiary)]">
          {box.providerLabel} · {box.emailAddress}
          {box.lastPolledAt ? ` · last checked ${stamp.format(box.lastPolledAt)}` : ""}
          {box.lastError && (
            <span className="ml-2 font-medium text-[#b91c1c]">{box.lastError}</span>
          )}
        </p>
      ))}

      <InboxView items={items} from={from} />
    </div>
  );
}
