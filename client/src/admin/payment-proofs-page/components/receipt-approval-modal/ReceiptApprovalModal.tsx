import { useEffect, useState } from 'react';
import { authedFetch } from '../../../../lib/api';
import { Modal } from '../../../../components/modal/Modal';

// Streams the exact PDF the backend would issue if approved right now.
// Authenticated endpoint — fetch and hand off a blob: URL, since a plain
// <iframe src> can't carry the Bearer token.
async function fetchReceiptPreview(entryId: string): Promise<string> {
  const res = await authedFetch(`/api/admin/ledger-entries/${entryId}/receipt-preview`);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? 'Could not load the receipt preview.');
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

// OCR assist against the entry's own proof screenshot — read-only, never blocks:
// a failed call or a null result just leaves the field for the admin to type.
async function inferBankReference(entryId: string): Promise<string | null> {
  const res = await authedFetch(`/api/admin/ledger-entries/${entryId}/infer-bank-reference`, {
    method: 'POST',
  });
  if (!res.ok) return null;
  const body = await res.json();
  return body.bankReference ?? null;
}

export function ReceiptApprovalModal({
  entryId,
  residentName,
  onCancel,
  onConfirm,
  isConfirming,
  confirmError,
}: {
  entryId: string;
  residentName: string;
  onCancel: () => void;
  onConfirm: (bankReference: string) => void;
  isConfirming: boolean;
  confirmError?: string;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [bankReference, setBankReference] = useState('');
  const [isInferring, setIsInferring] = useState(false);
  const [inferMessage, setInferMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    fetchReceiptPreview(entryId)
      .then((url) => {
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        objectUrl = url;
        setPreviewUrl(url);
      })
      .catch((e: Error) => !cancelled && setPreviewError(e.message));

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [entryId]);

  return (
    <Modal
      title="Confirm receipt"
      subtitle={`Review the exact receipt that will be issued to ${residentName}.`}
      onClose={onCancel}
      maxWidthClassName="max-w-2xl"
    >
      <div className="mb-4 h-[60vh] overflow-hidden rounded-lg border border-line bg-paper">
        {previewError && (
          <p role="alert" className="p-4 text-sm text-coral">
            {previewError}
          </p>
        )}
        {!previewError && !previewUrl && <p className="p-4 text-sm text-muted">Loading receipt preview…</p>}
        {previewUrl && (
          <object data={previewUrl} type="application/pdf" className="h-full w-full" aria-label="Receipt preview">
            <p className="p-4 text-sm text-muted">
              Your browser can't preview PDFs inline.{' '}
              <a href={previewUrl} target="_blank" rel="noreferrer" className="text-teal">
                Open the receipt preview
              </a>
              .
            </p>
          </object>
        )}
      </div>

      <div className="mb-4">
        <div className="mb-1 flex items-center justify-between gap-2">
          <label htmlFor="bank-reference-input" className="block text-xs font-semibold text-ink">
            Bank / UPI reference <span className="text-coral">*</span>
          </label>
          <button
            type="button"
            onClick={() => {
              setInferMessage(null);
              setIsInferring(true);
              inferBankReference(entryId)
                .then((value) => {
                  if (value) {
                    setBankReference(value);
                  } else {
                    setInferMessage('No reference detected — enter it manually.');
                  }
                })
                .finally(() => setIsInferring(false));
            }}
            disabled={isInferring}
            className="border-none bg-transparent p-0 text-xs font-semibold text-teal disabled:opacity-60"
          >
            {isInferring ? 'Inferring…' : 'Infer from proof'}
          </button>
        </div>
        <input
          id="bank-reference-input"
          value={bankReference}
          onChange={(e) => {
            setBankReference(e.target.value);
            setInferMessage(null);
          }}
          placeholder="e.g. UTR / UPI transaction ID"
          className="w-full rounded-md border border-line px-2 py-1.5 text-sm"
        />
        <p className="mt-1 text-xs text-muted">
          {inferMessage ?? (
            <>
              Look at the resident's proof screenshot — "View proof" in the table row — and enter the transaction
              reference, or click "Infer from proof" to try auto-detecting it.
            </>
          )}
        </p>
      </div>

      {confirmError && (
        <p role="alert" className="mb-2 text-xs text-coral">
          {confirmError}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-ink"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onConfirm(bankReference)}
          disabled={isConfirming || !previewUrl || !bankReference.trim()}
          className="rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white disabled:cursor-default disabled:opacity-70"
        >
          {isConfirming ? 'Approving…' : 'Confirm and approve'}
        </button>
      </div>
    </Modal>
  );
}
