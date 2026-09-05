"use server";

import { headers } from "next/headers";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { activities, contacts, db, deals, pipelineStages, workspaces } from "@/db";

/** Match the deployed app's single-workspace access policy; load only on opening a record. */
export async function loadContactRecord(rawId: string) {
  const id = z.uuid().parse(rawId);
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("Sign in again to view this contact.");
  const [workspace] = await db.select({ id: workspaces.id }).from(workspaces).limit(1);
  if (!workspace) throw new Error("Workspace unavailable.");
  const [contact] = await db.select({ id: contacts.id }).from(contacts)
    .where(and(eq(contacts.id, id), eq(contacts.workspaceId, workspace.id))).limit(1);
  if (!contact) throw new Error("Contact unavailable.");
  const [history, associatedDeals] = await Promise.all([
    db.select({
      id: activities.id, type: activities.type, subject: activities.subject,
      body: activities.body, actorName: activities.actorName,
      occurredAt: activities.occurredAt, completedAt: activities.completedAt,
    }).from(activities)
      .where(and(eq(activities.contactId, id), eq(activities.workspaceId, workspace.id)))
      .orderBy(desc(activities.occurredAt)).limit(100),
    db.select({
      id: deals.id, name: deals.name, amountCents: deals.amountCents,
      closeDate: deals.closeDate, status: deals.status, stageName: pipelineStages.name,
    }).from(deals).innerJoin(pipelineStages, eq(deals.stageId, pipelineStages.id))
      .where(and(eq(deals.contactId, id), eq(deals.workspaceId, workspace.id)))
      .orderBy(desc(deals.createdAt)),
  ]);
  return { activities: history, deals: associatedDeals };
}
