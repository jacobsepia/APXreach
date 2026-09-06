import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { genericOAuth } from "better-auth/plugins";
import { db } from "@/db";
import * as authSchema from "@/db/schema/auth";

/*
 * Same posture as APX Ledger's auth, and now the same two front doors:
 * "Sign in with APX" against Ledger's OIDC provider, or an ordinary
 * email/password account for someone who has never heard of Ledger.
 * Registration is open — tenancy, not a domain allowlist, is what keeps one
 * company's pipeline out of another's (see lib/workspace.ts).
 */

/**
 * Vercel serves the same deployment on several hostnames (production alias,
 * per-deployment URL). Leaving baseURL unset lets Better Auth infer it per
 * request; these origins are trusted explicitly so the CSRF check agrees.
 * (Pattern carried over from Ledger.)
 */
function trustedOrigins(): string[] {
  const origins = new Set<string>();
  for (const host of [
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_BRANCH_URL,
    process.env.VERCEL_URL,
  ]) {
    if (host) origins.add(`https://${host}`);
  }
  if (process.env.BETTER_AUTH_URL) origins.add(process.env.BETTER_AUTH_URL);
  return [...origins];
}

const APXLEDGER_URL = process.env.APXLEDGER_BASE_URL ?? "https://www.apxledger.ca";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema: authSchema }),
  emailAndPassword: {
    enabled: true,
  },
  trustedOrigins: trustedOrigins(),
  /*
   * Two front doors, which is the product's shape: bring your APX identity,
   * or make an account here. Signing in with APX asks only for identity
   * scopes — connecting books is a separate, later consent, so nobody hands
   * over their ledger just to log in.
   */
  plugins: [
    ...(process.env.APXLEDGER_CLIENT_ID && process.env.APXLEDGER_CLIENT_SECRET
      ? [
          genericOAuth({
            config: [
              {
                providerId: "apx",
                discoveryUrl: `${APXLEDGER_URL}/.well-known/openid-configuration`,
                clientId: process.env.APXLEDGER_CLIENT_ID.trim(),
                clientSecret: process.env.APXLEDGER_CLIENT_SECRET.trim(),
                scopes: ["openid", "email", "profile"],
                pkce: true,
              },
            ],
          }),
        ]
      : []),
    nextCookies(),
  ],
});
