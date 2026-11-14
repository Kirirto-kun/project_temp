import { BaselineRequestSchema } from '@/contracts/api';
import { mutationContext } from '@/server/api-context';
import { json, readBody, route } from '@/server/http';
import { createBaseline } from '@/server/voice/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const maxDuration = 60;

export const POST = route('voice.baseline', async (request) => {
  const { deps, visitor } = mutationContext(request);
  const body = await readBody(request, BaselineRequestSchema);
  const baseline = await createBaseline(deps, visitor.ownerId, visitor.ipHash, body.audioId);
  return json({ baseline }, { headers: visitor.headers });
});
