import { describe, it, expect, beforeEach } from 'vitest';
import { CreateQueueSchema } from '../routes/queues.js';

let createQueue: typeof import('../services/queueService.js').createQueue;

beforeEach(async () => {
  const mod = await import('../services/queueService.js?t=' + Date.now());
  createQueue = mod.createQueue;
});

describe('Queue Creation - Input Sanitization & Validation (Issue #183)', () => {
  it('should accept valid queue creation payloads with slug <= 9 chars', () => {
    const parsed = CreateQueueSchema.safeParse({
      name: 'Clean Queue',
      slug: 'clean-q',
      maxPositions: 50,
      description: 'Sanitized queue description',
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      const q = createQueue(parsed.data);
      expect(q.slug).toBe('clean-q');
      expect(q.name).toBe('Clean Queue');
    }
  });

  it('should reject slug exceeding 9 characters', () => {
    const parsed = CreateQueueSchema.safeParse({
      name: 'Long Slug Queue',
      slug: 'too-long-slug',
      maxPositions: 10,
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0].message).toContain('9');
    }
  });

  it('should reject slug containing invalid characters (spaces, symbols)', () => {
    const parsed = CreateQueueSchema.safeParse({
      name: 'Invalid Slug Queue',
      slug: 'bad slug!',
      maxPositions: 10,
    });

    expect(parsed.success).toBe(false);
  });

  it('should reject HTML script injection in name field', () => {
    const parsed = CreateQueueSchema.safeParse({
      name: '<script>alert("xss")</script>',
      slug: 'xss-q1',
      maxPositions: 10,
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0].message).toContain('HTML tags not allowed in name');
    }
  });

  it('should reject HTML element injection in description field', () => {
    const parsed = CreateQueueSchema.safeParse({
      name: 'Valid Name',
      slug: 'xss-q2',
      maxPositions: 10,
      description: '<img src=x onerror=alert(1)>',
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0].message).toContain('HTML tags not allowed in description');
    }
  });

  it('should throw 409 Conflict when attempting to create queue with duplicate slug', () => {
    createQueue({
      name: 'First Queue',
      slug: 'dup-q',
      maxPositions: 20,
    });

    expect(() => {
      createQueue({
        name: 'Second Queue',
        slug: 'dup-q',
        maxPositions: 20,
      });
    }).toThrowError(/already exists/);
  });
});
