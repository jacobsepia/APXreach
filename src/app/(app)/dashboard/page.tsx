import Link from "next/link";
import { and, asc, desc, eq, gte, isNull, lt, ne, sql } from "drizzle-orm";
import {
  activities,
  companies,
  db,
  deals,
  syncedInvoices,
  pipelineStages,
} from "@/db";
import { money, relativeDay } from "@/lib/format";
import { requireTenant } from "@/lib/workspace";
import { Card, Caps, LedgerDot } from "@/components/ui";
import { TaskCheckbox } from "@/components/task-checkbox";

export const dynamic = "force-dynamic";

const timeFmt = new Intl.DateTimeFormat("en-CA", { hour: "numeric", minute: "2-digit" });

export default async function DashboardPage() {
  const { workspaceId } = await requireTenant();
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86_400_000);

  const [openByStage, wonRow, arRow, overdueRow, tasks, riskCompanies, quietDeals, goodNews] =
    await Promise.all([
      db
        .select({
          stage: pipelineStages.name,
          order: pipelineStages.displayOrder,
          total: sql<number>`coalesce(sum(${deals.amountCents}), 0)`,
          count: sql<number>`count(*)`,
        })
        .from(deals)
        .innerJoin(pipelineStages, eq(deals.stageId, pipelineStages.id))
        .where(and(eq(deals.status, "open"), eq(deals.workspaceId, workspaceId)))
        .groupBy(pipelineStages.name, pipelineStages.displayOrder)
        .orderBy(asc(pipelineStages.displayOrder)),
      db
        .select({
          total: sql<number>`coalesce(sum(${deals.amountCents}), 0)`,
          count: sql<number>`count(*)`,
        })
        .from(deals)
        .where(and(eq(deals.status, "won"), gte(deals.wonAt, monthStart), eq(deals.workspaceId, workspaceId))),
      db
        .select({ total: sql<number>`coalesce(sum(${syncedInvoices.outstandingCents}), 0)` })
        .from(syncedInvoices)
        .where(and(ne(syncedInvoices.status, "paid"), eq(syncedInvoices.workspaceId, workspaceId))),
      db
        .select({
          total: sql<number>`coalesce(sum(${syncedInvoices.outstandingCents}), 0)`,
          count: sql<number>`count(*)`,
        })
        .from(syncedInvoices)
        .where(and(eq(syncedInvoices.status, "overdue"), eq(syncedInvoices.workspaceId, workspaceId))),
      db
        .select({
          id: activities.id,
          subject: activities.subject,
          dueAt: activities.dueAt,
        })
        .from(activities)
        .where(and(eq(activities.type, "task"), isNull(activities.completedAt), eq(activities.workspaceId, workspaceId)))
        .orderBy(asc(activities.dueAt))
        .limit(5),
      db
        .select({
          id: companies.id,
          name: companies.name,
          overdueCents: companies.overdueCents,
          openDealTotal: sql<number>`coalesce(sum(${deals.amountCents}), 0)`,
        })
        .from(companies)
        .innerJoin(deals, and(eq(deals.companyId, companies.id), eq(deals.status, "open")))
        .where(and(sql`${companies.overdueCents} > 0`, eq(companies.workspaceId, workspaceId)))
        .groupBy(companies.id, companies.name, companies.overdueCents)
        .orderBy(desc(companies.overdueCents))
        .limit(2),
      db
        .select({
          id: deals.id,
          name: deals.name,
          companyName: companies.name,
          updatedAt: deals.updatedAt,
        })
        .from(deals)
        .leftJoin(companies, eq(deals.companyId, companies.id))
        .where(and(eq(deals.status, "open"), lt(deals.updatedAt, fourteenDaysAgo), eq(deals.workspaceId, workspaceId)))
        .orderBy(asc(deals.updatedAt))
        .limit(2),
      db
        .select({
          subject: activities.subject,
          body: activities.body,
          companyId: activities.companyId,
        })
        .from(activities)
        .where(and(eq(activities.type, "ledger_event"), sql`${activities.subject} ilike '%paid%'`, eq(activities.workspaceId, workspaceId)))
        .orderBy(desc(activities.occurredAt))
        .limit(1),
    ]);

  const openTotal = openByStage.reduce((sum, s) => sum + Number(s.total), 0);
  const openCount = openByStage.reduce((sum, s) => sum + Number(s.count), 0);
  const maxStage = Math.max(1, ...openByStage.map((s) => Number(s.total)));
  const won = wonRow[0] ?? { total: 0, count: 0 };
  const ar = Number(arRow[0]?.total ?? 0);
  const overdue = overdueRow[0] ?? { total: 0, count: 0 };

  const attentionCount =
    riskCompanies.length + quietDeals.length + (goodNews.length ? 1 : 0);

  const today = new Date();
  const overdueTask = (due: Date | null) =>
    due !== null && due.getTime() < Date.now() && due.toDateString() !== today.toDateString();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-[28px] font-bold tracking-[-0.84px] text-foreground">
          {attentionCount > 0 ? (
            <>
              {attentionCount === 1 ? "One thing needs" : `${["", "One", "Two", "Three", "Four", "Five"][attentionCount] ?? attentionCount} things need`} you this{" "}
              <span className="gradient-text-flow">morning</span>.
            </>
          ) : (
            <>
              All quiet, for <span className="gradient-text-flow">now</span>.
            </>
          )}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          What the pipeline and the books agree on today.
        </p>
      </div>

      {/* Stat band */}
      <div className="grid grid-cols-4 gap-3.5">
        <Card index={0} className="px-[18px] py-4">
          <Caps>Open pipeline</Caps>
          <div className="mt-1.5 font-display text-[25px] font-semibold tracking-[-0.5px] text-foreground">
            {money(openTotal)}
          </div>
          <div className="mt-0.5 text-xs text-[var(--text-tertiary)]">
            {openCount} open deals
          </div>
        </Card>
        <Card index={1} className="px-[18px] py-4">
          <Caps>Won this month</Caps>
          <div className="mt-1.5 font-display text-[25px] font-semibold tracking-[-0.5px] text-foreground">
            {money(Number(won.total))}
          </div>
          <div className="mt-0.5 text-xs text-[var(--accent-success)]">
            {Number(won.count)} deals closed
          </div>
        </Card>
        <Card index={2} className="px-[18px] py-4">
          <Caps className="flex items-center gap-1.5">
            <span>Receivables outstanding</span>
            <LedgerDot />
          </Caps>
          <div className="mt-1.5 font-display text-[25px] font-semibold tracking-[-0.5px] text-foreground">
            {money(ar)}
          </div>
          <div className="mt-0.5 text-xs text-[var(--text-tertiary)]">From the books</div>
        </Card>
        <Card index={3} className="px-[18px] py-4">
          <Caps className="flex items-center gap-1.5">
            <span>Overdue</span>
            <LedgerDot />
          </Caps>
          <div className="mt-1.5 font-display text-[25px] font-semibold tracking-[-0.5px] text-foreground">
            {money(Number(overdue.total))}
          </div>
          <div className="mt-0.5 text-xs text-[var(--accent-warning)]">
            {Number(overdue.count)} invoices past due
          </div>
        </Card>
      </div>

      {/* Middle row */}
      <div className="grid grid-cols-[3fr_2fr] gap-3.5">
        <Card index={4} className="p-5">
          <div className="font-display text-[15px] font-semibold text-foreground">
            Pipeline by stage
          </div>
          <div className="mt-0.5 text-xs text-[var(--text-tertiary)]">
            Open value in each stage right now.
          </div>
          <div className="mt-4 flex flex-col gap-3.5">
            {openByStage.map((s) => (
              <div
                key={s.stage}
                className="grid grid-cols-[110px_minmax(0,1fr)_84px] items-center gap-3"
              >
                <div className="text-[13px] text-muted-foreground">{s.stage}</div>
                <div className="flex h-3">
                  <div
                    className="rounded-r bg-[var(--accent-primary)]"
                    style={{ width: `${Math.max(2, (Number(s.total) / maxStage) * 100)}%` }}
                  />
                </div>
                <div className="text-right text-[13px] font-semibold text-foreground">
                  {money(Number(s.total))}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card index={5} className="flex flex-col p-5">
          <div className="flex items-baseline justify-between">
            <div className="font-display text-[15px] font-semibold text-foreground">
              Due today
            </div>
            <Link href="/tasks" className="text-xs font-medium text-[var(--accent-primary)]">
              All tasks
            </Link>
          </div>
          <div className="mt-2 flex flex-col">
            {tasks.map((task, i) => (
              <div
                key={task.id}
                className={`flex items-center gap-2.5 py-2 ${i < tasks.length - 1 ? "border-b border-[var(--rule-soft)]" : ""}`}
              >
                <TaskCheckbox taskId={task.id} />
                <span className="flex-1 text-[13px] text-foreground">{task.subject}</span>
                {overdueTask(task.dueAt) ? (
                  <span className="rounded-full bg-[color-mix(in_srgb,var(--accent-hot)_10%,transparent)] px-2 py-0.5 text-[11px] font-semibold text-[#b91c1c]">
                    Overdue
                  </span>
                ) : (
                  <span className="text-[11px] text-[var(--text-tertiary)]">
                    {task.dueAt ? timeFmt.format(task.dueAt) : ""}
                  </span>
                )}
              </div>
            ))}
            {tasks.length === 0 && (
              <p className="py-2 text-[13px] text-muted-foreground">Nothing due. Enjoy it.</p>
            )}
          </div>
        </Card>
      </div>

      {/* What the <span className="gradient-text-flow">books</span> are telling you */}
      <Card index={6} className="p-5">
        <div className="font-display text-[15px] font-semibold text-foreground">
          What the <span className="gradient-text-flow">books</span> are telling you
        </div>
        <div className="mt-1 flex flex-col">
          {riskCompanies.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-3 border-b border-[var(--rule-soft)] py-2.5"
            >
              <span className="size-2 shrink-0 rounded-full bg-[var(--accent-hot)]" />
              <span className="flex-1 text-[13px] text-foreground">
                <strong className="font-semibold">{c.name}</strong> has {money(c.overdueCents)}{" "}
                overdue in the books — and {money(Number(c.openDealTotal))} of open pipeline with
                you. Settle one before pushing the other.
              </span>
              <Link
                href={`/companies/${c.id}`}
                className="shrink-0 text-xs font-medium text-[var(--accent-primary)]"
              >
                View company
              </Link>
            </div>
          ))}
          {quietDeals.map((d) => (
            <div
              key={d.id}
              className="flex items-center gap-3 border-b border-[var(--rule-soft)] py-2.5"
            >
              <span className="size-2 shrink-0 rounded-full bg-[var(--accent-warning)]" />
              <span className="flex-1 text-[13px] text-foreground">
                <strong className="font-semibold">
                  {d.name}
                  {d.companyName ? ` — ${d.companyName}` : ""}
                </strong>{" "}
                has had no activity in {Math.max(1, Math.round((Date.now() - d.updatedAt.getTime()) / 86_400_000))} days.
              </span>
              <Link href="/deals" className="shrink-0 text-xs font-medium text-[var(--accent-primary)]">
                View deal
              </Link>
            </div>
          ))}
          {goodNews.map((g, i) => (
            <div key={i} className="flex items-center gap-3 py-2.5">
              <span className="size-2 shrink-0 rounded-full bg-[var(--accent-data)]" />
              <span className="flex-1 text-[13px] text-foreground">
                <strong className="font-semibold">{g.subject}</strong>
                {g.body ? ` — ${g.body}` : ""} A good week to ask about the renewal.
              </span>
              {g.companyId && (
                <Link
                  href={`/companies/${g.companyId}`}
                  className="shrink-0 text-xs font-medium text-[var(--accent-primary)]"
                >
                  View company
                </Link>
              )}
            </div>
          ))}
          {attentionCount === 0 && (
            <p className="py-2.5 text-[13px] text-muted-foreground">
              Nothing overdue, nothing gone quiet. The books and the pipeline agree.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
