"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { activities, companies, contacts, db } from "@/db";
import { requireTenantOrThrow } from "./workspace";

/*
 * Bringing a spreadsheet of people into the workspace. The browser has
 * already parsed and previewed the file; what arrives here is rows, checked
 * again because a request does not have to come from the preview.
 *
 * Rules that keep an import from making a mess:
 * - an address already on a contact in this workspace is skipped, not
 *   duplicated, and the count of skips is reported
 * - a company is matched by name, case-insensitively, before one is created
 * - everything created says where it came from
 */

const MAX_ROWS = 2000;

const rowSchema = z.object({
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(254).nullable(),
  phone: z.string().trim().max(60).nullable(),
  company: z.string().trim().min(1).max(200).nullable(),
  title: z.string().trim().max(120).nullable(),
});

export type ImportOutcome =
  | { ok: true; created: number; skipped: number; companiesCreated: number }
  | { ok: false; error: string };

export async function importContacts(form: FormData): Promise<ImportOutcome> {
  try {
    const { workspaceId } = await requireTenantOrThrow();
    const rows = z.array(rowSchema).max(MAX_ROWS).parse(JSON.parse(z.string().max(2_000_000).parse(form.get("rows"))));
    if (!rows.length) return { ok: false, error: "The file has no rows with a name or an email address." };

    /* Addresses already here, and duplicates within the file itself. */
    const wanted = [...new Set(rows.map((row) => row.email).filter((email): email is string => Boolean(email)))];
    const existing = wanted.length
      ? await db
          .select({ email: sql<string>`lower(${contacts.email})` })
          .from(contacts)
          .where(and(eq(contacts.workspaceId, workspaceId), inArray(sql`lower(${contacts.email})`, wanted)))
      : [];
    const taken = new Set(existing.map((row) => row.email));

    /* Companies named in the file, matched to what is here before anything is created. */
    const companyNames = [...new Set(rows.map((row) => row.company).filter((name): name is string => Boolean(name)))];
    const known = companyNames.length
      ? await db
          .select({ id: companies.id, name: companies.name })
          .from(companies)
          .where(and(eq(companies.workspaceId, workspaceId), inArray(sql`lower(${companies.name})`, companyNames.map((name) => name.toLowerCase()))))
      : [];
    const companyIdByName = new Map(known.map((row) => [row.name.toLowerCase(), row.id]));
    let companiesCreated = 0;
    for (const name of companyNames) {
      if (companyIdByName.has(name.toLowerCase())) continue;
      const [created] = await db
        .insert(companies)
        .values({ workspaceId, name, lifecycleStage: "lead", source: "CSV import" })
        .returning({ id: companies.id });
      companyIdByName.set(name.toLowerCase(), created.id);
      companiesCreated++;
    }

    let created = 0;
    let skipped = 0;
    const now = new Date();
    for (const row of rows) {
      if (row.email && taken.has(row.email)) { skipped++; continue; }
      if (row.email) taken.add(row.email);
      await db.insert(contacts).values({
        workspaceId,
        firstName: row.firstName,
        lastName: row.lastName,
        email: row.email,
        phone: row.phone,
        title: row.title,
        companyId: row.company ? (companyIdByName.get(row.company.toLowerCase()) ?? null) : null,
        lifecycleStage: "lead",
        lastActivityAt: now,
      });
      created++;
    }

    if (created) {
      await db.insert(activities).values({
        workspaceId,
        type: "note",
        source: "reach",
        subject: "Contacts imported",
        body: `${created} ${created === 1 ? "contact" : "contacts"} imported from a CSV file` +
          (companiesCreated ? `, ${companiesCreated} new ${companiesCreated === 1 ? "company" : "companies"}` : "") +
          (skipped ? `; ${skipped} already here and skipped.` : "."),
      });
    }
    revalidatePath("/contacts");
    revalidatePath("/companies");
    revalidatePath("/dashboard");
    return { ok: true, created, skipped, companiesCreated };
  } catch (error) {
    if (error instanceof z.ZodError) return { ok: false, error: "Some rows could not be read. Check names and email addresses, then try again." };
    console.error("[import]", error);
    return { ok: false, error: "The import could not be completed. Nothing from this attempt was kept." };
  }
}
