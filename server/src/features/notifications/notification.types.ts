// Typed event payloads for the notification feature (Phase 1: WhatsApp only — see
// docs/notification/requirements.md §2). A business feature builds one of these and
// hands it to NotificationService.notify() — it never sees NotificationLog, cron, or
// WhatsApp types (docs/notification/claude-instructions.md, rule 10).
//
// requirements.md §3: "Events represent business facts, not WhatsApp operations" and
// "Events contain recipient.userId, not a phone number" — the current WhatsApp number
// is resolved later, at delivery time, from recipient.userId (see whatsapp.service.ts).

interface NotificationEventBase {
  eventId: string;
  occurredAt: string;
  recipient: { userId: string };
}

export interface MaintenanceBillGeneratedEvent extends NotificationEventBase {
  eventType: 'MAINTENANCE_BILL_GENERATED';
  data: {
    billId: string;
    flatId: string;
    societyId: string;
    billingMonth: string;
    amount: number;
    dueDate: string;
  };
}

export interface DepositPaymentApprovedEvent extends NotificationEventBase {
  eventType: 'DEPOSIT_PAYMENT_APPROVED';
  data: {
    paymentId: string;
    receiptId: string;
    flatId: string;
    societyId: string;
    amount: number;
    paymentDate: string;
  };
}

export interface CreditPaymentApprovedEvent extends NotificationEventBase {
  eventType: 'CREDIT_PAYMENT_APPROVED';
  data: {
    paymentId: string;
    receiptId: string;
    flatId: string;
    societyId: string;
    amount: number;
    paymentDate: string;
  };
}

// docs/other-charges/ — fired when an admin bills an ad-hoc fee (joining fee,
// transfer fee, fine, ...) to a flat's owner. A separate event from
// MAINTENANCE_BILL_GENERATED even though both represent "a new charge exists" —
// Other Charges is a deliberately separate pool throughout this feature, including
// at the notification layer.
export interface OtherChargeBilledEvent extends NotificationEventBase {
  eventType: 'OTHER_CHARGE_BILLED';
  data: {
    chargeId: string;
    flatId: string;
    societyId: string;
    feeTypeName: string;
    amount: number;
    dueDate: string;
    note?: string;
  };
}

export type NotificationEvent =
  | MaintenanceBillGeneratedEvent
  | DepositPaymentApprovedEvent
  | CreditPaymentApprovedEvent
  | OtherChargeBilledEvent;

export type NotificationEventType = NotificationEvent['eventType'];
