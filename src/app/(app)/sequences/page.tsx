import Link from "next/link";
import { and, eq, gt } from "drizzle-orm";
import { companies, contacts, db, mailboxes, syncedInvoices } from "@/db";
import { requireTenant } from "@/lib/workspace";
import { money } from "@/lib/format";
import { workspaceTemplates } from "@/lib/email-template-store";
import { workspaceEnrollments, workspaceSequences } from "@/lib/sequences/store";
import { describeStep } from "@/lib/sequences/plan";
import { runSequencesNow, stopEnrollment } from "@/lib/sequences/actions";
import { Avatar, Card, Pill } from "@/components/ui";
import { EnrollSequence } from "@/components/enroll-sequence";
import { Play, Repeat } from "lucide-react";

/*
 * Sequences: the series a workspace can put someone in, and everyone who is
 * in one. The rule that makes the page trustworthy is stated on it: nothing
 * sends unless a person enrolled someone, and a series stops itself when the
 * books say paid or the customer replies.
 */

export const dynamic = "force-dynamic";

export const metadata = { title: "Sequences" };

const stamp = new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric" });

export default async function SequencesPage() {
  const { workspaceId, userId } = await requireTenant();
  const [sequences, enrollments, templates, people, invoices, [mailbox]] = await Promise.all([
    workspaceSequences(workspaceId),
    workspaceEnrollments(workspaceId),
    workspaceTemplates(workspaceId),
    db
      .select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName, email: contacts.email, companyId: contacts.companyId, companyName: companies.name })
      .from(contacts)
      .leftJoin(companies, eq(contacts.companyId, companies.id))
      .where(eq(contacts.workspaceId, workspaceId))
      .orderBy(contacts.firstName, contacts.lastName),
    db
      .select({ number: syncedInvoices.number, companyId: syncedInvoices.companyId, dueDate: syncedInvoices.dueDate, outstandingCents: syncedInvoices.outstandingCents })
      .from(syncedInvoices)
      .where(and(eq(syncedInvoices.workspaceId, workspaceId), gt(syncedInvoices.outstandingCents, 0)))
      .orderBy(syncedInvoices.dueDate),
    db
      .select({ emailAddress: mailboxes.emailAddress })
      .from(mailboxes)
      .where(and(eq(mailboxes.userId, userId), eq(mailboxes.workspaceId, workspaceId), eq(mailboxes.status, "connected")))
      .limit(1),
  ]);

  const templateName = (key: string) => templates.find((item) => item.key === key)?.name ?? key;
  const needsInvoice = (keys: string[]) => keys.some((key) => templates.find((item) => item.key === key)?.invoiceMode !== "none");
  const options = sequences.map((sequence) => ({
    id: sequence.id, name: sequence.name, kind: sequence.kind, description: sequence.description,
    stepCount: sequence.steps.length, needsInvoice: needsInvoice(sequence.steps.map((step) => step.templateKey)),
  }));
  const enrollContacts = people.map((person) => ({
    id: person.id, name: `${person.firstName} ${person.lastName}`.replace(/ —$/, "").trim(), email: person.email, companyId: person.companyId, companyName: person.companyName,
  }));
  const enrollInvoices = invoices.map((invoice) => ({ number: invoice.number, companyId: invoice.companyId, dueDate: invoice.dueDate, outstanding: money(invoice.outstandingCents) }));
  const active = enrollments.filter((row) => row.status === "active");
  const finished = enrollments.filter((row) => row.status !== "active");
  const dueNow = active.filter((row) => row.nextDueAt && row.nextDueAt <= new Date()).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-[-0.035em]">
            <span className="gradient-text-flow">Sequences</span>
          </h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Follow-ups on a schedule, from your own mailbox, that stop themselves when the books say paid or the customer replies.
            {mailbox ? ` Sending as ${mailbox.emailAddress}.` : " Connect a mailbox in Settings to enrol anyone."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <form action={runSequencesNow}>
            <button type="submit" className="flex h-8 items-center gap-1.5 rounded-[10px] border border-input bg-white px-3 text-[13px] font-medium text-foreground hover:border-[#6b21a8]" title="Runs every morning on its own; this runs anything due right now">
              <Play className="size-3.5" />
              <span>Run due steps{dueNow ? ` (${dueNow})` : ""}</span>
            </button>
          </form>
          <EnrollSequence
            contacts={enrollContacts}
            sequences={options}
            invoices={enrollInvoices}
            buttonLabel="Enrol someone"
            className="flex h-8 items-center gap-1.5 rounded-[10px] bg-[image:var(--gradient-cta)] px-3.5 text-[13px] font-medium text-white disabled:opacity-50"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 max-lg:grid-cols-1">
        {sequences.map((sequence, index) => (
          <Card key={sequence.id} index={index} className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 font-display text-[15px] font-semibold text-foreground">
                  <Repeat className="size-4 text-[var(--accent-primary)]" />
                  {sequence.name}
                </div>
                <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{sequence.description}</p>
              </div>
              <Pill kind={sequence.kind === "collections" ? "ledger" : "customer"}>{sequence.kind === "collections" ? "Collections" : "Relationship"}</Pill>
            </div>
            <ol className="mt-3 flex flex-col gap-1.5">
              {sequence.steps.map((step) => (
                <li key={step.position} className="flex items-center gap-2 text-[13px]">
                  <span className="flex size-5 items-center justify-center rounded-full bg-[var(--tint-strong)] text-[10px] font-semibold text-[var(--accent-primary)]">{step.position + 1}</span>
                  <span className="text-foreground">{describeStep(step, templateName(step.templateKey))}</span>
                </li>
              ))}
            </ol>
            <p className="mt-3 text-xs text-[var(--text-tertiary)]">
              Stops when {[sequence.stopWhenPaid && "the invoice is paid", sequence.stopOnReply && "they reply"].filter(Boolean).join(" or ")}. Templates are editable in{" "}
              <Link href="/settings/templates" className="underline">Settings</Link>.
            </p>
          </Card>
        ))}
      </div>

      <Card index={sequences.length} className="overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <div className="font-display text-[15px] font-semibold text-foreground">Enrolled</div>
          <span className="text-xs text-[var(--text-tertiary)]">{active.length} active · {finished.length} finished</span>
        </div>
        {enrollments.length === 0 ? (
          <p className="px-5 pb-5 text-[13px] text-muted-foreground">
            Nobody is enrolled yet. Use "Enrol someone" here, or "Remind automatically" beside an overdue invoice on a company page.
          </p>
        ) : (
          <div className="flex flex-col">
            <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_110px_130px_minmax(0,1fr)_80px] items-center gap-3 border-b border-[var(--rule-soft)] px-5 pb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
              <span>Who</span><span>Sequence</span><span>Progress</span><span>Next</span><span>Status</span><span className="sr-only">Actions</span>
            </div>
            {[...active, ...finished].map((row, i, all) => {
              const name = `${row.contactFirst} ${row.contactLast}`.replace(/ —$/, "").trim();
              const total = sequences.find((sequence) => sequence.id === row.sequenceId)?.steps.length ?? 0;
              return (
                <div key={row.id} className={`grid grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_110px_130px_minmax(0,1fr)_80px] items-center gap-3 px-5 py-2.5 text-[13px] ${i < all.length - 1 ? "border-b border-[var(--rule-soft)]" : ""} ${row.status !== "active" ? "opacity-70" : ""}`}>
                  <span className="flex min-w-0 items-center gap-2">
                    <Avatar name={name} className="size-6" />
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-foreground">{name}</span>
                      {row.companyId && <Link href={`/companies/${row.companyId}`} className="block truncate text-xs text-[var(--text-tertiary)] hover:text-foreground">{row.companyName}</Link>}
                    </span>
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-foreground">{row.sequenceName}</span>
                    {row.invoiceNumber && <span className="block text-xs text-[var(--text-tertiary)]">Invoice {row.invoiceNumber}</span>}
                  </span>
                  <span className="text-[var(--text-tertiary)]">{row.sentCount} of {total} sent</span>
                  <span className="text-[var(--text-tertiary)]">
                    {row.status === "active" && row.nextDueAt ? (row.nextDueAt <= new Date() ? "Due now" : stamp.format(row.nextDueAt)) : "—"}
                  </span>
                  <span className="min-w-0">
                    {row.status === "active" && row.lastError && <span className="block truncate text-xs font-medium text-[#b91c1c]" title={row.lastError}>{row.lastError}</span>}
                    {row.status === "active" && !row.lastError && <Pill kind="customer">Active</Pill>}
                    {row.status === "completed" && <span className="text-xs text-[var(--text-tertiary)]">Completed{row.endedAt ? ` ${stamp.format(row.endedAt)}` : ""}</span>}
                    {row.status === "stopped" && <span className="block truncate text-xs text-[var(--text-tertiary)]" title={row.stopReason ?? undefined}>Stopped · {row.stopReason}</span>}
                  </span>
                  <span className="flex justify-end">
                    {row.status === "active" && (
                      <form action={stopEnrollment}>
                        <input type="hidden" name="enrollmentId" value={row.id} />
                        <button type="submit" className="rounded-[8px] border border-input bg-white px-2.5 py-1 text-xs font-medium text-muted-foreground hover:border-[var(--accent-hot)] hover:text-[#b91c1c]">Stop</button>
                      </form>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
