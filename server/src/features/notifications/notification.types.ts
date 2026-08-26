// Typed event payloads for the notification feature. A business feature builds one
// of these and hands it to notify() — it never sees NotificationLog, cron, or
// channel-specific types. Events carry recipient.userId, not a phone/email address —
// those are resolved later, at delivery time.

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

// Fired when an admin bills an ad-hoc fee (joining fee, transfer fee, fine, ...) to
// a flat's owner. Separate from MAINTENANCE_BILL_GENERATED.
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
  | OtherChargeBilledEvent;

export type NotificationEventType = NotificationEvent['eventType'];
