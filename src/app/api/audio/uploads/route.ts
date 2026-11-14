import { AudioUploadRequestSchema } from '@/contracts/api';
import { mutationContext } from '@/server/api-context';
import { json, readBody, route } from '@/server/http';
import { createAudioUpload } from '@/server/voice/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route('audio.upload', async (request) => {
  const { deps, visitor } = mutationContext(request);
  const body = await readBody(request, AudioUploadRequestSchema);
  const upload = await createAudioUpload(deps, visitor.ownerId, visitor.ipHash, body);
  return json(upload, { status: 201, headers: visitor.headers });
});
