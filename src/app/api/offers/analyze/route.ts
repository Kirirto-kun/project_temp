import { OfferAnalyzeRequestSchema } from '@/contracts/api';
import { analyzeOffer } from '@/intelligence';
import { mutationContext } from '@/server/api-context';
import { ApiError, idempotencyKey, json, readBody, route } from '@/server/http';
import { reserveCredit } from '@/server/payments/entitlements';
import { readJson } from '@/server/storage/kv';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const maxDuration = 60;

export const POST = route('offers.analyze', async (request) => {
  const { deps, visitor } = mutationContext(request);
  if (!deps.capabilities.offerAnalysis) throw new ApiError('FEATURE_DISABLED', 'Offer analysis is not available.');
  const key = idempotencyKey(request)!;
  const body = await readBody(request, OfferAnalyzeRequestSchema, 64 * 1024);
  const idem = `idem:offer:${visitor.ownerId}:${key}`;
  const previous = await readJson<{ analysis: unknown }>(deps.kv, idem);
  if (previous) return json(previous, { headers: visitor.headers });
  await deps.quota.consume('offer', visitor.ipHash, visitor.ownerId);
  const credit = await reserveCredit(deps, visitor.ownerId, 'offerAnalysesRemaining');
  try {
    const analysis = await analyzeOffer(body, deps.models, request.signal);
    await deps.kv.set(idem, JSON.stringify({ analysis }), { ttlSeconds: 86_400 });
    return json({ analysis }, { headers: visitor.headers });
  } catch (error) {
    await credit.restore();
    throw error;
  }
});
