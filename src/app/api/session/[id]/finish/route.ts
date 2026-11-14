import { FinishRequestSchema } from '@/contracts/api';
import { mutationContext } from '@/server/api-context';
import { json, readBody, route } from '@/server/http';
import { finishSessionByUser } from '@/server/session/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route<{ id: string }>('session.finish', async (request, { params }) => {
  const { deps, visitor } = mutationContext(request);
  const body = await readBody(request, FinishRequestSchema);
  const session = await finishSessionByUser(deps, params.id, visitor.ownerId, body.expectedVersion);
  return json({ session }, { headers: visitor.headers });
});
