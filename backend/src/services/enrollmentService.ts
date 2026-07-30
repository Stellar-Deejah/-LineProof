import { defaultMemoryAdapter, type StorageAdapter } from '../storage/index.js';
import { serviceEmitter } from './eventEmitter.js';

export type EnrollmentRecord = {
  queueId: string;
  identity: string;
  enrolledAt: string;
  conflict: boolean;
  cancelled: boolean;
};

const NS_BY_IDENTITY = 'enrollments:byIdentity';
const NS_QUEUE_INDEX = 'enrollments:queueIndex';

export interface EnrollmentService {
  enrollIdentity(queueId: string, identity: string): EnrollmentRecord;
  cancelEnrollment(queueId: string, identity: string): boolean;
  getEnrollmentsByIdentity(identity: string): EnrollmentRecord[];
  getEnrollment(identity: string): EnrollmentRecord[];
  getEnrollmentsByQueue(queueId: string): EnrollmentRecord[];
}

/**
 * Build an enrollment service over an injected storage adapter (issue #91).
 * Records are keyed by identity, with a per-queue index of identities for
 * queue-level lookups. Pass a fresh adapter in tests for full isolation.
 */
export function createEnrollmentService(store: StorageAdapter = defaultMemoryAdapter): EnrollmentService {
  const byIdentity = (identity: string) =>
    (store.get<EnrollmentRecord[]>(NS_BY_IDENTITY, identity) as EnrollmentRecord[] | undefined) ?? [];
  const queueSet = (queueId: string) =>
    store.get<Set<string>>(NS_QUEUE_INDEX, queueId) as Set<string> | undefined;

  const enrollIdentity: EnrollmentService['enrollIdentity'] = (queueId, identity) => {
    const existing = byIdentity(identity);
    const conflict = existing.some((item) => item.queueId === queueId && !item.cancelled);
    if (conflict) {
      return { queueId, identity, enrolledAt: new Date().toISOString(), conflict: true, cancelled: false };
    }
    const record: EnrollmentRecord = {
      queueId,
      identity,
      enrolledAt: new Date().toISOString(),
      conflict: false,
      cancelled: false,
    };
    existing.push(record);
    store.set<EnrollmentRecord[]>(NS_BY_IDENTITY, identity, existing);

    const set = queueSet(queueId) ?? new Set<string>();
    set.add(identity);
    store.set<Set<string>>(NS_QUEUE_INDEX, queueId, set);

    serviceEmitter.emit('enrollment.created', record);
    return record;
  };

  const cancelEnrollment: EnrollmentService['cancelEnrollment'] = (queueId, identity) => {
    const existing = store.get<EnrollmentRecord[]>(NS_BY_IDENTITY, identity) as EnrollmentRecord[] | undefined;
    if (!existing) return false;
    const record = existing.find((r) => r.queueId === queueId && !r.cancelled);
    if (!record) return false;
    record.cancelled = true;
    store.set<EnrollmentRecord[]>(NS_BY_IDENTITY, identity, existing);
    const set = queueSet(queueId);
    if (set) {
      set.delete(identity);
      store.set<Set<string>>(NS_QUEUE_INDEX, queueId, set);
    }
    serviceEmitter.emit('enrollment.cancelled', { queueId, identity });
    return true;
  };

  const getEnrollmentsByIdentity: EnrollmentService['getEnrollmentsByIdentity'] = (identity) =>
    byIdentity(identity);

  const getEnrollmentsByQueue: EnrollmentService['getEnrollmentsByQueue'] = (queueId) => {
    const identities = queueSet(queueId);
    if (!identities) return [];
    const results: EnrollmentRecord[] = [];
    for (const identity of identities) {
      const records = byIdentity(identity);
      results.push(...records.filter((r) => r.queueId === queueId && !r.cancelled));
    }
    return results;
  };

  return {
    enrollIdentity,
    cancelEnrollment,
    getEnrollmentsByIdentity,
    getEnrollment: getEnrollmentsByIdentity,
    getEnrollmentsByQueue,
  };
}

/** Default singleton over the shared adapter — used by production route handlers. */
export const enrollmentService = createEnrollmentService();

export const enrollIdentity = enrollmentService.enrollIdentity;
export const cancelEnrollment = enrollmentService.cancelEnrollment;
export const getEnrollmentsByIdentity = enrollmentService.getEnrollmentsByIdentity;
/** @deprecated use getEnrollmentsByIdentity */
export const getEnrollment = enrollmentService.getEnrollmentsByIdentity;
export const getEnrollmentsByQueue = enrollmentService.getEnrollmentsByQueue;
