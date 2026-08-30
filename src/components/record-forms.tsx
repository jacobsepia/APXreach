"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

/*
 * The field sets every record dialog is built from, in one place because
 * creating a contact and correcting one are the same form with different
 * defaults. Kept apart from the dialogs themselves so New and Edit cannot
 * drift into disagreeing about what a contact has on it.
 */

export type CompanyOption = { id: string; name: string };
export type StageOption = { id: string; name: string };

export const field =
  "h-9 w-full rounded-[10px] border border-[rgba(21,24,28,0.14)] bg-white px-3 text-[13px] text-[#15181c] outline-none focus:border-[#6b21a8]";
export const label =
  "text-[11px] font-semibold tracking-[0.06em] uppercase text-[#6f7885]";

export function Dialog({
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
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-[#6f7885] hover:text-[#15181c]"
          >
            <X className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Submit({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="submit"
      className="mt-1 flex h-9 items-center justify-center gap-1.5 rounded-[10px] bg-[image:var(--gradient-cta)] px-4 text-[13px] font-medium text-white"
    >
      {children}
    </button>
  );
}

const OWNERS = ["Jacob S.", "Joseph S."];

/** Whoever already owns the record stays an option, even off the roster. */
function OwnerSelect({ value }: { value?: string | null }) {
  const options = value && !OWNERS.includes(value) ? [value, ...OWNERS] : OWNERS;
  return (
    <select name="ownerName" defaultValue={value ?? OWNERS[0]} className={field}>
      {options.map((name) => (
        <option key={name}>{name}</option>
      ))}
    </select>
  );
}

function CompanySelect({
  companies,
  value,
}: {
  companies: CompanyOption[];
  value?: string | null;
}) {
  return (
    <select name="companyId" defaultValue={value ?? ""} className={field}>
      <option value="">No company</option>
      {companies.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}

function StageSelect({ value }: { value?: string }) {
  return (
    <select name="lifecycleStage" defaultValue={value ?? "lead"} className={field}>
      <option value="lead">Lead</option>
      <option value="opportunity">Opportunity</option>
      <option value="customer">Customer</option>
    </select>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>;
}

function Field({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className={label}>{name}</span>
      {children}
    </div>
  );
}

/**
 * `datetime-local` wants "YYYY-MM-DDTHH:mm" in the viewer's own timezone, and
 * an ISO string is UTC — slicing it straight would show a due time hours off.
 */
export function toLocalDateTimeInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export type CompanyValues = {
  name?: string;
  domain?: string | null;
  city?: string | null;
  industry?: string | null;
  lifecycleStage?: string;
  ownerName?: string | null;
};

export function CompanyFields({ values = {} }: { values?: CompanyValues }) {
  return (
    <>
      <Field name="Name">
        <input name="name" required autoFocus defaultValue={values.name ?? ""} className={field} />
      </Field>
      <Row>
        <Field name="Domain">
          <input
            name="domain"
            placeholder="example.ca"
            defaultValue={values.domain ?? ""}
            className={field}
          />
        </Field>
        <Field name="City">
          <input name="city" defaultValue={values.city ?? ""} className={field} />
        </Field>
      </Row>
      <Row>
        <Field name="Industry">
          <input name="industry" defaultValue={values.industry ?? ""} className={field} />
        </Field>
        <Field name="Stage">
          <StageSelect value={values.lifecycleStage} />
        </Field>
      </Row>
      <Field name="Owner">
        <OwnerSelect value={values.ownerName} />
      </Field>
    </>
  );
}

export type ContactValues = {
  firstName?: string;
  lastName?: string;
  email?: string | null;
  title?: string | null;
  phone?: string | null;
  companyId?: string | null;
  lifecycleStage?: string;
  ownerName?: string | null;
};

export function ContactFields({
  values = {},
  companies,
}: {
  values?: ContactValues;
  companies: CompanyOption[];
}) {
  return (
    <>
      <Row>
        <Field name="First name">
          <input
            name="firstName"
            required
            autoFocus
            defaultValue={values.firstName ?? ""}
            className={field}
          />
        </Field>
        <Field name="Last name">
          {/* The create action stores "—" when this is blank; don't show it back. */}
          <input
            name="lastName"
            defaultValue={values.lastName === "—" ? "" : (values.lastName ?? "")}
            className={field}
          />
        </Field>
      </Row>
      <Field name="Email">
        <input name="email" type="email" defaultValue={values.email ?? ""} className={field} />
      </Field>
      <Row>
        <Field name="Title">
          <input name="title" defaultValue={values.title ?? ""} className={field} />
        </Field>
        <Field name="Phone">
          <input name="phone" defaultValue={values.phone ?? ""} className={field} />
        </Field>
      </Row>
      <Field name="Company">
        <CompanySelect companies={companies} value={values.companyId} />
      </Field>
      <Row>
        <Field name="Stage">
          <StageSelect value={values.lifecycleStage} />
        </Field>
        <Field name="Owner">
          <OwnerSelect value={values.ownerName} />
        </Field>
      </Row>
    </>
  );
}

export type DealValues = {
  name?: string;
  companyId?: string | null;
  /** Dollars as typed, not cents — the action parses it. */
  amount?: string;
  closeDate?: string | null;
  stageId?: string;
  ownerName?: string | null;
};

export function DealFields({
  values = {},
  companies,
  stages,
}: {
  values?: DealValues;
  companies: CompanyOption[];
  stages: StageOption[];
}) {
  return (
    <>
      <Field name="Deal name">
        <input name="name" required autoFocus defaultValue={values.name ?? ""} className={field} />
      </Field>
      <Field name="Company">
        <CompanySelect companies={companies} value={values.companyId} />
      </Field>
      <Row>
        <Field name="Amount (CAD)">
          <input
            name="amount"
            inputMode="decimal"
            placeholder="12,000"
            defaultValue={values.amount ?? ""}
            className={field}
          />
        </Field>
        <Field name="Close date">
          <input
            name="closeDate"
            type="date"
            defaultValue={values.closeDate ?? ""}
            className={field}
          />
        </Field>
      </Row>
      <Row>
        <Field name="Stage">
          <select
            name="stageId"
            defaultValue={values.stageId ?? stages[0]?.id}
            className={field}
          >
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field name="Owner">
          <OwnerSelect value={values.ownerName} />
        </Field>
      </Row>
    </>
  );
}

export type TaskValues = {
  subject?: string;
  /** An ISO instant; converted to the viewer's own clock here, on the client. */
  dueAt?: string | null;
  companyId?: string | null;
  ownerName?: string | null;
};

export function TaskFields({
  values = {},
  companies,
}: {
  values?: TaskValues;
  companies: CompanyOption[];
}) {
  return (
    <>
      <Field name="What needs doing">
        <input
          name="subject"
          required
          autoFocus
          defaultValue={values.subject ?? ""}
          className={field}
        />
      </Field>
      <Row>
        <Field name="Due">
          <input
            name="dueAt"
            type="datetime-local"
            defaultValue={toLocalDateTimeInput(values.dueAt)}
            className={field}
          />
        </Field>
        <Field name="Owner">
          <OwnerSelect value={values.ownerName} />
        </Field>
      </Row>
      <Field name="Company">
        <CompanySelect companies={companies} value={values.companyId} />
      </Field>
    </>
  );
}
