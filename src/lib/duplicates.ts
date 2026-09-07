import { asc, eq } from "drizzle-orm";
import { companies, contacts, db } from "@/db";

/*
 * Finding records that are probably the same person or the same company.
 * Two people are a likely match when they share an email address, or the
 * same full name; two companies when their names match once case and
 * punctuation are ignored, or they share a domain. Suggestions only — a
 * person decides what merges.
 */

import { normalizeName } from "./duplicate-rules";
export { normalizeName };

export type DuplicateContact = { id: string; firstName: string; lastName: string; email: string | null; phone: string | null; title: string | null; companyId: string | null; companyName: string | null; createdAt: Date; lastActivityAt: Date | null; activityCount?: number };
export type DuplicateGroup<T> = { key: string; reason: string; records: T[] };

function groupBy<T extends { id: string }>(rows: T[], keys: (row: T) => Array<[key: string, reason: string]>): DuplicateGroup<T>[] {
  const buckets = new Map<string, { reason: string; records: T[] }>();
  for (const row of rows) {
    for (const [key, reason] of keys(row)) {
      if (!key) continue;
      const bucket = buckets.get(key) ?? { reason, records: [] };
      if (!bucket.records.some((item) => item.id === row.id)) bucket.records.push(row);
      buckets.set(key, bucket);
    }
  }
  /* A record in two buckets (same name AND same email) is reported once. */
  const seen = new Set<string>();
  const groups: DuplicateGroup<T>[] = [];
  for (const [key, bucket] of buckets) {
    if (bucket.records.length < 2) continue;
    if (bucket.records.every((record) => seen.has(record.id))) continue;
    bucket.records.forEach((record) => seen.add(record.id));
    groups.push({ key, reason: bucket.reason, records: bucket.records });
  }
  return groups;
}

export async function duplicateContacts(workspaceId: string): Promise<DuplicateGroup<DuplicateContact>[]> {
  const rows = await db
    .select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName, email: contacts.email, phone: contacts.phone, title: contacts.title, companyId: contacts.companyId, companyName: companies.name, createdAt: contacts.createdAt, lastActivityAt: contacts.lastActivityAt })
    .from(contacts)
    .leftJoin(companies, eq(contacts.companyId, companies.id))
    .where(eq(contacts.workspaceId, workspaceId))
    .orderBy(asc(contacts.createdAt));
  return groupBy(rows, (row) => [
    [row.email ? `email:${row.email.trim().toLowerCase()}` : "", "Same email address"],
    [row.lastName && row.lastName !== "—" ? `name:${normalizeName(`${row.firstName} ${row.lastName}`)}` : "", "Same name"],
  ]);
}

export type DuplicateCompany = { id: string; name: string; domain: string | null; city: string | null; lifecycleStage: string; externalContactId: string | null; arBalanceCents: number; createdAt: Date };

export async function duplicateCompanies(workspaceId: string): Promise<DuplicateGroup<DuplicateCompany>[]> {
  const rows = await db
    .select({ id: companies.id, name: companies.name, domain: companies.domain, city: companies.city, lifecycleStage: companies.lifecycleStage, externalContactId: companies.externalContactId, arBalanceCents: companies.arBalanceCents, createdAt: companies.createdAt })
    .from(companies)
    .where(eq(companies.workspaceId, workspaceId))
    .orderBy(asc(companies.createdAt));
  return groupBy(rows, (row) => [
    [`name:${normalizeName(row.name)}`, "Same name"],
    [row.domain ? `domain:${row.domain.trim().toLowerCase().replace(/^www\./, "")}` : "", "Same domain"],
  ]);
}
