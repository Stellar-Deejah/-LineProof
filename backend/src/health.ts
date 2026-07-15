import { config } from './config.js';

export interface HealthPayload {
  status: 'ok';
  timestamp: string;
  environment: string;
}

/**
 * Canonical health payload shared by `GET /health` and `GET /public/health`
 * so both endpoints report an identical shape (issue #31 / #33).
 */
export function healthPayload(): HealthPayload {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv,
  };
}
