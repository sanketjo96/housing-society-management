# Notification Feature — Requirements

## 1. Goal

Provide an asynchronous notification capability for the existing Node.js application.

Phase 1 supports **WhatsApp only** through the Meta WhatsApp Cloud API.

The design must allow Email and other channels to be added later.

## 2. Phase 1 Events

### `MAINTENANCE_BILL_GENERATED`

Triggered after a maintenance bill is successfully persisted.

```ts
{
  eventId: string,
  eventType: "MAINTENANCE_BILL_GENERATED",
  occurredAt: string,
  recipient: {
    userId: string
  },
  data: {
    billId: string,
    flatId: string,
    societyId: string,
    billingMonth: string,
    amount: number,
    dueDate: string
  }
}
```

### `DEPOSIT_PAYMENT_APPROVED`

Triggered after a deposit payment is approved and its receipt is generated.

```ts
{
  eventId: string,
  eventType: "DEPOSIT_PAYMENT_APPROVED",
  occurredAt: string,
  recipient: {
    userId: string
  },
  data: {
    paymentId: string,
    receiptId: string,
    flatId: string,
    societyId: string,
    amount: number,
    paymentDate: string
  }
}
```

### `CREDIT_PAYMENT_APPROVED`

Triggered after a credit payment is approved and its receipt is generated.

```ts
{
  eventId: string,
  eventType: "CREDIT_PAYMENT_APPROVED",
  occurredAt: string,
  recipient: {
    userId: string
  },
  data: {
    paymentId: string,
    receiptId: string,
    flatId: string,
    societyId: string,
    amount: number,
    paymentDate: string
  }
}
```

## 3. Event Rules

- Events represent business facts, not WhatsApp operations.
- Events contain `recipient.userId`, not a phone number.
- The current WhatsApp number is resolved when the notification is processed.
- Do not put WhatsApp template names, access tokens, or provider-specific fields into events.
- Events are emitted only after the underlying business operation succeeds.

## 4. Delivery Requirements

- Notifications must be asynchronous.
- Billing/payment operations must not wait for WhatsApp delivery.
- WhatsApp failures must not roll back successful business operations.
- Failed transient notifications must be retryable.
- Duplicate business events must not produce duplicate successful notifications.
- Credentials must be stored securely in configuration/environment variables.

## 5. WhatsApp Requirements

Phase 1 uses Meta WhatsApp Cloud API.

Required configuration:

```env
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_API_VERSION=
```

Three WhatsApp templates are required:

```text
maintenance_bill_generated
deposit_payment_approved
credit_payment_approved
```

## 6. Out of Scope

Do not implement in Phase 1:

- Email
- SMS
- Push notifications
- Notification preferences
- Notification UI/dashboard
- Separate notification microservice
- Quarterly maintenance reminders
- Complex notification scheduling
