import type { ProviderOAuth, ProviderResult } from "@/lib/providers";

/*
 * The mailbox boundary — the same shape as the books boundary next door, for
 * the same reason: Reach should never be wired to one vendor.
 *
 * This is a different thing from a sending service. Resend pushes mail out
 * from a domain and reports what happened to it; a mailbox is the person's
 * own account, so mail leaves from the address a client already recognises,
 * the reply lands in the inbox they already watch, and Reach can read the
 * thread rather than guess at it. A CRM needs the second one. It will want
 * the first as well, later, for anything sent in bulk — a marketing blast and
 * an invoice should never share a sending reputation.
 *
 * Whose mailbox: a mailbox belongs to a PERSON, not to the workspace. Two
 * colleagues connect two mailboxes and each sends as themselves, which is why
 * this hangs off the user rather than off the connection to the books.
 */

export type MailboxProviderId = "zoho" | "google" | "microsoft";

/** Who the tokens turned out to belong to. Reach never asks; the grant knows. */
export interface MailboxIdentity {
  /** The address mail will be sent from and replies read out of. */
  email: string;
  displayName: string | null;
  /**
   * The provider's own handle for this mailbox, where it needs one. Zoho
   * addresses its send endpoint by account id rather than by address, so
   * without this every send would cost an extra round trip to look it up.
   */
  providerAccountId?: string | null;
}

export interface OutgoingMail {
  to: string;
  subject: string;
  /** Plain text always; HTML is what the recipient sees when their client can. */
  text: string;
  html?: string;
  /** Threads a reply onto the message it answers, where the provider can. */
  inReplyTo?: string | null;
}

export interface SentMail {
  /** The provider's message id, so the reply can be matched back to it. */
  providerMessageId: string | null;
}

/** A message that arrived in the person's inbox, normalised across providers. */
export interface IncomingMail {
  providerMessageId: string;
  /** Whatever the provider needs to find this message again; opaque here. */
  providerRef: string;
  fromAddress: string;
  fromName: string | null;
  subject: string;
  /** The provider's short preview, always present even when the body is not. */
  snippet: string;
  bodyText: string | null;
  bodyHtml: string | null;
  receivedAt: Date;
  /** The RFC Message-ID, where the provider exposes it, for threading. */
  internetMessageId: string | null;
}

export interface FetchResult {
  messages: IncomingMail[];
  /** Opaque, provider-shaped; handed back unchanged on the next poll. */
  cursor: string;
}

export interface MailboxProvider {
  id: MailboxProviderId;
  label: string;
  /** One line on the connect card, in the person's terms. */
  connectHint: string;
  oauth: ProviderOAuth;
  /**
   * Ask the provider whose mailbox this grant opened. Called once, right
   * after the exchange, so the address is stored with the tokens instead of
   * being typed in by hand and got wrong.
   */
  identify(accessToken: string): Promise<ProviderResult<MailboxIdentity>>;
  /**
   * Send as this mailbox. Returns a result rather than throwing: a refused
   * send is not an exception in the CRM sense — the contact still exists and
   * the timeline is untouched — and the person who pressed Send needs to know
   * WHAT was refused, which a thrown error flattens into "something failed".
   */
  send(
    accessToken: string,
    mailbox: { emailAddress: string; displayName: string | null; providerAccountId: string | null },
    mail: OutgoingMail,
  ): Promise<ProviderResult<SentMail>>;
  /**
   * New mail in the inbox since the cursor. Absent for a provider whose read
   * scope Reach does not hold — Gmail, until the assessment clears — and the
   * poll simply skips those mailboxes rather than failing on them.
   */
  fetchSince?(
    accessToken: string,
    mailbox: { emailAddress: string; providerAccountId: string | null },
    cursor: string | null,
  ): Promise<ProviderResult<FetchResult>>;
  /**
   * The full body of one message, for providers whose listing carries only
   * a preview. Called only for mail that matched a contact, so a busy inbox
   * full of newsletters costs one listing call and nothing more.
   */
  fetchBody?(
    accessToken: string,
    mailbox: { emailAddress: string; providerAccountId: string | null },
    providerRef: string,
  ): Promise<ProviderResult<{ bodyText: string | null; bodyHtml: string | null }>>;
}
