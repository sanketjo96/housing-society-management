import path from 'node:path';
import type { Request, Response } from 'express';
import { bulkImportSocietyLedgerSchema, recordSocietyLedgerEntrySchema } from './society-ledger.schemas';
import {
  CategoryDirectionMismatchError,
  FinanceCategoryNotUsableError,
  InvalidAmountError,
  MissingBankReferenceError,
  getSocietyLedgerEntryFileForViewing,
  listSocietyLedgerEntries,
  recordSocietyLedgerEntry,
} from './society-ledger.service';
import { bulkImportSocietyLedgerEntries } from './society-ledger-bulk-import-service';

export async function listSocietyLedgerEntriesHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }
  const entries = await listSocietyLedgerEntries(req.user.societyId);
  res.status(200).json(entries);
}

export async function recordSocietyLedgerEntryHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  const parsed = recordSocietyLedgerEntrySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    return;
  }

  if (!req.file) {
    res.status(400).json({ error: 'A proof attachment is required' });
    return;
  }

  try {
    const entry = await recordSocietyLedgerEntry(req.user.societyId, req.user.id, {
      ...parsed.data,
      file: {
        buffer: req.file.buffer,
        mimeType: req.file.mimetype,
        extension: path.extname(req.file.originalname),
      },
    });
    res.status(201).json(entry);
  } catch (err) {
    if (
      err instanceof FinanceCategoryNotUsableError ||
      err instanceof CategoryDirectionMismatchError ||
      err instanceof MissingBankReferenceError ||
      err instanceof InvalidAmountError
    ) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function bulkImportSocietyLedgerEntriesHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  const parsed = bulkImportSocietyLedgerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    return;
  }

  const result = await bulkImportSocietyLedgerEntries(req.user.societyId, req.user.id, parsed.data.csv);
  res.status(200).json(result);
}

export async function getSocietyLedgerEntryFileHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  const result = await getSocietyLedgerEntryFileForViewing(req.params.id, req.user.societyId);
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
