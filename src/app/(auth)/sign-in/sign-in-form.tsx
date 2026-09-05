"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { signIn } from "@/lib/auth-client";
import { safeAuthDestination } from "@/lib/auth-redirect";
import { ApxSignIn, OrDivider } from "@/components/apx-sign-in";

const field =
  "h-10 w-full rounded-[10px] border border-[rgba(21,24,28,0.14)] bg-white px-3 text-sm text-[#15181c] outline-none focus:border-[#6b21a8]";
const label = "text-[11px] font-semibold tracking-[0.06em] uppercase text-[#6f7885]";

export function SignInForm({ ledgerReady }: { ledgerReady: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /* Where the route guard wanted to send them before it asked who they were. */
  const destination = safeAuthDestination(params.get("to"));

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const data = new FormData(e.currentTarget);
    try {
    const result = await signIn.email({
      email: String(data.get("email") ?? ""),
      password: String(data.get("password") ?? ""),
    });
    setBusy(false);
    if (result.error) {
      setError(result.error.message ?? "That didn't work — check the email and password.");
      return;
    }
    router.push(destination);
    router.refresh();
    } catch {
      setError("Could not reach Reach. Please try signing in again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3.5">
      {ledgerReady && (
        <>
          <ApxSignIn callbackURL={destination} />
          <OrDivider />
        </>
      )}
      <form onSubmit={submit} className="flex flex-col gap-3.5">
        <div className="flex flex-col gap-1">
          <span className={label}>Email</span>
          <input
            name="email"
            type="email"
            required
            autoFocus
            autoComplete="email"
            className={field}
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className={label}>Password</span>
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className={field}
          />
        </div>
        {error && <p className="text-xs font-medium text-[#b91c1c]">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="mt-1 flex h-10 items-center justify-center rounded-[10px] bg-[image:var(--gradient-cta)] text-sm font-medium text-white disabled:opacity-60"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
