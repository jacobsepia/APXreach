"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { createCompany, createContact, createDeal, createTask } from "@/lib/actions";

/*
 * The topbar's New button and the per-page Add buttons all open the same four
 * dialogs. Hand-rolled modal on purpose — one overlay, one card, no dependency;
 * Base UI arrives when the component set grows past what this needs.
 */

export type CompanyOption = { id: string; name: string };
export type StageOption = { id: string; name: string };

type Kind = "contact" | "company" | "deal" | "task";

const field =
  "h-9 w-full rounded-[10px] border border-[rgba(21,24,28,0.14)] bg-white px-3 text-[13px] text-[#15181c] outline-none focus:border-[#6b21a8]";
const label = "text-[11px] font-semibold tracking-[0.06em] uppercase text-[#6f7885]";

function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-[rgba(21,24,28,0.35)] pt-[12vh]"
      onMouseDown={(e) => {
        if (ref.current && !ref.current.contains(e.target as Node)) onClose();
      }}
    >
      <div
        ref={ref}
        className="w-[440px] rounded-2xl border border-[rgba(21,24,28,0.08)] bg-white p-5 shadow-[0_12px_40px_rgba(16,24,40,0.18)]"
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="font-display text-[15px] font-semibold text-[#15181c]">{title}</div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-[#6f7885] hover:text-[#15181c]">
            <X className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Submit({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="submit"
      className="mt-1 flex h-9 items-center justify-center gap-1.5 rounded-[10px] bg-[image:var(--gradient-cta)] px-4 text-[13px] font-medium text-white"
    >
      {children}
    </button>
  );
}

function OwnerSelect() {
  return (
    <select name="ownerName" defaultValue="Jacob S." className={field}>
      <option>Jacob S.</option>
      <option>Joseph S.</option>
    </select>
  );
}

export function QuickCreate({
  companies,
  stages,
  variant = "topbar",
  only,
  buttonLabel,
}: {
  companies: CompanyOption[];
  stages: StageOption[];
  variant?: "topbar" | "button";
  /** When set, the button opens this dialog directly instead of the menu. */
  only?: Kind;
  buttonLabel?: string;
}) {
  const [open, setOpen] = useState<Kind | null>(null);
  const [menu, setMenu] = useState(false);
  const close = () => setOpen(null);

  const companySelect = (
    <select name="companyId" defaultValue="" className={field}>
      <option value="">No company</option>
      {companies.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );

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
            <div className="flex flex-col gap-1"><span className={label}>Name</span><input name="name" required autoFocus className={field} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1"><span className={label}>Domain</span><input name="domain" placeholder="example.ca" className={field} /></div>
              <div className="flex flex-col gap-1"><span className={label}>City</span><input name="city" className={field} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1"><span className={label}>Industry</span><input name="industry" className={field} /></div>
              <div className="flex flex-col gap-1">
                <span className={label}>Stage</span>
                <select name="lifecycleStage" defaultValue="lead" className={field}>
                  <option value="lead">Lead</option>
                  <option value="opportunity">Opportunity</option>
                  <option value="customer">Customer</option>
                </select>
              </div>
            </div>
            <div className="flex flex-col gap-1"><span className={label}>Owner</span><OwnerSelect /></div>
            <Submit>Create company</Submit>
          </form>
        </Dialog>
      )}

      {open === "contact" && (
        <Dialog title="New contact" onClose={close}>
          <form action={createContact} className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1"><span className={label}>First name</span><input name="firstName" required autoFocus className={field} /></div>
              <div className="flex flex-col gap-1"><span className={label}>Last name</span><input name="lastName" className={field} /></div>
            </div>
            <div className="flex flex-col gap-1"><span className={label}>Email</span><input name="email" type="email" className={field} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1"><span className={label}>Title</span><input name="title" className={field} /></div>
              <div className="flex flex-col gap-1"><span className={label}>Phone</span><input name="phone" className={field} /></div>
            </div>
            <div className="flex flex-col gap-1"><span className={label}>Company</span>{companySelect}</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <span className={label}>Stage</span>
                <select name="lifecycleStage" defaultValue="lead" className={field}>
                  <option value="lead">Lead</option>
                  <option value="opportunity">Opportunity</option>
                  <option value="customer">Customer</option>
                </select>
              </div>
              <div className="flex flex-col gap-1"><span className={label}>Owner</span><OwnerSelect /></div>
            </div>
            <Submit>Create contact</Submit>
          </form>
        </Dialog>
      )}

      {open === "deal" && (
        <Dialog title="New deal" onClose={close}>
          <form action={createDeal} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1"><span className={label}>Deal name</span><input name="name" required autoFocus className={field} /></div>
            <div className="flex flex-col gap-1"><span className={label}>Company</span>{companySelect}</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1"><span className={label}>Amount (CAD)</span><input name="amount" inputMode="decimal" placeholder="12,000" className={field} /></div>
              <div className="flex flex-col gap-1"><span className={label}>Close date</span><input name="closeDate" type="date" className={field} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <span className={label}>Stage</span>
                <select name="stageId" defaultValue={stages[0]?.id} className={field}>
                  {stages.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1"><span className={label}>Owner</span><OwnerSelect /></div>
            </div>
            <Submit>Create deal</Submit>
          </form>
        </Dialog>
      )}

      {open === "task" && (
        <Dialog title="New task" onClose={close}>
          <form action={createTask} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1"><span className={label}>What needs doing</span><input name="subject" required autoFocus className={field} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1"><span className={label}>Due</span><input name="dueAt" type="datetime-local" className={field} /></div>
              <div className="flex flex-col gap-1"><span className={label}>Owner</span><OwnerSelect /></div>
            </div>
            <div className="flex flex-col gap-1"><span className={label}>Company</span>{companySelect}</div>
            <Submit>Create task</Submit>
          </form>
        </Dialog>
      )}
    </div>
  );
}
