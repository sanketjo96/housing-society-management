import { Resend } from 'resend';
import type { EmailProvider, SendEmailInput } from './types';

export class ResendEmailProvider implements EmailProvider {
  private readonly client: Resend;

  constructor(
    apiKey: string,
    private readonly from: string,
  ) {
    this.client = new Resend(apiKey);
  }

  async send(input: SendEmailInput): Promise<void> {
    const { error } = await this.client.emails.send({
      from: this.from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
    if (error) {
      throw new Error(`Resend email send failed: ${error.message}`);
    }
  }
}
