import { and, asc, desc, eq } from "drizzle-orm";
import { companies, contacts, db, pipelineStages, pipelines, tickets } from "@/db";

/*
 * The support pipeline is made the first time a workspace needs it, with the
 * four stages a ticket moves through. "Resolved" is the stage kind the deals
 * board calls "won", which is what lets one stage engine serve both.
 */

export const supportStages: Array<[name: string, kind: "open" | "won"]> = [
  ["New", "open"],
  ["In progress", "open"],
  ["Waiting on customer", "open"],
  ["Resolved", "won"],
];

export async function supportPipeline(workspaceId: string) {
  let [pipeline] = await db
    .select()
    .from(pipelines)
    .where(and(eq(pipelines.workspaceId, workspaceId), eq(pipelines.kind, "support")))
    .orderBy(asc(pipelines.displayOrder))
    .limit(1);
  if (!pipeline) {
    [pipeline] = await db.insert(pipelines).values({ workspaceId, name: "Support", displayOrder: 10, kind: "support" }).returning();
    await db.insert(pipelineStages).values(
      supportStages.map(([name, kind], position) => ({ pipelineId: pipeline.id, name, displayOrder: position, kind, winProbability: null })),
    );
  }
  const stages = await db.select().from(pipelineStages).where(eq(pipelineStages.pipelineId, pipeline.id)).orderBy(asc(pipelineStages.displayOrder));
  return { pipeline, stages };
}

export async function workspaceTickets(workspaceId: string) {
  return db
    .select({
      id: tickets.id,
      subject: tickets.subject,
      body: tickets.body,
      priority: tickets.priority,
      status: tickets.status,
      stageId: tickets.stageId,
      ownerName: tickets.ownerName,
      emailMessageId: tickets.emailMessageId,
      firstResponseDueAt: tickets.firstResponseDueAt,
      resolveDueAt: tickets.resolveDueAt,
      firstRespondedAt: tickets.firstRespondedAt,
      resolvedAt: tickets.resolvedAt,
      createdAt: tickets.createdAt,
      updatedAt: tickets.updatedAt,
      companyId: companies.id,
      companyName: companies.name,
      companyOverdueCents: companies.overdueCents,
      companyArCents: companies.arBalanceCents,
      contactId: contacts.id,
      contactFirst: contacts.firstName,
      contactLast: contacts.lastName,
      contactEmail: contacts.email,
    })
    .from(tickets)
    .leftJoin(companies, eq(tickets.companyId, companies.id))
    .leftJoin(contacts, eq(tickets.contactId, contacts.id))
    .where(eq(tickets.workspaceId, workspaceId))
    .orderBy(desc(tickets.createdAt))
    .limit(300);
}
