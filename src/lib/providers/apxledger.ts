import { z } from "zod";
import type {
  AccountingProvider,
  NormalizedContact,
  NormalizedInvoice,
  ProviderResult,
} from "./types";

/*
 * Provider #1: APX Ledger, through its platform API — the same door Collect
 * and Planner use. Authorization is OAuth2 authorization-code with PKCE
 * against Ledger's own consent screen: the person picks the company and
 * approves the scopes there, and Reach receives tokens. The read-only
 * `/api/v1` then walks ({ items, nextCursor }) with the access token in the
 * same Authorization header a key would use — Ledger's API resolves both
 * credential kinds to one grant, so nothing below the auth layer cares.
 * Money is integer cents, day-dates YYYY-MM-DD; shapes mirror serialize.ts.
 */

/*
 * The CANONICAL host, with the www. Ledger serves apxledger.ca as a 308 to
 * www.apxledger.ca, and a redirect across hosts strips the Authorization
 * header — the 308 keeps the body, so a token request authenticating in the
 * body survived while every header credential silently vanished in flight.
 * Reading the books needs a Bearer token, which is a header, so the apex host
 * cannot work at all. Point this at the host that answers, never at one that
 * redirects.
 */
const BASE_URL = process.env.APXLEDGER_BASE_URL ?? "https://www.apxledger.ca";

const connectionSchema = z.object({
  companyId: z.string(),
  name: z.string(),
  slug: z.string(),
  baseCurrency: z.string(),
  scopes: z.array(z.string()),
});

const contactSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  isCustomer: z.boolean(),
  isSupplier: z.boolean(),
});

const invoiceSchema = z.object({
  id: z.string(),
  kind: z.enum(["receivable", "payable"]),
  docType: z.enum(["invoice", "credit_note"]),
  number: z.string(),
  contactId: z.string(),
  status: z.enum(["draft", "awaiting_approval", "awaiting_payment", "paid", "voided"]),
  issueDate: z.string(),
  dueDate: z.string(),
  totalCents: z.number().int(),
  amountDueCents: z.number().int(),
});

/**
 * A redirect to another host arrives with the Authorization header removed,
 * so the request that lands is anonymous and the answer is a 401 that looks
 * exactly like a bad credential. Name it instead of letting it masquerade.
 */
function crossHostRedirect(requested: string, response: Response): string | null {
  if (!response.redirected) return null;
  const from = new URL(requested).origin;
  const to = new URL(response.url).origin;
  if (from === to) return null;
  return (
    `${from} redirected to ${to}, and a redirect across hosts strips the ` +
    `Authorization header — the credential never arrives. Set APXLEDGER_BASE_URL ` +
    `to ${to}, the host that answers directly.`
  );
}

async function ledgerFetch(
  apiKey: string,
  path: string,
): Promise<ProviderResult<unknown>> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: `Could not reach ${BASE_URL} — is it online?` };
  }
  const detoured = crossHostRedirect(`${BASE_URL}${path}`, response);
  if (detoured) return { ok: false, error: detoured };
  if (!response.ok) {
    let message = `Ledger answered ${response.status}.`;
    try {
      const body = (await response.json()) as { error?: { message?: string } };
      if (body?.error?.message) message = body.error.message;
      if (response.status === 401) message = "Ledger rejected the key (unauthorized).";
      if (response.status === 403)
        message = `The key lacks a scope: ${body?.error?.message ?? "forbidden"}.`;
    } catch {
      /* keep the status-based message */
    }
    return { ok: false, error: message };
  }
  return { ok: true, value: await response.json() };
}

/** Follow nextCursor until the walk ends. Bounded, so a bug cannot loop forever. */
async function walk(apiKey: string, path: string): Promise<ProviderResult<unknown[]>> {
  const items: unknown[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 50; page++) {
    const sep = path.includes("?") ? "&" : "?";
    const url = cursor
      ? `${path}${sep}cursor=${encodeURIComponent(cursor)}&limit=200`
      : `${path}${sep}limit=200`;
    const result = await ledgerFetch(apiKey, url);
    if (!result.ok) return result;
    const body = result.value as { items?: unknown[]; nextCursor?: string | null };
    items.push(...(body.items ?? []));
    cursor = body.nextCursor ?? null;
    if (!cursor) break;
  }
  return { ok: true, value: items };
}

export const apxledger: AccountingProvider = {
  id: "apxledger",
  label: "APX Ledger",
  connectHint:
    "You'll be sent to APX Ledger to choose a company and approve what Reach may read. Nothing is copied by hand, and you can revoke it from Ledger at any time.",

  oauth: {
    authorizeUrl: `${BASE_URL}/oauth/authorize`,
    tokenUrl: `${BASE_URL}/api/oauth/token`,
    revokeUrl: `${BASE_URL}/api/oauth/revoke`,
    /* Read-only, and only what the CRM screens actually display. */
    scopes: [
      "accounting.contacts.read",
      "accounting.invoices.read",
      "accounting.payments.read",
      "accounting.settings.read",
    ],
    clientIdEnv: "APXLEDGER_CLIENT_ID",
    clientSecretEnv: "APXLEDGER_CLIENT_SECRET",
  },

  async validate(credentials) {
    const result = await ledgerFetch(credentials, "/api/v1/connections");
    if (!result.ok) return result;
    const body = result.value as { connections?: unknown[] };
    const parsed = connectionSchema.safeParse(body.connections?.[0]);
    if (!parsed.success) {
      return { ok: false, error: "Ledger answered, but not in the shape this version expects." };
    }
    return {
      ok: true,
      value: {
        externalId: parsed.data.companyId,
        name: parsed.data.name,
        currency: parsed.data.baseCurrency,
        scopes: parsed.data.scopes,
      },
    };
  },

  async pull(credentials, externalCompanyId) {
    const contactsWalk = await walk(
      credentials,
      `/api/v1/companies/${externalCompanyId}/contacts`,
    );
    if (!contactsWalk.ok) return contactsWalk;

    const contacts: NormalizedContact[] = [];
    for (const raw of contactsWalk.value) {
      const parsed = contactSchema.safeParse(raw);
      if (!parsed.success) continue;
      contacts.push({
        externalId: parsed.data.id,
        name: parsed.data.name,
        email: parsed.data.email ?? null,
        phone: parsed.data.phone ?? null,
        isCustomer: parsed.data.isCustomer,
      });
    }

    const invoicesWalk = await walk(
      credentials,
      `/api/v1/companies/${externalCompanyId}/invoices?kind=receivable`,
    );
    if (!invoicesWalk.ok) return invoicesWalk;

    const invoices: NormalizedInvoice[] = [];
    for (const raw of invoicesWalk.value) {
      const parsed = invoiceSchema.safeParse(raw);
      if (!parsed.success) continue;
      const inv = parsed.data;
      if (inv.docType !== "invoice" || inv.status === "draft" || inv.status === "voided") continue;
      invoices.push({
        externalId: inv.id,
        number: inv.number,
        contactExternalId: inv.contactId,
        issueDate: inv.issueDate,
        dueDate: inv.dueDate,
        totalCents: inv.totalCents,
        outstandingCents: inv.amountDueCents,
        paid: inv.status === "paid",
      });
    }

    return { ok: true, value: { contacts, invoices } };
  },
};
