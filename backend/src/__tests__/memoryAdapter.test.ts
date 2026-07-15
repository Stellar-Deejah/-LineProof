import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { MemoryAdapter } from '../storage/memoryAdapter.js';

describe('MemoryAdapter', () => {
  let store: MemoryAdapter;

  beforeEach(() => {
    store = new MemoryAdapter();
  });

  it('get returns undefined for a missing key', () => {
    expect(store.get('ns', 'missing')).toBeUndefined();
  });

  it('set then get round-trips a value', () => {
    store.set('ns', 'k', { a: 1 });
    expect(store.get('ns', 'k')).toEqual({ a: 1 });
  });

  it('preserves object identity (returns the same reference)', () => {
    const value = { count: 0 };
    store.set('ns', 'k', value);
    const read = store.get<typeof value>('ns', 'k');
    expect(read).toBe(value);
    // mutating the returned reference is visible on subsequent reads
    read!.count = 5;
    expect(store.get<typeof value>('ns', 'k')!.count).toBe(5);
  });

  it('delete removes a value and reports whether one existed', () => {
    store.set('ns', 'k', 1);
    expect(store.delete('ns', 'k')).toBe(true);
    expect(store.delete('ns', 'k')).toBe(false);
    expect(store.get('ns', 'k')).toBeUndefined();
  });

  it('list returns all values in a namespace only', () => {
    store.set('a', '1', 'x');
    store.set('a', '2', 'y');
    store.set('b', '1', 'z');
    expect(store.list('a').sort()).toEqual(['x', 'y']);
    expect(store.list('b')).toEqual(['z']);
    expect(store.list('empty')).toEqual([]);
  });

  it('increment accumulates and defaults to +1', () => {
    expect(store.increment('c', 'k')).toBe(1);
    expect(store.increment('c', 'k')).toBe(2);
    expect(store.increment('c', 'k', 5)).toBe(7);
  });

  it('increment resets after the ttl elapses', () => {
    vi.useFakeTimers();
    try {
      store.increment('c', 'k', 1, 1000);
      store.increment('c', 'k', 1, 1000);
      expect(store.get('c', 'k')).toBeUndefined(); // counters are separate from kv
      vi.advanceTimersByTime(1001);
      expect(store.increment('c', 'k', 1, 1000)).toBe(1); // window reset
    } finally {
      vi.useRealTimers();
    }
  });

  it('counters and kv values do not collide across the same key', () => {
    store.set('shared', 'k', 'value');
    store.increment('shared', 'k', 3);
    expect(store.get('shared', 'k')).toBe('value');
    expect(store.increment('shared', 'k', 0)).toBe(3);
  });
});
