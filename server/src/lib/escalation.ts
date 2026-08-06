// Rule 8 (CLAUDE.md): a maintenance record unpaid past its due date + a grace period
// flags the flat. Pure functions — no Prisma/DB types — so the "is this actually
// overdue" and "what does the reminder say" logic is unit-testable without a database
// and reusable from both the dashboard widget (Task 8.4) and any future automated
// trigger (out of scope this phase — CLAUDE.md's rule 8 is explicit that sharing stays
// manual, no auto-post).

export const DEFAULT_GRACE_PERIOD_DAYS = 7;

export function isOverdue(dueDate: Date, gracePeriodDays: number, now: Date = new Date()): boolean {
  const graceDeadline = new Date(dueDate);
  graceDeadline.setDate(graceDeadline.getDate() + gracePeriodDays);
  return now > graceDeadline;
}

export interface EscalationMessageInput {
  recipientName: string;
  wing: string;
  flatNumber: string;
  outstandingTotal: number;
  oldestDueDate: Date;
  societyName: string;
}

// A ready-to-copy reminder — rule 8: "prepares a message; admin manually shares it (no
// auto-post to WhatsApp)". Deliberately plain text, no markup, so it pastes cleanly
// into WhatsApp/SMS/email as-is.
export function buildEscalationMessage(input: EscalationMessageInput): string {
  const dueDateLabel = input.oldestDueDate.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return (
    `Dear ${input.recipientName}, this is a reminder from ${input.societyName} that your maintenance ` +
    `dues for flat ${input.wing}-${input.flatNumber} totalling ₹${input.outstandingTotal.toLocaleString('en-IN')} ` +
    `have been overdue since ${dueDateLabel}. Please make the payment at the earliest to avoid further ` +
    `escalation. Thank you.`
  );
}
