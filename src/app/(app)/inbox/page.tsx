import Link from "next/link";
import { headers } from "next/headers";
import { and, desc, eq } from "drizzle-orm";
import { companies, contacts, db, emailMessages, mailboxes } from "@/db";
import { auth } from "@/lib/auth";
import { pollMailboxesNow } from "@/lib/actions";
import { isFresh, pollMailbox } from "@/lib/mailbox/poll";
import { Avatar, Card, EmptyState, Pill } from "@/components/ui";
import { ComposeEmail } from "@/components/compose-email";
import { ArrowDownLeft, ArrowUpRight, RefreshCw } from "lucide-react";

/*
 * The Inbox: every email between the workspace and the people in it, both
 * directions, newest first. Not a mail client — the mailbox is still the
 * person's own, and this is the CRM's view of it: only mail to or from
 * someone on a record, each line a link back to that record.
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

function snippet(text: string, max = 140): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export default async function InboxPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  const mine = session
    ? await db
        .select()
        .from(mailboxes)
        .where(and(eq(mailboxes.userId, session.user.id), eq(mailboxes.status, "connected")))
    : [];

  /* Poll only what has gone stale; a page refresh is not a reason to call
     Zoho twice in a minute. Errors land on the mailbox row, shown below. */
  for (const mailbox of mine) {
    if (!isFresh(mailbox)) await pollMailbox(mailbox);
  }
  const refreshed = session
    ? await db
        .select({
          id: mailboxes.id,
          emailAddress: mailboxes.emailAddress,
          providerLabel: mailboxes.providerLabel,
          lastPolledAt: mailboxes.lastPolledAt,
          lastError: mailboxes.lastError,
        })
        .from(mailboxes)
        .where(and(eq(mailboxes.userId, session.user.id), eq(mailboxes.status, "connected")))
    : [];

  const messages = await db
    .select({
      id: emailMessages.id,
      direction: emailMessages.direction,
      fromAddress: emailMessages.fromAddress,
      toAddress: emailMessages.toAddress,
      subject: emailMessages.subject,
      bodyText: emailMessages.bodyText,
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

      <Card index={0} className="overflow-hidden">
        {messages.map((m, i) => {
          const inbound = m.direction === "inbound";
          const person =
            m.contactId
              ? `${m.contactFirst} ${m.contactLast}`.replace(/ —$/, "").trim()
              : inbound
                ? m.fromAddress
                : m.toAddress;
          return (
            <div
              key={m.id}
              className={`grid grid-cols-[28px_200px_minmax(0,1fr)_120px_88px] items-center gap-3 px-4 py-3 text-[13px] transition-colors hover:bg-[var(--tint)] ${i < messages.length - 1 ? "border-b border-[var(--rule-soft)]" : ""}`}
            >
              <span
                title={inbound ? "Received" : "Sent"}
                className={`flex size-7 items-center justify-center rounded-full ${
                  inbound
                    ? "bg-[color-mix(in_srgb,var(--accent-data)_18%,transparent)] text-[#4d7c0f]"
                    : "bg-[var(--tint-strong)] text-[var(--accent-primary)]"
                }`}
              >
                {inbound ? (
                  <ArrowDownLeft className="size-3.5" />
                ) : (
                  <ArrowUpRight className="size-3.5" />
                )}
              </span>

              <span className="flex min-w-0 items-center gap-2">
                <Avatar name={person} className="size-6" />
                <span className="min-w-0">
                  <span className="block truncate font-medium text-foreground">{person}</span>
                  {m.companyId && (
                    <Link
                      href={`/companies/${m.companyId}`}
                      className="block truncate text-xs text-[var(--text-tertiary)] hover:text-foreground"
                    >
                      {m.companyName}
                    </Link>
                  )}
                </span>
              </span>

              <span className="min-w-0">
                <span className="block truncate font-medium text-foreground">{m.subject}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {snippet(m.bodyText)}
                </span>
              </span>

              <span className="text-right text-xs text-[var(--text-tertiary)]">
                {stamp.format(m.sentAt)}
              </span>

              <span className="flex justify-end">
                {inbound && m.contactId && m.contactEmail ? (
                  <ComposeEmail
                    companyId={m.companyId ?? undefined}
                    from={from}
                    recipients={[{ id: m.contactId, name: person, email: m.contactEmail }]}
                    defaultRecipientId={m.contactId}
                    defaultSubject={/^re:/i.test(m.subject) ? m.subject : `Re: ${m.subject}`}
                    buttonLabel="Reply"
                  />
                ) : (
                  <Pill kind={inbound ? "ledger" : "customer"}>{inbound ? "Received" : "Sent"}</Pill>
                )}
              </span>
            </div>
          );
        })}
        {messages.length === 0 && (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            Nothing yet. Email a contact from their record, and their reply will show
            up here — mail from addresses Reach doesn&apos;t know is left in your
            mailbox where it was.
          </p>
        )}
      </Card>
    </div>
  );
}
