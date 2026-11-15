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
  const body = await readBody(request, CheckoutRequestSchema);
  const polar = serverEnv().polar;
  if (!polar) throw new ApiError('FEATURE_DISABLED', 'Payments are not enabled.');
  const productId = polar.products[body.plan];
  if (!productId) throw new ApiError('FEATURE_DISABLED', 'This plan cannot be bought here yet.');
  return json(await createCheckout(deps, visitor.ownerId, visitor.ipHash, productId), { status: 201, headers: visitor.headers });
});
