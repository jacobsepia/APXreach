"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { contacts, db, mailboxes, sequenceEnrollments, sequences, sequenceSteps, syncedInvoices } from "@/db";
import { requireTenantOrThrow } from "@/lib/workspace";
import { dueAt } from "./plan";
import { runDueEnrollments, runEnrollmentNow } from "./run";

/*
 * Enrolling is a deliberate act by a signed-in person, from their own
 * mailbox, for one contact. The first step goes out immediately when it is a
 * day-0 step, so "remind them" means they are reminded now, not tomorrow.
 */

export type EnrollOutcome = { ok: true; message: string } | { ok: false; error: string };

export async function enrollInSequence(form: FormData): Promise<EnrollOutcome> {
  try {
    const tenant = await requireTenantOrThrow();
    const sequenceId = z.uuid().parse(form.get("sequenceId"));
    const contactId = z.uuid().parse(form.get("contactId"));
    const invoiceNumber = z.string().trim().max(200).parse(form.get("invoiceNumber") ?? "") || null;

    const [sequence] = await db.select().from(sequences).where(and(eq(sequences.id, sequenceId), eq(sequences.workspaceId, tenant.workspaceId))).limit(1);
    if (!sequence) return { ok: false, error: "That sequence is not in this workspace." };
    const [contact] = await db.select().from(contacts).where(and(eq(contacts.id, contactId), eq(contacts.workspaceId, tenant.workspaceId))).limit(1);
    if (!contact) return { ok: false, error: "That contact is not in this workspace." };
    if (!contact.email) return { ok: false, error: `${contact.firstName} has no email address on their record.` };
    const [mailbox] = await db
      .select({ id: mailboxes.id, emailAddress: mailboxes.emailAddress })
      .from(mailboxes)
      .where(and(eq(mailboxes.userId, tenant.userId), eq(mailboxes.workspaceId, tenant.workspaceId), eq(mailboxes.status, "connected")))
      .limit(1);
    if (!mailbox) return { ok: false, error: "Connect your mailbox in Settings first — the series sends as you." };

    if (invoiceNumber) {
      const [invoice] = await db
        .select({ companyId: syncedInvoices.companyId })
        .from(syncedInvoices)
        .where(and(eq(syncedInvoices.workspaceId, tenant.workspaceId), eq(syncedInvoices.number, invoiceNumber)))
        .limit(1);
      if (!invoice) return { ok: false, error: `Invoice ${invoiceNumber} is not open in the books.` };
      if (contact.companyId && invoice.companyId !== contact.companyId) return { ok: false, error: `Invoice ${invoiceNumber} belongs to a different company than ${contact.firstName}.` };
    }

    const [already] = await db
      .select({ id: sequenceEnrollments.id })
      .from(sequenceEnrollments)
      .where(and(eq(sequenceEnrollments.contactId, contact.id), eq(sequenceEnrollments.sequenceId, sequence.id), eq(sequenceEnrollments.status, "active")))
      .limit(1);
    if (already) return { ok: false, error: `${contact.firstName} is already in "${sequence.name}".` };

    const [first] = await db.select().from(sequenceSteps).where(eq(sequenceSteps.sequenceId, sequence.id)).orderBy(sequenceSteps.position).limit(1);
    if (!first) return { ok: false, error: "That sequence has no steps." };

    const now = new Date();
    const [created] = await db
      .insert(sequenceEnrollments)
      .values({
        workspaceId: tenant.workspaceId,
        sequenceId: sequence.id,
        contactId: contact.id,
        companyId: contact.companyId,
        mailboxId: mailbox.id,
        userId: tenant.userId,
        invoiceNumber,
        nextPosition: 0,
        nextDueAt: dueAt(now, { position: 0, dayOffset: first.dayOffset, templateKey: first.templateKey }),
        startedAt: now,
      })
      .returning({ id: sequenceEnrollments.id });

    const outcome = await runEnrollmentNow(created.id, now);
    revalidatePath("/sequences");
    if (contact.companyId) revalidatePath(`/companies/${contact.companyId}`);
    revalidatePath("/contacts");

    const name = `${contact.firstName} ${contact.lastName}`.replace(/ —$/, "").trim();
    if (outcome.result === "sent" || outcome.result === "completed") return { ok: true, message: `${name} is enrolled and the first email has gone from ${mailbox.emailAddress}.` };
    if (outcome.result === "waiting") return { ok: true, message: `${name} is enrolled. The first email goes on day ${first.dayOffset}.` };
    if (outcome.result === "stopped") return { ok: true, message: `${name} was enrolled but the series stopped straight away: ${outcome.detail}.` };
    return { ok: false, error: `${name} is enrolled, but the first email did not send: ${outcome.detail} It will be tried again on the next run.` };
  } catch (error) {
    if (error instanceof z.ZodError) return { ok: false, error: "Pick a contact and a sequence." };
    console.error("[sequences] enroll", error);
    return { ok: false, error: "Could not enrol right now. Nothing was sent." };
  }
}

export async function stopEnrollment(form: FormData): Promise<void> {
  const tenant = await requireTenantOrThrow();
  const id = z.uuid().parse(form.get("enrollmentId"));
  await db
    .update(sequenceEnrollments)
    .set({ status: "stopped", stopReason: `Stopped by ${tenant.userName}`, nextDueAt: null, endedAt: new Date() })
    .where(and(eq(sequenceEnrollments.id, id), eq(sequenceEnrollments.workspaceId, tenant.workspaceId), eq(sequenceEnrollments.status, "active")));
  revalidatePath("/sequences");
}

/** The button: run everything due in this workspace now rather than waiting for the morning. */
export async function runSequencesNow(): Promise<void> {
  const tenant = await requireTenantOrThrow();
  await runDueEnrollments(tenant.workspaceId);
  revalidatePath("/sequences");
  revalidatePath("/inbox");
}
