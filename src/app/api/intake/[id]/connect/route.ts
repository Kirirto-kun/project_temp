import { z } from 'zod';
import { connectAudio } from '@/onboarding/server/service';
import { mutationContext } from '@/server/api-context';
import { json, readBody, route } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route<{ id: string }>('intake.connect', async (request, { params }) => {
  const { deps, visitor } = mutationContext(request);
  const body = await readBody(request, z.object({ expectedRevision: z.number().int() }));
  return json(await connectAudio(deps, visitor.ownerId, visitor.ipHash, params.id, body.expectedRevision), { headers: visitor.headers });
});
