import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { AccountingProvider, OAuthTokens, ProviderResult } from "@/lib/providers";

/*
 * Reach's side of the OAuth2 authorization-code flow — the ceremony every
 * books provider is connected through.
 *
 * PKCE is not optional here: Ledger requires S256, and it is what makes the
 * redirect safe to hand through a browser. The verifier and the CSRF state
 * live in short-lived httpOnly cookies between /start and /callback, so a
 * half-finished authorization leaves nothing behind in the database.
 *
 * Refresh tokens ROTATE and Ledger detects reuse: presenting an old refresh
 * token is treated as theft and kills the whole grant. So the rule this file
 * exists to enforce is that a refreshed pair is persisted before it is used,
 * and a failed refresh is never retried with the same token.
 */

export interface PkcePair {
  verifier: string;
  challenge: string;
}

export function createPkcePair(): PkcePair {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier, "utf8").digest("base64url");
  return { verifier, challenge };
}

export function createState(): string {
  return randomBytes(24).toString("base64url");
}

/** Constant-time compare for the state echo, which is attacker-supplied. */
export function statesMatch(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export interface ClientCredentials {
  clientId: string;
  clientSecret: string;
}

/**
 * A provider's registered client, from env. Missing credentials are a
 * configuration error worth saying plainly — it is the one thing that cannot
 * be fixed from inside the app.
 */
export function clientCredentials(
  provider: AccountingProvider,
): ProviderResult<ClientCredentials> {
  if (!provider.oauth) {
    return { ok: false, error: `${provider.label} does not support connecting yet.` };
  }
  const clientId = process.env[provider.oauth.clientIdEnv];
  const clientSecret = process.env[provider.oauth.clientSecretEnv];
  if (!clientId || !clientSecret) {
    return {
      ok: false,
      error: `${provider.label} is not registered yet — set ${provider.oauth.clientIdEnv} and ${provider.oauth.clientSecretEnv}.`,
    };
  }
  return { ok: true, value: { clientId, clientSecret } };
}

/** Where the provider sends the person back. Must match what was registered. */
export function callbackUrl(origin: string, providerId: string): string {
  return `${origin}/api/integrations/${providerId}/callback`;
}

export function authorizeUrl(params: {
  provider: AccountingProvider;
  clientId: string;
  redirectUri: string;
  state: string;
  challenge: string;
}): string {
  const { provider, clientId, redirectUri, state, challenge } = params;
  const url = new URL(provider.oauth!.authorizeUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", provider.oauth!.scopes.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

const tokenResponseKeys = ["access_token", "refresh_token", "expires_in", "scope"] as const;

function readTokens(body: Record<string, unknown>): OAuthTokens | null {
  const accessToken = body[tokenResponseKeys[0]];
  if (typeof accessToken !== "string" || accessToken === "") return null;
  const refreshToken = body[tokenResponseKeys[1]];
  const expiresIn = body[tokenResponseKeys[2]];
  const scope = body[tokenResponseKeys[3]];
  return {
    accessToken,
    refreshToken: typeof refreshToken === "string" ? refreshToken : null,
    expiresAt:
      typeof expiresIn === "number" ? new Date(Date.now() + expiresIn * 1000) : null,
    scopes: typeof scope === "string" ? scope.split(" ").filter(Boolean) : [],
  };
}

/** Both grants answer the same way, so both parse the same way. */
async function postToken(
  provider: AccountingProvider,
  credentials: ClientCredentials,
  form: Record<string, string>,
): Promise<ProviderResult<OAuthTokens>> {
  let response: Response;
  try {
    response = await fetch(provider.oauth!.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        /* Basic auth: what Ledger's endpoint reads first, and what every
           real OAuth library sends. */
        Authorization:
          "Basic " +
          Buffer.from(
            `${encodeURIComponent(credentials.clientId)}:${encodeURIComponent(credentials.clientSecret)}`,
          ).toString("base64"),
        Accept: "application/json",
      },
      body: new URLSearchParams(form).toString(),
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: `Could not reach ${provider.label}.` };
  }

  let body: Record<string, unknown>;
  try {
    body = (await response.json()) as Record<string, unknown>;
  } catch {
    return { ok: false, error: `${provider.label} returned an unreadable token response.` };
  }

  if (!response.ok) {
    const description =
      typeof body.error_description === "string"
        ? body.error_description
        : typeof body.error === "string"
          ? body.error
          : `HTTP ${response.status}`;
    return { ok: false, error: description };
  }

  const tokens = readTokens(body);
  if (!tokens) {
    return { ok: false, error: `${provider.label} returned a token response without a token.` };
  }
  return { ok: true, value: tokens };
}

export async function exchangeCode(params: {
  provider: AccountingProvider;
  credentials: ClientCredentials;
  code: string;
  redirectUri: string;
  verifier: string;
}): Promise<ProviderResult<OAuthTokens>> {
  return postToken(params.provider, params.credentials, {
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: params.redirectUri,
    code_verifier: params.verifier,
  });
}

export async function refreshTokens(params: {
  provider: AccountingProvider;
  credentials: ClientCredentials;
  refreshToken: string;
}): Promise<ProviderResult<OAuthTokens>> {
  return postToken(params.provider, params.credentials, {
    grant_type: "refresh_token",
    refresh_token: params.refreshToken,
  });
}

/**
 * RFC 7009. Best-effort by design: if revocation fails, Reach still forgets
 * its copy of the tokens — the person asked to disconnect, and a stale grant
 * on the provider's side is theirs to clear from Ledger's own screen.
 */
export async function revokeToken(params: {
  provider: AccountingProvider;
  credentials: ClientCredentials;
  token: string;
}): Promise<boolean> {
  const url = params.provider.oauth?.revokeUrl;
  if (!url) return false;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization:
          "Basic " +
          Buffer.from(
            `${encodeURIComponent(params.credentials.clientId)}:${encodeURIComponent(params.credentials.clientSecret)}`,
          ).toString("base64"),
      },
      body: new URLSearchParams({ token: params.token }).toString(),
      cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  }
}
