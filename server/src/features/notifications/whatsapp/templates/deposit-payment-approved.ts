import type { DepositPaymentApprovedEvent } from '../../notification.types';
import type { WhatsAppTemplate } from '../whatsapp.types';
import { formatInr, formatDateForTemplate } from './format';

export const DEPOSIT_PAYMENT_APPROVED_TEMPLATE_NAME = 'deposit_payment_approved';

// Body placeholders, in order: {{1}} amount, {{2}} payment date.
export function buildDepositPaymentApprovedTemplate(
  data: DepositPaymentApprovedEvent['data'],
): WhatsAppTemplate {
  return {
    name: DEPOSIT_PAYMENT_APPROVED_TEMPLATE_NAME,
    languageCode: 'en',
    components: [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: formatInr(data.amount) },
          { type: 'text', text: formatDateForTemplate(data.paymentDate) },
        ],
      },
    ],
  };
}
