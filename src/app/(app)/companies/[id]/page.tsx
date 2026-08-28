import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, ne } from "drizzle-orm";
import {
  activities,
  companies,
  contacts,
  db,
  deals,
  ledgerInvoices,
  pipelineStages,
} from "@/db";
import { daysBetween, money, monthYear, shortDate } from "@/lib/format";
import { Avatar, Card, Caps, LedgerDot, Pill } from "@/components/ui";
import { TimelineComposer } from "@/components/timeline-composer";
import {
  AlertTriangle,
  Banknote,
  ChevronRight,
  FileText,
  Mail,
  Phone,
  Plus,
  StickyNote,
  Users,
} from "lucide-react";

export const dynamic = "force-dynamic";

const typeIcon = {
  email: Mail,
  call: Phone,
  note: StickyNote,
  meeting: Users,
  task: StickyNote,
} as const;

function TimelineIcon({ type, subject }: { type: string; subject: string }) {
  if (type === "ledger_event") {
    const alarming = /overdue/i.test(subject);
    const Icon = alarming ? AlertTriangle : /payment|paid/i.test(subject) ? Banknote : FileText;
    return (
      <span
        className={`flex size-[30px] shrink-0 items-center justify-center rounded-full border ${
          alarming
            ? "border-[color-mix(in_srgb,var(--accent-hot)_35%,transparent)] bg-[color-mix(in_srgb,var(--accent-hot)_8%,transparent)]"
            : "border-[color-mix(in_srgb,var(--accent-data)_40%,transparent)] bg-[#eef7dd]"
        }`}
      >
        <Icon className={`size-3.5 ${alarming ? "text-[var(--accent-hot)]" : "text-[#4d7c0f]"}`} />
      </span>
    );
  }
  const Icon = typeIcon[type as keyof typeof typeIcon] ?? StickyNote;
  return (
    <span className="flex size-[30px] shrink-0 items-center justify-center rounded-full border border-border bg-white">
      <Icon className="size-3.5 text-[var(--accent-primary)]" />
    </span>
  );
}

