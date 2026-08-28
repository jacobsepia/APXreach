"use client";

import { useRef, useState } from "react";
import { logActivity } from "@/lib/actions";

const kinds = [
  ["note", "Note"],
  ["call", "Call"],
  ["email", "Email"],
  ["meeting", "Meeting"],
] as const;

export function TimelineComposer({ companyId }: { companyId: string }) {
  const [kind, setKind] = useState<string>("note");
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await logActivity(formData);
        formRef.current?.reset();
      }}
      className="mb-2 rounded-xl border border-[rgba(21,24,28,0.14)] bg-[#fbfcfa] p-2.5"
    >
      <input type="hidden" name="companyId" value={companyId} />
      <input type="hidden" name="type" value={kind} />
      <div className="mb-2 flex gap-1.5">
        {kinds.map(([value, name]) => (
          <button
            key={value}
            type="button"
            onClick={() => setKind(value)}
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
              kind === value
                ? "bg-[rgba(107,33,168,0.1)] text-[#15181c]"
                : "text-[#646c78] hover:bg-[rgba(107,33,168,0.05)]"
            }`}
          >
            {name}
          </button>
        ))}
      </div>
      <textarea
        name="body"
        required
        rows={2}
        placeholder="What happened?"
        className="w-full resize-none rounded-lg border border-[rgba(21,24,28,0.1)] bg-white px-3 py-2 text-[13px] text-[#15181c] outline-none focus:border-[#6b21a8]"
      />
      <div className="mt-2 flex justify-end">
        <button
          type="submit"
          className="flex h-7 items-center rounded-lg bg-[image:var(--gradient-cta)] px-3 text-xs font-medium text-white"
        >
          Log it
        </button>
      </div>
    </form>
  );
}
