import Link from "next/link";
import { requireTenant } from "@/lib/workspace";
import { and, desc, eq, sql } from "drizzle-orm";
import { companies, contacts, db } from "@/db";
import { money, relativeDay } from "@/lib/format";
import { Avatar, Card, LedgerDot, Pill, StagePill } from "@/components/ui";
import { QuickCreate } from "@/components/quick-create";
import { RecordActions } from "@/components/record-actions";
import { ComposeEmail } from "@/components/compose-email";
import { ContactRecordModal } from "@/components/contact-record-modal";
import { ImportContacts } from "@/components/import-contacts";
import { duplicateCompanies, duplicateContacts } from "@/lib/duplicates";
import { tagsForContacts, workspaceTags } from "@/lib/tags";
import { ContactTags } from "@/components/contact-tags";
import { Download } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata = { title: "Contacts" };

export default async function ContactsPage({ searchParams }: { searchParams: Promise<{ open?: string; tag?: string }> }) {
  const { open: openContactId, tag: tagFilter } = await searchParams;
  const { workspaceId } = await requireTenant();
  const [rows, stageCounts, overdueAccounts, companyOptions, dupPeople, dupFirms, allTags] = await Promise.all([
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
        createdAt: contacts.createdAt,
        companyId: contacts.companyId,
        companyName: companies.name,
        arBalanceCents: companies.arBalanceCents,
        overdueCents: companies.overdueCents,
      })
      .from(contacts)
      .leftJoin(companies, and(eq(contacts.companyId, companies.id), eq(companies.workspaceId, workspaceId)))
      .where(eq(contacts.workspaceId, workspaceId))
      .orderBy(desc(contacts.lastActivityAt)),
    db
      .select({ stage: contacts.lifecycleStage, count: sql<number>`count(*)` })
      .from(contacts)
      .where(eq(contacts.workspaceId, workspaceId))
      .groupBy(contacts.lifecycleStage),
    db
      .select({ count: sql<number>`count(*)` })
      .from(companies)
      .where(and(sql`${companies.overdueCents} > 0`, eq(companies.workspaceId, workspaceId))),
    db
      .select({ id: companies.id, name: companies.name })
      .from(companies)
      .where(eq(companies.workspaceId, workspaceId))
      .orderBy(companies.name),
    duplicateContacts(workspaceId),
    duplicateCompanies(workspaceId),
    workspaceTags(workspaceId),
  ]);
  const tagsByContact = await tagsForContacts(workspaceId, rows.map((row) => row.id));
  /* A tag chip narrows the list; everything below counts the whole workspace. */
  const visible = tagFilter ? rows.filter((row) => (tagsByContact.get(row.id) ?? []).some((tag) => tag.id === tagFilter)) : rows;
  const activeTag = allTags.find((tag) => tag.id === tagFilter) ?? null;
  const tagChips = allTags.map((tag) => ({ id: tag.id, name: tag.name, color: tag.color }));
  const duplicateGroups = dupPeople.length + dupFirms.length;

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
            {activeTag ? `${visible.length} tagged “${activeTag.name}” · of ${total} people` : `${total} people · ${customerCount} belong to paying customers in the books`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a href="/api/export/contacts" download className={chip.replace("text-muted-foreground", "text-foreground")}>
            <Download className="size-3.5" />
            <span>Export CSV</span>
          </a>
          <ImportContacts className={chip.replace("text-muted-foreground", "text-foreground")} />
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
        {allTags.length > 0 && <span className="mx-1 h-5 w-px bg-[var(--rule-soft)]" aria-hidden />}
        {allTags.map((tag) => (
          <Link
            key={tag.id}
            href={tag.id === tagFilter ? "/contacts" : `/contacts?tag=${tag.id}`}
            className={`${chip} ${tag.id === tagFilter ? "border-[color-mix(in_srgb,var(--accent-primary)_35%,transparent)] bg-[var(--tint-strong)] text-foreground" : "hover:text-foreground"}`}
          >
            {tag.name} <span className="text-[var(--text-tertiary)]">{tag.count}</span>
          </Link>
        ))}
        {duplicateGroups > 0 && (
          <Link href="/contacts/duplicates" className={`${chip} ml-auto border-[color-mix(in_srgb,var(--accent-hot)_35%,transparent)] text-[#b91c1c] hover:bg-white`}>
            {duplicateGroups} possible {duplicateGroups === 1 ? "duplicate" : "duplicates"} · review
          </Link>
        )}
      </div>

      <Card index={0} className="overflow-hidden">
        <div className="grid h-10 grid-cols-[190px_150px_minmax(0,1fr)_100px_150px_56px_92px_92px_88px] items-center gap-3 border-b border-border bg-[image:var(--gradient-table-head)] px-4 text-[11px] font-semibold tracking-[0.05em] text-[var(--text-tertiary)] uppercase">
          <span>Name</span>
          <span>Company</span>
          <span>Email</span>
          <span>Stage</span>
          <span>Tags</span>
          <span>Owner</span>
          <span className="text-right">Owing</span>
          <span className="text-right">Last activity</span>
          <span className="sr-only">Actions</span>
        </div>
        {visible.map((row, i) => (
          <div
            key={row.id}
            className={`transition-colors hover:bg-[var(--tint)] grid h-[46px] grid-cols-[190px_150px_minmax(0,1fr)_100px_150px_56px_92px_92px_88px] items-center gap-3 px-4 text-[13px] ${i < visible.length - 1 ? "border-b border-[var(--rule-soft)]" : ""}`}
          >
            <ContactRecordModal contact={row} defaultOpen={row.id === openContactId}>
              <Avatar name={`${row.firstName} ${row.lastName}`} />
              <span className="truncate font-medium text-foreground">
                {row.firstName} {row.lastName}
              </span>
            </ContactRecordModal>
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
            <span className="min-w-0">
              <ContactTags contactId={row.id} tags={tagsByContact.get(row.id) ?? []} suggestions={tagChips} />
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
              <ComposeEmail variant="icon" recipients={[row]} defaultRecipientId={row.id} />
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
