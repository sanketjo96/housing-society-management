// Small formatting helpers shared by the WhatsApp and email notification templates.
// Same 'en-IN' locale convention already used ad hoc in escalation.ts/receipt-pdf.ts.
// Originally lived under whatsapp/templates/ ("kept local... since nothing outside
// these three files needs it yet") — promoted up a level (2026-08-24) once the email
// channel's templates needed the exact same formatting.
export function formatInr(amount: number): string {
  return `Rs. ${amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
}

export function formatDateForTemplate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
