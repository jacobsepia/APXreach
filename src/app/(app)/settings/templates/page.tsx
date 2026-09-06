import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { contacts, db } from "@/db";
import { requireTenant } from "@/lib/workspace";
import { workspaceTemplates } from "@/lib/email-template-store";
import { TemplateSettings } from "@/components/template-settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Email templates" };
export default async function TemplatesPage() {
  const { workspaceId } = await requireTenant();
  const [templates, people] = await Promise.all([
    workspaceTemplates(workspaceId),
    db.select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName }).from(contacts).where(eq(contacts.workspaceId, workspaceId)).orderBy(asc(contacts.firstName)).limit(100),
  ]);
  return <div className="max-w-6xl"><Link href="/settings" className="text-xs text-muted-foreground">← Settings</Link><h1 className="mt-3 font-display text-2xl font-bold">Email templates</h1><p className="mt-1 mb-5 text-sm text-muted-foreground">Ten useful starting points, in your own voice. Saved changes are shared only within your workspace.</p><TemplateSettings templates={templates} contacts={people} /></div>;
}
