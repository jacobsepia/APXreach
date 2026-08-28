import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { activities, companies, db, ledgerConnections, ledgerInvoices } from "@/db";

/*
 * The APX Ledger sync — consumer #2 of the platform API, after Collect.
 *
 * Phase 1 of the platform plan: a company-scoped API key and the read-only
 * `/api/v1` walks. Every list endpoint returns { items, nextCursor } and takes
 * ?updatedSince for incremental runs; money is integer cents; day-dates are
 * YYYY-MM-DD. Shapes below mirror Ledger's serialize.ts exactly. OAuth2 and
 * webhooks replace this polling when Ledger's next platform phases land.
 */

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
  contactPerson: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  isCustomer: z.boolean(),
  isSupplier: z.boolean(),
  updatedAt: z.string(),
});

const invoiceSchema = z.object({
  id: z.string(),
  kind: z.enum(["receivable", "payable"]),
  docType: z.enum(["invoice", "credit_note"]),
  number: z.string(),
  contactId: z.string(),
  contactName: z.string(),
  status: z.enum(["draft", "awaiting_approval", "awaiting_payment", "paid", "voided"]),
  issueDate: z.string(),
  dueDate: z.string(),
  totalCents: z.number().int(),
  settledCents: z.number().int(),
  amountDueCents: z.number().int(),
});

type LedgerError = { ok: false; error: string };

async function ledgerFetch(
  baseUrl: string,
  apiKey: string,
  path: string,
): Promise<{ ok: true; data: unknown } | LedgerError> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: `Could not reach ${baseUrl} — is it online?` };
  }
  if (!response.ok) {
    let message = `Ledger answered ${response.status}.`;
    try {
      const body = (await response.json()) as { error?: { code?: string; message?: string } };
      if (body?.error?.message) message = body.error.message;
      if (response.status === 401) message = "Ledger rejected the key (unauthorized).";
      if (response.status === 403) message = `The key lacks a scope: ${body?.error?.message ?? "forbidden"}.`;
    } catch {
      /* keep the status-based message */
    }
    return { ok: false, error: message };
  }
  return { ok: true, data: await response.json() };
}

/** Follow nextCursor until the walk ends. Bounded, so a bug cannot loop forever. */
async function walk(
  baseUrl: string,
  apiKey: string,
  path: string,
): Promise<{ ok: true; items: unknown[] } | LedgerError> {
  const items: unknown[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 50; page++) {
    const sep = path.includes("?") ? "&" : "?";
    const url = cursor ? `${path}${sep}cursor=${encodeURIComponent(cursor)}&limit=200` : `${path}${sep}limit=200`;
    const result = await ledgerFetch(baseUrl, apiKey, url);
    if (!result.ok) return result;
    const body = result.data as { items?: unknown[]; nextCursor?: string | null };
    items.push(...(body.items ?? []));
    cursor = body.nextCursor ?? null;
    if (!cursor) break;
  }
  return { ok: true, items };
}

const DEFAULT_BASE_URL = "https://apxledger.ca";

export async function connectToLedger(
  workspaceId: string,
  apiKey: string,
): Promise<{ ok: true } | LedgerError> {
  const baseUrl = DEFAULT_BASE_URL;
  const result = await ledgerFetch(baseUrl, apiKey, "/api/v1/connections");
  if (!result.ok) return result;

  const body = result.data as { connections?: unknown[] };
  const parsed = connectionSchema.safeParse(body.connections?.[0]);
  if (!parsed.success) {
    return { ok: false, error: "Ledger answered, but not in the shape this version expects." };
  }
  const connection = parsed.data;

  const values = {
    workspaceId,
    ledgerCompanyName: connection.name,
    ledgerCompanyId: connection.companyId,
    baseUrl,
    baseCurrency: connection.baseCurrency,
    scopes: connection.scopes.join(" "),
    apiKey,
    status: "connected" as const,
    lastSyncError: null,
  };
  const [existing] = await db
    .select({ id: ledgerConnections.id })
    .from(ledgerConnections)
    .where(eq(ledgerConnections.workspaceId, workspaceId));
  if (existing) {
    await db.update(ledgerConnections).set(values).where(eq(ledgerConnections.id, existing.id));
  } else {
    await db.insert(ledgerConnections).values(values);
  }
  return { ok: true };
}

