import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../app.js';
import * as enrollmentService from '../../services/enrollmentService.js';

vi.mock('../../services/enrollmentService.js');

const VALID_IDENTITY = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

describe('Enrollments Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/enrollments/enroll', () => {
    it('returns 400 on invalid body', async () => {
      const res = await request(app).post('/api/enrollments/enroll').send({ queueId: 'q1' });
      expect(res.status).toBe(400);
      expect(res.body.error.issues).toBeDefined();
    });

    it('returns 409 on conflict', async () => {
      vi.mocked(enrollmentService.enrollIdentity).mockReturnValue({ queueId: 'q1', identity: VALID_IDENTITY, enrolledAt: '', conflict: true, cancelled: false });
      const res = await request(app).post('/api/enrollments/enroll').send({ queueId: 'q1', identity: VALID_IDENTITY });
      expect(res.status).toBe(409);
      expect(res.body.error.message).toBe('Duplicate enrollment blocked');
    });

    it('returns 201 on success', async () => {
      vi.mocked(enrollmentService.enrollIdentity).mockReturnValue({ queueId: 'q1', identity: VALID_IDENTITY, enrolledAt: '', conflict: false, cancelled: false });
      const res = await request(app).post('/api/enrollments/enroll').send({ queueId: 'q1', identity: VALID_IDENTITY });
      expect(res.status).toBe(201);
      expect(res.body.queueId).toBe('q1');
    });
  });

  describe('POST /api/enrollments/cancel', () => {
    it('returns 400 on invalid body', async () => {
      const res = await request(app).post('/api/enrollments/cancel').send({ queueId: 'q1' });
      expect(res.status).toBe(400);
    });

    it('returns 404 if not found', async () => {
      vi.mocked(enrollmentService.cancelEnrollment).mockReturnValue(false);
      const res = await request(app).post('/api/enrollments/cancel').send({ queueId: 'q1', identity: VALID_IDENTITY });
      expect(res.status).toBe(404);
    });

    it('returns 200 on success', async () => {
      vi.mocked(enrollmentService.cancelEnrollment).mockReturnValue(true);
      const res = await request(app).post('/api/enrollments/cancel').send({ queueId: 'q1', identity: VALID_IDENTITY });
      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/enrollments/queue/:queueId', () => {
    it('returns 200 with list', async () => {
      vi.mocked(enrollmentService.getEnrollmentsByQueue).mockReturnValue([{ queueId: 'q1', identity: VALID_IDENTITY } as any]);
      const res = await request(app).get('/api/enrollments/queue/q1');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([{ queueId: 'q1', identity: VALID_IDENTITY }]);
    });
  });

  describe('GET /api/enrollments/:identity', () => {
    it('returns 404 if no records', async () => {
      vi.mocked(enrollmentService.getEnrollmentsByIdentity).mockReturnValue([]);
      const res = await request(app).get(`/api/enrollments/${VALID_IDENTITY}`);
      expect(res.status).toBe(404);
    });

    it('returns 200 with list if found', async () => {
      vi.mocked(enrollmentService.getEnrollmentsByIdentity).mockReturnValue([{ queueId: 'q1', identity: VALID_IDENTITY } as any]);
      const res = await request(app).get(`/api/enrollments/${VALID_IDENTITY}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([{ queueId: 'q1', identity: VALID_IDENTITY }]);
    });
  });
});
