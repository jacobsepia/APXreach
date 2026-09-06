/*
 * The arithmetic behind the Reports page, kept away from the queries so it can
 * be tested with dates alone: how a period is cut into months or weeks, which
 * aging bucket an invoice falls in, and how a number is shortened for an axis.
 */

export type Bucket = { key: string; label: string; start: Date };

const monthShort = new Intl.DateTimeFormat("en-CA", { month: "short" });
const monthShortYear = new Intl.DateTimeFormat("en-CA", { month: "short", year: "2-digit" });
const dayShort = new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric" });

export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** Monday-start weeks, keyed by that Monday's date. */
export function weekStart(date: Date): Date {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - day);
  return start;
}

export function weekKey(date: Date): string {
  const start = weekStart(date);
  return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
}

/** Every month from the one containing `since` to the one containing `until`. */
export function monthBuckets(since: Date, until: Date): Bucket[] {
  const buckets: Bucket[] = [];
  const cursor = new Date(since.getFullYear(), since.getMonth(), 1);
  const last = new Date(until.getFullYear(), until.getMonth(), 1);
  while (cursor <= last) {
    const start = new Date(cursor);
    buckets.push({
      key: monthKey(start),
      label: start.getFullYear() === until.getFullYear() ? monthShort.format(start) : monthShortYear.format(start),
      start,
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return buckets;
}

/** Every week from the one containing `since` to the one containing `until`. */
export function weekBuckets(since: Date, until: Date): Bucket[] {
  const buckets: Bucket[] = [];
  const cursor = weekStart(since);
  const last = weekStart(until);
  while (cursor <= last) {
    const start = new Date(cursor);
    buckets.push({ key: weekKey(start), label: dayShort.format(start), start });
    cursor.setDate(cursor.getDate() + 7);
  }
  return buckets;
}

/** Weeks are too fine past a quarter; months too coarse under one. */
export function bucketsFor(days: number, since: Date, until: Date): Bucket[] {
  return days > 120 ? monthBuckets(since, until) : weekBuckets(since, until);
}
export function bucketKeyFor(days: number, date: Date): string {
  return days > 120 ? monthKey(date) : weekKey(date);
}

export const agingLabels = ["Current", "1–30 days", "31–60 days", "61–90 days", "Over 90"] as const;
export type AgingLabel = (typeof agingLabels)[number];

/** Days past due, from two ISO dates, into the bucket collections people use. */
export function agingBucket(dueDate: string, today: string): AgingLabel {
  const late = Math.round((Date.parse(today + "T00:00:00Z") - Date.parse(dueDate + "T00:00:00Z")) / 86_400_000);
  if (late <= 0) return "Current";
  if (late <= 30) return "1–30 days";
  if (late <= 60) return "31–60 days";
  if (late <= 90) return "61–90 days";
  return "Over 90";
}

/** $450 · $1.2K · $12K · $1.3M — for axes and tips, where the full figure would not fit. */
export function compactMoney(cents: number): string {
  const dollars = Math.abs(cents) / 100;
  const sign = cents < 0 ? "-" : "";
  if (dollars < 1000) return `${sign}$${Math.round(dollars)}`;
  if (dollars < 10_000) return `${sign}$${(dollars / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  if (dollars < 1_000_000) return `${sign}$${Math.round(dollars / 1000)}K`;
  return `${sign}$${(dollars / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

export function percent(numerator: number, denominator: number): string {
  if (!denominator) return "—";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

/** Signed change against the previous period, as people say it. */
export function delta(current: number, previous: number): { text: string; direction: "up" | "down" | "flat" } {
  if (previous === 0 && current === 0) return { text: "no change", direction: "flat" };
  if (previous === 0) return { text: "new this period", direction: "up" };
  const change = Math.round(((current - previous) / previous) * 100);
  if (change === 0) return { text: "no change", direction: "flat" };
  return { text: `${change > 0 ? "+" : ""}${change}% vs previous`, direction: change > 0 ? "up" : "down" };
}
