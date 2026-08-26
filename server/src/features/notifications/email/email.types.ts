// Mirrors whatsapp.types.ts's error pair — deliverPending() branches retry
// behavior on which of these was thrown.
export class EmailTransientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmailTransientError';
  }
}

export class EmailPermanentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmailPermanentError';
  }
}

export interface NotificationEmailContent {
  subject: string;
  html: string;
  text: string;
}

export interface SendEmailForNotificationResult {
  // EmailProvider.send() returns void, so this is always null.
  providerMessageId: string | null;
}
