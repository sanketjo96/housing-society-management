import { authedFetch } from './api';

// Every authenticated file endpoint (proof screenshots, issued receipts) is never a
// public URL, so a plain <a href> won't carry the Bearer token — fetch the bytes
// ourselves and hand the browser a blob: URL instead. Works for both images and
// PDFs — the browser's own viewer opens either in the new tab. Shared by
// PaymentProofsPage and ReceiptBookPage.
export async function downloadAuthedFile(path: string, errorMessage: string) {
  const res = await authedFetch(path);
  if (!res.ok) throw new Error(errorMessage);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
