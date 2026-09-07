import { ChevronDown } from "lucide-react";
import { initials } from "@/lib/format";
import { SignOutButton } from "@/components/sign-out";
import { GlobalSearch } from "@/components/global-search";

/*
 * The shell's top strip. Quick-create rides in from the layout as a client
 * island; search is one too, with command-K to reach it from anywhere.
 */
export function Topbar({
  workspaceName,
  userName,
  quickCreate,
}: {
  workspaceName: string;
  userName: string;
  quickCreate?: React.ReactNode;
}) {
  return (
    <div className="sticky top-0 z-10 flex h-12 shrink-0 items-center justify-between border-b border-border bg-[color-mix(in_srgb,var(--bg-primary)_88%,transparent)] px-8 backdrop-blur">
      <div className="flex h-8 items-center gap-2 rounded-[10px] border border-border bg-white px-3 text-[13px] font-medium text-foreground">
        <span>{workspaceName}</span>
        <ChevronDown className="size-3.5 text-[var(--text-tertiary)]" />
      </div>
      <div className="flex items-center gap-3">
        <GlobalSearch />
        {quickCreate}
        <div
          title={userName}
          className="flex size-8 items-center justify-center rounded-full bg-[var(--accent-plum-200)] text-xs font-semibold text-[var(--accent-primary)]"
        >
          {initials(userName)}
        </div>
        <SignOutButton />
      </div>
    </div>
  );
}
