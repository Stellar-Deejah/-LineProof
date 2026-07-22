import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { errorHandler } from '../../middleware/errorHandler.js';

describe('errorHandler middleware', () => {
  const createTestApp = () => {
    const app = express();
    app.get('/error-500', () => {
      throw new Error('Something exploded');
    });
    app.get('/error-400', () => {
      const err: any = new Error('Bad Request');
      err.status = 400;
      throw err;
    });
    app.use(errorHandler);
    return app;
  };

  it('forwards 400 status and formats error shape', async () => {
    const app = createTestApp();
    const res = await request(app).get('/error-400');
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.message).toBe('Bad Request');
    expect(res.body.error.status).toBe(400);
    expect(res.body.error.path).toBe('/error-400');
    expect(res.body.error.timestamp).toBeDefined();
  });

  it('defaults to 500 status and formats error shape', async () => {
    const app = createTestApp();
    const res = await request(app).get('/error-500');
    expect(res.status).toBe(500);
    expect(res.body.error.message).toBe('Something exploded');
    expect(res.body.error.status).toBe(500);
    expect(res.body.error.path).toBe('/error-500');
  });

  it('includes stack trace in development mode', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    const app = createTestApp();
    const res = await request(app).get('/error-500');
    expect(res.body.error.stack).toBeDefined();
    expect(res.body.error.stack).toContain('Error: Something exploded');
    process.env.NODE_ENV = originalEnv;
  });

  it('omits stack trace in non-development mode', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const app = createTestApp();
    const res = await request(app).get('/error-500');
    expect(res.body.error.stack).toBeUndefined();
    process.env.NODE_ENV = originalEnv;
  });
});
