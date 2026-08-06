import type { Request, Response } from 'express';
import { z } from 'zod';
import { getSocietySettings, updateSocietySettings } from '../services/society-settings.service';

// Matches Society.tenantRateFactor's @db.Decimal(3,2) column headroom (up to 9.99).
const updateSettingsSchema = z.object({
  tenantRateFactor: z.coerce.number().positive().max(9.99).optional(),
  defaultBaseRate: z.coerce.number().positive().optional(),
});

export async function getSocietySettingsHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }
  const settings = await getSocietySettings(req.user.societyId);
  res.status(200).json(settings);
}

export async function updateSocietySettingsHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  const parsed = updateSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    return;
  }

  const settings = await updateSocietySettings(req.user.societyId, parsed.data);
  res.status(200).json(settings);
}
