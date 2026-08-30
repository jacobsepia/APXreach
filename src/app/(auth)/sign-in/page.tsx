import Link from "next/link";
import { Suspense } from "react";
import { ledgerSignInReady } from "@/lib/auth";
import { SignInForm } from "./sign-in-form";

export const metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="font-display text-lg font-bold tracking-[-0.4px]">
            <span className="text-foreground">APX</span>
            <span className="text-[var(--accent-primary)]">Reach</span>
          </div>
          <h1 className="mt-3 font-display text-[26px] font-bold tracking-[-0.03em] text-foreground">
            Back to the <span className="gradient-text-flow">pipeline</span>.
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Sign in to see what the books are telling you.
          </p>
        </div>
        <div className="accent-rail relative overflow-hidden rounded-2xl border border-border bg-white p-6 shadow-[var(--edge-top)]">
          <Suspense>
            <SignInForm ledgerReady={ledgerSignInReady} />
          </Suspense>
        </div>
        <p className="mt-4 text-center text-[13px] text-muted-foreground">
          New here?{" "}
          <Link href="/sign-up" className="font-medium text-[var(--accent-primary)]">
            Create an account
          </Link>
        </p>
        {ledgerSignInReady && (
          <p className="mt-2 text-center text-xs text-[var(--text-tertiary)]">
            One APX login opens Ledger, Collect, Planner and Reach.
          </p>
        )}
      </div>
    </main>
  );
}
