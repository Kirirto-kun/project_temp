import { CheckoutRequestSchema } from '@/contracts/api';
import { mutationContext } from '@/server/api-context';
import { serverEnv } from '@/server/env';
import { ApiError, idempotencyKey, json, readBody, route } from '@/server/http';
import { createCheckout } from '@/server/payments/entitlements';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route('polar.checkout', async (request) => {
  const { deps, visitor } = mutationContext(request);
  idempotencyKey(request);
  await readBody(request, CheckoutRequestSchema);
  const polar = serverEnv().polar;
  if (!polar) throw new ApiError('FEATURE_DISABLED', 'Payments are not enabled.');
  return json(await createCheckout(deps, visitor.ownerId, visitor.ipHash, polar.productId), { status: 201, headers: visitor.headers });
});
