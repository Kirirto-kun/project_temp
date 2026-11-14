import { DebriefRequestSchema } from '@/contracts/api';
import { mutationContext } from '@/server/api-context';
import { json, readBody, route } from '@/server/http';
import { getDebrief, loadOwnedSession } from '@/server/session/service';
import { getAnalysis } from '@/server/voice/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route('debrief', async (request) => {
  const { deps, visitor } = mutationContext(request);
  const body = await readBody(request, DebriefRequestSchema);
  const debrief = await getDebrief(deps, body.sessionId, visitor.ownerId);
  if (debrief.voice.status === 'pending') {
    // Re-drive a stalled analysis job; the money part is already complete.
    const session = await loadOwnedSession(deps, body.sessionId, visitor.ownerId);
    if (session.analysisId) await getAnalysis(deps, visitor.ownerId, session.analysisId).catch(() => undefined);
  }
  return json({ debrief }, { headers: visitor.headers });
});
