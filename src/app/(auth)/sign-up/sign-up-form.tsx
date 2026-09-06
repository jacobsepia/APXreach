"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { signUp } from "@/lib/auth-client";
import { ApxSignIn, OrDivider } from "@/components/apx-sign-in";

const field =
  "h-10 w-full rounded-[10px] border border-[rgba(21,24,28,0.14)] bg-white px-3 text-sm text-[#15181c] outline-none focus:border-[#6b21a8]";
const label = "text-[11px] font-semibold tracking-[0.06em] uppercase text-[#6f7885]";

export function SignUpForm({ ledgerReady }: { ledgerReady: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const data = new FormData(e.currentTarget);
    try {
    const result = await signUp.email({
      name: String(data.get("name") ?? ""),
      email: String(data.get("email") ?? ""),
      password: String(data.get("password") ?? ""),
    });
    setBusy(false);
    if (result.error) {
      setError(result.error.message ?? "That didn't work.");
      return;
    }
    router.push("/welcome");
    router.refresh();
    } catch {
      setError("Could not reach Reach. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3.5">
      {ledgerReady && (
        <>
          {/* Same button, and on a first arrival it makes the account. */}
          <ApxSignIn />
          <OrDivider />
        </>
      )}
      <form onSubmit={submit} className="flex flex-col gap-3.5">
        <div className="flex flex-col gap-1">
          <span className={label}>Name</span>
          <input name="name" required autoComplete="name" className={field} />
        </div>
        <div className="flex flex-col gap-1">
          <span className={label}>Email</span>
          <input
            name="email"
            type="email"
            required
            placeholder="you@company.com"
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
            minLength={8}
            autoComplete="new-password"
            className={field}
          />
        </div>
        {error && <p className="text-xs font-medium text-[#b91c1c]">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="mt-1 flex h-10 items-center justify-center rounded-[10px] bg-[image:var(--gradient-cta)] text-sm font-medium text-white disabled:opacity-60"
        >
          {busy ? "Creating the account…" : "Create account"}
        </button>
      </form>
    </div>
  );
}
