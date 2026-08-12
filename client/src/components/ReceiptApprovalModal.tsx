import { useEffect, useState } from 'react';
import { authedFetch } from '../lib/api';
import { Modal } from './Modal';

// Streams the *exact* PDF the backend would issue if this entry is approved right
// now (GET .../receipt-preview reuses the same render path the real approval does
// — see receipt.service.ts) rather than a hand-built React re-implementation of the
// layout, which would eventually drift from the real template. The endpoint is
// authenticated, so a plain <iframe src> won't carry the Bearer token — fetch it
// ourselves and hand the iframe a blob: URL instead, same pattern
// PaymentProofsPage.tsx's viewProofFile already uses for proof files.
async function fetchReceiptPreview(entryId: string): Promise<string> {
  const res = await authedFetch(`/api/admin/ledger-entries/${entryId}/receipt-preview`);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? 'Could not load the receipt preview.');
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
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
  onConfirm: () => void;
  isConfirming: boolean;
  confirmError?: string;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

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
          onClick={onConfirm}
          disabled={isConfirming || !previewUrl}
          className="rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white disabled:cursor-default disabled:opacity-70"
        >
          {isConfirming ? 'Approving…' : 'Confirm and approve'}
        </button>
      </div>
    </Modal>
  );
}
