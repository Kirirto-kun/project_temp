import { deleteIntake, getIntake } from '@/onboarding/server/service';
import { mutationContext, readContext } from '@/server/api-context';
import { json, route } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route<{ id: string }>('intake.get', async (request, { params }) => {
  const { deps, visitor } = readContext(request);
  return json({ intake: await getIntake(deps, visitor.ownerId, params.id) }, { headers: visitor.headers });
});

export const DELETE = route<{ id: string }>('intake.delete', async (request, { params }) => {
  const { deps, visitor } = mutationContext(request);
  await deleteIntake(deps, visitor.ownerId, params.id);
  return json({ deleted: true }, { headers: visitor.headers });
});
