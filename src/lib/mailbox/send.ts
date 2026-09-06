import { eq } from "drizzle-orm";
import { db, mailboxes } from "@/db";
import { clientCredentials, refreshTokens } from "@/lib/oauth";
import { getMailboxProvider } from "@/lib/mailbox/providers";
import type { OutgoingMail, SentMail } from "@/lib/mailbox/types";
import type { ProviderResult } from "@/lib/providers";

/*
 * Sending as a person, through the mailbox they connected.
 *
 * Every failure here is returned rather than thrown. A refused send is not an
 * exception in the CRM sense — the contact is untouched and the timeline has
 * no gap — and the person who pressed Send needs to know which of "the token
 * expired", "the provider refused the address" and "we could not reach them"
 * happened, all of which a thrown error flattens into "something went wrong".
 */

type MailboxRow = typeof mailboxes.$inferSelect;

/** Renew a minute early: a token that expires mid-flight reads as a refusal. */
const RENEW_WITHIN_MS = 60_000;

/**
 * A usable access token, refreshed and persisted first if it is close to
 * expiry. Persisted BEFORE it is used, because a provider that rotates
 * refresh tokens treats the old one as spent — using a pair before saving it
 * is how a connection ends up unrecoverable after one crash.
 */
export async function accessTokenFor(mailbox: MailboxRow): Promise<ProviderResult<string>> {
  const provider = getMailboxProvider(mailbox.provider);
  if (!provider) return { ok: false, error: "That mail provider is no longer supported." };

  const expiringSoon =
    mailbox.tokenExpiresAt !== null &&
    mailbox.tokenExpiresAt.getTime() - Date.now() < RENEW_WITHIN_MS;
  if (mailbox.accessToken && !expiringSoon) {
    return { ok: true, value: mailbox.accessToken };
  }
  if (!mailbox.refreshToken) {
    return { ok: false, error: `Reconnect ${mailbox.providerLabel} — the connection expired.` };
  }

  const credentials = clientCredentials(provider);
  if (!credentials.ok) return credentials;

  const refreshed = await refreshTokens({
    provider,
    credentials: credentials.value,
    refreshToken: mailbox.refreshToken,
  });
  if (!refreshed.ok) {
    /*
     * A Google client still in Testing has its refresh tokens expired after
     * seven days, which arrives here as a plain refusal and is otherwise a
     * baffling weekly outage. Say so where it will be read.
     */
    const hint =
      mailbox.provider === "google"
        ? " Google expires refresh tokens after seven days while the app is unpublished, so this recurs weekly until it is verified."
        : "";
    await db
      .update(mailboxes)
      .set({ lastError: `${refreshed.error}${hint}`, status: "disconnected" })
      .where(eq(mailboxes.id, mailbox.id));
    return { ok: false, error: `${mailbox.providerLabel} ended the connection: ${refreshed.error}${hint}` };
  }

  await db
    .update(mailboxes)
    .set({
      accessToken: refreshed.value.accessToken,
      refreshToken: refreshed.value.refreshToken ?? mailbox.refreshToken,
      tokenExpiresAt: refreshed.value.expiresAt,
      status: "connected",
      lastError: null,
    })
    .where(eq(mailboxes.id, mailbox.id));
  return { ok: true, value: refreshed.value.accessToken };
}

export async function sendFromMailbox(
  mailbox: MailboxRow,
  mail: OutgoingMail,
): Promise<ProviderResult<SentMail>> {
  const provider = getMailboxProvider(mailbox.provider);
  if (!provider) return { ok: false, error: "That mail provider is no longer supported." };

  const token = await accessTokenFor(mailbox);
  if (!token.ok) return token;

  const sent = await provider.send(
    token.value,
    {
      emailAddress: mailbox.emailAddress,
      displayName: mailbox.displayName,
      providerAccountId: mailbox.providerAccountId,
    },
    mail,
  );
  if (!sent.ok) {
    await db
      .update(mailboxes)
      .set({ lastError: sent.error })
      .where(eq(mailboxes.id, mailbox.id));
    return sent;
  }
  if (mailbox.lastError) {
    await db.update(mailboxes).set({ lastError: null }).where(eq(mailboxes.id, mailbox.id));
  }
  return sent;
}
