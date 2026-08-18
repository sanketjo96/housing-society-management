import { z } from 'zod';
import { optionalPhone } from '../flat-schema-helpers';

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
