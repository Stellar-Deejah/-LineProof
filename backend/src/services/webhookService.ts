import { z } from 'zod';
import { defaultMemoryAdapter } from '../storage/index.js';
import crypto from 'crypto';

export const WebhookConfigSchema = z.object({
  url: z.string().url(),
  secret: z.string().min(8).max(128),
  events: z.array(z.string()).min(1),
});

export type WebhookConfig = {
  id: string;
  url: string;
  secret: string;
  events: string[];
  createdAt: string;
};

const store = defaultMemoryAdapter;
const NS = 'webhooks';

export const registerWebhook = (payload: {
  url: string;
  secret: string;
  events: string[];
}): WebhookConfig => {
  const id = crypto.randomUUID();
  const config: WebhookConfig = {
    id,
    url: payload.url,
    secret: payload.secret,
    events: payload.events,
    createdAt: new Date().toISOString(),
  };
  store.set<WebhookConfig>(NS, id, config);
  return config;
};

export const listWebhooks = (): WebhookConfig[] => {
  return store.list<WebhookConfig>(NS);
};

export const getWebhookById = (id: string): WebhookConfig | undefined => {
  return store.get<WebhookConfig>(NS, id);
};

export const deleteWebhook = (id: string): boolean => {
  return store.delete(NS, id);
};
