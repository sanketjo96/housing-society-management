import type { WhatsAppTemplate } from '../whatsapp.types';

// Meta's built-in pre-approved sample template, no body parameters, language
// en_US. Only used when WHATSAPP_TEST_MODE=true.
export const HELLO_WORLD_TEMPLATE_NAME = 'hello_world';

export function buildHelloWorldTemplate(): WhatsAppTemplate {
  return {
    name: HELLO_WORLD_TEMPLATE_NAME,
    languageCode: 'en_US',
    components: [],
  };
}
