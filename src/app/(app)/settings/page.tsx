import Link from "next/link";
import { eq } from "drizzle-orm";
import { db, connections } from "@/db";
import { requireTenant } from "@/lib/workspace";
import { comingSoon, providers } from "@/lib/providers";
import { Card, Caps, LedgerDot, Pill } from "@/components/ui";
import { DisconnectButton, SyncNowButton } from "@/components/connect-books";

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
  searchParams: Promise<{ error?: string; connected?: string }>;
}) {
  const { error, connected: justConnected } = await searchParams;
  const { workspaceId } = await requireTenant();
  const [connection] = await db
    .select()
    .from(connections)
    .where(eq(connections.workspaceId, workspaceId))
    .limit(1);
  const live = connection?.status === "connected" && Boolean(connection.accessToken);
  const demoOnly = connection?.status === "connected" && !connection.accessToken;
  const available = Object.values(providers);

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-[-0.035em]">
          <span className="gradient-text-flow">Settings</span>
        </h1>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          Reach reads the books through whichever system keeps them. You approve
          the connection on their side — nothing is copied by hand.
        </p>
      </div>

      {error && (
        <Card className="border-[color-mix(in_srgb,var(--accent-hot)_35%,transparent)] px-[18px] py-3">
          <p className="text-[13px] font-medium text-[#b91c1c]">{error}</p>
        </Card>
      )}
      {justConnected && !error && (
        <Card className="border-[color-mix(in_srgb,var(--accent-data)_45%,transparent)] px-[18px] py-3">
          <p className="text-[13px] text-foreground">
            Connected. The first sync has already run — your books are on the
            dashboard.
          </p>
        </Card>
      )}

      {live && connection && (
        <Card className="px-[18px] py-4">
          <div className="flex items-center justify-between">
            <Caps>Connected books</Caps>
            <div className="flex items-center gap-2">
              <SyncNowButton />
              <DisconnectButton label={connection.providerLabel} />
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <LedgerDot />
              <span>{connection.companyName}</span>
              <Pill kind="ledger">{connection.providerLabel}</Pill>
            </div>
            <p className="mt-1.5 text-xs text-[var(--text-tertiary)]">
              Authorized scopes: {connection.scopes ?? "—"}
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
      )}

      {available.map((p) => {
        const isLive = live && connection?.provider === p.id;
        return (
          <Card key={p.id} className="px-[18px] py-4">
            <div className="flex items-center justify-between">
              <Caps>{p.label}</Caps>
              {isLive ? (
                <Pill kind="ledger">Connected</Pill>
              ) : (
                <Pill kind="customer">Available</Pill>
              )}
            </div>
            {demoOnly && !isLive && (
              <p className="mt-2 text-xs text-muted-foreground">
                What you&apos;re seeing now is seeded demo data. Connecting replaces it
                with the real figures on the next sync.
              </p>
            )}
            <p className="mt-2 text-sm text-muted-foreground">{p.connectHint}</p>
            <Link
              href={`/api/integrations/${p.id}/start`}
              prefetch={false}
              className="mt-3 inline-flex h-9 items-center rounded-[10px] bg-[image:var(--gradient-cta)] px-4 text-[13px] font-medium text-white"
            >
              {isLive ? `Reconnect ${p.label}` : `Connect ${p.label}`}
            </Link>
          </Card>
        );
      })}

      {comingSoon.map((p) => (
        <Card key={p.id} className="px-[18px] py-4">
          <div className="flex items-center justify-between">
            <Caps>{p.label}</Caps>
            <Pill kind="warning">Coming soon</Pill>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-[var(--text-tertiary)]">
            Same ceremony, different books: {p.label} authorizes the same way and
            answers with the same normalized contacts and invoices, so the screens
            you already use light up unchanged. It needs one provider file and a
            registered client.
          </p>
        </Card>
      ))}

      <Card className="px-[18px] py-4">
        <Caps>How the connection works</Caps>
        <p className="mt-2 text-xs leading-relaxed text-[var(--text-tertiary)]">
          OAuth2 authorization-code with PKCE, against the provider&apos;s own consent
          screen — the same door APX Collect and APX Planner use. You choose the
          company and approve the scopes there; Reach receives an access token it
          refreshes on its own and never shows anyone. Disconnecting revokes the
          grant at the provider, and you can revoke it from their side at any time.
          Polling for now; webhooks replace it when they land.
        </p>
      </Card>

      <Card className="px-[18px] py-4">
        <Caps>Sign in with APX</Caps>
        <p className="mt-2 text-xs leading-relaxed text-[var(--text-tertiary)]">
          Ledger already issues id_tokens for the `openid` scope, so one identity
          across Ledger, Collect, Planner and Reach is a Better Auth provider row
          on top of the same client — next, now that the data connection speaks
          OAuth.
        </p>
      </Card>
    </div>
  );
}
