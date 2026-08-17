import type { Request, Response } from 'express';
import { ledgerListQuerySchema, manualDepositSchema, rejectLedgerSchema } from './ledger.schemas';
import {
  approveLedgerEntry,
  InvalidAmountError,
  LedgerEntryAlreadyReviewedError,
  listPendingLedgerEntries,
  manualDeposit,
  rejectLedgerEntry,
} from './ledger-entry.service';
import { previewReceiptPdf } from '../receipts/receipt.service';

export async function listLedgerEntriesHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  const parsed = ledgerListQuerySchema.safeParse(req.query);
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

// Streams the *exact* PDF that will be issued if this entry is approved right now
// — reuses the same buildReceiptData/renderReceiptPdf path the real approval uses
// (receipt.service.ts), so the admin's pre-approval preview modal and the
// eventually-issued receipt are guaranteed byte-for-byte identical. Purely a read:
// no storage.save(), no DB write, no Receipt row created here.
export async function previewReceiptHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  try {
    const buffer = await previewReceiptPdf(req.params.id, req.user.societyId);
    if (!buffer) {
      res.status(404).json({ error: 'Ledger entry not found' });
      return;
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="receipt-preview.pdf"');
    res.status(200).send(buffer);
  } catch (err) {
    if (err instanceof LedgerEntryAlreadyReviewedError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function rejectLedgerEntryHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  const parsed = rejectLedgerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    return;
  }

  try {
    const entry = await rejectLedgerEntry(
      req.params.id,
      req.user.societyId,
      req.user.id,
      parsed.data.reason,
    );
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
    const entry = await manualDeposit(
      req.user.societyId,
      req.user.id,
      parsed.data.flatId,
      parsed.data.amount,
    );
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
