import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { activities, contacts, db, emailMessages, mailboxes } from "@/db";
import { getMailboxProvider } from "@/lib/mailbox/providers";
import { accessTokenFor } from "@/lib/mailbox/send";

/*
 * The reply poll: what turns a send button into a CRM.
 *
 * Reach reads the top of each connected inbox and keeps the mail that came
 * from someone it knows. Only that: a CRM inbox is the conversation with
 * your contacts, not a second copy of everything the mailbox receives, so a
 * newsletter or a cold pitch from a stranger is never written down. Matching
 * is by the sender's address against the contacts table, which is why the
 * books sync now carries the person's email across — without it there is
 * nobody to match.
 *
 * Each match is recorded twice, like a send: the message in email_messages,
 * where the Inbox reads it, and a line on the timeline, where a person looks
 * at a record. Bodies are fetched only for matches, so a busy inbox costs one
 * listing call and nothing more.
 */

type MailboxRow = typeof mailboxes.$inferSelect;

export interface PollOutcome {
  mailboxId: string;
  ok: boolean;
  /** Messages written — matched, new, and not seen before. */
  added: number;
  /** True when the provider cannot read mail (Gmail, until the assessment). */
  skipped?: boolean;
  error?: string;
}

/** Recent enough that another poll would just repeat the last one. */
export const POLL_FRESH_FOR_MS = 2 * 60_000;

export function isFresh(mailbox: Pick<MailboxRow, "lastPolledAt">): boolean {
  return (
    mailbox.lastPolledAt !== null &&
    Date.now() - mailbox.lastPolledAt.getTime() < POLL_FRESH_FOR_MS
  );
}

export async function pollMailbox(mailbox: MailboxRow): Promise<PollOutcome> {
  const provider = getMailboxProvider(mailbox.provider);
  if (!provider?.fetchSince) {
    return { mailboxId: mailbox.id, ok: true, added: 0, skipped: true };
  }

  const fail = async (error: string): Promise<PollOutcome> => {
    await db
      .update(mailboxes)
      .set({ lastError: error, lastPolledAt: new Date() })
      .where(eq(mailboxes.id, mailbox.id));
    return { mailboxId: mailbox.id, ok: false, added: 0, error };
  };

  const token = await accessTokenFor(mailbox);
  if (!token.ok) return fail(token.error);

  const scope = { emailAddress: mailbox.emailAddress, providerAccountId: mailbox.providerAccountId };
  const fetched = await provider.fetchSince(token.value, scope, mailbox.syncCursor);
  if (!fetched.ok) return fail(fetched.error);

  const { messages, cursor } = fetched.value;

  /* Who Reach knows, by address. One query, then a map. */
  const known = await db
    .select({
      id: contacts.id,
      email: contacts.email,
      companyId: contacts.companyId,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
    })
    .from(contacts)
    .where(and(eq(contacts.workspaceId, mailbox.workspaceId), isNotNull(contacts.email)));
  const byEmail = new Map(known.map((c) => [c.email!.toLowerCase(), c]));

  const candidates = messages.filter(
    (m) => m.fromAddress !== mailbox.emailAddress.toLowerCase() && byEmail.has(m.fromAddress),
  );

  /* Already written on an earlier poll — a cursor that moved back must not
     produce duplicates on the timeline. */
  const seen = new Set<string>();
  if (candidates.length > 0) {
    const rows = await db
      .select({ providerMessageId: emailMessages.providerMessageId })
      .from(emailMessages)
      .where(
        and(
          eq(emailMessages.mailboxId, mailbox.id),
          inArray(
            emailMessages.providerMessageId,
            candidates.map((m) => m.providerMessageId),
          ),
        ),
      );
    for (const row of rows) if (row.providerMessageId) seen.add(row.providerMessageId);
  }

  let added = 0;
  for (const message of candidates) {
    if (seen.has(message.providerMessageId)) continue;
    const contact = byEmail.get(message.fromAddress)!;

    let bodyText = message.bodyText;
    let bodyHtml = message.bodyHtml;
    if (bodyText === null && bodyHtml === null && provider.fetchBody) {
      const body = await provider.fetchBody(token.value, scope, message.providerRef);
      if (body.ok) {
        bodyText = body.value.bodyText;
        bodyHtml = body.value.bodyHtml;
      }
      /* A body that would not come is not a reason to lose the message. */
    }
    const text = bodyText ?? message.snippet;

    await db.insert(emailMessages).values({
      workspaceId: mailbox.workspaceId,
      mailboxId: mailbox.id,
      companyId: contact.companyId,
      contactId: contact.id,
      direction: "inbound",
      fromAddress: message.fromAddress,
      toAddress: mailbox.emailAddress,
      subject: message.subject,
      bodyText: text,
      bodyHtml,
      providerMessageId: message.providerMessageId,
      sentAt: message.receivedAt,
    });

    await db.insert(activities).values({
      workspaceId: mailbox.workspaceId,
      type: "email",
      subject: `Email received — ${message.subject}`,
      body: `From ${message.fromName ?? message.fromAddress}\n\n${text}`,
      companyId: contact.companyId,
      contactId: contact.id,
      actorName: message.fromName ?? `${contact.firstName} ${contact.lastName}`.trim(),
      occurredAt: message.receivedAt,
    });

    await db
      .update(contacts)
      .set({ lastActivityAt: message.receivedAt })
      .where(eq(contacts.id, contact.id));

    added++;
  }

  await db
    .update(mailboxes)
    .set({ syncCursor: cursor, lastPolledAt: new Date(), lastError: null })
    .where(eq(mailboxes.id, mailbox.id));

  return { mailboxId: mailbox.id, ok: true, added };
}

/** Every connected mailbox, each contained so one bad grant stops nothing else. */
export async function pollAllMailboxes(): Promise<PollOutcome[]> {
  const rows = await db.select().from(mailboxes).where(eq(mailboxes.status, "connected"));
  const outcomes: PollOutcome[] = [];
  for (const row of rows) {
    try {
      outcomes.push(await pollMailbox(row));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[mailbox] poll failed for ${row.emailAddress}: ${message}`);
      outcomes.push({ mailboxId: row.id, ok: false, added: 0, error: message });
    }
  }
  return outcomes;
}
