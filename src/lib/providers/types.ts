/*
 * The provider boundary — the same design APX Collect uses for Xero and
 * QuickBooks, with APX Ledger as provider #1. Reach never talks to an
 * accounting system directly: a provider validates credentials and hands back
 * NORMALIZED shapes, and everything past this file is provider-agnostic.
 * Hooking up the next system (Xero, QuickBooks, a future APX product) means
 * implementing this interface and adding one line to the registry.
 */

export type ProviderId = "apxledger" | "xero" | "quickbooks";

export interface ProviderCompany {
  /** The company's id inside the provider. */
  externalId: string;
  name: string;
  currency: string;
  scopes: string[];
}

export interface NormalizedContact {
  externalId: string;
  name: string;
  email: string | null;
  phone: string | null;
  isCustomer: boolean;
}

export interface NormalizedInvoice {
  externalId: string;
  number: string;
  contactExternalId: string;
  issueDate: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD
  totalCents: number;
  outstandingCents: number;
  /** True once fully settled; drafts and voids never reach Reach. */
  paid: boolean;
}

export type ProviderResult<T> = { ok: true; value: T } | { ok: false; error: string };

/*
 * How a provider is authorized. Every system worth connecting to speaks
 * OAuth2 authorization-code + PKCE — APX Ledger, Xero and QuickBooks all do —
 * so this is the only ceremony Reach implements. The person clicks Connect,
 * approves on the provider's own consent screen, and Reach never sees, asks
 * for, or stores a credential a human had to copy.
 */
export interface ProviderOAuth {
  authorizeUrl: string;
  tokenUrl: string;
  /** RFC 7009 — hand back a token and the grant ends. */
  revokeUrl?: string;
  /** What Reach asks for. The consent screen shows these to the person. */
  scopes: string[];
  /** Env var names holding this client's registered credentials. */
  clientIdEnv: string;
  clientSecretEnv: string;
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string | null;
  /** Absolute expiry, computed from the response's expires_in. */
  expiresAt: Date | null;
  scopes: string[];
}

/**
 * A push subscription, for providers that offer one. Absent means Reach polls
 * and nothing else changes.
 *
 * Payloads are never trusted for their contents — a ping says only "these
 * books changed", and Reach answers by running the same sync it already
 * trusts. So a forged ping costs a sync that finds nothing, which is why
 * verifying the signature is about spending nobody's rate limit rather than
 * about protecting the data.
 */
export interface ProviderWebhooks {
  /** Subscribe this deployment's receiver. Returns the id and signing secret. */
  register(
    credentials: string,
    externalCompanyId: string,
    url: string,
  ): Promise<ProviderResult<{ endpointId: string; secret: string }>>;
  /** Best-effort teardown on disconnect; a stale endpoint is theirs to disable. */
  unregister(
    credentials: string,
    externalCompanyId: string,
    endpointId: string,
  ): Promise<boolean>;
  /** True when this body really came from the provider, and recently. */
  verify(secret: string, body: string, signatureHeader: string): boolean;
}

export interface AccountingProvider {
  id: ProviderId;
  /** Human name, shown in the UI and on synced-data captions. */
  label: string;
  /** One line about what connecting does, shown beside the button. */
  connectHint: string;
  /** The OAuth endpoints and scopes. Absent = not yet implemented. */
  oauth?: ProviderOAuth;
  /** Push instead of poll, where the provider supports it. */
  webhooks?: ProviderWebhooks;
  /** Check the credential and identify the company it opens. */
  validate(credentials: string): Promise<ProviderResult<ProviderCompany>>;
  /** Pull everything the CRM mirrors. Incremental cursors come later. */
  pull(
    credentials: string,
    externalCompanyId: string,
  ): Promise<ProviderResult<{ contacts: NormalizedContact[]; invoices: NormalizedInvoice[] }>>;
}
