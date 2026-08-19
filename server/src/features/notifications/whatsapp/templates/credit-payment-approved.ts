import type { CreditPaymentApprovedEvent } from '../../notification.types';
import type { WhatsAppTemplate } from '../whatsapp.types';
import { formatInr, formatDateForTemplate } from './format';

export const CREDIT_PAYMENT_APPROVED_TEMPLATE_NAME = 'credit_payment_approved';

// Body placeholders, in order: {{1}} amount, {{2}} payment date.
export function buildCreditPaymentApprovedTemplate(
  data: CreditPaymentApprovedEvent['data'],
): WhatsAppTemplate {
  return {
    name: CREDIT_PAYMENT_APPROVED_TEMPLATE_NAME,
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
