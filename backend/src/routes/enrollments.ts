import { Router, type IRouter, Request, Response } from 'express';
import { z } from 'zod';
import { enrollIdentity, cancelEnrollment, getEnrollmentsByIdentity, getEnrollmentsByQueue } from '../services/enrollmentService.js';
import { recordEnrollment } from '../metrics/registry.js';
import { validateStellarAddress } from '../middleware/validateStellarAddress.js';
import { StellarAddress } from '../schemas/stellar.js';

const router: IRouter = Router();

const EnrollSchema = z.object({
  queueId: z.string().min(1),
  identity: StellarAddress,
});

const CancelSchema = z.object({
  queueId: z.string().min(1),
  identity: StellarAddress,
});

type EnrollInput = z.infer<typeof EnrollSchema>;
type CancelInput = z.infer<typeof CancelSchema>;

router.post('/enroll', validateStellarAddress(['identity']), (req: Request<{}, {}, EnrollInput>, res: Response, next): void => {
  const parsed = EnrollSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid request', issues: parsed.error.issues });
    return;
  }

  try {
    const result = enrollIdentity(parsed.data.queueId, parsed.data.identity);
    if (result.conflict) {
      res.status(409).json({ message: 'Duplicate enrollment blocked' });
      return;
    }
    recordEnrollment(result.queueId);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/cancel', validateStellarAddress(['identity']), (req: Request<{}, {}, CancelInput>, res: Response, next): void => {
  const parsed = CancelSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid request', issues: parsed.error.issues });
    return;
  }

  try {
    const ok = cancelEnrollment(parsed.data.queueId, parsed.data.identity);
    if (!ok) {
      res.status(404).json({ message: 'Enrollment not found' });
      return;
    }
    res.status(200).json({ message: 'Enrollment cancelled' });
  } catch (err) {
    next(err);
  }
});

router.get('/queue/:queueId', (req: Request<{ queueId: string }>, res: Response): void => {
  const records = getEnrollmentsByQueue(req.params.queueId);
  res.json(records);
});

router.get('/:identity', (req: Request<{ identity: string }>, res: Response): Response | void => {
  const addressResult = StellarAddress.safeParse(req.params.identity);
  if (!addressResult.success) {
    return res.status(400).json({ message: 'Invalid Stellar address in path' });
  }

  const record = getEnrollmentsByIdentity(addressResult.data);
  if (!record || record.length === 0) return res.status(404).json({ message: 'No enrollments found' });
  return res.json(record);
});

export default router;
