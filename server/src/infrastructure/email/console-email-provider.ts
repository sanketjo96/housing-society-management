import type { EmailProvider, SendEmailInput } from './types';

// Default provider (EMAIL_PROVIDER unset, or 'console') — logs instead of sending.
// This is exactly what password-reset.service.ts's sendResetEmailStub did inline
// before this interface existed; kept as the dev/test default so `npm test` and local
// `npm run dev` never need a real RESEND_API_KEY. tests/setup.ts relies on this
// being the default — it never sets EMAIL_PROVIDER.
//
// Deliberately exempt from the observability console.* sweep (docs/observablity/):
// this console.log IS the provider's send implementation, not diagnostic logging —
// routing real email subject/body through the structured logger would mix an ops-log
// stream with user content for no benefit.
export class ConsoleEmailProvider implements EmailProvider {
  async send(input: SendEmailInput): Promise<void> {
    console.log(`[console-email] To: ${input.to} | Subject: ${input.subject}\n${input.text}`);
  }
}
