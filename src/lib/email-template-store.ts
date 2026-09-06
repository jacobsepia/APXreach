import { and, asc, eq, gt } from "drizzle-orm";
import { companies, connections, contacts, db, emailTemplates, mailboxes, syncedInvoices } from "@/db";
import { starterTemplates, type EmailTemplate } from "./email-templates";
import { sanitizeEmailHtml } from "./email-content";

export async function workspaceTemplates(workspaceId: string): Promise<EmailTemplate[]> {
  const overrides = await db.select().from(emailTemplates).where(eq(emailTemplates.workspaceId, workspaceId));
  return starterTemplates.map(base => {
    const saved = overrides.find(row => row.key === base.key);
    // Upgrade only the former standard sign-off; leave custom signatures intact.
    const bodyHtml = saved?.bodyHtml.replace(/<p>Best,<br\s*\/?>\s*\{\{sender_name\}\}\s*<\/p>\s*$/, "<p>Best,<br>{{sender_signature}}</p>");
    return saved ? { ...base, name: saved.name, subject: saved.subject, bodyHtml: sanitizeEmailHtml(bodyHtml!), revision: saved.revision } : base;
  });
}

export async function contactTemplateContext(workspaceId: string, contactId: string, senderName: string, workspaceName: string, userId?: string) {
  const [contact] = await db.select().from(contacts).where(and(eq(contacts.workspaceId, workspaceId), eq(contacts.id, contactId))).limit(1);
  if (!contact) throw new Error("Contact unavailable.");
  const [company] = contact.companyId ? await db.select().from(companies).where(and(eq(companies.workspaceId, workspaceId), eq(companies.id, contact.companyId))).limit(1) : [];
  const invoices = company ? await db.select({ number: syncedInvoices.number, dueDate: syncedInvoices.dueDate, outstandingCents: syncedInvoices.outstandingCents, updatedAt: syncedInvoices.updatedAt }).from(syncedInvoices)
    .where(and(eq(syncedInvoices.workspaceId, workspaceId), eq(syncedInvoices.companyId, company.id), gt(syncedInvoices.outstandingCents, 0)))
    .orderBy(asc(syncedInvoices.dueDate), asc(syncedInvoices.number)) : [];
  const [connection] = await db.select({ currency: connections.baseCurrency, lastSyncAt: connections.lastSyncAt }).from(connections).where(eq(connections.workspaceId, workspaceId)).limit(1);
  const [mailbox] = userId ? await db.select({ email: mailboxes.emailAddress }).from(mailboxes).where(and(eq(mailboxes.workspaceId, workspaceId), eq(mailboxes.userId, userId), eq(mailboxes.status, "connected"))).limit(1) : [];
  return { values: { first_name: contact.firstName, last_name: contact.lastName, company_name: company?.name ?? "", sender_name: senderName, sender_company: workspaceName, sender_email: mailbox?.email ?? "" }, invoices, currency: connection?.currency ?? null, lastSyncAt: connection?.lastSyncAt ?? null };
}
