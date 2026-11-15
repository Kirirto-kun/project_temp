import { getDeps } from '@/server/dependencies';
import { serverEnv } from '@/server/env';
import { ApiError, json, route } from '@/server/http';
import { handlePolarWebhook } from '@/server/payments/entitlements';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Polar webhook: verified on the raw body; 2xx only after the event is durably recorded. */
export const POST = route('polar.webhook', async (request) => {
  const polar = serverEnv().polar;
  if (!polar) throw new ApiError('FEATURE_DISABLED', 'Payments are not enabled.');
  const raw = await request.text();
  const result = await handlePolarWebhook(
    getDeps(),
    raw,
    { id: request.headers.get('webhook-id'), timestamp: request.headers.get('webhook-timestamp'), signature: request.headers.get('webhook-signature') },
    polar.webhookSecret,
    Object.values(polar.products),
  );
  return json({ received: true, result }, { status: 202 });
});
