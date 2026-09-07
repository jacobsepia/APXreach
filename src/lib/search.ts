"use server";

import { and, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import { companies, contacts, db, deals, tickets } from "@/db";
import { requireTenantOrThrow } from "@/lib/workspace";

/*
 * One box, everything in the workspace. A handful of the best matches from
 * each kind of record, by name, address or subject — enough to jump, not a
 * report. Scoped to the signed-in person's workspace like every other read.
 */

export type SearchHit = {
  kind: "contact" | "company" | "deal" | "ticket";
  id: string;
  title: string;
  subtitle: string;
  href: string;
};

const LIMIT = 5;

export async function searchWorkspace(raw: string): Promise<SearchHit[]> {
  const q = z.string().trim().max(120).parse(raw);
  if (q.length < 2) return [];
  const { workspaceId } = await requireTenantOrThrow();
  const like = `%${q.replace(/[%_\\]/g, (char) => `\\${char}`)}%`;
  const fullName = sql`(${contacts.firstName} || ' ' || ${contacts.lastName})`;

  const [people, firms, pipeline, support] = await Promise.all([
    db
      .select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName, email: contacts.email, companyName: companies.name })
      .from(contacts)
      .leftJoin(companies, eq(contacts.companyId, companies.id))
      .where(and(eq(contacts.workspaceId, workspaceId), or(ilike(fullName, like), ilike(contacts.email, like), ilike(contacts.phone, like))))
      .orderBy(contacts.firstName, contacts.lastName)
      .limit(LIMIT),
    db
      .select({ id: companies.id, name: companies.name, city: companies.city, domain: companies.domain, stage: companies.lifecycleStage })
      .from(companies)
      .where(and(eq(companies.workspaceId, workspaceId), or(ilike(companies.name, like), ilike(companies.domain, like), ilike(companies.city, like))))
      .orderBy(companies.name)
      .limit(LIMIT),
    db
      .select({ id: deals.id, name: deals.name, status: deals.status, amountCents: deals.amountCents, companyName: companies.name })
      .from(deals)
      .leftJoin(companies, eq(deals.companyId, companies.id))
      .where(and(eq(deals.workspaceId, workspaceId), ilike(deals.name, like)))
      .orderBy(deals.updatedAt)
      .limit(LIMIT),
    db
      .select({ id: tickets.id, subject: tickets.subject, status: tickets.status, priority: tickets.priority, companyName: companies.name })
      .from(tickets)
      .leftJoin(companies, eq(tickets.companyId, companies.id))
      .where(and(eq(tickets.workspaceId, workspaceId), ilike(tickets.subject, like)))
      .orderBy(tickets.updatedAt)
      .limit(LIMIT),
  ]);

  const money = (cents: number) => new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(cents / 100);
  return [
    ...people.map((row): SearchHit => ({
      kind: "contact",
      id: row.id,
      title: `${row.firstName} ${row.lastName}`.replace(/ —$/, "").trim(),
      subtitle: [row.companyName, row.email].filter(Boolean).join(" · ") || "Contact",
      href: `/contacts?open=${row.id}`,
    })),
    ...firms.map((row): SearchHit => ({
      kind: "company",
      id: row.id,
      title: row.name,
      subtitle: [row.stage.charAt(0).toUpperCase() + row.stage.slice(1), row.city, row.domain].filter(Boolean).join(" · "),
      href: `/companies/${row.id}`,
    })),
    ...pipeline.map((row): SearchHit => ({
      kind: "deal",
      id: row.id,
      title: row.name,
      subtitle: [row.companyName, money(row.amountCents), row.status === "open" ? null : row.status].filter(Boolean).join(" · "),
      href: "/deals",
    })),
    ...support.map((row): SearchHit => ({
      kind: "ticket",
      id: row.id,
      title: row.subject,
      subtitle: [row.companyName, row.priority, row.status].filter(Boolean).join(" · "),
      href: "/tickets",
    })),
  ];
}
