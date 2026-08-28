import { db, ledgerConnections } from "@/db";
import { Card, Caps, LedgerDot } from "@/components/ui";

export const dynamic = "force-dynamic";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const [connection] = await db.select().from(ledgerConnections).limit(1);

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <h1 className="font-display text-2xl font-bold tracking-[-0.6px] text-foreground">
        Settings
      </h1>
      <Card className="px-[18px] py-4">
        <Caps>APX Ledger connection</Caps>
        {connection ? (
          <div className="mt-2.5 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <LedgerDot />
                <span>{connection.ledgerCompanyName}</span>
              </div>
              <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                Demo connection — the live sync arrives with the Ledger API key flow, then
                OAuth2 when the consent screen ships. Contacts, invoices and payments walk in
                incrementally; webhooks replace polling when Ledger's land.
              </p>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            Not connected. Paste a company-scoped API key from Ledger&apos;s Settings → API
            access.
          </p>
        )}
      </Card>
      <Card className="px-[18px] py-4">
        <Caps>Sign in with APX</Caps>
        <p className="mt-2 text-xs leading-relaxed text-[var(--text-tertiary)]">
          One identity across Ledger, Collect and Reach — Better Auth against Ledger&apos;s
          OIDC provider. Lands in Phase 0 auth work, before anything real goes in this
          database.
        </p>
      </Card>
    </div>
  );
}
