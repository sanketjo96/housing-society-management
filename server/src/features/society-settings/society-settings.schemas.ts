import { z } from 'zod';

const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const updateSettingsSchema = z.object({
  name: z.string().min(1, 'Society name is required').optional(),
  address: z.string().min(1, 'Society address is required').optional(),
  constructionDate: z
    .string()
    .min(1, 'Construction date is required')
    .refine(
      (value) => DATE_REGEX.test(value) && !Number.isNaN(Date.parse(value)),
      'Enter a valid construction date',
    )
    .optional(),
  formationDate: z
    .string()
    .min(1, 'Society formation date is required')
    .refine(
      (value) => DATE_REGEX.test(value) && !Number.isNaN(Date.parse(value)),
      'Enter a valid society formation date',
    )
    .optional(),
  upiVpa: z.string().optional(),
  bankAccountNumber: z.string().max(34).optional(),
  bankIfsc: z
    .string()
    .optional()
    .refine((value) => value === undefined || value === '' || IFSC_REGEX.test(value), {
      message: 'Enter a valid 11-character IFSC code (e.g. HDFC0001234) or leave it blank',
    }),
  tenantRateFactor: z.coerce.number().positive().max(9.99).optional(),
  defaultBaseRate: z.coerce.number().positive().optional(),
  chairmanId: z.string().min(1, 'Chairman is required').optional(),
  secretaryId: z.string().min(1, 'Secretary is required').optional(),
  treasurerId: z.string().min(1, 'Treasurer is required').optional(),
  receiptNumberPrefix: z
    .string()
    .regex(/^[A-Za-z0-9-]{1,20}$/, 'Receipt number prefix must be 1-20 letters, digits, or hyphens')
    .optional(),
  receiptFooterNote: z.string().max(500).optional(),
});
