"use client";
import { useFormStatus } from "react-dom";

export function CreateWorkspaceButton() {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className="mt-1 flex h-10 items-center justify-center rounded-[10px] bg-[image:var(--gradient-cta)] text-sm font-medium text-white disabled:opacity-60">
    {pending ? "Creating your workspace…" : "Create workspace"}
  </button>;
}
