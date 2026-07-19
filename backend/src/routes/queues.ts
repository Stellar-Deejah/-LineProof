import { Router, type IRouter, Response } from 'express';
import { z } from 'zod';
import { listQueues, getQueueById, createQueue, advanceQueue, closeQueue, getQueueStats, openEnrollment, closeEnrollment } from '../services/queueService.js';
import { readQueueOnChain } from '../contracts/index.js';

const router: IRouter = Router();

const CreateQueueSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(120),
  maxPositions: z.number().int().positive(),
  advancementRule: z.enum(['FIFO', 'Priority', 'VerifiableRandomness']).optional(),
  escrowRequired: z.boolean().optional(),
  description: z.string().max(500).optional(),
});

const AdvanceSchema = z.object({
  batchSize: z.number().int().positive().max(1000).optional(),
});

router.get('/', (req, res: Response) => {
  const { status } = req.query;
  const queues = listQueues();
  if (status && typeof status === 'string') {
    const filtered = queues.filter((q) => q.status === status);
    return res.json(filtered);
  }
  res.json(queues);
});

router.get('/:id', async (req, res: Response, next) => {
  try {
    // Prefer authoritative on-chain state when contract IDs are configured;
    // fall back to the in-memory store when contracts are unset or the RPC
    // read path is unavailable (issue #4, phase 3).
    const onChain = await readQueueOnChain(req.params.id);
    if (onChain) return res.json({ ...onChain, source: 'on-chain' });

    const queue = getQueueById(req.params.id);
    if (!queue) return res.status(404).json({ message: 'Queue not found' });
    res.json({ ...queue, source: 'in-memory' });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/stats', (req, res: Response) => {
  const stats = getQueueStats(req.params.id);
  if (!stats) return res.status(404).json({ message: 'Queue not found' });
  res.json(stats);
});

router.post('/', (req, res: Response) => {
  const parsed = CreateQueueSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid request', issues: parsed.error.issues });
  const queue = createQueue(parsed.data);
  res.status(201).json(queue);
});

router.post('/:id/advance', (req: any, res: Response, next) => {
  const parsed = AdvanceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid request', issues: parsed.error.issues });
  try {
    const queue = advanceQueue(req.params.id, parsed.data.batchSize ?? 10);
    if (!queue) return res.status(404).json({ message: 'Queue not found' });
    res.json(queue);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/close', (req: any, res: Response, next) => {
  try {
    const queue = closeQueue(req.params.id);
    if (!queue) return res.status(404).json({ message: 'Queue not found' });
    res.json(queue);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/open-enrollment', (req: any, res: Response, next) => {
  try {
    const queue = openEnrollment(req.params.id);
    if (!queue) return res.status(404).json({ message: 'Queue not found' });
    res.json(queue);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/close-enrollment', (req: any, res: Response, next) => {
  try {
    const queue = closeEnrollment(req.params.id);
    if (!queue) return res.status(404).json({ message: 'Queue not found' });
    res.json(queue);
  } catch (err) {
    next(err);
  }
});

export default router;
