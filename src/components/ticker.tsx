import Link from "next/link";

/*
 * A ticker of the figures that describe the pipeline and the books right now —
 * the same strip Ledger runs, carried into Reach. 28px, full width, always
 * saying something true; the first thing that tells you the app is live.
 *
 * The list is duplicated in the DOM and the track travels exactly half its
 * width, which makes the loop seamless. The copy is aria-hidden so a screen
 * reader is not read the same figures twice, and hovering pauses it.
 */

export interface TickerItem {
  label: string;
  value: string;
  href: string;
  /** ok = green, warn = amber, alert = red, plain = default. */
  tone?: "ok" | "warn" | "alert" | "plain";
  /** True for figures that come from APX Ledger — they carry the lime dot. */
  ledger?: boolean;
}

const TONE: Record<string, string> = {
  ok: "text-[var(--accent-success)]",
  warn: "text-[var(--accent-warning)]",
  alert: "text-[var(--accent-hot)]",
  plain: "text-foreground",
};

function Cell({ item }: { item: TickerItem }) {
  return (
    <Link
      href={item.href}
      className="group flex h-[var(--ticker)] shrink-0 items-center gap-2 border-r border-[var(--rule)] px-4"
    >
      {item.ledger && (
        <span className="size-1.5 shrink-0 rounded-full bg-[var(--accent-data)]" />
      )}
      <span className="metric-label transition-colors group-hover:text-[var(--accent-primary)]">
        {item.label}
      </span>
      <span
        className={
          "text-xs font-bold tabular-nums " + (TONE[item.tone ?? "plain"] ?? TONE.plain)
        }
      >
        {item.value}
      </span>
    </Link>
  );
}

export function Ticker({ items }: { items: TickerItem[] }) {
  if (items.length === 0) return null;

  return (
    <div className="ticker-rail relative overflow-hidden border-b border-[var(--rule)] bg-[var(--surface-sunken)]">
      <div className="ticker-track">
        {items.map((item) => (
          <Cell key={item.label} item={item} />
        ))}
        <div className="flex" aria-hidden>
          {items.map((item) => (
            <Cell key={`dup-${item.label}`} item={item} />
          ))}
        </div>
      </div>

      {/* The track runs under these, so figures fade at the edges rather than
          being sliced off by the overflow. */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-[var(--surface-sunken)] to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-[var(--surface-sunken)] to-transparent" />
    </div>
  );
}
