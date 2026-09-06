import Link from "next/link";
import { ledgerSignInReady } from "@/lib/auth";
import { SignUpForm } from "./sign-up-form";

export const metadata = { title: "Create an account" };

export default function SignUpPage() {
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
            Your own workspace. Sign up with APX Ledger or email.
          </p>
        </div>
        <div className="accent-rail relative overflow-hidden rounded-2xl border border-border bg-white p-6 shadow-[var(--edge-top)]">
          <SignUpForm ledgerReady={ledgerSignInReady} />
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
