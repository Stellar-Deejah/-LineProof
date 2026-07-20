import { Router, type IRouter, Request, Response } from 'express';
import { z } from 'zod';
import { listQueues, getQueueById, createQueue, advanceQueue, closeQueue, getQueueStats, openEnrollment, closeEnrollment } from '../services/queueService.js';
import { readQueueOnChain } from '../contracts/index.js';
import { SlugSchema } from '../schemas/slug.js';

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

router.get('/', (req, res: Response): Response => {
  const { status } = req.query;
  const queues = listQueues();
  if (status && typeof status === 'string') {
    const filtered = queues.filter((q) => q.status === status);
    return res.json(filtered);
  }
  return res.json(queues);
});

router.get('/:id', async (req: Request<{ id: string }>, res: Response, next): Promise<void> => {
  try {
    const slugResult = SlugSchema.safeParse(req.params.id);
    if (!slugResult.success) {
      res.status(400).json({ message: 'Invalid queue ID format' });
      return;
    }

    const onChain = await readQueueOnChain(slugResult.data);
    if (onChain) {
      res.json({ ...onChain, source: 'on-chain' });
      return;
    }

    const queue = getQueueById(slugResult.data);
    if (!queue) {
      res.status(404).json({ message: 'Queue not found' });
      return;
    }
    res.json({ ...queue, source: 'in-memory' });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/stats', (req: Request<{ id: string }>, res: Response): Response | void => {
  const slugResult = SlugSchema.safeParse(req.params.id);
  if (!slugResult.success) return res.status(400).json({ message: 'Invalid queue ID format' });

  const stats = getQueueStats(slugResult.data);
  if (!stats) return res.status(404).json({ message: 'Queue not found' });
  return res.json(stats);
});

router.post('/', (req, res: Response): Response => {
  const parsed = CreateQueueSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid request', issues: parsed.error.issues });
  const queue = createQueue(parsed.data);
  return res.status(201).json(queue);
});

router.post('/:id/advance', (req: Request<{ id: string }>, res: Response, next): void => {
  const slugResult = SlugSchema.safeParse(req.params.id);
  if (!slugResult.success) {
    res.status(400).json({ message: 'Invalid queue ID format' });
    return;
  }

  const parsed = AdvanceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid request', issues: parsed.error.issues });
    return;
  }

  try {
    const queue = advanceQueue(slugResult.data, parsed.data.batchSize ?? 10);
    if (!queue) {
      res.status(404).json({ message: 'Queue not found' });
      return;
    }
    res.json(queue);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/close', (req: Request<{ id: string }>, res: Response, next): void => {
  const slugResult = SlugSchema.safeParse(req.params.id);
  if (!slugResult.success) {
    res.status(400).json({ message: 'Invalid queue ID format' });
    return;
  }

  try {
    const queue = closeQueue(slugResult.data);
    if (!queue) {
      res.status(404).json({ message: 'Queue not found' });
      return;
    }
    res.json(queue);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/open-enrollment', (req: Request<{ id: string }>, res: Response, next): void => {
  const slugResult = SlugSchema.safeParse(req.params.id);
  if (!slugResult.success) {
    res.status(400).json({ message: 'Invalid queue ID format' });
    return;
  }

  try {
    const queue = openEnrollment(slugResult.data);
    if (!queue) {
      res.status(404).json({ message: 'Queue not found' });
      return;
    }
    res.json(queue);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/close-enrollment', (req: Request<{ id: string }>, res: Response, next): void => {
  const slugResult = SlugSchema.safeParse(req.params.id);
  if (!slugResult.success) {
    res.status(400).json({ message: 'Invalid queue ID format' });
    return;
  }

  try {
    const queue = closeEnrollment(slugResult.data);
    if (!queue) {
      res.status(404).json({ message: 'Queue not found' });
      return;
    }
    res.json(queue);
  } catch (err) {
    next(err);
  }
});

export default router;
