// Canonical form of a number plate: uppercase, punctuation/whitespace stripped.
// Applied identically on every write and every read (registration and search)
// so storage and lookup can never silently disagree on what counts as "the
// same plate" — MH12 AB 1234, mh-12-ab-1234, and MH12AB1234 all collapse to
// the same value.
export function normalizePlate(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
}
