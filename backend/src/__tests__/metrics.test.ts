import { describe, it, expect } from 'vitest';
import {
  register,
  METRICS_CONTENT_TYPE,
  observeHttpRequest,
  recordEnrollment,
  recordEscrowDeposit,
  recordEscrowClosed,
  normalizePath,
} from '../metrics/registry.js';

describe('metrics registry', () => {
  it('advertises the Prometheus content type with version 0.0.4', () => {
    expect(METRICS_CONTENT_TYPE).toContain('text/plain');
    expect(METRICS_CONTENT_TYPE).toContain('version=0.0.4');
  });

  it('exposes all required custom metrics on scrape', async () => {
    const output = await register.metrics();
    for (const name of [
      'http_requests_total',
      'http_request_duration_seconds',
      'queue_enrollment_total',
      'escrow_deposit_total',
      'escrow_active_gauge',
    ]) {
      expect(output).toContain(name);
    }
  });

  it('records HTTP requests into the counter and histogram', async () => {
    observeHttpRequest('GET', '/api/queues', 200, 0.012);
    const output = await register.metrics();
    expect(output).toMatch(/http_requests_total\{[^}]*method="GET"[^}]*status="200"[^}]*\} \d/);
    expect(output).toContain('http_request_duration_seconds_bucket');
  });

  it('records business counters and the active-escrow gauge', async () => {
    recordEnrollment('queue-metrics-1');
    recordEscrowDeposit('USDC');
    recordEscrowDeposit('USDC');
    recordEscrowClosed();
    const output = await register.metrics();
    expect(output).toMatch(/queue_enrollment_total\{[^}]*queue_id="queue-metrics-1"[^}]*\} 1/);
    expect(output).toMatch(/escrow_deposit_total\{[^}]*asset="USDC"[^}]*\} 2/);
    // two deposits (+2) minus one close (-1) => gauge at 1
    expect(output).toMatch(/escrow_active_gauge(\{[^}]*\})? 1/);
  });
});

describe('normalizePath', () => {
  it('prefers the matched route pattern when available', () => {
    expect(normalizePath({ baseUrl: '/api/queues', route: { path: '/:id' }, path: '/api/queues/abc' })).toBe(
      '/api/queues/:id',
    );
  });

  it('collapses numeric ids', () => {
    expect(normalizePath({ path: '/api/queues/12345' })).toBe('/api/queues/:id');
  });

  it('collapses Stellar addresses', () => {
    const addr = 'G' + 'A'.repeat(55);
    expect(normalizePath({ path: `/api/enrollments/${addr}` })).toBe('/api/enrollments/:address');
  });

  it('leaves stable string segments intact', () => {
    expect(normalizePath({ path: '/api/queues' })).toBe('/api/queues');
  });
});
