import { ModeRequestSchema } from '@/contracts/api';
import { mutationContext } from '@/server/api-context';
import { json, readBody, route } from '@/server/http';
import { changeMode } from '@/server/session/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route<{ id: string }>('session.mode', async (request, { params }) => {
  const { deps, visitor } = mutationContext(request);
  const body = await readBody(request, ModeRequestSchema);
  const session = await changeMode(deps, params.id, visitor.ownerId, body.mode, body.expectedVersion);
  return json({ session }, { headers: visitor.headers });
});
