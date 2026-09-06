"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { requireTenantOrThrow } from "@/lib/workspace";
import { provisionWorkspace } from "@/lib/workspace-store";
import {
  activities,
  companies,
  contacts,
  db,
  deals,
  connections,
  emailMessages,
  mailboxes,
  pipelineStages,
  syncedInvoices,
  pipelines,
} from "@/db";
import { runSync } from "@/lib/sync";
import { getProvider } from "@/lib/providers";
import { getMailboxProvider } from "@/lib/mailbox/providers";
import { sendFromMailbox } from "@/lib/mailbox/send";
import { prepareEmailBody } from "@/lib/email-content";
import { hasUnresolvedTags } from "@/lib/email-templates";
import { contactTemplateContext } from "@/lib/email-template-store";
import { clientCredentials, revokeToken } from "@/lib/oauth";

/** Every mutation resolves membership on the server, never from form fields. */
async function workspaceId(): Promise<string> {
  return (await requireTenantOrThrow()).workspaceId;
}

/** The signed-in person's name, for timeline attribution. */
async function actorName(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user.name ?? "Reach";
}

const trimmed = z.string().trim();
const optionalText = trimmed.transform((v) => (v === "" ? null : v));
/** "12,500" or "12500.50" → integer cents; empty → 0. */
function toCents(raw: FormDataEntryValue | null): number {
  const cleaned = String(raw ?? "").replace(/[$,\s]/g, "");
  if (cleaned === "") return 0;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) throw new Error("Amount must be a number.");
  return Math.round(value * 100);
}

export async function createCompany(formData: FormData): Promise<void> {
  const wsId = await workspaceId();
  const name = trimmed.min(1, "Name is required.").parse(formData.get("name"));
  const [row] = await db
    .insert(companies)
    .values({
      workspaceId: wsId,
      name,
      domain: optionalText.parse(formData.get("domain") ?? ""),
      city: optionalText.parse(formData.get("city") ?? ""),
      industry: optionalText.parse(formData.get("industry") ?? ""),
      lifecycleStage: trimmed.parse(formData.get("lifecycleStage") ?? "lead") || "lead",
      ownerName: optionalText.parse(formData.get("ownerName") ?? ""),
      source: optionalText.parse(formData.get("source") ?? ""),
    })
    .returning({ id: companies.id });
  revalidatePath("/companies");
  redirect(`/companies/${row.id}`);
}

export async function createContact(formData: FormData): Promise<void> {
  const wsId = await workspaceId();
  const firstName = trimmed.min(1, "First name is required.").parse(formData.get("firstName"));
  const lastName = trimmed.parse(formData.get("lastName") ?? "") || "—";
  const companyId = optionalText.parse(formData.get("companyId") ?? "");
  await assertCompany(wsId, companyId);
  await db.insert(contacts).values({
    workspaceId: wsId,
    firstName,
    lastName,
    email: optionalText.parse(formData.get("email") ?? ""),
    phone: optionalText.parse(formData.get("phone") ?? ""),
    title: optionalText.parse(formData.get("title") ?? ""),
    companyId: companyId || null,
    lifecycleStage: trimmed.parse(formData.get("lifecycleStage") ?? "lead") || "lead",
    ownerName: optionalText.parse(formData.get("ownerName") ?? ""),
    lastActivityAt: new Date(),
  });
  revalidatePath("/contacts");
  redirect("/contacts");
}

export async function createDeal(formData: FormData): Promise<void> {
  const wsId = await workspaceId();
  const name = trimmed.min(1, "Deal name is required.").parse(formData.get("name"));
  const stageId = trimmed.min(1, "Pick a stage.").parse(formData.get("stageId"));
  const stage = await tenantStage(wsId, stageId);
  const companyId = optionalText.parse(formData.get("companyId") ?? "");
  await assertCompany(wsId, companyId);
  await db.insert(deals).values({
    workspaceId: wsId,
    name,
    pipelineId: stage.pipelineId,
    stageId,
    companyId: companyId || null,
    amountCents: toCents(formData.get("amount")),
    closeDate: optionalText.parse(formData.get("closeDate") ?? ""),
    ownerName: optionalText.parse(formData.get("ownerName") ?? ""),
    status: stage.kind === "won" ? "won" : stage.kind === "lost" ? "lost" : "open",
    wonAt: stage.kind === "won" ? new Date() : null,
  });
  revalidatePath("/deals");
  redirect("/deals");
}