const stamp = new Intl.DateTimeFormat("en-CA", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export default async function CompanyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [company] = await db.select().from(companies).where(eq(companies.id, id));
  if (!company) notFound();

  const [people, openDeals, timeline, invoices] = await Promise.all([
    db.select().from(contacts).where(eq(contacts.companyId, id)),
    db
      .select({
        id: deals.id,
        name: deals.name,
        amountCents: deals.amountCents,
        closeDate: deals.closeDate,
        stageName: pipelineStages.name,
      })
      .from(deals)
      .innerJoin(pipelineStages, eq(deals.stageId, pipelineStages.id))
      .where(and(eq(deals.companyId, id), eq(deals.status, "open"))),
    db
      .select()
      .from(activities)
      .where(and(eq(activities.companyId, id), ne(activities.type, "task")))
      .orderBy(desc(activities.occurredAt))
      .limit(8),
    db
      .select()
      .from(ledgerInvoices)
      .where(and(eq(ledgerInvoices.companyId, id), ne(ledgerInvoices.status, "paid")))
      .orderBy(desc(ledgerInvoices.issuedDate)),
  ]);

  const synced = company.lifecycleStage === "customer";
  const holdMarketing = company.overdueCents > 0 && openDeals.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-1.5 text-[13px] text-[var(--text-tertiary)]">
        <Link href="/companies" className="hover:text-foreground">
          Companies
        </Link>
        <ChevronRight className="size-3.5" />
        <span className="font-medium text-foreground">{company.name}</span>
      </div>

      {/* Record header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3.5">
          <div className="flex size-[46px] items-center justify-center rounded-xl bg-[var(--accent-plum-200)] font-display text-base font-semibold text-[var(--accent-primary)]">
            {company.name
              .split(/\s+/)
              .slice(0, 2)
              .map((w) => w[0])
              .join("")}
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <span className="font-display text-[22px] font-bold tracking-[-0.5px] text-foreground">
                {company.name}
              </span>
              <Pill kind={company.lifecycleStage === "customer" ? "customer" : company.lifecycleStage === "opportunity" ? "opportunity" : "lead"}>
                {company.lifecycleStage.charAt(0).toUpperCase() + company.lifecycleStage.slice(1)}
              </Pill>
              {synced && (
                <Pill kind="ledger">
                  <LedgerDot />
                  <span>Synced with APX Ledger</span>
                </Pill>
              )}
            </div>
            <div className="mt-0.5 text-[13px] text-[var(--text-tertiary)]">
              {[company.domain, company.city, company.ownerName ? `Owner: ${company.ownerName}` : null]
                .filter(Boolean)
                .join(" · ")}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex h-8 items-center gap-1.5 rounded-[10px] border border-input bg-white px-3 text-[13px] font-medium text-foreground">
            <Mail className="size-3.5" />
            <span>Email</span>
          </button>
          <button className="flex h-8 items-center gap-1.5 rounded-[10px] border border-input bg-white px-3 text-[13px] font-medium text-foreground">
            <Phone className="size-3.5" />
            <span>Log call</span>
          </button>
          <button className="flex h-8 items-center gap-1.5 rounded-[10px] bg-[image:var(--gradient-cta)] px-3.5 text-[13px] font-medium text-white">
            <Plus className="size-3.5" />
            <span>New deal</span>
          </button>
        </div>
      </div>

      {/* Three columns */}
      <div className="grid grid-cols-[280px_minmax(0,1fr)_320px] items-start gap-4">
        {/* Left */}
        <div className="flex flex-col gap-3.5">
          <Card className="px-[18px] py-4">
            <Caps>About</Caps>
            <div className="mt-1.5 flex flex-col text-[13px]">
              {[
                ["Lifecycle stage", company.lifecycleStage.charAt(0).toUpperCase() + company.lifecycleStage.slice(1)],
                ["Industry", company.industry ?? "—"],
                ["City", company.city ?? "—"],
                ["Source", company.source ?? "—"],
                ["Customer since", monthYear(company.customerSince)],
              ].map(([label, value], i, list) => (
                <div
                  key={label}
                  className={`flex justify-between gap-3 py-[7px] ${i < list.length - 1 ? "border-b border-[var(--rule-soft)]" : ""}`}
                >
                  <span className="text-[var(--text-tertiary)]">{label}</span>
                  <span className="font-medium text-foreground">{value}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="px-[18px] py-4">
            <Caps>Contacts</Caps>
            <div className="mt-2.5 flex flex-col gap-2.5">
              {people.map((p) => (
                <div key={p.id} className="flex items-center gap-2.5">
                  <Avatar name={`${p.firstName} ${p.lastName}`} className="size-[30px] text-[11px]" />
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-foreground">
                      {p.firstName} {p.lastName}
                    </div>
                    <div className="truncate text-xs text-[var(--text-tertiary)]">
                      {[p.title, p.email].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                </div>
              ))}
              {people.length === 0 && (
                <p className="text-[13px] text-muted-foreground">No contacts yet.</p>
              )}
            </div>
          </Card>

          <Card className="px-[18px] py-4">
            <div className="flex items-baseline justify-between">
              <Caps>Open deals</Caps>
              <span className="text-xs text-[var(--text-tertiary)]">{openDeals.length}</span>
            </div>
            <div className="mt-2.5 flex flex-col gap-2.5">
              {openDeals.map((d) => (
                <div key={d.id}>
                  <div className="text-[13px] font-medium text-foreground">{d.name}</div>
                  <div className="mt-0.5 flex items-center justify-between">
                    <span className="text-xs text-[var(--text-tertiary)]">
                      {d.stageName} · {shortDate(d.closeDate)}
                    </span>
                    <span className="font-display text-sm font-semibold text-foreground">
                      {money(d.amountCents)}
                    </span>
                  </div>
                </div>
              ))}
              {openDeals.length === 0 && (
                <p className="text-[13px] text-muted-foreground">Nothing open.</p>
              )}
            </div>
          </Card>
        </div>

        {/* Timeline */}
        <Card className="p-5">
          <div className="mb-3 font-display text-[15px] font-semibold text-foreground">Timeline</div>
          <TimelineComposer companyId={company.id} />
          <div className="mt-3 flex flex-col">
            {timeline.map((item, i) => (
              <div
                key={item.id}
                className={`flex gap-3 py-2.5 ${i < timeline.length - 1 ? "border-b border-[var(--rule-soft)]" : ""}`}
              >
                <TimelineIcon type={item.type} subject={item.subject} />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] text-foreground">
                    <strong className="font-semibold">{item.subject}</strong>
                    {item.body ? ` — ${item.body}` : ""}
                  </div>
                  <div className="mt-0.5 text-xs text-[var(--text-tertiary)]">
                    {item.source === "ledger" ? "APX Ledger" : (item.actorName ?? "Reach")} ·{" "}
                    {stamp.format(item.occurredAt)}
                  </div>
                </div>
              </div>
            ))}
            {timeline.length === 0 && (
              <p className="py-2 text-[13px] text-muted-foreground">
                Nothing yet — log a note or a call.
              </p>
            )}
          </div>
        </Card>

        {/* The books */}
        <div className="flex flex-col gap-3.5">
          <Card className="border-[color-mix(in_srgb,var(--accent-data)_40%,transparent)] px-[18px] py-4">
            <div className="flex items-center justify-between">
              <Caps className="flex items-center gap-1.5">
                <span>The books</span>
                <LedgerDot />
              </Caps>
              <a
                href="https://apxledger.ca"
                className="text-xs font-medium text-[var(--accent-primary)]"
              >
                Open in APX Ledger
              </a>
            </div>
            {synced ? (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[11px] text-[var(--text-tertiary)]">Outstanding</div>
                  <div className="font-display text-xl font-semibold tracking-[-0.4px] text-foreground">
                    {money(company.arBalanceCents)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-[var(--text-tertiary)]">Overdue</div>
                  <div
                    className={`font-display text-xl font-semibold tracking-[-0.4px] ${company.overdueCents > 0 ? "text-[#b91c1c]" : "text-foreground"}`}
                  >
                    {money(company.overdueCents)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-[var(--text-tertiary)]">Avg days to pay</div>
                  <div className="font-display text-xl font-semibold tracking-[-0.4px] text-foreground">
                    {company.avgDaysToPay ?? "—"}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-[var(--text-tertiary)]">Revenue this year</div>
                  <div className="font-display text-xl font-semibold tracking-[-0.4px] text-foreground">
                    {money(company.revenueYtdCents)}
                  </div>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-[13px] text-muted-foreground">
                Not a Ledger customer yet. Win a deal and the invoice starts the books.
              </p>
            )}
          </Card>

          {invoices.length > 0 && (
            <Card className="px-[18px] py-4">
              <Caps>Open invoices</Caps>
              <div className="mt-2 flex flex-col">
                {invoices.map((inv, i) => {
                  const overdueDays = daysBetween(new Date(), new Date(`${inv.dueDate}T12:00:00`));
                  return (
                    <div
                      key={inv.id}
                      className={`flex items-center justify-between gap-2 py-2 ${i < invoices.length - 1 ? "border-b border-[var(--rule-soft)]" : ""}`}
                    >
                      <div>
                        <div className="text-[13px] font-medium text-foreground">{inv.number}</div>
                        <div className="text-xs text-[var(--text-tertiary)]">
                          Issued {shortDate(inv.issuedDate)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[13px] font-semibold text-foreground">
                          {money(inv.outstandingCents)}
                        </div>
                        {inv.status === "overdue" ? (
                          <div className="text-[11px] font-medium text-[#b91c1c]">
                            {overdueDays} days overdue
                          </div>
                        ) : (
                          <div className="text-[11px] text-[var(--text-tertiary)]">
                            Due in {Math.max(0, -overdueDays)} days
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {holdMarketing && (
            <Card className="bg-[var(--bg-alt)] px-[18px] py-3.5">
              <p className="text-xs leading-relaxed text-muted-foreground">
                Overdue balance with a proposal on the table. Reach is holding marketing email
                for this account until the balance clears.
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
