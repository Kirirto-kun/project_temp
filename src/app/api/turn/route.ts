import { TurnRequestSchema } from '@/contracts/api';
import { mutationContext } from '@/server/api-context';
import { ApiError, idempotencyKey, json, readBody, route } from '@/server/http';
import { processTurn } from '@/server/session/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route('turn', async (request) => {
  const { deps, visitor } = mutationContext(request);
  const body = await readBody(request, TurnRequestSchema);
  const key = idempotencyKey(request);
  if (key !== body.turnId) throw new ApiError('INVALID_INPUT', 'Idempotency-Key must equal turnId.');
  const result = await processTurn(
    deps,
    { sessionId: body.sessionId, turnId: body.turnId, expectedVersion: body.expectedVersion, text: body.text, mode: 'text', sourceTurnKey: null },
    visitor.ownerId,
    request.signal,
  );
  return json({ session: result.session, committedTurnId: result.committedTurnId }, { headers: visitor.headers });
});
