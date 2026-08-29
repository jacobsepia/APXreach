import { and, eq } from "drizzle-orm";
import { activities, companies, connections, db, syncedInvoices, workspaces } from "@/db";
import { getProvider, type AccountingProvider, type OAuthTokens } from "@/lib/providers";
import { clientCredentials, refreshTokens } from "@/lib/oauth";

/*
 * The provider-agnostic sync engine. It never knows which system the books
 * live in: a provider hands back normalized contacts and invoices, and this
 * file turns them into CRM companies, the invoice mirror, and the rollups
 * every screen reads. Scheduled runs and webhook triggers call the same
 * runSync.
 */

type Outcome = { ok: true } | { ok: false; error: string };

/**
 * Store the grant the consent screen just produced. The provider itself tells
 * us which company was consented to — Reach never asks the person to identify
 * it, because the token already knows.
 */
export async function saveConnection(
  provider: AccountingProvider,
  tokens: OAuthTokens,
): Promise<Outcome> {
  const [workspace] = await db.select({ id: workspaces.id }).from(workspaces).limit(1);
  if (!workspace) return { ok: false, error: "No workspace yet." };

  const identified = await provider.validate(tokens.accessToken);
  if (!identified.ok) return identified;

  const values = {
    workspaceId: workspace.id,
    provider: provider.id,
    providerLabel: provider.label,
    companyName: identified.value.name,
    externalCompanyId: identified.value.externalId,
    credentials: null,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    tokenExpiresAt: tokens.expiresAt,
    baseCurrency: identified.value.currency,
    scopes: (tokens.scopes.length ? tokens.scopes : identified.value.scopes).join(" "),
    status: "connected" as const,
    lastSyncError: null,
  };

  const [existing] = await db
    .select({ id: connections.id })
    .from(connections)
    .where(eq(connections.workspaceId, workspace.id));
  if (existing) {
    await db.update(connections).set(values).where(eq(connections.id, existing.id));
  } else {
    await db.insert(connections).values(values);
  }

  /* First sync immediately: the point of connecting is to see your books. */
  await runSync(workspace.id);
  return { ok: true };
}

type ConnectionRow = typeof connections.$inferSelect;

/**
 * The credential to call the provider with, refreshed if it is about to
 * expire. Ledger rotates refresh tokens and treats a reused one as theft, so
 * the new pair is persisted before anything is done with it, and a refusal
 * clears the tokens rather than leaving a poisoned pair to be retried.
 */
async function credentialFor(
  provider: AccountingProvider,
  connection: ConnectionRow,
): Promise<{ ok: true; credential: string } | { ok: false; error: string }> {
  if (!provider.oauth) {
    return connection.credentials
      ? { ok: true, credential: connection.credentials }
      : { ok: false, error: "No credential on file — connect first." };
  }

  const expiresSoon =
    connection.tokenExpiresAt !== null &&
    connection.tokenExpiresAt.getTime() - Date.now() < 60_000;

  if (connection.accessToken && !expiresSoon) {
    return { ok: true, credential: connection.accessToken };
  }
  if (!connection.refreshToken) {
    return { ok: false, error: "The connection expired — reconnect to continue." };
  }

  const credentials = clientCredentials(provider);
  if (!credentials.ok) return credentials;

  const refreshed = await refreshTokens({
    provider,
    credentials: credentials.value,
    refreshToken: connection.refreshToken,
  });
  if (!refreshed.ok) {
    await db
      .update(connections)
      .set({
        accessToken: null,
        refreshToken: null,
        tokenExpiresAt: null,
        status: "disconnected",
        lastSyncError: refreshed.error,
      })
      .where(eq(connections.id, connection.id));
    return { ok: false, error: `${provider.label} ended the connection: ${refreshed.error}` };
  }

  await db
    .update(connections)
    .set({
      accessToken: refreshed.value.accessToken,
      refreshToken: refreshed.value.refreshToken ?? connection.refreshToken,
      tokenExpiresAt: refreshed.value.expiresAt,
      status: "connected",
    })
    .where(eq(connections.id, connection.id));
  return { ok: true, credential: refreshed.value.accessToken };
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

  if (!connection || !provider || !connection.externalCompanyId) {
    return fail("No connection on file — connect your books first.");
  }

  const credential = await credentialFor(provider, connection);
  if (!credential.ok) return fail(credential.error);

  const pulled = await provider.pull(credential.credential, connection.externalCompanyId);
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
