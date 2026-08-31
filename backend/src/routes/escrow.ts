import { Router, type IRouter, Request, Response } from 'express';
import { z } from 'zod';
import { toStroops } from '@lineproof/sdk';
import { depositEscrow, releaseEscrow, refundEscrow, expireEscrow, getEscrow } from '../services/escrowService.js';
import { recordEscrowDeposit, recordEscrowClosed } from '../metrics/registry.js';
import { validateStellarAddress } from '../middleware/validateStellarAddress.js';
import { StellarAddress } from '../schemas/stellar.js';
import { NotFoundError, ValidationError } from '../errors/index.js';

const router: IRouter = Router();
const MAX_I128_STROOPS = (1n << 127n) - 1n;

const DepositSchema = z.object({
  queueId: z.string().min(1),
  identity: StellarAddress,
  amount: z.string().regex(/^\d+(?:\.\d{1,7})?$/),
  asset: z.string().min(1),
  holdDays: z.number().int().positive().optional(),
}).strict();

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
}).strict();

type DepositInput = z.infer<typeof DepositSchema>;
type EscrowActionInput = z.infer<typeof EscrowActionSchema>;

router.post('/deposit', validateStellarAddress(['identity']), (req: Request<{}, {}, DepositInput>, res: Response, next): void => {
  try {
    const parsed = DepositSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError('Invalid request', { issues: parsed.error.issues });

    let amount: bigint;
    try {
      amount = toStroops(parsed.data.amount);
    } catch (e) {
      throw new ValidationError('Invalid amount format or value');
    }
    if (amount === 0n || amount > MAX_I128_STROOPS) throw new ValidationError('Amount is outside the positive i128 range');
    const record = depositEscrow({ ...parsed.data, amount });
    recordEscrowDeposit(record.asset);
    res.status(201).json(record);
  } catch (err) {
    next(err);
  }
});

router.post('/release', (req: Request<{}, {}, EscrowActionInput>, res: Response, next): void => {
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

router.post('/refund', (req: Request<{}, {}, EscrowActionInput>, res: Response, next): void => {
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

router.post('/expire', (req: Request<{}, {}, EscrowActionInput>, res: Response, next): void => {
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
