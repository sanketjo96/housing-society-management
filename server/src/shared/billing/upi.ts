import QRCode from 'qrcode';

export interface UpiLinkInput {
  vpa: string;
  payeeName: string;
  amount: number;
  note: string;
}

// Builds a `upi://pay` deep link any UPI app recognizes.
export function buildUpiDeepLink(input: UpiLinkInput): string {
  const params = new URLSearchParams({
    pa: input.vpa,
    pn: input.payeeName,
    am: input.amount.toFixed(2),
    cu: 'INR',
    tn: input.note,
  });
  return `upi://pay?${params.toString()}`;
}

// Returns a base64 PNG data URL the frontend can drop straight into an <img src>.
export async function generateQrDataUrl(link: string): Promise<string> {
  return QRCode.toDataURL(link, { errorCorrectionLevel: 'M' });
}
