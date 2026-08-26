// Resolve recipient + template, then hand off to whatsapp.client.ts. Never talks to
// Meta directly.
import { prisma } from '../../../infrastructure/prisma/client';
import { env } from '../../../config/env';
import type { NotificationEvent, NotificationEventType } from '../notification.types';
import { sendWhatsAppTemplate } from './whatsapp.client';
import { buildMaintenanceBillGeneratedTemplate } from './templates/maintenance-bill-generated';
import { buildDepositPaymentApprovedTemplate } from './templates/deposit-payment-approved';
import { buildOtherChargeBilledTemplate } from './templates/other-charge-billed';
import { buildHelloWorldTemplate } from './templates/hello-world';
import { SendWhatsAppTemplateResult, WhatsAppPermanentError, WhatsAppTemplate } from './whatsapp.types';

// User.phone is free text (no format enforced) — usually a bare 10-digit Indian
// mobile number, sometimes with a leading 0 or separators. An unparseable number is
// a permanent failure — retrying it would just fail the same way every time.
export function normalizePhoneToE164(rawPhone: string): string {
  const stripped = rawPhone.replace(/[^\d+]/g, '');

  if (stripped.startsWith('+')) {
    if (stripped.length < 8) {
      throw new WhatsAppPermanentError(`Phone number "${rawPhone}" is not a valid E.164 number`);
    }
    return stripped;
  }

  const bare = stripped.replace(/^0+/, '');
  if (bare.length === 10) return `+91${bare}`;
  if (bare.length === 12 && bare.startsWith('91')) return `+${bare}`;

  throw new WhatsAppPermanentError(
    `Phone number "${rawPhone}" could not be normalized to E.164 (expected a 10-digit Indian mobile number or an already-E.164 value)`,
  );
}

function buildTemplate(eventType: NotificationEventType, payload: unknown): WhatsAppTemplate {
  // Test-mode override: sends Meta's pre-approved hello_world template instead of
  // the real per-event templates below. Off by default.
  if (env('WHATSAPP_TEST_MODE') === 'true') {
    return buildHelloWorldTemplate();
  }

  switch (eventType) {
    case 'MAINTENANCE_BILL_GENERATED':
      return buildMaintenanceBillGeneratedTemplate(
        payload as Extract<NotificationEvent, { eventType: 'MAINTENANCE_BILL_GENERATED' }>['data'],
      );
    case 'DEPOSIT_PAYMENT_APPROVED':
      return buildDepositPaymentApprovedTemplate(
        payload as Extract<NotificationEvent, { eventType: 'DEPOSIT_PAYMENT_APPROVED' }>['data'],
      );
    case 'OTHER_CHARGE_BILLED':
      return buildOtherChargeBilledTemplate(
        payload as Extract<NotificationEvent, { eventType: 'OTHER_CHARGE_BILLED' }>['data'],
      );
    default: {
      const exhaustive: never = eventType;
      throw new WhatsAppPermanentError(`Unknown notification eventType: ${String(exhaustive)}`);
    }
  }
}

export interface DeliverableNotification {
  eventType: string;
  recipientUserId: string;
  payload: unknown;
}

// Resolves the recipient's current WhatsApp number fresh at send time — never
// persisted on the event itself, since it can change between bill and send.
export async function sendWhatsAppForNotification(
  row: DeliverableNotification,
): Promise<SendWhatsAppTemplateResult> {
  const user = await prisma.user.findUnique({
    where: { id: row.recipientUserId },
    select: { phone: true },
  });
  if (!user?.phone) {
    throw new WhatsAppPermanentError(`Recipient ${row.recipientUserId} has no phone number on file`);
  }

  const to = normalizePhoneToE164(user.phone);
  const template = buildTemplate(row.eventType as NotificationEventType, row.payload);
  return sendWhatsAppTemplate({ to, template });
}
