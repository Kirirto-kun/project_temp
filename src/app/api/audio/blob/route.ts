import { VOICE_CONSTANTS } from '@/contracts/voice';
import { getDeps, memoryUploadToken } from '@/server/dependencies';
import { ApiError, json, route } from '@/server/http';
import { safeEqual } from '@/server/ids';
import { MemoryAudioStore } from '@/server/voice/audio-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Upload target for the in-memory audio store (development and single-process demos only). */
export const PUT = route('audio.blob', async (request) => {
  const deps = getDeps();
  if (!(deps.audio instanceof MemoryAudioStore)) throw new ApiError('NOT_FOUND', 'Not found.');
  const url = new URL(request.url);
  const key = url.searchParams.get('key') ?? '';
  const token = url.searchParams.get('token') ?? '';
  if (!/^audio\/(baseline|session|intake)\/aud_[\w-]{22}$/.test(key) || !safeEqual(token, memoryUploadToken(deps.signingSecret, key))) {
    throw new ApiError('UNAUTHORIZED', 'Invalid upload token.');
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > VOICE_CONSTANTS.maxUploadBytes) throw new ApiError('UPLOAD_TOO_LARGE', 'Recordings are limited to 20 MiB.');
  deps.audio.put(key, bytes);
  return json({ ok: true });
});
