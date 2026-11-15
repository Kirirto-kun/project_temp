import { z } from 'zod';
import { createIntake } from '@/onboarding/server/service';
import { mutationContext } from '@/server/api-context';
import { idempotencyKey, json, readBody, route } from '@/server/http';
import { readJson } from '@/server/storage/kv';
import { getIntake } from '@/onboarding/server/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CreateSchema = z.object({
  mode: z.enum(['text', 'audio', 'video']),
  locale: z.literal('en').default('en'),
  consents: z.object({ audioAnalysis: z.boolean(), visualAnalysis: z.literal(false).default(false) }),
  consentVersion: z.number().int().min(1),
});

export const POST = route('intake.create', async (request) => {
  const { deps, visitor } = mutationContext(request);
  const key = idempotencyKey(request)!;
  const body = await readBody(request, CreateSchema);
  const idem = `idem:intake:${visitor.ownerId}:${key}`;
  const previous = await readJson<{ id: string }>(deps.kv, idem);
  if (previous) return json({ intake: await getIntake(deps, visitor.ownerId, previous.id) }, { status: 201, headers: visitor.headers });
  const intake = await createIntake(deps, visitor.ownerId, body);
  await deps.kv.set(idem, JSON.stringify({ id: intake.id }), { ttlSeconds: 86_400 });
  return json({ intake }, { status: 201, headers: visitor.headers });
});
