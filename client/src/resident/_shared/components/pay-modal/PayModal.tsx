import type { ReactNode } from 'react';
import { Modal } from '../../../../components/modal/Modal';
import { PayIntentPanel, type PaymentIntent } from '../pay-intent-panel/PayIntentPanel';

// Wraps the two-step Pay flow in a modal, opened by a single "Pay"/"Resume
// payment" button next to the Outstanding figure — no amount/radio control
// lives on the page itself any more.
//
// Step is derived from whether `intent` (this pool's open intent) exists yet,
// not tracked as separate state: no intent -> `step1` (the caller's amount +
// (Maintenance-only) payment-type form, ending in a "Next" that locks the
// amount); intent present -> `PayIntentPanel` (QR/bank details, attachment,
// notes, warnings), whose "Submit payment" closes the modal via `onSubmitted`.
// A backdrop/X close only hides the modal — it never cancels an already-locked
// intent, so "Resume payment" can reopen straight into Step 2.
export function PayModal({
  title,
  isOpen,
  onClose,
  intent,
  isMobile,
  paymentType,
  multiStep = false,
  step1,
  onSubmitted,
  onCancelled,
  onBack,
}: {
  title: string;
  isOpen: boolean;
  onClose: () => void;
  intent: PaymentIntent | null | undefined;
  isMobile: boolean;
  paymentType?: 'MAINTENANCE' | 'EXPENSE';
  // Whether to show a "Step X of 2" subtitle — only meaningful when the
  // caller actually has an interactive Step 1 (Maintenance); Other Charges
  // has nothing to configure, so it stays a single step.
  multiStep?: boolean;
  step1?: ReactNode;
  onSubmitted?: () => void;
  onCancelled?: () => void;
  // From Step 2, back to Step 1 without cancelling the locked intent. Only
  // meaningful (and only rendered by PayIntentPanel) when provided.
  onBack?: () => void;
}) {
  if (!isOpen) return null;

  return (
    <Modal
      title={title}
      subtitle={multiStep ? (intent ? 'Step 2 of 2' : 'Step 1 of 2') : undefined}
      onClose={onClose}
      maxWidthClassName="max-w-md"
    >
      {intent ? (
        <PayIntentPanel
          intent={intent}
          isMobile={isMobile}
          paymentType={paymentType}
          onSubmitted={() => {
            onSubmitted?.();
            onClose();
          }}
          onCancelled={() => {
            onCancelled?.();
            onClose();
          }}
          onBack={onBack}
        />
      ) : (
        step1
      )}
    </Modal>
  );
}
