import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { openApiDocument } from './openapi.js';

vi.mock('./contracts/index.js', () => ({
  readQueueOnChain: vi.fn().mockResolvedValue(undefined),
}));

describe('OpenAPI contract', () => {
  it('documents every backend route with response schemas', () => {
    expect(openApiDocument.openapi).toBe('3.1.0');
    expect(Object.keys(openApiDocument.paths ?? {})).toHaveLength(23);

    for (const pathItem of Object.values(openApiDocument.paths ?? {})) {
      for (const operation of Object.values(pathItem ?? {})) {
        if (!operation || typeof operation !== 'object' || !('responses' in operation)) continue;
        expect(Object.keys(operation.responses ?? {}).length).toBeGreaterThan(0);
      }
    }

    expect(Object.keys(openApiDocument.components?.schemas ?? {})).toEqual(
      expect.arrayContaining([
        'CreateQueue',
        'Enroll',
        'Deposit',
        'Queue',
        'QueueStats',
        'EnrollmentRecord',
        'EscrowRecord',
      ]),
    );
  });

  it('serves the raw contract and Swagger UI outside production', async () => {
    const app = createApp();
    const spec = await request(app).get('/api/openapi.json');
    expect(spec.status).toBe(200);
    expect(spec.body.openapi).toBe('3.1.0');

    const docs = await request(app).get('/api/docs/');
    expect(docs.status).toBe(200);
    expect(docs.text).toContain('LineProof API Documentation');
  });
});
