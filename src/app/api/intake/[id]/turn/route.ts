import { videoTurn, VideoTurnSchema } from '@/onboarding/server/service';
import { mutationContext } from '@/server/api-context';
import { json, readBody, route } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route<{ id: string }>('intake.turn', async (request, { params }) => {
  const { deps, visitor } = mutationContext(request);
  const body = await readBody(request, VideoTurnSchema);
  return json(await videoTurn(deps, visitor.ownerId, params.id, body), { headers: visitor.headers });
});
