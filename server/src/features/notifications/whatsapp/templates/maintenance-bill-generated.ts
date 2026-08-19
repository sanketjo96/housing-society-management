import type { MaintenanceBillGeneratedEvent } from '../../notification.types';
import type { WhatsAppTemplate } from '../whatsapp.types';
import { formatInr, formatDateForTemplate } from './format';

// Meta-approved template name (requirements.md §5) — confirm approval before Task 7
// runs against production; the Cloud API rejects an unapproved/unknown template name
// as a permanent error (see whatsapp.client.ts).
export const MAINTENANCE_BILL_GENERATED_TEMPLATE_NAME = 'maintenance_bill_generated';

// Body placeholders, in order: {{1}} billing month, {{2}} amount, {{3}} due date.
export function buildMaintenanceBillGeneratedTemplate(
  data: MaintenanceBillGeneratedEvent['data'],
): WhatsAppTemplate {
  return {
    name: MAINTENANCE_BILL_GENERATED_TEMPLATE_NAME,
    languageCode: 'en',
    components: [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: data.billingMonth },
          { type: 'text', text: formatInr(data.amount) },
          { type: 'text', text: formatDateForTemplate(data.dueDate) },
        ],
      },
    ],
  };
}
