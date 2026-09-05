import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, mailboxes, workspaces } from "@/db";
import { auth } from "@/lib/auth";
import { getMailboxProvider } from "@/lib/mailbox/providers";
import { clientCredentials, exchangeCode, statesMatch } from "@/lib/oauth";

/*
 * Step two: trade the code for tokens, ask the provider whose mailbox it
 * opened, and store it against the person who connected it.
 *
 * The address is never typed in. A mailbox that claims to send as someone it
 * cannot is a bounced email at best and a spoof at worst, so the only address
 * Reach will use is the one the grant itself reports.
 */

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const url = new URL(request.url);
  const origin = url.origin;
  const { provider: providerId } = await params;

  const finish = (message?: string) => {
    const target = message
      ? `${origin}/settings?error=${encodeURIComponent(message)}`
      : `${origin}/settings?mailbox=1`;
    const response = NextResponse.redirect(target, { status: 303 });
    response.cookies.delete(`apxreach_mbox_pkce_${providerId}`);
    response.cookies.delete(`apxreach_mbox_state_${providerId}`);
    return response;
  };

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.redirect(`${origin}/sign-in?to=/settings`, { status: 303 });
  }

  const provider = getMailboxProvider(providerId);
  if (!provider) return finish("That mailbox can't be connected yet.");

  const denied = url.searchParams.get("error");
  if (denied) {
    const description = url.searchParams.get("error_description");
    return finish(
      description ?? (denied === "access_denied" ? "Connection cancelled." : denied),
    );
  }

  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  if (!code || !returnedState) return finish("The provider's reply was incomplete.");

  const cookieHeader = await headers();
  const jar = Object.fromEntries(
    (cookieHeader.get("cookie") ?? "")
      .split(";")
      .map((part) => part.trim().split("="))
      .filter((pair) => pair.length === 2)
      .map(([k, v]) => [k, decodeURIComponent(v)]),
  );
  const expectedState = jar[`apxreach_mbox_state_${providerId}`];
  const verifier = jar[`apxreach_mbox_pkce_${providerId}`];
  if (!expectedState || !verifier || !statesMatch(expectedState, returnedState)) {
    return finish("That connection attempt expired or didn't match. Try again.");
  }

  const credentials = clientCredentials(provider);
  if (!credentials.ok) return finish(credentials.error);

  const tokens = await exchangeCode({
    provider,
    credentials: credentials.value,
    code,
    redirectUri: `${origin}/api/mailboxes/${provider.id}/callback`,
    verifier,
  });
  if (!tokens.ok) return finish(tokens.error);

  const identity = await provider.identify(tokens.value.accessToken);
  if (!identity.ok) return finish(identity.error);

  /*
   * No refresh token means the connection is good for an hour and then dead
   * with nothing to renew it. Better to refuse now, while the person is here
   * and can re-approve, than to fail silently mid-sequence next week.
   */
  if (!tokens.value.refreshToken) {
    return finish(
      `${provider.label} did not return a refresh token, so the connection would expire within the hour. ` +
        `Remove Reach from ${provider.label}'s connected-apps screen and connect again.`,
    );
  }

  const [workspace] = await db.select({ id: workspaces.id }).from(workspaces).limit(1);
  if (!workspace) return finish("No workspace yet.");

  const values = {
    workspaceId: workspace.id,
    userId: session.user.id,
    provider: provider.id,
    providerLabel: provider.label,
    emailAddress: identity.value.email,
    displayName: identity.value.displayName,
    providerAccountId: identity.value.providerAccountId ?? null,
    accessToken: tokens.value.accessToken,
    refreshToken: tokens.value.refreshToken,
    tokenExpiresAt: tokens.value.expiresAt,
    scopes: tokens.value.scopes.join(" "),
    status: "connected" as const,
    lastError: null,
  };

  /* One mailbox per person per provider; reconnecting replaces the grant. */
  const [existing] = await db
    .select({ id: mailboxes.id })
    .from(mailboxes)
    .where(and(eq(mailboxes.userId, session.user.id), eq(mailboxes.provider, provider.id)));
  if (existing) {
    await db.update(mailboxes).set(values).where(eq(mailboxes.id, existing.id));
  } else {
    await db.insert(mailboxes).values(values);
  }

  return finish();
}
