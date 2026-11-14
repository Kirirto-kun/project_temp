import { confirmProfile, ConfirmRequestSchema } from '@/onboarding/server/service';
import { mutationContext } from '@/server/api-context';
import { json, readBody, route } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route<{ id: string }>('intake.confirm', async (request, { params }) => {
  const { deps, visitor } = mutationContext(request);
  const body = await readBody(request, ConfirmRequestSchema);
  const intake = await confirmProfile(deps, visitor.ownerId, params.id, body.expectedRevision, body.confirmedFields);
  return json({ intake, handoff: intake.handoff }, { headers: visitor.headers });
});
