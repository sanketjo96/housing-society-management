import type { Request, Response } from 'express';
import { listReceipts } from './admin-receipts-service';

export async function listReceiptsHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  const receipts = await listReceipts(req.user.societyId);
  res.status(200).json(receipts);
}
