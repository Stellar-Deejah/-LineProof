/**
 * Public read-only routes — no auth required.
 * These endpoints are safe to expose without rate limiting.
 */
import { Router, type IRouter } from 'express';
import { mockQueues, getQueueStats } from '../services/queueService.js';

const router: IRouter = Router();

/** GET /public/queues — list all queues (summary, no internal fields) */
router.get('/queues', (req, res) => {
  const summary = mockQueues.map(({ id, name, slug, status, enrolled, maxPositions, advancementRule }) => ({
    id,
    name,
    slug,
    status,
    enrolled,
    maxPositions,
    advancementRule,
  }));
  res.json(summary);
});

/** GET /public/queues/:id/stats — public queue statistics */
router.get('/queues/:id/stats', (req, res) => {
  const stats = getQueueStats(req.params.id);
  if (!stats) return res.status(404).json({ message: 'Queue not found' });
  res.json(stats);
});

/** GET /public/health — lightweight liveness check */
router.get('/health', (req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

export default router;
