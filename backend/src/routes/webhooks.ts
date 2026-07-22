import { Router, type IRouter, Request, Response } from 'express';
import { registerWebhook, listWebhooks, deleteWebhook, WebhookConfigSchema } from '../services/webhookService.js';
import { requireOperatorAuth } from '../middleware/operatorAuth.js';

const router: IRouter = Router();

// Gated routes for managing webhook subscriptions
router.use(requireOperatorAuth);

router.post('/', (req: Request, res: Response): Response => {
  const parsed = WebhookConfigSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid request', issues: parsed.error.issues });
  }
  const config = registerWebhook(parsed.data);
  return res.status(201).json(config);
});

router.get('/', (req: Request, res: Response): Response => {
  const configs = listWebhooks();
  return res.json(configs);
});

router.delete('/:id', (req: Request<{ id: string }>, res: Response): Response => {
  const success = deleteWebhook(req.params.id);
  if (!success) {
    return res.status(404).json({ message: 'Webhook not found' });
  }
  return res.json({ message: 'Webhook deleted' });
});

export default router;
