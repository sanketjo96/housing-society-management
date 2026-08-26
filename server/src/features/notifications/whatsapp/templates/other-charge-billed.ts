import type { OtherChargeBilledEvent } from '../../notification.types';
import type { WhatsAppTemplate } from '../whatsapp.types';
import { formatInr, formatDateForTemplate } from '../../templates/format';

// Meta-approved template name — the Cloud API rejects an unapproved/unknown name
// as a permanent error.
export const OTHER_CHARGE_BILLED_TEMPLATE_NAME = 'other_charge_billed';

// Body placeholders, in order: {{1}} fee type name, {{2}} amount, {{3}} due date.
export function buildOtherChargeBilledTemplate(
  data: OtherChargeBilledEvent['data'],
): WhatsAppTemplate {
  return {
    name: OTHER_CHARGE_BILLED_TEMPLATE_NAME,
    languageCode: 'en',
    components: [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: data.feeTypeName },
          { type: 'text', text: formatInr(data.amount) },
          { type: 'text', text: formatDateForTemplate(data.dueDate) },
        ],
      },
    ],
  };
}
