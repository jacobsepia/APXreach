import Link from "next/link";
import { and, asc, eq, isNull } from "drizzle-orm";
import { activities, companies, db } from "@/db";
import { Card } from "@/components/ui";

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
  const rows = await db
    .select({
      id: activities.id,
      subject: activities.subject,
      dueAt: activities.dueAt,
      actorName: activities.actorName,
      companyId: companies.id,
      companyName: companies.name,
    })
    .from(activities)
    .leftJoin(companies, eq(activities.companyId, companies.id))
    .where(and(eq(activities.type, "task"), isNull(activities.completedAt)))
    .orderBy(asc(activities.dueAt));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-[-0.6px] text-foreground">
          Tasks
        </h1>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          {rows.length} open · completing and creating tasks lands with Phase 1 CRUD
        </p>
      </div>
      <Card className="overflow-hidden">
        {rows.map((task, i) => {
          const overdue =
            task.dueAt !== null &&
            task.dueAt.getTime() < Date.now() &&
            task.dueAt.toDateString() !== new Date().toDateString();
          return (
            <div
              key={task.id}
              className={`flex items-center gap-3 px-4 py-3 ${i < rows.length - 1 ? "border-b border-[var(--rule-soft)]" : ""}`}
            >
              <span className="size-4 shrink-0 rounded-[5px] border-[1.5px] border-[color-mix(in_srgb,var(--text-primary)_25%,transparent)]" />
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
                className={`text-xs ${overdue ? "font-semibold text-[#b91c1c]" : "text-[var(--text-tertiary)]"}`}
              >
                {task.dueAt ? (overdue ? "Overdue — " : "") + stamp.format(task.dueAt) : "No due date"}
              </span>
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
