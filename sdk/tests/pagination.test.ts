import { describe, it, expect } from 'vitest';
import { encodeCursor, decodeCursor, paginate } from '../src/pagination';

describe('encodeCursor / decodeCursor', () => {
  it('round-trips ledger and index', () => {
    const encoded = encodeCursor(12345, 7);
    const decoded = decodeCursor(encoded);
    expect(decoded.ledger).toBe(12345);
    expect(decoded.index).toBe(7);
  });

  it('throws on clearly invalid cursor', () => {
    expect(() => decodeCursor('!!not-valid!!')).toThrow('Invalid cursor');
  });

  it('throws on cursor with non-numeric parts', () => {
    // btoa is available in Node 18+ and browsers
    const bad = btoa('abc:xyz');
    expect(() => decodeCursor(bad)).toThrow('Invalid cursor');
  });
});

describe('paginate', () => {
  const items = Array.from({ length: 10 }, (_, i) => ({ id: i, ledger: 1000 + i, idx: i }));
  const getCursor = (item: (typeof items)[0]) => ({ ledger: item.ledger, index: item.idx });

  it('returns up to limit items', () => {
    const page = paginate(items, { limit: 5 }, getCursor);
    expect(page.items).toHaveLength(5);
    expect(page.count).toBe(5);
  });

  it('sets nextCursor when more items exist', () => {
    const page = paginate(items, { limit: 5 }, getCursor);
    expect(page.nextCursor).toBeDefined();
  });

  it('does not set nextCursor when all items fit', () => {
    const page = paginate(items, { limit: 20 }, getCursor);
    expect(page.nextCursor).toBeUndefined();
  });

  it('clamps limit to 200', () => {
    const big = Array.from({ length: 250 }, (_, i) => ({ id: i, ledger: i, idx: i }));
    const page = paginate(big, { limit: 999 }, getCursor);
    expect(page.items).toHaveLength(200);
  });

  it('defaults limit to 50', () => {
    const big = Array.from({ length: 100 }, (_, i) => ({ id: i, ledger: i, idx: i }));
    const page = paginate(big, {}, getCursor);
    expect(page.items).toHaveLength(50);
  });
});
