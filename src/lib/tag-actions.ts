"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { contactTags, contacts, db, tags } from "@/db";
import { requireTenantOrThrow } from "@/lib/workspace";
import { tagColors } from "./tags";

/*
 * Creating tags and putting them on people. A tag name is unique per
 * workspace, case-insensitively — typing "vip" when "VIP" exists reuses it
 * rather than making a near-twin nobody can tell apart.
 */

const nameSchema = z.string().trim().min(1, "Give the tag a name.").max(40);

async function findOrCreate(workspaceId: string, name: string, color?: string): Promise<{ id: string; name: string; color: string }> {
  const [existing] = await db
    .select({ id: tags.id, name: tags.name, color: tags.color })
    .from(tags)
    .where(and(eq(tags.workspaceId, workspaceId), sql`lower(${tags.name}) = ${name.toLowerCase()}`))
    .limit(1);
  if (existing) return existing;
  const chosen = color && (tagColors as readonly string[]).includes(color) ? color : tagColors[(await db.select({ count: sql<number>`count(*)` }).from(tags).where(eq(tags.workspaceId, workspaceId)))[0].count % tagColors.length];
  const [created] = await db.insert(tags).values({ workspaceId, name, color: chosen }).returning({ id: tags.id, name: tags.name, color: tags.color });
  return created;
}

export type TagOutcome = { ok: true; tag: { id: string; name: string; color: string } } | { ok: false; error: string };

/** Put a tag on one person, making it if it is new. */
export async function addTagToContact(form: FormData): Promise<TagOutcome> {
  try {
    const { workspaceId } = await requireTenantOrThrow();
    const contactId = z.uuid().parse(form.get("contactId"));
    const name = nameSchema.parse(form.get("name"));
    const [contact] = await db.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.id, contactId), eq(contacts.workspaceId, workspaceId))).limit(1);
    if (!contact) return { ok: false, error: "That contact is not in this workspace." };
    const tag = await findOrCreate(workspaceId, name, String(form.get("color") ?? ""));
    await db.insert(contactTags).values({ contactId, tagId: tag.id }).onConflictDoNothing();
    revalidatePath("/contacts");
    return { ok: true, tag };
  } catch (error) {
    if (error instanceof z.ZodError) return { ok: false, error: "Give the tag a name of 1 to 40 characters." };
    return { ok: false, error: "Could not add that tag." };
  }
}

export async function removeTagFromContact(form: FormData): Promise<void> {
  const { workspaceId } = await requireTenantOrThrow();
  const contactId = z.uuid().parse(form.get("contactId"));
  const tagId = z.uuid().parse(form.get("tagId"));
  const [contact] = await db.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.id, contactId), eq(contacts.workspaceId, workspaceId))).limit(1);
  const [tag] = await db.select({ id: tags.id }).from(tags).where(and(eq(tags.id, tagId), eq(tags.workspaceId, workspaceId))).limit(1);
  if (!contact || !tag) return;
  await db.delete(contactTags).where(and(eq(contactTags.contactId, contactId), eq(contactTags.tagId, tagId)));
  revalidatePath("/contacts");
}

/** Tag several people at once — what the Contacts list's selection does. */
export async function tagContacts(form: FormData): Promise<void> {
  const { workspaceId } = await requireTenantOrThrow();
  const name = nameSchema.parse(form.get("name"));
  const contactIds = z.array(z.uuid()).min(1).max(500).parse(form.getAll("contactId").map(String));
  const mine = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.workspaceId, workspaceId), inArray(contacts.id, contactIds)));
  if (!mine.length) return;
  const tag = await findOrCreate(workspaceId, name);
  await db.insert(contactTags).values(mine.map((row) => ({ contactId: row.id, tagId: tag.id }))).onConflictDoNothing();
  revalidatePath("/contacts");
}

export async function deleteTag(form: FormData): Promise<void> {
  const { workspaceId } = await requireTenantOrThrow();
  const tagId = z.uuid().parse(form.get("tagId"));
  const [tag] = await db.select({ id: tags.id }).from(tags).where(and(eq(tags.id, tagId), eq(tags.workspaceId, workspaceId))).limit(1);
  if (!tag) return;
  await db.delete(contactTags).where(eq(contactTags.tagId, tagId));
  await db.delete(tags).where(eq(tags.id, tagId));
  revalidatePath("/contacts");
}
