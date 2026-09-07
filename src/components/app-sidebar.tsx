"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { bottomNav, mainNav, type NavItem } from "@/components/nav-items";

/*
 * The Ledger rail. Open at 252px where there is room; below xl it collapses to
 * the 68px icon rail Ledger itself uses, so a phone keeps its whole width for
 * the page instead of giving two thirds of it to navigation. The active marker
 * is the same 2px bar on the rail's own edge in both states.
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
      aria-label={item.label}
      className={cn(
        "relative flex h-9 items-center gap-3 rounded-lg px-2.5 text-sm font-medium transition-colors",
        "max-xl:justify-center max-xl:gap-0 max-xl:px-0",
        "before:absolute before:top-1/2 before:left-[-0.75rem] before:h-5 before:w-[2px] before:-translate-y-1/2 before:rounded-r before:transition-all max-xl:before:left-[-0.5rem]",
        active
          ? "text-foreground bg-[var(--tint-strong)] before:bg-[var(--accent-primary)]"
          : "text-muted-foreground hover:text-foreground hover:bg-[var(--tint)] before:bg-transparent",
      )}
    >
      <Icon className="size-[18px] shrink-0" />
      <span className="whitespace-nowrap max-xl:hidden">{item.label}</span>
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
    <aside className="sticky top-0 flex h-dvh w-[252px] shrink-0 flex-col border-r border-border bg-white px-3 max-xl:w-[var(--sidebar-collapsed)] max-xl:px-2">
      <Link
        href="/dashboard"
        className="flex h-12 items-center px-2.5 font-display text-lg font-bold tracking-[-0.4px] max-xl:justify-center max-xl:px-0"
      >
        <span className="text-foreground max-xl:hidden">APX</span>
        <span className="text-[var(--accent-primary)]">
          <span className="max-xl:hidden">Reach</span>
          <span className="hidden max-xl:inline" aria-hidden>R</span>
        </span>
        <span className="sr-only xl:hidden">APX Reach</span>
      </Link>
      <nav className="flex flex-col gap-px">
        {mainNav.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item.href)} />
        ))}
      </nav>
      <div className="mt-auto flex flex-col pb-3">
        {connectionLabel && (
          <div
            title={[connectionLabel, syncedLabel].filter(Boolean).join(" · ")}
            className="mx-0.5 mb-2.5 rounded-[10px] border border-border bg-[var(--bg-alt)] px-3 py-2 max-xl:mx-0 max-xl:flex max-xl:justify-center max-xl:border-0 max-xl:bg-transparent max-xl:p-0"
          >
            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <span className="size-[7px] shrink-0 rounded-full bg-[var(--accent-data)]" />
              <span className="max-xl:hidden">{connectionLabel}</span>
            </div>
            {syncedLabel && (
              <div className="mt-0.5 text-[11px] text-[var(--text-tertiary)] max-xl:hidden">
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
