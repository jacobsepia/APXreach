import { initials } from "@/lib/format";
import { SignOutButton } from "@/components/sign-out";
import { GlobalSearch } from "@/components/global-search";
import { WorkspaceSwitcher, type WorkspaceOption } from "@/components/workspace-switcher";

/*
 * The shell's top strip. Quick-create rides in from the layout as a client
 * island; search is one too, with command-K to reach it from anywhere.
 */
export function Topbar({
  workspaces,
  activeWorkspaceId,
  userName,
  quickCreate,
}: {
  workspaces: WorkspaceOption[];
  activeWorkspaceId: string;
  userName: string;
  quickCreate?: React.ReactNode;
}) {
  return (
    <div className="sticky top-0 z-10 flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border bg-[color-mix(in_srgb,var(--bg-primary)_88%,transparent)] px-3.5 backdrop-blur sm:px-5 xl:px-7">
      <WorkspaceSwitcher workspaces={workspaces} activeId={activeWorkspaceId} />
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
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
