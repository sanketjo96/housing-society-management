// Small formatting helpers shared by the three WhatsApp templates. Same 'en-IN'
// locale convention already used ad hoc in escalation.ts/receipt-pdf.ts — kept local
// to this templates/ folder rather than promoted to a shared lib, since nothing
// outside these three files needs it yet.
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
