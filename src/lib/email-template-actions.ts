"use server";

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, emailTemplates } from "@/db";
import { requireTenantOrThrow } from "./workspace";
import { prepareEmailBody, sanitizeEmailHtml } from "./email-content";
import { hasUnresolvedTags, renderEmailTemplate, starterTemplates, tagsIn, templateTags } from "./email-templates";
import { contactTemplateContext, workspaceTemplates } from "./email-template-store";

class TemplateInputError extends Error {}
async function templateResult<T>(run: () => Promise<T>): Promise<{ data: T; error?: never } | { error: string; data?: never }> {
  try { return { data: await run() }; }
  catch (error) {
    return { error: error instanceof TemplateInputError ? error.message : error instanceof z.ZodError ? "Check the template fields and their length, then try again." : "Could not complete that template action. Check your sign-in and try again; your draft is unchanged." };
  }
}

function validateTemplate(subject: string, html: string) {
  const clean = sanitizeEmailHtml(html);
  try { prepareEmailBody("", clean); } catch { throw new TemplateInputError("Write a message of at most 100,000 characters before saving."); }
  const unknown = tagsIn(subject + clean).filter(tag => !Object.hasOwn(templateTags, tag));
  if (unknown.length) throw new TemplateInputError("Unknown tags: " + unknown.join(", "));
  const withoutTags = (subject + clean).replace(/\{\{\s*[^{}]+?\s*\}\}/g, "");
  if (hasUnresolvedTags(withoutTags)) throw new TemplateInputError("A tag is incomplete. Use the Insert tag menu to add it again.");
  // Tags are text, not attributes/URLs. Formatting across a tag would stop it resolving.
  if (/<[^>]*\{\{/.test(clean) || tagsIn(clean).some(tag => /[<>]/.test(tag))) throw new TemplateInputError("Keep each tag together as plain text, outside links.");
  return clean;
}

export async function saveEmailTemplate(form: FormData) {
  return templateResult(async () => {
  const { workspaceId } = await requireTenantOrThrow();
  const key = z.string().parse(form.get("key"));
  if (!starterTemplates.some(item => item.key === key)) throw new TemplateInputError("Template unavailable.");
  const name = z.string().trim().min(1).max(80).parse(form.get("name"));
  const subject = z.string().trim().min(1).max(998).regex(/^[^\r\n]+$/).parse(form.get("subject"));
  const bodyHtml = validateTemplate(subject, z.string().max(200000).parse(form.get("bodyHtml")));
  const previous = z.string().max(100).parse(form.get("revision") ?? "");
  const revision = randomUUID();
  const values = { name, subject, bodyHtml, revision, updatedAt: new Date() };
  const result = previous ? await db.update(emailTemplates).set(values).where(and(eq(emailTemplates.workspaceId, workspaceId), eq(emailTemplates.key, key), eq(emailTemplates.revision, previous))).returning({ id: emailTemplates.id })
    : await db.insert(emailTemplates).values({ ...values, workspaceId, key }).onConflictDoNothing().returning({ id: emailTemplates.id });
  if (!result.length) throw new TemplateInputError("This template changed in another window. Reload Settings before saving again; your edits are still here.");
  revalidatePath("/settings/templates");
  return { revision, bodyHtml };
  });
}

export async function prepareTemplateDraft(form: FormData) {
  return templateResult(async () => {
  const tenant = await requireTenantOrThrow();
  const key = z.string().parse(form.get("key"));
  const template = (await workspaceTemplates(tenant.workspaceId)).find(item => item.key === key);
  if (!template) throw new TemplateInputError("Template unavailable.");
  // Settings can preview unsaved edits; compose uses the saved workspace template.
  const subject = form.has("previewSubject") ? z.string().max(998).parse(form.get("previewSubject")) : template.subject;
  const bodyHtml = form.has("previewHtml") ? validateTemplate(subject, z.string().max(200000).parse(form.get("previewHtml"))) : template.bodyHtml;
  const context = await contactTemplateContext(tenant.workspaceId, z.uuid().parse(form.get("contactId")), tenant.userName, tenant.workspaceName);
  const fields = z.record(z.string().max(80), z.string().max(1000)).parse(JSON.parse(z.string().max(16000).parse(form.get("fields") ?? "{}")));
  const values: Record<string, string> = { ...context.values };
  for (const [tag, value] of Object.entries(fields)) {
    if (Object.hasOwn(templateTags, tag) && !tag.startsWith("invoice_") && !values[tag]) values[tag] = value;
  }
  const needsInvoice = tagsIn(subject + bodyHtml).some(tag => tag.startsWith("invoice_"));
  const today = new Date().toISOString().slice(0, 10);
  const invoices = context.invoices.filter(inv => template.invoiceMode === "overdue" ? inv.dueDate < today : template.invoiceMode === "open" ? inv.dueDate >= today : true);
  const invoiceNumber = z.string().max(200).parse(form.get("invoiceNumber") ?? "");
  const matches = invoices.filter(inv => inv.number === invoiceNumber);
  if (needsInvoice && invoiceNumber && matches.length !== 1) throw new TemplateInputError("That invoice is no longer eligible. Choose a current invoice and try again.");
  const invoice = needsInvoice ? matches[0] : undefined;
  if (invoice) {
    if (!context.currency || !/^[A-Z]{3}$/.test(context.currency)) throw new TemplateInputError("The books currency is unavailable. Sync the connected books before using an invoice template.");
    values.invoice_number = invoice.number;
    values.invoice_balance = new Intl.NumberFormat("en-CA", { style: "currency", currency: context.currency, currencyDisplay: "code" }).format(invoice.outstandingCents / 100);
    values.invoice_due_date = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(invoice.dueDate + "T00:00:00Z"));
  }
  const rendered = renderEmailTemplate({ subject, bodyHtml }, values);
  const safe = prepareEmailBody("", rendered.bodyHtml);
  return { ...rendered, bodyHtml: sanitizeEmailHtml(rendered.bodyHtml), text: safe.text, needsInvoice, invoices, lastSyncAt: context.lastSyncAt,
    invoiceReference: invoice ? { number: invoice.number, dueDate: invoice.dueDate, outstandingCents: invoice.outstandingCents, mode: template.invoiceMode, currency: context.currency! } : null };
  });
}
