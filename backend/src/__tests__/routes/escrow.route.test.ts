import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../app.js';
import * as escrowService from '../../services/escrowService.js';

vi.mock('../../services/escrowService.js');

const VALID_IDENTITY = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const VALID_ESCROW_ID = `q1:${VALID_IDENTITY}`;

describe('Escrow Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/escrow/deposit', () => {
    it('returns 400 on invalid body (missing amount)', async () => {
      const res = await request(app)
        .post('/api/escrow/deposit')
        .send({ queueId: 'q1', identity: VALID_IDENTITY, asset: 'USDC' });
      
      expect(res.status).toBe(400);
      expect(res.body.error.issues).toBeDefined();
    });

    it('returns 201 on valid body', async () => {
      const record = { id: VALID_ESCROW_ID, queueId: 'q1', identity: VALID_IDENTITY, amount: 10, asset: 'USDC', status: 'Active', createdAt: '', expiresAt: '' };
      vi.mocked(escrowService.depositEscrow).mockReturnValue(record as any);

      const res = await request(app)
        .post('/api/escrow/deposit')
        .send({ queueId: 'q1', identity: VALID_IDENTITY, amount: 10, asset: 'USDC' });
      
      expect(res.status).toBe(201);
      expect(res.body).toEqual(record);
      expect(escrowService.depositEscrow).toHaveBeenCalledWith(expect.objectContaining({ queueId: 'q1', amount: 10 }));
    });
  });

  describe('POST /api/escrow/release', () => {
    it('returns 404 if escrow not found', async () => {
      vi.mocked(escrowService.releaseEscrow).mockReturnValue(undefined);
      const res = await request(app).post('/api/escrow/release').send({ escrowId: VALID_ESCROW_ID });
      expect(res.status).toBe(404);
    });

    it('returns 200 on success', async () => {
      const record = { id: VALID_ESCROW_ID, queueId: 'q1', identity: VALID_IDENTITY, amount: 10, asset: 'USDC', status: 'Released', createdAt: '', expiresAt: '' };
      vi.mocked(escrowService.releaseEscrow).mockReturnValue(record as any);
      const res = await request(app).post('/api/escrow/release').send({ escrowId: VALID_ESCROW_ID });
      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/escrow/refund', () => {
    it('returns 404 if escrow not found', async () => {
      vi.mocked(escrowService.refundEscrow).mockReturnValue(undefined);
      const res = await request(app).post('/api/escrow/refund').send({ escrowId: VALID_ESCROW_ID });
      expect(res.status).toBe(404);
    });

    it('returns 200 on success', async () => {
      const record = { id: VALID_ESCROW_ID, queueId: 'q1', identity: VALID_IDENTITY, amount: 10, asset: 'USDC', status: 'Refunded', createdAt: '', expiresAt: '' };
      vi.mocked(escrowService.refundEscrow).mockReturnValue(record as any);
      const res = await request(app).post('/api/escrow/refund').send({ escrowId: VALID_ESCROW_ID });
      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/escrow/expire', () => {
    it('returns 404 if escrow not found', async () => {
      vi.mocked(escrowService.expireEscrow).mockReturnValue(undefined);
      const res = await request(app).post('/api/escrow/expire').send({ escrowId: VALID_ESCROW_ID });
      expect(res.status).toBe(404);
    });

    it('returns 200 on success', async () => {
      const record = { id: VALID_ESCROW_ID, queueId: 'q1', identity: VALID_IDENTITY, amount: 10, asset: 'USDC', status: 'Expired', createdAt: '', expiresAt: '' };
      vi.mocked(escrowService.expireEscrow).mockReturnValue(record as any);
      const res = await request(app).post('/api/escrow/expire').send({ escrowId: VALID_ESCROW_ID });
      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/escrow/:id', () => {
    it('returns 404 if not found', async () => {
      vi.mocked(escrowService.getEscrow).mockReturnValue(undefined);
      const res = await request(app).get(`/api/escrow/foo:${VALID_IDENTITY}`);
      expect(res.status).toBe(404);
    });

    it('returns 200 with record', async () => {
      const record = { id: `foo:${VALID_IDENTITY}` };
      vi.mocked(escrowService.getEscrow).mockReturnValue(record as any);
      const res = await request(app).get(`/api/escrow/foo:${VALID_IDENTITY}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual(record);
    });
  });
});
