import { convert } from "html-to-text";

/*
 * The sending service. Bulk mail does not go through the person's own
 * mailbox: a marketing send and an invoice reminder must never share a
 * sending reputation, and a mailbox provider will rate-limit or suspend an
 * account that starts blasting.
 *
 * Resend, because its free tier covers a small business's list and its API
 * is one POST. Behind an unset key the whole feature says so rather than
 * failing at the moment somebody presses Send.
 */

export type SendableEmail = {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string | null;
  /**
   * The RFC 8058 endpoint for the List-Unsubscribe header — the button Gmail
   * and Outlook draw beside the sender. It must accept a POST, so it is the
   * route handler, not the page the footer link points at.
   */
  oneClickUrl: string;
};

export type BulkSender = {
  from: string;
  send(email: SendableEmail): Promise<{ ok: true; id: string | null } | { ok: false; error: string }>;
};

export function bulkSendingReady(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim() && process.env.RESEND_FROM?.trim());
}

/** What Settings and the campaign page tell somebody who has not set it up. */
export function bulkSendingHint(): string | null {
  if (bulkSendingReady()) return null;
  if (!process.env.RESEND_API_KEY?.trim()) {
    return "Campaigns need a sending service. Add RESEND_API_KEY and RESEND_FROM to the server's environment variables — bulk mail cannot go through your own mailbox without risking its reputation.";
  }
  return "RESEND_FROM is not set. It must be an address on a domain verified in Resend, like news@yourcompany.ca.";
}

export function htmlToPlain(html: string): string {
  return convert(html, { wordwrap: false, selectors: [{ selector: "a", options: { ignoreHref: false } }] }).trim();
}

export function resendSender(fetchImpl: typeof fetch = fetch): BulkSender {
  const key = process.env.RESEND_API_KEY?.trim() ?? "";
  const from = process.env.RESEND_FROM?.trim() ?? "";
  return {
    from,
    async send(email) {
      let response: Response;
      try {
        response = await fetchImpl("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from,
            to: [email.to],
            subject: email.subject,
            html: email.html,
            text: email.text,
            ...(email.replyTo ? { reply_to: email.replyTo } : {}),
            headers: {
              "List-Unsubscribe": `<${email.oneClickUrl}>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
          }),
          signal: AbortSignal.timeout(20_000),
        });
      } catch (caught) {
        const timedOut = caught instanceof Error && caught.name === "TimeoutError";
        return { ok: false, error: timedOut ? "The sending service took too long to answer." : "Could not reach the sending service." };
      }
      let body: { id?: string; message?: string; name?: string } = {};
      try { body = (await response.json()) as typeof body; } catch { /* handled below */ }
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) return { ok: false, error: "The sending service rejected the API key. Check RESEND_API_KEY." };
        if (response.status === 422 && /domain/i.test(body.message ?? "")) {
          return { ok: false, error: `${body.message} — verify the domain in Resend and set RESEND_FROM to an address on it.` };
        }
        if (response.status === 429) return { ok: false, error: "The sending service is rate-limiting; the rest of the list will be tried again." };
        return { ok: false, error: body.message ?? `The sending service answered ${response.status}.` };
      }
      return { ok: true, id: typeof body.id === "string" ? body.id : null };
    },
  };
}
