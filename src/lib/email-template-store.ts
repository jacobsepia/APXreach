import { and, asc, eq, gt } from "drizzle-orm";
import { companies, connections, contacts, db, emailTemplates, syncedInvoices } from "@/db";
import { starterTemplates, type EmailTemplate } from "./email-templates";
import { sanitizeEmailHtml } from "./email-content";

export async function workspaceTemplates(workspaceId: string): Promise<EmailTemplate[]> {
  const overrides = await db.select().from(emailTemplates).where(eq(emailTemplates.workspaceId, workspaceId));
  return starterTemplates.map(base => {
    const saved = overrides.find(row => row.key === base.key);
    return saved ? { ...base, name: saved.name, subject: saved.subject, bodyHtml: sanitizeEmailHtml(saved.bodyHtml), revision: saved.revision } : base;
  });
}

export async function contactTemplateContext(workspaceId: string, contactId: string, senderName: string, workspaceName: string) {
  const [contact] = await db.select().from(contacts).where(and(eq(contacts.workspaceId, workspaceId), eq(contacts.id, contactId))).limit(1);
  if (!contact) throw new Error("Contact unavailable.");
  const [company] = contact.companyId ? await db.select().from(companies).where(and(eq(companies.workspaceId, workspaceId), eq(companies.id, contact.companyId))).limit(1) : [];
  const invoices = company ? await db.select({ number: syncedInvoices.number, dueDate: syncedInvoices.dueDate, outstandingCents: syncedInvoices.outstandingCents, updatedAt: syncedInvoices.updatedAt }).from(syncedInvoices)
    .where(and(eq(syncedInvoices.workspaceId, workspaceId), eq(syncedInvoices.companyId, company.id), gt(syncedInvoices.outstandingCents, 0)))
    .orderBy(asc(syncedInvoices.dueDate), asc(syncedInvoices.number)) : [];
  const [connection] = await db.select({ currency: connections.baseCurrency, lastSyncAt: connections.lastSyncAt }).from(connections).where(eq(connections.workspaceId, workspaceId)).limit(1);
  return { values: { first_name: contact.firstName, last_name: contact.lastName, company_name: company?.name ?? "", sender_name: senderName, sender_company: workspaceName }, invoices, currency: connection?.currency ?? null, lastSyncAt: connection?.lastSyncAt ?? null };
}
