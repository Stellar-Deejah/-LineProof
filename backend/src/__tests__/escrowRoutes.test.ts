import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import escrowRouter from '../routes/escrow.js';

const app = express();
app.use(express.json());
app.use('/api/escrow', escrowRouter);

describe('POST /api/escrow/deposit', () => {
  const VALID_KEY = 'G' + 'A'.repeat(55);
  const INVALID_KEY = 'S' + 'A'.repeat(55); // Secret key instead of public key
  const GARBAGE_KEY = 'not-a-stellar-key';

  it('rejects S-prefixed secret key as identity', async () => {
    const response = await request(app)
      .post('/api/escrow/deposit')
      .send({
        queueId: 'test-queue',
        identity: INVALID_KEY,
        amount: 100,
        asset: 'XLM',
      });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error');
    expect(response.body.error.field).toBe('identity');
    expect(response.body.error.message).toContain('Invalid Stellar address');
  });

  it('rejects garbage string as identity', async () => {
    const response = await request(app)
      .post('/api/escrow/deposit')
      .send({
        queueId: 'test-queue',
        identity: GARBAGE_KEY,
        amount: 100,
        asset: 'XLM',
      });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error');
    expect(response.body.error.field).toBe('identity');
  });

  it('accepts valid G-prefixed Stellar address', async () => {
    const response = await request(app)
      .post('/api/escrow/deposit')
      .send({
        queueId: 'test-queue',
        identity: VALID_KEY,
        amount: 100,
        asset: 'XLM',
      });

    expect(response.status).not.toBe(400);
  });
});

describe('POST /api/escrow/release', () => {
  const VALID_KEY = 'G' + 'A'.repeat(55);
  const INVALID_KEY = 'S' + 'A'.repeat(55);

  it('rejects escrowId with invalid embedded identity', async () => {
    const response = await request(app)
      .post('/api/escrow/release')
      .send({
        escrowId: `test-queue:${INVALID_KEY}`,
      });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('message');
    expect(response.body.message).toContain('Invalid escrowId format');
  });

  it('rejects escrowId with garbage embedded identity', async () => {
    const response = await request(app)
      .post('/api/escrow/release')
      .send({
        escrowId: 'test-queue:not-a-stellar-key',
      });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('message');
  });

  it('rejects malformed escrowId without colon separator', async () => {
    const response = await request(app)
      .post('/api/escrow/release')
      .send({
        escrowId: 'invalid-format-no-colon',
      });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('message');
  });

  it('accepts escrowId with valid embedded Stellar address', async () => {
    const response = await request(app)
      .post('/api/escrow/release')
      .send({
        escrowId: `test-queue:${VALID_KEY}`,
      });

    expect(response.status).not.toBe(400);
  });
});

describe('POST /api/escrow/refund', () => {
  const VALID_KEY = 'G' + 'A'.repeat(55);
  const INVALID_KEY = 'S' + 'A'.repeat(55);

  it('rejects escrowId with invalid embedded identity', async () => {
    const response = await request(app)
      .post('/api/escrow/refund')
      .send({
        escrowId: `test-queue:${INVALID_KEY}`,
      });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('message');
    expect(response.body.message).toContain('Invalid escrowId format');
  });

  it('accepts escrowId with valid embedded Stellar address', async () => {
    const response = await request(app)
      .post('/api/escrow/refund')
      .send({
        escrowId: `test-queue:${VALID_KEY}`,
      });

    expect(response.status).not.toBe(400);
  });
});
