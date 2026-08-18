import path from 'node:path';
import type { Request, Response } from 'express';
import { updateSettingsSchema } from './society-settings.schemas';
import {
  type CommitteeRole,
  getCommitteeSignatureForViewing,
  removeCommitteeSignature,
  setCommitteeSignature,
} from './committee-signature-service';
import {
  getSocietySettings,
  IncompleteBankDetailsError,
  InvalidCommitteeMemberError,
  updateSocietySettings,
} from './settings-service';

// Standard 11-character Indian bank IFSC format: 4-letter bank code, a literal
// '0', then 6 alphanumeric branch chars — e.g. HDFC0001234. Banks always issue
// these in uppercase, so lowercase input is rejected with a clear message rather
// than silently normalized.
// Date-only, no time component — matches the <input type="date"> value format the
// frontend sends.
// Matches Society.tenantRateFactor's @db.Decimal(3,2) column headroom (up to 9.99).
// receiptNumberPrefix restricted to a short alphanumeric/hyphen token — it's
// concatenated directly into every receipt number (receipt.service.ts's
// buildReceiptNumber), so free-form text (commas, newlines) has no business there.
// upiVpa/bankAccountNumber/bankIfsc and the three receipt text fields all accept
// an empty string deliberately — that's how the service (updateSocietySettings)
// knows to clear the field back to null, as opposed to omitting the key entirely
// to leave it untouched. Whether the *result* is a usable payment configuration
// (UPI set, or a complete account-number+IFSC pair) is checked in the service
// against the merged final state, not here — a lone bankIfsc in this one request
// might be pairing with a bankAccountNumber saved in an earlier request.
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

  try {
    const settings = await updateSocietySettings(req.user.societyId, parsed.data);
    res.status(200).json(settings);
  } catch (err) {
    if (err instanceof IncompleteBankDetailsError || err instanceof InvalidCommitteeMemberError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
}

const COMMITTEE_ROLE_PARAMS: Record<string, CommitteeRole> = {
  chairman: 'CHAIRMAN',
  secretary: 'SECRETARY',
  treasurer: 'TREASURER',
};

function parseCommitteeRoleParam(raw: string): CommitteeRole | null {
  return COMMITTEE_ROLE_PARAMS[raw] ?? null;
}

export async function uploadCommitteeSignatureHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }
  const role = parseCommitteeRoleParam(req.params.role);
  if (!role) {
    res.status(400).json({ error: 'Invalid committee role' });
    return;
  }
  if (!req.file) {
    res.status(400).json({ error: 'A signature image is required' });
    return;
  }

  const settings = await setCommitteeSignature(req.user.societyId, role, {
    buffer: req.file.buffer,
    mimeType: req.file.mimetype,
    extension: path.extname(req.file.originalname) || '.png',
  });
  res.status(200).json(settings);
}

export async function removeCommitteeSignatureHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }
  const role = parseCommitteeRoleParam(req.params.role);
  if (!role) {
    res.status(400).json({ error: 'Invalid committee role' });
    return;
  }
  const settings = await removeCommitteeSignature(req.user.societyId, role);
  res.status(200).json(settings);
}

// Authenticated preview thumbnail for the Settings UI — same "fetch as blob"
// pattern the frontend already uses for payment-proof files, never a public URL.
export async function getCommitteeSignatureHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }
  const role = parseCommitteeRoleParam(req.params.role);
  if (!role) {
    res.status(400).json({ error: 'Invalid committee role' });
    return;
  }

  const result = await getCommitteeSignatureForViewing(req.user.societyId, role);
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
