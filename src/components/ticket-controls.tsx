"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Plus, Ticket as TicketIcon, Trash2 } from "lucide-react";
import { Dialog, field, label } from "@/components/record-forms";
import { createTicket, createTicketFromEmail, deleteTicket, setTicketStage } from "@/lib/tickets/actions";
import { priorities, priorityLabels } from "@/lib/tickets/sla";

/*
 * The client-side pieces of the ticket board: the stage mover on each card,
 * the "New ticket" dialog, a delete with a confirm, and the Inbox's
 * "Make a ticket" button.
 */

export function TicketStageSelect({ ticketId, stageId, stages }: { ticketId: string; stageId: string; stages: { id: string; name: string }[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form ref={formRef} action={setTicketStage}>
      <input type="hidden" name="ticketId" value={ticketId} />
      <select
        name="stageId"
        defaultValue={stageId}
        onChange={() => formRef.current?.requestSubmit()}
        aria-label="Move to stage"
        className="h-6 max-w-[150px] rounded-md border border-[rgba(21,24,28,0.14)] bg-white px-1 text-[11px] text-[#646c78] outline-none focus:border-[#6b21a8]"
      >
        {stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
      </select>
    </form>
  );
}

export function DeleteTicket({ ticketId, subject }: { ticketId: string; subject: string }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setConfirm(true)} aria-label={`Delete ticket ${subject}`} className="flex size-6 items-center justify-center rounded-md text-[var(--text-tertiary)] hover:bg-white hover:text-[#b91c1c]">
        <Trash2 className="size-3.5" />
      </button>
      {confirm && (
        <Dialog title="Delete this ticket?" onClose={() => setConfirm(false)}>
          <p className="text-[13px] text-muted-foreground">“{subject}” is removed from the board. The note on the company's timeline stays.</p>
          <form action={deleteTicket} className="mt-4 flex justify-end gap-2">
            <input type="hidden" name="ticketId" value={ticketId} />
            <button type="button" onClick={() => setConfirm(false)} className="h-9 rounded-[10px] border border-[rgba(21,24,28,0.14)] bg-white px-4 text-[13px] font-medium">Keep</button>
            <button type="submit" className="h-9 rounded-[10px] bg-[#b91c1c] px-4 text-[13px] font-medium text-white">Delete</button>
          </form>
        </Dialog>
      )}
    </>
  );
}

export type TicketCompany = { id: string; name: string };
export type TicketContact = { id: string; name: string; companyId: string | null; email: string | null };

export function NewTicket({ companies, contacts }: { companies: TicketCompany[]; contacts: TicketContact[] }) {
  const [open, setOpen] = useState(false);
  const [companyId, setCompanyId] = useState("");
  const [contactId, setContactId] = useState("");
  const people = contacts.filter((contact) => !companyId || contact.companyId === companyId);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex h-8 items-center gap-1.5 rounded-[10px] bg-[image:var(--gradient-cta)] px-3.5 text-[13px] font-medium text-white">
        <Plus className="size-3.5" />
        <span>New ticket</span>
      </button>
      {open && (
        <Dialog title="New ticket" onClose={() => setOpen(false)}>
          <form action={async (form) => { await createTicket(form); setOpen(false); }} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <span className={label}>Subject</span>
              <input name="subject" required autoFocus maxLength={300} className={field} placeholder="What is the customer asking for?" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <span className={label}>Priority</span>
                <select name="priority" defaultValue="normal" className={field}>
                  {priorities.map((priority) => <option key={priority} value={priority}>{priorityLabels[priority]}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <span className={label}>Company</span>
                <select name="companyId" value={companyId} onChange={(event) => { setCompanyId(event.target.value); setContactId(""); }} className={field}>
                  <option value="">None</option>
                  {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
                </select>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className={label}>Raised by</span>
              <select name="contactId" value={contactId} onChange={(event) => setContactId(event.target.value)} className={field}>
                <option value="">Nobody in particular</option>
                {people.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}{contact.email ? ` · ${contact.email}` : ""}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <span className={label}>Details</span>
              <textarea name="body" rows={4} maxLength={20000} className="w-full resize-y rounded-[10px] border border-[rgba(21,24,28,0.14)] bg-white px-3 py-2 text-[13px] text-[#15181c] outline-none focus:border-[#6b21a8]" placeholder="What happened, what they need, anything already tried." />
            </div>
            <button type="submit" className="mt-1 flex h-9 items-center justify-center gap-1.5 rounded-[10px] bg-[image:var(--gradient-cta)] px-4 text-[13px] font-medium text-white">Open ticket</button>
          </form>
        </Dialog>
      )}
    </>
  );
}

export function MakeTicket({ messageId, ticketId, className }: { messageId: string; ticketId: string | null; className: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  if (ticketId) {
    return <a href="/tickets" className={className} title="This email already has a ticket on the board"><TicketIcon className="size-3.5" /><span>Ticket open</span></a>;
  }
  return (
    <span className="flex items-center gap-2">
      {error && <span role="alert" className="text-xs text-[#b91c1c]">{error}</span>}
      <button
        type="button"
        disabled={busy}
        className={className}
        title="Open a support ticket from this email"
        onClick={async () => {
          setBusy(true); setError(null);
          const outcome = await createTicketFromEmail(messageId);
          setBusy(false);
          if (outcome.ok) router.push("/tickets");
          else setError(outcome.error);
        }}
      >
        {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : <TicketIcon className="size-3.5" />}
        <span>{busy ? "Opening…" : "Make a ticket"}</span>
      </button>
    </span>
  );
}
