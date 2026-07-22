import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import escrowRouter from '../routes/escrow.js';
import { errorHandler } from '../middleware/errorHandler.js';

// Mock the services
vi.mock('../services/escrowService.js', () => ({
  depositEscrow: vi.fn(),
  releaseEscrow: vi.fn(),
  refundEscrow: vi.fn(),
  expireEscrow: vi.fn(),
  getEscrow: vi.fn(),
}));

// Mock the metrics
vi.mock('../metrics/registry.js', () => ({
  recordEscrowDeposit: vi.fn(),
  recordEscrowClosed: vi.fn(),
}));

const VALID_KEY = 'G' + 'A'.repeat(55);
const INVALID_S_KEY = 'S' + 'A'.repeat(55);

describe('Escrow Routes - Stellar Address Validation', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/escrow', escrowRouter);
    app.use(errorHandler);
    vi.clearAllMocks();
  });

  describe('POST /api/escrow/deposit', () => {
    it('should reject S-prefixed secret key as identity', async () => {
      const response = await request(app)
        .post('/api/escrow/deposit')
        .send({
          queueId: 'test-queue',
          identity: INVALID_S_KEY,
          amount: 100,
          asset: 'XLM',
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error.message).toContain('Invalid Stellar address');
      expect(response.body.error.field).toBe('identity');
    });

    it('should reject garbage string as identity', async () => {
      const response = await request(app)
        .post('/api/escrow/deposit')
        .send({
          queueId: 'test-queue',
          identity: 'not-a-stellar-address',
          amount: 100,
          asset: 'XLM',
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error.message).toContain('Invalid Stellar address');
      expect(response.body.error.field).toBe('identity');
    });

    it('should accept valid G-prefixed Stellar address', async () => {
      const { depositEscrow } = await import('../services/escrowService.js');
      vi.mocked(depositEscrow).mockReturnValue({
        id: `test-queue:${VALID_KEY}`,
        queueId: 'test-queue',
        identity: VALID_KEY,
        amount: 100,
        asset: 'XLM',
        status: 'Active',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      });

      const response = await request(app)
        .post('/api/escrow/deposit')
        .send({
          queueId: 'test-queue',
          identity: VALID_KEY,
          amount: 100,
          asset: 'XLM',
        });

      expect(response.status).toBe(201);
    });
  });

  describe('POST /api/escrow/release', () => {
    it('should reject escrowId with invalid embedded identity', async () => {
      const response = await request(app)
        .post('/api/escrow/release')
        .send({
          escrowId: `test-queue:${INVALID_S_KEY}`,
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error.issues).toBeDefined();
      expect(response.body.error.issues[0].message).toContain('Invalid escrowId format');
    });

    it('should reject escrowId without colon separator', async () => {
      const response = await request(app)
        .post('/api/escrow/release')
        .send({
          escrowId: 'invalid-escrow-id',
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should accept valid escrowId with valid embedded identity', async () => {
      const { releaseEscrow } = await import('../services/escrowService.js');
      vi.mocked(releaseEscrow).mockReturnValue({
        id: `test-queue:${VALID_KEY}`,
        queueId: 'test-queue',
        identity: VALID_KEY,
        amount: 100,
        asset: 'XLM',
        status: 'Released',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        releasedAt: new Date().toISOString(),
      });

      const response = await request(app)
        .post('/api/escrow/release')
        .send({
          escrowId: `test-queue:${VALID_KEY}`,
        });

      expect(response.status).toBe(200);
    });
  });

  describe('POST /api/escrow/refund', () => {
    it('should reject escrowId with invalid embedded identity', async () => {
      const response = await request(app)
        .post('/api/escrow/refund')
        .send({
          escrowId: `test-queue:${INVALID_S_KEY}`,
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error.issues).toBeDefined();
      expect(response.body.error.issues[0].message).toContain('Invalid escrowId format');
    });

    it('should accept valid escrowId with valid embedded identity', async () => {
      const { refundEscrow } = await import('../services/escrowService.js');
      vi.mocked(refundEscrow).mockReturnValue({
        id: `test-queue:${VALID_KEY}`,
        queueId: 'test-queue',
        identity: VALID_KEY,
        amount: 100,
        asset: 'XLM',
        status: 'Refunded',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      });

      const response = await request(app)
        .post('/api/escrow/refund')
        .send({
          escrowId: `test-queue:${VALID_KEY}`,
        });

      expect(response.status).toBe(200);
    });
  });

  describe('POST /api/escrow/expire', () => {
    it('should reject escrowId with invalid embedded identity', async () => {
      const response = await request(app)
        .post('/api/escrow/expire')
        .send({
          escrowId: `test-queue:${INVALID_S_KEY}`,
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error.issues).toBeDefined();
      expect(response.body.error.issues[0].message).toContain('Invalid escrowId format');
    });

    it('should accept valid escrowId with valid embedded identity', async () => {
      const { expireEscrow } = await import('../services/escrowService.js');
      vi.mocked(expireEscrow).mockReturnValue({
        id: `test-queue:${VALID_KEY}`,
        queueId: 'test-queue',
        identity: VALID_KEY,
        amount: 100,
        asset: 'XLM',
        status: 'Expired',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      });

      const response = await request(app)
        .post('/api/escrow/expire')
        .send({
          escrowId: `test-queue:${VALID_KEY}`,
        });

      expect(response.status).toBe(200);
    });
  });
});
