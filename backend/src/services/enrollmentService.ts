import { defaultMemoryAdapter } from '../storage/index.js';
import { MemoryAdapter } from '../storage/memoryAdapter.js';

export type EnrollmentRecord = {
  queueId: string;
  identity: string;
  enrolledAt: string;
  conflict: boolean;
  cancelled: boolean;
};

// Enrollment state lives in the shared storage adapter (issue #4) instead of
// module-level Maps. Records are keyed by identity; a per-queue index of
// identities supports queue-level lookups. The MemoryAdapter stores references,
// so in-place mutation of a record (e.g. cancellation) persists as before.
// Built by a factory that closes over its store (issue #91) so tests can inject
// a fresh adapter; the singleton below preserves the existing import surface.
const NS_BY_IDENTITY = 'enrollments:byIdentity';
const NS_QUEUE_INDEX = 'enrollments:queueIndex';

export function createEnrollmentService(store: MemoryAdapter = new MemoryAdapter()) {
const enrollIdentity = (queueId: string, identity: string): EnrollmentRecord => {
  const existing = store.get<EnrollmentRecord[]>(NS_BY_IDENTITY, identity) ?? [];
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

  // Maintain queue-level index
  const queueSet = store.get<Set<string>>(NS_QUEUE_INDEX, queueId) ?? new Set<string>();
  queueSet.add(identity);
  store.set<Set<string>>(NS_QUEUE_INDEX, queueId, queueSet);

  return record;
};

const cancelEnrollment = (queueId: string, identity: string): boolean => {
  const existing = store.get<EnrollmentRecord[]>(NS_BY_IDENTITY, identity);
  if (!existing) return false;
  const record = existing.find((r) => r.queueId === queueId && !r.cancelled);
  if (!record) return false;
  record.cancelled = true;
  store.set<EnrollmentRecord[]>(NS_BY_IDENTITY, identity, existing);
  const queueSet = store.get<Set<string>>(NS_QUEUE_INDEX, queueId);
  if (queueSet) {
    queueSet.delete(identity);
    store.set<Set<string>>(NS_QUEUE_INDEX, queueId, queueSet);
  }
  return true;
};

const getEnrollmentsByIdentity = (identity: string): EnrollmentRecord[] => {
  return store.get<EnrollmentRecord[]>(NS_BY_IDENTITY, identity) ?? [];
};

/** @deprecated use getEnrollmentsByIdentity */
const getEnrollment = getEnrollmentsByIdentity;

const getEnrollmentsByQueue = (queueId: string): EnrollmentRecord[] => {
  const identities = store.get<Set<string>>(NS_QUEUE_INDEX, queueId);
  if (!identities) return [];
  const results: EnrollmentRecord[] = [];
  for (const identity of identities) {
    const records = store.get<EnrollmentRecord[]>(NS_BY_IDENTITY, identity) ?? [];
    const active = records.filter((r) => r.queueId === queueId && !r.cancelled);
    results.push(...active);
  }
  return results;
};

  return {
    enrollIdentity,
    cancelEnrollment,
    getEnrollmentsByIdentity,
    getEnrollment,
    getEnrollmentsByQueue,
  };
}

/** Production singleton bound to the shared in-process adapter. */
export const enrollmentService = createEnrollmentService(defaultMemoryAdapter);

export const enrollIdentity = enrollmentService.enrollIdentity;
export const cancelEnrollment = enrollmentService.cancelEnrollment;
export const getEnrollmentsByIdentity = enrollmentService.getEnrollmentsByIdentity;
/** @deprecated use getEnrollmentsByIdentity */
export const getEnrollment = enrollmentService.getEnrollment;
export const getEnrollmentsByQueue = enrollmentService.getEnrollmentsByQueue;
