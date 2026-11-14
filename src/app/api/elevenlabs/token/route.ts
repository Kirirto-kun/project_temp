import { ElevenLabsTokenRequestSchema } from '@/contracts/api';
import { mutationContext } from '@/server/api-context';
import { issueVoiceCredentials } from '@/server/elevenlabs/bindings';
import { serverEnv } from '@/server/env';
import { json, readBody, route } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route('elevenlabs.token', async (request) => {
  const { deps, visitor } = mutationContext(request);
  const body = await readBody(request, ElevenLabsTokenRequestSchema);
  const response = await issueVoiceCredentials(deps, {
    ownerId: visitor.ownerId,
    ipHash: visitor.ipHash,
    sessionId: body.sessionId,
    connectionType: body.connectionType,
    voiceMap: serverEnv().elevenlabs?.voiceMap ?? {},
  });
  return json(response, { headers: visitor.headers });
});
