import path from 'node:path';
import type { Request, Response } from 'express';
import { creditSchema, ledgerAmountSchema, ledgerYearQuerySchema } from './resident-ledger-schemas';
import { getMyFlat } from '../../flats/resident/resident-flats-service';
import {
  cancelPaymentIntent,
  createCredit,
  createDeposit,
  createOrReplacePaymentIntent,
  ForbiddenLedgerEntryAccessError,
  getLedgerEntryFileForViewing,
  getLedgerForResident,
  getOpenPaymentIntent,
  getResidentBalancesSummary,
  IntentAlreadyOpenForOtherCategoryError,
  InvalidAmountError,
  InvalidDepositAmountError,
  NoOpenPaymentIntentError,
  PaymentMethodNotConfiguredError,
  submitPaymentIntent,
} from './resident-ledger-service';
import { getIssuedReceiptForViewing } from '../../receipts/receipt.service';

// Every handler here resolves "my flat" the same way — requireRole already guarantees
// OWNER/TENANT (see ./resident-ledger-route.ts), so there's no ADMIN case to handle.
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

  const parsedQuery = ledgerYearQuerySchema.safeParse(req.query);
  if (!parsedQuery.success) {
    res.status(400).json({ error: 'Invalid input', details: parsedQuery.error.flatten() });
    return;
  }

  const flatId = await resolveMyFlatId(
    req.user.id,
    req.user.societyId,
    req.user.role as 'OWNER' | 'TENANT',
  );
  if (!flatId) {
    res.status(404).json({ error: 'No flat associated with your account' });
    return;
  }

  const ledger = await getLedgerForResident(flatId, parsedQuery.data.category, parsedQuery.data.year);
  res.status(200).json(ledger);
}

// docs/other-charges/ — powers the Dashboard's 4 summary cards in one call.
export async function getMyBalancesHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  const flatId = await resolveMyFlatId(
    req.user.id,
    req.user.societyId,
    req.user.role as 'OWNER' | 'TENANT',
  );
  if (!flatId) {
    res.status(404).json({ error: 'No flat associated with your account' });
    return;
  }

  const balances = await getResidentBalancesSummary(flatId);
  res.status(200).json(balances);
}

export async function getPaymentIntentHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  const flatId = await resolveMyFlatId(
    req.user.id,
    req.user.societyId,
    req.user.role as 'OWNER' | 'TENANT',
  );
  if (!flatId) {
    res.status(404).json({ error: 'No flat associated with your account' });
    return;
  }

  try {
    const intent = await getOpenPaymentIntent(flatId, req.user.societyId);
    res.status(200).json({ intent });
  } catch (err) {
    if (err instanceof PaymentMethodNotConfiguredError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function createPaymentIntentHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  const parsed = ledgerAmountSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    return;
  }

  const flatId = await resolveMyFlatId(
    req.user.id,
    req.user.societyId,
    req.user.role as 'OWNER' | 'TENANT',
  );
  if (!flatId) {
    res.status(404).json({ error: 'No flat associated with your account' });
    return;
  }

  try {
    const intent = await createOrReplacePaymentIntent(
      flatId,
      req.user.id,
      req.user.societyId,
      parsed.data.amount,
      parsed.data.category,
    );
    res.status(201).json({ intent });
  } catch (err) {
    if (amountErrorResponse(res, err)) return;
    if (err instanceof IntentAlreadyOpenForOtherCategoryError) {
      res.status(409).json({ error: err.message });
      return;
    }
    if (err instanceof PaymentMethodNotConfiguredError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function submitPaymentIntentHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  const flatId = await resolveMyFlatId(
    req.user.id,
    req.user.societyId,
    req.user.role as 'OWNER' | 'TENANT',
  );
  if (!flatId) {
    res.status(404).json({ error: 'No flat associated with your account' });
    return;
  }

  if (!req.file) {
    res.status(400).json({ error: 'A payment screenshot is required' });
    return;
  }

  try {
    const entry = await submitPaymentIntent(
      flatId,
      req.user.id,
      req.user.societyId,
      req.user.role as 'OWNER' | 'TENANT',
      {
        buffer: req.file.buffer,
        mimeType: req.file.mimetype,
        extension: path.extname(req.file.originalname),
      },
    );
    res.status(201).json(entry);
  } catch (err) {
    if (err instanceof NoOpenPaymentIntentError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function cancelPaymentIntentHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  const flatId = await resolveMyFlatId(
    req.user.id,
    req.user.societyId,
    req.user.role as 'OWNER' | 'TENANT',
  );
  if (!flatId) {
    res.status(404).json({ error: 'No flat associated with your account' });
    return;
  }

  await cancelPaymentIntent(flatId, req.user.societyId);
  res.status(204).end();
}

export async function createDepositHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  const parsed = ledgerAmountSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    return;
  }

  const flatId = await resolveMyFlatId(
    req.user.id,
    req.user.societyId,
    req.user.role as 'OWNER' | 'TENANT',
  );
  if (!flatId) {
    res.status(404).json({ error: 'No flat associated with your account' });
    return;
  }

  try {
    const entry = await createDeposit(
      req.user.id,
      flatId,
      req.user.societyId,
      req.user.role as 'OWNER' | 'TENANT',
      {
        amount: parsed.data.amount,
        file: req.file
          ? {
              buffer: req.file.buffer,
              mimeType: req.file.mimetype,
              extension: path.extname(req.file.originalname),
            }
          : undefined,
      },
      parsed.data.category,
    );
    res.status(201).json(entry);
  } catch (err) {
    if (amountErrorResponse(res, err)) return;
    throw err;
  }
}

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

  const flatId = await resolveMyFlatId(
    req.user.id,
    req.user.societyId,
    req.user.role as 'OWNER' | 'TENANT',
  );
  if (!flatId) {
    res.status(404).json({ error: 'No flat associated with your account' });
    return;
  }

  if (!req.file) {
    res.status(400).json({ error: 'A proof attachment is required' });
    return;
  }

  try {
    const entry = await createCredit(
      req.user.id,
      flatId,
      req.user.societyId,
      req.user.role as 'OWNER' | 'TENANT',
      {
        amount: parsed.data.amount,
        note: parsed.data.note,
        file: {
          buffer: req.file.buffer,
          mimeType: req.file.mimetype,
          extension: path.extname(req.file.originalname),
        },
      },
    );
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
    const result = await getLedgerEntryFileForViewing(
      req.params.id,
      req.user.id,
      req.user.role,
      req.user.societyId,
    );
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

// Download of an already-issued receipt — admin or the entry's own payer (owner or
// tenant, symmetric), same auth shape as getLedgerEntryFileHandler above. 404 for
// a legacy entry approved before this feature existed (no Receipt row) — never
// lazily fabricated.
export async function getIssuedReceiptHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  try {
    const result = await getIssuedReceiptForViewing(
      req.params.id,
      req.user.id,
      req.user.role,
      req.user.societyId,
    );
    if (!result) {
      res.status(404).json({ error: 'No receipt was issued for this entry' });
      return;
    }
    res.setHeader('Content-Type', result.mimeType);
    result.stream.once('error', () => {
      if (!res.headersSent) res.status(404).json({ error: 'No receipt was issued for this entry' });
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
