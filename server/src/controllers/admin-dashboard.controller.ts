import type { Request, Response } from 'express';
import { z } from 'zod';
import { getDashboardSummary, getFlaggedFlats, getFlatWiseDues } from '../services/admin-dashboard.service';

export async function getDashboardSummaryHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }
  const summary = await getDashboardSummary(req.user.societyId);
  res.status(200).json(summary);
}

export async function getFlatWiseDuesHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }
  const dues = await getFlatWiseDues(req.user.societyId);
  res.status(200).json(dues);
}

const flaggedFlatsQuerySchema = z.object({
  gracePeriodDays: z.coerce.number().int().positive().optional(),
});

export async function getFlaggedFlatsHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  const parsed = flaggedFlatsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    return;
  }

  const flagged = await getFlaggedFlats(req.user.societyId, parsed.data.gracePeriodDays);
  res.status(200).json(flagged);
}
