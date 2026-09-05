import Link from "next/link";
import { headers } from "next/headers";
import { and, desc, eq, sql } from "drizzle-orm";
import { companies, contacts, db, mailboxes } from "@/db";
import { auth } from "@/lib/auth";
import { money, relativeDay } from "@/lib/format";
import { Avatar, Card, LedgerDot, Pill, StagePill } from "@/components/ui";
import { QuickCreate } from "@/components/quick-create";
import { RecordActions } from "@/components/record-actions";
import { ComposeEmail } from "@/components/compose-email";
import { Download } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata = { title: "Contacts" };

export default async function ContactsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const [rows, stageCounts, overdueAccounts, companyOptions, [mailbox]] = await Promise.all([
    db
      .select({
        id: contacts.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        email: contacts.email,
        phone: contacts.phone,
        title: contacts.title,
        lifecycleStage: contacts.lifecycleStage,
        ownerName: contacts.ownerName,
        lastActivityAt: contacts.lastActivityAt,
        companyId: contacts.companyId,
        companyName: companies.name,
        arBalanceCents: companies.arBalanceCents,
        overdueCents: companies.overdueCents,
      })
      .from(contacts)
      .leftJoin(companies, eq(contacts.companyId, companies.id))
      .orderBy(desc(contacts.lastActivityAt)),
    db
      .select({ stage: contacts.lifecycleStage, count: sql<number>`count(*)` })
      .from(contacts)
      .groupBy(contacts.lifecycleStage),
    db
      .select({ count: sql<number>`count(*)` })
      .from(companies)
      .where(sql`${companies.overdueCents} > 0`),
    db
      .select({ id: companies.id, name: companies.name })
      .from(companies)
      .orderBy(companies.name),
    session
      ? db
          .select({ emailAddress: mailboxes.emailAddress })
          .from(mailboxes)
          .where(and(eq(mailboxes.userId, session.user.id), eq(mailboxes.status, "connected")))
          .limit(1)
      : Promise.resolve([] as { emailAddress: string }[]),
  ]);

  const countOf = (stage: string) =>
    Number(stageCounts.find((s) => s.stage === stage)?.count ?? 0);
  const total = rows.length;
  const customerCount = countOf("customer");
  const overdueCount = Number(overdueAccounts[0]?.count ?? 0);

  const chip =
    "flex h-[30px] items-center gap-1.5 rounded-full border border-border bg-white px-3 text-[12.5px] font-medium text-muted-foreground";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-[-0.035em]">
            <span className="gradient-text-flow">Contacts</span>
          </h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {total} people · {customerCount} belong to paying customers in the books
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className={chip.replace("text-muted-foreground", "text-foreground")}>
            <Download className="size-3.5" />
            <span>Import CSV</span>
          </button>
          <QuickCreate companies={companyOptions} stages={[]} only="contact" buttonLabel="Add contact" />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className={`${chip} border-[color-mix(in_srgb,var(--accent-primary)_20%,transparent)] bg-[var(--tint-strong)] text-foreground`}>
          All <span className="text-[var(--text-tertiary)]">{total}</span>
        </span>
        <span className={chip}>
          Customers <span className="text-[var(--text-tertiary)]">{customerCount}</span>
        </span>
        <span className={chip}>
          Opportunities <span className="text-[var(--text-tertiary)]">{countOf("opportunity")}</span>
        </span>
        <span className={chip}>
          Leads <span className="text-[var(--text-tertiary)]">{countOf("lead")}</span>
        </span>
        <span className={`${chip} border-[color-mix(in_srgb,var(--accent-warning)_35%,transparent)] text-[#b45309]`}>
          Overdue accounts <span>{overdueCount}</span>
        </span>
      </div>

      <Card index={0} className="overflow-hidden">
        <div className="grid h-10 grid-cols-[220px_180px_minmax(0,1fr)_110px_60px_100px_100px_96px] items-center gap-3 border-b border-border bg-[image:var(--gradient-table-head)] px-4 text-[11px] font-semibold tracking-[0.05em] text-[var(--text-tertiary)] uppercase">
          <span>Name</span>
          <span>Company</span>
          <span>Email</span>
          <span>Stage</span>
          <span>Owner</span>
          <span className="text-right">Owing</span>
          <span className="text-right">Last activity</span>
          <span className="sr-only">Actions</span>
        </div>
        {rows.map((row, i) => (
          <div
            key={row.id}
            className={`transition-colors hover:bg-[var(--tint)] grid h-[46px] grid-cols-[220px_180px_minmax(0,1fr)_110px_60px_100px_100px_96px] items-center gap-3 px-4 text-[13px] ${i < rows.length - 1 ? "border-b border-[var(--rule-soft)]" : ""}`}
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <Avatar name={`${row.firstName} ${row.lastName}`} />
              <span className="truncate font-medium text-foreground">
                {row.firstName} {row.lastName}
              </span>
            </span>
            <span className="truncate text-muted-foreground">
              {row.companyId ? (
                <Link href={`/companies/${row.companyId}`} className="hover:text-foreground">
                  {row.companyName}
                </Link>
              ) : (
                "—"
              )}
            </span>
            <span className="truncate text-muted-foreground">{row.email ?? "—"}</span>
            <span>
              <StagePill stage={row.lifecycleStage} />
            </span>
            <span>{row.ownerName ? <Avatar name={row.ownerName} className="size-6" /> : "—"}</span>
            <span className="flex items-center justify-end gap-1.5 text-right">
              {row.lifecycleStage === "customer" && row.arBalanceCents !== null ? (
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
            <span className="text-right text-[var(--text-tertiary)]">
              {relativeDay(row.lastActivityAt)}
            </span>
            <span className="flex items-center gap-1">
            {row.email && (
              <ComposeEmail
                variant="icon"
                companyId={row.companyId ?? undefined}
                from={mailbox?.emailAddress ?? null}
                recipients={[{ id: row.id, name: `${row.firstName} ${row.lastName}`.trim(), email: row.email }]}
                defaultRecipientId={row.id}
              />
            )}
            <RecordActions
              kind="contact"
              id={row.id}
              name={`${row.firstName} ${row.lastName}`.trim()}
              companies={companyOptions}
              values={{
                firstName: row.firstName,
                lastName: row.lastName,
                email: row.email,
                phone: row.phone,
                title: row.title,
                companyId: row.companyId,
                lifecycleStage: row.lifecycleStage,
                ownerName: row.ownerName,
              }}
            />
            </span>
          </div>
        ))}
        <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs text-[var(--text-tertiary)]">
          <span>
            Showing all {total} · <Pill kind="ledger">Owing comes from the books</Pill>
          </span>
        </div>
      </Card>
    </div>
  );
}
