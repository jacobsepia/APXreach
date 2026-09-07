import { asc, eq } from "drizzle-orm";
import { contacts, db } from "@/db";
import { requireTenant } from "@/lib/workspace";
import { workspaceTemplates } from "@/lib/email-template-store";
import { TemplateSettings } from "@/components/template-settings";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Email templates" };
export default async function TemplatesPage() {
  const { workspaceId } = await requireTenant();
  const [templates, people] = await Promise.all([
    workspaceTemplates(workspaceId),
    db.select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName }).from(contacts).where(eq(contacts.workspaceId, workspaceId)).orderBy(asc(contacts.firstName)).limit(100),
  ]);
  return (
    <div className="flex max-w-6xl flex-col gap-4">
      <PageHeader
        title="Email templates"
        subtitle="Ten useful starting points, in your own voice. Saved changes are shared only within your workspace."
        back={{ href: "/settings", label: "Settings" }}
      />
      <TemplateSettings templates={templates} contacts={people} />
    </div>
  );
}
