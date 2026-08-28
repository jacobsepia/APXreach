import { ChevronDown, Search } from "lucide-react";

/*
 * The shell's top strip. Quick-create rides in from the layout as a client
 * island; search stays furniture until command-K lands.
 */
export function Topbar({
  workspaceName,
  quickCreate,
}: {
  workspaceName: string;
  quickCreate?: React.ReactNode;
}) {
  return (
    <div className="sticky top-0 z-10 flex h-12 shrink-0 items-center justify-between border-b border-border bg-[color-mix(in_srgb,var(--bg-primary)_88%,transparent)] px-8 backdrop-blur">
      <div className="flex h-8 items-center gap-2 rounded-[10px] border border-border bg-white px-3 text-[13px] font-medium text-foreground">
        <span>{workspaceName}</span>
        <ChevronDown className="size-3.5 text-[var(--text-tertiary)]" />
      </div>
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-[260px] items-center gap-2 rounded-[10px] border border-input bg-white px-3 text-[13px] text-[var(--text-tertiary)]">
          <Search className="size-[15px]" />
          <span>Search people, companies, deals</span>
        </div>
        {quickCreate}
        <div className="flex size-8 items-center justify-center rounded-full bg-[var(--accent-plum-200)] text-xs font-semibold text-[var(--accent-primary)]">
          JS
        </div>
      </div>
    </div>
  );
}
