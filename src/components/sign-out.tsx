"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { signOut } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      title="Sign out"
      aria-label="Sign out"
      onClick={async () => {
        await signOut();
        router.push("/sign-in");
        router.refresh();
      }}
      className="flex size-8 items-center justify-center rounded-[10px] text-[var(--text-tertiary)] transition-colors hover:bg-[var(--tint)] hover:text-foreground"
    >
      <LogOut className="size-4" />
    </button>
  );
}
