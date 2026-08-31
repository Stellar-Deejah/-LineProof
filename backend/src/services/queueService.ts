import { QueueStatus, transitionQueueStatus } from '../schemas/queueStatus.js';
export { QueueStatus };
import { defaultMemoryAdapter, type StorageAdapter } from '../storage/index.js';
import { serviceEmitter } from './eventEmitter.js';
import { enrollmentService as defaultEnrollmentService, type EnrollmentService } from './enrollmentService.js';

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

const NS = 'queues';

/**
 * Seed data. Returned by a function so each service instance gets its own fresh
 * copies — a fixture mutated in one test can never leak into another.
 */
export function defaultFixtures(): Queue[] {
  return [
    {
      id: 'sneaker-drop-001',
      name: 'Sneaker Drop #001',
      slug: 'sneaker-drop-001',
      description: 'Limited-edition sneaker release with non-transferable queue positions and escrow hold.',
      maxPositions: 250,
      enrolled: 187,
      advanced: 0,
      status: QueueStatus.EnrollmentOpen,
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
      status: QueueStatus.Closed,
      advancementRule: 'FIFO',
      escrowAsset: 'XLM',
      escrowAmount: 25,
      createdAt: new Date(Date.now() - 86400_000 * 14).toISOString(),
    },
  ];
}

export interface QueueService {
  listQueues(): Queue[];
  getQueueById(id: string): Queue | undefined;
  getQueueStats(id: string): QueueStats | undefined;
  createQueue(payload: {
    name: string;
    slug: string;
    maxPositions: number;
    advancementRule?: 'FIFO' | 'Priority' | 'VerifiableRandomness' | undefined;
    escrowRequired?: boolean | undefined;
    description?: string | undefined;
  }): Queue;
  advanceQueue(id: string, batchSize: number): Queue | undefined;
  closeQueue(id: string): Queue | undefined;
  openEnrollment(id: string): Queue | undefined;
  closeEnrollment(id: string): Queue | undefined;
}

/**
 * Build a queue service over an injected storage adapter (issue #91), seeded
 * with the given fixtures. Pass a fresh adapter in tests for full isolation;
 * production uses the shared default singleton exported below.
 */
export function createQueueService(
  store: StorageAdapter = defaultMemoryAdapter,
  fixtures: Queue[] = defaultFixtures(),
  enrollmentSvc: EnrollmentService = defaultEnrollmentService,
): QueueService {
  // Seed fixtures that are not already present. `set` is idempotent, so
  // re-seeding never clears rows created at runtime.
  for (const queue of fixtures) {
    if ((store.get<Queue>(NS, queue.id) as Queue | undefined) === undefined) {
      store.set<Queue>(NS, queue.id, queue);
    }
  }

  const listQueues = (): Queue[] => store.list<Queue>(NS) as Queue[];

  const getQueueById = (id: string): Queue | undefined =>
    listQueues().find((queue) => queue.id === id || queue.slug === id);

  const persistTransition = (
    queue: Queue,
    next: QueueStatus,
  ): Queue => {
    let oldStatus: QueueStatus;
    try {
      transitionQueueStatus(queue.status, next);
      oldStatus = queue.status;
    } catch (err) {
      (err as Error & { status: number }).status = 409;
      throw err;
    }
    queue.status = next;
    store.set<Queue>(NS, queue.id, queue);
    if (oldStatus !== queue.status) {
      serviceEmitter.emit('queue.status_changed', { queueId: queue.id, status: queue.status, queue });
    }
    return queue;
  };

  return {
    listQueues,
    getQueueById,
    getQueueStats: (id) => {
      const queue = getQueueById(id);
      if (!queue) return undefined;
      // `queue.enrolled` is an ever-enrolled audit figure seeded from fixtures
      // and does not exclude cancelled positions (see contracts issue #181:
      // total_enrolled() has the same "ever enrolled" semantics on-chain).
      // Where the enrollment service has tracked live (non-cancelled)
      // enrollments for this queue, prefer that count for capacity/percentage
      // math so operators see the active count, not an inflated total.
      const activeEnrollments = enrollmentSvc.getEnrollmentsByQueue(queue.id).length;
      const activeEnrolled = activeEnrollments > 0 ? activeEnrollments : queue.enrolled;
      return {
        queueId: queue.id,
        total: activeEnrolled,
        advanced: queue.advanced,
        remaining: activeEnrolled - queue.advanced,
        percentAdvanced: activeEnrolled > 0 ? Math.round((queue.advanced / activeEnrolled) * 100) : 0,
      };
    },
    createQueue: (payload) => {
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
        status: QueueStatus.Draft,
        advancementRule: payload.advancementRule ?? 'FIFO',
        escrowAsset: 'XLM',
        escrowAmount: 0,
        createdAt: new Date().toISOString(),
      };
      store.set<Queue>(NS, queue.id, queue);
      serviceEmitter.emit('queue.created', queue);
      return queue;
    },
    advanceQueue: (id, batchSize) => {
      const queue = getQueueById(id);
      if (!queue) return undefined;
      persistTransition(queue, QueueStatus.AdvancementActive);
      const toAdvance = Math.min(batchSize, queue.enrolled - queue.advanced);
      queue.advanced += Math.max(0, toAdvance);
      store.set<Queue>(NS, queue.id, queue);
      serviceEmitter.emit('queue.advanced', { queueId: queue.id, advanced: queue.advanced, queue });
      return queue;
    },
    closeQueue: (id) => {
      const queue = getQueueById(id);
      if (!queue) return undefined;
      return persistTransition(queue, QueueStatus.Closed);
    },
    openEnrollment: (id) => {
      const queue = getQueueById(id);
      if (!queue) return undefined;
      return persistTransition(queue, QueueStatus.EnrollmentOpen);
    },
    closeEnrollment: (id) => {
      const queue = getQueueById(id);
      if (!queue) return undefined;
      return persistTransition(queue, QueueStatus.EnrollmentClosed);
    },
  };
}

/** Default singleton over the shared adapter — used by production route handlers. */
export const queueService = createQueueService();

export const listQueues = queueService.listQueues;
export const getQueueById = queueService.getQueueById;
export const getQueueStats = queueService.getQueueStats;
export const createQueue = queueService.createQueue;
export const advanceQueue = queueService.advanceQueue;
export const closeQueue = queueService.closeQueue;
export const openEnrollment = queueService.openEnrollment;
export const closeEnrollment = queueService.closeEnrollment;
