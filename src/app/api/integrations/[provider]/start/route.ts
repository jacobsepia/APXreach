import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getProvider } from "@/lib/providers";
import {
  authorizeUrl,
  callbackUrl,
  clientCredentials,
  createPkcePair,
  createState,
} from "@/lib/oauth";

/*
 * Step one of connecting books: mint PKCE + state, stash them in httpOnly
 * cookies, and send the person to the provider's own consent screen. The
 * route is provider-agnostic — /api/integrations/xero/start will work the day
 * a Xero provider exists, with no new code here.
 */

export const dynamic = "force-dynamic";

/** Ten minutes is longer than any consent screen and shorter than a coffee. */
const HANDSHAKE_TTL_SECONDS = 600;

function settingsError(origin: string, message: string): NextResponse {
  return NextResponse.redirect(
    `${origin}/settings?error=${encodeURIComponent(message)}`,
    { status: 303 },
  );
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const origin = new URL(request.url).origin;

  /* Connecting books is a privileged act: only a signed-in person may start
     one, or an unauthenticated visitor could bind a workspace to their own. */
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.redirect(`${origin}/sign-in?to=/settings`, { status: 303 });
  }

  const { provider: providerId } = await params;
  const provider = getProvider(providerId);
  if (!provider?.oauth) {
    return settingsError(origin, "That provider can't be connected yet.");
  }

  const credentials = clientCredentials(provider);
  if (!credentials.ok) return settingsError(origin, credentials.error);

  const { verifier, challenge } = createPkcePair();
  const state = createState();

  const response = NextResponse.redirect(
    authorizeUrl({
      provider,
      clientId: credentials.value.clientId,
      redirectUri: callbackUrl(origin, provider.id),
      state,
      challenge,
    }),
    { status: 303 },
  );

  const cookie = {
    httpOnly: true,
    secure: origin.startsWith("https://"),
    sameSite: "lax" as const,
    path: "/api/integrations",
    maxAge: HANDSHAKE_TTL_SECONDS,
  };
  response.cookies.set(`apxreach_pkce_${provider.id}`, verifier, cookie);
  response.cookies.set(`apxreach_state_${provider.id}`, state, cookie);
  return response;
}
