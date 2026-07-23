import {
  extendZodWithOpenApi,
  OpenAPIRegistry,
  OpenApiGeneratorV31,
} from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import {
  AdvanceSchema,
  CancelSchema,
  CreateQueueSchema,
  DepositSchema,
  EnrollmentRecordSchema,
  EnrollSchema,
  ErrorSchema,
  EscrowActionSchema,
  EscrowRecordSchema,
  GetQueuesQuerySchema,
  HealthSchema,
  QueueSchema,
  QueueStatsSchema,
} from './schemas/api.js';
import {
  PublicQueueStatsSchema,
  PublicQueueSummaryListSchema,
} from './schemas/publicQueue.js';
import { SlugSchema } from './schemas/slug.js';
import { StellarAddress } from './schemas/stellar.js';

extendZodWithOpenApi(z);

const registry = new OpenAPIRegistry();

const schemas = {
  CreateQueue: registry.register('CreateQueue', CreateQueueSchema),
  AdvanceQueue: registry.register('AdvanceQueue', AdvanceSchema),
  Enroll: registry.register('Enroll', EnrollSchema),
  CancelEnrollment: registry.register('CancelEnrollment', CancelSchema),
  Deposit: registry.register('Deposit', DepositSchema),
  EscrowAction: registry.register('EscrowAction', EscrowActionSchema),
  Queue: registry.register('Queue', QueueSchema),
  QueueStats: registry.register('QueueStats', QueueStatsSchema),
  EnrollmentRecord: registry.register('EnrollmentRecord', EnrollmentRecordSchema),
  EscrowRecord: registry.register('EscrowRecord', EscrowRecordSchema),
  Error: registry.register('Error', ErrorSchema),
  Health: registry.register('Health', HealthSchema),
  PublicQueueList: registry.register('PublicQueueList', PublicQueueSummaryListSchema),
  PublicQueueStats: registry.register('PublicQueueStats', PublicQueueStatsSchema),
};

const json = (schema: z.ZodTypeAny) => ({
  'application/json': { schema },
});
const errorResponses = {
  400: { description: 'Invalid request', content: json(schemas.Error) },
  404: { description: 'Resource not found', content: json(schemas.Error) },
  409: { description: 'Resource conflict', content: json(schemas.Error) },
};
const queueIdParams = z.object({ id: SlugSchema.openapi({ example: 'sneaker-drop-001' }) });

registry.registerPath({
  method: 'get',
  path: '/api/queues',
  tags: ['Queues'],
  summary: 'List queues',
  request: { query: GetQueuesQuerySchema },
  responses: {
    200: {
      description: 'Paginated queue list',
      content: json(z.object({
        items: z.array(schemas.Queue),
        nextCursor: z.string().nullable(),
        total: z.number().int().nonnegative(),
      })),
    },
    400: errorResponses[400],
  },
});
registry.registerPath({
  method: 'post',
  path: '/api/queues',
  tags: ['Queues'],
  summary: 'Create a queue',
  request: { body: { content: json(schemas.CreateQueue) } },
  responses: {
    201: { description: 'Queue created', content: json(schemas.Queue) },
    400: errorResponses[400],
    409: errorResponses[409],
  },
});
registry.registerPath({
  method: 'get',
  path: '/api/queues/{id}',
  tags: ['Queues'],
  summary: 'Get a queue',
  request: { params: queueIdParams },
  responses: {
    200: {
      description: 'Queue record and data source',
      content: json(schemas.Queue.and(z.object({ source: z.enum(['on-chain', 'in-memory']) }))),
    },
    400: errorResponses[400],
    404: errorResponses[404],
  },
});
registry.registerPath({
  method: 'get',
  path: '/api/queues/{id}/stats',
  tags: ['Queues'],
  summary: 'Get queue statistics',
  request: { params: queueIdParams },
  responses: {
    200: { description: 'Queue statistics', content: json(schemas.QueueStats) },
    400: errorResponses[400],
    404: errorResponses[404],
  },
});

