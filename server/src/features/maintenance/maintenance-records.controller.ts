import type { Request, Response } from 'express';
import { generateMaintenanceSchema, listMaintenanceQuerySchema } from './maintenance.schemas';
import {
  generateMaintenanceRecords,
  listMaintenanceRecordsForSociety,
  previousPeriod,
} from './maintenance-record.service';

export async function generateMaintenanceRecordsHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  const parsed = generateMaintenanceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    return;
  }

  const period = parsed.data.period ?? previousPeriod();
  const result = await generateMaintenanceRecords(req.user.societyId, period, req.user.id);
  res.status(200).json({ ...result, period });
}

export async function listMaintenanceRecordsHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  const parsed = listMaintenanceQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    return;
  }

  const records = await listMaintenanceRecordsForSociety(req.user.societyId, parsed.data);
  res.status(200).json(records);
}
