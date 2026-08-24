import type { DepositPaymentApprovedEvent } from '../../notification.types';
import type { NotificationEmailContent } from '../email.types';
import { formatInr, formatDateForTemplate } from '../../templates/format';

export function buildDepositPaymentApprovedEmail(
  data: DepositPaymentApprovedEvent['data'],
): NotificationEmailContent {
  const amount = formatInr(data.amount);
  const paymentDate = formatDateForTemplate(data.paymentDate);

  return {
    subject: `Payment of ${amount} approved`,
    html: `<p>Your payment of <strong>${amount}</strong> on <strong>${paymentDate}</strong> has been approved.</p>
<p>The receipt is available in the resident portal.</p>`,
    text: `Your payment of ${amount} on ${paymentDate} has been approved.\n\nThe receipt is available in the resident portal.`,
  };
}
