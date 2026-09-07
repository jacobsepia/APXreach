import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireTenant } from "@/lib/workspace";
import { getProvider } from "@/lib/providers";
import { callbackUrl, clientCredentials, exchangeCode, statesMatch } from "@/lib/oauth";
import { connectableCompanies, saveConnection } from "@/lib/sync";
import { stashPendingBooks } from "@/lib/books-choice";

/*
 * Step two: the provider sends the person back with a code. Verify the state
 * against our cookie, trade the code for tokens using the verifier we kept,
 * ask the provider which company the grant opens, and store the connection.
 *
 * Every exit clears the handshake cookies — a code is single-use and a
 * verifier that outlives its exchange is just a liability lying around.
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
      : `${origin}/settings?connected=1`;
    const response = NextResponse.redirect(target, { status: 303 });
    response.cookies.set(`apxreach_pkce_${providerId}`, "", { path: "/api/integrations", maxAge: 0 });
    response.cookies.set(`apxreach_state_${providerId}`, "", { path: "/api/integrations", maxAge: 0 });
    return response;
  };

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.redirect(`${origin}/sign-in?to=/settings`, { status: 303 });
  }

  const tenant = await requireTenant();
  const provider = getProvider(providerId);
  if (!provider?.oauth) return finish("That provider can't be connected yet.");

  /* The provider refused, or the person declined on the consent screen. */
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
  const expectedState = jar[`apxreach_state_${providerId}`];
  const verifier = jar[`apxreach_pkce_${providerId}`];
  if (!expectedState || !verifier || !statesMatch(expectedState, returnedState) || !expectedState.startsWith(`${tenant.userId}:${tenant.workspaceId}:`)) {
    return finish("That connection attempt expired or didn't match. Try again.");
  }

  const credentials = clientCredentials(provider);
  if (!credentials.ok) return finish(credentials.error);

  const tokens = await exchangeCode({
    provider,
    credentials: credentials.value,
    code,
    redirectUri: callbackUrl(origin, provider.id),
    verifier,
  });
  if (!tokens.ok) return finish(tokens.error);

  /*
   * One sign-in can cover several sets of books. A workspace takes exactly
   * one, so when there is a choice to make the person makes it rather than
   * silently getting whichever the provider happened to list first.
   */
  const available = await connectableCompanies(provider, tokens.value.accessToken);
  if (!available.ok) return finish(available.error);
  if (available.value.length > 1) {
    await stashPendingBooks({ provider: provider.id, workspaceId: tenant.workspaceId, tokens: tokens.value });
    const response = NextResponse.redirect(`${origin}/settings/books`, { status: 303 });
    response.cookies.set(`apxreach_pkce_${providerId}`, "", { path: "/api/integrations", maxAge: 0 });
    response.cookies.set(`apxreach_state_${providerId}`, "", { path: "/api/integrations", maxAge: 0 });
    return response;
  }

  const saved = await saveConnection(tenant.workspaceId, provider, tokens.value, origin, available.value[0].externalId);
  if (!saved.ok) return finish(saved.error);
  return finish();
}
