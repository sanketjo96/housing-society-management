import { z } from 'zod';

// Treats a blank '' submission as "not provided" so it doesn't fail .min(1)/.email()
// checks or get written to User.phone (a @unique column) as a colliding empty string.
export function optionalNonEmpty<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((value) => (value === '' ? undefined : value), schema.optional());
}

export const optionalPhone = optionalNonEmpty(z.string().min(1));
