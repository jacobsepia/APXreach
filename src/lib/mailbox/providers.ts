import { z } from "zod";
import type { ProviderResult } from "@/lib/providers";
import type {
  FetchResult,
  IncomingMail,
  MailAttachment,
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

/**
 * Zoho names its token scheme after itself and refuses "Bearer" outright.
 * Passed explicitly rather than guessed from the URL: a data-centre host or a
 * proxy without "zoho" in its name would otherwise silently send the wrong
 * word and read as a revoked grant.
 */
type AuthScheme = "Bearer" | "Zoho-oauthtoken";

async function getJson(
  url: string,
  accessToken: string,
  label: string,
  scheme: AuthScheme = "Bearer",
): Promise<ProviderResult<unknown>> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Authorization: `${scheme} ${accessToken}`,
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
  scheme: AuthScheme = "Bearer",
): Promise<ProviderResult<unknown>> {
  return postBody(url, accessToken, label, JSON.stringify(body), "application/json", scheme);
}

/** A POST of any bytes — JSON, a raw RFC 822 message, a file — with one reading of the refusals. */
async function postBody(
  url: string,
  accessToken: string,
  label: string,
  body: string | Blob,
  contentType: string,
  scheme: AuthScheme = "Bearer",
): Promise<ProviderResult<unknown>> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `${scheme} ${accessToken}`,
        "Content-Type": contentType,
        Accept: "application/json",
      },
      body,
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
function attachmentPart(boundary: string, attachment: MailAttachment): string[] {
  /* Quotes and line breaks in a filename would end the header early; a
     non-ASCII name goes through the same encoding as a subject line. */
  const name = encodeHeader(attachment.filename.replace(/["\r\n]/g, "_"));
  return [
    `--${boundary}`,
    `Content-Type: ${attachment.contentType || "application/octet-stream"}; name="${name}"`,
    `Content-Disposition: attachment; filename="${name}"`,
    "Content-Transfer-Encoding: base64",
    "",
    attachment.content.toString("base64").replace(/(.{76})/g, "$1\r\n"),
  ];
}

export function buildRfc822(from: string, mail: OutgoingMail): string {
  const alternative = `apxreach_alt_${Math.random().toString(36).slice(2)}`;
  const mixed = `apxreach_mix_${Math.random().toString(36).slice(2)}`;
  const headers = [
    `From: ${from}`,
    `To: ${mail.to}`,
    `Subject: ${encodeHeader(mail.subject)}`,
    "MIME-Version: 1.0",
  ];
  if (mail.inReplyTo) {
    headers.push(`In-Reply-To: ${mail.inReplyTo}`, `References: ${mail.inReplyTo}`);
  }
  const body = mail.html
    ? [
        `Content-Type: multipart/alternative; boundary="${alternative}"`,
        "",
        `--${alternative}`,
        'Content-Type: text/plain; charset="UTF-8"',
        "",
        mail.text,
        `--${alternative}`,
        'Content-Type: text/html; charset="UTF-8"',
        "",
        mail.html,
        `--${alternative}--`,
      ]
    : ['Content-Type: text/plain; charset="UTF-8"', "", mail.text];

  const attachments = mail.attachments ?? [];
  if (!attachments.length) return [...headers, ...body, ""].join("\r\n");

  /* Files wrap the whole message: mixed on the outside, the text/HTML pair inside. */
  return [
    ...headers,
    `Content-Type: multipart/mixed; boundary="${mixed}"`,
    "",
    `--${mixed}`,
    ...body,
    ...attachments.flatMap((attachment) => attachmentPart(mixed, attachment)),
    `--${mixed}--`,
    "",
  ].join("\r\n");
}


/**
 * Good enough for a preview and a timeline line: tags out, the handful of
 * entities mail clients actually emit decoded, whitespace collapsed. Not a
 * renderer — the HTML is kept alongside for the day the Inbox shows it.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** "Jane Doe <jane@x.ca>" or "jane@x.ca" → the address, lower-cased. */
function bareAddress(value: string): string {
  const angled = value.match(/<([^>]+)>/);
  return (angled ? angled[1] : value).trim().toLowerCase();
}

function readCursor<T extends object>(cursor: string | null): Partial<T> {
  if (!cursor) return {};
  try {
    const parsed = JSON.parse(cursor) as unknown;
    return typeof parsed === "object" && parsed !== null ? (parsed as Partial<T>) : {};
  } catch {
    return {};
  }
}

/**
 * Zoho gives receivedTime as a string of epoch milliseconds. Written so a
 * seconds value would still land in the right decade rather than in 1970.
 */
function epochToDate(value: unknown): Date | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n < 1e12 ? n * 1000 : n);
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


const zohoFoldersSchema = z.object({
  data: z.array(
    z
      .object({
        folderId: z.union([z.string(), z.number()]),
        folderName: z.string().optional(),
        folderType: z.string().optional(),
        path: z.string().optional(),
      })
      .passthrough(),
  ),
});

const zohoMessagesSchema = z.object({
  data: z.array(
    z
      .object({
        messageId: z.union([z.string(), z.number()]),
        folderId: z.union([z.string(), z.number()]).optional(),
        fromAddress: z.string().optional(),
        /** Zoho's word for the display name, not the address. */
        sender: z.string().optional(),
        subject: z.string().optional(),
        summary: z.string().optional(),
        receivedTime: z.union([z.string(), z.number()]).optional(),
      })
      .passthrough(),
  ),
});

type ZohoCursor = { since: number; inboxFolderId: string };

/* Zoho takes attachments in two steps: upload each file, then name the
   uploads in the send. The upload's reply is the handle the send needs. */
const zohoAttachmentRef = z
  .object({
    storeName: z.string(),
    attachmentPath: z.string(),
    attachmentName: z.string().optional(),
  })
  .passthrough();
const zohoAttachmentSchema = z.object({
  data: z.union([zohoAttachmentRef, z.array(zohoAttachmentRef).min(1)]),
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
    const result = await getJson(`${ZOHO_MAIL_API}/api/accounts`, accessToken, "Zoho Mail", "Zoho-oauthtoken");
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
    const account = mailbox.providerAccountId;

    const uploaded: Array<{ storeName: string; attachmentPath: string; attachmentName: string }> = [];
    for (const attachment of mail.attachments ?? []) {
      const upload = await postBody(
        `${ZOHO_MAIL_API}/api/accounts/${account}/messages/attachments?fileName=${encodeURIComponent(attachment.filename)}&isInline=false`,
        accessToken,
        "Zoho Mail",
        new Blob([Uint8Array.from(attachment.content)]),
        attachment.contentType || "application/octet-stream",
        "Zoho-oauthtoken",
      );
      if (!upload.ok) return { ok: false, error: `Zoho Mail did not take "${attachment.filename}": ${upload.error}` };
      const parsed = zohoAttachmentSchema.safeParse(upload.value);
      if (!parsed.success) {
        console.error("[mailbox] zoho attachment shape:", JSON.stringify(upload.value).slice(0, 500));
        return { ok: false, error: "Zoho Mail accepted the file but answered in a shape this version does not expect." };
      }
      const ref = Array.isArray(parsed.data.data) ? parsed.data.data[0] : parsed.data.data;
      uploaded.push({
        storeName: ref.storeName,
        attachmentPath: ref.attachmentPath,
        attachmentName: ref.attachmentName ?? attachment.filename,
      });
    }

    const result = await postJson(
      `${ZOHO_MAIL_API}/api/accounts/${account}/messages`,
      accessToken,
      "Zoho Mail",
      {
        fromAddress: mailbox.emailAddress,
        toAddress: mail.to,
        subject: mail.subject,
        content: mail.html ?? mail.text,
        mailFormat: mail.html ? "html" : "plaintext",
        ...(uploaded.length ? { attachments: uploaded } : {}),
      },
      "Zoho-oauthtoken",
    );
    if (!result.ok) return result;
    const body = result.value as { data?: { messageId?: unknown } };
    const id = body?.data?.messageId;
    return { ok: true, value: { providerMessageId: id == null ? null : String(id) } };
  },

  /*
   * Zoho's listing is by folder and newest-first, with no "since" parameter,
   * so the poll reads the top of the inbox and keeps what is newer than the
   * last receivedTime it saw. Fifty at a time is plenty for a person's inbox
   * polled every few minutes, and bounded is the point.
   */
  async fetchSince(accessToken, mailbox, cursor): Promise<ProviderResult<FetchResult>> {
    if (!mailbox.providerAccountId) {
      return { ok: false, error: "Reconnect the Zoho mailbox — its account id is missing." };
    }
    const account = mailbox.providerAccountId;
    const state = readCursor<ZohoCursor>(cursor);

    let inboxFolderId = state.inboxFolderId;
    if (!inboxFolderId) {
      const folders = await getJson(`${ZOHO_MAIL_API}/api/accounts/${account}/folders`, accessToken, "Zoho Mail", "Zoho-oauthtoken");
      if (!folders.ok) return folders;
      const parsed = zohoFoldersSchema.safeParse(folders.value);
      if (!parsed.success) {
        console.error("[mailbox] zoho folders shape:", JSON.stringify(folders.value).slice(0, 500));
        return { ok: false, error: "Zoho Mail's folder list is not in the shape this version expects." };
      }
      const inbox = parsed.data.data.find(
        (f) =>
          f.folderType?.toLowerCase() === "inbox" ||
          f.folderName?.toLowerCase() === "inbox" ||
          f.path?.toLowerCase() === "/inbox",
      );
      if (!inbox) {
        return {
          ok: false,
          error: `Zoho Mail did not list an Inbox (saw: ${parsed.data.data.map((f) => f.folderName ?? f.path ?? "?").join(", ")}).`,
        };
      }
      inboxFolderId = String(inbox.folderId);
    }

    const listed = await getJson(
      `${ZOHO_MAIL_API}/api/accounts/${account}/messages/view?folderId=${encodeURIComponent(inboxFolderId)}&limit=50`,
      accessToken,
      "Zoho Mail",
      "Zoho-oauthtoken",
    );
    if (!listed.ok) return listed;
    const parsed = zohoMessagesSchema.safeParse(listed.value);
    if (!parsed.success) {
      console.error("[mailbox] zoho messages shape:", JSON.stringify(listed.value).slice(0, 500));
      return { ok: false, error: "Zoho Mail's message list is not in the shape this version expects." };
    }

    const since = state.since ?? 0;
    let newest = since;
    const messages: IncomingMail[] = [];
    for (const m of parsed.data.data) {
      const receivedAt = epochToDate(m.receivedTime);
      if (!receivedAt) continue;
      if (receivedAt.getTime() <= since) continue;
      newest = Math.max(newest, receivedAt.getTime());
      if (!m.fromAddress) continue;
      messages.push({
        providerMessageId: String(m.messageId),
        providerRef: `${m.folderId ?? inboxFolderId}/${m.messageId}`,
        fromAddress: bareAddress(m.fromAddress),
        fromName: m.sender?.trim() || null,
        subject: m.subject?.trim() || "(no subject)",
        snippet: (m.summary ?? "").trim(),
        bodyText: null,
        bodyHtml: null,
        receivedAt,
        internetMessageId: null,
      });
    }
    /* Oldest first, so a partial failure leaves the cursor at a sane place. */
    messages.sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime());

    const next: ZohoCursor = { since: newest, inboxFolderId };
    return { ok: true, value: { messages, cursor: JSON.stringify(next) } };
  },

  async fetchBody(accessToken, mailbox, providerRef) {
    if (!mailbox.providerAccountId) {
      return { ok: false, error: "Reconnect the Zoho mailbox — its account id is missing." };
    }
    const [folderId, messageId] = providerRef.split("/");
    const result = await getJson(
      `${ZOHO_MAIL_API}/api/accounts/${mailbox.providerAccountId}/folders/${folderId}/messages/${messageId}/content`,
      accessToken,
      "Zoho Mail",
      "Zoho-oauthtoken",
    );
    if (!result.ok) return result;
    const content = (result.value as { data?: { content?: unknown } })?.data?.content;
    if (typeof content !== "string") {
      return { ok: true, value: { bodyText: null, bodyHtml: null } };
    }
    const looksHtml = /<[a-z][\s\S]*>/i.test(content);
    return {
      ok: true,
      value: looksHtml
        ? { bodyText: htmlToText(content), bodyHtml: content }
        : { bodyText: content, bodyHtml: null },
    };
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
    const message = Buffer.from(
      buildRfc822(formatAddress(mailbox.emailAddress, mailbox.displayName), mail),
      "utf8",
    );
    /* With files aboard the message goes up as bytes through the upload
       endpoint, which takes far more than the JSON field's base64 will. */
    const result = mail.attachments?.length
      ? await postBody(
          "https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=media",
          accessToken,
          "Gmail",
          new Blob([Uint8Array.from(message)]),
          "message/rfc822",
        )
      : await postJson(
          "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
          accessToken,
          "Gmail",
          { raw: message.toString("base64url") },
        );
    if (!result.ok) return result;
    const body = result.value as { id?: unknown };
    return {
      ok: true,
      value: { providerMessageId: typeof body?.id === "string" ? body.id : null },
    };
  },
};


const graphMessagesSchema = z.object({
  value: z.array(
    z
      .object({
        id: z.string(),
        subject: z.string().nullable().optional(),
        from: z
          .object({
            emailAddress: z
              .object({ name: z.string().optional(), address: z.string().optional() })
              .optional(),
          })
          .optional(),
        receivedDateTime: z.string(),
        bodyPreview: z.string().optional(),
        body: z.object({ contentType: z.string().optional(), content: z.string().optional() }).optional(),
        internetMessageId: z.string().nullable().optional(),
      })
      .passthrough(),
  ),
});

type GraphCursor = { since: string };

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
          ...(mail.attachments?.length
            ? {
                attachments: mail.attachments.map((attachment) => ({
                  "@odata.type": "#microsoft.graph.fileAttachment",
                  name: attachment.filename,
                  contentType: attachment.contentType || "application/octet-stream",
                  contentBytes: attachment.content.toString("base64"),
                })),
              }
            : {}),
        },
        saveToSentItems: true,
      },
    );
    if (!result.ok) return result;
    return { ok: true, value: { providerMessageId: null } };
  },

  /*
   * Graph filters server-side and returns the body in the listing, so one
   * call does the whole job. The cursor is the newest receivedDateTime seen.
   */
  async fetchSince(accessToken, _mailbox, cursor): Promise<ProviderResult<FetchResult>> {
    const state = readCursor<GraphCursor>(cursor);
    const params = new URLSearchParams({
      $top: "50",
      $orderby: "receivedDateTime desc",
      $select: "id,subject,from,receivedDateTime,bodyPreview,body,internetMessageId",
    });
    if (state.since) params.set("$filter", `receivedDateTime gt ${state.since}`);
    const listed = await getJson(
      `https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?${params.toString()}`,
      accessToken,
      "Outlook",
    );
    if (!listed.ok) return listed;
    const parsed = graphMessagesSchema.safeParse(listed.value);
    if (!parsed.success) {
      console.error("[mailbox] graph messages shape:", JSON.stringify(listed.value).slice(0, 500));
      return { ok: false, error: "Outlook's message list is not in the shape this version expects." };
    }

    let newest = state.since ?? "";
    const messages: IncomingMail[] = [];
    for (const m of parsed.data.value) {
      const address = m.from?.emailAddress?.address;
      if (!address) continue;
      if (m.receivedDateTime > newest) newest = m.receivedDateTime;
      const html = m.body?.contentType?.toLowerCase() === "html" ? (m.body?.content ?? null) : null;
      const text = html ? htmlToText(html) : (m.body?.content ?? null);
      messages.push({
        providerMessageId: m.id,
        providerRef: m.id,
        fromAddress: address.toLowerCase(),
        fromName: m.from?.emailAddress?.name?.trim() || null,
        subject: m.subject?.trim() || "(no subject)",
        snippet: (m.bodyPreview ?? "").trim(),
        bodyText: text,
        bodyHtml: html,
        receivedAt: new Date(m.receivedDateTime),
        internetMessageId: m.internetMessageId ?? null,
      });
    }
    messages.sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime());
    const next: GraphCursor = { since: newest };
    return { ok: true, value: { messages, cursor: JSON.stringify(next) } };
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
