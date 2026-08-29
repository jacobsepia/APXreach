import { and, eq } from "drizzle-orm";
import { activities, companies, connections, db, syncedInvoices } from "@/db";
import { getProvider } from "@/lib/providers";

/*
 * The provider-agnostic sync engine. It never knows which system the books
 * live in: a provider validates a credential and hands back normalized
 * contacts and invoices; this file turns them into CRM companies, the invoice
 * mirror, and the rollups every screen reads. Scheduled runs and webhook
 * triggers call the same runSync.
 */

export async function connectBooks(
  workspaceId: string,
  providerId: string,
  credentials: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const provider = getProvider(providerId);
  if (!provider) return { ok: false, error: "That provider isn't available yet." };

  const result = await provider.validate(credentials);
  if (!result.ok) return result;

  const values = {
    workspaceId,
    provider: provider.id,
    providerLabel: provider.label,
    companyName: result.value.name,
    externalCompanyId: result.value.externalId,
    credentials,
    baseCurrency: result.value.currency,
    scopes: result.value.scopes.join(" "),
    status: "connected" as const,
    lastSyncError: null,
  };

  const [existing] = await db
    .select({ id: connections.id })
    .from(connections)
    .where(eq(connections.workspaceId, workspaceId));
  if (existing) {
    await db.update(connections).set(values).where(eq(connections.id, existing.id));
  } else {
    await db.insert(connections).values(values);
  }
  return { ok: true };
}

export async function runSync(workspaceId: string): Promise<void> {
  const [connection] = await db
    .select()
    .from(connections)
    .where(eq(connections.workspaceId, workspaceId));
  const provider = connection ? getProvider(connection.provider) : undefined;

  const fail = async (error: string) => {
    if (!connection) return;
    await db
      .update(connections)
      .set({ lastSyncError: error })
      .where(eq(connections.id, connection.id));
  };

  if (!connection?.credentials || !connection.externalCompanyId || !provider) {
    return fail("No credential on file — connect first.");
  }

  const pulled = await provider.pull(connection.credentials, connection.externalCompanyId);
  if (!pulled.ok) return fail(pulled.error);
  const { contacts, invoices } = pulled.value;

  // ── Contacts become (or update) companies, keyed by the provider's own id.
  let companiesCreated = 0;
  const companyIdByExternal = new Map<string, string>();
  for (const contact of contacts) {
    const [existing] = await db
      .select({ id: companies.id })
      .from(companies)
      .where(
        and(
          eq(companies.workspaceId, workspaceId),
          eq(companies.externalContactId, contact.externalId),
        ),
      );
    if (existing) {
      companyIdByExternal.set(contact.externalId, existing.id);
      continue;
    }
    // Match a CRM company created before the sync by exact name, else create.
    const [byName] = await db
      .select({ id: companies.id })
      .from(companies)
      .where(and(eq(companies.workspaceId, workspaceId), eq(companies.name, contact.name)));
    if (byName) {
      await db
        .update(companies)
        .set({ externalContactId: contact.externalId, updatedAt: new Date() })
        .where(eq(companies.id, byName.id));
      companyIdByExternal.set(contact.externalId, byName.id);
    } else {
      const [created] = await db
        .insert(companies)
        .values({
          workspaceId,
          name: contact.name,
          externalContactId: contact.externalId,
          lifecycleStage: contact.isCustomer ? "customer" : "lead",
          source: connection.providerLabel,
        })
        .returning({ id: companies.id });
      companyIdByExternal.set(contact.externalId, created.id);
      companiesCreated++;
    }
  }

  // ── Invoices: rebuild the mirror wholesale (it is a cache, not a record)
  //    and roll balances up onto companies.
  const today = new Date().toISOString().slice(0, 10);
  const yearStart = `${today.slice(0, 4)}-01-01`;
  type Rollup = { ar: number; overdue: number; revenueYtd: number };
  const rollups = new Map<string, Rollup>();
  let invoicesMirrored = 0;

  await db.delete(syncedInvoices).where(eq(syncedInvoices.workspaceId, workspaceId));

  for (const inv of invoices) {
    const companyId = companyIdByExternal.get(inv.contactExternalId);
    if (!companyId) continue;

    const rollup = rollups.get(companyId) ?? { ar: 0, overdue: 0, revenueYtd: 0 };
    if (inv.issueDate >= yearStart) rollup.revenueYtd += inv.totalCents;
    if (!inv.paid && inv.outstandingCents > 0) {
      const overdue = inv.dueDate < today;
      rollup.ar += inv.outstandingCents;
      if (overdue) rollup.overdue += inv.outstandingCents;
      await db.insert(syncedInvoices).values({
        workspaceId,
        companyId,
        number: inv.number,
        issuedDate: inv.issueDate,
        dueDate: inv.dueDate,
        totalCents: inv.totalCents,
        outstandingCents: inv.outstandingCents,
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

  const summary = `${contacts.length} contacts read (${companiesCreated} new companies), ${invoicesMirrored} open invoices mirrored.`;
  await db
    .update(connections)
    .set({ lastSyncAt: new Date(), lastSyncSummary: summary, lastSyncError: null })
    .where(eq(connections.id, connection.id));

  await db.insert(activities).values({
    workspaceId,
    type: "ledger_event",
    source: "ledger",
    subject: `${connection.providerLabel} sync completed`,
    body: summary,
  });
}
