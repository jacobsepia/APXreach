/*
 * Money and dates, formatted the way the Ledger family does it: figures in
 * whole dollars unless cents matter, dates as people say them.
 */

const cad = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});

export function money(cents: number): string {
  return cad.format(Math.round(cents / 100));
}

const day = new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric" });
const monthYearFmt = new Intl.DateTimeFormat("en-CA", { month: "short", year: "numeric" });

export function monthYear(value: string | null | undefined): string {
  if (!value) return "—";
  return monthYearFmt.format(new Date(`${value}T12:00:00`));
}

export function shortDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(`${value}T12:00:00`) : value;
  return day.format(d);
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
}

/** "Today", "Yesterday", "6 days ago", then a date. */
export function relativeDay(value: Date | null | undefined): string {
  if (!value) return "—";
  const days = daysBetween(new Date(), value);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 14) return `${days} days ago`;
  return day.format(value);
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}
