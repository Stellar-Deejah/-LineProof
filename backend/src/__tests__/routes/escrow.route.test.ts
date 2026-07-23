import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../app.js';
import * as escrowService from '../../services/escrowService.js';

vi.mock('../../services/escrowService.js');

const TEST_API_KEY = 'test-api-key-12345678';

describe('Escrow Routes', () => {
  beforeAll(() => {
    process.env.OPERATOR_API_KEY = TEST_API_KEY;
  });

  afterAll(() => {
    delete process.env.OPERATOR_API_KEY;
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/escrow/deposit', () => {
    it('returns 400 on invalid body (missing amount)', async () => {
      const res = await request(app)
        .post('/api/escrow/deposit')
        .send({ queueId: 'q1', identity: 'GB123', asset: 'USDC' });
      
      expect(res.status).toBe(400);
      expect(res.body.error.issues).toBeDefined();
    });

    it('returns 201 on valid body', async () => {
      const record = { id: 'q1:GB123', queueId: 'q1', identity: 'GB123', amount: 10, asset: 'USDC', status: 'Active', createdAt: '', expiresAt: '' };
      vi.mocked(escrowService.depositEscrow).mockReturnValue(record as any);

      const res = await request(app)
        .post('/api/escrow/deposit')
        .send({ queueId: 'q1', identity: 'GB123', amount: 10, asset: 'USDC' });
      
      expect(res.status).toBe(201);
      expect(res.body).toEqual(record);
      expect(escrowService.depositEscrow).toHaveBeenCalledWith(expect.objectContaining({ queueId: 'q1', amount: 10 }));
    });
  });

  describe('POST /api/escrow/release', () => {
    it('returns 404 if escrow not found', async () => {
      vi.mocked(escrowService.releaseEscrow).mockReturnValue(false);
      const res = await request(app)
        .post('/api/escrow/release')
        .set('X-API-Key', TEST_API_KEY)
        .send({ escrowId: 'q1:GB123' });
      expect(res.status).toBe(404);
    });

    it('returns 200 on success', async () => {
      vi.mocked(escrowService.releaseEscrow).mockReturnValue(true);
      const res = await request(app)
        .post('/api/escrow/release')
        .set('X-API-Key', TEST_API_KEY)
        .send({ escrowId: 'q1:GB123' });
      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/escrow/refund', () => {
    it('returns 404 if escrow not found', async () => {
      vi.mocked(escrowService.refundEscrow).mockReturnValue(false);
      const res = await request(app)
        .post('/api/escrow/refund')
        .set('X-API-Key', TEST_API_KEY)
        .send({ escrowId: 'q1:GB123' });
      expect(res.status).toBe(404);
    });

    it('returns 200 on success', async () => {
      vi.mocked(escrowService.refundEscrow).mockReturnValue(true);
      const res = await request(app)
        .post('/api/escrow/refund')
        .set('X-API-Key', TEST_API_KEY)
        .send({ escrowId: 'q1:GB123' });
      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/escrow/expire', () => {
    it('returns 404 if escrow not found', async () => {
      vi.mocked(escrowService.expireEscrow).mockReturnValue(false);
      const res = await request(app)
        .post('/api/escrow/expire')
        .set('X-API-Key', TEST_API_KEY)
        .send({ escrowId: 'q1:GB123' });
      expect(res.status).toBe(404);
    });

    it('returns 200 on success', async () => {
      vi.mocked(escrowService.expireEscrow).mockReturnValue(true);
      const res = await request(app)
        .post('/api/escrow/expire')
        .set('X-API-Key', TEST_API_KEY)
        .send({ escrowId: 'q1:GB123' });
      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/escrow/:id', () => {
    it('returns 404 if not found', async () => {
      vi.mocked(escrowService.getEscrow).mockReturnValue(undefined);
      const res = await request(app).get('/api/escrow/foo:bar');
      expect(res.status).toBe(404);
    });

    it('returns 200 with record', async () => {
      const record = { id: 'foo:bar' };
      vi.mocked(escrowService.getEscrow).mockReturnValue(record as any);
      const res = await request(app).get('/api/escrow/foo:bar');
      expect(res.status).toBe(200);
      expect(res.body).toEqual(record);
    });
  });
});
