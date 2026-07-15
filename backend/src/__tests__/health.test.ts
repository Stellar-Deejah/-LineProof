import { describe, it, expect } from 'vitest';
import { healthPayload } from '../health.js';

describe('healthPayload', () => {
  it('returns the canonical health shape', () => {
    const payload = healthPayload();
    expect(payload.status).toBe('ok');
    expect(typeof payload.environment).toBe('string');
    // timestamp is a valid ISO-8601 instant
    expect(Number.isNaN(Date.parse(payload.timestamp))).toBe(false);
    expect(payload.timestamp).toBe(new Date(payload.timestamp).toISOString());
  });
});
