import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../../app.js';
import { config } from '../../config.js';
import { serviceEmitter } from '../../services/eventEmitter.js';
import { defaultMemoryAdapter } from '../../storage/index.js';
import { BACKOFF_BASE_DELAY } from '../../services/webhookDispatcher.js';
import crypto from 'crypto';

describe('Webhooks Routes & Dispatcher', () => {
  const operatorSecret = 'operator_secret_12345678';
  let originalOperatorSecretKey: string | undefined;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    vi.useFakeTimers();
    defaultMemoryAdapter.reset();

    // Set operator key in config
    originalOperatorSecretKey = config.operatorSecretKey;
    config.operatorSecretKey = operatorSecret;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    config.operatorSecretKey = originalOperatorSecretKey;
  });

  describe('REST Endpoints (Operator Auth Required)', () => {
    it('returns 401 if unauthorized', async () => {
      const res = await request(app).get('/api/webhooks');
      expect(res.status).toBe(401);
    });

    it('returns 401 on invalid bearer token', async () => {
      const res = await request(app)
        .get('/api/webhooks')
        .set('Authorization', 'Bearer invalid_token');
      expect(res.status).toBe(401);
    });

    it('registers, lists, and deletes a webhook', async () => {
      // 1. Register Webhook
      const registerRes = await request(app)
        .post('/api/webhooks')
        .set('Authorization', `Bearer ${operatorSecret}`)
        .send({
          url: 'https://example.com/webhook',
          secret: 'mysecretwebhookkey',
          events: ['queue.created', 'queue.status_changed'],
        });

      expect(registerRes.status).toBe(201);
      expect(registerRes.body.id).toBeDefined();
      expect(registerRes.body.url).toBe('https://example.com/webhook');

      const webhookId = registerRes.body.id;

      // 2. List Webhooks
      const listRes = await request(app)
        .get('/api/webhooks')
        .set('Authorization', `Bearer ${operatorSecret}`);

      expect(listRes.status).toBe(200);
      expect(listRes.body.length).toBe(1);
      expect(listRes.body[0].id).toBe(webhookId);

      // 3. Delete Webhook
      const deleteRes = await request(app)
        .delete(`/api/webhooks/${webhookId}`)
        .set('Authorization', `Bearer ${operatorSecret}`);

      expect(deleteRes.status).toBe(200);

      // 4. Verify list is empty
      const listAfterRes = await request(app)
        .get('/api/webhooks')
        .set('Authorization', `Bearer ${operatorSecret}`);
      expect(listAfterRes.body.length).toBe(0);
    });

    it('returns 400 on invalid webhook registration payload', async () => {
      const res = await request(app)
        .post('/api/webhooks')
        .set('Authorization', `Bearer ${operatorSecret}`)
        .send({
          url: 'not-a-url',
          secret: 'short',
          events: [],
        });
      expect(res.status).toBe(400);
    });
  });

  describe('Webhook Dispatcher & Signature Verification', () => {
    it('dispatches webhooks on events, verifies HMAC-SHA256 signature, and retries on failure', async () => {
      const webhookSecret = 'supersecretkeyforwebhook';
      
      // Register a webhook with wildcard filter
      await request(app)
        .post('/api/webhooks')
        .set('Authorization', `Bearer ${operatorSecret}`)
        .send({
          url: 'https://example.com/wildcard',
          secret: webhookSecret,
          events: ['*'],
        });

      // Mock fetch behaviors:
      // First attempt: returns 500 (failure)
      // Second attempt: returns 500 (failure)
      // Third attempt: returns 200 (success)
      const mockFetch = vi.mocked(fetch);
      mockFetch
        .mockResolvedValueOnce({ status: 500 } as Response)
        .mockResolvedValueOnce({ status: 500 } as Response)
        .mockResolvedValueOnce({ status: 200 } as Response);

      // Emit event
      const testPayload = { id: 'queue-123', name: 'Test Queue' };
      serviceEmitter.emit('queue.created', testPayload);

      // Wait for first call
      await vi.runAllTimersAsync();

      // Check first call (attempt 1)
      expect(mockFetch).toHaveBeenCalledTimes(3);

      const [firstUrl, firstOptions] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(firstUrl).toBe('https://example.com/wildcard');
      expect(firstOptions.method).toBe('POST');
      expect(firstOptions.headers).toBeDefined();

      const headers = firstOptions.headers as Record<string, string>;
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['X-LineProof-Signature']).toBeDefined();

      // Verify signature on body
      const body = firstOptions.body as string;
      const parsedBody = JSON.parse(body);
      expect(parsedBody.event).toBe('queue.created');
      expect(parsedBody.data).toEqual(testPayload);

      const signature = headers['X-LineProof-Signature'];
      const signatureHex = signature.replace('sha256=', '');
      
      const expectedHmac = crypto.createHmac('sha256', webhookSecret).update(body).digest('hex');
      expect(signatureHex).toBe(expectedHmac);
    });

    it('does not dispatch if event type does not match filter', async () => {
      // Register webhook only for escrow events
      await request(app)
        .post('/api/webhooks')
        .set('Authorization', `Bearer ${operatorSecret}`)
        .send({
          url: 'https://example.com/escrow',
          secret: 'some_secret',
          events: ['escrow.deposited'],
        });

      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValue({ status: 200 } as Response);

      // Emit queue created event
      serviceEmitter.emit('queue.created', { id: 'q1' });

      await vi.runAllTimersAsync();
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
