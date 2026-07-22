import { z } from 'zod';
import { QueueStatus } from './queueStatus.js';

export const PublicQueueSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  status: z.nativeEnum(QueueStatus),
  enrolled: z.number().int().nonnegative(),
  maxPositions: z.number().int().positive(),
  advancementRule: z.string(),
  advancementRuleImplemented: z.boolean(),
});

export const PublicQueueSummaryListSchema = z.array(PublicQueueSummarySchema);

export type PublicQueueSummary = z.infer<typeof PublicQueueSummarySchema>;

export const PublicQueueStatsSchema = z.object({
  queueId: z.string(),
  total: z.number().int().nonnegative(),
  advanced: z.number().int().nonnegative(),
  remaining: z.number().int().nonnegative(),
  percentAdvanced: z.number().min(0).max(100),
});

export type PublicQueueStats = z.infer<typeof PublicQueueStatsSchema>;
