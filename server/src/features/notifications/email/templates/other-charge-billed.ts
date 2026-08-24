import type { OtherChargeBilledEvent } from '../../notification.types';
import type { NotificationEmailContent } from '../email.types';
import { formatInr, formatDateForTemplate } from '../../templates/format';

export function buildOtherChargeBilledEmail(data: OtherChargeBilledEvent['data']): NotificationEmailContent {
  const amount = formatInr(data.amount);
  const dueDate = formatDateForTemplate(data.dueDate);

  return {
    subject: `${data.feeTypeName} charge of ${amount} — due ${dueDate}`,
    html: `<p>A new charge, <strong>${data.feeTypeName}</strong>, has been billed to your flat.</p>
<p>Amount due: <strong>${amount}</strong><br/>Due date: <strong>${dueDate}</strong></p>
<p>Log in to the resident portal to view details and pay.</p>`,
    text: `A new charge, ${data.feeTypeName}, has been billed to your flat.\nAmount due: ${amount}\nDue date: ${dueDate}\n\nLog in to the resident portal to view details and pay.`,
  };
}
