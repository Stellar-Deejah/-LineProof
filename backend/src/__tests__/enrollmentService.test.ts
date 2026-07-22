import { describe, it, expect, beforeEach } from 'vitest';
import { createEnrollmentService } from '../services/enrollmentService.js';
import { MemoryAdapter } from '../storage/memoryAdapter.js';

let svc: ReturnType<typeof createEnrollmentService>;

beforeEach(() => {
  // Fresh store per test: no shared module state, no ordering effects.
  svc = createEnrollmentService(new MemoryAdapter());
});


describe('enrollIdentity', () => {
  it('creates an enrollment record without conflict', () => {
    const record = svc.enrollIdentity('queue-x1', 'addr-alice1');
    expect(record.conflict).toBe(false);
    expect(record.cancelled).toBe(false);
    expect(record.queueId).toBe('queue-x1');
  });

  it('returns conflict flag on duplicate enrollment', () => {
    svc.enrollIdentity('queue-x2', 'addr-bob1');
    const dup = svc.enrollIdentity('queue-x2', 'addr-bob1');
    expect(dup.conflict).toBe(true);
  });

  it('allows same identity to enroll in different queues', () => {
    svc.enrollIdentity('queue-xa', 'addr-carol1');
    const r2 = svc.enrollIdentity('queue-xb', 'addr-carol1');
    expect(r2.conflict).toBe(false);
  });
});

describe('cancelEnrollment', () => {
  it('cancels an active enrollment and returns true', () => {
    svc.enrollIdentity('queue-x3', 'addr-dave1');
    const ok = svc.cancelEnrollment('queue-x3', 'addr-dave1');
    expect(ok).toBe(true);
    const records = svc.getEnrollmentsByIdentity('addr-dave1');
    expect(records.every((r) => r.cancelled)).toBe(true);
  });

  it('returns false when identity is not enrolled', () => {
    expect(svc.cancelEnrollment('queue-xz', 'addr-nobody1')).toBe(false);
  });
});

describe('getEnrollmentsByQueue', () => {
  it('returns all active enrollments for a queue', () => {
    svc.enrollIdentity('queue-x4', 'addr-eve1');
    svc.enrollIdentity('queue-x4', 'addr-frank1');
    const records = svc.getEnrollmentsByQueue('queue-x4');
    expect(records.length).toBe(2);
  });

  it('excludes cancelled enrollments', () => {
    svc.enrollIdentity('queue-x5', 'addr-grace1');
    svc.cancelEnrollment('queue-x5', 'addr-grace1');
    const records = svc.getEnrollmentsByQueue('queue-x5');
    expect(records.length).toBe(0);
  });

  it('returns empty array for unknown queue', () => {
    expect(svc.getEnrollmentsByQueue('queue-ghost')).toHaveLength(0);
  });
});
