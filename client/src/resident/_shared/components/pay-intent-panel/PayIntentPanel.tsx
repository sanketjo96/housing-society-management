import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeft, X } from 'lucide-react';
import { ErrorBanner } from '../../../../components/form-field/FormField';
import { FileUploadField } from '../../../../components/file-upload-field/FileUploadField';
import { authedFetch } from '../../../../lib/api';

export type LedgerCategory = 'MAINTENANCE' | 'OTHER_CHARGE';

export interface PaymentIntent {
  id: string;
  amount: number;
  paymentMethod: 'UPI' | 'BANK_TRANSFER';
  // Set only when paymentMethod is 'UPI'.
  upiLink?: string;
  qrDataUrl?: string;
  // Set only when paymentMethod is 'BANK_TRANSFER'.
  bankAccountNumber?: string;
  bankIfsc?: string;
  createdAt: string;
  // Which pool this intent is locked against — only one open intent at a time,
  // across both pools.
  category: LedgerCategory;
}

export async function fetchOpenIntent(): Promise<PaymentIntent | null> {
  const res = await authedFetch('/api/me/ledger/deposits/intent');
  if (!res.ok) throw new Error('Could not check your pending payment.');
  const body = await res.json();
  return body.intent;
}

// Renders once a payment intent already exists — mobile deep-links into a UPI
// app then prompts for the screenshot; desktop shows a QR and lets the
// resident attach the screenshot whenever they're back. `onSubmitted` lets
// the caller invalidate its own query on success.
export function PayIntentPanel({
  intent,
  isMobile,
  paymentType,
  onSubmitted,
  onCancelled,
  onBack,
}: {
  intent: PaymentIntent;
  isMobile: boolean;
  // Picked in Step 1 (the caller page, before locking) — only meaningful for
  // 'MAINTENANCE' category. This panel is Step 2 and only reads it back to
  // decide whether to show the committee-approval warning; the note field
  // itself is always available regardless of which was picked.
  paymentType?: 'MAINTENANCE' | 'EXPENSE';
  onSubmitted?: () => void;
  onCancelled?: () => void;
  // Returns to Step 1 without cancelling the locked intent — the backend
  // upserts on re-lock (`createOrReplacePaymentIntent`), so a fresh "Next"
  // just updates the same intent in place. Omitted where there's no
  // interactive Step 1 to go back to (Other Charges).
  onBack?: () => void;
}) {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState('');

  // Re-check the intent when the tab regains visibility (e.g. after a UPI app redirect).
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible') {
        queryClient.invalidateQueries({ queryKey: ['payment-intent'] });
      }
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [queryClient]);

  const submitMutation = useMutation<unknown, Error, void>({
    mutationFn: async () => {
      const formData = new FormData();
      if (file) formData.append('file', file);
      if (note.trim()) formData.append('note', note.trim());
      const res = await authedFetch('/api/me/ledger/deposits/intent/submit', { method: 'POST', body: formData });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? 'Could not submit your payment.');
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-intent'] });
      setFile(null);
      setNote('');
      onSubmitted?.();
    },
  });

  const cancelMutation = useMutation<unknown, Error, void>({
    mutationFn: async () => {
      await authedFetch('/api/me/ledger/deposits/intent', { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-intent'] });
      onCancelled?.();
    },
  });

  const isBankTransfer = intent.paymentMethod === 'BANK_TRANSFER';

  return (
    <div className="flex flex-wrap items-start gap-4">
      {!isBankTransfer && !isMobile && (
        <div className="flex h-[84px] w-[84px] shrink-0 items-center justify-center rounded-md border border-line bg-white p-1">
          <img src={intent.qrDataUrl} alt="UPI payment QR code" className="h-full w-full" />
        </div>
      )}
      {isBankTransfer && (
        <div className="shrink-0 rounded-md border border-line bg-white p-3">
          <p className="m-0 text-[10px] uppercase tracking-wide text-muted">Account number</p>
          <p className="m-0 mb-2 font-mono-brand text-sm font-semibold text-ink">{intent.bankAccountNumber}</p>
          <p className="m-0 text-[10px] uppercase tracking-wide text-muted">IFSC</p>
          <p className="m-0 font-mono-brand text-sm font-semibold text-ink">{intent.bankIfsc}</p>
        </div>
      )}
      <div className="min-w-52 flex-1">
        <p className="m-0 mb-1.5 text-sm font-semibold text-ink">
          ₹{intent.amount.toLocaleString('en-IN')} locked{' '}
          <span className="font-normal text-muted">— awaiting your screenshot</span>
        </p>
        <p className="m-0 mb-2.5 text-xs text-muted">
          {isBankTransfer
            ? 'Transfer the amount via NEFT/IMPS/RTGS to the account details above, then attach a screenshot or the transaction reference below.'
            : isMobile
              ? 'Complete the payment in your UPI app, then attach the screenshot below.'
              : 'Scan the QR with a UPI app on your phone. Once you have a screenshot, attach it below — you can come back later if needed.'}
        </p>

        <div className="mb-2.5">
          <FileUploadField file={file} onFileChange={setFile} required placeholder="Attach payment screenshot" />
        </div>

        {intent.category === 'MAINTENANCE' && (
          <div className="mb-2.5">
            {paymentType === 'EXPENSE' && (
              <p className="mb-1.5 flex items-start gap-1.5 text-xs text-brass">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                Make sure you discuss this expense with the committee — the committee can reject this payment.
              </p>
            )}
            <label htmlFor="pay-intent-note" className="mb-1 block text-xs font-semibold text-ink">
              Reason (optional)
            </label>
            <textarea
              id="pay-intent-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder="e.g. Paying August + September together"
              className="w-full rounded-md border border-line px-2 py-1.5 text-sm"
            />
          </div>
        )}

        {submitMutation.error && <ErrorBanner>{submitMutation.error.message}</ErrorBanner>}

        <div className="flex gap-2">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="flex items-center gap-1.5 rounded-lg border border-line bg-transparent px-3.5 py-2 text-xs font-semibold text-ink"
            >
              <ArrowLeft size={13} /> Back
            </button>
          )}
          <button
            type="button"
            onClick={() => submitMutation.mutate()}
            disabled={submitMutation.isPending || !file}
            className="flex items-center gap-2 rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white disabled:cursor-default disabled:opacity-70"
          >
            {submitMutation.isPending ? 'Submitting…' : 'Submit payment'}
          </button>
          <button
            type="button"
            onClick={() => cancelMutation.mutate()}
            disabled={cancelMutation.isPending}
            className="flex items-center gap-1.5 rounded-lg border border-line bg-transparent px-3.5 py-2 text-xs font-semibold text-ink"
          >
            <X size={13} /> Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
