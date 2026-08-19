import type { WhatsAppTemplate } from '../whatsapp.types';

// Meta's built-in sample template — exists pre-approved on every WhatsApp Business
// account by default, no body parameters, language en_US. TEMPORARY, for manual
// end-to-end testing only: lets the full notify() -> deliverPending() -> WhatsApp
// client -> Meta pipeline be proven with a real send before this society's own
// templates (maintenance_bill_generated etc.) are approved. Only used when
// WHATSAPP_TEST_MODE=true — see whatsapp.service.ts's buildTemplate(). Remove once the
// real templates are approved and this has served its purpose.
export const HELLO_WORLD_TEMPLATE_NAME = 'hello_world';

export function buildHelloWorldTemplate(): WhatsAppTemplate {
  return {
    name: HELLO_WORLD_TEMPLATE_NAME,
    languageCode: 'en_US',
    components: [],
  };
}
