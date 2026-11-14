import { patchProfile, ProfilePatchRequestSchema } from '@/onboarding/server/service';
import { mutationContext } from '@/server/api-context';
import { json, readBody, route } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const PATCH = route<{ id: string }>('intake.profile', async (request, { params }) => {
  const { deps, visitor } = mutationContext(request);
  const body = await readBody(request, ProfilePatchRequestSchema);
  return json({ intake: await patchProfile(deps, visitor.ownerId, params.id, body.expectedRevision, body.corrections) }, { headers: visitor.headers });
});
