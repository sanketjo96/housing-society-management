import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { ErrorBanner } from './FormField';
import { FileUploadField } from './FileUploadField';
import { authedFetch } from '../lib/api';

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
  // docs/other-charges/ — which pool this intent is locked against. A resident has
  // at most one open intent at a time, across BOTH pools — a page for the other
  // pool must check this before rendering Pay/this panel (see
  // ResidentDashboardOverview.tsx / OtherChargesBookPage.tsx).
  category: LedgerCategory;
}

export async function fetchOpenIntent(): Promise<PaymentIntent | null> {
  const res = await authedFetch('/api/me/ledger/deposits/intent');
  if (!res.ok) throw new Error('Could not check your pending payment.');
  const body = await res.json();
  return body.intent;
}

// Pay — tapping the header's Pay button locks the amount immediately, at exactly
// the current Outstanding for that pool. This panel only ever renders once an
// intent already exists — forking by device from that point on: mobile deep-links
// straight into a UPI app and then prompts for the screenshot on return; desktop
// shows a QR to scan with a phone and lets the resident attach the screenshot
// whenever they're back, even in a later session (the intent is a real DB row, not
// just component state). Shared by the Maintenance Dashboard and the Other Charges
// Book page (docs/other-charges/) — there's only ever one intent, so both pages
// query/render the same underlying row; `onSubmitted` lets each caller invalidate
// its own ledger query on success without this component needing to know which one.
export function PayIntentPanel({
  intent,
  isMobile,
  onSubmitted,
}: {
  intent: PaymentIntent;
  isMobile: boolean;
  onSubmitted?: () => void;
}) {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);

  // Re-check the open intent when the resident comes back to the tab (e.g. after
  // the UPI app redirect on mobile) — the intent is server-persisted, so this just
  // keeps the UI in sync rather than relying on the 30s query staleTime.
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
      const res = await authedFetch('/api/me/ledger/deposits/intent/submit', { method: 'POST', body: formData });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? 'Could not submit your payment.');
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-intent'] });
      setFile(null);
      onSubmitted?.();
    },
  });

  const cancelMutation = useMutation<unknown, Error, void>({
    mutationFn: async () => {
      await authedFetch('/api/me/ledger/deposits/intent', { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-intent'] });
    },
  });

  const isBankTransfer = intent.paymentMethod === 'BANK_TRANSFER';

  return (
    <div className="mb-4 flex flex-wrap items-start gap-4 rounded-xl border border-line bg-paper p-4">
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

        {submitMutation.error && <ErrorBanner>{submitMutation.error.message}</ErrorBanner>}

        <div className="flex gap-2">
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
