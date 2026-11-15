import { SPEECH_LIMITS, SpeechContextSchema } from '@/contracts/api';
import { mutationContext } from '@/server/api-context';
import { ApiError, json, route } from '@/server/http';
import { speechContextFromUrl, transcribeClip } from '@/server/speech/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const maxDuration = 60;

/** Reads the raw clip without ever holding more than the limit in memory. */
async function readClip(request: Request): Promise<Uint8Array> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > SPEECH_LIMITS.maxClipBytes) throw new ApiError('UPLOAD_TOO_LARGE', `Keep a dictated reply under ${SPEECH_LIMITS.maxClipSeconds} seconds.`);
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > SPEECH_LIMITS.maxClipBytes) {
      await reader.cancel();
      throw new ApiError('UPLOAD_TOO_LARGE', `Keep a dictated reply under ${SPEECH_LIMITS.maxClipSeconds} seconds.`);
    }
    chunks.push(value);
  }
  const clip = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    clip.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return clip;
}

/** POST raw audio (Content-Type audio/*) with ?kind=intake&id=… or ?kind=round&sessionId=…; returns { text }. */
export const POST = route('speech.transcribe', async (request) => {
  const { deps, visitor } = mutationContext(request);
  const context = SpeechContextSchema.parse(speechContextFromUrl(request.url));
  const mimeType = request.headers.get('content-type') ?? '';
  const audio = await readClip(request);
  const result = await transcribeClip(deps, visitor.ownerId, visitor.ipHash, { context, audio, mimeType }, request.signal);
  return json(result, { headers: visitor.headers });
});
