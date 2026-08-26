import type { EmailProvider, SendEmailInput } from './types';

// Default provider — logs instead of sending, so dev/test never need a real
// RESEND_API_KEY.
export class ConsoleEmailProvider implements EmailProvider {
  async send(input: SendEmailInput): Promise<void> {
    console.log(`[console-email] To: ${input.to} | Subject: ${input.subject}\n${input.text}`);
  }
}
