// Meta WhatsApp Cloud API's template-message component shape — narrowed to the one
// shape this app actually sends (a single body component, text-only parameters).
// See https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages.
export interface WhatsAppTemplateComponent {
  type: 'body';
  parameters: Array<{ type: 'text'; text: string }>;
}

export interface WhatsAppTemplate {
  name: string;
  languageCode: string;
  components: WhatsAppTemplateComponent[];
}

export interface SendWhatsAppTemplateInput {
  to: string; // E.164
  template: WhatsAppTemplate;
}

export interface SendWhatsAppTemplateResult {
  providerMessageId: string;
}

// notification.service.ts's deliverPending() branches retry behavior on which of
// these was thrown — never on a raw HTTP status or Meta error code, so that decision
// stays inside the WhatsApp layer (architecture.md §4's "normalize provider errors").
export class WhatsAppTransientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WhatsAppTransientError';
  }
}

export class WhatsAppPermanentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WhatsAppPermanentError';
  }
}
