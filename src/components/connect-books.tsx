"use client";

import { useFormStatus } from "react-dom";
import { disconnectBooks, syncNow } from "@/lib/actions";

function Pending({ idle, busy }: { idle: string; busy: string }) {
  const { pending } = useFormStatus();
  return <span>{pending ? busy : idle}</span>;
}

export function SyncNowButton() {
  return (
    <form action={syncNow}>
      <button
        type="submit"
        className="flex h-8 items-center rounded-[10px] border border-[rgba(21,24,28,0.14)] bg-white px-3 text-[13px] font-medium text-[#15181c] hover:border-[#6b21a8]"
      >
        <Pending idle="Sync now" busy="Walking the books…" />
      </button>
    </form>
  );
}

export function DisconnectButton({ label }: { label: string }) {
  return (
    <form action={disconnectBooks}>
      <button
        type="submit"
        className="flex h-8 items-center rounded-[10px] border border-[rgba(21,24,28,0.14)] bg-white px-3 text-[13px] font-medium text-muted-foreground hover:border-[var(--accent-hot)] hover:text-[#b91c1c]"
      >
        <Pending idle={`Disconnect ${label}`} busy="Revoking…" />
      </button>
    </form>
  );
}
