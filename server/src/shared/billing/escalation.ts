// A maintenance record unpaid past due date + grace period flags the flat.
// Pure functions, no DB types.

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

// Plain text, no markup, so it pastes cleanly into WhatsApp/SMS/email.
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
