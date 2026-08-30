"use client";

import { useState, useTransition } from "react";
import { Pencil, Trash2 } from "lucide-react";
import {
  deleteCompany,
  deleteContact,
  deleteDeal,
  deleteTask,
  updateCompany,
  updateContact,
  updateDeal,
  updateTask,
} from "@/lib/actions";
import {
  CompanyFields,
  ContactFields,
  DealFields,
  Dialog,
  TaskFields,
  type CompanyOption,
  type CompanyValues,
  type ContactValues,
  type DealValues,
  type StageOption,
  type TaskValues,
} from "@/components/record-forms";

/*
 * Edit and delete, on every record that has them. The dialogs reuse the same
 * field sets New does, so a field added to a contact appears in both without
 * anyone remembering to do it twice.
 *
 * Deleting asks first and says what it will take with it — the schema has no
 * cascades, so the actions detach dependents rather than destroy them, and the
 * confirmation is where a person gets told that.
 */

type Kind = "company" | "contact" | "deal" | "task";

const REMOVES: Record<Kind, string> = {
  company:
    "Its contacts, deals and notes are kept — they simply stop pointing at it. A company that came from the books will return on the next sync.",
  contact: "Deals and notes that mention them are kept, and lose the link.",
  deal: "Notes attached to it are kept, and lose the link.",
  task: "The task goes for good.",
};

const UPDATE = {
  company: updateCompany,
  contact: updateContact,
  deal: updateDeal,
  task: updateTask,
} as const;

const REMOVE = {
  company: deleteCompany,
  contact: deleteContact,
  deal: deleteDeal,
  task: deleteTask,
} as const;

/**
 * `redirect()` inside a server action reports itself by throwing, so a catch
 * meant for validation errors would swallow the navigation instead. Let that
 * one back out.
 */
function isRedirect(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

type KindProps =
  | { kind: "company"; values: CompanyValues }
  | { kind: "contact"; values: ContactValues }
  | { kind: "deal"; values: DealValues }
  | { kind: "task"; values: TaskValues };

export function RecordActions(
  props: {
    id: string;
    /** What the confirmation calls it: "Delete Northshore Outfitters?" */
    name: string;
    companies?: CompanyOption[];
    stages?: StageOption[];
    /** Rows get icons; a record header gets labelled buttons. */
    variant?: "icons" | "buttons";
  } & KindProps,
) {
  const { id, name, kind, companies = [], stages = [], variant = "icons" } = props;
  const [open, setOpen] = useState<"edit" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (action: (formData: FormData) => Promise<void>) => (formData: FormData) => {
    setError(null);
    formData.set("id", id);
    start(async () => {
      try {
        await action(formData);
        setOpen(null);
      } catch (caught) {
        if (isRedirect(caught)) throw caught;
        setError(caught instanceof Error ? caught.message : "That didn't save.");
      }
    });
  };

  const close = () => {
    setOpen(null);
    setError(null);
  };

  const iconButton =
    "flex size-7 items-center justify-center rounded-lg border border-transparent text-[var(--text-tertiary)] transition-colors hover:border-[rgba(21,24,28,0.14)] hover:bg-white hover:text-foreground";
  const labelledButton =
    "flex h-8 items-center gap-1.5 rounded-[10px] border border-input bg-white px-3 text-[13px] font-medium text-foreground";

  return (
    <span className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => setOpen("edit")}
        aria-label={`Edit ${name}`}
        className={variant === "icons" ? iconButton : labelledButton}
      >
        <Pencil className="size-3.5" />
        {variant === "buttons" && <span>Edit</span>}
      </button>
      <button
        type="button"
        onClick={() => setOpen("delete")}
        aria-label={`Delete ${name}`}
        className={
          variant === "icons"
            ? `${iconButton} hover:text-[#b91c1c]`
            : `${labelledButton} text-muted-foreground hover:text-[#b91c1c]`
        }
      >
        <Trash2 className="size-3.5" />
        {variant === "buttons" && <span>Delete</span>}
      </button>

      {open === "edit" && (
        <Dialog title={`Edit ${kind}`} onClose={close}>
          <form action={run(UPDATE[kind])} className="flex flex-col gap-3">
            {kind === "company" && <CompanyFields values={props.values} />}
            {kind === "contact" && (
              <ContactFields values={props.values} companies={companies} />
            )}
            {kind === "deal" && (
              <DealFields values={props.values} companies={companies} stages={stages} />
            )}
            {kind === "task" && <TaskFields values={props.values} companies={companies} />}
            {error && <p className="text-[13px] font-medium text-[#b91c1c]">{error}</p>}
            <button
              type="submit"
              disabled={pending}
              className="mt-1 flex h-9 items-center justify-center rounded-[10px] bg-[image:var(--gradient-cta)] px-4 text-[13px] font-medium text-white disabled:opacity-60"
            >
              {pending ? "Saving…" : "Save changes"}
            </button>
          </form>
        </Dialog>
      )}

      {open === "delete" && (
        <Dialog title={`Delete ${name}?`} onClose={close}>
          <form action={run(REMOVE[kind])} className="flex flex-col gap-3">
            <p className="text-[13px] leading-relaxed text-muted-foreground">{REMOVES[kind]}</p>
            {error && <p className="text-[13px] font-medium text-[#b91c1c]">{error}</p>}
            <div className="mt-1 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={close}
                className="flex h-9 items-center rounded-[10px] border border-input bg-white px-4 text-[13px] font-medium text-foreground"
              >
                Keep it
              </button>
              <button
                type="submit"
                disabled={pending}
                className="flex h-9 items-center rounded-[10px] bg-[#b91c1c] px-4 text-[13px] font-medium text-white disabled:opacity-60"
              >
                {pending ? "Deleting…" : `Delete ${kind}`}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </span>
  );
}
