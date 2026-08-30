import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getProvider } from "@/lib/providers";
import { callbackUrl, clientCredentials, exchangeCode, statesMatch } from "@/lib/oauth";
import { saveConnection } from "@/lib/sync";

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
    response.cookies.delete(`apxreach_pkce_${providerId}`);
    response.cookies.delete(`apxreach_state_${providerId}`);
    return response;
  };

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.redirect(`${origin}/sign-in?to=/settings`, { status: 303 });
  }

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
  if (!expectedState || !verifier || !statesMatch(expectedState, returnedState)) {
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

  const saved = await saveConnection(provider, tokens.value, origin);
  if (!saved.ok) return finish(saved.error);
  return finish();
}
