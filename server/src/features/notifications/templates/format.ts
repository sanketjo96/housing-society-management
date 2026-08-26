// Formatting helpers shared by the WhatsApp and email notification templates.
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
