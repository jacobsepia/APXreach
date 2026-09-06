import { and, asc, eq, gt, gte, lte } from "drizzle-orm";
import { activities, companies, connections, contacts, db, emailMessages, mailboxes, sequenceEnrollments, sequences, sequenceSteps, syncedInvoices, user, workspaces } from "@/db";
import { prepareEmailBody, sanitizeEmailHtml } from "@/lib/email-content";
import { renderEmailTemplate } from "@/lib/email-templates";
import { contactTemplateContext, workspaceTemplates } from "@/lib/email-template-store";
import { sendFromMailbox } from "@/lib/mailbox/send";
import { runSync } from "@/lib/sync";
import { dueAt, stopReason } from "./plan";

/*
 * The runner. Once a day, and whenever someone presses "Run now", every
 * enrolment whose next step is due is looked at in this order:
 *
 *   1. Should it stop? The books are re-read first so "paid" means paid as of
 *      now, not as of last night. A reply from the contact stops it too.
 *   2. Can it send? The enroller's mailbox has to be connected and the
 *      template has to render with nothing missing; a step that cannot go
 *      out is recorded, not skipped, and is tried again next time.
 *   3. Send, record it on the contact exactly as a hand-written email is
 *      recorded, and schedule the next step from the enrolment date.
 */

export type RunOutcome = { enrollmentId: string; result: "sent" | "stopped" | "completed" | "failed" | "waiting"; detail: string };

type Enrollment = typeof sequenceEnrollments.$inferSelect;

function invoiceValues(invoice: { number: string; outstandingCents: number; dueDate: string }, currency: string) {
  return {
    invoice_number: invoice.number,
    invoice_balance: new Intl.NumberFormat("en-CA", { style: "currency", currency, currencyDisplay: "code" }).format(invoice.outstandingCents / 100),
    invoice_due_date: new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(invoice.dueDate + "T00:00:00Z")),
  };
}

async function finish(enrollment: Enrollment, status: "stopped" | "completed", reason: string | null, now: Date) {
  await db
    .update(sequenceEnrollments)
    .set({ status, stopReason: reason, nextDueAt: null, endedAt: now, lastError: null })
    .where(eq(sequenceEnrollments.id, enrollment.id));
}

async function note(enrollment: Enrollment, sequenceName: string, subject: string, body: string) {
  await db.insert(activities).values({
    workspaceId: enrollment.workspaceId,
    type: "note",
    source: "reach",
    subject,
    body,
    actorName: `Reach · ${sequenceName}`,
    companyId: enrollment.companyId,
    contactId: enrollment.contactId,
  });
}

