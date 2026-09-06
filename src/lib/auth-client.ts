import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({});

export const { signIn, signUp, signOut, useSession } = authClient;

/*
 * Start "Sign in with APX". The generic-OAuth plugin registers this route
 * server-side and answers with the provider's authorize URL; this build's
 * client bundle has no typed helper for it, so the call is written out.
 */
export async function signInWithApx(callbackURL = "/dashboard"): Promise<string> {
  const response = await fetch("/api/auth/sign-in/oauth2", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ providerId: "apx", callbackURL }),
  });
  const body = (await response.json()) as { url?: string; message?: string };
  if (!response.ok || !body.url) {
    throw new Error(body.message ?? "APX sign-in is not available right now.");
  }
  return body.url;
}
