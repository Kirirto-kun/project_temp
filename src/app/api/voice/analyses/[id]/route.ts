import { readContext } from '@/server/api-context';
import { json, route } from '@/server/http';
import { getAnalysis } from '@/server/voice/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const maxDuration = 120;

export const GET = route<{ id: string }>('voice.analysis', async (request, { params }) => {
  const { deps, visitor } = readContext(request);
  return json(await getAnalysis(deps, visitor.ownerId, params.id), { headers: visitor.headers });
});
