import Link from "next/link";
import { eq } from "drizzle-orm";
import { companies, contacts, db } from "@/db";
import { requireTenant } from "@/lib/workspace";
import { money, relativeDay } from "@/lib/format";
import { supportPipeline, workspaceTickets } from "@/lib/tickets/store";
import { priorityLabels, slaHours, slaState, type Priority } from "@/lib/tickets/sla";
import { Avatar, Card, LedgerDot, Pill } from "@/components/ui";
import { ComposeEmail } from "@/components/compose-email";
import { DeleteTicket, NewTicket, TicketStageSelect } from "@/components/ticket-controls";
import { AlertTriangle, Clock, Mail } from "lucide-react";

/*
 * Tickets: support work on the same board engine as deals, in its own
 * pipeline. Two things a helpdesk usually cannot say are said on every card:
 * how the ticket stands against its service promise, and whether the person
 * asking for help owes money in the books.
 */

export const dynamic = "force-dynamic";

export const metadata = { title: "Tickets" };

const priorityTone: Record<Priority, "overdue" | "warning" | "opportunity" | "lead"> = { urgent: "overdue", high: "warning", normal: "opportunity", low: "lead" };
const slaTone = { ok: "customer", soon: "warning", breached: "overdue", done: "ledger" } as const;

export default async function TicketsPage() {
  const { workspaceId } = await requireTenant();
  const [{ stages }, rows, companyOptions, contactOptions] = await Promise.all([
    supportPipeline(workspaceId),
    workspaceTickets(workspaceId),
    db.select({ id: companies.id, name: companies.name }).from(companies).where(eq(companies.workspaceId, workspaceId)).orderBy(companies.name),
    db.select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName, companyId: contacts.companyId, email: contacts.email }).from(contacts).where(eq(contacts.workspaceId, workspaceId)).orderBy(contacts.firstName, contacts.lastName),
  ]);

  const now = new Date();
  const monthAgo = new Date(now.getTime() - 30 * 86_400_000);
  const stageOptions = stages.map((stage) => ({ id: stage.id, name: stage.name }));
  const columns = stages.map((stage) => ({
    stage,
    tickets: rows.filter((ticket) => ticket.stageId === stage.id && (stage.kind !== "won" || (ticket.resolvedAt ?? ticket.updatedAt) >= monthAgo)),
  }));
  const openTickets = rows.filter((ticket) => ticket.status === "open");
  const breaching = openTickets.filter((ticket) => slaState(ticket, now).tone === "breached").length;
  const owing = openTickets.filter((ticket) => Number(ticket.companyOverdueCents ?? 0) > 0).length;
  const people = contactOptions.map((contact) => ({ id: contact.id, name: `${contact.firstName} ${contact.lastName}`.replace(/ —$/, "").trim(), companyId: contact.companyId, email: contact.email }));

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-[-0.035em]">
            <span className="gradient-text-flow">Tickets</span>
          </h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {openTickets.length} open
            {breaching ? ` · ${breaching} past a deadline` : ""}
            {owing ? ` · ${owing} from ${owing === 1 ? "a customer who owes" : "customers who owe"} money` : ""}
            {" · "}response and resolution clocks by priority, wall-clock hours
          </p>
        </div>
        <NewTicket companies={companyOptions} contacts={people} />
      </div>

      <div className="grid grid-cols-4 items-start gap-3.5 max-lg:grid-cols-2">
        {columns.map(({ stage, tickets: stageTickets }) => (
          <div key={stage.id} className="flex flex-col gap-2.5">
            <div className="flex items-baseline justify-between px-1">
              <span className="text-xs font-semibold tracking-[0.05em] text-[var(--text-tertiary)] uppercase">{stage.kind === "won" ? "Resolved · 30 days" : stage.name}</span>
              <span className="text-xs text-[var(--text-tertiary)]">{stageTickets.length}</span>
            </div>
            {stageTickets.map((ticket) => {
              const sla = slaState(ticket, now);
              const priority = ticket.priority as Priority;
              const owes = Number(ticket.companyOverdueCents ?? 0) > 0;
              const person = ticket.contactId ? `${ticket.contactFirst} ${ticket.contactLast}`.replace(/ —$/, "").trim() : null;
              return (
                <Card key={ticket.id} className={`apx-hover flex flex-col gap-1.5 rounded-xl px-3.5 py-3 ${sla.tone === "breached" ? "border-[color-mix(in_srgb,var(--accent-hot)_35%,transparent)]" : owes ? "border-[color-mix(in_srgb,var(--accent-warning)_35%,transparent)]" : ""}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-sm font-medium text-foreground">{ticket.subject}</div>
                    <Pill kind={priorityTone[priority] ?? "opportunity"}>{priorityLabels[priority] ?? ticket.priority}</Pill>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {person ?? "No contact"}
                    {ticket.companyId && ticket.companyName && (
                      <>{" · "}<Link href={`/companies/${ticket.companyId}`} className="hover:text-foreground">{ticket.companyName}</Link></>
                    )}
                  </div>
                  {ticket.body && <p className="line-clamp-2 text-xs leading-relaxed text-[var(--text-tertiary)]">{ticket.body.replace(/^From .*\n\n/, "")}</p>}
                  <div className="flex flex-wrap gap-1.5">
                    <Pill kind={slaTone[sla.tone]} className="self-start">
                      <Clock className="size-[11px]" />
                      <span>{sla.label}</span>
                    </Pill>
                    {owes && (
                      <span title={`${money(Number(ticket.companyArCents ?? 0))} outstanding in the books`} className="self-start">
                        <Pill kind="overdue">
                          <AlertTriangle className="size-[11px]" />
                          <span>Owes {money(Number(ticket.companyOverdueCents))} overdue</span>
                          <LedgerDot />
                        </Pill>
                      </span>
                    )}
                    {ticket.emailMessageId && (
                      <Pill kind="lead" className="self-start"><Mail className="size-[11px]" /><span>From email</span></Pill>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      {ticket.status === "open" ? <TicketStageSelect ticketId={ticket.id} stageId={ticket.stageId} stages={stageOptions} /> : <span className="text-[11px] text-[var(--text-tertiary)]">Resolved {relativeDay(ticket.resolvedAt)}</span>}
                      <span className="text-[11px] text-[var(--text-tertiary)]">{relativeDay(ticket.createdAt)}</span>
                    </span>
                    <span className="flex items-center gap-1">
                      {ticket.contactId && ticket.contactEmail && (
                        <ComposeEmail
                          variant="icon"
                          recipients={[{ id: ticket.contactId, firstName: ticket.contactFirst ?? "", lastName: ticket.contactLast ?? "", email: ticket.contactEmail, companyId: ticket.companyId, companyName: ticket.companyName }]}
                          defaultRecipientId={ticket.contactId}
                          reply={{ subject: /^re:/i.test(ticket.subject) ? ticket.subject : `Re: ${ticket.subject}` }}
                          buttonLabel="Reply"
                        />
                      )}
                      {ticket.ownerName && <Avatar name={ticket.ownerName} className="size-[22px]" />}
                      <DeleteTicket ticketId={ticket.id} subject={ticket.subject} />
                    </span>
                  </div>
                </Card>
              );
            })}
            {stageTickets.length === 0 && <div className="px-1 text-xs text-[var(--text-tertiary)]">Nothing here.</div>}
          </div>
        ))}
      </div>

      <p className="text-xs text-[var(--text-tertiary)]">
        Clocks: urgent {slaHours.urgent.respond}h to respond, {slaHours.urgent.resolve / 24}d to resolve · high {slaHours.high.respond}h / {slaHours.high.resolve / 24}d · normal {slaHours.normal.respond}h / {slaHours.normal.resolve / 24}d · low {slaHours.low.respond}h / {slaHours.low.resolve / 24}d.
        Moving a ticket out of New counts as the first response. Open a ticket from any received email in the Inbox.
      </p>
    </div>
  );
}
