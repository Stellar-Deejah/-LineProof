import { describe, it, expect, beforeEach } from 'vitest';

let createQueue: typeof import('../services/queueService.js').createQueue;
let getQueueById: typeof import('../services/queueService.js').getQueueById;
let advanceQueue: typeof import('../services/queueService.js').advanceQueue;
let closeQueue: typeof import('../services/queueService.js').closeQueue;
let getQueueStats: typeof import('../services/queueService.js').getQueueStats;
let openEnrollment: typeof import('../services/queueService.js').openEnrollment;
let closeEnrollment: typeof import('../services/queueService.js').closeEnrollment;
let QueueStatus: typeof import('../schemas/queueStatus.js').QueueStatus;

beforeEach(async () => {
  const mod = await import('../services/queueService.js?t=' + Date.now());
  createQueue = mod.createQueue;
  getQueueById = mod.getQueueById;
  advanceQueue = mod.advanceQueue;
  closeQueue = mod.closeQueue;
  getQueueStats = mod.getQueueStats;
  openEnrollment = mod.openEnrollment;
  closeEnrollment = mod.closeEnrollment;
  const modEnum = await import('../schemas/queueStatus.js?t=' + Date.now());
  QueueStatus = modEnum.QueueStatus;
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
