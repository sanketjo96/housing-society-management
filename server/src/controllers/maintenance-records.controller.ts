import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  currentPeriod,
  generateMaintenanceRecords,
  listMaintenanceRecordsForSociety,
} from '../services/maintenance-record.service';

const periodField = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'period must be in YYYY-MM format');

const generateSchema = z.object({
  period: periodField.optional(),
});

const listQuerySchema = z.object({
  status: z.enum(['UNPAID', 'PENDING_REVIEW', 'PAID']).optional(),
  period: periodField.optional(),
  flatId: z.string().min(1).optional(),
});

export async function generateMaintenanceRecordsHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  const parsed = generateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    return;
  }

  const period = parsed.data.period ?? currentPeriod();
  const result = await generateMaintenanceRecords(req.user.societyId, period);
  res.status(200).json({ ...result, period });
}

export async function listMaintenanceRecordsHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    return;
  }

  const records = await listMaintenanceRecordsForSociety(req.user.societyId, parsed.data);
  res.status(200).json(records);
}
