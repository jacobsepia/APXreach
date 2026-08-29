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
 *
 * Trimmed on the way out: a secret pasted into a dashboard field arrives with
 * a trailing newline often enough that it is not worth debugging twice, and no
 * provider issues a secret with edge whitespace in it.
 */
export function clientCredentials(
  provider: AccountingProvider,
): ProviderResult<ClientCredentials> {
  if (!provider.oauth) {
    return { ok: false, error: `${provider.label} does not support connecting yet.` };
  }
  const clientId = process.env[provider.oauth.clientIdEnv]?.trim();
  const clientSecret = process.env[provider.oauth.clientSecretEnv]?.trim();
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

/**
 * `client_secret_basic` — the method Ledger's token endpoint reads first, and
 * what every real OAuth library sends.
 *
 * The two halves are percent-encoded before the colon, per RFC 6749 §2.3.1,
 * and Ledger decodeURIComponent()s them back on arrival. Do not "simplify"
 * this to a raw `id:secret`: on a secret containing a percent sign that turns
 * Ledger's decode into a URIError, which it answers as invalid_client. Both
 * sides are a no-op on the base64url secrets Ledger actually issues, so this
 * pairing is invisible until the day it isn't.
 */
function basicHeader(credentials: ClientCredentials): string {
  const encoded = `${encodeURIComponent(credentials.clientId)}:${encodeURIComponent(credentials.clientSecret)}`;
  return "Basic " + Buffer.from(encoded, "utf8").toString("base64");
}

const tokenResponseKeys = ["access_token", "refresh_token", "expires_in", "scope"] as const;

/** `expires_in` is seconds. Some servers send it as a JSON string; both count. */
function readExpiresIn(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const seconds = Number(value);
    if (Number.isFinite(seconds)) return seconds;
  }
  return null;
}

function readTokens(body: Record<string, unknown>): OAuthTokens | null {
  const accessToken = body[tokenResponseKeys[0]];
  if (typeof accessToken !== "string" || accessToken === "") return null;
  const refreshToken = body[tokenResponseKeys[1]];
  const expiresIn = readExpiresIn(body[tokenResponseKeys[2]]);
  const scope = body[tokenResponseKeys[3]];
  return {
    accessToken,
    refreshToken: typeof refreshToken === "string" ? refreshToken : null,
    expiresAt: expiresIn !== null ? new Date(Date.now() + expiresIn * 1000) : null,
    scopes: typeof scope === "string" ? scope.split(" ").filter(Boolean) : [],
  };
}

/*
 * Which method proves the client. Ledger accepts either, but reads the Basic
 * header EXCLUSIVELY when one is present — it never falls through to the body
 * — so if that header does not survive the trip, body credentials are the only
 * way the request can authenticate at all. Basic goes first because it is what
 * every OAuth library sends; `post` is the retry, not a second opinion, and
 * the two are never combined (RFC 6749 §2.3 allows exactly one per request).
 *
 * The retry is safe on an authorization_code grant: Ledger authenticates the
 * client BEFORE it spends the code, so a refusal here leaves the code unused.
 */
type ClientAuthMethod = "basic" | "post";

type TokenAttempt =
  | { ok: true; value: OAuthTokens }
  /** `clientRejected` marks the one refusal the other method could fix. */
  | { ok: false; error: string; clientRejected: boolean };

async function attemptToken(
  provider: AccountingProvider,
  credentials: ClientCredentials,
  form: Record<string, string>,
  method: ClientAuthMethod,
): Promise<TokenAttempt> {
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  };
  const body = { ...form };
  if (method === "basic") {
    headers.Authorization = basicHeader(credentials);
  } else {
    body.client_id = credentials.clientId;
    body.client_secret = credentials.clientSecret;
  }

  let response: Response;
  try {
    response = await fetch(provider.oauth!.tokenUrl, {
      method: "POST",
      headers,
      body: new URLSearchParams(body).toString(),
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: `Could not reach ${provider.label}.`, clientRejected: false };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = (await response.json()) as Record<string, unknown>;
  } catch {
    return {
      ok: false,
      error: `${provider.label} returned an unreadable token response.`,
      clientRejected: false,
    };
  }

  if (!response.ok) {
    const code = typeof parsed.error === "string" ? parsed.error : null;
    const description =
      typeof parsed.error_description === "string"
        ? parsed.error_description
        : (code ?? `HTTP ${response.status}`);
    console.error(
      `[oauth] ${provider.id} ${form.grant_type} refused (${method} auth): HTTP ${response.status} ${code ?? "no code"} — ${description}`,
    );
    return {
      ok: false,
      error: description,
      clientRejected: code === "invalid_client" || response.status === 401,
    };
  }

  const tokens = readTokens(parsed);
  if (!tokens) {
    return {
      ok: false,
      error: `${provider.label} returned a token response without a token.`,
      clientRejected: false,
    };
  }
  console.info(`[oauth] ${provider.id} ${form.grant_type} accepted (${method} auth).`);
  return { ok: true, value: tokens };
}

/** Both grants answer the same way, so both parse the same way. */
async function postToken(
  provider: AccountingProvider,
  credentials: ClientCredentials,
  form: Record<string, string>,
): Promise<ProviderResult<OAuthTokens>> {
  const basic = await attemptToken(provider, credentials, form, "basic");
  if (basic.ok) return { ok: true, value: basic.value };
  if (!basic.clientRejected) return { ok: false, error: basic.error };

  const post = await attemptToken(provider, credentials, form, "post");
  if (post.ok) return { ok: true, value: post.value };
  if (!post.clientRejected) return { ok: false, error: post.error };

  /*
   * Both methods refused the client, so the pair itself is wrong. The secret
   * must never be logged, but its sha256 prefix is safe and is exactly what
   * the provider stores — read it off these logs and compare against their
   * record rather than guessing which half is stale.
   */
  const fingerprint = createHash("sha256")
    .update(credentials.clientSecret, "utf8")
    .digest("hex")
    .slice(0, 10);
  console.error(
    `[oauth] ${provider.id} rejected the client on both auth methods — client_id=${credentials.clientId} secret_length=${credentials.clientSecret.length} secret_sha256=${fingerprint}`,
  );
  return {
    ok: false,
    error:
      `${provider.label} did not recognise Reach's client credentials. Check that ` +
      `${provider.oauth!.clientIdEnv} and ${provider.oauth!.clientSecretEnv} on this ` +
      `deployment are the pair ${provider.label} last issued — re-registering the ` +
      `client rotates the secret, and the old one keeps failing exactly like this.`,
  };
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
        Authorization: basicHeader(params.credentials),
      },
      body: new URLSearchParams({ token: params.token }).toString(),
      cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  }
}
