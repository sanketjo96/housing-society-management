import { ConsoleEmailProvider } from './console-email-provider';
import { ResendEmailProvider } from './resend-email-provider';
import type { EmailProvider } from './types';

export type { EmailProvider, SendEmailInput } from './types';

// Same "one env var picks the implementation, factory is the only place that imports a
// concrete class" shape as src/lib/storage's getStorageAdapter. 'console' (default)
// logs instead of sending — 'resend' is the first real provider, matching CLAUDE.md's
// tech-stack table ("Resend or SendGrid, behind a swappable EmailProvider interface").
// 'sendgrid' is named as the documented alternative but not implemented — implement
// EmailProvider (./types.ts) and add a case here if this project ever needs it.
export function getEmailProvider(): EmailProvider {
  const provider = process.env.EMAIL_PROVIDER ?? 'console';
  switch (provider) {
    case 'console':
      return new ConsoleEmailProvider();
    case 'resend': {
      const apiKey = process.env.RESEND_API_KEY;
      const from = process.env.EMAIL_FROM;
      if (!apiKey) throw new Error('EMAIL_PROVIDER=resend requires RESEND_API_KEY to be set');
      if (!from) throw new Error('EMAIL_PROVIDER=resend requires EMAIL_FROM to be set');
      return new ResendEmailProvider(apiKey, from);
    }
    case 'sendgrid':
      throw new Error(
        'EMAIL_PROVIDER=sendgrid is a named extension point but has no provider implemented yet — ' +
          'implement EmailProvider (src/lib/email/types.ts) and add a case here.',
      );
    default:
      throw new Error(`Unknown EMAIL_PROVIDER: ${provider}`);
  }
}
