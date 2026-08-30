import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
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

/*
 * Who may register. Reach holds figures synced from the books, so sign-up is
 * not public: only these domains get in. Widen the list (or replace with
 * invitations) when the team grows past the company.
 */
const ALLOWED_SIGNUP_DOMAINS = ["apxsolutions.ca"];

const OUTSIDE_THE_TEAM =
  "Sign-up is limited to the APX team for now. Ask Jacob for an account.";

/**
 * Exported to be tested directly: this one predicate is the whole boundary
 * between the APX team and everyone else, and the ways to fool a domain check
 * — a second @, a lookalike suffix, an address that merely contains the
 * domain — are the kind that read as fine and are not.
 */
export function allowedDomain(email: string): boolean {
  const parts = email.trim().toLowerCase().split("@");
  /* Exactly one @, and the part after it is the whole domain. */
  if (parts.length !== 2) return false;
  return ALLOWED_SIGNUP_DOMAINS.includes(parts[1]);
}

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
  /*
   * The domain gate, at the point where an account is actually created rather
   * than on the email sign-up route alone. Signing in with APX creates a user
   * too, so gating only /sign-up/email would have left a second door into a
   * CRM that holds the company's books — anyone with a Ledger account could
   * have walked through it.
   */
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          if (!allowedDomain(user.email)) {
            throw new APIError("FORBIDDEN", { message: OUTSIDE_THE_TEAM });
          }
          return { data: user };
        },
      },
    },
  },
  hooks: {
    /* Same rule, said earlier and more kindly, on the form that has a field. */
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/sign-up/email") {
        const email = String(
          (ctx.body as { email?: string } | undefined)?.email ?? "",
        );
        if (!allowedDomain(email)) {
          throw new APIError("BAD_REQUEST", { message: OUTSIDE_THE_TEAM });
        }
      }
    }),
  },
  plugins: [
    ...(ledgerSignInReady
      ? [
          genericOAuth({
            config: [
              {
                providerId: "apxledger",
                clientId: process.env.APXLEDGER_CLIENT_ID!,
                clientSecret: process.env.APXLEDGER_CLIENT_SECRET!,
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
