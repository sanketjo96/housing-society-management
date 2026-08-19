import type { OtherChargeBilledEvent } from '../../notification.types';
import type { WhatsAppTemplate } from '../whatsapp.types';
import { formatInr, formatDateForTemplate } from './format';

// Meta-approved template name (docs/other-charges/04-roadmap.md — submit as soon as
// this code ships, not at the end of the whole feature; approval lead time runs in
// parallel). The Cloud API rejects an unapproved/unknown template name as a
// permanent error (see whatsapp.client.ts).
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
