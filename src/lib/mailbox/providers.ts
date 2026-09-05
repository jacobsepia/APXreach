import { z } from "zod";
import type { ProviderResult } from "@/lib/providers";
import type {
  MailboxIdentity,
  MailboxProvider,
  MailboxProviderId,
  OutgoingMail,
  SentMail,
} from "./types";

/*
 * The three mailboxes Reach can connect, and what each one costs to reach.
 *
 * Zoho and Microsoft are self-service: register a client, ask for the scopes,
 * done. Google is not, and the difference is worth writing down where the
 * scopes are chosen rather than discovering it in a review queue:
 *
 *   gmail.send      — "sensitive": Google reviews the app, no fee.
 *   gmail.readonly  — "restricted": a CASA Tier 2 security assessment by an
 *                     approved lab, re-done every twelve months, on the order
 *                     of a thousand dollars a year and weeks of waiting.
 *
 * Reading a Google mailbox therefore has a recurring price and a lead time
 * that Zoho and Microsoft do not. That is why the scopes below are split:
 * SEND_SCOPES gets a Google connection working now, and READ_SCOPES is the
 * line to add the day the assessment clears.
 */

async function getJson(
  url: string,
  accessToken: string,
  label: string,
): Promise<ProviderResult<unknown>> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        /* Zoho's own scheme name, not Bearer — it refuses Bearer outright. */
        Authorization: url.includes("zoho")
          ? `Zoho-oauthtoken ${accessToken}`
          : `Bearer ${accessToken}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: `Could not reach ${label}.` };
  }
  if (!response.ok) {
    return {
      ok: false,
      error:
        response.status === 401
          ? `${label} rejected the connection — it may have been revoked.`
          : `${label} answered ${response.status}.`,
    };
  }
  try {
    return { ok: true, value: await response.json() };
  } catch {
    return { ok: false, error: `${label} returned something unreadable.` };
  }
}

function identityFrom(
  email: unknown,
  displayName: unknown,
  label: string,
  providerAccountId?: unknown,
): ProviderResult<MailboxIdentity> {
  if (typeof email !== "string" || !email.includes("@")) {
    return { ok: false, error: `${label} did not say which address this is.` };
  }
  return {
    ok: true,
    value: {
      email: email.toLowerCase(),
      displayName: typeof displayName === "string" && displayName ? displayName : null,
      providerAccountId:
        typeof providerAccountId === "string" || typeof providerAccountId === "number"
          ? String(providerAccountId)
          : null,
    },
  };
}


async function postJson(
  url: string,
  accessToken: string,
  label: string,
  body: unknown,
): Promise<ProviderResult<unknown>> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: url.includes("zoho")
          ? `Zoho-oauthtoken ${accessToken}`
          : `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: `Could not reach ${label}.` };
  }
  if (!response.ok) {
    /* Providers put the reason in wildly different places; the status is the
       only thing they agree on, so lead with a readable line and append
       whatever detail came back. */
    let detail = "";
    try {
      detail = (await response.text()).slice(0, 300);
    } catch {
      /* nothing more to say */
    }
    return {
      ok: false,
      error:
        response.status === 401
          ? `${label} rejected the connection — reconnect the mailbox.`
          : `${label} refused the send (${response.status}).${detail ? ` ${detail}` : ""}`,
    };
  }
  if (response.status === 202 || response.status === 204) return { ok: true, value: null };
  try {
    return { ok: true, value: await response.json() };
  } catch {
    return { ok: true, value: null };
  }
}

