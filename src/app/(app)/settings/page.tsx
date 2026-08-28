import { db, ledgerConnections } from "@/db";
import { Card, Caps, LedgerDot, Pill } from "@/components/ui";
import { ConnectLedgerForm, SyncNowButton } from "@/components/ledger-connect";

export const dynamic = "force-dynamic";

export const metadata = { title: "Settings" };

const stamp = new Intl.DateTimeFormat("en-CA", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const [connection] = await db.select().from(ledgerConnections).limit(1);
  const connected = connection?.status === "connected" && connection.apiKey;
  const demoOnly = connection?.status === "connected" && !connection.apiKey;

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <h1 className="font-display text-2xl font-bold tracking-[-0.6px] text-foreground">
        Settings
      </h1>

      <Card className="px-[18px] py-4">
        <div className="flex items-center justify-between">
          <Caps>APX Ledger connection</Caps>
          {connected && <SyncNowButton />}
        </div>

        {connected ? (
          <div className="mt-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <LedgerDot />
              <span>{connection.ledgerCompanyName}</span>
              <Pill kind="ledger">Connected</Pill>
            </div>
            <p className="mt-1.5 text-xs text-[var(--text-tertiary)]">
              {connection.baseUrl} · scopes: {connection.scopes ?? "—"}
            </p>
            {connection.lastSyncAt && (
              <p className="mt-1.5 text-xs text-muted-foreground">
                Last sync {stamp.format(connection.lastSyncAt)}
                {connection.lastSyncSummary ? ` — ${connection.lastSyncSummary}` : ""}
              </p>
            )}
            {connection.lastSyncError && (
              <p className="mt-1.5 text-xs font-medium text-[#b91c1c]">
                Last sync failed: {connection.lastSyncError}
              </p>
            )}
          </div>
        ) : (
          <div className="mt-2">
            {demoOnly && (
              <p className="mb-2 text-xs text-muted-foreground">
                The current connection is seeded demo data. Paste a real key to replace it —
                the next sync writes real figures over the demo rollups.
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              In APX Ledger: Settings → API access → mint a company-scoped key with the
              contacts, invoices and payments read scopes. Paste it here.
            </p>
            <ConnectLedgerForm />
            {error && (
              <p className="mt-2 text-xs font-medium text-[#b91c1c]">{error}</p>
            )}
          </div>
        )}
      </Card>

      {connected && (
        <Card className="px-[18px] py-4">
          <Caps>Replace the key</Caps>
          <p className="mt-2 text-xs text-[var(--text-tertiary)]">
            Pasting a new key re-validates against Ledger and replaces the stored one.
          </p>
          <ConnectLedgerForm />
          {error && <p className="mt-2 text-xs font-medium text-[#b91c1c]">{error}</p>}
        </Card>
      )}

      <Card className="px-[18px] py-4">
        <Caps>How the sync works</Caps>
        <p className="mt-2 text-xs leading-relaxed text-[var(--text-tertiary)]">
          Reach walks Ledger&apos;s v1 API: contacts become companies, open receivables are
          mirrored for the books panels, and each company&apos;s outstanding, overdue and
          year-to-date figures are rolled up. Polling for now; Ledger&apos;s webhooks replace
          it when they land, and OAuth2 replaces the pasted key once the consent screen
          ships.
        </p>
      </Card>

      <Card className="px-[18px] py-4">
        <Caps>Sign in with APX</Caps>
        <p className="mt-2 text-xs leading-relaxed text-[var(--text-tertiary)]">
          One identity across Ledger, Collect and Reach — Better Auth against Ledger&apos;s
          OIDC provider. Next on the roadmap, before real data goes in this database.
        </p>
      </Card>
    </div>
  );
}
