"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Mail } from "lucide-react";
import { sendEmailFromRecord } from "@/lib/actions";
import { Dialog, field, label } from "@/components/record-forms";

/*
 * Compose from a record. The mail leaves from the person's own connected
 * mailbox, so the dialog says which address that is — "From" is a fact here,
 * not a field. If no mailbox is connected the dialog says so and points at
 * Settings rather than offering a form that cannot send.
 */

export type Recipient = { id: string; name: string; email: string };

export function ComposeEmail({
  companyId,
  recipients,
  /** The connected mailbox's address, or null when there is none to send from. */
  from,
  defaultRecipientId,
  defaultSubject,
  buttonLabel = "Email",
  variant = "button",
}: {
  companyId?: string;
  recipients: Recipient[];
  from: string | null;
  defaultRecipientId?: string;
  /** Pre-filled for a reply: "Re: …". */
  defaultSubject?: string;
  buttonLabel?: string;
  variant?: "button" | "icon";
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();

  const initial =
    recipients.find((r) => r.id === defaultRecipientId) ?? recipients[0] ?? null;
  const [contactId, setContactId] = useState(initial?.id ?? "");
  const [to, setTo] = useState(initial?.email ?? "");

  const close = () => {
    setOpen(false);
    setError(null);
    setSent(false);
  };

  const submit = (formData: FormData) => {
    setError(null);
    if (companyId) formData.set("companyId", companyId);
    formData.set("contactId", contactId);
    start(async () => {
      try {
        await sendEmailFromRecord(formData);
        setSent(true);
        setTimeout(close, 900);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "That didn't send.");
      }
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={buttonLabel}
        className={
          variant === "icon"
            ? "flex size-7 items-center justify-center rounded-lg border border-transparent text-[var(--text-tertiary)] transition-colors hover:border-[rgba(21,24,28,0.14)] hover:bg-white hover:text-foreground"
            : "flex h-8 items-center gap-1.5 rounded-[10px] border border-input bg-white px-3 text-[13px] font-medium text-foreground"
        }
      >
        <Mail className="size-3.5" />
        {variant === "button" && <span>{buttonLabel}</span>}
      </button>

      {open && (
        <Dialog title={defaultSubject ? "Reply" : "New email"} onClose={close}>
          {from === null ? (
            <div className="flex flex-col gap-3">
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                Reach sends as you, from your own address — there is nothing to send
                from until a mailbox is connected.
              </p>
              <Link
                href="/settings"
                className="inline-flex h-9 items-center justify-center rounded-[10px] bg-[image:var(--gradient-cta)] px-4 text-[13px] font-medium text-white"
              >
                Connect a mailbox
              </Link>
            </div>
          ) : (
            <form action={submit} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <span className={label}>From</span>
                <span className="text-[13px] text-foreground">{from}</span>
              </div>

              {recipients.length > 0 && (
                <div className="flex flex-col gap-1">
                  <span className={label}>Contact</span>
                  <select
                    value={contactId}
                    onChange={(e) => {
                      const next = recipients.find((r) => r.id === e.target.value);
                      setContactId(e.target.value);
                      if (next) setTo(next.email);
                    }}
                    className={field}
                  >
                    {recipients.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} — {r.email}
                      </option>
                    ))}
                    <option value="">Someone else</option>
                  </select>
                </div>
              )}

              <div className="flex flex-col gap-1">
                <span className={label}>To</span>
                <input
                  name="to"
                  type="email"
                  required
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  autoFocus={recipients.length === 0}
                  className={field}
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className={label}>Subject</span>
                <input
                  name="subject"
                  required
                  defaultValue={defaultSubject ?? ""}
                  autoFocus={recipients.length > 0 && !defaultSubject}
                  className={field}
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className={label}>Message</span>
                <textarea
                  name="body"
                  required
                  rows={7}
                  autoFocus={Boolean(defaultSubject)}
                  className="w-full resize-y rounded-[10px] border border-[rgba(21,24,28,0.14)] bg-white px-3 py-2 text-[13px] leading-relaxed text-[#15181c] outline-none focus:border-[#6b21a8]"
                />
              </div>

              {error && <p className="text-[13px] font-medium text-[#b91c1c]">{error}</p>}

              <button
                type="submit"
                disabled={pending || sent}
                className="mt-1 flex h-9 items-center justify-center rounded-[10px] bg-[image:var(--gradient-cta)] px-4 text-[13px] font-medium text-white disabled:opacity-60"
              >
                {sent ? "Sent" : pending ? "Sending…" : "Send"}
              </button>
            </form>
          )}
        </Dialog>
      )}
    </>
  );
}
