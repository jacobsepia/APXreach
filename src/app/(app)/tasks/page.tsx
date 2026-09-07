import Link from "next/link";
import { and, asc, eq, isNull } from "drizzle-orm";
import { activities, companies, db } from "@/db";
import { requireTenant } from "@/lib/workspace";
import { Card, PageHeader } from "@/components/ui";
import { QuickCreate } from "@/components/quick-create";
import { TaskCheckbox } from "@/components/task-checkbox";
import { RecordActions } from "@/components/record-actions";

export const dynamic = "force-dynamic";

export const metadata = { title: "Tasks" };

const stamp = new Intl.DateTimeFormat("en-CA", {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export default async function TasksPage() {
  const tenant = await requireTenant();
  const [rows, companyOptions] = await Promise.all([
    db
      .select({
        id: activities.id,
        subject: activities.subject,
        dueAt: activities.dueAt,
        actorName: activities.actorName,
        companyId: activities.companyId,
        companyName: companies.name,
      })
      .from(activities)
      .leftJoin(companies, eq(activities.companyId, companies.id))
      .where(and(eq(activities.type, "task"), isNull(activities.completedAt), eq(activities.workspaceId, tenant.workspaceId)))
      .orderBy(asc(activities.dueAt)),
    db.select({ id: companies.id, name: companies.name }).from(companies).where(eq(companies.workspaceId, tenant.workspaceId)).orderBy(companies.name),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Tasks"
        subtitle={`${rows.length} open · tick one off and it leaves the list`}
        actions={<QuickCreate companies={companyOptions} stages={[]} only="task" buttonLabel="New task" />}
      />
      <Card index={0} className="overflow-hidden">
        {rows.map((task, i) => {
          const overdue =
            task.dueAt !== null &&
            task.dueAt.getTime() < Date.now() &&
            task.dueAt.toDateString() !== new Date().toDateString();
          return (
            <div
              key={task.id}
              className={`flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-[var(--tint)] ${i < rows.length - 1 ? "border-b border-[var(--rule-soft)]" : ""}`}
            >
              <TaskCheckbox taskId={task.id} />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium text-foreground">{task.subject}</div>
                <div className="text-xs text-[var(--text-tertiary)]">
                  {task.companyId ? (
                    <Link href={`/companies/${task.companyId}`} className="hover:text-foreground">
                      {task.companyName}
                    </Link>
                  ) : (
                    "No record"
                  )}
                  {task.actorName ? ` · ${task.actorName}` : ""}
                </div>
              </div>
              <span
                className={`shrink-0 text-right text-xs ${overdue ? "font-semibold text-[#b91c1c]" : "text-[var(--text-tertiary)]"}`}
              >
                {task.dueAt ? (overdue ? "Overdue — " : "") + stamp.format(task.dueAt) : "No due date"}
              </span>
              <RecordActions
                kind="task"
                id={task.id}
                name={task.subject}
                companies={companyOptions}
                values={{
                  subject: task.subject,
                  dueAt: task.dueAt?.toISOString() ?? null,
                  companyId: task.companyId,
                  ownerName: task.actorName,
                }}
              />
            </div>
          );
        })}
        {rows.length === 0 && (
          <p className="px-4 py-6 text-sm text-muted-foreground">Nothing open.</p>
        )}
      </Card>
    </div>
  );
}
