import { ConsoleEmailProvider } from './console-email-provider';
import { ResendEmailProvider } from './resend-email-provider';
import type { EmailProvider } from './types';
import { env } from '../../config/env';

export type { EmailProvider, SendEmailInput } from './types';

// Picks the EmailProvider implementation from EMAIL_PROVIDER. 'sendgrid' is a
// named extension point, not implemented.
export function getEmailProvider(): EmailProvider {
  const provider = env('EMAIL_PROVIDER', 'console');
  switch (provider) {
    case 'console':
      return new ConsoleEmailProvider();
    case 'resend': {
      const apiKey = env('RESEND_API_KEY');
      const from = env('EMAIL_FROM');
      if (!apiKey) throw new Error('EMAIL_PROVIDER=resend requires RESEND_API_KEY to be set');
      if (!from) throw new Error('EMAIL_PROVIDER=resend requires EMAIL_FROM to be set');
      return new ResendEmailProvider(apiKey, from);
    }
    case 'sendgrid':
      throw new Error(
        'EMAIL_PROVIDER=sendgrid is a named extension point but has no provider implemented yet — ' +
          'implement EmailProvider (src/infrastructure/email/types.ts) and add a case here.',
      );
    default:
      throw new Error(`Unknown EMAIL_PROVIDER: ${provider}`);
  }
}
