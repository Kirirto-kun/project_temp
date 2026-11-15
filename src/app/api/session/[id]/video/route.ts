import { mutationContext } from '@/server/api-context';
import { json, route } from '@/server/http';
import { connectRoundVideo } from '@/server/session/video';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route<{ id: string }>('session.video', async (request, { params }) => {
  const { deps, visitor } = mutationContext(request);
  return json(await connectRoundVideo(deps, visitor.ownerId, visitor.ipHash, params.id), { headers: visitor.headers });
});
