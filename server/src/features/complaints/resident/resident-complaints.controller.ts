import path from 'node:path';
import type { Request, Response } from 'express';
import { createComplaintSchema } from './resident-complaints.schemas';
import {
  createComplaint,
  getComplaintFileForViewing,
  listComplaints,
} from './resident-complaints.service';
import { getMyFlat } from '../../flats/resident/resident-flats-service';

export async function listComplaintsHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  const complaints = await listComplaints(req.user.societyId);
  res.status(200).json(complaints);
}

export async function createComplaintHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  const parsed = createComplaintSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    return;
  }

  const flat = await getMyFlat(req.user.id, req.user.societyId, 'OWNER');
  if (!flat) {
    res.status(404).json({ error: 'No flat associated with your account' });
    return;
  }

  const complaint = await createComplaint(req.user.societyId, req.user.id, flat.id, {
    ...parsed.data,
    file: req.file
      ? {
          buffer: req.file.buffer,
          mimeType: req.file.mimetype,
          extension: path.extname(req.file.originalname),
        }
      : undefined,
  });
  res.status(201).json(complaint);
}

export async function getComplaintFileHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  const result = await getComplaintFileForViewing(req.params.id, req.user.societyId);
  if (!result) {
    res.status(404).json({ error: 'File not found' });
    return;
  }

  res.setHeader('Content-Type', result.mimeType);
  result.stream.once('error', () => {
    if (!res.headersSent) res.status(404).json({ error: 'File not found' });
  });
  result.stream.pipe(res);
}
