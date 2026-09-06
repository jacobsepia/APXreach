"use client";

import { useState } from "react";
import { Phone } from "lucide-react";
import { logActivity } from "@/lib/actions";
import { Dialog, Submit } from "@/components/record-forms";

/*
 * "Log call" on a company: the same timeline entry the composer at the
 * bottom of the page writes, from the button at the top where the person
 * is looking when they put the phone down.
 */

export function LogCall({ companyId, className }: { companyId: string; className: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        <Phone className="size-3.5" />
        <span>Log call</span>
      </button>
      {open && (
        <Dialog title="Log a call" onClose={() => setOpen(false)}>
          <form
            action={async (formData) => { await logActivity(formData); setOpen(false); }}
            className="flex flex-col gap-3"
          >
            <input type="hidden" name="companyId" value={companyId} />
            <input type="hidden" name="type" value="call" />
            <textarea
              name="body"
              required
              autoFocus
              rows={4}
              placeholder="Who you spoke to, what was said, what happens next."
              className="w-full resize-y rounded-[10px] border border-[rgba(21,24,28,0.14)] bg-white px-3 py-2 text-[13px] text-[#15181c] outline-none focus:border-[#6b21a8]"
            />
            <Submit>Log call</Submit>
          </form>
        </Dialog>
      )}
    </>
  );
}
