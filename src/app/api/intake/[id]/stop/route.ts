import { z } from 'zod';
import { stopMedia } from '@/onboarding/server/service';
import { mutationContext } from '@/server/api-context';
import { json, readBody, route } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route<{ id: string }>('intake.stop', async (request, { params }) => {
  const { deps, visitor } = mutationContext(request);
  const body = await readBody(request, z.object({ reason: z.enum(['end', 'review', 'error', 'timeout', 'fallback', 'unload']).default('end') }));
  return json({ intake: await stopMedia(deps, visitor.ownerId, params.id, body.reason) }, { headers: visitor.headers });
});