export async function runEnrollment(enrollment: Enrollment, now = new Date()): Promise<RunOutcome> {
  const [sequence] = await db.select().from(sequences).where(eq(sequences.id, enrollment.sequenceId)).limit(1);
  if (!sequence) {
    await finish(enrollment, "stopped", "Sequence removed", now);
    return { enrollmentId: enrollment.id, result: "stopped", detail: "Sequence removed" };
  }
  const steps = await db.select().from(sequenceSteps).where(eq(sequenceSteps.sequenceId, sequence.id)).orderBy(asc(sequenceSteps.position));
  const step = steps[enrollment.nextPosition];
  if (!step) {
    await finish(enrollment, "completed", null, now);
    return { enrollmentId: enrollment.id, result: "completed", detail: "All steps sent" };
  }

  const [contact] = await db.select().from(contacts).where(eq(contacts.id, enrollment.contactId)).limit(1);
  if (!contact?.email) {
    await finish(enrollment, "stopped", "Contact has no email address", now);
    return { enrollmentId: enrollment.id, result: "stopped", detail: "Contact has no email address" };
  }

  /* 1. Stop? */
  const [replied] = sequence.stopOnReply
    ? await db
        .select({ id: emailMessages.id })
        .from(emailMessages)
        .where(and(eq(emailMessages.contactId, contact.id), eq(emailMessages.direction, "inbound"), gt(emailMessages.sentAt, enrollment.startedAt)))
        .limit(1)
    : [];
  const [openInvoice] = enrollment.invoiceNumber
    ? await db
        .select({ number: syncedInvoices.number, outstandingCents: syncedInvoices.outstandingCents, dueDate: syncedInvoices.dueDate })
        .from(syncedInvoices)
        .where(and(eq(syncedInvoices.workspaceId, enrollment.workspaceId), eq(syncedInvoices.number, enrollment.invoiceNumber), gt(syncedInvoices.outstandingCents, 0)))
        .limit(1)
    : [];
  const [company] = enrollment.companyId
    ? await db.select({ overdueCents: companies.overdueCents }).from(companies).where(eq(companies.id, enrollment.companyId)).limit(1)
    : [];
  const reason = stopReason({
    stopWhenPaid: sequence.stopWhenPaid,
    stopOnReply: sequence.stopOnReply,
    kind: sequence.kind,
    invoiceNumber: enrollment.invoiceNumber,
    invoiceOpen: Boolean(openInvoice),
    overdueCents: company?.overdueCents ?? 0,
    replied: Boolean(replied),
  });
  if (reason) {
    await finish(enrollment, "stopped", reason, now);
    await note(enrollment, sequence.name, `${sequence.name} stopped — ${reason}`, `Stopped after ${enrollment.sentCount} ${enrollment.sentCount === 1 ? "email" : "emails"}. ${reason}.`);
    return { enrollmentId: enrollment.id, result: "stopped", detail: reason };
  }

  /* 2. Can it send? */
  const [mailbox] = await db.select().from(mailboxes).where(and(eq(mailboxes.id, enrollment.mailboxId), eq(mailboxes.status, "connected"))).limit(1);
  if (!mailbox) {
    const detail = "The mailbox that sends this series is disconnected. Reconnect it in Settings.";
    await db.update(sequenceEnrollments).set({ lastError: detail }).where(eq(sequenceEnrollments.id, enrollment.id));
    return { enrollmentId: enrollment.id, result: "failed", detail };
  }
  const [sender] = await db.select({ name: user.name }).from(user).where(eq(user.id, enrollment.userId)).limit(1);
  const templates = await workspaceTemplates(enrollment.workspaceId);
  const template = templates.find((item) => item.key === step.templateKey);
  if (!template) {
    await finish(enrollment, "stopped", `Template "${step.templateKey}" is missing`, now);
    return { enrollmentId: enrollment.id, result: "stopped", detail: "Template missing" };
  }
  const [workspace] = await db.select({ name: workspaces.name }).from(workspaces).where(eq(workspaces.id, enrollment.workspaceId)).limit(1);
  const [connection] = await db.select({ currency: connections.baseCurrency }).from(connections).where(eq(connections.workspaceId, enrollment.workspaceId)).limit(1);
  const context = await contactTemplateContext(enrollment.workspaceId, contact.id, sender?.name ?? "", workspace?.name ?? "", enrollment.userId);
  const values: Record<string, string> = { ...context.values };

  if (template.invoiceMode !== "none") {
    const today = now.toISOString().slice(0, 10);
    const eligible = context.invoices.filter((inv) => (template.invoiceMode === "overdue" ? inv.dueDate < today : inv.dueDate >= today));
    const invoice = enrollment.invoiceNumber ? (openInvoice ?? null) : (eligible[0] ?? null);
    if (!invoice) {
      const detail = enrollment.invoiceNumber ? `Invoice ${enrollment.invoiceNumber} is no longer open` : "No eligible invoice in the books";
      await finish(enrollment, "stopped", detail, now);
      return { enrollmentId: enrollment.id, result: "stopped", detail };
    }
    const currency = connection?.currency ?? context.currency;
    if (!currency || !/^[A-Z]{3}$/.test(currency)) {
      const detail = "The books currency is unavailable; sync the books and try again.";
      await db.update(sequenceEnrollments).set({ lastError: detail }).where(eq(sequenceEnrollments.id, enrollment.id));
      return { enrollmentId: enrollment.id, result: "failed", detail };
    }
    Object.assign(values, invoiceValues(invoice, currency));
  }

  const rendered = renderEmailTemplate(template, values);
  if (rendered.missing.length) {
    const detail = `The "${template.name}" template needs ${rendered.missing.join(", ")}, which a sequence cannot fill in. Send it by hand or change the step.`;
    await finish(enrollment, "stopped", detail, now);
    return { enrollmentId: enrollment.id, result: "stopped", detail };
  }

  /* 3. Send and record. */
  let body: { text: string; html?: string };
  try {
    body = prepareEmailBody("", sanitizeEmailHtml(rendered.bodyHtml));
  } catch (caught) {
    const detail = caught instanceof Error ? caught.message : "The email could not be prepared.";
    await db.update(sequenceEnrollments).set({ lastError: detail }).where(eq(sequenceEnrollments.id, enrollment.id));
    return { enrollmentId: enrollment.id, result: "failed", detail };
  }
  const sent = await sendFromMailbox(mailbox, { to: contact.email, subject: rendered.subject, text: body.text, html: body.html });
  if (!sent.ok) {
    await db.update(sequenceEnrollments).set({ lastError: sent.error }).where(eq(sequenceEnrollments.id, enrollment.id));
    return { enrollmentId: enrollment.id, result: "failed", detail: sent.error };
  }

  await db.insert(emailMessages).values({
    workspaceId: enrollment.workspaceId,
    mailboxId: mailbox.id,
    companyId: enrollment.companyId,
    contactId: contact.id,
    direction: "outbound",
    fromAddress: mailbox.emailAddress,
    toAddress: contact.email,
    subject: rendered.subject,
    bodyText: body.text,
    bodyHtml: body.html ?? null,
    providerMessageId: sent.value.providerMessageId,
    sentAt: now,
  });
  await db.insert(activities).values({
    workspaceId: enrollment.workspaceId,
    type: "email",
    source: "reach",
    subject: `Email sent — ${rendered.subject}`,
    body: `To ${contact.email}\n\n${body.text}`,
    actorName: `Reach · ${sequence.name}`,
    companyId: enrollment.companyId,
    contactId: contact.id,
    occurredAt: now,
  });
  await db.update(contacts).set({ lastActivityAt: now }).where(eq(contacts.id, contact.id));

  const next = steps[enrollment.nextPosition + 1];
  if (next) {
    await db
      .update(sequenceEnrollments)
      .set({ sentCount: enrollment.sentCount + 1, lastSentAt: now, nextPosition: enrollment.nextPosition + 1, nextDueAt: dueAt(enrollment.startedAt, next), lastError: null })
      .where(eq(sequenceEnrollments.id, enrollment.id));
    return { enrollmentId: enrollment.id, result: "sent", detail: `Sent "${rendered.subject}"; next step day ${next.dayOffset}` };
  }
  await db
    .update(sequenceEnrollments)
    .set({ sentCount: enrollment.sentCount + 1, lastSentAt: now, nextPosition: enrollment.nextPosition + 1, nextDueAt: null, status: "completed", endedAt: now, lastError: null })
    .where(eq(sequenceEnrollments.id, enrollment.id));
  return { enrollmentId: enrollment.id, result: "completed", detail: `Sent "${rendered.subject}"; series complete` };
}

