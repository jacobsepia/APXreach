import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import { db } from "@/db";
import * as authSchema from "@/db/schema/auth";
import { LEDGER_BASE_URL } from "@/lib/providers/apxledger";

/*
 * Same posture as APX Ledger's auth: email and password, plus Sign in with
 * APX — Ledger is an OIDC provider, so one identity spans Ledger, Collect,
 * Planner and Reach, on the same session and the same tables.
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

// Accounts are public; records require explicit workspace membership.

/**
 * Whether Sign in with APX can be offered at all. The button is hidden rather
 * than shown broken when the client is not configured — a provider registered
 * without credentials fails at the consent screen, which is the worst place to
 * find out.
 */
export const ledgerSignInReady = Boolean(
  process.env.APXLEDGER_CLIENT_ID && process.env.APXLEDGER_CLIENT_SECRET,
);

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema: authSchema }),
  emailAndPassword: {
    enabled: true,
  },
  trustedOrigins: trustedOrigins(),
  account: {
    accountLinking: {
      enabled: true,
      /*
       * Ledger may be linked to an existing account by matching email. It is
       * trusted for that because it is the same company's own identity
       * provider and it verifies addresses itself — the claim is not taken
       * from an arbitrary issuer. No other provider gets this.
       */
      trustedProviders: ["apxledger"],
    },
  },
  plugins: [
    ...(ledgerSignInReady
      ? [
          genericOAuth({
            config: [
              {
                providerId: "apxledger",
                clientId: process.env.APXLEDGER_CLIENT_ID!.trim(),
                clientSecret: process.env.APXLEDGER_CLIENT_SECRET!.trim(),
                /*
                 * Named outright rather than discovered. Ledger publishes
                 * /.well-known/openid-configuration and these are its exact
                 * values, but discovery is fetched when the provider is
                 * initialised — on a cold start, over the network. A blip
                 * there does not fail loudly: the provider is dropped and the
                 * button stops working while everything else looks fine.
                 * Three URLs that have never moved are the safer dependency.
                 */
                authorizationUrl: `${LEDGER_BASE_URL}/oauth/authorize`,
                tokenUrl: `${LEDGER_BASE_URL}/api/oauth/token`,
                userInfoUrl: `${LEDGER_BASE_URL}/api/oauth/userinfo`,
                scopes: ["openid", "email", "profile"],
                /* Ledger requires S256 and refuses an authorize without it. */
                pkce: true,
              },
            ],
          }),
        ]
      : []),
    nextCookies(),
  ],
});
