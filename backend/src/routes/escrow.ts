import { Router, type IRouter, Request, Response } from 'express';
import { z } from 'zod';
import { depositEscrow, releaseEscrow, refundEscrow, expireEscrow, getEscrow } from '../services/escrowService.js';
import { recordEscrowDeposit, recordEscrowClosed } from '../metrics/registry.js';
import { requireAuth } from '../middleware/auth.js';
import { validateStellarAddress } from '../middleware/validateStellarAddress.js';
import { StellarAddress } from '../schemas/stellar.js';
import { NotFoundError, ValidationError } from '../errors/index.js';

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

type DepositInput = z.infer<typeof DepositSchema>;
type EscrowActionInput = z.infer<typeof EscrowActionSchema>;

router.post('/deposit', validateStellarAddress(['identity']), (req: Request<{}, {}, DepositInput>, res: Response, next): void => {
  try {
    const parsed = DepositSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError('Invalid request', { issues: parsed.error.issues });

    const record = depositEscrow(parsed.data);
    recordEscrowDeposit(record.asset);
    res.status(201).json(record);
  } catch (err) {
    next(err);
  }
});

router.post('/release', requireAuth, (req: Request<{}, {}, EscrowActionInput>, res: Response, next): void => {
  try {
    const parsed = EscrowActionSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError('Invalid request', { issues: parsed.error.issues });

    const updated = releaseEscrow(parsed.data.escrowId);
    if (!updated) throw new NotFoundError('Escrow not found');

    recordEscrowClosed();
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.post('/refund', requireAuth, (req: Request<{}, {}, EscrowActionInput>, res: Response, next): void => {
  try {
    const parsed = EscrowActionSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError('Invalid request', { issues: parsed.error.issues });

    const updated = refundEscrow(parsed.data.escrowId);
    if (!updated) throw new NotFoundError('Escrow not found');

    recordEscrowClosed();
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.post('/expire', requireAuth, (req: Request<{}, {}, EscrowActionInput>, res: Response, next): void => {
  try {
    const parsed = EscrowActionSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError('Invalid request', { issues: parsed.error.issues });

    const updated = expireEscrow(parsed.data.escrowId);
    if (!updated) throw new NotFoundError('Escrow not found');

    recordEscrowClosed();
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', (req: Request<{ id: string }>, res: Response, next): void => {
  try {
    const record = getEscrow(req.params.id);
    if (!record) throw new NotFoundError('Escrow not found');
    res.json(record);
  } catch (err) {
    next(err);
  }
});

export default router;
