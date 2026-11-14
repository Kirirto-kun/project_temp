import { getAssessment } from '@/onboarding/server/service';
import { readContext } from '@/server/api-context';
import { json, route } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route<{ id: string }>('intake.assessment', async (request, { params }) => {
  const { deps, visitor } = readContext(request);
  return json({ assessment: await getAssessment(deps, visitor.ownerId, params.id) }, { headers: visitor.headers });
});
