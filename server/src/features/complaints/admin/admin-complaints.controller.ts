import type { Request, Response } from 'express';
import { changeComplaintStatusSchema } from './admin-complaints.schemas';
import { changeComplaintStatus, ComplaintNotFoundError } from './admin-complaints.service';

export async function changeComplaintStatusHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  const parsed = changeComplaintStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    return;
  }

  try {
    const complaint = await changeComplaintStatus(req.params.id, req.user.societyId, parsed.data.status);
    res.status(200).json(complaint);
  } catch (err) {
    if (err instanceof ComplaintNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
}
