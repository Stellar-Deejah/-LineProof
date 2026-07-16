import { QueueStatus, transitionQueueStatus } from '../schemas/queueStatus.js';
export { QueueStatus };

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

const FIXTURE_QUEUES: Queue[] = [
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

export const mockQueues: Queue[] = FIXTURE_QUEUES;

export const getQueueById = (id: string): Queue | undefined => {
  return FIXTURE_QUEUES.find((queue) => queue.id === id || queue.slug === id);
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
  if (FIXTURE_QUEUES.some((q) => q.slug === payload.slug || q.id === payload.slug)) {
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
  FIXTURE_QUEUES.push(queue);
  return queue;
};

export const advanceQueue = (id: string, batchSize: number): Queue | undefined => {
  const queue = getQueueById(id);
  if (!queue) return undefined;
  
  try {
    transitionQueueStatus(queue.status, QueueStatus.AdvancementActive);
  } catch (err: any) {
    err.status = 409;
    throw err;
  }
  
  queue.status = QueueStatus.AdvancementActive;
  const toAdvance = Math.min(batchSize, queue.enrolled - queue.advanced);
  queue.advanced += Math.max(0, toAdvance);
  return queue;
};

export const closeQueue = (id: string): Queue | undefined => {
  const queue = getQueueById(id);
  if (!queue) return undefined;
  try {
    transitionQueueStatus(queue.status, QueueStatus.Closed);
  } catch (err: any) {
    err.status = 409;
    throw err;
  }
  queue.status = QueueStatus.Closed;
  return queue;
};

export const openEnrollment = (id: string): Queue | undefined => {
  const queue = getQueueById(id);
  if (!queue) return undefined;
  try {
    transitionQueueStatus(queue.status, QueueStatus.EnrollmentOpen);
  } catch (err: any) {
    err.status = 409;
    throw err;
  }
  queue.status = QueueStatus.EnrollmentOpen;
  return queue;
};

export const closeEnrollment = (id: string): Queue | undefined => {
  const queue = getQueueById(id);
  if (!queue) return undefined;
  try {
    transitionQueueStatus(queue.status, QueueStatus.EnrollmentClosed);
  } catch (err: any) {
    err.status = 409;
    throw err;
  }
  queue.status = QueueStatus.EnrollmentClosed;
  return queue;
};
