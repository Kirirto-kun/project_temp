import { ReplayRequestSchema } from '@/contracts/api';
import { mutationContext } from '@/server/api-context';
import { idempotencyKey, json, readBody, route } from '@/server/http';
import { replaySession } from '@/server/session/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route<{ id: string }>('session.replay', async (request, { params }) => {
  const { deps, visitor } = mutationContext(request);
  const body = await readBody(request, ReplayRequestSchema);
  const session = await replaySession(deps, params.id, { ownerId: visitor.ownerId, ipHash: visitor.ipHash, idempotencyKey: idempotencyKey(request) }, body.baselineId);
  return json({ session }, { status: 201, headers: visitor.headers });
});
