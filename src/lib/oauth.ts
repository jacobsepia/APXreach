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

/*
 * How the client proves who it is on the token endpoint. RFC 6749 defines
 * both, and which one a server implements is not discoverable — so Reach
 * sends `client_secret_basic` first (what Ledger reads, and what every real
 * OAuth library sends) and falls back to `client_secret_post` once if the
 * server answers that the CLIENT was not accepted. Never both at once: §2.3
 * says a request must carry exactly one method, and servers that check will
 * reject a request carrying two.
 */
type ClientAuthMethod = "basic" | "post";

/**
 * The Basic header carries the raw id and secret. They are NOT percent-encoded
 * first: RFC 6749 §2.3.1 nominally form-encodes them, but almost no server
 * decodes, so encoding a secret containing `+`, `/` or `=` — the alphabet half
 * of every base64 secret — is what turns a correct secret into a 401.
 */
function basicHeader(credentials: ClientCredentials): string {
  return (
    "Basic " +
    Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`, "utf8").toString(
      "base64",
    )
  );
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

type TokenAttempt =
  | { ok: true; value: OAuthTokens }
  /** `clientRejected` marks the one failure the other auth method could fix. */
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
    return {
      ok: false,
      error: `Could not reach ${provider.label}.`,
      clientRejected: false,
    };
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
    /* The response body is the only record of why a connection failed, and it
       is gone by the time anyone asks. Codes only — never the credentials. */
    console.error(
      `[oauth] ${provider.id} token request refused (${method} auth): HTTP ${response.status} ${code ?? "no code"} — ${description}`,
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

  /* A server that authenticates the client before spending the code — which
     is the order the spec implies and every implementation follows — leaves
     the code usable for this one retry. */
  const post = await attemptToken(provider, credentials, form, "post");
  if (post.ok) return { ok: true, value: post.value };
  if (!post.clientRejected) return { ok: false, error: post.error };

  return {
    ok: false,
    error:
      `${provider.label} would not accept Reach's client credentials (${post.error}). ` +
      `Check that ${provider.oauth!.clientIdEnv} and ${provider.oauth!.clientSecretEnv} ` +
      `match the client registered on ${provider.label}, and that this deployment's ` +
      `callback URL is one of that client's redirect URIs.`,
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
