import { describe, it, expect, beforeEach } from 'vitest';
import { createQueueService, type QueueService } from '../services/queueService.js';
import { MemoryAdapter } from '../storage/index.js';
import { QueueStatus } from '../schemas/queueStatus.js';

// Issue #91: replaces the fragile `import('...?t=' + Date.now())` reload hack
// with a fresh service over an injected store per test — real isolation.
let createQueue: QueueService['createQueue'];
let getQueueById: QueueService['getQueueById'];
let advanceQueue: QueueService['advanceQueue'];
let closeQueue: QueueService['closeQueue'];
let getQueueStats: QueueService['getQueueStats'];
let openEnrollment: QueueService['openEnrollment'];
let closeEnrollment: QueueService['closeEnrollment'];

beforeEach(() => {
  ({ createQueue, getQueueById, advanceQueue, closeQueue, getQueueStats, openEnrollment, closeEnrollment } =
    createQueueService(new MemoryAdapter()));
});

describe('createQueue', () => {
  it('creates a queue in Draft status', () => {
    const q = createQueue({ name: 'Test Queue', slug: 'test-q', maxPositions: 50 });
    expect(q.status).toBe(QueueStatus.Draft);
    expect(q.enrolled).toBe(0);
    expect(q.advanced).toBe(0);
  });

  it('throws 409 on duplicate slug', () => {
    createQueue({ name: 'Q1', slug: 'dup-slug', maxPositions: 10 });
    expect(() => createQueue({ name: 'Q2', slug: 'dup-slug', maxPositions: 10 })).toThrow();
  });
});

describe('advanceQueue', () => {
  it('advances enrolled positions and sets AdvancementActive', () => {
    const q = createQueue({ name: 'AQ', slug: 'adv-q', maxPositions: 20 });
    openEnrollment(q.id);
    closeEnrollment(q.id);
    // Manually bump enrolled count since fixture has enrolled=0
    (q as any).enrolled = 10;
    const updated = advanceQueue(q.id, 5);
    expect(updated?.status).toBe(QueueStatus.AdvancementActive);
    expect(updated?.advanced).toBe(5);
  });

  it('returns undefined for missing queue', () => {
    expect(advanceQueue('no-such-queue', 5)).toBeUndefined();
  });

  it('throws on advancing a closed queue', () => {
    const q = createQueue({ name: 'CQ', slug: 'close-q', maxPositions: 5 });
    openEnrollment(q.id);
    closeEnrollment(q.id);
    closeQueue(q.id);
    expect(() => advanceQueue(q.id, 1)).toThrow(/Invalid status transition/);
  });
});

describe('getQueueStats', () => {
  it('returns stats with percentAdvanced', () => {
    const q = createQueue({ name: 'SQ', slug: 'stats-q', maxPositions: 10 });
    (q as any).enrolled = 10;
    (q as any).advanced = 4;
    const stats = getQueueStats(q.id);
    expect(stats?.total).toBe(10);
    expect(stats?.advanced).toBe(4);
    expect(stats?.remaining).toBe(6);
    expect(stats?.percentAdvanced).toBe(40);
  });

  it('returns undefined for unknown queue', () => {
    expect(getQueueStats('ghost')).toBeUndefined();
  });
});
