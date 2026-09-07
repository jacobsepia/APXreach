"use client";

import { useRef } from "react";
import { linkDealInvoice } from "@/lib/actions";

/*
 * On a won deal with no invoice yet: pick the one the books raised for it.
 * The sync links these itself when company, amount and timing agree; this
 * is the backup for the ones it could not be sure about.
 */
export function LinkInvoice({ dealId, invoices }: { dealId: string; invoices: { number: string; label: string }[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  if (!invoices.length) return <span className="text-[11px] text-[var(--text-tertiary)]">No open invoice in the books yet</span>;
  return (
    <form ref={formRef} action={linkDealInvoice}>
      <input type="hidden" name="dealId" value={dealId} />
      <select
        name="invoiceNumber"
        defaultValue=""
        onChange={() => formRef.current?.requestSubmit()}
        aria-label="Link the invoice raised for this deal"
        className="h-6 max-w-[170px] rounded-md border border-[rgba(21,24,28,0.14)] bg-white px-1 text-[11px] text-[#646c78] outline-none focus:border-[#6b21a8]"
      >
        <option value="">Link invoice…</option>
        {invoices.map((invoice) => <option key={invoice.number} value={invoice.number}>{invoice.label}</option>)}
      </select>
    </form>
  );
}
