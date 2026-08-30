"use client";

import { useState } from "react";
import { signIn } from "@/lib/auth-client";

/*
 * Sign in with APX. Ledger is an OIDC provider, so the same identity opens
 * Ledger, Collect, Planner and Reach — and Reach never handles the password.
 *
 * On success the browser leaves for Ledger's consent screen and never comes
 * back to this component, so there is no success branch to write; only the
 * refusal before the redirect is worth reporting here.
 */
export function ApxSignIn({ callbackURL = "/dashboard" }: { callbackURL?: string }) {
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
          const result = await signIn.social({
            /* Registered by the genericOAuth plugin, so it is not in the
               built-in provider union the types describe. */
            provider: "apxledger" as "apple",
            callbackURL,
          });
          if (result?.error) {
            setError(result.error.message ?? "APX Ledger couldn't start the sign-in.");
            setBusy(false);
          }
        }}
        className="flex h-10 w-full items-center justify-center gap-2 rounded-[10px] border border-input bg-white text-sm font-medium text-foreground transition-colors hover:border-[#6b21a8] disabled:opacity-60"
      >
        <span
          aria-hidden
          className="size-[7px] rounded-full bg-[var(--accent-data)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent-data)_22%,transparent)]"
        />
        <span>{busy ? "Taking you to APX Ledger…" : "Sign in with APX"}</span>
      </button>
      {error && <p className="text-xs font-medium text-[#b91c1c]">{error}</p>}
    </div>
  );
}

/** The rule between the two ways in, so neither page has to word it itself. */
export function OrDivider() {
  return (
    <div className="flex items-center gap-3">
      <span className="h-px flex-1 bg-border" />
      <span className="text-[11px] font-semibold tracking-[0.06em] text-[var(--text-tertiary)] uppercase">
        or
      </span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