export async function runLedgerSync(workspaceId: string): Promise<void> {
  const [connection] = await db
    .select()
    .from(ledgerConnections)
    .where(eq(ledgerConnections.workspaceId, workspaceId));
  if (!connection?.apiKey || !connection.ledgerCompanyId) {
    await db
      .update(ledgerConnections)
      .set({ lastSyncError: "No API key on file — connect first." })
      .where(eq(ledgerConnections.workspaceId, workspaceId));
    return;
  }
  const { apiKey, baseUrl, ledgerCompanyId } = connection;
  const fail = async (error: string) => {
    await db
      .update(ledgerConnections)
      .set({ lastSyncError: error })
      .where(eq(ledgerConnections.id, connection.id));
  };

  // ── Contacts: every Ledger customer/supplier becomes (or updates) a company.
  const contactsWalk = await walk(
    baseUrl,
    apiKey,
    `/api/v1/companies/${ledgerCompanyId}/contacts`,
  );
  if (!contactsWalk.ok) return fail(contactsWalk.error);

  let companiesUpserted = 0;
  const companyIdByLedgerContact = new Map<string, string>();
  for (const raw of contactsWalk.items) {
    const parsed = contactSchema.safeParse(raw);
    if (!parsed.success) continue;
    const c = parsed.data;
    const [existing] = await db
      .select({ id: companies.id })
      .from(companies)
      .where(and(eq(companies.workspaceId, workspaceId), eq(companies.ledgerContactId, c.id)));
    if (existing) {
      companyIdByLedgerContact.set(c.id, existing.id);
      continue;
    }
    // Match a CRM company created before the sync by exact name, else create.
    const [byName] = await db
      .select({ id: companies.id })
      .from(companies)
      .where(and(eq(companies.workspaceId, workspaceId), eq(companies.name, c.name)));
    if (byName) {
      await db
        .update(companies)
        .set({ ledgerContactId: c.id, updatedAt: new Date() })
        .where(eq(companies.id, byName.id));
      companyIdByLedgerContact.set(c.id, byName.id);
    } else {
      const [created] = await db
        .insert(companies)
        .values({
          workspaceId,
          name: c.name,
          ledgerContactId: c.id,
          lifecycleStage: c.isCustomer ? "customer" : "lead",
          source: "APX Ledger",
        })
        .returning({ id: companies.id });
      companyIdByLedgerContact.set(c.id, created.id);
      companiesUpserted++;
    }
  }

  // ── Invoices: mirror open receivables, roll balances up onto companies.
  const invoicesWalk = await walk(
    baseUrl,
    apiKey,
    `/api/v1/companies/${ledgerCompanyId}/invoices?kind=receivable`,
  );
  if (!invoicesWalk.ok) return fail(invoicesWalk.error);

  const today = new Date().toISOString().slice(0, 10);
  const yearStart = `${today.slice(0, 4)}-01-01`;
  type Rollup = { ar: number; overdue: number; revenueYtd: number };
  const rollups = new Map<string, Rollup>();
  let invoicesMirrored = 0;

  // Rebuild the mirror wholesale — it is a cache of Ledger, not a record.
  await db.delete(ledgerInvoices).where(eq(ledgerInvoices.workspaceId, workspaceId));

  for (const raw of invoicesWalk.items) {
    const parsed = invoiceSchema.safeParse(raw);
    if (!parsed.success) continue;
    const inv = parsed.data;
    if (inv.docType !== "invoice" || inv.status === "draft" || inv.status === "voided") continue;

    const companyId = companyIdByLedgerContact.get(inv.contactId);
    if (!companyId) continue;

    const rollup = rollups.get(companyId) ?? { ar: 0, overdue: 0, revenueYtd: 0 };
    if (inv.issueDate >= yearStart) rollup.revenueYtd += inv.totalCents;
    if (inv.amountDueCents > 0 && inv.status === "awaiting_payment") {
      const overdue = inv.dueDate < today;
      rollup.ar += inv.amountDueCents;
      if (overdue) rollup.overdue += inv.amountDueCents;
      await db.insert(ledgerInvoices).values({
        workspaceId,
        companyId,
        number: inv.number,
        issuedDate: inv.issueDate,
        dueDate: inv.dueDate,
        totalCents: inv.totalCents,
        outstandingCents: inv.amountDueCents,
        status: overdue ? "overdue" : "open",
      });
      invoicesMirrored++;
    }
    rollups.set(companyId, rollup);
  }

  for (const [companyId, rollup] of rollups) {
    await db
      .update(companies)
      .set({
        arBalanceCents: rollup.ar,
        overdueCents: rollup.overdue,
        revenueYtdCents: rollup.revenueYtd,
        updatedAt: new Date(),
      })
      .where(eq(companies.id, companyId));
  }

  const summary = `${contactsWalk.items.length} contacts read (${companiesUpserted} new companies), ${invoicesMirrored} open invoices mirrored.`;
  await db
    .update(ledgerConnections)
    .set({ lastSyncAt: new Date(), lastSyncSummary: summary, lastSyncError: null })
    .where(eq(ledgerConnections.id, connection.id));

  await db.insert(activities).values({
    workspaceId,
    type: "ledger_event",
    source: "ledger",
    subject: "Ledger sync completed",
    body: summary,
  });
}
