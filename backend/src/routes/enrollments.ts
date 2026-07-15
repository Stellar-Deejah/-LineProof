import { Router, type IRouter, Response } from 'express';
import { z } from 'zod';
import { enrollIdentity, cancelEnrollment, getEnrollmentsByIdentity, getEnrollmentsByQueue } from '../services/enrollmentService.js';
import { recordEnrollment } from '../metrics/registry.js';

const router: IRouter = Router();

const EnrollSchema = z.object({
  queueId: z.string().min(1),
  identity: z.string().min(1),
});

const CancelSchema = z.object({
  queueId: z.string().min(1),
  identity: z.string().min(1),
});

router.post('/enroll', (req: any, res: Response, next) => {
  const parsed = EnrollSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid request', issues: parsed.error.issues });

  try {
    const result = enrollIdentity(parsed.data.queueId, parsed.data.identity);
    if (result.conflict) return res.status(409).json({ message: 'Duplicate enrollment blocked' });
    recordEnrollment(result.queueId);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/cancel', (req: any, res: Response, next) => {
  const parsed = CancelSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid request', issues: parsed.error.issues });

  try {
    const ok = cancelEnrollment(parsed.data.queueId, parsed.data.identity);
    if (!ok) return res.status(404).json({ message: 'Enrollment not found' });
    res.status(200).json({ message: 'Enrollment cancelled' });
  } catch (err) {
    next(err);
  }
});

router.get('/queue/:queueId', (req, res: Response) => {
  const records = getEnrollmentsByQueue(req.params.queueId);
  res.json(records);
});

router.get('/:identity', (req, res: Response) => {
  const record = getEnrollmentsByIdentity(req.params.identity);
  if (!record || record.length === 0) return res.status(404).json({ message: 'No enrollments found' });
  res.json(record);
});

export default router;
