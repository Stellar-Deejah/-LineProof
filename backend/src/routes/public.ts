/**
 * Public read-only routes — no auth required.
 * These endpoints are safe to expose without rate limiting.
 */
import { Router, type IRouter } from 'express';
import { listQueues, getQueueStats } from '../services/queueService.js';
import { PublicQueueSummaryListSchema, PublicQueueStatsSchema } from '../schemas/publicQueue.js';

const router: IRouter = Router();

/** GET /public/queues — list all queues (summary, no internal fields) */
router.get('/queues', (_req, res) => {
  const rawSummary = listQueues().map(({ id, name, slug, status, enrolled, maxPositions, advancementRule }) => ({
    id,
    name,
    slug,
    status,
    enrolled,
    maxPositions,
    advancementRule,
    advancementRuleImplemented: (advancementRule ?? '').toUpperCase() === 'FIFO',
  }));
  const summary = PublicQueueSummaryListSchema.parse(rawSummary);
  res.json(summary);
});

/** GET /public/queues/:id/stats — public queue statistics */
router.get('/queues/:id/stats', (req, res) => {
  const stats = getQueueStats(req.params.id);
  if (!stats) return res.status(404).json({ message: 'Queue not found' });
  const validatedStats = PublicQueueStatsSchema.parse(stats);
  res.json(validatedStats);
});

/**
 * GET /public/health — legacy health check endpoint.
 * Unified with GET /health by issuing a permanent 301 redirect.
 */
router.get('/health', (_req, res) => {
  res.redirect(301, '/health');
});

export default router;

