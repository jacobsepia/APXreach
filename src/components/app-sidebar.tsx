"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { bottomNav, mainNav, type NavItem } from "@/components/nav-items";

/*
 * The Ledger rail, simplified for Phase 0: pinned open at 252px. The
 * collapse-to-68px behaviour follows when the shell grows preferences.
 * The active marker is the same 2px bar on the rail's own edge.
 */

function NavLink({
  item,
  active,
}: {
  item: NavItem;
  active: boolean;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      title={item.label}
      className={cn(
        "relative flex h-9 items-center gap-3 rounded-lg px-2.5 text-sm font-medium transition-colors",
        "before:absolute before:top-1/2 before:left-[-0.75rem] before:h-5 before:w-[2px] before:-translate-y-1/2 before:rounded-r before:transition-all",
        active
          ? "text-foreground bg-[var(--tint-strong)] before:bg-[var(--accent-primary)]"
          : "text-muted-foreground hover:text-foreground hover:bg-[var(--tint)] before:bg-transparent",
      )}
    >
      <Icon className="size-[18px] shrink-0" />
      <span className="whitespace-nowrap">{item.label}</span>
    </Link>
  );
}

export function AppSidebar({
  connectionLabel,
  syncedLabel,
}: {
  connectionLabel: string | null;
  syncedLabel: string | null;
}) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <aside className="sticky top-0 flex h-screen w-[252px] shrink-0 flex-col border-r border-border bg-white px-3">
      <div className="flex h-14 items-center px-2.5 font-display text-lg font-bold tracking-[-0.4px]">
        <span className="text-foreground">APX</span>
        <span className="text-[var(--accent-primary)]">Reach</span>
      </div>
      <nav className="flex flex-col">
        {mainNav.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item.href)} />
        ))}
      </nav>
      <div className="mt-auto flex flex-col pb-3">
        {connectionLabel && (
          <div className="mx-0.5 mb-2.5 rounded-[10px] border border-border bg-[var(--bg-alt)] px-3 py-2.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <span className="size-[7px] rounded-full bg-[var(--accent-data)]" />
              <span>{connectionLabel}</span>
            </div>
            {syncedLabel && (
              <div className="mt-0.5 text-[11px] text-[var(--text-tertiary)]">
                {syncedLabel}
              </div>
            )}
          </div>
        )}
        {bottomNav.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item.href)} />
        ))}
      </div>
    </aside>
  );
}
