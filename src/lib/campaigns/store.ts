import { and, asc, desc, eq } from "drizzle-orm";
import { campaignRecipients, campaigns, companies, contactTags, contacts, db, tags } from "@/db";
import { buildAudience, type AudienceCandidate } from "./audience";

/* Reading campaigns and working out who they would reach. */

export async function workspaceCampaigns(workspaceId: string) {
  return db
    .select({
      id: campaigns.id, name: campaigns.name, subject: campaigns.subject, status: campaigns.status,
      sentCount: campaigns.sentCount, failedCount: campaigns.failedCount, heldCount: campaigns.heldCount,
      lastError: campaigns.lastError, sentAt: campaigns.sentAt, createdAt: campaigns.createdAt,
      tagId: campaigns.tagId, tagName: tags.name,
    })
    .from(campaigns)
    .leftJoin(tags, eq(tags.id, campaigns.tagId))
    .where(eq(campaigns.workspaceId, workspaceId))
    .orderBy(desc(campaigns.createdAt))
    .limit(100);
}

export async function campaignById(workspaceId: string, id: string) {
  const [row] = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.id, id), eq(campaigns.workspaceId, workspaceId)))
    .limit(1);
  return row ?? null;
}

/** The people a tag covers, with what the books say about each — the input to the audience rules. */
export async function audienceCandidates(workspaceId: string, tagId: string | null): Promise<AudienceCandidate[]> {
  if (!tagId) return [];
  const rows = await db
    .select({
      contactId: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      unsubscribedAt: contacts.unsubscribedAt,
      companyName: companies.name,
      companyOverdueCents: companies.overdueCents,
    })
    .from(contactTags)
    .innerJoin(contacts, eq(contacts.id, contactTags.contactId))
    .innerJoin(tags, eq(tags.id, contactTags.tagId))
    .leftJoin(companies, eq(companies.id, contacts.companyId))
    .where(and(eq(tags.workspaceId, workspaceId), eq(tags.id, tagId), eq(contacts.workspaceId, workspaceId)))
    .orderBy(asc(contacts.firstName), asc(contacts.lastName));
  return rows.map((row) => ({
    contactId: row.contactId,
    name: `${row.firstName} ${row.lastName}`.replace(/ —$/, "").trim(),
    email: row.email,
    unsubscribedAt: row.unsubscribedAt,
    companyOverdueCents: Number(row.companyOverdueCents ?? 0),
    companyName: row.companyName,
  }));
}

/** What the page shows before Send: who would get it, and who would not, and why. */
export async function previewAudience(workspaceId: string, tagId: string | null, holdDunning: boolean) {
  return buildAudience(await audienceCandidates(workspaceId, tagId), { holdDunning });
}

export async function campaignResults(campaignId: string) {
  return db
    .select({
      id: campaignRecipients.id, email: campaignRecipients.email, status: campaignRecipients.status,
      reason: campaignRecipients.reason, sentAt: campaignRecipients.sentAt,
      firstName: contacts.firstName, lastName: contacts.lastName, contactId: contacts.id,
    })
    .from(campaignRecipients)
    .innerJoin(contacts, eq(contacts.id, campaignRecipients.contactId))
    .where(eq(campaignRecipients.campaignId, campaignId))
    .orderBy(asc(campaignRecipients.status), asc(contacts.firstName))
    .limit(1000);
}
