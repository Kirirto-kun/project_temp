import { z } from 'zod';
import { updateConsent } from '@/onboarding/server/service';
import { mutationContext } from '@/server/api-context';
import { json, readBody, route } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route<{ id: string }>('intake.consent', async (request, { params }) => {
  const { deps, visitor } = mutationContext(request);
  const body = await readBody(request, z.object({ consents: z.object({ audioAnalysis: z.boolean() }), expectedRevision: z.number().int().nullable().default(null) }));
  return json({ intake: await updateConsent(deps, visitor.ownerId, params.id, body.consents, body.expectedRevision) }, { headers: visitor.headers });
});
