import { Router, type IRouter, Response } from 'express';
import { z } from 'zod';
import { depositEscrow, releaseEscrow, refundEscrow, expireEscrow, getEscrow } from '../services/escrowService.js';
import { recordEscrowDeposit, recordEscrowClosed } from '../metrics/registry.js';
import { validateStellarAddress } from '../middleware/validateStellarAddress.js';
import { StellarAddress } from '../schemas/stellar.js';

const router: IRouter = Router();

const DepositSchema = z.object({
  queueId: z.string().min(1),
  identity: StellarAddress,
  amount: z.number().positive(),
  asset: z.string().min(1),
  holdDays: z.number().int().positive().optional(),
});

const EscrowActionSchema = z.object({
  escrowId: z.string().min(1).refine(
    (value) => {
      // escrowId format: ${queueId}:${identity}
      const parts = value.split(':');
      if (parts.length !== 2) return false;
      const identity = parts[1];
      return /^G[A-Z2-7]{55}$/.test(identity);
    },
    {
      message: 'Invalid escrowId format. Must be ${queueId}:${identity} where identity is a valid Stellar address.',
    }
  ),
});

router.post('/deposit', validateStellarAddress(['identity']), (req: any, res: Response, next) => {
  const parsed = DepositSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid request', issues: parsed.error.issues });
  try {
    const record = depositEscrow(parsed.data);
    recordEscrowDeposit(record.asset);
    res.status(201).json(record);
  } catch (err) {
    next(err);
  }
});

router.post('/release', (req: any, res: Response, next) => {
  const parsed = EscrowActionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid request', issues: parsed.error.issues });
  try {
    const updated = releaseEscrow(parsed.data.escrowId);
    if (!updated) return res.status(404).json({ message: 'Escrow not found' });
    recordEscrowClosed();
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.post('/refund', (req: any, res: Response, next) => {
  const parsed = EscrowActionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid request', issues: parsed.error.issues });
  try {
    const updated = refundEscrow(parsed.data.escrowId);
    if (!updated) return res.status(404).json({ message: 'Escrow not found' });
    recordEscrowClosed();
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.post('/expire', (req: any, res: Response, next) => {
  const parsed = EscrowActionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid request', issues: parsed.error.issues });
  try {
    const updated = expireEscrow(parsed.data.escrowId);
    if (!updated) return res.status(404).json({ message: 'Escrow not found' });
    recordEscrowClosed();
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', (req, res: Response) => {
  const record = getEscrow(req.params.id);
  if (!record) return res.status(404).json({ message: 'Escrow not found' });
  res.json(record);
});

export default router;
