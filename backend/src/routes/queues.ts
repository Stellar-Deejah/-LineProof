import { Router, type IRouter, Response } from 'express';
import { z } from 'zod';
import { mockQueues, getQueueById, createQueue, advanceQueue, closeQueue, getQueueStats } from '../services/queueService.js';

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
  if (status && typeof status === 'string') {
    const filtered = mockQueues.filter((q) => q.status === status);
    return res.json(filtered);
  }
  res.json(mockQueues);
});

router.get('/:id', (req, res: Response) => {
  const queue = getQueueById(req.params.id);
  if (!queue) return res.status(404).json({ message: 'Queue not found' });
  res.json(queue);
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

export default router;
