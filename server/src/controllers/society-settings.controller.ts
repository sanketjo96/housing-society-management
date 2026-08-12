import path from 'node:path';
import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  getReceiptSignatureForViewing,
  getSocietySettings,
  removeReceiptSignature,
  setReceiptSignature,
  updateSocietySettings,
} from '../services/society-settings.service';

// Matches Society.tenantRateFactor's @db.Decimal(3,2) column headroom (up to 9.99).
// receiptNumberPrefix restricted to a short alphanumeric/hyphen token — it's
// concatenated directly into every receipt number (receipt.service.ts's
// buildReceiptNumber), so free-form text (commas, newlines) has no business there.
// The other three receipt fields accept an empty string deliberately — that's how
// the service (updateSocietySettings) knows to clear the field back to null, as
// opposed to omitting the key entirely to leave it untouched.
const updateSettingsSchema = z.object({
  name: z.string().min(1, 'Society name is required').optional(),
  address: z.string().min(1, 'Society address is required').optional(),
  upiVpa: z.string().min(1, 'UPI ID is required').optional(),
  tenantRateFactor: z.coerce.number().positive().max(9.99).optional(),
  defaultBaseRate: z.coerce.number().positive().optional(),
  receiptNumberPrefix: z
    .string()
    .regex(/^[A-Za-z0-9-]{1,20}$/, 'Receipt number prefix must be 1-20 letters, digits, or hyphens')
    .optional(),
  receiptSignatoryName: z.string().max(200).optional(),
  receiptSignatoryTitle: z.string().max(200).optional(),
  receiptFooterNote: z.string().max(500).optional(),
});

export async function getSocietySettingsHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }
  const settings = await getSocietySettings(req.user.societyId);
  res.status(200).json(settings);
}

export async function updateSocietySettingsHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  const parsed = updateSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    return;
  }

  const settings = await updateSocietySettings(req.user.societyId, parsed.data);
  res.status(200).json(settings);
}

export async function uploadReceiptSignatureHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }
  if (!req.file) {
    res.status(400).json({ error: 'A signature image is required' });
    return;
  }

  const settings = await setReceiptSignature(req.user.societyId, {
    buffer: req.file.buffer,
    mimeType: req.file.mimetype,
    extension: path.extname(req.file.originalname) || '.png',
  });
  res.status(200).json(settings);
}

export async function removeReceiptSignatureHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }
  const settings = await removeReceiptSignature(req.user.societyId);
  res.status(200).json(settings);
}

// Authenticated preview thumbnail for the Settings UI — same "fetch as blob"
// pattern the frontend already uses for payment-proof files, never a public URL.
export async function getReceiptSignatureHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  const result = await getReceiptSignatureForViewing(req.user.societyId);
  if (!result) {
    res.status(404).json({ error: 'No signature uploaded' });
    return;
  }
  res.setHeader('Content-Type', result.mimeType);
  result.stream.once('error', () => {
    if (!res.headersSent) res.status(404).json({ error: 'No signature uploaded' });
  });
  result.stream.pipe(res);
}