export async function createTask(formData: FormData): Promise<void> {
  const wsId = await workspaceId();
  const subject = trimmed.min(1, "The task needs a description.").parse(formData.get("subject"));
  const dueRaw = optionalText.parse(formData.get("dueAt") ?? "");
  const companyId = optionalText.parse(formData.get("companyId") ?? "");
  await assertCompany(wsId, companyId);
  await db.insert(activities).values({
    workspaceId: wsId,
    type: "task",
    subject,
    companyId: companyId || null,
    dueAt: dueRaw ? new Date(dueRaw) : null,
    actorName: optionalText.parse(formData.get("ownerName") ?? "") ?? (await actorName()),
  });
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  redirect("/tasks");
}

export async function completeTask(formData: FormData): Promise<void> {
  const wsId = await workspaceId();
  const id = trimmed.min(1).parse(formData.get("taskId"));
  await db
    .update(activities)
    .set({ completedAt: new Date() })
    .where(and(eq(activities.id, id), eq(activities.workspaceId, wsId)));
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
}

/** Ticking a task off is one click, so un-ticking it must be too. */
export async function reopenTask(formData: FormData): Promise<void> {
  const wsId = await workspaceId();
  const id = trimmed.min(1).parse(formData.get("taskId"));
  await db
    .update(activities)
    .set({ completedAt: null })
    .where(and(eq(activities.id, id), eq(activities.workspaceId, wsId)));
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
}

export async function logActivity(formData: FormData): Promise<void> {
  const wsId = await workspaceId();
  const companyId = trimmed.min(1).parse(formData.get("companyId"));
  await assertCompany(wsId, companyId);
  const type = z.enum(["note", "call", "email", "meeting"]).parse(formData.get("type"));
  const body = trimmed.min(1, "Write something first.").parse(formData.get("body"));
  const labels = { note: "Note", call: "Call logged", email: "Email logged", meeting: "Meeting" };
  await db.insert(activities).values({
    workspaceId: wsId,
    type,
    subject: labels[type],
    body,
    companyId,
    actorName: await actorName(),
    occurredAt: new Date(),
  });
  await db
    .update(contacts)
    .set({ lastActivityAt: new Date() })
    .where(and(eq(contacts.companyId, companyId), eq(contacts.workspaceId, wsId)));
  revalidatePath(`/companies/${companyId}`);
}