for (const [path, summary] of [
  ['/api/queues/{id}/close', 'Close a queue'],
  ['/api/queues/{id}/open-enrollment', 'Open queue enrollment'],
  ['/api/queues/{id}/close-enrollment', 'Close queue enrollment'],
] as const) {
  registry.registerPath({
    method: 'post',
    path,
    tags: ['Queues'],
    summary,
    request: { params: queueIdParams },
    responses: {
      200: { description: 'Updated queue', content: json(schemas.Queue) },
      400: errorResponses[400],
      404: errorResponses[404],
      409: errorResponses[409],
    },
  });
}
registry.registerPath({
  method: 'post',
  path: '/api/queues/{id}/advance',
  tags: ['Queues'],
  summary: 'Advance queue positions',
  request: {
    params: queueIdParams,
    body: { content: json(schemas.AdvanceQueue) },
  },
  responses: {
    200: { description: 'Advanced queue', content: json(schemas.Queue) },
    ...errorResponses,
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/enrollments/enroll',
  tags: ['Enrollments'],
  summary: 'Enroll an identity',
  request: { body: { content: json(schemas.Enroll) } },
  responses: {
    201: { description: 'Enrollment created', content: json(schemas.EnrollmentRecord) },
    400: errorResponses[400],
    409: errorResponses[409],
  },
});
registry.registerPath({
  method: 'post',
  path: '/api/enrollments/cancel',
  tags: ['Enrollments'],
  summary: 'Cancel an enrollment',
  request: { body: { content: json(schemas.CancelEnrollment) } },
  responses: {
    200: {
      description: 'Enrollment cancelled',
      content: json(z.object({ message: z.string() })),
    },
    400: errorResponses[400],
    404: errorResponses[404],
  },
});
registry.registerPath({
  method: 'get',
  path: '/api/enrollments/queue/{queueId}',
  tags: ['Enrollments'],
  summary: 'List queue enrollments',
  request: { params: z.object({ queueId: z.string().min(1) }) },
  responses: {
    200: {
      description: 'Queue enrollment records',
      content: json(z.array(schemas.EnrollmentRecord)),
    },
  },
});
registry.registerPath({
  method: 'get',
  path: '/api/enrollments/{identity}',
  tags: ['Enrollments'],
  summary: 'List identity enrollments',
  request: { params: z.object({ identity: StellarAddress }) },
  responses: {
    200: {
      description: 'Identity enrollment records',
      content: json(z.array(schemas.EnrollmentRecord)),
    },
    400: errorResponses[400],
    404: errorResponses[404],
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/escrow/deposit',
  tags: ['Escrow'],
  summary: 'Create an escrow deposit',
  request: { body: { content: json(schemas.Deposit) } },
  responses: {
    201: { description: 'Escrow created', content: json(schemas.EscrowRecord) },
    400: errorResponses[400],
    409: errorResponses[409],
  },
});
for (const action of ['release', 'refund', 'expire'] as const) {
  registry.registerPath({
    method: 'post',
    path: `/api/escrow/${action}`,
    tags: ['Escrow'],
    summary: `${action[0]?.toUpperCase()}${action.slice(1)} an escrow`,
    request: { body: { content: json(schemas.EscrowAction) } },
    responses: {
      200: { description: 'Updated escrow', content: json(schemas.EscrowRecord) },
      400: errorResponses[400],
      404: errorResponses[404],
      409: errorResponses[409],
      422: { description: 'Escrow is not ready to expire', content: json(schemas.Error) },
    },
  });
}
registry.registerPath({
  method: 'get',
  path: '/api/escrow/{id}',
  tags: ['Escrow'],
  summary: 'Get an escrow record',
  request: { params: z.object({ id: z.string().min(1) }) },
  responses: {
    200: { description: 'Escrow record', content: json(schemas.EscrowRecord) },
    404: errorResponses[404],
  },
});

registry.registerPath({
  method: 'get',
  path: '/public/queues',
  tags: ['Public'],
  summary: 'List public queue summaries',
  responses: {
    200: { description: 'Public queue summaries', content: json(schemas.PublicQueueList) },
  },
});
registry.registerPath({
  method: 'get',
  path: '/public/queues/{id}/stats',
  tags: ['Public'],
  summary: 'Get public queue statistics',
  request: { params: queueIdParams },
  responses: {
    200: { description: 'Public queue statistics', content: json(schemas.PublicQueueStats) },
    404: errorResponses[404],
  },
});
registry.registerPath({
  method: 'get',
  path: '/health',
  tags: ['System'],
  summary: 'Check backend health',
  responses: {
    200: { description: 'Backend is healthy', content: json(schemas.Health) },
  },
});
registry.registerPath({
  method: 'get',
  path: '/public/health',
  tags: ['System'],
  summary: 'Redirect to the canonical health endpoint',
  responses: {
    301: {
      description: 'Permanent redirect to /health',
      headers: {
        Location: { schema: { type: 'string', example: '/health' } },
      },
    },
  },
});
registry.registerPath({
  method: 'get',
  path: '/metrics',
  tags: ['System'],
  summary: 'Read Prometheus metrics',
  responses: {
    200: {
      description: 'Prometheus text exposition',
      content: { 'text/plain': { schema: z.string() } },
    },
  },
});
registry.registerPath({
  method: 'get',
  path: '/api/openapi.json',
  tags: ['System'],
  summary: 'Read the OpenAPI 3.1 document',
  responses: {
    200: {
      description: 'Machine-readable API contract',
      content: json(z.record(z.unknown())),
    },
  },
});
registry.registerPath({
  method: 'get',
  path: '/api/docs',
  tags: ['System'],
  summary: 'Browse Swagger UI (non-production only)',
  responses: {
    200: {
      description: 'Swagger UI HTML',
      content: { 'text/html': { schema: z.string() } },
    },
    404: { description: 'Disabled in production' },
  },
});

export const openApiDocument: ReturnType<OpenApiGeneratorV31['generateDocument']> =
  new OpenApiGeneratorV31(registry.definitions).generateDocument({
  openapi: '3.1.0',
  info: {
    title: 'LineProof Backend API',
    version: '0.1.0',
    description: 'HTTP contract for queue, enrollment, and escrow integrations.',
  },
  servers: [{ url: 'http://localhost:4000', description: 'Local development' }],
  tags: [
    { name: 'Queues' },
    { name: 'Enrollments' },
    { name: 'Escrow' },
    { name: 'Public' },
    { name: 'System' },
  ],
  });
