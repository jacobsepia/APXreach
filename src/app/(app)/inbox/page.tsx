import { and, desc, eq, inArray } from "drizzle-orm";
import { companies, contacts, db, emailMessages, mailboxes, tickets } from "@/db";
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

  const inboundCount = messages.filter((m) => m.direction === "inbound").length;

  /* Which received emails already became tickets, so the button says so. */
  const ticketRows = messages.length
    ? await db
        .select({ id: tickets.id, emailMessageId: tickets.emailMessageId })
        .from(tickets)
        .where(and(eq(tickets.workspaceId, workspaceId), inArray(tickets.emailMessageId, messages.map((m) => m.id))))
    : [];
  const ticketByMessage = new Map(ticketRows.map((row) => [row.emailMessageId, row.id]));

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
      contactFirst: m.contactFirst ?? contactName,
      contactLast: m.contactLast === "—" ? "" : (m.contactLast ?? ""),
      contactEmail: m.contactEmail,
      companyId: m.companyId,
      companyName: m.companyName,
      ticketId: ticketByMessage.get(m.id) ?? null,
    };
  });

  /* The header is the top bar of the same box as the panes, so the two line
     up by construction: title, the counts as pills, the mailbox as a status
     chip, and the button. The messages are the page; this is its frame. */
  return (
    <div className="flex h-[calc(100vh-112px)] min-h-[480px] flex-col overflow-hidden rounded-[14px] border border-[rgba(21,24,28,0.08)] bg-white shadow-[0_1px_2px_rgba(21,24,28,0.04)] max-md:h-auto">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[var(--rule-soft)] bg-[linear-gradient(100deg,#faf6fe,#ffffff_60%)] px-5 py-3">
        <h1 className="font-display text-2xl font-bold tracking-[-0.035em]">
          <span className="gradient-text-flow">Inbox</span>
        </h1>
        <div className="flex items-center gap-1.5 text-xs font-medium">
          <span className="rounded-full bg-[var(--tint-strong)] px-2.5 py-1 text-[var(--accent-primary)]">
            {messages.length} {messages.length === 1 ? "message" : "messages"}
          </span>
          <span className="rounded-full bg-[color-mix(in_srgb,var(--accent-data)_18%,transparent)] px-2.5 py-1 text-[#4d7c0f]">
            {inboundCount} received
          </span>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2.5">
          {refreshed.map((box) => (
            <span
              key={box.id}
              className="flex items-center gap-2 rounded-full border border-[var(--rule-soft)] bg-white px-3 py-1.5 text-xs text-[var(--text-tertiary)]"
              title={box.lastError ?? `${box.providerLabel} is connected`}
            >
              <span className={`size-1.5 rounded-full ${box.lastError ? "bg-[#b91c1c]" : "bg-[#7cc00f]"}`} />
              <span className="font-medium text-foreground">{box.providerLabel}</span>
              <span>{box.emailAddress}</span>
              {box.lastPolledAt && <span>· checked {stamp.format(box.lastPolledAt)}</span>}
              {box.lastError && <span className="font-medium text-[#b91c1c]">· {box.lastError}</span>}
            </span>
          ))}
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
      </div>

      <InboxView items={items} />
    </div>
  );
}
