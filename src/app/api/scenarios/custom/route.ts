import { CustomScenarioRequestSchema } from '@/contracts/api';
import { createCustomScenario, CustomScenarioError } from '@/intelligence';
import { mutationContext } from '@/server/api-context';
import { ApiError, idempotencyKey, json, readBody, route } from '@/server/http';
import { newId } from '@/server/ids';
import { reserveCredit } from '@/server/payments/entitlements';
import { readJson } from '@/server/storage/kv';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const maxDuration = 60;

export const POST = route('scenarios.custom', async (request) => {
  const { deps, visitor } = mutationContext(request);
  if (!deps.capabilities.customScenario) throw new ApiError('FEATURE_DISABLED', 'Custom scenarios are not available.');
  const key = idempotencyKey(request)!;
  const body = await readBody(request, CustomScenarioRequestSchema, 16 * 1024);
  const idem = `idem:custom:${visitor.ownerId}:${key}`;
  const previous = await readJson<{ scenarioId: string }>(deps.kv, idem);
  if (previous) return json(previous, { status: 201, headers: visitor.headers });
  await deps.quota.consume('custom', visitor.ipHash, visitor.ownerId);
  const credit = await reserveCredit(deps, visitor.ownerId, 'customScenariosRemaining');
  try {
    const config = await createCustomScenario(body.quiz, body.description, deps.models, request.signal);
    const scenarioId = newId('cus');
    await deps.kv.set(`cust:${scenarioId}`, JSON.stringify({ ownerId: visitor.ownerId, config }), { ttlSeconds: 7 * 86_400 });
    await deps.kv.set(idem, JSON.stringify({ scenarioId }), { ttlSeconds: 86_400 });
    return json({ scenarioId }, { status: 201, headers: visitor.headers });
  } catch (error) {
    await credit.restore();
    if (error instanceof CustomScenarioError) {
      throw new ApiError(error.code === 'unavailable' ? 'UPSTREAM_UNAVAILABLE' : 'INVALID_INPUT', error.message);
    }
    throw error;
  }
});
