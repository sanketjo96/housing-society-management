import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  approveLedgerEntry,
  InvalidAmountError,
  LedgerEntryAlreadyReviewedError,
  listPendingLedgerEntries,
  manualDeposit,
  rejectLedgerEntry,
} from '../services/ledger.service';

const listQuerySchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
  type: z.enum(['DEPOSIT', 'CREDIT']).optional(),
});

export async function listLedgerEntriesHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    return;
  }

  const entries = await listPendingLedgerEntries(req.user.societyId, parsed.data);
  res.status(200).json(entries);
}

export async function approveLedgerEntryHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  try {
    const entry = await approveLedgerEntry(req.params.id, req.user.societyId, req.user.id);
    if (!entry) {
      res.status(404).json({ error: 'Ledger entry not found' });
      return;
    }
    res.status(200).json(entry);
  } catch (err) {
    if (err instanceof LedgerEntryAlreadyReviewedError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
}

const rejectSchema = z.object({ reason: z.string().min(1).optional() });

export async function rejectLedgerEntryHandler(req: Request, res: Response) {
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
    const entry = await rejectLedgerEntry(req.params.id, req.user.societyId, req.user.id, parsed.data.reason);
    if (!entry) {
      res.status(404).json({ error: 'Ledger entry not found' });
      return;
    }
    res.status(200).json(entry);
  } catch (err) {
    if (err instanceof LedgerEntryAlreadyReviewedError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
}

const manualDepositSchema = z.object({ flatId: z.string().min(1), amount: z.coerce.number().positive() });

export async function manualDepositHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  const parsed = manualDepositSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    return;
  }

  try {
    const entry = await manualDeposit(req.user.societyId, req.user.id, parsed.data.flatId, parsed.data.amount);
    if (!entry) {
      res.status(404).json({ error: 'Flat not found' });
      return;
    }
    res.status(201).json(entry);
  } catch (err) {
    if (err instanceof InvalidAmountError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
}
