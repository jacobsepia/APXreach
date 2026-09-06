import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, asc, eq, gte, isNull, lt, ne, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { AppSidebar } from "@/components/app-sidebar";
import { Topbar } from "@/components/topbar";
import { QuickCreate } from "@/components/quick-create";
import { Ticker, type TickerItem } from "@/components/ticker";
import { money } from "@/lib/format";
import {
  activities,
  companies,
  db,
  deals,
  connections,
  syncedInvoices,
  pipelines,
  pipelineStages,
} from "@/db";
import { requireTenant } from "@/lib/workspace";

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
  /* The proxy checked for a cookie; this is the real check — and it resolves
     which tenant the whole subtree renders for. */
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  const tenant = await requireTenant();
  const workspace = { id: tenant.workspaceId, name: tenant.workspaceName };

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86_400_000);

  const [
    connection,
    companyOptions,
    stageOptions,
    openRow,
    wonRow,
    arRow,
    overdueRow,
    taskRow,
    quietRow,
  ] = await Promise.all([
    db
      .select()
      .from(connections)
      .where(eq(connections.workspaceId, workspace.id))
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
      .innerJoin(pipelines, eq(pipelines.id, pipelineStages.pipelineId))
      .where(and(ne(pipelineStages.kind, "lost"), eq(pipelines.workspaceId, workspace.id)))
      .orderBy(asc(pipelineStages.displayOrder)),
    db
      .select({ total: sql<number>`coalesce(sum(${deals.amountCents}), 0)`, count: sql<number>`count(*)` })
      .from(deals)
      .where(and(eq(deals.status, "open"), eq(deals.workspaceId, workspace.id)))
      .then((r) => r[0]),
    db
      .select({ total: sql<number>`coalesce(sum(${deals.amountCents}), 0)` })
      .from(deals)
      .where(and(eq(deals.status, "won"), gte(deals.wonAt, monthStart), eq(deals.workspaceId, workspace.id)))
      .then((r) => r[0]),
    db
      .select({ total: sql<number>`coalesce(sum(${syncedInvoices.outstandingCents}), 0)` })
      .from(syncedInvoices)
      .where(and(ne(syncedInvoices.status, "paid"), eq(syncedInvoices.workspaceId, workspace.id)))
      .then((r) => r[0]),
    db
      .select({ total: sql<number>`coalesce(sum(${syncedInvoices.outstandingCents}), 0)`, count: sql<number>`count(*)` })
      .from(syncedInvoices)
      .where(and(eq(syncedInvoices.status, "overdue"), eq(syncedInvoices.workspaceId, workspace.id)))
      .then((r) => r[0]),
    db
      .select({ count: sql<number>`count(*)` })
      .from(activities)
      .where(and(eq(activities.type, "task"), isNull(activities.completedAt), eq(activities.workspaceId, workspace.id)))
      .then((r) => r[0]),
    db
      .select({ count: sql<number>`count(*)` })
      .from(deals)
      .where(and(eq(deals.status, "open"), lt(deals.updatedAt, fourteenDaysAgo), eq(deals.workspaceId, workspace.id)))
      .then((r) => r[0]),
  ]);

  const connected = connection?.status === "connected";
  const booksLabel = connected ? connection.providerLabel : "the books";
  const overdueCount = Number(overdueRow?.count ?? 0);
  const quietCount = Number(quietRow?.count ?? 0);

  /*
   * The ticker carries only things that are true and worth acting on. Overdue
   * money leads — nothing else on screen matters while a customer sits unpaid.
   */
  const ticker: TickerItem[] = [
    ...(overdueCount > 0
      ? [
          {
            label: `Overdue in ${booksLabel}`,
            value: `${money(Number(overdueRow?.total ?? 0))} · ${overdueCount}`,
            href: "/companies",
            tone: "alert" as const,
            ledger: true,
          },
        ]
      : []),
    {
      label: "Open pipeline",
      value: `${money(Number(openRow?.total ?? 0))} · ${Number(openRow?.count ?? 0)}`,
      href: "/deals",
    },
    {
      label: "Won this month",
      value: money(Number(wonRow?.total ?? 0)),
      href: "/deals",
      tone: "ok",
    },
    {
      label: "Receivables",
      value: money(Number(arRow?.total ?? 0)),
      href: "/companies",
      ledger: true,
    },
    {
      label: "Open tasks",
      value: String(Number(taskRow?.count ?? 0)),
      href: "/tasks",
      tone: Number(taskRow?.count ?? 0) > 0 ? "warn" : "ok",
    },
    ...(quietCount > 0
      ? [
          {
            label: "Deals gone quiet",
            value: String(quietCount),
            href: "/deals",
            tone: "warn" as const,
          },
        ]
      : []),
    { label: "Companies", value: String(companyOptions.length), href: "/companies" },
  ];

  return (
    <div className="flex min-h-screen w-full">
      <AppSidebar
        connectionLabel={connected ? `${connection.providerLabel} connected` : null}
        syncedLabel={connected ? syncedLabel(connection?.lastSyncAt ?? null) : null}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Ticker items={ticker} />
        <Topbar
          workspaceName={workspace.name}
          userName={session.user.name}
          quickCreate={<QuickCreate companies={companyOptions} stages={stageOptions} />}
        />
        <main className="flex-1 px-8 py-7">{children}</main>
      </div>
    </div>
  );
}
