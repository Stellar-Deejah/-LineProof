import { encodeCursor, decodeCursor } from '@lineproof/sdk';
import { ValidationError } from '../errors/index.js';

/**
 * Pagination constants shared by the list endpoints. The SDK's `PageOptions`
 * (issue #182) already specifies a default of 50 and a hard cap of 200 for
 * `limit`; the HTTP routes mirror that contract.
 */
export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 200;

/** Paginated response envelope shared by every list endpoint. */
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
  total: number;
}

/** Options for {@link paginate}. Nullable members allow callers to pass query values directly. */
export interface PaginateOptions {
  limit?: number | undefined;
  resolvedCursor?: string | undefined;
}

/**
 * Slices `items` by `limit` + a cursor offset into a `Page` envelope.
 *
 * `limit` defaults to 50 and is capped at 200 (the SDK's `PageOptions`
 * contract). When a cursor is provided it continues from the item immediately
 * after the previous page's last item.
 *
 * The SDK's `encodeCursor`/`decodeCursor` are the canonical cursor format
 * (issue #182): a cursor encodes as `base64("<ledger>:<index>")`. For in-memory
 * list lookups we keep `ledger` fixed at `0` and use `index` as the array
 * offset, so a cursor simply points at the next unvisited position.
 */
export function paginate<T>(items: T[], opts: PaginateOptions): Page<T> {
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const total = items.length;

  let startIndex = 0;
  if (opts.resolvedCursor !== undefined) {
    try {
      const { index } = decodeCursor(opts.resolvedCursor);
      startIndex = index;
    } catch {
      throw new ValidationError('Invalid cursor');
    }
  }

  const page = items.slice(startIndex, startIndex + limit);
  const nextCursor = startIndex + limit < total ? encodeCursor(0, startIndex + limit) : null;

  return { items: page, nextCursor, total };
}
