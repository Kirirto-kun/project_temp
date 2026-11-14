import { completionStream, parseChatRequest, resolveCompletion } from '@/server/elevenlabs/custom-llm';
import { SSE_HEADERS } from '@/server/elevenlabs/sse';
import { getDeps } from '@/server/dependencies';
import { serverEnv } from '@/server/env';
import { ApiError, json, route } from '@/server/http';
import { safeEqual } from '@/server/ids';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const maxDuration = 30;

/** OpenAI-compatible endpoint called by the ElevenLabs agent (custom LLM). Service auth only. */
export const POST = route('llm.completions', async (request) => {
  const secret = serverEnv().elevenlabs?.customLlmSecret;
  const auth = request.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!secret || !token || !safeEqual(token, secret)) throw new ApiError('UNAUTHORIZED', 'Invalid service credentials.');
  const deps = getDeps();
  const text = await request.text();
  if (text.length > 512 * 1024) throw new ApiError('UPLOAD_TOO_LARGE', 'Request is too large.');
  const body = parseChatRequest(JSON.parse(text || '{}'));
  if (body.stream === false) {
    const outcome = await resolveCompletion(deps, body, request.signal);
    return json({
      id: `chatcmpl-${Date.now().toString(36)}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: 'holdline-engine',
      choices: [{ index: 0, message: { role: 'assistant', content: outcome.text }, finish_reason: 'stop' }],
    });
  }
  return new Response(completionStream(deps, body, request.signal), { headers: SSE_HEADERS });
});
