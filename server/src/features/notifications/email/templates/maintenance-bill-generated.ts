import type { MaintenanceBillGeneratedEvent } from '../../notification.types';
import type { NotificationEmailContent } from '../email.types';
import { formatInr, formatDateForTemplate } from '../../templates/format';

export function buildMaintenanceBillGeneratedEmail(
  data: MaintenanceBillGeneratedEvent['data'],
): NotificationEmailContent {
  const amount = formatInr(data.amount);
  const dueDate = formatDateForTemplate(data.dueDate);

  return {
    subject: `Maintenance bill for ${data.billingMonth} — ${amount} due ${dueDate}`,
    html: `<p>Your maintenance bill for <strong>${data.billingMonth}</strong> has been generated.</p>
<p>Amount due: <strong>${amount}</strong><br/>Due date: <strong>${dueDate}</strong></p>
<p>Log in to the resident portal to view details and pay.</p>`,
    text: `Your maintenance bill for ${data.billingMonth} has been generated.\nAmount due: ${amount}\nDue date: ${dueDate}\n\nLog in to the resident portal to view details and pay.`,
  };
}
