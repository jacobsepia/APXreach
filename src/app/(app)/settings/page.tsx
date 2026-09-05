import Link from "next/link";
import { requireTenant } from "@/lib/workspace";
import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { db, connections, mailboxes } from "@/db";
import { auth } from "@/lib/auth";
import { disconnectMailbox } from "@/lib/actions";
import { configuredMailboxProviders } from "@/lib/mailbox/providers";
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
  searchParams: Promise<{ error?: string; connected?: string; mailbox?: string }>;
}) {
  const { error, connected: justConnected, mailbox: justLinkedMailbox } = await searchParams;
  const { workspaceId } = await requireTenant();
  const session = await auth.api.getSession({ headers: await headers() });
  const [connection] = await db.select().from(connections).where(eq(connections.workspaceId, workspaceId)).limit(1);
  /* A mailbox belongs to the person, so only theirs is shown or offered. */
  const myMailboxes = session
    ? await db
        .select()
        .from(mailboxes)
        .where(
          and(eq(mailboxes.userId, session.user.id), eq(mailboxes.workspaceId, workspaceId), eq(mailboxes.status, "connected")),
        )
    : [];
  const mailboxOptions = configuredMailboxProviders();
  const connectedProviderIds = new Set(myMailboxes.map((m) => m.provider));
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
      {justLinkedMailbox && !error && (
        <Card className="border-[color-mix(in_srgb,var(--accent-data)_45%,transparent)] px-[18px] py-3">
          <p className="text-[13px] text-foreground">
            Mailbox connected. Mail you send from a record will go out from your own
            address.
          </p>
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
            <p className="mt-1.5 text-xs text-muted-foreground">
              {connection.webhookSecret ? (
                <>
                  {connection.providerLabel} pushes changes as they happen
                  {connection.webhookLastPingAt
                    ? ` — last heard ${stamp.format(connection.webhookLastPingAt)}`
                    : " — nothing has moved since connecting"}
                </>
              ) : (
                <>Checked once a day. Reconnect to have {connection.providerLabel} push instead.</>
              )}
            </p>
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

      <Card className="px-[18px] py-4">
        <div className="flex items-center justify-between">
          <Caps>Your mailbox</Caps>
          {myMailboxes.length > 0 ? (
            <Pill kind="ledger">Connected</Pill>
          ) : (
            <Pill kind="customer">Not connected</Pill>
          )}
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Mail to a contact goes out from your own address, so the reply lands in the
          inbox you already watch and the thread reads normally to them. A mailbox is
          yours alone — a colleague connects their own and sends as themselves.
        </p>

        {myMailboxes.map((box) => (
          <div
            key={box.id}
            className="mt-3 flex items-center justify-between rounded-xl border border-border px-3.5 py-2.5"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <LedgerDot />
                <span className="truncate">{box.emailAddress}</span>
                <Pill kind="ledger">{box.providerLabel}</Pill>
              </div>
              {box.lastError && (
                <p className="mt-1 text-xs font-medium text-[#b91c1c]">{box.lastError}</p>
              )}
            </div>
            <form action={disconnectMailbox}>
              <input type="hidden" name="mailboxId" value={box.id} />
              <button
                type="submit"
                className="flex h-8 items-center rounded-[10px] border border-input bg-white px-3 text-[13px] font-medium text-muted-foreground hover:border-[var(--accent-hot)] hover:text-[#b91c1c]"
              >
                Disconnect
              </button>
            </form>
          </div>
        ))}

        {mailboxOptions.length === 0 ? (
          <p className="mt-3 text-xs leading-relaxed text-[var(--text-tertiary)]">
            No mail provider is registered on this deployment yet. Set a client id and
            secret for Zoho, Google or Microsoft and its button appears here.
          </p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {mailboxOptions
              .filter((p) => !connectedProviderIds.has(p.id))
              .map((p) => (
                <Link
                  key={p.id}
                  href={`/api/mailboxes/${p.id}/start`}
                  prefetch={false}
                  className="inline-flex h-9 items-center rounded-[10px] border border-input bg-white px-4 text-[13px] font-medium text-foreground hover:border-[#6b21a8]"
                >
                  Connect {p.label}
                </Link>
              ))}
          </div>
        )}
      </Card>

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
