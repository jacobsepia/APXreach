import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { contactTags, contacts, db, tags } from "@/db";

/* Reading tags. Writes live in tag-actions.ts. */

export const tagColors = ["plum", "lime", "amber", "rose", "sky", "slate"] as const;
export type TagColor = (typeof tagColors)[number];

/** The chip styles, one per colour, so a workspace's tags read as a set. */
export const tagStyles: Record<TagColor, string> = {
  plum: "bg-[var(--tint-strong)] text-[var(--accent-primary)]",
  lime: "bg-[#eef7dd] text-[#4d7c0f]",
  amber: "bg-[#fef3c7] text-[#a16207]",
  rose: "bg-[#fee2e2] text-[#b91c1c]",
  sky: "bg-[#e0f2fe] text-[#0369a1]",
  slate: "bg-[#eef1f4] text-[#475569]",
};

export function tagStyle(color: string): string {
  return tagStyles[(color as TagColor) in tagStyles ? (color as TagColor) : "plum"];
}

export type Tag = { id: string; name: string; color: string; count: number };

/** Every tag in the workspace, with how many people carry it. */
export async function workspaceTags(workspaceId: string): Promise<Tag[]> {
  const rows = await db
    .select({ id: tags.id, name: tags.name, color: tags.color, count: sql<number>`count(${contactTags.id})` })
    .from(tags)
    .leftJoin(contactTags, eq(contactTags.tagId, tags.id))
    .where(eq(tags.workspaceId, workspaceId))
    .groupBy(tags.id, tags.name, tags.color)
    .orderBy(asc(tags.name));
  return rows.map((row) => ({ ...row, count: Number(row.count) }));
}

/** Which tags each of these contacts carries, keyed by contact id. */
export async function tagsForContacts(workspaceId: string, contactIds: string[]): Promise<Map<string, Array<{ id: string; name: string; color: string }>>> {
  const byContact = new Map<string, Array<{ id: string; name: string; color: string }>>();
  if (!contactIds.length) return byContact;
  const rows = await db
    .select({ contactId: contactTags.contactId, id: tags.id, name: tags.name, color: tags.color })
    .from(contactTags)
    .innerJoin(tags, eq(tags.id, contactTags.tagId))
    .where(and(eq(tags.workspaceId, workspaceId), inArray(contactTags.contactId, contactIds)))
    .orderBy(asc(tags.name));
  for (const row of rows) {
    const list = byContact.get(row.contactId) ?? [];
    list.push({ id: row.id, name: row.name, color: row.color });
    byContact.set(row.contactId, list);
  }
  return byContact;
}

/** The people carrying a tag — what a campaign or a bulk enrolment sends to. */
export async function contactsWithTag(workspaceId: string, tagId: string) {
  return db
    .select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName, email: contacts.email, companyId: contacts.companyId })
    .from(contactTags)
    .innerJoin(contacts, eq(contacts.id, contactTags.contactId))
    .innerJoin(tags, eq(tags.id, contactTags.tagId))
    .where(and(eq(tags.workspaceId, workspaceId), eq(tags.id, tagId), eq(contacts.workspaceId, workspaceId)))
    .orderBy(asc(contacts.firstName), asc(contacts.lastName));
}
