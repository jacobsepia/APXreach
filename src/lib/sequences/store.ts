import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { companies, contacts, db, sequenceEnrollments, sequences, sequenceSteps } from "@/db";
import type { StepPlan } from "./plan";

/*
 * The sequences a workspace has. Four starters are written into the
 * workspace the first time anyone looks, keyed so they are never written
 * twice; from then on they are the workspace's own rows to change.
 */

type Starter = {
  key: string;
  name: string;
  description: string;
  kind: "collections" | "relationship";
  stopWhenPaid: boolean;
  stopOnReply: boolean;
  steps: Array<[dayOffset: number, templateKey: string]>;
};

export const starterSequences: Starter[] = [
  {
    key: "overdue-reminders",
    name: "Overdue invoice reminders",
    description: "Three reminders a week apart, each from your own mailbox. Stops the moment the books show the invoice paid, or the customer replies.",
    kind: "collections",
    stopWhenPaid: true,
    stopOnReply: true,
    steps: [[0, "invoice-overdue"], [7, "payment-follow-up"], [14, "payment-follow-up"]],
  },
  {
    key: "invoice-coming-due",
    name: "Invoice coming due",
    description: "One courteous heads-up about an invoice that is not yet late. Stops if it is paid first.",
    kind: "collections",
    stopWhenPaid: true,
    stopOnReply: true,
    steps: [[0, "invoice-due"]],
  },
  {
    key: "new-customer",
    name: "New customer welcome",
    description: "A welcome, a check-in two weeks on, and a request for feedback after six. Stops as soon as they write back, so a conversation replaces the schedule.",
    kind: "relationship",
    stopWhenPaid: false,
    stopOnReply: true,
    steps: [[0, "welcome"], [14, "checking-in"], [45, "feedback"]],
  },
  {
    key: "stay-in-touch",
    name: "Stay in touch",
    description: "A note to a contact who has gone quiet, and one more a month later if they stay quiet.",
    kind: "relationship",
    stopWhenPaid: false,
    stopOnReply: true,
    steps: [[0, "reconnect"], [30, "checking-in"]],
  },
];

export type SequenceWithSteps = typeof sequences.$inferSelect & { steps: StepPlan[] };

export async function workspaceSequences(workspaceId: string): Promise<SequenceWithSteps[]> {
  let rows = await db.select().from(sequences).where(eq(sequences.workspaceId, workspaceId)).orderBy(asc(sequences.createdAt));
  const present = new Set(rows.map((row) => row.key));
  for (const starter of starterSequences) {
    if (present.has(starter.key)) continue;
    const [created] = await db
      .insert(sequences)
      .values({ workspaceId, key: starter.key, name: starter.name, description: starter.description, kind: starter.kind, stopWhenPaid: starter.stopWhenPaid, stopOnReply: starter.stopOnReply })
      .returning();
    await db.insert(sequenceSteps).values(starter.steps.map(([dayOffset, templateKey], position) => ({ sequenceId: created.id, position, dayOffset, templateKey })));
    rows = [...rows, created];
  }
  const steps = rows.length
    ? await db.select().from(sequenceSteps).where(inArray(sequenceSteps.sequenceId, rows.map((row) => row.id))).orderBy(asc(sequenceSteps.position))
    : [];
  return rows.map((row) => ({
    ...row,
    steps: steps.filter((step) => step.sequenceId === row.id).map((step) => ({ position: step.position, dayOffset: step.dayOffset, templateKey: step.templateKey })),
  }));
}

/** Everyone enrolled in this workspace, newest first, with the names a table needs. */
export async function workspaceEnrollments(workspaceId: string) {
  return db
    .select({
      id: sequenceEnrollments.id,
      status: sequenceEnrollments.status,
      stopReason: sequenceEnrollments.stopReason,
      nextPosition: sequenceEnrollments.nextPosition,
      nextDueAt: sequenceEnrollments.nextDueAt,
      sentCount: sequenceEnrollments.sentCount,
      lastSentAt: sequenceEnrollments.lastSentAt,
      lastError: sequenceEnrollments.lastError,
      startedAt: sequenceEnrollments.startedAt,
      endedAt: sequenceEnrollments.endedAt,
      invoiceNumber: sequenceEnrollments.invoiceNumber,
      sequenceId: sequenceEnrollments.sequenceId,
      sequenceName: sequences.name,
      contactId: contacts.id,
      contactFirst: contacts.firstName,
      contactLast: contacts.lastName,
      contactEmail: contacts.email,
      companyId: companies.id,
      companyName: companies.name,
    })
    .from(sequenceEnrollments)
    .innerJoin(sequences, eq(sequenceEnrollments.sequenceId, sequences.id))
    .innerJoin(contacts, eq(sequenceEnrollments.contactId, contacts.id))
    .leftJoin(companies, eq(sequenceEnrollments.companyId, companies.id))
    .where(eq(sequenceEnrollments.workspaceId, workspaceId))
    .orderBy(desc(sequenceEnrollments.startedAt))
    .limit(200);
}

/** Active enrolments that name one of these invoices — what the company page shows instead of a button. */
export async function activeEnrollmentsForInvoices(workspaceId: string, invoiceNumbers: string[]) {
  if (!invoiceNumbers.length) return [];
  return db
    .select({
      invoiceNumber: sequenceEnrollments.invoiceNumber,
      nextPosition: sequenceEnrollments.nextPosition,
      nextDueAt: sequenceEnrollments.nextDueAt,
      sentCount: sequenceEnrollments.sentCount,
      sequenceName: sequences.name,
      contactFirst: contacts.firstName,
      contactLast: contacts.lastName,
    })
    .from(sequenceEnrollments)
    .innerJoin(sequences, eq(sequenceEnrollments.sequenceId, sequences.id))
    .innerJoin(contacts, eq(sequenceEnrollments.contactId, contacts.id))
    .where(and(eq(sequenceEnrollments.workspaceId, workspaceId), eq(sequenceEnrollments.status, "active"), inArray(sequenceEnrollments.invoiceNumber, invoiceNumbers)));
}
