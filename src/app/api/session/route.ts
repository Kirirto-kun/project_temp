import { CreateSessionRequestSchema } from '@/contracts/api';
import { mutationContext } from '@/server/api-context';
import { idempotencyKey, json, readBody, route } from '@/server/http';
import { createSession } from '@/server/session/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route('session.create', async (request) => {
  const { deps, visitor } = mutationContext(request);
  const body = await readBody(request, CreateSessionRequestSchema);
  const session = await createSession(deps, body, { ownerId: visitor.ownerId, ipHash: visitor.ipHash, idempotencyKey: idempotencyKey(request) });
  return json({ session }, { status: 201, headers: visitor.headers });
});
