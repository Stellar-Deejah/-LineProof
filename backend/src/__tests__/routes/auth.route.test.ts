import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../app.js';
import * as queueService from '../../services/queueService.js';
import * as escrowService from '../../services/escrowService.js';

vi.mock('../../services/queueService.js');
vi.mock('../../services/escrowService.js');

const TEST_API_KEY = 'test-api-key-12345678';

describe('Auth Middleware', () => {
  describe('POST /api/queues — missing API key', () => {
    beforeAll(() => {
      process.env.OPERATOR_API_KEY = TEST_API_KEY;
    });

    afterAll(() => {
      delete process.env.OPERATOR_API_KEY;
    });

    it('returns 401 when X-API-Key header is missing', async () => {
      const res = await request(app).post('/api/queues').send({ name: 'q1', slug: 'q1', maxPositions: 10 });
      expect(res.status).toBe(401);
      expect(res.body.error.message).toBe('Unauthorized');
      expect(res.body.error.status).toBe(401);
    });

    it('returns 401 when X-API-Key header is wrong', async () => {
      const res = await request(app)
        .post('/api/queues')
        .set('X-API-Key', 'wrong-key')
        .send({ name: 'q1', slug: 'q1', maxPositions: 10 });
      expect(res.status).toBe(401);
      expect(res.body.error.message).toBe('Unauthorized');
      expect(res.body.error.status).toBe(401);
    });

    it('returns 201 when X-API-Key header is valid', async () => {
      vi.mocked(queueService.createQueue).mockReturnValue({ id: 'q1', slug: 'q1' } as any);
      const res = await request(app)
        .post('/api/queues')
        .set('X-API-Key', TEST_API_KEY)
        .send({ name: 'q1', slug: 'q1', maxPositions: 10 });
      expect(res.status).toBe(201);
    });
  });

  describe('POST /api/queues — no OPERATOR_API_KEY configured', () => {
    beforeAll(() => {
      delete process.env.OPERATOR_API_KEY;
    });

    it('returns 401 even with a key when no env var is set', async () => {
      const res = await request(app)
        .post('/api/queues')
        .set('X-API-Key', 'some-key')
        .send({ name: 'q1', slug: 'q1', maxPositions: 10 });
      expect(res.status).toBe(401);
    });
  });

  describe('Protected routes reject unauthenticated requests', () => {
    beforeAll(() => {
      process.env.OPERATOR_API_KEY = TEST_API_KEY;
    });

    afterAll(() => {
      delete process.env.OPERATOR_API_KEY;
    });

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('POST /api/queues/:id/advance returns 401 without key', async () => {
      const res = await request(app).post('/api/queues/q1/advance').send({ batchSize: 1 });
      expect(res.status).toBe(401);
    });

    it('POST /api/queues/:id/close returns 401 without key', async () => {
      const res = await request(app).post('/api/queues/q1/close').send();
      expect(res.status).toBe(401);
    });

    it('POST /api/queues/:id/open-enrollment returns 401 without key', async () => {
      const res = await request(app).post('/api/queues/q1/open-enrollment').send();
      expect(res.status).toBe(401);
    });

    it('POST /api/queues/:id/close-enrollment returns 401 without key', async () => {
      const res = await request(app).post('/api/queues/q1/close-enrollment').send();
      expect(res.status).toBe(401);
    });

    it('POST /api/escrow/release returns 401 without key', async () => {
      const res = await request(app).post('/api/escrow/release').send({ escrowId: 'q1:GB123' });
      expect(res.status).toBe(401);
    });

    it('POST /api/escrow/refund returns 401 without key', async () => {
      const res = await request(app).post('/api/escrow/refund').send({ escrowId: 'q1:GB123' });
      expect(res.status).toBe(401);
    });

    it('POST /api/escrow/expire returns 401 without key', async () => {
      const res = await request(app).post('/api/escrow/expire').send({ escrowId: 'q1:GB123' });
      expect(res.status).toBe(401);
    });
  });

  describe('Unauthenticated routes remain accessible', () => {
    beforeAll(() => {
      process.env.OPERATOR_API_KEY = TEST_API_KEY;
    });

    afterAll(() => {
      delete process.env.OPERATOR_API_KEY;
    });

    it('GET /api/queues returns 200 without key', async () => {
      vi.mocked(queueService.listQueues).mockReturnValue([]);
      const res = await request(app).get('/api/queues');
      expect(res.status).toBe(200);
    });

    it('GET /api/queues/:id returns 200 without key', async () => {
      vi.mocked(queueService.getQueueById).mockReturnValue(undefined);
      const res = await request(app).get('/api/queues/q1');
      expect(res.status).toBe(404); // not found, but not 401
    });

    it('POST /api/escrow/deposit returns 201 without key', async () => {
      vi.mocked(escrowService.depositEscrow).mockReturnValue({} as any);
      const res = await request(app)
        .post('/api/escrow/deposit')
        .send({ queueId: 'q1', identity: 'GB123456789012345678901234567890123456789012345678', amount: 10, asset: 'USDC' });
      expect(res.status).toBe(201);
    });

    it('GET /api/escrow/:id returns 200 without key', async () => {
      vi.mocked(escrowService.getEscrow).mockReturnValue({ id: 'foo' } as any);
      const res = await request(app).get('/api/escrow/foo:bar');
      expect(res.status).toBe(200);
    });
  });
});
