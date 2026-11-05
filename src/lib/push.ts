import { z } from 'zod';
import { allowedPushEndpoint } from './push-endpoint';
export { allowedPushEndpoint } from './push-endpoint';
export const pushSubscriptionSchema = z.object({
  endpoint: z.string().max(4096).refine(allowedPushEndpoint),
  keys: z.object({
    p256dh: z.string().regex(/^[A-Za-z0-9_-]{87}$/),
    auth: z.string().regex(/^[A-Za-z0-9_-]{22}$/),
  }),
});
