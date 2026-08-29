import { db, connections } from "@/db";
import { comingSoon, providers } from "@/lib/providers";
import { Card, Caps, LedgerDot, Pill } from "@/components/ui";
import { ConnectBooksForm, SyncNowButton } from "@/components/connect-books";

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
  const [connection] = await db.select().from(connections).limit(1);
  const connected = connection?.status === "connected" && connection.credentials;
  const demoOnly = connection?.status === "connected" && !connection.credentials;
  const available = Object.values(providers);

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-[-0.035em]">
          <span className="gradient-text-flow">Settings</span>
        </h1>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          Reach reads the books through whichever system keeps them. One
          connection per workspace for now.
        </p>
      </div>

      {connected ? (
        <Card className="px-[18px] py-4">
          <div className="flex items-center justify-between">
            <Caps>Connected books</Caps>
            <SyncNowButton />
          </div>
          <div className="mt-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <LedgerDot />
              <span>{connection.companyName}</span>
              <Pill kind="ledger">{connection.providerLabel}</Pill>
            </div>
            <p className="mt-1.5 text-xs text-[var(--text-tertiary)]">
              scopes: {connection.scopes ?? "—"}
              {connection.baseCurrency ? ` · ${connection.baseCurrency}` : ""}
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
        </Card>
      ) : null}

      {available.map((p) => (
        <Card key={p.id} className="px-[18px] py-4">
          <div className="flex items-center justify-between">
            <Caps>{connected && connection.provider === p.id ? `Replace the ${p.label} key` : p.label}</Caps>
            <Pill kind="ledger">Available</Pill>
          </div>
          {demoOnly && (
            <p className="mt-2 text-xs text-muted-foreground">
              The current connection is seeded demo data. Paste a real key to replace it —
              the next sync writes real figures over the demo rollups.
            </p>
          )}
          <p className="mt-2 text-sm text-muted-foreground">{p.connectHint}</p>
          <ConnectBooksForm provider={p.id} placeholder="apx_live_…" />
          {error && <p className="mt-2 text-xs font-medium text-[#b91c1c]">{error}</p>}
        </Card>
      ))}

      {comingSoon.map((p) => (
        <Card key={p.id} className="px-[18px] py-4">
          <div className="flex items-center justify-between">
            <Caps>{p.label}</Caps>
            <Pill kind="warning">Coming soon</Pill>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-[var(--text-tertiary)]">
            Same idea, different books: a {p.label} connection will validate a key, pull
            contacts and open invoices, and feed the same rollups every screen already
            reads. Implementing it is one provider file — nothing else changes.
          </p>
        </Card>
      ))}

      <Card className="px-[18px] py-4">
        <Caps>How the sync works</Caps>
        <p className="mt-2 text-xs leading-relaxed text-[var(--text-tertiary)]">
          Every provider hands Reach the same two shapes — contacts and invoices.
          Contacts become companies, open receivables are mirrored for the books
          panels, and each company&apos;s outstanding, overdue and year-to-date figures
          are rolled up. Polling for now; webhooks replace it when they land, and
          OAuth2 replaces the pasted key once each provider&apos;s consent screen ships.
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
