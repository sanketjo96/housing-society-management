import type { Request, Response } from 'express';
import { bulkImportChargesSchema } from './bulk-charges.schemas';
import { bulkImportCharges } from './bulk-charges.service';

export async function bulkImportChargesHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  const parsed = bulkImportChargesSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    return;
  }

  const result = await bulkImportCharges(req.user.societyId, req.user.id, parsed.data.csv);
  res.status(200).json(result);
}
