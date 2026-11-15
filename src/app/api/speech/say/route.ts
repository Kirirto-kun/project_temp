import { SpeakRequestSchema } from '@/contracts/api';
import { mutationContext } from '@/server/api-context';
import { NO_STORE, readBody, route } from '@/server/http';
import { speakLine } from '@/server/speech/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const maxDuration = 30;

/** MP3 of one of the other side's lines, looked up server-side. Never speaks client-supplied text. */
export const POST = route('speech.say', async (request) => {
  const { deps, visitor } = mutationContext(request);
  const body = await readBody(request, SpeakRequestSchema, 2 * 1024);
  const audio = await speakLine(deps, visitor.ownerId, visitor.ipHash, body, request.signal);
  return new Response(audio, {
    status: 200,
    headers: {
      ...NO_STORE,
      'Content-Type': 'audio/mpeg',
      'X-Content-Type-Options': 'nosniff',
      ...visitor.headers,
    },
  });
});
