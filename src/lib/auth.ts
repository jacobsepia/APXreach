import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/db";
import * as authSchema from "@/db/schema/auth";

/*
 * Same posture as APX Ledger's auth. Email/password for now; Sign in with APX
 * (Ledger's OIDC provider) becomes a genericOAuth provider here once Ledger's
 * consent screen ships — same session, same tables.
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

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema: authSchema }),
  emailAndPassword: {
    enabled: true,
  },
  trustedOrigins: trustedOrigins(),
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/sign-up/email") {
        const email = String(
          (ctx.body as { email?: string } | undefined)?.email ?? "",
        ).toLowerCase();
        const domain = email.split("@")[1] ?? "";
        if (!ALLOWED_SIGNUP_DOMAINS.includes(domain)) {
          throw new APIError("BAD_REQUEST", {
            message:
              "Sign-up is limited to the APX team for now. Ask Jacob for an account.",
          });
        }
      }
    }),
  },
  plugins: [nextCookies()],
});
