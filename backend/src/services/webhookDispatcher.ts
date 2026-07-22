import { serviceEmitter } from './eventEmitter.js';
import { listWebhooks } from './webhookService.js';
import crypto from 'crypto';

export let BACKOFF_BASE_DELAY = 1000;

export async function sendWithRetry(
  url: string,
  bodyStr: string,
  signature: string,
  attempt = 1
): Promise<void> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-LineProof-Signature': signature,
      },
      body: bodyStr,
    });
    
    if (res.status >= 200 && res.status < 300) {
      return;
    }
    throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    if (attempt >= 4) { // Retry up to 3 times (total 4 attempts)
      throw err;
    }
    const delay = BACKOFF_BASE_DELAY * Math.pow(2, attempt - 1);
    await new Promise((resolve) => setTimeout(resolve, delay));
    return sendWithRetry(url, bodyStr, signature, attempt + 1);
  }
}

let isStarted = false;

export function startWebhookDispatcher() {
  if (isStarted) return;
  isStarted = true;

  const eventTypes = [
    'queue.created',
    'queue.status_changed',
    'queue.advanced',
    'enrollment.created',
    'enrollment.cancelled',
    'escrow.deposited',
    'escrow.released',
    'escrow.refunded',
    'escrow.expired',
  ];

  for (const type of eventTypes) {
    serviceEmitter.on(type, (payload) => {
      const webhooks = listWebhooks();
      const matching = webhooks.filter(
        (wh) => wh.events.includes(type) || wh.events.includes('*')
      );

      for (const wh of matching) {
        const webhookPayload = {
          id: crypto.randomUUID(),
          event: type,
          created: new Date().toISOString(),
          data: payload,
        };
        const bodyStr = JSON.stringify(webhookPayload);
        const hmac = crypto.createHmac('sha256', wh.secret);
        hmac.update(bodyStr);
        const signature = `sha256=${hmac.digest('hex')}`;

        // Fire and forget, logging any final delivery errors
        sendWithRetry(wh.url, bodyStr, signature).catch((err) => {
          console.error(`Failed to deliver webhook to ${wh.url}: ${err.message}`);
        });
      }
    });
  }
}
