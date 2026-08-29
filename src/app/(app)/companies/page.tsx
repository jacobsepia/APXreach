import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { companies, db, deals } from "@/db";
import { money } from "@/lib/format";
import { Avatar, Card, LedgerDot, StagePill } from "@/components/ui";

export const dynamic = "force-dynamic";

export const metadata = { title: "Companies" };

export default async function CompaniesPage() {
  const rows = await db
    .select({
      id: companies.id,
      name: companies.name,
      city: companies.city,
      industry: companies.industry,
      lifecycleStage: companies.lifecycleStage,
      ownerName: companies.ownerName,
      arBalanceCents: companies.arBalanceCents,
      overdueCents: companies.overdueCents,
      revenueYtdCents: companies.revenueYtdCents,
      openDeals: sql<number>`count(${deals.id}) filter (where ${deals.status} = 'open')`,
      openValue: sql<number>`coalesce(sum(${deals.amountCents}) filter (where ${deals.status} = 'open'), 0)`,
    })
    .from(companies)
    .leftJoin(deals, eq(deals.companyId, companies.id))
    .groupBy(companies.id)
    .orderBy(desc(companies.arBalanceCents), companies.name);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-[-0.035em]">
            <span className="gradient-text-flow">Companies</span>
          </h1>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          {rows.length} companies · what they owe comes straight from the books
        </p>
      </div>

      <Card index={0} className="overflow-hidden">
        <div className="grid h-10 grid-cols-[240px_170px_120px_70px_140px_120px_120px] items-center gap-3 border-b border-border bg-[image:var(--gradient-table-head)] px-4 text-[11px] font-semibold tracking-[0.05em] text-[var(--text-tertiary)] uppercase">
          <span>Company</span>
          <span>City</span>
          <span>Stage</span>
          <span>Owner</span>
          <span className="text-right">Open pipeline</span>
          <span className="text-right">Owing</span>
          <span className="text-right">Revenue YTD</span>
        </div>
        {rows.map((row, i) => (
          <div
            key={row.id}
            className={`transition-colors hover:bg-[var(--tint)] grid h-[46px] grid-cols-[240px_170px_120px_70px_140px_120px_120px] items-center gap-3 px-4 text-[13px] ${i < rows.length - 1 ? "border-b border-[var(--rule-soft)]" : ""}`}
          >
            <span className="min-w-0">
              <Link
                href={`/companies/${row.id}`}
                className="truncate font-medium text-foreground hover:text-[var(--accent-primary)]"
              >
                {row.name}
              </Link>
              <span className="block truncate text-xs text-[var(--text-tertiary)]">
                {row.industry ?? ""}
              </span>
            </span>
            <span className="truncate text-muted-foreground">{row.city ?? "—"}</span>
            <span>
              <StagePill stage={row.lifecycleStage} />
            </span>
            <span>{row.ownerName ? <Avatar name={row.ownerName} className="size-6" /> : "—"}</span>
            <span className="text-right text-muted-foreground">
              {Number(row.openDeals) > 0 ? money(Number(row.openValue)) : "—"}
            </span>
            <span className="flex items-center justify-end gap-1.5">
              {row.lifecycleStage === "customer" ? (
                <>
                  <LedgerDot />
                  <span
                    className={`font-semibold ${Number(row.overdueCents) > 0 ? "text-[#b91c1c]" : "text-foreground"}`}
                  >
                    {money(Number(row.arBalanceCents))}
                  </span>
                </>
              ) : (
                <span className="text-[var(--text-tertiary)]">—</span>
              )}
            </span>
            <span className="text-right text-muted-foreground">
              {Number(row.revenueYtdCents) > 0 ? money(Number(row.revenueYtdCents)) : "—"}
            </span>
          </div>
        ))}
      </Card>
    </div>
  );
}
