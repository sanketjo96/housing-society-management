import path from 'node:path';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { getMyFlat } from '../services/flats.service';
import {
  createCredit,
  createDeposit,
  ForbiddenLedgerEntryAccessError,
  generateDepositQr,
  getLedgerEntryFileForViewing,
  getLedgerForResident,
  InvalidAmountError,
  InvalidDepositAmountError,
} from '../services/ledger.service';

// Every handler here resolves "my flat" the same way — requireRole already guarantees
// OWNER/TENANT (see ledger.route.ts), so there's no ADMIN case to handle.
async function resolveMyFlatId(userId: string, societyId: string, role: 'OWNER' | 'TENANT') {
  const flat = await getMyFlat(userId, societyId, role);
  return flat?.id ?? null;
}

function amountErrorResponse(res: Response, err: unknown): boolean {
  if (err instanceof InvalidDepositAmountError || err instanceof InvalidAmountError) {
    res.status(400).json({ error: err.message });
    return true;
  }
  return false;
}

export async function getMyLedgerHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  const flatId = await resolveMyFlatId(req.user.id, req.user.societyId, req.user.role as 'OWNER' | 'TENANT');
  if (!flatId) {
    res.status(404).json({ error: 'No flat associated with your account' });
    return;
  }

  const ledger = await getLedgerForResident(flatId);
  res.status(200).json(ledger);
}

const amountSchema = z.object({ amount: z.coerce.number().positive() });

export async function generateDepositQrHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  const parsed = amountSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    return;
  }

  const flatId = await resolveMyFlatId(req.user.id, req.user.societyId, req.user.role as 'OWNER' | 'TENANT');
  if (!flatId) {
    res.status(404).json({ error: 'No flat associated with your account' });
    return;
  }

  try {
    const result = await generateDepositQr(flatId, req.user.societyId, parsed.data.amount);
    res.status(200).json(result);
  } catch (err) {
    if (amountErrorResponse(res, err)) return;
    throw err;
  }
}

export async function createDepositHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  const parsed = amountSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    return;
  }

  const flatId = await resolveMyFlatId(req.user.id, req.user.societyId, req.user.role as 'OWNER' | 'TENANT');
  if (!flatId) {
    res.status(404).json({ error: 'No flat associated with your account' });
    return;
  }

  try {
    const entry = await createDeposit(req.user.id, flatId, req.user.societyId, {
      amount: parsed.data.amount,
      file: req.file
        ? { buffer: req.file.buffer, mimeType: req.file.mimetype, extension: path.extname(req.file.originalname) }
        : undefined,
    });
    res.status(201).json(entry);
  } catch (err) {
    if (amountErrorResponse(res, err)) return;
    throw err;
  }
}

const creditSchema = z.object({ amount: z.coerce.number().positive(), note: z.string().min(1) });

export async function createCreditHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  const parsed = creditSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    return;
  }

  const flatId = await resolveMyFlatId(req.user.id, req.user.societyId, req.user.role as 'OWNER' | 'TENANT');
  if (!flatId) {
    res.status(404).json({ error: 'No flat associated with your account' });
    return;
  }

  try {
    const entry = await createCredit(req.user.id, flatId, req.user.societyId, {
      amount: parsed.data.amount,
      note: parsed.data.note,
      file: req.file
        ? { buffer: req.file.buffer, mimeType: req.file.mimetype, extension: path.extname(req.file.originalname) }
        : undefined,
    });
    res.status(201).json(entry);
  } catch (err) {
    if (amountErrorResponse(res, err)) return;
    throw err;
  }
}

export async function getLedgerEntryFileHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  try {
    const result = await getLedgerEntryFileForViewing(req.params.id, req.user.id, req.user.role, req.user.societyId);
    if (!result) {
      res.status(404).json({ error: 'File not found' });
      return;
    }
    res.setHeader('Content-Type', result.mimeType);
    result.stream.once('error', () => {
      if (!res.headersSent) res.status(404).json({ error: 'File not found' });
    });
    result.stream.pipe(res);
  } catch (err) {
    if (err instanceof ForbiddenLedgerEntryAccessError) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    throw err;
  }
}
