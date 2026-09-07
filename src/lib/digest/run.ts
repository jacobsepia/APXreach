import { and, asc, desc, eq, gt, isNull, lte, or, sql } from "drizzle-orm";
import { activities, companies, contacts, db, emailMessages, mailboxes, sequenceEnrollments, sequences, tickets, user, workspaceMembers, workspaces } from "@/db";
import { money } from "@/lib/format";
import { sendFromMailbox } from "@/lib/mailbox/send";
import { slaState } from "@/lib/tickets/sla";
import { digestIsEmpty, renderDigest, type DigestSection } from "./format";

/*
 * The morning digest: one email per person, from their own mailbox to their
 * own address, with what needs doing today across the workspace — tasks due,
 * replies that came in overnight, tickets against their clocks, what the
 * books say is overdue, and what the sequences did. Nothing goes on a day
 * with nothing to say.
 */

const APP_URL = (process.env.BETTER_AUTH_URL ?? "https://apxreach.vercel.app").replace(/\/$/, "");
const MAX_ITEMS = 6;

function cap<T>(rows: T[]): { items: T[]; more: number } {
  return { items: rows.slice(0, MAX_ITEMS), more: Math.max(0, rows.length - MAX_ITEMS) };
}

export async function collectDigest(workspaceId: string, now = new Date()): Promise<DigestSection[]> {
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);
  const dayAgo = new Date(now.getTime() - 24 * 3_600_000);
  const today = now.toISOString().slice(0, 10);

  const [tasks, replies, openTickets, overdueCompanies, sentSteps, stoppedSeries] = await Promise.all([
    db
      .select({ id: activities.id, subject: activities.subject, dueAt: activities.dueAt, companyId: activities.companyId, companyName: companies.name })
      .from(activities)
      .leftJoin(companies, eq(activities.companyId, companies.id))
      .where(and(eq(activities.workspaceId, workspaceId), eq(activities.type, "task"), isNull(activities.completedAt), lte(activities.dueAt, endOfDay)))
      .orderBy(asc(activities.dueAt))
      .limit(50),
    db
      .select({ id: emailMessages.id, subject: emailMessages.subject, fromAddress: emailMessages.fromAddress, contactFirst: contacts.firstName, contactLast: contacts.lastName, companyName: companies.name })
      .from(emailMessages)
      .leftJoin(contacts, eq(emailMessages.contactId, contacts.id))
      .leftJoin(companies, eq(emailMessages.companyId, companies.id))
      .where(and(eq(emailMessages.workspaceId, workspaceId), eq(emailMessages.direction, "inbound"), gt(emailMessages.sentAt, dayAgo)))
      .orderBy(desc(emailMessages.sentAt))
      .limit(50),
    db
      .select({ id: tickets.id, subject: tickets.subject, status: tickets.status, createdAt: tickets.createdAt, firstRespondedAt: tickets.firstRespondedAt, resolvedAt: tickets.resolvedAt, firstResponseDueAt: tickets.firstResponseDueAt, resolveDueAt: tickets.resolveDueAt, companyName: companies.name })
      .from(tickets)
      .leftJoin(companies, eq(tickets.companyId, companies.id))
      .where(and(eq(tickets.workspaceId, workspaceId), eq(tickets.status, "open")))
      .orderBy(asc(tickets.resolveDueAt))
      .limit(100),
    db
      .select({ id: companies.id, name: companies.name, overdueCents: companies.overdueCents })
      .from(companies)
      .where(and(eq(companies.workspaceId, workspaceId), gt(companies.overdueCents, 0)))
      .orderBy(desc(companies.overdueCents))
      .limit(50),
    db
      .select({ count: sql<number>`count(*)` })
      .from(sequenceEnrollments)
      .where(and(eq(sequenceEnrollments.workspaceId, workspaceId), gt(sequenceEnrollments.lastSentAt, dayAgo))),
    db
      .select({ id: sequenceEnrollments.id, stopReason: sequenceEnrollments.stopReason, sequenceName: sequences.name, contactFirst: contacts.firstName, contactLast: contacts.lastName })
      .from(sequenceEnrollments)
      .innerJoin(sequences, eq(sequenceEnrollments.sequenceId, sequences.id))
      .innerJoin(contacts, eq(sequenceEnrollments.contactId, contacts.id))
      .where(and(eq(sequenceEnrollments.workspaceId, workspaceId), or(eq(sequenceEnrollments.status, "stopped"), eq(sequenceEnrollments.status, "completed")), gt(sequenceEnrollments.endedAt, dayAgo)))
      .limit(50),
  ]);

  const name = (first: string | null, last: string | null, fallback: string) => (first ? `${first} ${last ?? ""}`.replace(/ —$/, "").trim() : fallback);
  const taskRows = cap(tasks.map((task) => ({
    text: task.subject,
    note: task.dueAt ? (task.dueAt.toISOString().slice(0, 10) < today ? "overdue" : "due today") + (task.companyName ? ` · ${task.companyName}` : "") : undefined,
    href: task.companyId ? `/companies/${task.companyId}` : "/tasks",
  })));
  const replyRows = cap(replies.map((reply) => ({
    text: `${name(reply.contactFirst, reply.contactLast, reply.fromAddress)}: ${reply.subject}`,
    note: reply.companyName ?? undefined,
    href: "/inbox",
  })));
  const ticketRows = cap(
    openTickets
      .map((ticket) => ({ ticket, sla: slaState(ticket, now) }))
      .filter(({ sla }) => sla.tone === "breached" || sla.tone === "soon")
      .map(({ ticket, sla }) => ({ text: ticket.subject, note: `${sla.label}${ticket.companyName ? ` · ${ticket.companyName}` : ""}`, href: "/tickets" })),
  );
  const overdueTotal = overdueCompanies.reduce((sum, company) => sum + company.overdueCents, 0);
  const booksRows = cap(overdueCompanies.map((company) => ({ text: `${company.name} owes ${money(company.overdueCents)} overdue`, href: `/companies/${company.id}` })));
  const sequenceRows = cap([
    ...(Number(sentSteps[0]?.count ?? 0) > 0 ? [{ text: `${sentSteps[0].count} sequence ${Number(sentSteps[0].count) === 1 ? "email" : "emails"} went out`, href: "/sequences" }] : []),
    ...stoppedSeries.map((row) => ({ text: `${row.sequenceName} for ${name(row.contactFirst, row.contactLast, "a contact")} ended`, note: row.stopReason ?? "complete", href: "/sequences" })),
  ]);

  return [
    { title: "Tasks due", ...taskRows },
    { title: "Replies since yesterday", ...replyRows },
    { title: "Tickets against the clock", ...ticketRows },
    { title: overdueTotal ? `Overdue in the books (${money(overdueTotal)})` : "Overdue in the books", ...booksRows },
    { title: "Sequences", ...sequenceRows },
  ];
}

