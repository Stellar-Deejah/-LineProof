import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import * as enrollmentService from '../../services/enrollmentService.js';

const app = createApp();

vi.mock('../../services/enrollmentService.js');

describe('Enrollments Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/enrollments', () => {
    it('returns 400 on invalid body', async () => {
      const res = await request(app).post('/api/enrollments').send({ queueId: 'q1' });
      expect(res.status).toBe(400);
      expect(res.body.error.issues).toBeDefined();
    });

    it('returns 409 on conflict', async () => {
      vi.mocked(enrollmentService.enroll).mockReturnValue({
        success: false,
        conflict: true,
      } as any);
      const res = await request(app).post('/api/enrollments').send({ queueId: 'q1', identity: 'GB123' });
      expect(res.status).toBe(409);
      expect(res.body.conflict).toBe(true);
    });

    it('returns 201 on success', async () => {
      vi.mocked(enrollmentService.enroll).mockReturnValue({
        success: true,
        record: { id: 'r1' },
      } as any);
      const res = await request(app).post('/api/enrollments').send({ queueId: 'q1', identity: 'GB123' });
      expect(res.status).toBe(201);
      expect(res.body.record.id).toBe('r1');
    });
  });

  describe('DELETE /api/enrollments', () => {
    it('returns 400 on invalid body', async () => {
      const res = await request(app).delete('/api/enrollments').send({ queueId: 'q1' });
      expect(res.status).toBe(400);
    });

    it('returns 404 if not found', async () => {
      vi.mocked(enrollmentService.cancel).mockReturnValue(false);
      const res = await request(app).delete('/api/enrollments').send({ queueId: 'q1', identity: 'GB123' });
      expect(res.status).toBe(404);
    });

    it('returns 200 on success', async () => {
      vi.mocked(enrollmentService.cancel).mockReturnValue(true);
      const res = await request(app).delete('/api/enrollments').send({ queueId: 'q1', identity: 'GB123' });
      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/enrollments/queue/:queueId', () => {
    it('returns 200 with list', async () => {
      vi.mocked(enrollmentService.getQueueEnrollments).mockReturnValue([{ id: 'r1' }] as any);
      const res = await request(app).get('/api/enrollments/queue/q1');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([{ id: 'r1' }]);
    });
  });

  describe('GET /api/enrollments/:identity', () => {
    it('returns 404 if no records', async () => {
      vi.mocked(enrollmentService.getIdentityEnrollments).mockReturnValue([]);
      const res = await request(app).get('/api/enrollments/GB123');
      expect(res.status).toBe(404);
    });

    it('returns 200 with list if found', async () => {
      vi.mocked(enrollmentService.getIdentityEnrollments).mockReturnValue([{ id: 'r1' }] as any);
      const res = await request(app).get('/api/enrollments/GB123');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([{ id: 'r1' }]);
    });
  });
});
