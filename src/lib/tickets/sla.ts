/*
 * The service promise, as arithmetic. Two clocks per ticket: how long until
 * someone first answers, and how long until it is resolved. Both start when
 * the ticket is opened and are set by its priority.
 */

export const priorities = ["urgent", "high", "normal", "low"] as const;
export type Priority = (typeof priorities)[number];

export const priorityLabels: Record<Priority, string> = { urgent: "Urgent", high: "High", normal: "Normal", low: "Low" };

/** Hours. Business hours would be fairer; wall-clock is honest and simple, and stated as such on the page. */
export const slaHours: Record<Priority, { respond: number; resolve: number }> = {
  urgent: { respond: 2, resolve: 24 },
  high: { respond: 4, resolve: 72 },
  normal: { respond: 8, resolve: 120 },
  low: { respond: 24, resolve: 240 },
};

export function isPriority(value: unknown): value is Priority {
  return typeof value === "string" && (priorities as readonly string[]).includes(value);
}

export function slaDeadlines(priority: Priority, openedAt: Date): { firstResponseDueAt: Date; resolveDueAt: Date } {
  const hours = slaHours[priority];
  return {
    firstResponseDueAt: new Date(openedAt.getTime() + hours.respond * 3_600_000),
    resolveDueAt: new Date(openedAt.getTime() + hours.resolve * 3_600_000),
  };
}

/** "45m", "3h", "2d" — the size of a wait, the way people say it. */
export function duration(ms: number): string {
  const minutes = Math.round(Math.abs(ms) / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

export type SlaState = { label: string; tone: "ok" | "soon" | "breached" | "done" };

export function slaState(
  ticket: { status: string; createdAt: Date; firstRespondedAt: Date | null; resolvedAt: Date | null; firstResponseDueAt: Date; resolveDueAt: Date },
  now: Date = new Date(),
): SlaState {
  if (ticket.status === "resolved" || ticket.resolvedAt) {
    const took = (ticket.resolvedAt ?? now).getTime() - ticket.createdAt.getTime();
    const late = ticket.resolvedAt && ticket.resolvedAt > ticket.resolveDueAt;
    return { label: `Resolved in ${duration(took)}${late ? ", past its deadline" : ""}`, tone: "done" };
  }
  const waitingOnFirstReply = !ticket.firstRespondedAt;
  const due = waitingOnFirstReply ? ticket.firstResponseDueAt : ticket.resolveDueAt;
  const remaining = due.getTime() - now.getTime();
  const verb = waitingOnFirstReply ? "Respond" : "Resolve";
  if (remaining < 0) return { label: `${waitingOnFirstReply ? "Response" : "Resolution"} overdue by ${duration(remaining)}`, tone: "breached" };
  const total = due.getTime() - ticket.createdAt.getTime();
  const soon = remaining < 3_600_000 || remaining < total * 0.25;
  return { label: `${verb} within ${duration(remaining)}`, tone: soon ? "soon" : "ok" };
}
