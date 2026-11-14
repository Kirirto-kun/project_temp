import { z } from 'zod';
import { connectAudio, connectVideo } from '@/onboarding/server/service';
import { mutationContext } from '@/server/api-context';
import { json, readBody, route } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route<{ id: string }>('intake.connect', async (request, { params }) => {
  const { deps, visitor } = mutationContext(request);
  const body = await readBody(request, z.object({ expectedRevision: z.number().int(), mode: z.enum(['audio', 'video']).default('audio') }));
  const connect = body.mode === 'video' ? connectVideo : connectAudio;
  return json(await connect(deps, visitor.ownerId, visitor.ipHash, params.id, body.expectedRevision), { headers: visitor.headers });
});
