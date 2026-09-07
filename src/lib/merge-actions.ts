"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { activities, companies, contacts, db, deals, emailMessages, sequenceEnrollments, syncedInvoices, tickets } from "@/db";
import { requireTenantOrThrow } from "@/lib/workspace";

/*
 * Merging duplicates. One record is kept; everything that pointed at the
 * others — deals, emails, notes, tickets, sequences, invoices — is pointed
 * at it, blanks on the keeper are filled from the ones going, and the
 * others are removed. A note on the keeper says what happened. There is no
 * undo, which is why the page asks the person to choose the keeper first.
 */

const ids = z.array(z.uuid()).min(1).max(20);

export async function mergeContacts(form: FormData): Promise<void> {
  const tenant = await requireTenantOrThrow();
  const wsId = tenant.workspaceId;
  const keepId = z.uuid().parse(form.get("keepId"));
  const goingIds = ids.parse(form.getAll("mergeId").map(String)).filter((id) => id !== keepId);
  if (!goingIds.length) return;

  const rows = await db.select().from(contacts).where(and(eq(contacts.workspaceId, wsId), inArray(contacts.id, [keepId, ...goingIds])));
  const keeper = rows.find((row) => row.id === keepId);
  const going = rows.filter((row) => goingIds.includes(row.id));
  if (!keeper || going.length !== goingIds.length) throw new Error("Those contacts are not all in this workspace.");

  /* Blanks on the keeper are filled from the others, oldest first. */
  const fill = <K extends "email" | "phone" | "title" | "companyId" | "ownerName" | "externalContactId">(key: K) =>
    keeper[key] ?? going.map((row) => row[key]).find((value) => value != null && value !== "") ?? null;
  const lastActivityAt = [keeper.lastActivityAt, ...going.map((row) => row.lastActivityAt)].filter((d): d is Date => Boolean(d)).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  await db.update(contacts).set({
    email: fill("email"), phone: fill("phone"), title: fill("title"), companyId: fill("companyId"), ownerName: fill("ownerName"), externalContactId: fill("externalContactId"),
    lifecycleStage: keeper.lifecycleStage === "customer" || going.some((row) => row.lifecycleStage === "customer") ? "customer" : keeper.lifecycleStage,
    lastActivityAt, updatedAt: new Date(),
  }).where(eq(contacts.id, keepId));

  await db.update(deals).set({ contactId: keepId }).where(inArray(deals.contactId, goingIds));
  await db.update(activities).set({ contactId: keepId }).where(inArray(activities.contactId, goingIds));
  await db.update(emailMessages).set({ contactId: keepId }).where(inArray(emailMessages.contactId, goingIds));
  await db.update(tickets).set({ contactId: keepId }).where(inArray(tickets.contactId, goingIds));
  await db.update(sequenceEnrollments).set({ contactId: keepId }).where(inArray(sequenceEnrollments.contactId, goingIds));
  await db.delete(contacts).where(and(eq(contacts.workspaceId, wsId), inArray(contacts.id, goingIds)));

  await db.insert(activities).values({
    workspaceId: wsId, type: "note", source: "reach",
    subject: `Merged ${going.length} duplicate ${going.length === 1 ? "record" : "records"}`,
    body: `Kept this record and folded in: ${going.map((row) => `${row.firstName} ${row.lastName}`.replace(/ —$/, "").trim()).join(", ")}. Their emails, notes, deals and tickets are here now.`,
    actorName: tenant.userName, contactId: keepId, companyId: fill("companyId"),
  });
  revalidatePath("/contacts"); revalidatePath("/contacts/duplicates"); revalidatePath("/inbox");
}

export async function mergeCompanies(form: FormData): Promise<void> {
  const tenant = await requireTenantOrThrow();
  const wsId = tenant.workspaceId;
  const keepId = z.uuid().parse(form.get("keepId"));
  const goingIds = ids.parse(form.getAll("mergeId").map(String)).filter((id) => id !== keepId);
  if (!goingIds.length) return;

  const rows = await db.select().from(companies).where(and(eq(companies.workspaceId, wsId), inArray(companies.id, [keepId, ...goingIds])));
  const keeper = rows.find((row) => row.id === keepId);
  const going = rows.filter((row) => goingIds.includes(row.id));
  if (!keeper || going.length !== goingIds.length) throw new Error("Those companies are not all in this workspace.");

  const fill = <K extends "domain" | "city" | "industry" | "ownerName" | "source" | "externalContactId" | "customerSince">(key: K) =>
    keeper[key] ?? going.map((row) => row[key]).find((value) => value != null && value !== "") ?? null;
  /* The books rollups belong to whichever record the books know; the next sync rewrites them anyway. */
  const booksRow = [keeper, ...going].find((row) => row.externalContactId) ?? keeper;
  await db.update(companies).set({
    domain: fill("domain"), city: fill("city"), industry: fill("industry"), ownerName: fill("ownerName"), source: fill("source"), customerSince: fill("customerSince"),
    externalContactId: fill("externalContactId"),
    lifecycleStage: [keeper, ...going].some((row) => row.lifecycleStage === "customer") ? "customer" : keeper.lifecycleStage,
    arBalanceCents: booksRow.arBalanceCents, overdueCents: booksRow.overdueCents, revenueYtdCents: booksRow.revenueYtdCents, avgDaysToPay: booksRow.avgDaysToPay,
    updatedAt: new Date(),
  }).where(eq(companies.id, keepId));

  await db.update(contacts).set({ companyId: keepId }).where(inArray(contacts.companyId, goingIds));
  await db.update(deals).set({ companyId: keepId }).where(inArray(deals.companyId, goingIds));
  await db.update(activities).set({ companyId: keepId }).where(inArray(activities.companyId, goingIds));
  await db.update(emailMessages).set({ companyId: keepId }).where(inArray(emailMessages.companyId, goingIds));
  await db.update(tickets).set({ companyId: keepId }).where(inArray(tickets.companyId, goingIds));
  await db.update(sequenceEnrollments).set({ companyId: keepId }).where(inArray(sequenceEnrollments.companyId, goingIds));
  await db.update(syncedInvoices).set({ companyId: keepId }).where(inArray(syncedInvoices.companyId, goingIds));
  await db.delete(companies).where(and(eq(companies.workspaceId, wsId), inArray(companies.id, goingIds)));

  await db.insert(activities).values({
    workspaceId: wsId, type: "note", source: "reach",
    subject: `Merged ${going.length} duplicate ${going.length === 1 ? "company" : "companies"}`,
    body: `Kept this record and folded in: ${going.map((row) => row.name).join(", ")}. Their people, deals, emails, tickets and invoices are here now.`,
    actorName: tenant.userName, companyId: keepId,
  });
  revalidatePath("/companies"); revalidatePath(`/companies/${keepId}`); revalidatePath("/contacts/duplicates"); revalidatePath("/contacts");
}
