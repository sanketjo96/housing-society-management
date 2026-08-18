import { z } from 'zod';

// A blank input submits as '' (React Hook Form), not undefined — '' must be treated as
// "not provided" here, both so a wrapped schema's own checks (.min(1), .email()) don't
// reject an intentionally empty field, and (for phone specifically) so it's never
// written to User.phone (a @unique column) as a literal empty string, which would
// collide with the next blank submission. Shared by admin/schemas.ts and
// resident/schemas.ts — both forms submit owner/tenant contact fields the same way.
export function optionalNonEmpty<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((value) => (value === '' ? undefined : value), schema.optional());
}

export const optionalPhone = optionalNonEmpty(z.string().min(1));
