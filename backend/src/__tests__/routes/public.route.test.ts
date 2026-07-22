import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../app.js';
import * as queueService from '../../services/queueService.js';
import { QueueStatus } from '../../schemas/queueStatus.js';

vi.mock('../../services/queueService.js');

describe('Public Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /public/queues', () => {
    it('returns public queue list with advancementRuleImplemented flag', async () => {
      const mockData = [
        {
          id: 'fifo-q',
          name: 'FIFO Queue',
          slug: 'fifo-q',
          description: 'A fifo queue',
          maxPositions: 100,
          enrolled: 10,
          advanced: 2,
          status: QueueStatus.EnrollmentOpen,
          advancementRule: 'FIFO' as const,
          escrowAsset: 'USDC',
          escrowAmount: 10,
          createdAt: new Date().toISOString(),
        },
        {
          id: 'vrf-q',
          name: 'VRF Queue',
          slug: 'vrf-q',
          description: 'A vrf queue',
          maxPositions: 50,
          enrolled: 5,
          advanced: 0,
          status: QueueStatus.Draft,
          advancementRule: 'VerifiableRandomness' as const,
          escrowAsset: 'USDC',
          escrowAmount: 0,
          createdAt: new Date().toISOString(),
        },
        {
          id: 'priority-q',
          name: 'Priority Queue',
          slug: 'priority-q',
          description: 'A priority queue',
          maxPositions: 50,
          enrolled: 5,
          advanced: 0,
          status: QueueStatus.Draft,
          advancementRule: 'Priority' as const,
          escrowAsset: 'USDC',
          escrowAmount: 0,
          createdAt: new Date().toISOString(),
        },
      ];

      vi.mocked(queueService.listQueues).mockReturnValue(mockData);

      const res = await request(app).get('/public/queues');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([
        {
          id: 'fifo-q',
          name: 'FIFO Queue',
          slug: 'fifo-q',
          status: QueueStatus.EnrollmentOpen,
          enrolled: 10,
          maxPositions: 100,
          advancementRule: 'FIFO',
          advancementRuleImplemented: true,
        },
        {
          id: 'vrf-q',
          name: 'VRF Queue',
          slug: 'vrf-q',
          status: QueueStatus.Draft,
          enrolled: 5,
          maxPositions: 50,
          advancementRule: 'VerifiableRandomness',
          advancementRuleImplemented: false,
        },
        {
          id: 'priority-q',
          name: 'Priority Queue',
          slug: 'priority-q',
          status: QueueStatus.Draft,
          enrolled: 5,
          maxPositions: 50,
          advancementRule: 'Priority',
          advancementRuleImplemented: false,
        },
      ]);
    });
  });

  describe('GET /public/queues/:id/stats', () => {
    it('returns 404 when queue stats are not found', async () => {
      vi.mocked(queueService.getQueueStats).mockReturnValue(undefined);
      const res = await request(app).get('/public/queues/nonexistent/stats');
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ message: 'Queue not found' });
    });

    it('returns 200 with queue stats when found', async () => {
      const mockStats = {
        queueId: 'fifo-q',
        total: 10,
        advanced: 2,
        remaining: 8,
        percentAdvanced: 20,
      };
      vi.mocked(queueService.getQueueStats).mockReturnValue(mockStats);

      const res = await request(app).get('/public/queues/fifo-q/stats');
      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockStats);
    });
  });

  describe('GET /public/health', () => {
    it('redirects with 301 to /health', async () => {
      const res = await request(app).get('/public/health');
      expect(res.status).toBe(301);
      expect(res.header.location).toBe('/health');
    });
  });
});
