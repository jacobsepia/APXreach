"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { activities, companies, contacts, db, emailMessages, tickets } from "@/db";
import { requireTenantOrThrow } from "@/lib/workspace";
import { isPriority, slaDeadlines, type Priority } from "./sla";
import { supportPipeline } from "./store";

/*
 * Opening, moving and resolving tickets. Every write is scoped to the
 * workspace the signed-in person belongs to; ids from forms are never
 * trusted on their own.
 */

const optional = z.string().trim().transform((value) => (value === "" ? null : value));

async function open(input: { subject: string; body: string; priority: Priority; companyId: string | null; contactId: string | null; emailMessageId?: string | null }) {
  const tenant = await requireTenantOrThrow();
  const { workspaceId } = tenant;

  if (input.companyId) {
    const [company] = await db.select({ id: companies.id }).from(companies).where(and(eq(companies.id, input.companyId), eq(companies.workspaceId, workspaceId))).limit(1);
    if (!company) throw new Error("That company is not in this workspace.");
  }
  let companyId = input.companyId;
  if (input.contactId) {
    const [contact] = await db.select({ id: contacts.id, companyId: contacts.companyId }).from(contacts).where(and(eq(contacts.id, input.contactId), eq(contacts.workspaceId, workspaceId))).limit(1);
    if (!contact) throw new Error("That contact is not in this workspace.");
    if (!companyId) companyId = contact.companyId;
  }

  const { pipeline, stages } = await supportPipeline(workspaceId);
  const first = stages[0];
  const now = new Date();
  const [created] = await db
    .insert(tickets)
    .values({
      workspaceId,
      pipelineId: pipeline.id,
      stageId: first.id,
      subject: input.subject,
      body: input.body,
      priority: input.priority,
      companyId,
      contactId: input.contactId,
      ownerName: tenant.userName,
      emailMessageId: input.emailMessageId ?? null,
      ...slaDeadlines(input.priority, now),
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: tickets.id });

  await db.insert(activities).values({
    workspaceId,
    type: "note",
    source: "reach",
    subject: `Ticket opened — ${input.subject}`,
    body: input.body.slice(0, 2000),
    actorName: tenant.userName,
    companyId,
    contactId: input.contactId,
    occurredAt: now,
  });
  revalidatePath("/tickets");
  revalidatePath("/inbox");
  if (companyId) revalidatePath(`/companies/${companyId}`);
  return created.id;
}

export async function createTicket(form: FormData): Promise<void> {
  const subject = z.string().trim().min(1, "Give the ticket a subject.").max(300).parse(form.get("subject"));
  const body = z.string().trim().max(20_000).parse(form.get("body") ?? "");
  const priority = form.get("priority");
  await open({
    subject,
    body: body || "(no details given)",
    priority: isPriority(priority) ? priority : "normal",
    companyId: optional.parse(form.get("companyId") ?? ""),
    contactId: optional.parse(form.get("contactId") ?? ""),
  });
}

export type TicketFromEmail = { ok: true; ticketId: string } | { ok: false; error: string };

/** The Inbox's "Make a ticket": the email's subject, text, sender and company become the ticket. */
export async function createTicketFromEmail(messageId: string): Promise<TicketFromEmail> {
  try {
    const { workspaceId } = await requireTenantOrThrow();
    const id = z.uuid().parse(messageId);
    const [message] = await db
      .select({ id: emailMessages.id, subject: emailMessages.subject, bodyText: emailMessages.bodyText, contactId: emailMessages.contactId, companyId: emailMessages.companyId, fromAddress: emailMessages.fromAddress, direction: emailMessages.direction })
      .from(emailMessages)
      .where(and(eq(emailMessages.id, id), eq(emailMessages.workspaceId, workspaceId)))
      .limit(1);
    if (!message) return { ok: false, error: "That email is not in this workspace." };
    const [existing] = await db.select({ id: tickets.id }).from(tickets).where(and(eq(tickets.emailMessageId, id), eq(tickets.workspaceId, workspaceId))).limit(1);
    if (existing) return { ok: true, ticketId: existing.id };
    const ticketId = await open({
      subject: message.subject.replace(/^(re|fwd?):\s*/i, "").trim() || "(no subject)",
      body: `From ${message.fromAddress}\n\n${message.bodyText.trim() || "(no message text)"}`.slice(0, 20_000),
      priority: "normal",
      companyId: message.companyId,
      contactId: message.contactId,
      emailMessageId: message.id,
    });
    return { ok: true, ticketId };
  } catch (error) {
    console.error("[tickets] from email", error);
    return { ok: false, error: error instanceof Error ? error.message : "Could not open a ticket from that email." };
  }
}

export async function setTicketStage(form: FormData): Promise<void> {
  const { workspaceId } = await requireTenantOrThrow();
  const ticketId = z.uuid().parse(form.get("ticketId"));
  const stageId = z.uuid().parse(form.get("stageId"));
  const { pipeline, stages } = await supportPipeline(workspaceId);
  const stage = stages.find((item) => item.id === stageId);
  if (!stage) throw new Error("That stage is not on the support board.");
  const [ticket] = await db.select().from(tickets).where(and(eq(tickets.id, ticketId), eq(tickets.workspaceId, workspaceId))).limit(1);
  if (!ticket) throw new Error("Ticket unavailable.");
  const now = new Date();
  const resolved = stage.kind === "won";
  /* Leaving "New" means someone has picked it up — that is the first response, for the clock's purposes. */
  const firstRespondedAt = ticket.firstRespondedAt ?? (stage.displayOrder > 0 ? now : null);
  await db
    .update(tickets)
    .set({
      stageId,
      pipelineId: pipeline.id,
      status: resolved ? "resolved" : "open",
      resolvedAt: resolved ? (ticket.resolvedAt ?? now) : null,
      firstRespondedAt,
      updatedAt: now,
    })
    .where(eq(tickets.id, ticket.id));
  if (resolved && ticket.status !== "resolved") {
    await db.insert(activities).values({
      workspaceId, type: "note", source: "reach", subject: `Ticket resolved — ${ticket.subject}`, body: `Resolved in ${Math.round((now.getTime() - ticket.createdAt.getTime()) / 3_600_000)} hours.`,
      companyId: ticket.companyId, contactId: ticket.contactId, occurredAt: now,
    });
  }
  revalidatePath("/tickets");
}

export async function deleteTicket(form: FormData): Promise<void> {
  const { workspaceId } = await requireTenantOrThrow();
  const ticketId = z.uuid().parse(form.get("ticketId"));
  await db.delete(tickets).where(and(eq(tickets.id, ticketId), eq(tickets.workspaceId, workspaceId)));
  revalidatePath("/tickets");
  revalidatePath("/inbox");
}

/** The stage list for the client pickers, without exposing the pipeline row. */
export async function supportStageOptions(): Promise<{ id: string; name: string }[]> {
  const { workspaceId } = await requireTenantOrThrow();
  const { stages } = await supportPipeline(workspaceId);
  return stages.map((stage) => ({ id: stage.id, name: stage.name }));
}
