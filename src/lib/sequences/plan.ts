/*
 * The decisions a sequence makes, with no database in sight so they can be
 * tested with plain values: when the next step is due, and whether to stop.
 */

export type StepPlan = { position: number; dayOffset: number; templateKey: string };

/** Day offsets count from enrolment, so a step's date never drifts with a late run. */
export function dueAt(startedAt: Date, step: StepPlan): Date {
  return new Date(startedAt.getTime() + step.dayOffset * 86_400_000);
}

export type StopInput = {
  stopWhenPaid: boolean;
  stopOnReply: boolean;
  kind: "collections" | "relationship" | string;
  /** The invoice enrolled against, if any, and whether the books still show it open. */
  invoiceNumber: string | null;
  invoiceOpen: boolean;
  /** Whether the company has anything overdue at all, for a chase with no invoice named. */
  overdueCents: number;
  /** Whether the contact has written back since enrolment. */
  replied: boolean;
};

/** The reason to stop, in the words shown on the record, or null to carry on. */
export function stopReason(input: StopInput): string | null {
  if (input.stopOnReply && input.replied) return "They replied";
  if (input.stopWhenPaid) {
    if (input.invoiceNumber) {
      if (!input.invoiceOpen) return `Invoice ${input.invoiceNumber} paid`;
    } else if (input.kind === "collections" && input.overdueCents <= 0) {
      return "Nothing overdue";
    }
  }
  return null;
}

export function describeStep(step: StepPlan, templateName: string): string {
  return `${step.dayOffset === 0 ? "On enrolment" : `Day ${step.dayOffset}`} · ${templateName}`;
}
