import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

/*
 * The house card: white, hairline border, 16px corners, whisper of a shadow —
 * and the family signature, a 1px accent rail travelling across the top.
 * `reveal` + an optional index stagger the entrance the way Ledger's panels do.
 */
export function Card({
  className,
  children,
  index,
}: {
  className?: string;
  children: React.ReactNode;
  /** Stagger position for the entrance animation; omit for no reveal. */
  index?: number;
}) {
  return (
    <div
      className={cn(
        "accent-rail relative overflow-hidden rounded-2xl border border-border bg-white shadow-[var(--edge-top)]",
        index !== undefined && "reveal",
        className,
      )}
      style={index !== undefined ? ({ "--i": index } as React.CSSProperties) : undefined}
    >
      {children}
    </div>
  );
}

export function Caps({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "text-[11px] font-semibold tracking-[0.06em] uppercase text-[var(--text-tertiary)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

const pillStyles = {
  customer: "bg-[#eef7dd] text-[#4d7c0f]",
  opportunity: "bg-[var(--accent-plum-200)] text-[var(--accent-primary)]",
  lead: "bg-[#fef3c7] text-[#a16207]",
  overdue: "bg-[color-mix(in_srgb,var(--accent-hot)_10%,transparent)] text-[#b91c1c]",
  warning: "bg-[color-mix(in_srgb,var(--accent-warning)_10%,transparent)] text-[#b45309]",
  ledger: "bg-[#eef7dd] text-[#4d7c0f]",
} as const;

export function Pill({
  kind,
  className,
  children,
}: {
  kind: keyof typeof pillStyles;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium",
        pillStyles[kind],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StagePill({ stage }: { stage: string }) {
  const kind =
    stage === "customer" ? "customer" : stage === "opportunity" ? "opportunity" : "lead";
  const label = stage.charAt(0).toUpperCase() + stage.slice(1);
  return <Pill kind={kind}>{label}</Pill>;
}

export function Avatar({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
  return (
    <span
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent-plum-200)] text-[10px] font-semibold text-[var(--accent-primary)]",
        className,
      )}
    >
      {letters}
    </span>
  );
}

/* Lime dot — the mark that a figure comes from the connected books, not the CRM. */
export function LedgerDot({ className }: { className?: string }) {
  return (
    <span
      title="From the books"
      className={cn("inline-block size-1.5 rounded-full bg-[var(--accent-data)]", className)}
    />
  );
}

export function EmptyState({
  title,
  body,
  phase,
}: {
  title: string;
  body: string;
  phase: string;
}) {
  return (
    <Card className="flex flex-col items-start gap-2 p-6">
      <div className="font-display text-lg font-semibold text-foreground">{title}</div>
      <p className="max-w-md text-sm text-muted-foreground">{body}</p>
      <Pill kind="opportunity" className="mt-2">{phase}</Pill>
    </Card>
  );
}

/*
 * Every page opens the same way: the name in Ledger's flowing plum, one line
 * saying what the page is for, and whatever acts on it pushed to the right.
 * Having it in one place is what keeps fourteen pages reading as one product —
 * and what stops the actions wrapping into the title on a phone.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  back,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  /** A subpage's way back to its parent, above the title. */
  back?: { href: string; label: string };
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2.5">
      <div className="min-w-0">
        {back && (
          <Link
            href={back.href}
            className="mb-1 inline-flex items-center gap-1 text-xs text-[var(--text-tertiary)] transition-colors hover:text-foreground"
          >
            <ChevronLeft className="size-3" />
            {back.label}
          </Link>
        )}
        <h1 className="font-display text-xl font-bold tracking-[-0.035em] sm:text-2xl">
          <span className="gradient-text-flow">{title}</span>
        </h1>
        {subtitle && (
          <p className="mt-0.5 max-w-2xl text-[13px] leading-snug text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/*
 * A wide table on a narrow screen. The columns keep the widths that make them
 * readable and the table scrolls inside its own box, rather than the whole
 * page scrolling sideways or the columns crushing into each other. `min`
 * is the width below which the grid stops making sense.
 */
export function TableScroll({
  min,
  className,
  children,
}: {
  min: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("scroll-x-cue overflow-x-auto overscroll-x-contain", className)}>
      <div style={{ minWidth: min }}>{children}</div>
    </div>
  );
}
