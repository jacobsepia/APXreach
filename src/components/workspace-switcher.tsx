"use client";

import { useEffect, useRef, useState } from "react";
import { Building2, Check, ChevronDown, Plus } from "lucide-react";
import { addWorkspace, switchWorkspace } from "@/lib/workspace-actions";

/*
 * The workspace name in the top strip, which used to be a label with a
 * decorative chevron. One account can run several businesses — each with its
 * own contacts, deals and books — and this is how you move between them.
 */

export type WorkspaceOption = { workspaceId: string; workspaceName: string; role: string };

export function WorkspaceSwitcher({ workspaces, activeId }: { workspaces: WorkspaceOption[]; activeId: string }) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const active = workspaces.find((row) => row.workspaceId === activeId) ?? workspaces[0];

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!box.current?.contains(event.target as Node)) { setOpen(false); setAdding(false); } };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-8 items-center gap-2 rounded-[10px] border border-border bg-white px-3 text-[13px] font-medium text-foreground hover:border-[#6b21a8]"
      >
        <span className="max-w-[220px] truncate">{active?.workspaceName}</span>
        <ChevronDown className="size-3.5 text-[var(--text-tertiary)]" />
      </button>

      {open && (
        <div role="menu" className="absolute left-0 top-10 z-40 w-[280px] overflow-hidden rounded-[12px] border border-[rgba(21,24,28,0.1)] bg-white p-1 shadow-[0_12px_32px_rgba(21,24,28,0.14)]">
          <p className="px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
            {workspaces.length === 1 ? "Your workspace" : "Your workspaces"}
          </p>
          {workspaces.map((row) => (
            <form key={row.workspaceId} action={switchWorkspace}>
              <input type="hidden" name="workspaceId" value={row.workspaceId} />
              <button type="submit" className="flex w-full items-center gap-2.5 rounded-[8px] px-3 py-2 text-left hover:bg-[var(--tint)]">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[var(--tint-strong)] text-[var(--accent-primary)]"><Building2 className="size-3.5" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-foreground">{row.workspaceName}</span>
                  <span className="block text-xs text-[var(--text-tertiary)]">{row.role === "owner" ? "Owner" : "Member"}</span>
                </span>
                {row.workspaceId === activeId && <Check className="size-4 shrink-0 text-[var(--accent-primary)]" />}
              </button>
            </form>
          ))}

          <div className="mt-1 border-t border-[var(--rule-soft)] pt-1">
            {adding ? (
              <form action={addWorkspace} className="flex flex-col gap-2 p-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#6f7885]">New company</span>
                <input
                  name="companyName"
                  required
                  autoFocus
                  maxLength={80}
                  placeholder="Second Business Ltd"
                  className="h-9 w-full rounded-[10px] border border-[rgba(21,24,28,0.14)] bg-white px-3 text-[13px] outline-none focus:border-[#6b21a8]"
                />
                <p className="text-xs leading-relaxed text-[var(--text-tertiary)]">
                  Its own contacts, deals and pipeline. Connect its books after — the same APX Ledger sign-in can serve several companies.
                </p>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setAdding(false)} className="h-8 rounded-[10px] border border-input bg-white px-3 text-[13px] font-medium">Cancel</button>
                  <button type="submit" className="h-8 rounded-[10px] bg-[image:var(--gradient-cta)] px-3 text-[13px] font-medium text-white">Create</button>
                </div>
              </form>
            ) : (
              <button type="button" onClick={() => setAdding(true)} className="flex w-full items-center gap-2.5 rounded-[8px] px-3 py-2 text-left text-[13px] font-medium text-foreground hover:bg-[var(--tint)]">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-dashed border-[rgba(21,24,28,0.2)] text-[var(--text-tertiary)]"><Plus className="size-3.5" /></span>
                <span>Add another company</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
