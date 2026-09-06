"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { createCompany, createContact, createDeal, createTask } from "@/lib/actions";
import {
  CompanyFields,
  ContactFields,
  DealFields,
  Dialog,
  Submit,
  TaskFields,
  type CompanyOption,
  type DealValues,
  type StageOption,
} from "@/components/record-forms";

/*
 * The topbar's New button and the per-page Add buttons all open the same four
 * dialogs. Hand-rolled modal on purpose — one overlay, one card, no dependency;
 * Base UI arrives when the component set grows past what this needs. The fields
 * themselves live in record-forms, shared with the edit dialogs.
 */

export type { CompanyOption, StageOption };

type Kind = "contact" | "company" | "deal" | "task";

export function QuickCreate({
  companies,
  stages,
  variant = "topbar",
  only,
  buttonLabel,
  dealValues,
  returnTo,
}: {
  companies: CompanyOption[];
  stages: StageOption[];
  variant?: "topbar" | "button";
  /** When set, the button opens this dialog directly instead of the menu. */
  only?: Kind;
  buttonLabel?: string;
  /** Pre-filled deal fields — the company page opens "New deal" with itself chosen. */
  dealValues?: DealValues;
  /** Where to land after creating; the page the button was on, usually. */
  returnTo?: string;
}) {
  const [open, setOpen] = useState<Kind | null>(null);
  const [menu, setMenu] = useState(false);
  const close = () => setOpen(null);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => (only ? setOpen(only) : setMenu((m) => !m))}
        className="flex h-8 items-center gap-1.5 rounded-[10px] bg-[image:var(--gradient-cta)] px-3.5 text-[13px] font-medium text-white"
      >
        <Plus className="size-3.5" />
        <span>{buttonLabel ?? "New"}</span>
      </button>

      {menu && !only && (
        <div className="absolute right-0 top-10 z-40 w-44 rounded-xl border border-[rgba(21,24,28,0.08)] bg-white p-1.5 shadow-[0_8px_24px_rgba(16,24,40,0.14)]">
          {(
            [
              ["contact", "Contact"],
              ["company", "Company"],
              ["deal", "Deal"],
              ["task", "Task"],
            ] as const
          ).map(([kind, name]) => (
            <button
              key={kind}
              type="button"
              onClick={() => {
                setMenu(false);
                setOpen(kind);
              }}
              className="flex w-full items-center rounded-lg px-2.5 py-2 text-left text-[13px] font-medium text-[#15181c] hover:bg-[rgba(107,33,168,0.05)]"
            >
              {name}
            </button>
          ))}
        </div>
      )}

      {open === "company" && (
        <Dialog title="New company" onClose={close}>
          <form action={createCompany} className="flex flex-col gap-3">
            <CompanyFields />
            <Submit>Create company</Submit>
          </form>
        </Dialog>
      )}

      {open === "contact" && (
        <Dialog title="New contact" onClose={close}>
          <form action={createContact} className="flex flex-col gap-3">
            <ContactFields companies={companies} />
            <Submit>Create contact</Submit>
          </form>
        </Dialog>
      )}

      {open === "deal" && (
        <Dialog title="New deal" onClose={close}>
          <form action={createDeal} className="flex flex-col gap-3">
            {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
            <DealFields companies={companies} stages={stages} values={dealValues} />
            <Submit>Create deal</Submit>
          </form>
        </Dialog>
      )}

      {open === "task" && (
        <Dialog title="New task" onClose={close}>
          <form action={createTask} className="flex flex-col gap-3">
            <TaskFields companies={companies} />
            <Submit>Create task</Submit>
          </form>
        </Dialog>
      )}
    </div>
  );
}
