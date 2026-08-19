import type { Request, Response } from 'express';
import { billOtherChargeSchema } from './other-charges.schemas';
import {
  billOtherCharge,
  FeeTypeNotBillableError,
  FlatNotFoundError,
  InvalidAmountError,
  listOtherCharges,
} from './other-charges.service';

export async function listOtherChargesHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }
  const charges = await listOtherCharges(req.user.societyId);
  res.status(200).json(charges);
}

export async function billOtherChargeHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  const parsed = billOtherChargeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    return;
  }

  try {
    const charge = await billOtherCharge(req.user.societyId, req.user.id, parsed.data);
    res.status(201).json(charge);
  } catch (err) {
    if (err instanceof FlatNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    if (err instanceof FeeTypeNotBillableError || err instanceof InvalidAmountError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
}