export type DigestOutcome = { userId: string; result: "sent" | "quiet" | "skipped" | "failed"; detail: string };

/** One person's digest, right now, whatever the time — the Settings button and the cron both come here. */
export async function sendDigestTo(workspaceId: string, userId: string, now = new Date(), force = false): Promise<DigestOutcome> {
  const [member] = await db
    .select({ digestEnabled: workspaceMembers.digestEnabled, name: user.name, email: user.email, workspaceName: workspaces.name })
    .from(workspaceMembers)
    .innerJoin(user, eq(user.id, workspaceMembers.userId))
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
    .limit(1);
  if (!member) return { userId, result: "skipped", detail: "Not a member" };
  if (!member.digestEnabled && !force) return { userId, result: "skipped", detail: "Digest turned off" };
  const [mailbox] = await db
    .select()
    .from(mailboxes)
    .where(and(eq(mailboxes.userId, userId), eq(mailboxes.workspaceId, workspaceId), eq(mailboxes.status, "connected")))
    .limit(1);
  if (!mailbox) return { userId, result: "skipped", detail: "No connected mailbox to send from" };

  const sections = await collectDigest(workspaceId, now);
  if (digestIsEmpty(sections) && !force) return { userId, result: "quiet", detail: "Nothing to report" };
  const mail = renderDigest({ workspaceName: member.workspaceName, personName: member.name, date: now, appUrl: APP_URL, sections });
  const sent = await sendFromMailbox(mailbox, { to: member.email, subject: mail.subject, text: mail.text, html: mail.html });
  if (!sent.ok) return { userId, result: "failed", detail: sent.error };
  await db.update(workspaceMembers).set({ digestLastSentAt: now }).where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)));
  return { userId, result: "sent", detail: `Sent to ${member.email}` };
}

/** The cron: everyone who wants one and has not had one in the last twenty hours. */
export async function sendDigests(now = new Date()): Promise<DigestOutcome[]> {
  const cutoff = new Date(now.getTime() - 20 * 3_600_000);
  const members = await db
    .select({ workspaceId: workspaceMembers.workspaceId, userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.digestEnabled, true), or(isNull(workspaceMembers.digestLastSentAt), lte(workspaceMembers.digestLastSentAt, cutoff))));
  const outcomes: DigestOutcome[] = [];
  for (const member of members) {
    try {
      outcomes.push(await sendDigestTo(member.workspaceId, member.userId, now));
    } catch (caught) {
      console.error("[digest]", member.userId, caught);
      outcomes.push({ userId: member.userId, result: "failed", detail: caught instanceof Error ? caught.message : "Unexpected failure" });
    }
  }
  return outcomes;
}

