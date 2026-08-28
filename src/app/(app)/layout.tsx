import { AppSidebar } from "@/components/app-sidebar";
import { Topbar } from "@/components/topbar";
import { db, ledgerConnections, workspaces } from "@/db";

export const dynamic = "force-dynamic";

function syncedLabel(at: Date | null): string | null {
  if (!at) return null;
  const time = new Intl.DateTimeFormat("en-CA", {
    hour: "numeric",
    minute: "2-digit",
  }).format(at);
  const sameDay = new Date().toDateString() === at.toDateString();
  return sameDay ? `Synced ${time} this morning` : `Synced ${time}`;
}

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [workspace] = await db.select().from(workspaces).limit(1);
  const [connection] = workspace
    ? await db.select().from(ledgerConnections).limit(1)
    : [undefined];

  return (
    <div className="flex min-h-screen w-full">
      <AppSidebar
        connectionLabel={connection ? "APX Ledger connected" : null}
        syncedLabel={connection ? syncedLabel(connection.lastSyncAt) : null}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar workspaceName={workspace?.name ?? "APX Reach"} />
        <main className="flex-1 px-8 py-7">{children}</main>
      </div>
    </div>
  );
}