/**
 * Every due enrolment, across every workspace (the cron) or one (the button).
 * The books are synced once per workspace first, so a payment that landed
 * this morning stops this morning's reminder.
 */
export async function runDueEnrollments(workspaceId?: string, now = new Date()): Promise<RunOutcome[]> {
  const due = await db
    .select()
    .from(sequenceEnrollments)
    .where(and(eq(sequenceEnrollments.status, "active"), lte(sequenceEnrollments.nextDueAt, now), ...(workspaceId ? [eq(sequenceEnrollments.workspaceId, workspaceId)] : [])))
    .orderBy(asc(sequenceEnrollments.nextDueAt));
  if (!due.length) return [];

  const synced = new Set<string>();
  const outcomes: RunOutcome[] = [];
  for (const enrollment of due) {
    if (!synced.has(enrollment.workspaceId)) {
      synced.add(enrollment.workspaceId);
      const [connection] = await db.select({ id: connections.id }).from(connections).where(and(eq(connections.workspaceId, enrollment.workspaceId), eq(connections.status, "connected"))).limit(1);
      if (connection) {
        try { await runSync(enrollment.workspaceId); } catch (caught) { console.error("[sequences] sync before run failed:", caught); }
      }
    }
    try {
      outcomes.push(await runEnrollment(enrollment, now));
    } catch (caught) {
      const detail = caught instanceof Error ? caught.message : "Unexpected failure";
      console.error("[sequences] enrolment", enrollment.id, caught);
      await db.update(sequenceEnrollments).set({ lastError: detail }).where(eq(sequenceEnrollments.id, enrollment.id));
      outcomes.push({ enrollmentId: enrollment.id, result: "failed", detail });
    }
  }
  return outcomes;
}

/** Enrolments whose first step is due right now — used right after enrolling. */
export async function runEnrollmentNow(enrollmentId: string, now = new Date()): Promise<RunOutcome> {
  const [enrollment] = await db
    .select()
    .from(sequenceEnrollments)
    .where(and(eq(sequenceEnrollments.id, enrollmentId), eq(sequenceEnrollments.status, "active"), gte(sequenceEnrollments.nextPosition, 0)))
    .limit(1);
  if (!enrollment) return { enrollmentId, result: "waiting", detail: "Not active" };
  if (!enrollment.nextDueAt || enrollment.nextDueAt > now) return { enrollmentId, result: "waiting", detail: "First step is scheduled" };
  return runEnrollment(enrollment, now);
}
