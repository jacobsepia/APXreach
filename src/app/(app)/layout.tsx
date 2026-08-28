import { asc, eq, ne } from "drizzle-orm";
import { AppSidebar } from "@/components/app-sidebar";
import { Topbar } from "@/components/topbar";
import { QuickCreate } from "@/components/quick-create";
import { companies, db, ledgerConnections, pipelineStages, workspaces } from "@/db";

export const dynamic = "force-dynamic";

function syncedLabel(at: Date | null): string | null {
  if (!at) return null;
  const time = new Intl.DateTimeFormat("en-CA", {
    hour: "numeric",
    minute: "2-digit",
  }).format(at);
  const sameDay = new Date().toDateString() === at.toDateString();
  return sameDay ? `Synced ${time} today` : `Synced ${time}`;
}

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [workspace] = await db.select().from(workspaces).limit(1);
  const [connection, companyOptions, stageOptions] = workspace
    ? await Promise.all([
        db
          .select()
          .from(ledgerConnections)
          .where(eq(ledgerConnections.workspaceId, workspace.id))
          .limit(1)
          .then((rows) => rows[0]),
        db
          .select({ id: companies.id, name: companies.name })
          .from(companies)
          .where(eq(companies.workspaceId, workspace.id))
          .orderBy(asc(companies.name)),
        db
          .select({ id: pipelineStages.id, name: pipelineStages.name })
          .from(pipelineStages)
          .where(ne(pipelineStages.kind, "lost"))
          .orderBy(asc(pipelineStages.displayOrder)),
      ])
    : [undefined, [], []];

  const connected = connection?.status === "connected";

  return (
    <div className="flex min-h-screen w-full">
      <AppSidebar
        connectionLabel={connected ? "APX Ledger connected" : null}
        syncedLabel={connected ? syncedLabel(connection?.lastSyncAt ?? null) : null}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          workspaceName={workspace?.name ?? "APX Reach"}
          quickCreate={<QuickCreate companies={companyOptions} stages={stageOptions} />}
        />
        <main className="flex-1 px-8 py-7">{children}</main>
      </div>
    </div>
  );
}
