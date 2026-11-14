import { z } from 'zod';
import { postMessage } from '@/onboarding/server/service';
import { mutationContext } from '@/server/api-context';
import { json, readBody, route } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route<{ id: string }>('intake.message', async (request, { params }) => {
  const { deps, visitor } = mutationContext(request);
  const body = await readBody(request, z.object({ turnId: z.string().min(8).max(80), text: z.string().trim().min(1).max(2_000), practice: z.boolean().optional() }));
  return json({ intake: await postMessage(deps, visitor.ownerId, visitor.ipHash, params.id, body) }, { headers: visitor.headers });
});
