/**
 * Pagination helpers for LineProof event and position queries.
 *
 * Soroban RPC returns events in ledger order. These helpers provide
 * a typed cursor-based pagination layer over raw RPC responses.
 */

export interface PageOptions {
  /** Maximum number of items to return. Default: 50, max: 200 */
  limit?: number;
  /** Opaque cursor from a previous page's `nextCursor`. Start from beginning if omitted. */
  cursor?: string;
}

export interface Page<T> {
  items: T[];
  /** Present when more items are available. Pass to next call as `cursor`. */
  nextCursor?: string;
  /** Total items seen so far (not the total available — use for progress display). */
  count: number;
}

/**
 * Encodes a ledger sequence number + event index into an opaque cursor string.
 * Format: base64url(ledger:index)
 */
export function encodeCursor(ledger: number, index: number): string {
  const raw = `${ledger}:${index}`;
  // Use btoa for browser + Node 16+ compatibility; avoid Buffer dependency
  return typeof btoa !== 'undefined'
    ? btoa(raw)
    : Buffer.from(raw).toString('base64');
}

/**
 * Decodes a cursor string back into ledger and index.
 * Throws if the cursor is malformed.
 */
export function decodeCursor(cursor: string): { ledger: number; index: number } {
  try {
    const raw = typeof atob !== 'undefined'
      ? atob(cursor)
      : Buffer.from(cursor, 'base64').toString('utf8');
    const [ledgerStr, indexStr] = raw.split(':');
    const ledger = parseInt(ledgerStr, 10);
    const index = parseInt(indexStr, 10);
    if (isNaN(ledger) || isNaN(index)) throw new Error('NaN');
    return { ledger, index };
  } catch {
    throw new Error(`Invalid cursor: "${cursor}"`);
  }
}

/**
 * Wraps an array of items into a Page with an optional next cursor.
 */
export function paginate<T>(
  items: T[],
  options: PageOptions,
  getCursor: (item: T) => { ledger: number; index: number },
): Page<T> {
  const limit = Math.min(options.limit ?? 50, 200);
  const sliced = items.slice(0, limit);
  const hasMore = items.length > limit;
  const lastItem = sliced[sliced.length - 1];
  const page: Page<T> = { items: sliced, count: sliced.length };
  if (hasMore && lastItem) {
    page.nextCursor = encodeCursor(getCursor(lastItem).ledger, getCursor(lastItem).index + 1);
  }
  return page;
}
