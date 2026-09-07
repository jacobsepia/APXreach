import { createHmac, timingSafeEqual } from "node:crypto";

/*
 * The unsubscribe link, signed rather than stored.
 *
 * A token is the contact's id and a signature over it, so the link cannot be
 * guessed or edited into somebody else's, and no table has to be kept in step
 * with mail that may sit in an inbox for a year. The key is the app's own
 * auth secret, which already has to be set for anything to work.
 */

function secret(): string {
  const value = process.env.BETTER_AUTH_SECRET?.trim();
  if (!value) throw new Error("BETTER_AUTH_SECRET is not set, so unsubscribe links cannot be signed.");
  return value;
}

function sign(contactId: string): string {
  return createHmac("sha256", secret()).update(`unsubscribe:${contactId}`).digest("base64url");
}

export function unsubscribeToken(contactId: string): string {
  return `${contactId}.${sign(contactId)}`;
}

/** The link in the footer: a page, so a person sees who they are leaving before they leave. */
export function unsubscribeUrl(appUrl: string, contactId: string): string {
  return `${appUrl.replace(/\/$/, "")}/unsubscribe/${unsubscribeToken(contactId)}`;
}

/**
 * The address in the List-Unsubscribe header. One-click unsubscribe is a POST
 * from the mail client with nobody watching, so it cannot be the page — it is
 * a route that acts and answers, per RFC 8058.
 */
export function oneClickUnsubscribeUrl(appUrl: string, contactId: string): string {
  return `${appUrl.replace(/\/$/, "")}/api/unsubscribe/${unsubscribeToken(contactId)}`;
}

/** The contact this token is for, or null when it was not signed by us. */
export function contactFromToken(token: string): string | null {
  const at = token.lastIndexOf(".");
  if (at <= 0) return null;
  const contactId = token.slice(0, at);
  const given = token.slice(at + 1);
  let expected: string;
  try {
    expected = sign(contactId);
  } catch {
    return null;
  }
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return contactId;
}
