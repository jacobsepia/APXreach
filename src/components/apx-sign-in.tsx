"use client";

import { useState } from "react";
import { signInWithApx } from "@/lib/auth-client";

/*
 * The other front door. Identity scopes only — this proves who you are, it
 * does not reach into anybody's books. Connecting a ledger is a separate
 * consent, later, from Settings.
 */
export function ApxSignInButton({ label = "Continue with APX Ledger" }: { label?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            window.location.href = await signInWithApx();
          } catch (e) {
            setError(e instanceof Error ? e.message : "That didn't work.");
            setBusy(false);
          }
        }}
        className="flex h-10 w-full items-center justify-center gap-2 rounded-[10px] border border-[rgba(21,24,28,0.14)] bg-white text-sm font-medium text-[#15181c] hover:border-[#6b21a8] disabled:opacity-60"
      >
        <span className="font-display text-[13px] font-bold tracking-[-0.2px]">
          <span className="text-[#15181c]">APX</span>
          <span className="text-[var(--accent-primary)]">Ledger</span>
        </span>
        <span>{busy ? "Taking you there…" : label}</span>
      </button>
      {error && <p className="text-xs font-medium text-[#b91c1c]">{error}</p>}
      <div className="flex items-center gap-3 py-0.5">
        <span className="h-px flex-1 bg-[var(--rule-soft)]" />
        <span className="text-[11px] tracking-[0.06em] text-[var(--text-tertiary)] uppercase">
          or
        </span>
        <span className="h-px flex-1 bg-[var(--rule-soft)]" />
      </div>
    </div>
  );
}