export async function setDealStage(formData: FormData): Promise<void> {
  const wsId = await workspaceId();
  const dealId = trimmed.min(1).parse(formData.get("dealId"));
  const stageId = trimmed.min(1).parse(formData.get("stageId"));
  const stage = await tenantStage(wsId, stageId);
  await db
    .update(deals)
    .set({
      stageId,
      pipelineId: stage.pipelineId,
      status: stage.kind === "won" ? "won" : stage.kind === "lost" ? "lost" : "open",
      wonAt: stage.kind === "won" ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(and(eq(deals.id, dealId), eq(deals.workspaceId, wsId)));
  revalidatePath("/deals");
  revalidatePath("/dashboard");
}

/*
 * Editing and deleting. Every one of these is scoped to the workspace as well
 * as the id: the id arrives from a form and is therefore the caller's to
 * choose, so matching on it alone would let a signed-in person edit a record
 * belonging to a workspace they cannot see. Related companies and pipeline
 * stages are validated against the same membership before every write.
 *
 * Nothing cascades in the schema, so deletes detach their dependents by hand
 * rather than failing on a foreign key. A record is let go of; the notes and
 * deals that mentioned it are not.
 */

/** The row exists and belongs here, or the action says so instead of silently doing nothing. */
function assertTouched(rows: unknown[], what: string): void {
  if (rows.length === 0) throw new Error(`That ${what} is no longer here.`);
}

export async function updateCompany(formData: FormData): Promise<void> {
  const wsId = await workspaceId();
  const id = trimmed.min(1).parse(formData.get("id"));
  const touched = await db
    .update(companies)
    .set({
      name: trimmed.min(1, "Name is required.").parse(formData.get("name")),
      domain: optionalText.parse(formData.get("domain") ?? ""),
      city: optionalText.parse(formData.get("city") ?? ""),
      industry: optionalText.parse(formData.get("industry") ?? ""),
      lifecycleStage: trimmed.parse(formData.get("lifecycleStage") ?? "lead") || "lead",
      ownerName: optionalText.parse(formData.get("ownerName") ?? ""),
      updatedAt: new Date(),
    })
    .where(and(eq(companies.id, id), eq(companies.workspaceId, wsId)))
    .returning({ id: companies.id });
  assertTouched(touched, "company");
  revalidatePath("/companies");
  revalidatePath(`/companies/${id}`);
  revalidatePath("/contacts");
}

/*
 * A company synced from the books comes back on the next sync — the books are
 * the record, and Reach is a mirror. Deleting one is therefore a way to tidy
 * the CRM today, not a way to remove a customer; the dialog says so.
 */
export async function deleteCompany(formData: FormData): Promise<void> {
  const wsId = await workspaceId();
  const id = trimmed.min(1).parse(formData.get("id"));
  const [company] = await db
    .select({ id: companies.id })
    .from(companies)
    .where(and(eq(companies.id, id), eq(companies.workspaceId, wsId)));
  assertTouched(company ? [company] : [], "company");

  await db.update(contacts).set({ companyId: null }).where(and(eq(contacts.companyId, id), eq(contacts.workspaceId, wsId)));
  await db.update(deals).set({ companyId: null }).where(and(eq(deals.companyId, id), eq(deals.workspaceId, wsId)));
  await db.update(activities).set({ companyId: null }).where(and(eq(activities.companyId, id), eq(activities.workspaceId, wsId)));
  await db.update(emailMessages).set({ companyId: null }).where(and(eq(emailMessages.companyId, id), eq(emailMessages.workspaceId, wsId)));
  /* The invoice mirror is a cache keyed to the company; it has nowhere to go. */
  await db.delete(syncedInvoices).where(and(eq(syncedInvoices.companyId, id), eq(syncedInvoices.workspaceId, wsId)));
  await db.delete(companies).where(and(eq(companies.id, id), eq(companies.workspaceId, wsId)));

  revalidatePath("/companies");
  revalidatePath("/contacts");
  revalidatePath("/deals");
  revalidatePath("/dashboard");
  redirect("/companies");
}

export async function updateContact(formData: FormData): Promise<void> {
  const wsId = await workspaceId();
  const id = trimmed.min(1).parse(formData.get("id"));
  const companyId = optionalText.parse(formData.get("companyId") ?? "");
  await assertCompany(wsId, companyId);
  const touched = await db
    .update(contacts)
    .set({
      firstName: trimmed.min(1, "First name is required.").parse(formData.get("firstName")),
      lastName: trimmed.parse(formData.get("lastName") ?? "") || "—",
      email: optionalText.parse(formData.get("email") ?? ""),
      phone: optionalText.parse(formData.get("phone") ?? ""),
      title: optionalText.parse(formData.get("title") ?? ""),
      companyId: companyId || null,
      lifecycleStage: trimmed.parse(formData.get("lifecycleStage") ?? "lead") || "lead",
      ownerName: optionalText.parse(formData.get("ownerName") ?? ""),
      updatedAt: new Date(),
    })
    .where(and(eq(contacts.id, id), eq(contacts.workspaceId, wsId)))
    .returning({ id: contacts.id });
  assertTouched(touched, "contact");
  revalidatePath("/contacts");
  if (companyId) revalidatePath(`/companies/${companyId}`);
}

export async function deleteContact(formData: FormData): Promise<void> {
  const wsId = await workspaceId();
  const id = trimmed.min(1).parse(formData.get("id"));
  const [contact] = await db
    .select({ id: contacts.id, companyId: contacts.companyId })
    .from(contacts)
    .where(and(eq(contacts.id, id), eq(contacts.workspaceId, wsId)));
  assertTouched(contact ? [contact] : [], "contact");

  await db.update(deals).set({ contactId: null }).where(and(eq(deals.contactId, id), eq(deals.workspaceId, wsId)));
  await db.update(activities).set({ contactId: null }).where(and(eq(activities.contactId, id), eq(activities.workspaceId, wsId)));
  await db.update(emailMessages).set({ contactId: null }).where(and(eq(emailMessages.contactId, id), eq(emailMessages.workspaceId, wsId)));
  await db.delete(contacts).where(and(eq(contacts.id, id), eq(contacts.workspaceId, wsId)));

  revalidatePath("/contacts");
  if (contact.companyId) revalidatePath(`/companies/${contact.companyId}`);
}

export async function updateDeal(formData: FormData): Promise<void> {
  const wsId = await workspaceId();
  const id = trimmed.min(1).parse(formData.get("id"));
  const [existing] = await db
    .select({ id: deals.id, wonAt: deals.wonAt })
    .from(deals)
    .where(and(eq(deals.id, id), eq(deals.workspaceId, wsId)));
  assertTouched(existing ? [existing] : [], "deal");

  const stageId = trimmed.min(1, "Pick a stage.").parse(formData.get("stageId"));
  const stage = await tenantStage(wsId, stageId);
  const companyId = optionalText.parse(formData.get("companyId") ?? "");
  await assertCompany(wsId, companyId);

  await db
    .update(deals)
    .set({
      name: trimmed.min(1, "Deal name is required.").parse(formData.get("name")),
      pipelineId: stage.pipelineId,
      stageId,
      companyId: companyId || null,
      amountCents: toCents(formData.get("amount")),
      closeDate: optionalText.parse(formData.get("closeDate") ?? ""),
      ownerName: optionalText.parse(formData.get("ownerName") ?? ""),
      status: stage.kind === "won" ? "won" : stage.kind === "lost" ? "lost" : "open",
      /* Editing a deal that was already won must not restamp the day it was won. */
      wonAt: stage.kind === "won" ? (existing.wonAt ?? new Date()) : null,
      updatedAt: new Date(),
    })
    .where(and(eq(deals.id, id), eq(deals.workspaceId, wsId)));

  revalidatePath("/deals");
  revalidatePath("/dashboard");
  if (companyId) revalidatePath(`/companies/${companyId}`);
}

export async function deleteDeal(formData: FormData): Promise<void> {
  const wsId = await workspaceId();
  const id = trimmed.min(1).parse(formData.get("id"));
  const [deal] = await db
    .select({ id: deals.id, companyId: deals.companyId })
    .from(deals)
    .where(and(eq(deals.id, id), eq(deals.workspaceId, wsId)));
  assertTouched(deal ? [deal] : [], "deal");

  await db.update(activities).set({ dealId: null }).where(and(eq(activities.dealId, id), eq(activities.workspaceId, wsId)));
  await db.delete(deals).where(and(eq(deals.id, id), eq(deals.workspaceId, wsId)));

  revalidatePath("/deals");
  revalidatePath("/dashboard");
  if (deal.companyId) revalidatePath(`/companies/${deal.companyId}`);
}

export async function updateTask(formData: FormData): Promise<void> {
  const wsId = await workspaceId();
  const id = trimmed.min(1).parse(formData.get("id"));
  const dueRaw = optionalText.parse(formData.get("dueAt") ?? "");
  const companyId = optionalText.parse(formData.get("companyId") ?? "");
  await assertCompany(wsId, companyId);
  const touched = await db
    .update(activities)
    .set({
      subject: trimmed.min(1, "The task needs a description.").parse(formData.get("subject")),
      dueAt: dueRaw ? new Date(dueRaw) : null,
      companyId: companyId || null,
      actorName: optionalText.parse(formData.get("ownerName") ?? ""),
    })
    .where(
      and(
        eq(activities.id, id),
        eq(activities.workspaceId, wsId),
        eq(activities.type, "task"),
      ),
    )
    .returning({ id: activities.id });
  assertTouched(touched, "task");
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
}

export async function deleteTask(formData: FormData): Promise<void> {
  const wsId = await workspaceId();
  const id = trimmed.min(1).parse(formData.get("id"));
  const touched = await db
    .delete(activities)
    .where(
      and(
        eq(activities.id, id),
        eq(activities.workspaceId, wsId),
        eq(activities.type, "task"),
      ),
    )
    .returning({ id: activities.id });
  assertTouched(touched, "task");
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
}

/*
 * Letting go of a mailbox. Scoped to the person who owns it — a mailbox is
 * one colleague's account, and no one else in the workspace gets to hand it
 * back on their behalf.
 */
export async function disconnectMailbox(formData: FormData): Promise<void> {
  const wsId = await workspaceId();
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("Not signed in.");
  const id = trimmed.min(1).parse(formData.get("mailboxId"));

  const [mailbox] = await db
    .select()
    .from(mailboxes)
    .where(and(eq(mailboxes.id, id), eq(mailboxes.userId, session.user.id), eq(mailboxes.workspaceId, wsId)));
  if (!mailbox) throw new Error("That mailbox is not yours to disconnect.");

  const provider = getMailboxProvider(mailbox.provider);
  const token = mailbox.refreshToken ?? mailbox.accessToken;
  if (provider?.oauth.revokeUrl && token) {
    const credentials = clientCredentials(provider);
    if (credentials.ok) {
      await revokeToken({ provider, credentials: credentials.value, token });
    }
  }

  /* The row goes rather than being marked disconnected: it exists to hold
     tokens, and keeping a dead one only invites sending as an address whose
     grant is gone. */
  /* The messages it sent stay on the record; only their link to the grant goes. */
  await db.update(emailMessages).set({ mailboxId: null }).where(eq(emailMessages.mailboxId, mailbox.id));
  await db.delete(mailboxes).where(eq(mailboxes.id, mailbox.id));
  revalidatePath("/settings");
}

/*
 * Send an email from a record, as the signed-in person, through the mailbox
 * they connected. Recorded twice on purpose: the message itself in
 * email_messages, where a reply can be matched back to it, and a one-line
 * activity on the timeline, which is where a person looks.
 *
 * Failures throw with the provider's reason. The compose dialog catches and
 * shows it, so "Zoho refused the address" reaches the person who typed it
 * rather than being flattened into "something went wrong".
 */
export async function sendEmailFromRecord(formData: FormData): Promise<void> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("Not signed in.");
  const wsId = await workspaceId();

  const companyId = optionalText.parse(formData.get("companyId") ?? "");
  await assertCompany(wsId, companyId);
  const contactId = optionalText.parse(formData.get("contactId") ?? "");
  if (contactId) {
    const [contact] = await db.select({ id: contacts.id, companyId: contacts.companyId }).from(contacts)
      .where(and(eq(contacts.id, z.uuid().parse(contactId)), eq(contacts.workspaceId, wsId))).limit(1);
    if (!contact || (companyId && contact.companyId !== companyId)) throw new Error("Contact unavailable for this company.");
  }
  const to = z
    .string()
    .trim()
    .email("That doesn't look like an email address.")
    .parse(formData.get("to"));
  const subject = trimmed.min(1, "Give it a subject.").parse(formData.get("subject"));
  const { text, html } = prepareEmailBody(z.string().parse(formData.get("body")), z.string().optional().parse(formData.get("bodyHtml") ?? undefined));
  if (subject.length > 998 || /[\r\n]/.test(subject)) throw new Error("Use a single-line subject of at most 998 characters.");
  if (hasUnresolvedTags(subject + text + (html ?? ""))) throw new Error("Fill in or remove the remaining {{tags}} before sending.");
  if (formData.has("templateInvoice")) {
    if (!contactId) throw new Error("Choose a contact for this invoice email.");
    const reference = z.object({ number: z.string().max(200), dueDate: z.string(), outstandingCents: z.number().int().positive(), mode: z.enum(["none", "open", "overdue"]), currency: z.string() }).parse(JSON.parse(z.string().max(2000).parse(formData.get("templateInvoice"))));
    const context = await contactTemplateContext(wsId, contactId, session.user.name, "");
    const matches = context.invoices.filter(invoice => invoice.number === reference.number);
    const current = matches.length === 1 ? matches[0] : undefined;
    const today = new Date().toISOString().slice(0, 10);
    if (!current || current.outstandingCents !== reference.outstandingCents || current.dueDate !== reference.dueDate || context.currency !== reference.currency || (reference.mode === "overdue" && current.dueDate >= today) || (reference.mode === "open" && current.dueDate < today)) {
      throw new Error("This invoice changed or is no longer eligible. Your draft is kept—select the template again to refresh its invoice details.");
    }
  }

  const [mailbox] = await db
    .select()
    .from(mailboxes)
    .where(and(eq(mailboxes.userId, session.user.id), eq(mailboxes.workspaceId, wsId), eq(mailboxes.status, "connected")))
    .limit(1);
  if (!mailbox) {
    throw new Error("Connect a mailbox in Settings first — Reach sends as you, not as itself.");
  }

  /* A company named on the form must be one of ours; a stray id is refused. */
  if (companyId) {
    const [company] = await db
      .select({ id: companies.id })
      .from(companies)
      .where(and(eq(companies.id, companyId), eq(companies.workspaceId, wsId)));
    if (!company) throw new Error("That company is no longer here.");
  }

  const sent = await sendFromMailbox(mailbox, { to, subject, text, html });
  if (!sent.ok) throw new Error(sent.error);

  await db.insert(emailMessages).values({
    workspaceId: wsId,
    mailboxId: mailbox.id,
    companyId: companyId || null,
    contactId: contactId || null,
    direction: "outbound",
    fromAddress: mailbox.emailAddress,
    toAddress: to,
    subject,
    bodyText: text,
    bodyHtml: html ?? null,
    providerMessageId: sent.value.providerMessageId,
  });

  await db.insert(activities).values({
    workspaceId: wsId,
    type: "email",
    subject: `Email sent — ${subject}`,
    body: `To ${to}\n\n${text}`,
    companyId: companyId || null,
    contactId: contactId || null,
    actorName: session.user.name ?? mailbox.emailAddress,
    occurredAt: new Date(),
  });

  if (contactId) {
    await db
      .update(contacts)
      .set({ lastActivityAt: new Date() })
      .where(and(eq(contacts.id, contactId), eq(contacts.workspaceId, wsId)));
  }

  if (companyId) revalidatePath(`/companies/${companyId}`);
  revalidatePath("/contacts");
}

export async function syncNow(): Promise<void> {
  const wsId = await workspaceId();
  await runSync(wsId);
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  revalidatePath("/companies");
  revalidatePath("/contacts");
}

/*
 * Disconnecting tells the provider first (RFC 7009 — the grant ends on their
 * side, not just ours), then forgets every token. Revocation is best-effort:
 * if it fails, Reach still drops its copy rather than holding credentials the
 * person asked it to let go of.
 */
export async function disconnectBooks(): Promise<void> {
  const wsId = await workspaceId();
  const [connection] = await db
    .select()
    .from(connections)
    .where(eq(connections.workspaceId, wsId));

  if (connection) {
    const provider = getProvider(connection.provider);

    /*
     * Unsubscribe before revoking — the access token is what authorises the
     * teardown, so doing it the other way round leaves the provider pinging a
     * receiver that will refuse it until the failures disable the endpoint.
     */
    if (
      provider?.webhooks &&
      connection.webhookEndpointId &&
      connection.externalCompanyId &&
      connection.accessToken
    ) {
      await provider.webhooks.unregister(
        connection.accessToken,
        connection.externalCompanyId,
        connection.webhookEndpointId,
      );
    }

    const token = connection.refreshToken ?? connection.accessToken;
    if (provider?.oauth && token) {
      const credentials = clientCredentials(provider);
      if (credentials.ok) {
        await revokeToken({ provider, credentials: credentials.value, token });
      }
    }
    await db
      .update(connections)
      .set({
        status: "disconnected",
        credentials: null,
        accessToken: null,
        refreshToken: null,
        tokenExpiresAt: null,
        webhookEndpointId: null,
        webhookSecret: null,
      })
      .where(eq(connections.id, connection.id));
  }

  revalidatePath("/settings");
  revalidatePath("/dashboard");
}

async function assertCompany(wsId: string, id: string | null): Promise<void> {
  if (!id) return;
  const [row] = await db.select({ id: companies.id }).from(companies)
    .where(and(eq(companies.id, z.uuid().parse(id)), eq(companies.workspaceId, wsId))).limit(1);
  if (!row) throw new Error("Company unavailable.");
}

async function tenantStage(wsId: string, id: string) {
  const [row] = await db.select({ stage: pipelineStages }).from(pipelineStages)
    .innerJoin(pipelines, eq(pipelines.id, pipelineStages.pipelineId))
    .where(and(eq(pipelineStages.id, z.uuid().parse(id)), eq(pipelines.workspaceId, wsId))).limit(1);
  if (!row) throw new Error("Stage unavailable.");
  return row.stage;
}

export async function createWorkspace(formData: FormData): Promise<void> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  const parsed = trimmed.min(1).max(80).safeParse(formData.get("companyName"));
  if (!parsed.success) redirect("/welcome?error=Enter+a+company+name+(1-80+characters).");
  try {
    await provisionWorkspace(session.user.id, parsed.data);
  } catch {
    redirect("/welcome?error=Could+not+create+your+workspace.+Please+try+again.");
  }
  revalidatePath("/", "layout");
  redirect("/dashboard");
}
