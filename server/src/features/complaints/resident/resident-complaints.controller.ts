import path from 'node:path';
import type { Request, Response } from 'express';
import { createComplaintSchema, updateComplaintSchema } from './resident-complaints.schemas';
import {
  ComplaintLockedError,
  ComplaintNotFoundError,
  createComplaint,
  deleteComplaint,
  getComplaintFileForViewing,
  listComplaints,
  unvoteComplaint,
  updateComplaint,
  upvoteComplaint,
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

export async function updateComplaintHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  const parsed = updateComplaintSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    return;
  }

  try {
    const complaint = await updateComplaint(req.params.id, req.user.societyId, req.user.id, {
      ...parsed.data,
      file: req.file
        ? {
            buffer: req.file.buffer,
            mimeType: req.file.mimetype,
            extension: path.extname(req.file.originalname),
          }
        : undefined,
    });
    res.status(200).json(complaint);
  } catch (err) {
    if (err instanceof ComplaintNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    if (err instanceof ComplaintLockedError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function deleteComplaintHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  try {
    await deleteComplaint(req.params.id, req.user.societyId, req.user.id);
    res.status(204).send();
  } catch (err) {
    if (err instanceof ComplaintNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    if (err instanceof ComplaintLockedError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function upvoteComplaintHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  try {
    await upvoteComplaint(req.params.id, req.user.societyId, req.user.id);
    res.status(204).send();
  } catch (err) {
    if (err instanceof ComplaintNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function unvoteComplaintHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  await unvoteComplaint(req.params.id, req.user.societyId, req.user.id);
  res.status(204).send();
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
