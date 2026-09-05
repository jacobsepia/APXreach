import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getMailboxProvider } from "@/lib/mailbox/providers";
import {
  authorizeUrl,
  clientCredentials,
  createPkcePair,
  createState,
} from "@/lib/oauth";

/*
 * Step one of connecting a mailbox. Same ceremony as connecting the books,
 * against a different set of endpoints — which is the point of having the
 * OAuth helpers take a client rather than a books provider.
 */

export const dynamic = "force-dynamic";

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

  /* A mailbox is bound to the person connecting it, so there must be one. */
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.redirect(`${origin}/sign-in?to=/settings`, { status: 303 });
  }

  const { provider: providerId } = await params;
  const provider = getMailboxProvider(providerId);
  if (!provider) return settingsError(origin, "That mailbox can't be connected yet.");

  const credentials = clientCredentials(provider);
  if (!credentials.ok) return settingsError(origin, credentials.error);

  const { verifier, challenge } = createPkcePair();
  const state = createState();

  const response = NextResponse.redirect(
    authorizeUrl({
      provider,
      clientId: credentials.value.clientId,
      redirectUri: `${origin}/api/mailboxes/${provider.id}/callback`,
      state,
      challenge,
    }),
    { status: 303 },
  );

  const cookie = {
    httpOnly: true,
    secure: origin.startsWith("https://"),
    sameSite: "lax" as const,
    path: "/api/mailboxes",
    maxAge: HANDSHAKE_TTL_SECONDS,
  };
  response.cookies.set(`apxreach_mbox_pkce_${provider.id}`, verifier, cookie);
  response.cookies.set(`apxreach_mbox_state_${provider.id}`, state, cookie);
  return response;
}
