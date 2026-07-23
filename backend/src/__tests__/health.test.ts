import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { healthPayload } from '../health.js';

const app = createApp();

describe('healthPayload & health routes', () => {
  it('returns the canonical health shape', () => {
    const payload = healthPayload();
    expect(payload.status).toBe('ok');
    expect(typeof payload.environment).toBe('string');
    // timestamp is a valid ISO-8601 instant
    expect(Number.isNaN(Date.parse(payload.timestamp))).toBe(false);
    expect(payload.timestamp).toBe(new Date(payload.timestamp).toISOString());
  });

  it('GET /health returns 200 with canonical health payload', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.timestamp).toBeDefined();
    expect(res.body.environment).toBeDefined();
  });

  it('GET /public/health redirects (301) to /health', async () => {
    const res = await request(app).get('/public/health');
    expect(res.status).toBe(301);
    expect(res.header.location).toBe('/health');
  });
});
