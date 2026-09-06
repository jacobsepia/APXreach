import Link from "next/link";
import { and, desc, eq, gte, ne, sql } from "drizzle-orm";
import { activities, companies, db, deals, emailMessages, pipelineStages, syncedInvoices } from "@/db";
import { requireTenant } from "@/lib/workspace";
import { money } from "@/lib/format";
import { agingBucket, agingLabels, bucketKeyFor, bucketsFor, compactMoney, delta, percent } from "@/lib/reports";
import { Card, LedgerDot } from "@/components/ui";
import { BarList, ColumnChart, StatTile, chartColors } from "@/components/charts";

/*
 * Reports: what the pipeline did, what the team did, and what the books say
 * is owed — on one page, against one period. The revenue and receivables
 * figures come from the connected books, not from what the pipeline hopes.
 *
 * One filter row scopes everything below it. Receivables aging is the one
 * exception: it is a snapshot of today, because money owed has no period.
 */

export const dynamic = "force-dynamic";

export const metadata = { title: "Reports" };

const ranges = [
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 365, label: "12 months" },
] as const;

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const { workspaceId } = await requireTenant();
  const { range } = await searchParams;
  const days = ranges.find((item) => String(item.days) === range)?.days ?? 90;

  const now = new Date();
  const since = new Date(now.getTime() - days * 86_400_000);
  const previousSince = new Date(since.getTime() - days * 86_400_000);
  const today = now.toISOString().slice(0, 10);

  const [wonDeals, lostDeals, openByStage, emails, activityRows, invoices, topCompanies] = await Promise.all([
    db
      .select({ amountCents: deals.amountCents, wonAt: deals.wonAt })
      .from(deals)
      .where(and(eq(deals.workspaceId, workspaceId), eq(deals.status, "won"), gte(deals.wonAt, previousSince))),
    db
      .select({ amountCents: deals.amountCents, updatedAt: deals.updatedAt })
      .from(deals)
      .where(and(eq(deals.workspaceId, workspaceId), eq(deals.status, "lost"), gte(deals.updatedAt, previousSince))),
    db
      .select({
        stage: pipelineStages.name,
        order: pipelineStages.displayOrder,
        probability: pipelineStages.winProbability,
        total: sql<number>`coalesce(sum(${deals.amountCents}), 0)`,
        count: sql<number>`count(*)`,
      })
      .from(deals)
      .innerJoin(pipelineStages, eq(deals.stageId, pipelineStages.id))
      .where(and(eq(deals.workspaceId, workspaceId), eq(deals.status, "open")))
      .groupBy(pipelineStages.name, pipelineStages.displayOrder, pipelineStages.winProbability)
      .orderBy(pipelineStages.displayOrder),
    db
      .select({ direction: emailMessages.direction, sentAt: emailMessages.sentAt })
      .from(emailMessages)
      .where(and(eq(emailMessages.workspaceId, workspaceId), gte(emailMessages.sentAt, previousSince))),
    db
      .select({ type: activities.type, occurredAt: activities.occurredAt })
      .from(activities)
      .where(and(eq(activities.workspaceId, workspaceId), ne(activities.type, "ledger_event"), ne(activities.type, "task"), gte(activities.occurredAt, previousSince))),
    db
      .select({ outstandingCents: syncedInvoices.outstandingCents, dueDate: syncedInvoices.dueDate })
      .from(syncedInvoices)
      .where(and(eq(syncedInvoices.workspaceId, workspaceId), ne(syncedInvoices.status, "paid"))),
    db
      .select({ name: companies.name, revenueYtdCents: companies.revenueYtdCents })
      .from(companies)
      .where(and(eq(companies.workspaceId, workspaceId), sql`${companies.revenueYtdCents} > 0`))
      .orderBy(desc(companies.revenueYtdCents))
      .limit(9),
  ]);

  const inPeriod = (date: Date | null) => date !== null && date >= since;
  const inPrevious = (date: Date | null) => date !== null && date < since;

  /* Headline figures, this period against the one before it. */
  const wonNow = wonDeals.filter((d) => inPeriod(d.wonAt));
  const wonBefore = wonDeals.filter((d) => inPrevious(d.wonAt));
  const wonTotal = wonNow.reduce((sum, d) => sum + d.amountCents, 0);
  const wonTotalBefore = wonBefore.reduce((sum, d) => sum + d.amountCents, 0);
  const lostNow = lostDeals.filter((d) => inPeriod(d.updatedAt)).length;
  const lostBefore = lostDeals.filter((d) => inPrevious(d.updatedAt)).length;
  const sentNow = emails.filter((m) => m.direction === "outbound" && inPeriod(m.sentAt)).length;
  const sentBefore = emails.filter((m) => m.direction === "outbound" && inPrevious(m.sentAt)).length;
  const receivedNow = emails.filter((m) => m.direction === "inbound" && inPeriod(m.sentAt)).length;
  const activityNow = activityRows.filter((a) => inPeriod(a.occurredAt)).length;
  const activityBefore = activityRows.filter((a) => inPrevious(a.occurredAt)).length;

  /* Time series, cut into weeks or months depending on how long the period is. */
  const buckets = bucketsFor(days, since, now);
  const tally = <T,>(rows: T[], when: (row: T) => Date | null, amount: (row: T) => number = () => 1) => {
    const map = new Map(buckets.map((bucket) => [bucket.key, 0]));
    for (const row of rows) {
      const date = when(row);
      if (!date || date < since) continue;
      const key = bucketKeyFor(days, date);
      if (map.has(key)) map.set(key, (map.get(key) ?? 0) + amount(row));
    }
    return buckets.map((bucket) => map.get(bucket.key) ?? 0);
  };
  const wonByBucket = tally(wonDeals, (d) => d.wonAt, (d) => d.amountCents);
  const lostByBucket = tally(lostDeals, (d) => d.updatedAt, (d) => d.amountCents);
  const sentByBucket = tally(emails.filter((m) => m.direction === "outbound"), (m) => m.sentAt);
  const receivedByBucket = tally(emails.filter((m) => m.direction === "inbound"), (m) => m.sentAt);
  const activityByBucket = tally(activityRows, (a) => a.occurredAt);
  const activityByType = ["call", "meeting", "note", "email"].map((type) => ({
    label: { call: "Calls", meeting: "Meetings", note: "Notes", email: "Emails logged" }[type]!,
    value: activityRows.filter((a) => a.type === type && inPeriod(a.occurredAt)).length,
  }));

  /* The pipeline as it stands, and what it is worth once win rates are applied. */
  const pipelineRows = openByStage.map((row) => ({
    label: row.stage,
    sub: `${row.count} ${Number(row.count) === 1 ? "deal" : "deals"}${row.probability != null ? ` · ${row.probability}% likely` : ""}`,
    value: Number(row.total),
  }));
  const weighted = openByStage.reduce((sum, row) => sum + (Number(row.total) * (row.probability ?? 100)) / 100, 0);
  const openTotal = openByStage.reduce((sum, row) => sum + Number(row.total), 0);

  /* Receivables, as of today. */
  const aging = new Map<string, number>(agingLabels.map((label) => [label, 0]));
  for (const invoice of invoices) {
    const bucket = agingBucket(invoice.dueDate, today);
    aging.set(bucket, (aging.get(bucket) ?? 0) + invoice.outstandingCents);
  }
  const agingRows = agingLabels.map((label) => ({ label, value: aging.get(label) ?? 0, color: label === "Current" ? chartColors.primary : label === "Over 90" ? "#b91c1c" : "#9333ea" }));
  const owed = invoices.reduce((sum, invoice) => sum + invoice.outstandingCents, 0);
  const overdue = invoices.filter((invoice) => invoice.dueDate < today).reduce((sum, invoice) => sum + invoice.outstandingCents, 0);

  const revenueRows = topCompanies.slice(0, 8).map((company) => ({ label: company.name, value: company.revenueYtdCents }));
  if (topCompanies.length > 8) {
    revenueRows.push({ label: "Everyone else", value: topCompanies.slice(8).reduce((sum, company) => sum + company.revenueYtdCents, 0) });
  }

  const periodLabel = ranges.find((item) => item.days === days)!.label;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-[-0.035em]">
            <span className="gradient-text-flow">Reports</span>
          </h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Pipeline, activity and the books, over the last {periodLabel}. Revenue and receivables come from the books, not the pipeline.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-[10px] border border-input bg-white p-1" role="group" aria-label="Period">
          {ranges.map((item) => (
            <Link
              key={item.days}
              href={`/reports?range=${item.days}`}
              aria-current={item.days === days ? "page" : undefined}
              className={`rounded-[7px] px-3 py-1 text-[12px] font-medium ${item.days === days ? "bg-[var(--tint-strong)] text-[var(--accent-primary)]" : "text-muted-foreground hover:text-foreground"}`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3 max-lg:grid-cols-2">
        <Card index={0}><StatTile label={`Won · ${periodLabel}`} value={money(wonTotal)} delta={{ ...delta(wonTotal, wonTotalBefore) }} note={`${wonNow.length} ${wonNow.length === 1 ? "deal" : "deals"} closed`} /></Card>
        <Card index={1}><StatTile label="Win rate" value={percent(wonNow.length, wonNow.length + lostNow)} note={`${wonNow.length} won · ${lostNow} lost`} delta={lostBefore + wonBefore.length ? { ...delta(wonNow.length, wonBefore.length), text: `${wonBefore.length} won before` } : undefined} /></Card>
        <Card index={2}><StatTile label="Emails sent" value={String(sentNow)} delta={{ ...delta(sentNow, sentBefore) }} note={`${receivedNow} replies received`} /></Card>
        <Card index={3}><StatTile label="Activities logged" value={String(activityNow)} delta={{ ...delta(activityNow, activityBefore) }} note="calls, meetings, notes" /></Card>
      </div>

      <div className="grid grid-cols-2 gap-3 max-lg:grid-cols-1">
        <Card index={4} className="p-5">
          <div className="mb-3 flex items-baseline justify-between">
            <div className="font-display text-[15px] font-semibold text-foreground">Won and lost</div>
            <span className="text-xs text-[var(--text-tertiary)]">by {days > 120 ? "month" : "week"}</span>
          </div>
          <ColumnChart
            series={[{ name: "Won", color: chartColors.primary }, { name: "Lost", color: chartColors.muted }]}
            groups={buckets.map((bucket, index) => ({ label: bucket.label, values: [wonByBucket[index], lostByBucket[index]] }))}
            format={compactMoney}
            emptyText="No deals closed in this period. Mark a deal won or lost on the Deals page and it lands here."
          />
        </Card>

        <Card index={5} className="p-5">
          <div className="mb-3 flex items-baseline justify-between">
            <div className="font-display text-[15px] font-semibold text-foreground">Open pipeline by stage</div>
            <span className="text-xs text-[var(--text-tertiary)]">{money(openTotal)} open · {money(Math.round(weighted))} weighted</span>
          </div>
          <BarList rows={pipelineRows} format={compactMoney} emptyText="No open deals. Add one from a company page or the New button." />
        </Card>

        <Card index={6} className="p-5">
          <div className="mb-3 flex items-baseline justify-between">
            <div className="font-display text-[15px] font-semibold text-foreground">Email sent and received</div>
            <span className="text-xs text-[var(--text-tertiary)]">through connected mailboxes</span>
          </div>
          <ColumnChart
            series={[{ name: "Sent", color: chartColors.primary }, { name: "Received", color: chartColors.data }]}
            groups={buckets.map((bucket, index) => ({ label: bucket.label, values: [sentByBucket[index], receivedByBucket[index]] }))}
            format={(value) => String(value)}
            emptyText="No email in this period. Send one from a contact record and it is counted here."
          />
        </Card>

        <Card index={7} className="p-5">
          <div className="mb-3 flex items-baseline justify-between">
            <div className="font-display text-[15px] font-semibold text-foreground">Activity</div>
            <span className="text-xs text-[var(--text-tertiary)]">calls, meetings, notes and logged emails</span>
          </div>
          <ColumnChart
            series={[{ name: "Activities", color: chartColors.primary }]}
            groups={buckets.map((bucket, index) => ({ label: bucket.label, values: [activityByBucket[index]] }))}
            format={(value) => String(value)}
            emptyText="Nothing logged in this period. Log a call or a note on a company and it is counted here."
          />
          {activityNow > 0 && (
            <div className="mt-4 border-t border-[var(--rule-soft)] pt-3">
              <BarList rows={activityByType.filter((row) => row.value > 0)} format={(value) => String(value)} />
            </div>
          )}
        </Card>

        <Card index={8} className="p-5">
          <div className="mb-3 flex items-baseline justify-between">
            <div className="flex items-center gap-1.5 font-display text-[15px] font-semibold text-foreground"><span>Receivables aging</span><LedgerDot /></div>
            <span className="text-xs text-[var(--text-tertiary)]">{money(owed)} owed · {money(overdue)} overdue · as of today</span>
          </div>
          <BarList rows={agingRows} format={compactMoney} emptyText="Nothing outstanding in the books. Connect and sync your books in Settings to see receivables here." />
        </Card>

        <Card index={9} className="p-5">
          <div className="mb-3 flex items-baseline justify-between">
            <div className="flex items-center gap-1.5 font-display text-[15px] font-semibold text-foreground"><span>Revenue this year by customer</span><LedgerDot /></div>
            <span className="text-xs text-[var(--text-tertiary)]">invoiced, from the books</span>
          </div>
          <BarList rows={revenueRows} format={compactMoney} emptyText="No invoiced revenue this year in the books yet." />
        </Card>
      </div>
    </div>
  );
}