/** RFC 2047, so a subject with an accent or an em dash is not mangled. */
export function encodeHeader(value: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

export function formatAddress(email: string, displayName: string | null): string {
  return displayName ? `${encodeHeader(displayName)} <${email}>` : email;
}

/**
 * An RFC 822 message, which is what Gmail's API takes — it sends bytes, not
 * fields. Multipart so the recipient's client picks HTML when it can and
 * plain text when it cannot; a text-only fallback is not optional, because
 * plenty of filters score HTML-only mail as spam.
 */
export function buildRfc822(from: string, mail: OutgoingMail): string {
  const boundary = `apxreach_${Math.random().toString(36).slice(2)}`;
  const headers = [
    `From: ${from}`,
    `To: ${mail.to}`,
    `Subject: ${encodeHeader(mail.subject)}`,
    "MIME-Version: 1.0",
  ];
  if (mail.inReplyTo) {
    headers.push(`In-Reply-To: ${mail.inReplyTo}`, `References: ${mail.inReplyTo}`);
  }
  if (!mail.html) {
    headers.push('Content-Type: text/plain; charset="UTF-8"', "", mail.text);
    return headers.join("\r\n");
  }
  headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`, "");
  return [
    ...headers,
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    mail.text,
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "",
    mail.html,
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

/*
 * Zoho runs separate data centres and an account exists in exactly one of
 * them: a token minted at accounts.zoho.com is meaningless to accounts.zoho.eu.
 * Configurable because a Canadian business may sit in either .com or .eu
 * depending on where it signed up, and the failure is an unhelpful 401.
 */
const ZOHO_ACCOUNTS = process.env.ZOHO_ACCOUNTS_URL ?? "https://accounts.zoho.com";
const ZOHO_MAIL_API = process.env.ZOHO_MAIL_API_URL ?? "https://mail.zoho.com";

const zohoAccountsSchema = z.object({
  data: z
    .array(
      z.object({
        accountId: z.union([z.string(), z.number()]).optional(),
        primaryEmailAddress: z.string().optional(),
        mailboxAddress: z.string().optional(),
        displayName: z.string().optional(),
      }),
    )
    .min(1),
});

export const zohoMailbox: MailboxProvider = {
  id: "zoho",
  label: "Zoho Mail",
  connectHint:
    "Send from your own Zoho address and have replies land on the record. Zoho approves it in its own screen, and you can revoke it there at any time.",
  oauth: {
    authorizeUrl: `${ZOHO_ACCOUNTS}/oauth/v2/auth`,
    tokenUrl: `${ZOHO_ACCOUNTS}/oauth/v2/token`,
    revokeUrl: `${ZOHO_ACCOUNTS}/oauth/v2/token/revoke`,
    scopes: [
      "ZohoMail.accounts.READ",
      "ZohoMail.messages.READ",
      "ZohoMail.messages.CREATE",
      "ZohoMail.folders.READ",
    ],
    clientIdEnv: "ZOHO_CLIENT_ID",
    clientSecretEnv: "ZOHO_CLIENT_SECRET",
    /* Without this Zoho issues an access token only, and the connection dies
       in an hour with nothing to renew it. */
    extraAuthorizeParams: { access_type: "offline", prompt: "consent" },
  },
  async identify(accessToken) {
    const result = await getJson(`${ZOHO_MAIL_API}/api/accounts`, accessToken, "Zoho Mail");
    if (!result.ok) return result;
    const parsed = zohoAccountsSchema.safeParse(result.value);
    if (!parsed.success) {
      return { ok: false, error: "Zoho Mail answered in a shape this version does not expect." };
    }
    const account = parsed.data.data[0];
    return identityFrom(
      account.primaryEmailAddress ?? account.mailboxAddress,
      account.displayName,
      "Zoho Mail",
      account.accountId,
    );
  },

  /*
   * Zoho addresses its send endpoint by account id, not by address — which is
   * why identify() keeps it. Without it every send would need a lookup first.
   */
  async send(accessToken, mailbox, mail): Promise<ProviderResult<SentMail>> {
    if (!mailbox.providerAccountId) {
      return { ok: false, error: "Reconnect the Zoho mailbox — its account id is missing." };
    }
    const result = await postJson(
      `${ZOHO_MAIL_API}/api/accounts/${mailbox.providerAccountId}/messages`,
      accessToken,
      "Zoho Mail",
      {
        fromAddress: mailbox.emailAddress,
        toAddress: mail.to,
        subject: mail.subject,
        content: mail.html ?? mail.text,
        mailFormat: mail.html ? "html" : "plaintext",
      },
    );
    if (!result.ok) return result;
    const body = result.value as { data?: { messageId?: unknown } };
    const id = body?.data?.messageId;
    return { ok: true, value: { providerMessageId: id == null ? null : String(id) } };
  },
};

/*
 * Sending only, deliberately. gmail.readonly is a restricted scope and cannot
 * ship without the annual assessment above; asking for it before then means
 * every Google connection fails at the consent screen with an "unverified
 * app" wall, including for people who only wanted to send.
 */
const GOOGLE_SEND_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.send",
];
/** Add once CASA Tier 2 clears: "https://www.googleapis.com/auth/gmail.readonly". */

export const googleMailbox: MailboxProvider = {
  id: "google",
  label: "Gmail",
  connectHint:
    "Send from your own Gmail address, so replies come back to your inbox and the thread reads normally. Reading those replies into Reach needs Google's security review first.",
  oauth: {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    revokeUrl: "https://oauth2.googleapis.com/revoke",
    scopes: GOOGLE_SEND_SCOPES,
    clientIdEnv: "GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
    /*
     * Google hands over a refresh token on the FIRST authorization only,
     * unless prompt=consent is sent every time. Skip it and the connection
     * works today and cannot be renewed tomorrow — and only for the people
     * who happened to have authorized before.
     */
    extraAuthorizeParams: { access_type: "offline", prompt: "consent" },
  },
  async identify(accessToken) {
    const result = await getJson(
      "https://openidconnect.googleapis.com/v1/userinfo",
      accessToken,
      "Gmail",
    );
    if (!result.ok) return result;
    const claims = result.value as { email?: unknown; name?: unknown; sub?: unknown };
    return identityFrom(claims.email, claims.name, "Gmail", claims.sub);
  },

  async send(accessToken, mailbox, mail): Promise<ProviderResult<SentMail>> {
    const raw = Buffer.from(
      buildRfc822(formatAddress(mailbox.emailAddress, mailbox.displayName), mail),
      "utf8",
    ).toString("base64url");
    const result = await postJson(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      accessToken,
      "Gmail",
      { raw },
    );
    if (!result.ok) return result;
    const body = result.value as { id?: unknown };
    return {
      ok: true,
      value: { providerMessageId: typeof body?.id === "string" ? body.id : null },
    };
  },
};

export const microsoftMailbox: MailboxProvider = {
  id: "microsoft",
  label: "Outlook",
  connectHint:
    "Send from your own Microsoft 365 address and have replies land on the record. Microsoft can push new mail as it arrives, so nothing waits on a poll.",
  oauth: {
    authorizeUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scopes: [
      "openid",
      "email",
      "profile",
      /* Microsoft takes refresh as a SCOPE rather than an authorize param. */
      "offline_access",
      "User.Read",
      "Mail.Read",
      "Mail.Send",
    ],
    clientIdEnv: "MICROSOFT_CLIENT_ID",
    clientSecretEnv: "MICROSOFT_CLIENT_SECRET",
  },
  async identify(accessToken) {
    const result = await getJson(
      "https://graph.microsoft.com/v1.0/me",
      accessToken,
      "Outlook",
    );
    if (!result.ok) return result;
    const me = result.value as {
      mail?: unknown;
      userPrincipalName?: unknown;
      displayName?: unknown;
    };
    /* `mail` is empty for accounts without a mailbox licence; the UPN is the
       address in practice, and is what Graph sends from. */
    return identityFrom(
      me.mail ?? me.userPrincipalName,
      me.displayName,
      "Outlook",
      typeof (me as { id?: unknown }).id === "string" ? (me as { id: string }).id : null,
    );
  },

  /*
   * Graph takes fields rather than bytes and answers 202 with an empty body,
   * so there is no message id to keep. Matching a reply to what it answers
   * therefore has to go through the thread, not the id — which is the shape
   * the reply poll will have to take for this provider.
   */
  async send(accessToken, _mailbox, mail): Promise<ProviderResult<SentMail>> {
    const result = await postJson(
      "https://graph.microsoft.com/v1.0/me/sendMail",
      accessToken,
      "Outlook",
      {
        message: {
          subject: mail.subject,
          body: {
            contentType: mail.html ? "HTML" : "Text",
            content: mail.html ?? mail.text,
          },
          toRecipients: [{ emailAddress: { address: mail.to } }],
        },
        saveToSentItems: true,
      },
    );
    if (!result.ok) return result;
    return { ok: true, value: { providerMessageId: null } };
  },
};

export const mailboxProviders: Record<MailboxProviderId, MailboxProvider> = {
  zoho: zohoMailbox,
  google: googleMailbox,
  microsoft: microsoftMailbox,
};

export function getMailboxProvider(id: string): MailboxProvider | undefined {
  return mailboxProviders[id as MailboxProviderId];
}

/** Only the ones whose client is actually registered can be offered. */
export function configuredMailboxProviders(): MailboxProvider[] {
  return Object.values(mailboxProviders).filter(
    (provider) =>
      process.env[provider.oauth.clientIdEnv]?.trim() &&
      process.env[provider.oauth.clientSecretEnv]?.trim(),
  );
}
