import { z } from 'zod';
import { submitPracticeAudio } from '@/onboarding/server/service';
import { mutationContext } from '@/server/api-context';
import { json, readBody, route } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const maxDuration = 60;

export const POST = route<{ id: string }>('intake.practice', async (request, { params }) => {
  const { deps, visitor } = mutationContext(request);
  const body = await readBody(request, z.object({ audioId: z.string().min(1), turnId: z.string().min(4).max(80) }));
  return json({ intake: await submitPracticeAudio(deps, visitor.ownerId, params.id, body) }, { headers: visitor.headers });
});
