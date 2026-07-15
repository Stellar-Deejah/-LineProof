import { defaultMemoryAdapter } from '../storage/index.js';

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
const store = defaultMemoryAdapter;
const NS_BY_IDENTITY = 'enrollments:byIdentity';
const NS_QUEUE_INDEX = 'enrollments:queueIndex';

export const enrollIdentity = (queueId: string, identity: string): EnrollmentRecord => {
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

export const cancelEnrollment = (queueId: string, identity: string): boolean => {
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

export const getEnrollmentsByIdentity = (identity: string): EnrollmentRecord[] => {
  return store.get<EnrollmentRecord[]>(NS_BY_IDENTITY, identity) ?? [];
};

/** @deprecated use getEnrollmentsByIdentity */
export const getEnrollment = getEnrollmentsByIdentity;

export const getEnrollmentsByQueue = (queueId: string): EnrollmentRecord[] => {
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
