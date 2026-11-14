import { readContext } from '@/server/api-context';
import { json, route } from '@/server/http';
import { enforceDeadline, loadOwnedSession } from '@/server/session/service';
import { toSessionView } from '@/server/session/view';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route<{ id: string }>('session.get', async (request, { params }) => {
  const { deps, visitor } = readContext(request);
  const session = await enforceDeadline(deps, await loadOwnedSession(deps, params.id, visitor.ownerId));
  return json({ session: toSessionView(session) }, { headers: visitor.headers });
});
