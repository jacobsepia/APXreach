import { eq } from "drizzle-orm";
import { contacts, db, workspaces } from "@/db";
import { contactFromToken } from "./unsubscribe";

/*
 * Acting on an unsubscribe link. Nobody is signed in here, so the token is
 * the only authority — and because it is signed over the contact's id, it can
 * only ever reach the one record it was minted for. There is no workspace
 * scoping to apply and none to forget.
 */

export type UnsubscribeTarget = { contactId: string; name: string; email: string; workspaceName: string; unsubscribed: boolean };

export async function unsubscribeTarget(token: string): Promise<UnsubscribeTarget | null> {
  const contactId = contactFromToken(token);
  if (!contactId) return null;
  const [row] = await db
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      unsubscribedAt: contacts.unsubscribedAt,
      workspaceName: workspaces.name,
    })
    .from(contacts)
    .innerJoin(workspaces, eq(workspaces.id, contacts.workspaceId))
    .where(eq(contacts.id, contactId))
    .limit(1);
  if (!row) return null;
  return {
    contactId: row.id,
    name: `${row.firstName} ${row.lastName}`.replace(/ —$/, "").trim(),
    email: row.email ?? "",
    workspaceName: row.workspaceName,
    unsubscribed: Boolean(row.unsubscribedAt),
  };
}

/** Idempotent: a second click, or a mail client retrying its one-click POST, is not an error. */
export async function applyUnsubscribe(token: string): Promise<boolean> {
  const contactId = contactFromToken(token);
  if (!contactId) return false;
  const rows = await db
    .update(contacts)
    .set({ unsubscribedAt: new Date(), updatedAt: new Date() })
    .where(eq(contacts.id, contactId))
    .returning({ id: contacts.id });
  return rows.length > 0;
}

/** Undo, for somebody who clicked by mistake and said so on the page. */
export async function applyResubscribe(token: string): Promise<boolean> {
  const contactId = contactFromToken(token);
  if (!contactId) return false;
  const rows = await db
    .update(contacts)
    .set({ unsubscribedAt: null, updatedAt: new Date() })
    .where(eq(contacts.id, contactId))
    .returning({ id: contacts.id });
  return rows.length > 0;
}
