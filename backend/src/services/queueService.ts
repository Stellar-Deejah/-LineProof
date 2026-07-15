import { defaultMemoryAdapter } from '../storage/index.js';

export type QueueStatus = 'Draft' | 'Open' | 'AdvancementActive' | 'Closed';

export type Queue = {
  id: string;
  name: string;
  slug: string;
  description: string;
  maxPositions: number;
  enrolled: number;
  advanced: number;
  status: QueueStatus;
  advancementRule: 'FIFO' | 'Priority' | 'VerifiableRandomness';
  escrowAsset: string;
  escrowAmount: number;
  createdAt: string;
};

export type QueueStats = {
  queueId: string;
  total: number;
  advanced: number;
  remaining: number;
  percentAdvanced: number;
};

// Queue records live in the shared storage adapter (namespace `queues`) rather
// than a module-level array, so the service goes through the persistence seam
// (issue #4). The MemoryAdapter stores object references, so mutating a returned
// queue mutates the stored record — preserving the previous fixture behaviour.
const store = defaultMemoryAdapter;
const NS = 'queues';

const FIXTURE_QUEUES: Queue[] = [
  {
    id: 'sneaker-drop-001',
    name: 'Sneaker Drop #001',
    slug: 'sneaker-drop-001',
    description: 'Limited-edition sneaker release with non-transferable queue positions and escrow hold.',
    maxPositions: 250,
    enrolled: 187,
    advanced: 0,
    status: 'Open',
    advancementRule: 'FIFO',
    escrowAsset: 'USDC',
    escrowAmount: 150,
    createdAt: new Date(Date.now() - 86400_000 * 3).toISOString(),
  },
  {
    id: 'visa-appointment-001',
    name: 'Visa Appointment Batch A',
    slug: 'visa-appointment-001',
    description: 'Deterministic FIFO queue for scheduled visa interviews.',
    maxPositions: 120,
    enrolled: 120,
    advanced: 120,
    status: 'Closed',
    advancementRule: 'FIFO',
    escrowAsset: 'XLM',
    escrowAmount: 25,
    createdAt: new Date(Date.now() - 86400_000 * 14).toISOString(),
  },
];

// Seed fixtures once so first-run reads have data. `set` is idempotent, so a
// module reload simply refreshes the fixture rows without clearing created ones.
for (const queue of FIXTURE_QUEUES) {
  if (store.get<Queue>(NS, queue.id) === undefined) {
    store.set<Queue>(NS, queue.id, queue);
  }
}

/** List every queue (live view over the store). */
export const listQueues = (): Queue[] => store.list<Queue>(NS);

export const getQueueById = (id: string): Queue | undefined => {
  return listQueues().find((queue) => queue.id === id || queue.slug === id);
};

export const getQueueStats = (id: string): QueueStats | undefined => {
  const queue = getQueueById(id);
  if (!queue) return undefined;
  return {
    queueId: queue.id,
    total: queue.enrolled,
    advanced: queue.advanced,
    remaining: queue.enrolled - queue.advanced,
    percentAdvanced: queue.enrolled > 0 ? Math.round((queue.advanced / queue.enrolled) * 100) : 0,
  };
};

export const createQueue = (payload: {
  name: string;
  slug: string;
  maxPositions: number;
  advancementRule?: 'FIFO' | 'Priority' | 'VerifiableRandomness';
  escrowRequired?: boolean;
  description?: string;
}): Queue => {
  if (listQueues().some((q) => q.slug === payload.slug || q.id === payload.slug)) {
    const error = new Error(`Queue with slug "${payload.slug}" already exists`) as Error & { status: number };
    error.status = 409;
    throw error;
  }
  const queue: Queue = {
    id: payload.slug,
    name: payload.name,
    slug: payload.slug,
    description: payload.description ?? 'New queue',
    maxPositions: payload.maxPositions,
    enrolled: 0,
    advanced: 0,
    status: 'Draft',
    advancementRule: payload.advancementRule ?? 'FIFO',
    escrowAsset: 'XLM',
    escrowAmount: 0,
    createdAt: new Date().toISOString(),
  };
  store.set<Queue>(NS, queue.id, queue);
  return queue;
};

export const advanceQueue = (id: string, batchSize: number): Queue | undefined => {
  const queue = getQueueById(id);
  if (!queue) return undefined;
  if (queue.status === 'Closed') {
    const error = new Error('Queue is closed') as Error & { status: number };
    error.status = 409;
    throw error;
  }
  queue.status = 'AdvancementActive';
  const toAdvance = Math.min(batchSize, queue.enrolled - queue.advanced);
  queue.advanced += Math.max(0, toAdvance);
  store.set<Queue>(NS, queue.id, queue);
  return queue;
};

export const closeQueue = (id: string): Queue | undefined => {
  const queue = getQueueById(id);
  if (!queue) return undefined;
  queue.status = 'Closed';
  store.set<Queue>(NS, queue.id, queue);
  return queue;
};
