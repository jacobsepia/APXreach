"use server";

import { headers } from "next/headers";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { requireTenantOrThrow } from "@/lib/workspace";
import { sanitizeEmailHtml } from "@/lib/email-content";
import { workspaceTemplates } from "@/lib/email-template-store";
import { activities, contacts, db, deals, emailMessages, mailboxes, pipelineStages } from "@/db";

/** Read this member’s contact and its history only when the modal opens. */
export async function loadContactRecord(rawId: string) {
  const id = z.uuid().parse(rawId);
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("Sign in again to view this contact.");
  const { workspaceId } = await requireTenantOrThrow();
  const [contact] = await db.select({ id: contacts.id }).from(contacts)
    .where(and(eq(contacts.id, id), eq(contacts.workspaceId, workspaceId))).limit(1);
  if (!contact) throw new Error("Contact unavailable.");
  const [history, associatedDeals, messages, connectedMailboxes, templates] = await Promise.all([
    db.select({
      id: activities.id, type: activities.type, subject: activities.subject,
      body: activities.body, actorName: activities.actorName,
      occurredAt: activities.occurredAt, completedAt: activities.completedAt,
    }).from(activities)
      .where(and(eq(activities.contactId, id), eq(activities.workspaceId, workspaceId)))
      .orderBy(desc(activities.occurredAt)).limit(100),
    db.select({
      id: deals.id, name: deals.name, amountCents: deals.amountCents,
      closeDate: deals.closeDate, status: deals.status, stageName: pipelineStages.name,
    }).from(deals).innerJoin(pipelineStages, eq(deals.stageId, pipelineStages.id))
      .where(and(eq(deals.contactId, id), eq(deals.workspaceId, workspaceId)))
      .orderBy(desc(deals.createdAt)),
    db.select({
      id: emailMessages.id, direction: emailMessages.direction,
      fromAddress: emailMessages.fromAddress, toAddress: emailMessages.toAddress,
      subject: emailMessages.subject, bodyText: emailMessages.bodyText, bodyHtml: emailMessages.bodyHtml,
      sentAt: emailMessages.sentAt,
    }).from(emailMessages)
      .where(and(eq(emailMessages.contactId, id), eq(emailMessages.workspaceId, workspaceId)))
      .orderBy(desc(emailMessages.sentAt)).limit(100),
    db.select({ emailAddress: mailboxes.emailAddress, providerLabel: mailboxes.providerLabel })
      .from(mailboxes)
      .where(and(eq(mailboxes.userId, session.user.id), eq(mailboxes.workspaceId, workspaceId), eq(mailboxes.status, "connected")))
      .limit(1),
    workspaceTemplates(workspaceId),
  ]);
  return { activities: history, deals: associatedDeals, messages: messages.map(message => ({ ...message, bodyHtml: message.bodyHtml ? sanitizeEmailHtml(message.bodyHtml) : null })), mailbox: connectedMailboxes[0] ?? null, templates };
}
