import path from 'node:path';
import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  approveProof,
  ForbiddenProofAccessError,
  generatePaymentQr,
  getProofForViewing,
  listPaymentProofs,
  markRecordsPaid,
  ProofAlreadyReviewedError,
  RecordsNotEligibleError,
  RecordsNotFoundError,
  rejectProof,
  uploadPaymentProof,
} from '../services/payment-proofs.service';

const recordIdsSchema = z.object({
  maintenanceRecordIds: z.array(z.string().min(1)).min(1, 'Select at least one record'),
});

// Multipart form fields arrive as strings — maintenanceRecordIds is sent as a
// JSON-encoded array string (there's no other way to carry an array field alongside a
// file in multipart/form-data).
const uploadFieldsSchema = z.object({
  maintenanceRecordIds: z.string().transform((raw, ctx) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      ctx.addIssue({ code: 'custom', message: 'maintenanceRecordIds must be a JSON array of ids' });
      return z.NEVER;
    }
    if (!Array.isArray(parsed) || parsed.length === 0 || !parsed.every((x) => typeof x === 'string')) {
      ctx.addIssue({ code: 'custom', message: 'maintenanceRecordIds must be a non-empty array of strings' });
      return z.NEVER;
    }
    return parsed;
  }),
});

function recordErrorResponse(res: Response, err: unknown): boolean {
  if (err instanceof RecordsNotFoundError) {
    res.status(404).json({ error: err.message });
    return true;
  }
  if (err instanceof RecordsNotEligibleError) {
    res.status(409).json({ error: err.message, recordIds: err.recordIds });
    return true;
  }
  return false;
}

export async function generatePaymentQrHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  const parsed = recordIdsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    return;
  }

  try {
    const result = await generatePaymentQr(req.user.id, req.user.societyId, parsed.data.maintenanceRecordIds);
    res.status(200).json(result);
  } catch (err) {
    if (recordErrorResponse(res, err)) return;
    throw err;
  }
}

export async function uploadPaymentProofHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }
  if (!req.file) {
    res.status(400).json({ error: 'A proof file is required' });
    return;
  }

  const parsed = uploadFieldsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    return;
  }

  try {
    const proof = await uploadPaymentProof(req.user.id, req.user.societyId, {
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
      extension: path.extname(req.file.originalname),
      maintenanceRecordIds: parsed.data.maintenanceRecordIds,
    });
    res.status(201).json(proof);
  } catch (err) {
    if (recordErrorResponse(res, err)) return;
    throw err;
  }
}

export async function getProofFileHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  try {
    const result = await getProofForViewing(req.params.id, req.user.id, req.user.role, req.user.societyId);
    if (!result) {
      res.status(404).json({ error: 'Proof not found' });
      return;
    }
    res.setHeader('Content-Type', result.mimeType);
    result.stream.once('error', () => {
      if (!res.headersSent) res.status(404).json({ error: 'Proof file not found' });
    });
    result.stream.pipe(res);
  } catch (err) {
    if (err instanceof ForbiddenProofAccessError) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    throw err;
  }
}

const listQuerySchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
});

export async function listPaymentProofsHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    return;
  }

  const proofs = await listPaymentProofs(req.user.societyId, parsed.data);
  res.status(200).json(proofs);
}

export async function approveProofHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  try {
    const proof = await approveProof(req.params.id, req.user.societyId, req.user.id);
    if (!proof) {
      res.status(404).json({ error: 'Proof not found' });
      return;
    }
    res.status(200).json(proof);
  } catch (err) {
    if (err instanceof ProofAlreadyReviewedError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
}

const rejectSchema = z.object({ reason: z.string().min(1).optional() });

export async function rejectProofHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  const parsed = rejectSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    return;
  }

  try {
    const proof = await rejectProof(req.params.id, req.user.societyId, req.user.id, parsed.data.reason);
    if (!proof) {
      res.status(404).json({ error: 'Proof not found' });
      return;
    }
    res.status(200).json(proof);
  } catch (err) {
    if (err instanceof ProofAlreadyReviewedError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function markRecordsPaidHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  const parsed = recordIdsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    return;
  }

  try {
    const result = await markRecordsPaid(req.user.societyId, req.user.id, parsed.data.maintenanceRecordIds);
    res.status(200).json(result);
  } catch (err) {
    if (recordErrorResponse(res, err)) return;
    throw err;
  }
}
