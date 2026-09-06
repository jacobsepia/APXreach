"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Mail } from "lucide-react";
import { ContactRecordModal, type ContactRecord, type ReplyPrefill } from "./contact-record-modal";

/*
 * Every "Email" button in Reach opens the same composer: the one on the
 * contact record, with templates, tones, attachments and the signature. This
 * is only the button. One recipient opens the composer straight away; several
 * show a short list to pick from first; none means there is nobody on the
 * record to write to, and the button says so instead of offering a blank form.
 */

export type Recipient = ContactRecord;

const buttonClass =
  "flex h-8 items-center gap-1.5 rounded-[10px] border border-input bg-white px-3 text-[13px] font-medium text-foreground hover:border-[#6b21a8]";
const iconClass =
  "flex size-7 items-center justify-center rounded-lg border border-transparent text-[var(--text-tertiary)] transition-colors hover:border-[rgba(21,24,28,0.14)] hover:bg-white hover:text-foreground";

export function ComposeEmail({
  recipients,
  defaultRecipientId,
  reply,
  buttonLabel = "Email",
  variant = "button",
}: {
  recipients: Recipient[];
  defaultRecipientId?: string;
  /** Pre-filled for a reply: the subject and the message being answered. */
  reply?: ReplyPrefill;
  buttonLabel?: string;
  variant?: "button" | "icon";
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pickerOpen) return;
    const close = (event: MouseEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) setPickerOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [pickerOpen]);

  const withEmail = recipients.filter((recipient) => recipient.email);
  const preferred =
    withEmail.find((recipient) => recipient.id === defaultRecipientId) ??
    (withEmail.length === 1 ? withEmail[0] : null);
  const className = variant === "icon" ? iconClass : buttonClass;
  const face = (
    <>
      <Mail className="size-3.5" />
      {variant === "button" && <span>{buttonLabel}</span>}
    </>
  );

  if (withEmail.length === 0) {
    return (
      <button type="button" disabled className={`${className} cursor-not-allowed opacity-50`} title="Add a contact with an email address first">
        {face}
      </button>
    );
  }

  if (preferred) {
    return (
      <ContactRecordModal contact={preferred} initialView="compose" reply={reply} triggerClassName={className} triggerLabel={buttonLabel}>
        {face}
      </ContactRecordModal>
    );
  }

  /* Several people on the record: pick one, then the composer opens for them.
     The list stays mounted while hidden, because the composer each item opens
     lives inside it. */
  return (
    <div ref={pickerRef} className="relative">
      <button type="button" className={className} aria-haspopup="menu" aria-expanded={pickerOpen} onClick={() => setPickerOpen((value) => !value)}>
        {face}
        {variant === "button" && <ChevronDown className="size-3.5 text-[var(--text-tertiary)]" />}
      </button>
      <div
        role="menu"
        hidden={!pickerOpen}
        onClick={() => setPickerOpen(false)}
        className="absolute right-0 top-9 z-20 min-w-[250px] rounded-[12px] border border-[rgba(21,24,28,0.1)] bg-white p-1 shadow-[0_12px_32px_rgba(21,24,28,0.12)]"
      >
        <p className="px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)]">Write to</p>
        {withEmail.map((recipient) => (
          <ContactRecordModal
            key={recipient.id}
            contact={recipient}
            initialView="compose"
            reply={reply}
            triggerClassName="flex w-full flex-col items-start rounded-[8px] px-3 py-2 text-left hover:bg-[var(--tint)]"
            triggerLabel={`Email ${recipient.firstName} ${recipient.lastName}`.trim()}
          >
            <span className="text-[13px] font-medium text-foreground">{`${recipient.firstName} ${recipient.lastName}`.replace(/ —$/, "").trim()}</span>
            <span className="text-xs text-[var(--text-tertiary)]">{recipient.email}</span>
          </ContactRecordModal>
        ))}
      </div>
    </div>
  );
}
