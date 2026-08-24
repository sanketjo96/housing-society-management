// Mirrors whatsapp/whatsapp.types.ts's error pair — notification.service.ts's
// deliverPending() branches retry behavior on which of these was thrown, same as it
// already does for the WhatsApp channel (architecture.md §4's "normalize provider
// errors" applies per-channel).
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
  // Resend's own message id isn't threaded through EmailProvider.send() (its
  // interface returns void — used elsewhere by the password-reset flow, which never
  // needed one) — always null for now rather than widening that interface for a
  // value nothing currently reads.
  providerMessageId: string | null;
}
