import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../app.js';
import * as queueService from '../../services/queueService.js';
import { readQueueOnChain } from '../../contracts/index.js';

vi.mock('../../services/queueService.js');
vi.mock('../../contracts/index.js');

describe('Queues Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readQueueOnChain).mockResolvedValue(undefined);
  });

  describe('GET /api/queues', () => {
    it('returns 200 with paginated envelope list of queues', async () => {
      const mockList = [
        { id: 'q1', slug: 'q1', status: 'Draft' },
        { id: 'q2', slug: 'q2', status: 'Draft' },
      ];
      vi.mocked(queueService.listQueues).mockReturnValue(mockList as any);
      
      const res = await request(app).get('/api/queues?limit=1');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        items: [{ id: 'q1', slug: 'q1', status: 'Draft' }],
        nextCursor: Buffer.from('q1').toString('base64'),
        total: 2,
      });
      expect(queueService.listQueues).toHaveBeenCalled();
    });

    it('handles cursor based pagination correctly', async () => {
      const mockList = [
        { id: 'q1', slug: 'q1', status: 'Draft' },
        { id: 'q2', slug: 'q2', status: 'Draft' },
      ];
      vi.mocked(queueService.listQueues).mockReturnValue(mockList as any);

      const cursor = Buffer.from('q1').toString('base64');
      const res = await request(app).get(`/api/queues?limit=1&cursor=${cursor}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        items: [{ id: 'q2', slug: 'q2', status: 'Draft' }],
        nextCursor: null,
        total: 2,
      });
    });

    it('returns 400 for invalid cursor', async () => {
      const mockList = [{ id: 'q1', slug: 'q1', status: 'Draft' }];
      vi.mocked(queueService.listQueues).mockReturnValue(mockList as any);

      const invalidCursor = Buffer.from('non-existent').toString('base64');
      const res = await request(app).get(`/api/queues?cursor=${invalidCursor}`);
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Invalid cursor');
    });

    it('returns 400 for invalid limit', async () => {
      const res = await request(app).get('/api/queues?limit=invalid');
      expect(res.status).toBe(400);
    });

    it('passes status filter to service', async () => {
      const mockList = [
        { id: 'q1', slug: 'q1', status: 'Open' },
        { id: 'q2', slug: 'q2', status: 'Closed' },
      ];
      vi.mocked(queueService.listQueues).mockReturnValue(mockList as any);
      
      const res = await request(app).get('/api/queues?status=Open');
      expect(res.status).toBe(200);
      expect(res.body.items).toEqual([{ id: 'q1', slug: 'q1', status: 'Open' }]);
      expect(res.body.total).toBe(1);
    });
  });

  describe('GET /api/queues/:id', () => {
    it('returns 404 if not found', async () => {
      vi.mocked(queueService.getQueueById).mockReturnValue(undefined);
      const res = await request(app).get('/api/queues/q1');
      expect(res.status).toBe(404);
    });

    it('returns 200 with queue if found', async () => {
      vi.mocked(queueService.getQueueById).mockReturnValue({ id: 'q1', slug: 'q1' } as any);
      const res = await request(app).get('/api/queues/q1');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ id: 'q1', slug: 'q1', source: 'in-memory' });
    });
  });

  describe('POST /api/queues', () => {
    it('returns 400 on invalid body', async () => {
      const res = await request(app).post('/api/queues').send({ name: 'q1' });
      expect(res.status).toBe(400);
      expect(res.body.issues).toBeDefined();
    });

    it('returns 201 on success', async () => {
      vi.mocked(queueService.createQueue).mockReturnValue({ id: 'q1', slug: 'q1' } as any);
      const res = await request(app).post('/api/queues').send({
        name: 'q1',
        slug: 'q1',
        description: 'desc',
        maxPositions: 10,
        advancementRule: 'FIFO'
      });
      expect(res.status).toBe(201);
      expect(res.body).toEqual({ id: 'q1', slug: 'q1' });
    });
  });

  describe('POST /api/queues/:id/advance', () => {
    it('returns 404 if advance fails', async () => {
      vi.mocked(queueService.advanceQueue).mockReturnValue(undefined);
      const res = await request(app).post('/api/queues/q1/advance').send({ batchSize: 1 });
      expect(res.status).toBe(404);
    });

    it('returns 200 on success', async () => {
      vi.mocked(queueService.advanceQueue).mockReturnValue({ id: 'q1' } as any);
      const res = await request(app).post('/api/queues/q1/advance').send({ batchSize: 1 });
      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/queues/:id/close', () => {
    it('returns 404 if close fails', async () => {
      vi.mocked(queueService.closeQueue).mockReturnValue(undefined);
      const res = await request(app).post('/api/queues/q1/close').send();
      expect(res.status).toBe(404);
    });

    it('returns 200 on success', async () => {
      vi.mocked(queueService.closeQueue).mockReturnValue({ id: 'q1' } as any);
      const res = await request(app).post('/api/queues/q1/close').send();
      expect(res.status).toBe(200);
    });
  });
});
