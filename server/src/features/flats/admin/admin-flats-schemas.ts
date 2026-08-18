import { z } from 'zod';
import { optionalNonEmpty, optionalPhone } from '../flat-schema-helpers';

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
