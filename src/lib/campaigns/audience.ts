/*
 * Who a campaign actually reaches, and who is held back.
 *
 * This is the part of Reach that no marketing tool can copy without the
 * books. Chasing somebody on Tuesday for an overdue invoice and offering
 * them a discount on Wednesday is how a small business loses a customer, so
 * an account in active dunning is held out of every send by default. The
 * rest are the ordinary refusals: no address, unsubscribed, already sent.
 *
 * Pure, so the preview a person sees before pressing Send is computed by the
 * same code that decides at send time.
 */

export type AudienceCandidate = {
  contactId: string;
  name: string;
  email: string | null;
  unsubscribedAt: Date | null;
  /** From the books, through the contact's company. Zero when nothing is late. */
  companyOverdueCents: number;
  companyName: string | null;
};

export type AudienceMember = { contactId: string; name: string; email: string };
export type AudienceHold = { contactId: string; name: string; reason: string };
export type Audience = { send: AudienceMember[]; held: AudienceHold[] };

export function buildAudience(candidates: AudienceCandidate[], options: { holdDunning: boolean }): Audience {
  const send: AudienceMember[] = [];
  const held: AudienceHold[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    const email = candidate.email?.trim().toLowerCase() ?? "";
    if (!email) {
      held.push({ contactId: candidate.contactId, name: candidate.name, reason: "No email address" });
      continue;
    }
    if (candidate.unsubscribedAt) {
      held.push({ contactId: candidate.contactId, name: candidate.name, reason: "Unsubscribed" });
      continue;
    }
    if (options.holdDunning && candidate.companyOverdueCents > 0) {
      held.push({
        contactId: candidate.contactId,
        name: candidate.name,
        reason: `${candidate.companyName ?? "Their company"} has an overdue balance`,
      });
      continue;
    }
    /* One person, one copy, however many records share an address. */
    if (seen.has(email)) {
      held.push({ contactId: candidate.contactId, name: candidate.name, reason: "Another record has the same address" });
      continue;
    }
    seen.add(email);
    send.push({ contactId: candidate.contactId, name: candidate.name, email });
  }
  return { send, held };
}

/** Every campaign email carries these; CASL requires the first two and the third is courtesy. */
export function footerHtml(options: { workspaceName: string; fromEmail: string; unsubscribeUrl: string }): string {
  const escape = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
  return (
    `<div style="margin-top:28px;padding-top:14px;border-top:1px solid #e8e4ee;font-size:12px;line-height:1.6;color:#8b8794">` +
    `<p style="margin:0 0 4px">Sent by ${escape(options.workspaceName)}. Reply to this email to reach us, or write to ${escape(options.fromEmail)}.</p>` +
    `<p style="margin:0"><a href="${options.unsubscribeUrl}" style="color:#8b8794">Unsubscribe from these emails</a></p>` +
    `</div>`
  );
}

export function footerText(options: { workspaceName: string; fromEmail: string; unsubscribeUrl: string }): string {
  return `\n\n—\nSent by ${options.workspaceName}. Reply to this email to reach us, or write to ${options.fromEmail}.\nUnsubscribe: ${options.unsubscribeUrl}`;
}
