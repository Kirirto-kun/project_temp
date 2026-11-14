import { skipPractice } from '@/onboarding/server/service';
import { mutationContext } from '@/server/api-context';
import { json, route } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route<{ id: string }>('intake.skip_practice', async (request, { params }) => {
  const { deps, visitor } = mutationContext(request);
  return json({ intake: await skipPractice(deps, visitor.ownerId, params.id) }, { headers: visitor.headers });
});
