// Pure/no I/O, unit-testable without a database — same shape as lib/upi.ts. Indian
// numbering (crore/lakh/thousand, not the international million/billion grouping),
// since receipt amounts (Receipt Generation & Approval Workflow, 2026-08-11) are
// always INR. Amounts are Decimal(10,2) in the schema, so paise (the two decimal
// places) are spelled out separately rather than dropped.

const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];

const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

// Handles 0-99.
function twoDigitsToWords(n: number): string {
  if (n < 20) return ONES[n];
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  return ones === 0 ? TENS[tens] : `${TENS[tens]} ${ONES[ones]}`;
}

// Handles 0-999 — the one group repeated across thousand/lakh/crore places.
function threeDigitsToWords(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (hundreds === 0) return twoDigitsToWords(rest);
  const hundredsPart = `${ONES[hundreds]} Hundred`;
  return rest === 0 ? hundredsPart : `${hundredsPart} and ${twoDigitsToWords(rest)}`;
}

// Indian numbering groups: crore (1e7), lakh (1e5), thousand (1e3), then the last
// three digits — unlike the international 3-digit-everywhere grouping.
function integerToWords(n: number): string {
  if (n === 0) return 'Zero';

  const crore = Math.floor(n / 1e7);
  const lakh = Math.floor((n % 1e7) / 1e5);
  const thousand = Math.floor((n % 1e5) / 1e3);
  const rest = n % 1e3;

  const parts: string[] = [];
  if (crore > 0) parts.push(`${threeDigitsToWords(crore)} Crore`);
  if (lakh > 0) parts.push(`${threeDigitsToWords(lakh)} Lakh`);
  if (thousand > 0) parts.push(`${threeDigitsToWords(thousand)} Thousand`);
  if (rest > 0) parts.push(threeDigitsToWords(rest));

  return parts.join(' ');
}

// A receipt amount is never negative — throws rather than producing a nonsensical
// "Minus..." receipt line.
export function toIndianCurrencyWords(amount: number): string {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`toIndianCurrencyWords: amount must be a non-negative finite number, got ${amount}`);
  }

  let rupees = Math.floor(amount);
  let paise = Math.round((amount - rupees) * 100);
  // Floating-point rounding can push e.g. 19.995 to a rounded paise of 100 — carry
  // it into the rupee amount rather than rendering an invalid "100 Paise".
  if (paise === 100) {
    rupees += 1;
    paise = 0;
  }

  const rupeesWords = `Rupees ${integerToWords(rupees)}`;
  if (paise === 0) return `${rupeesWords} Only`;
  return `${rupeesWords} and ${integerToWords(paise)} Paise Only`;
}
