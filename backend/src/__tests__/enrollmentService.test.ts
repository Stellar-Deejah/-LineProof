import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  enrollIdentity,
  cancelEnrollment,
  getEnrollmentsByIdentity,
  getEnrollmentsByQueue,
} from '../services/enrollmentService.js';

beforeEach(() => {
  vi.resetModules();
});

describe('enrollIdentity', () => {
  it('creates an enrollment record without conflict', () => {
    const record = enrollIdentity('queue-x1', 'addr-alice1');
    expect(record.conflict).toBe(false);
    expect(record.cancelled).toBe(false);
    expect(record.queueId).toBe('queue-x1');
  });

  it('returns conflict flag on duplicate enrollment', () => {
    enrollIdentity('queue-x2', 'addr-bob1');
    const dup = enrollIdentity('queue-x2', 'addr-bob1');
    expect(dup.conflict).toBe(true);
  });

  it('allows same identity to enroll in different queues', () => {
    enrollIdentity('queue-xa', 'addr-carol1');
    const r2 = enrollIdentity('queue-xb', 'addr-carol1');
    expect(r2.conflict).toBe(false);
  });
});

describe('cancelEnrollment', () => {
  it('cancels an active enrollment and returns true', () => {
    enrollIdentity('queue-x3', 'addr-dave1');
    const ok = cancelEnrollment('queue-x3', 'addr-dave1');
    expect(ok).toBe(true);
    const records = getEnrollmentsByIdentity('addr-dave1');
    expect(records.every((r) => r.cancelled)).toBe(true);
  });

  it('returns false when identity is not enrolled', () => {
    expect(cancelEnrollment('queue-xz', 'addr-nobody1')).toBe(false);
  });
});

describe('getEnrollmentsByQueue', () => {
  it('returns all active enrollments for a queue', () => {
    enrollIdentity('queue-x4', 'addr-eve1');
    enrollIdentity('queue-x4', 'addr-frank1');
    const records = getEnrollmentsByQueue('queue-x4');
    expect(records.length).toBe(2);
  });

  it('excludes cancelled enrollments', () => {
    enrollIdentity('queue-x5', 'addr-grace1');
    cancelEnrollment('queue-x5', 'addr-grace1');
    const records = getEnrollmentsByQueue('queue-x5');
    expect(records.length).toBe(0);
  });

  it('returns empty array for unknown queue', () => {
    expect(getEnrollmentsByQueue('queue-ghost')).toHaveLength(0);
  });
});
