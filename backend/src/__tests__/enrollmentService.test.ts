import { describe, it, expect, beforeEach } from 'vitest';

let enrollIdentity: typeof import('../services/enrollmentService.js').enrollIdentity;
let cancelEnrollment: typeof import('../services/enrollmentService.js').cancelEnrollment;
let getEnrollmentsByIdentity: typeof import('../services/enrollmentService.js').getEnrollmentsByIdentity;
let getEnrollmentsByQueue: typeof import('../services/enrollmentService.js').getEnrollmentsByQueue;

beforeEach(async () => {
  const mod = await import('../services/enrollmentService.js?t=' + Date.now());
  enrollIdentity = mod.enrollIdentity;
  cancelEnrollment = mod.cancelEnrollment;
  getEnrollmentsByIdentity = mod.getEnrollmentsByIdentity;
  getEnrollmentsByQueue = mod.getEnrollmentsByQueue;
});

describe('enrollIdentity', () => {
  it('creates an enrollment record', () => {
    const record = enrollIdentity('queue-1', 'addr-alice');
    expect(record.conflict).toBe(false);
    expect(record.cancelled).toBe(false);
    expect(record.queueId).toBe('queue-1');
  });

  it('returns conflict flag on duplicate enrollment', () => {
    enrollIdentity('queue-1', 'addr-bob');
    const dup = enrollIdentity('queue-1', 'addr-bob');
    expect(dup.conflict).toBe(true);
  });

  it('allows same identity in different queues', () => {
    enrollIdentity('queue-a', 'addr-carol');
    const r2 = enrollIdentity('queue-b', 'addr-carol');
    expect(r2.conflict).toBe(false);
  });
});

describe('cancelEnrollment', () => {
  it('cancels an active enrollment', () => {
    enrollIdentity('queue-2', 'addr-dave');
    const ok = cancelEnrollment('queue-2', 'addr-dave');
    expect(ok).toBe(true);

    const records = getEnrollmentsByIdentity('addr-dave');
    expect(records.every((r) => r.cancelled)).toBe(true);
  });

  it('returns false when identity is not enrolled', () => {
    expect(cancelEnrollment('queue-x', 'addr-nobody')).toBe(false);
  });
});

describe('getEnrollmentsByQueue', () => {
  it('returns all active enrollments for a queue', () => {
    enrollIdentity('queue-3', 'addr-eve');
    enrollIdentity('queue-3', 'addr-frank');
    const records = getEnrollmentsByQueue('queue-3');
    expect(records.length).toBe(2);
  });

  it('excludes cancelled enrollments', () => {
    enrollIdentity('queue-4', 'addr-grace');
    cancelEnrollment('queue-4', 'addr-grace');
    const records = getEnrollmentsByQueue('queue-4');
    expect(records.length).toBe(0);
  });
});
