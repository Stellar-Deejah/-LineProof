import { Router, type IRouter, Request, Response } from 'express';
import { z } from 'zod';
import { listQueues, getQueueById, createQueue, advanceQueue, closeQueue, getQueueStats, openEnrollment, closeEnrollment } from '../services/queueService.js';
import { readQueueOnChain } from '../contracts/index.js';
import { SlugSchema } from '../schemas/slug.js';
import { NotFoundError, ValidationError } from '../errors/index.js';
import { requireAuth } from '../middleware/auth.js';

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

const GetQueuesQuerySchema = z.object({
  status: z.string().optional(),
  limit: z.preprocess(
    (val) => (val === undefined ? undefined : Number(val)),
    z.number().int().min(1).max(100).default(20)
  ),
  cursor: z.string().optional(),
});

router.get('/', (req, res: Response): Response => {
  const queryResult = GetQueuesQuerySchema.safeParse(req.query);
  if (!queryResult.success) {
    return res.status(400).json({
      message: 'Invalid query parameters',
      issues: queryResult.error.issues,
    });
  }

  const { status, limit, cursor } = queryResult.data;
  const queues = listQueues();

  let filtered = queues;
  if (status && typeof status === 'string') {
    filtered = queues.filter((q) => q.status === status);
  }

  const total = filtered.length;
  let startIndex = 0;

  if (cursor) {
    try {
      const lastSlug = Buffer.from(cursor, 'base64').toString('utf8');
      const index = filtered.findIndex((q) => q.slug === lastSlug);
      if (index === -1) {
        return res.status(400).json({ message: 'Invalid cursor: slug not found' });
      }
      startIndex = index + 1;
    } catch (err) {
      return res.status(400).json({ message: 'Invalid cursor format' });
    }
  }

  const paginated = filtered.slice(startIndex, startIndex + limit);

  let nextCursor: string | null = null;
  if (paginated.length > 0) {
    const lastItem = paginated[paginated.length - 1];
    const lastIndex = filtered.findIndex((q) => q.slug === lastItem.slug);
    if (lastIndex < total - 1) {
      nextCursor = Buffer.from(lastItem.slug).toString('base64');
    }
  }

  return res.json({
    items: paginated,
    nextCursor,
    total,
  });
});

router.get('/:id', async (req: Request<{ id: string }>, res: Response, next): Promise<void> => {
  try {
    const slugResult = SlugSchema.safeParse(req.params.id);
    if (!slugResult.success) {
      throw new ValidationError('Invalid queue ID format');
    }

    const onChain = await readQueueOnChain(slugResult.data);
    if (onChain) {
      res.json({ ...onChain, source: 'on-chain' });
      return;
    }

    const queue = getQueueById(slugResult.data);
    if (!queue) {
      throw new NotFoundError('Queue not found');
    }
    res.json({ ...queue, source: 'in-memory' });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/stats', (req: Request<{ id: string }>, res: Response, next): void => {
  try {
    const slugResult = SlugSchema.safeParse(req.params.id);
    if (!slugResult.success) throw new ValidationError('Invalid queue ID format');

    const stats = getQueueStats(slugResult.data);
    if (!stats) throw new NotFoundError('Queue not found');
    res.json(stats);
  } catch (err) {
    next(err);
  }
});

router.post('/', requireAuth, (req, res: Response, next): void => {
  try {
    const parsed = CreateQueueSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError('Invalid request', { issues: parsed.error.issues });
    const queue = createQueue(parsed.data);
    res.status(201).json(queue);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/advance', requireAuth, (req: Request<{ id: string }>, res: Response, next): void => {
  try {
    const slugResult = SlugSchema.safeParse(req.params.id);
    if (!slugResult.success) throw new ValidationError('Invalid queue ID format');

    const parsed = AdvanceSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError('Invalid request', { issues: parsed.error.issues });

    const queue = advanceQueue(slugResult.data, parsed.data.batchSize ?? 10);
    if (!queue) throw new NotFoundError('Queue not found');
    res.json(queue);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/close', requireAuth, (req: Request<{ id: string }>, res: Response, next): void => {
  try {
    const slugResult = SlugSchema.safeParse(req.params.id);
    if (!slugResult.success) throw new ValidationError('Invalid queue ID format');

    const queue = closeQueue(slugResult.data);
    if (!queue) throw new NotFoundError('Queue not found');
    res.json(queue);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/open-enrollment', requireAuth, (req: Request<{ id: string }>, res: Response, next): void => {
  try {
    const slugResult = SlugSchema.safeParse(req.params.id);
    if (!slugResult.success) throw new ValidationError('Invalid queue ID format');

    const queue = openEnrollment(slugResult.data);
    if (!queue) throw new NotFoundError('Queue not found');
    res.json(queue);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/close-enrollment', requireAuth, (req: Request<{ id: string }>, res: Response, next): void => {
  try {
    const slugResult = SlugSchema.safeParse(req.params.id);
    if (!slugResult.success) throw new ValidationError('Invalid queue ID format');

    const queue = closeEnrollment(slugResult.data);
    if (!queue) throw new NotFoundError('Queue not found');
    res.json(queue);
  } catch (err) {
    next(err);
  }
});

export default router;
