"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { signUp } from "@/lib/auth-client";

const field =
  "h-10 w-full rounded-[10px] border border-[rgba(21,24,28,0.14)] bg-white px-3 text-sm text-[#15181c] outline-none focus:border-[#6b21a8]";
const label = "text-[11px] font-semibold tracking-[0.06em] uppercase text-[#6f7885]";

export default function SignUpPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const data = new FormData(e.currentTarget);
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
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="font-display text-lg font-bold tracking-[-0.4px]">
            <span className="text-foreground">APX</span>
            <span className="text-[var(--accent-primary)]">Reach</span>
          </div>
          <h1 className="mt-3 font-display text-[26px] font-bold tracking-[-0.03em] text-foreground">
            Start <span className="gradient-text-flow">reaching</span>.
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            APX team accounts only, for now.
          </p>
        </div>
        <div className="accent-rail relative overflow-hidden rounded-2xl border border-border bg-white p-6 shadow-[var(--edge-top)]">
          <form onSubmit={submit} className="flex flex-col gap-3.5">
            <div className="flex flex-col gap-1">
              <span className={label}>Name</span>
              <input name="name" required autoFocus autoComplete="name" className={field} />
            </div>
            <div className="flex flex-col gap-1">
              <span className={label}>Email</span>
              <input name="email" type="email" required placeholder="you@apxsolutions.ca" autoComplete="email" className={field} />
            </div>
            <div className="flex flex-col gap-1">
              <span className={label}>Password</span>
              <input name="password" type="password" required minLength={8} autoComplete="new-password" className={field} />
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
        <p className="mt-4 text-center text-[13px] text-muted-foreground">
          Already in?{" "}
          <Link href="/sign-in" className="font-medium text-[var(--accent-primary)]">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
