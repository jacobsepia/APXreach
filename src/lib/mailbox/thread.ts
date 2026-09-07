/*
 * Which conversation a message belongs to.
 *
 * The honest way would be the RFC Message-ID and In-Reply-To headers, but of
 * the three providers Reach sends through only Gmail takes a raw message it
 * can put its own Message-ID on: Zoho and Microsoft Graph both take fields
 * and mint their own. A header scheme would therefore thread one provider
 * and leave the other two as loose messages. Subject-and-person threads all
 * three the same way, which is what the person reading the Inbox wants.
 */

/** "Re: Fwd: RE: Invoice 12" → "invoice 12". Empty stays empty. */
export function normalizeSubject(subject: string): string {
  let text = subject.trim();
  let changed = true;
  while (changed) {
    const stripped = text.replace(/^\s*(re|fwd?|aw|antw|tr|rv)\s*(\[\d+\])?\s*:\s*/i, "");
    changed = stripped !== text;
    text = stripped;
  }
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * The key two messages share when they are the same conversation: the
 * subject stripped of its reply prefixes, and who it is with. Mail with no
 * contact on it threads by address instead, so a stranger's follow-up still
 * lands under their first message.
 */
export function threadKeyFor(subject: string, contactId: string | null, counterpartyAddress: string): string {
  const who = contactId ?? `addr:${counterpartyAddress.trim().toLowerCase()}`;
  const what = normalizeSubject(subject) || "(no subject)";
  return `${who}::${what}`;
}
