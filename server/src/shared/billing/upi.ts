import QRCode from 'qrcode';

export interface UpiLinkInput {
  vpa: string;
  payeeName: string;
  amount: number;
  note: string;
}

// Task 6.1 — a UPI deep link per the standard `upi://pay` intent scheme any UPI app
// (GPay, PhonePe, Paytm, ...) recognizes. Pure/no I/O, so it's unit-testable without a
// database — this is the one place the exact query-param shape lives.
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

// Local generation only (`qrcode` npm package) — no external API, per CLAUDE.md's
// tech-stack table. Returns a base64 PNG data URL the frontend can drop straight into
// an <img src>, no separate image-hosting endpoint needed.
export async function generateQrDataUrl(link: string): Promise<string> {
  return QRCode.toDataURL(link, { errorCorrectionLevel: 'M' });
}
