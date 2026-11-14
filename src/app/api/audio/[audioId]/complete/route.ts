import { AudioCompleteRequestSchema } from '@/contracts/api';
import { mutationContext } from '@/server/api-context';
import { json, readBody, route } from '@/server/http';
import { completeAudioUpload } from '@/server/voice/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route<{ audioId: string }>('audio.complete', async (request, { params }) => {
  const { deps, visitor } = mutationContext(request);
  const body = await readBody(request, AudioCompleteRequestSchema, 2 * 1024 * 1024);
  return json(await completeAudioUpload(deps, visitor.ownerId, params.audioId, body.manifest), { headers: visitor.headers });
});
