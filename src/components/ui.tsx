import { cn } from "@/lib/utils";

/* The house card: white, hairline border, 16px corners, whisper of a shadow. */
export function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-white shadow-[var(--edge-top)]",
        className,
      )}
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

/* Lime dot — the mark that a figure comes from APX Ledger, not from the CRM. */
export function LedgerDot({ className }: { className?: string }) {
  return (
    <span
      title="From APX Ledger"
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
    <Card className="flex flex-col items-start gap-2 p-8">
      <div className="font-display text-lg font-semibold text-foreground">{title}</div>
      <p className="max-w-md text-sm text-muted-foreground">{body}</p>
      <Pill kind="opportunity" className="mt-2">{phase}</Pill>
    </Card>
  );
}
