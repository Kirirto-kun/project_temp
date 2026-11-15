import { mutationContext } from '@/server/api-context';
import { json, readBody, route } from '@/server/http';
import { RoundVideoStopSchema, stopRoundVideo } from '@/server/session/video';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route<{ id: string }>('session.video.stop', async (request, { params }) => {
  const { deps, visitor } = mutationContext(request);
  const body = await readBody(request, RoundVideoStopSchema);
  return json(await stopRoundVideo(deps, visitor.ownerId, params.id, body.providerEpoch), { headers: visitor.headers });
});
