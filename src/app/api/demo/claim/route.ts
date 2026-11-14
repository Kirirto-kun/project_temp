import { z } from 'zod';
import { mutationContext } from '@/server/api-context';
import { serverEnv } from '@/server/env';
import { ApiError, json, readBody, route } from '@/server/http';
import { safeEqual } from '@/server/ids';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Private jury pool: a shared token lets this browser draw from a separate daily pool. */
export const POST = route('demo.claim', async (request) => {
  const { deps, visitor } = mutationContext(request);
  const pool = serverEnv().demoPool;
  const body = await readBody(request, z.object({ token: z.string().min(1).max(200) }));
  if (!pool || !safeEqual(body.token, pool.token)) throw new ApiError('NOT_FOUND', 'This code is not valid.');
  await deps.kv.set(`demo:${visitor.ownerId}`, '1', { ttlSeconds: 2 * 86_400 });
  return json({ ok: true }, { headers: visitor.headers });
});
