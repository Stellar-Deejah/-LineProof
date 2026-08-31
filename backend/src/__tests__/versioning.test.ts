import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';

describe('API Route Versioning & Deprecation', () => {
  const app = createApp();

  describe('Canonical /api/v1/ routes', () => {
    it('GET /api/v1/queues should return 200 without Deprecation header', async () => {
      const response = await request(app).get('/api/v1/queues');
      expect(response.status).toBe(200);
      expect(response.headers['deprecation']).toBeUndefined();
    });

    it('GET /api/v1/escrow/records/test should return 404 without Deprecation header', async () => {
      const response = await request(app).get('/api/v1/escrow/records/non-existent');
      expect(response.headers['deprecation']).toBeUndefined();
    });
  });

  describe('Legacy /api/ routes deprecation', () => {
    it('GET /api/queues should return 200 WITH Deprecation: true and Link headers', async () => {
      const response = await request(app).get('/api/queues');
      expect(response.status).toBe(200);
      expect(response.headers['deprecation']).toBe('true');
      expect(response.headers['link']).toContain('/api/v1/queues');
      expect(response.headers['link']).toContain('rel="successor-version"');
    });

    it('GET /api/enrollments should return 400 WITH Deprecation header', async () => {
      const response = await request(app).get('/api/enrollments');
      expect(response.headers['deprecation']).toBe('true');
    });
  });
});
