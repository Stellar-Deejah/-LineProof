import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import queueRoutes from './routes/queues.js';
import enrollmentRoutes from './routes/enrollments.js';
import escrowRoutes from './routes/escrow.js';
import publicRoutes from './routes/public.js';
import { errorHandler } from './middleware/errorHandler.js';
import { defaultRateLimiter, writeRateLimiter } from './middleware/rateLimiter.js';
import { requestLogger } from './middleware/requestLogger.js';

const app = express();

const allowedOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim());

app.use(helmet());
app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(requestLogger);
app.use(defaultRateLimiter);

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV ?? 'development',
  });
});

app.use('/api/queues', queueRoutes);
app.use('/api/enrollments', writeRateLimiter, enrollmentRoutes);
app.use('/api/escrow', writeRateLimiter, escrowRoutes);
app.use('/public', publicRoutes);

app.use(errorHandler);

const port = process.env.PORT ? Number(process.env.PORT) : 4000;
app.listen(port, () => {
  console.log(`LineProof backend listening on :${port} [${process.env.NODE_ENV ?? 'development'}]`);
});
