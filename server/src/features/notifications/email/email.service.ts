// Resolve recipient + template, then hand off to the swappable EmailProvider
// (infrastructure/email). Resolves the address fresh at delivery time — never
// persisted on the event.
import { prisma } from '../../../infrastructure/prisma/client';
import { getEmailProvider } from '../../../infrastructure/email';
import type { NotificationEvent, NotificationEventType } from '../notification.types';
import { buildMaintenanceBillGeneratedEmail } from './templates/maintenance-bill-generated';
import { buildDepositPaymentApprovedEmail } from './templates/deposit-payment-approved';
import { buildOtherChargeBilledEmail } from './templates/other-charge-billed';
import {
  EmailPermanentError,
  EmailTransientError,
  type NotificationEmailContent,
  type SendEmailForNotificationResult,
} from './email.types';

function buildEmailContent(eventType: NotificationEventType, payload: unknown): NotificationEmailContent {
  switch (eventType) {
    case 'MAINTENANCE_BILL_GENERATED':
      return buildMaintenanceBillGeneratedEmail(
        payload as Extract<NotificationEvent, { eventType: 'MAINTENANCE_BILL_GENERATED' }>['data'],
      );
    case 'DEPOSIT_PAYMENT_APPROVED':
      return buildDepositPaymentApprovedEmail(
        payload as Extract<NotificationEvent, { eventType: 'DEPOSIT_PAYMENT_APPROVED' }>['data'],
      );
    case 'OTHER_CHARGE_BILLED':
      return buildOtherChargeBilledEmail(
        payload as Extract<NotificationEvent, { eventType: 'OTHER_CHARGE_BILLED' }>['data'],
      );
    default: {
      const exhaustive: never = eventType;
      throw new EmailPermanentError(`Unknown notification eventType: ${String(exhaustive)}`);
    }
  }
}

export interface DeliverableNotification {
  eventType: string;
  recipientUserId: string;
  payload: unknown;
}

// User.email is required+unique at the schema level — the only way it's missing
// here is the User row having been deleted since the event was created.
export async function sendEmailForNotification(
  row: DeliverableNotification,
): Promise<SendEmailForNotificationResult> {
  const user = await prisma.user.findUnique({
    where: { id: row.recipientUserId },
    select: { email: true },
  });
  if (!user) {
    throw new EmailPermanentError(`Recipient ${row.recipientUserId} not found`);
  }

  const content = buildEmailContent(row.eventType as NotificationEventType, row.payload);

  try {
    await getEmailProvider().send({ to: user.email, subject: content.subject, html: content.html, text: content.text });
  } catch (err) {
    // EmailProvider doesn't distinguish transient vs. permanent — default to
    // transient so a retry is attempted.
    throw new EmailTransientError(err instanceof Error ? err.message : String(err));
  }

  return { providerMessageId: null };
}
