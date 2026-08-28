"use client";

import { useFormStatus } from "react-dom";
import { connectLedger, syncLedgerNow } from "@/lib/actions";

function Pending({ idle, busy }: { idle: string; busy: string }) {
  const { pending } = useFormStatus();
  return <span>{pending ? busy : idle}</span>;
}

export function ConnectLedgerForm() {
  return (
    <form action={connectLedger} className="mt-3 flex items-center gap-2">
      <input
        name="apiKey"
        required
        placeholder="apx_live_…"
        autoComplete="off"
        className="h-9 flex-1 rounded-[10px] border border-[rgba(21,24,28,0.14)] bg-white px-3 font-mono text-[13px] text-[#15181c] outline-none focus:border-[#6b21a8]"
      />
      <button
        type="submit"
        className="flex h-9 items-center rounded-[10px] bg-[image:var(--gradient-cta)] px-4 text-[13px] font-medium text-white"
      >
        <Pending idle="Connect" busy="Checking the key…" />
      </button>
    </form>
  );
}

export function SyncNowButton() {
  return (
    <form action={syncLedgerNow}>
      <button
        type="submit"
        className="flex h-8 items-center rounded-[10px] border border-[rgba(21,24,28,0.14)] bg-white px-3 text-[13px] font-medium text-[#15181c] hover:border-[#6b21a8]"
      >
        <Pending idle="Sync now" busy="Walking the books…" />
      </button>
    </form>
  );
}
