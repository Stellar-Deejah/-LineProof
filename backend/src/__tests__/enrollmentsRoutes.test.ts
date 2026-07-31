import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import enrollmentsRouter from '../routes/enrollments.js';

// Mock the services
vi.mock('../services/enrollmentService.js', () => ({
  enrollIdentity: vi.fn(),
  cancelEnrollment: vi.fn(),
  getEnrollmentsByIdentity: vi.fn(),
  getEnrollmentsByQueue: vi.fn(),
}));

// Mock the metrics
vi.mock('../metrics/registry.js', () => ({
  recordEnrollment: vi.fn(),
}));

const VALID_KEY = 'G' + 'A'.repeat(55);
const INVALID_S_KEY = 'S' + 'A'.repeat(55);

describe('Enrollments Routes - Stellar Address Validation', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/enrollments', enrollmentsRouter);
    vi.clearAllMocks();
  });

  describe('POST /api/enrollments/enroll', () => {
    it('should reject S-prefixed secret key as identity', async () => {
      const response = await request(app)
        .post('/api/enrollments/enroll')
        .send({
          queueId: 'test-queue',
          identity: INVALID_S_KEY,
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error.message).toContain('Invalid Stellar address');
      expect(response.body.error.field).toBe('identity');
    });

    it('should reject garbage string as identity', async () => {
      const response = await request(app)
        .post('/api/enrollments/enroll')
        .send({
          queueId: 'test-queue',
          identity: 'not-a-stellar-address',
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error.message).toContain('Invalid Stellar address');
      expect(response.body.error.field).toBe('identity');
    });

    it('should reject empty string as identity', async () => {
      const response = await request(app)
        .post('/api/enrollments/enroll')
        .send({
          queueId: 'test-queue',
          identity: '',
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error.message).toContain('Invalid Stellar address');
      expect(response.body.error.field).toBe('identity');
    });

    it('should accept valid G-prefixed Stellar address', async () => {
      const { enrollIdentity } = await import('../services/enrollmentService.js');
      vi.mocked(enrollIdentity).mockReturnValue({
        queueId: 'test-queue',
        identity: VALID_KEY,
        enrolledAt: new Date().toISOString(),
        conflict: false,
        cancelled: false,
      });

      const response = await request(app)
        .post('/api/enrollments/enroll')
        .send({
          queueId: 'test-queue',
          identity: VALID_KEY,
        });

      expect(response.status).toBe(201);
    });
  });

  describe('POST /api/enrollments/cancel', () => {
    it('should reject S-prefixed secret key as identity', async () => {
      const response = await request(app)
        .post('/api/enrollments/cancel')
        .send({
          queueId: 'test-queue',
          identity: INVALID_S_KEY,
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error.message).toContain('Invalid Stellar address');
      expect(response.body.error.field).toBe('identity');
    });

    it('should reject garbage string as identity', async () => {
      const response = await request(app)
        .post('/api/enrollments/cancel')
        .send({
          queueId: 'test-queue',
          identity: 'invalid-identity',
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error.message).toContain('Invalid Stellar address');
      expect(response.body.error.field).toBe('identity');
    });

    it('should accept valid G-prefixed Stellar address', async () => {
      const { cancelEnrollment } = await import('../services/enrollmentService.js');
      vi.mocked(cancelEnrollment).mockReturnValue(true);

      const response = await request(app)
        .post('/api/enrollments/cancel')
        .send({
          queueId: 'test-queue',
          identity: VALID_KEY,
        });

      expect(response.status).toBe(200);
    });
  });
});
