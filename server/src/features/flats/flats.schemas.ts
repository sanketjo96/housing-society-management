import { z } from 'zod';

function optionalNonEmpty<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((value) => (value === '' ? undefined : value), schema.optional());
}

const optionalPhone = optionalNonEmpty(z.string().min(1));
const occupancyFields = {
  occupancy: z.enum(['owner', 'tenant']).optional(),
  tenantName: optionalNonEmpty(z.string().min(1)),
  tenantPhone: optionalPhone,
  tenantEmail: optionalNonEmpty(z.string().email()),
  effectiveFrom: z.coerce.date().optional(),
};

export const createFlatSchema = z.object({
  wing: z.string().min(1),
  flatNumber: z.string().min(1),
  baseRate: z.coerce.number().positive(),
  ownerName: z.string().min(1),
  ownerPhone: optionalPhone,
  ownerEmail: z.string().email(),
  ...occupancyFields,
});

export const updateFlatSchema = z
  .object({
    baseRate: z.coerce.number().positive(),
    ownerName: z.string().min(1),
    ownerPhone: optionalPhone,
    ownerEmail: z.string().email(),
    ...occupancyFields,
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export const assignTenantSchema = z.object({ tenantId: z.string().min(1) });
export const bulkImportSchema = z.object({ csv: z.string().min(1) });

export const updateMeSchema = z
  .object({
    name: z.string().min(1),
    phone: z.string().min(1),
    email: z.string().email(),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export const upsertTenantSchema = z.object({
  name: z.string().min(1),
  phone: optionalPhone,
  email: z.string().email(),
  effectiveFrom: z.coerce.date().optional(),
});

export const updateMyFlatSchema = z.object({
  ownerName: z.string().min(1),
  ownerPhone: optionalPhone,
  ownerEmail: z.string().email(),
  occupancy: z.enum(['owner', 'tenant']).optional(),
  tenantName: z.string().min(1).optional(),
  tenantPhone: optionalPhone,
  tenantEmail: z.string().email().optional(),
  effectiveFrom: z.coerce.date().optional(),
});
