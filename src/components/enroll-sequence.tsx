"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Repeat } from "lucide-react";
import { Dialog, field, label } from "@/components/record-forms";
import { enrollInSequence, type EnrollOutcome } from "@/lib/sequences/actions";

/*
 * "Remind automatically" and "Enrol someone": pick the person, the series,
 * and the invoice if it is a chase, then see what will happen before it does.
 */

export type EnrollContact = { id: string; name: string; email: string | null; companyId: string | null; companyName: string | null };
export type EnrollSequenceOption = { id: string; name: string; kind: string; description: string; stepCount: number; needsInvoice: boolean };
export type EnrollInvoice = { number: string; companyId: string; dueDate: string; outstanding: string };

export function EnrollSequence({
  contacts,
  sequences,
  invoices,
  defaults,
  buttonLabel = "Enrol in a sequence",
  className,
}: {
  contacts: EnrollContact[];
  sequences: EnrollSequenceOption[];
  invoices: EnrollInvoice[];
  defaults?: { contactId?: string; sequenceId?: string; invoiceNumber?: string };
  buttonLabel?: string;
  className: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<EnrollOutcome | null>(null);
  const router = useRouter();

  const withEmail = contacts.filter((contact) => contact.email);
  const [contactId, setContactId] = useState(defaults?.contactId ?? withEmail[0]?.id ?? "");
  const [sequenceId, setSequenceId] = useState(defaults?.sequenceId ?? sequences[0]?.id ?? "");
  const [invoiceNumber, setInvoiceNumber] = useState(defaults?.invoiceNumber ?? "");

  const contact = withEmail.find((item) => item.id === contactId) ?? null;
  const sequence = sequences.find((item) => item.id === sequenceId) ?? null;
  const companyInvoices = invoices.filter((invoice) => contact?.companyId && invoice.companyId === contact.companyId);
  const invoiceChosen = companyInvoices.some((invoice) => invoice.number === invoiceNumber) ? invoiceNumber : "";

  const close = () => { setOpen(false); setResult(null); setBusy(false); };
  const submit = async () => {
    if (busy || !contact || !sequence) return;
    setBusy(true); setResult(null);
    const form = new FormData();
    form.set("contactId", contact.id); form.set("sequenceId", sequence.id); form.set("invoiceNumber", invoiceChosen);
    const outcome = await enrollInSequence(form);
    setBusy(false); setResult(outcome);
    if (outcome.ok) router.refresh();
  };

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)} disabled={!withEmail.length || !sequences.length} title={withEmail.length ? undefined : "Add a contact with an email address first"}>
        <Repeat className="size-3.5" />
        <span>{buttonLabel}</span>
      </button>
      {open && (
        <Dialog title="Enrol in a sequence" onClose={close}>
          {result?.ok ? (
            <div className="flex flex-col gap-3 text-[13px]">
              <p role="status" className="rounded-[10px] bg-[color-mix(in_srgb,var(--accent-data)_18%,transparent)] px-3 py-2 text-[#3f6212]">{result.message}</p>
              <button type="button" onClick={close} className="h-9 self-end rounded-[10px] bg-[image:var(--gradient-cta)] px-4 text-[13px] font-medium text-white">Done</button>
            </div>
          ) : (
            <div className="flex flex-col gap-3 text-[13px]">
              <div className="flex flex-col gap-1">
                <span className={label}>Who</span>
                <select className={field} value={contactId} disabled={busy} onChange={(event) => { setContactId(event.target.value); setInvoiceNumber(""); }}>
                  {withEmail.map((item) => <option key={item.id} value={item.id}>{item.name}{item.companyName ? ` — ${item.companyName}` : ""} · {item.email}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <span className={label}>Sequence</span>
                <select className={field} value={sequenceId} disabled={busy} onChange={(event) => setSequenceId(event.target.value)}>
                  {sequences.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.stepCount} {item.stepCount === 1 ? "email" : "emails"}</option>)}
                </select>
                {sequence && <p className="text-xs leading-relaxed text-muted-foreground">{sequence.description}</p>}
              </div>
              {sequence?.needsInvoice && (
                <div className="flex flex-col gap-1">
                  <span className={label}>Invoice</span>
                  {companyInvoices.length ? (
                    <select className={field} value={invoiceChosen} disabled={busy} onChange={(event) => setInvoiceNumber(event.target.value)}>
                      <option value="">Whichever is most overdue at each step</option>
                      {companyInvoices.map((invoice) => <option key={invoice.number} value={invoice.number}>{invoice.number} · {invoice.outstanding} · due {invoice.dueDate}</option>)}
                    </select>
                  ) : (
                    <p className="text-xs text-[#a66a29]">No open invoices in the books for {contact?.companyName ?? "this contact's company"}. A collections series stops right away with nothing to chase.</p>
                  )}
                </div>
              )}
              <p className="rounded-[10px] bg-[#fdfbff] px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                Sent from your connected mailbox, on schedule, in your name. Stops on its own {sequence?.kind === "collections" ? "when the books show the invoice paid, or " : ""}when they reply. You can stop it any time from the Sequences page.
              </p>
              {result && !result.ok && <p role="alert" className="rounded-[10px] bg-[#fff4e9] px-3 py-2 text-[#a66a29]">{result.error}</p>}
              <div className="mt-1 flex justify-end gap-2">
                <button type="button" onClick={close} className="h-9 rounded-[10px] border border-[rgba(21,24,28,0.14)] bg-white px-4 text-[13px] font-medium text-foreground">Cancel</button>
                <button type="button" disabled={busy || !contact || !sequence} onClick={() => void submit()} className="flex h-9 items-center gap-1.5 rounded-[10px] bg-[image:var(--gradient-cta)] px-4 text-[13px] font-medium text-white disabled:opacity-50">
                  {busy && <LoaderCircle className="size-3.5 animate-spin" />}
                  {busy ? "Enrolling…" : "Enrol and start"}
                </button>
              </div>
            </div>
          )}
        </Dialog>
      )}
    </>
  );
}
