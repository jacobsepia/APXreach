import { asc, eq, inArray, ne } from "drizzle-orm";
import { companies, db, deals, ledgerInvoices, pipelineStages, pipelines } from "@/db";
import { daysBetween, money, shortDate } from "@/lib/format";
import { Avatar, Card, Pill } from "@/components/ui";
import { AlertTriangle, Check, ChevronDown, FileText, Clock } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata = { title: "Deals" };

export default async function DealsPage() {
  const [pipeline] = await db.select().from(pipelines).orderBy(asc(pipelines.displayOrder)).limit(1);
  if (!pipeline) {
    return <p className="text-sm text-muted-foreground">No pipeline yet.</p>;
  }

  const [stages, rows, openLedgerInvoices] = await Promise.all([
    db
      .select()
      .from(pipelineStages)
      .where(eq(pipelineStages.pipelineId, pipeline.id))
      .orderBy(asc(pipelineStages.displayOrder)),
    db
      .select({
        id: deals.id,
        name: deals.name,
        stageId: deals.stageId,
        status: deals.status,
        amountCents: deals.amountCents,
        closeDate: deals.closeDate,
        wonAt: deals.wonAt,
        updatedAt: deals.updatedAt,
        ownerName: deals.ownerName,
        ledgerInvoiceNumber: deals.ledgerInvoiceNumber,
        companyName: companies.name,
        companyOverdueCents: companies.overdueCents,
      })
      .from(deals)
      .leftJoin(companies, eq(deals.companyId, companies.id))
      .where(inArray(deals.status, ["open", "won"]))
      .orderBy(asc(deals.closeDate)),
    db
      .select({ number: ledgerInvoices.number })
      .from(ledgerInvoices)
      .where(ne(ledgerInvoices.status, "paid")),
  ]);

  const stillOpen = new Set(openLedgerInvoices.map((r) => r.number));
  const columns = stages
    .filter((s) => s.kind !== "lost")
    .map((stage) => {
      const stageDeals = rows.filter((d) => d.stageId === stage.id);
      return {
        stage,
        deals: stageDeals,
        total: stageDeals.reduce((sum, d) => sum + d.amountCents, 0),
      };
    });

  const openTotal = columns
    .filter((c) => c.stage.kind === "open")
    .reduce((sum, c) => sum + c.total, 0);
  const openCount = columns
    .filter((c) => c.stage.kind === "open")
    .reduce((sum, c) => sum + c.deals.length, 0);

  const quiet = (d: { updatedAt: Date }) => daysBetween(new Date(), d.updatedAt) >= 14;

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-[-0.6px] text-foreground">
            Deals
          </h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {pipeline.name} · {money(openTotal)} open across {openCount} deals
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 items-center gap-2 rounded-[10px] border border-border bg-white px-3 text-[13px] font-medium text-foreground">
            <span>{pipeline.name}</span>
            <ChevronDown className="size-3.5 text-[var(--text-tertiary)]" />
          </div>
          <div className="flex h-8 overflow-hidden rounded-[10px] border border-border bg-white text-[13px] font-medium">
            <span className="flex items-center bg-[var(--tint-strong)] px-3.5 text-foreground">
              Board
            </span>
            <span className="flex items-center border-l border-border px-3.5 text-muted-foreground">
              Table
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 items-start gap-3.5">
        {columns.map(({ stage, deals: stageDeals, total }) => (
          <div key={stage.id} className="flex flex-col gap-2.5">
            <div className="flex items-baseline justify-between px-1">
              <span className="text-xs font-semibold tracking-[0.05em] text-[var(--text-tertiary)] uppercase">
                {stage.kind === "won" ? "Won this month" : stage.name}
              </span>
              <span className="text-xs text-[var(--text-tertiary)]">
                {money(total)} · {stageDeals.length}
              </span>
            </div>
            {stageDeals.map((d) => {
              const overdueInLedger = Number(d.companyOverdueCents ?? 0) > 0 && d.status === "open";
              const isQuiet = d.status === "open" && quiet(d);
              return (
                <Card
                  key={d.id}
                  className={`flex flex-col gap-1.5 rounded-xl px-3.5 py-3 ${
                    overdueInLedger
                      ? "border-[color-mix(in_srgb,var(--accent-hot)_35%,transparent)]"
                      : isQuiet
                        ? "border-[color-mix(in_srgb,var(--accent-warning)_35%,transparent)]"
                        : ""
                  }`}
                >
                  <div className="text-sm font-medium text-foreground">{d.name}</div>
                  <div className="text-xs text-muted-foreground">{d.companyName ?? "—"}</div>
                  <div className="font-display text-base font-semibold text-foreground">
                    {money(d.amountCents)}
                  </div>
                  {isQuiet && (
                    <Pill kind="warning" className="self-start">
                      <Clock className="size-[11px]" />
                      <span>Quiet for {daysBetween(new Date(), d.updatedAt)} days</span>
                    </Pill>
                  )}
                  {overdueInLedger && (
                    <Pill kind="overdue" className="self-start">
                      <AlertTriangle className="size-[11px]" />
                      <span>{money(Number(d.companyOverdueCents))} overdue in Ledger</span>
                    </Pill>
                  )}
                  {d.status === "won" && d.ledgerInvoiceNumber && (
                    <Pill kind="ledger" className="self-start">
                      {stillOpen.has(d.ledgerInvoiceNumber) ? (
                        <>
                          <FileText className="size-[11px]" />
                          <span>Invoice {d.ledgerInvoiceNumber} sent</span>
                        </>
                      ) : (
                        <>
                          <Check className="size-[11px]" />
                          <span>Paid in Ledger</span>
                        </>
                      )}
                    </Pill>
                  )}
                  <div className="mt-0.5 flex items-center justify-between">
                    <span className="text-[11px] text-[var(--text-tertiary)]">
                      {d.status === "won"
                        ? `Won ${shortDate(d.wonAt ?? undefined)}`
                        : `Close ${shortDate(d.closeDate)}`}
                    </span>
                    {d.ownerName && <Avatar name={d.ownerName} className="size-[22px]" />}
                  </div>
                </Card>
              );
            })}
            {stageDeals.length === 0 && (
              <div className="px-1 text-xs text-[var(--text-tertiary)]">Nothing here.</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
