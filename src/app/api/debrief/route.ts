import { DebriefRequestSchema } from '@/contracts/api';
import { mutationContext } from '@/server/api-context';
import { json, readBody, route } from '@/server/http';
import { getDebrief } from '@/server/session/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route('debrief', async (request) => {
  const { deps, visitor } = mutationContext(request);
  const body = await readBody(request, DebriefRequestSchema);
  const debrief = await getDebrief(deps, body.sessionId, visitor.ownerId);
  return json({ debrief }, { headers: visitor.headers });
});
