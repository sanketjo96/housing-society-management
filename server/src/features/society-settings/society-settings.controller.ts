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

// Authenticated preview thumbnail for the Settings UI — never a public URL.
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
