import 'server-only';
import { z } from 'zod';
import { ApiError } from '../http';
import { sha256 } from '../ids';
import { logEvent } from '../observability';
import type { PlatformDeps } from '../platform';
import { processTurn } from '../session/service';
import { sessionRepo } from '../session/service';
import { SessionBindingSchema, verifyBindingSignature } from './bindings';
import { chunkReply, sseChunk, SSE_DONE } from './sse';

const ContentSchema = z.union([z.string(), z.array(z.object({ type: z.string(), text: z.string().optional() }).passthrough())]);
const ChatRequestSchema = z
  .object({
    messages: z.array(z.object({ role: z.string(), content: ContentSchema.nullable().optional() }).passthrough()).max(400),
    stream: z.boolean().optional(),
    elevenlabs_extra_body: z.object({ binding: SessionBindingSchema }).passthrough().optional(),
  })
  .passthrough();

export type ChatRequest = z.infer<typeof ChatRequestSchema>;

function contentText(content: z.infer<typeof ContentSchema> | null | undefined): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  return content.map((part) => part.text ?? '').join(' ');
}

/**
 * The final user utterance and its ordinal among user messages. The ordinal under the
 * current binding is a stable identity: a retried callback carries the same message list,
 * while repeating the same words on a later turn yields a new ordinal.
 */
export function lastUserTurn(request: ChatRequest): { text: string; ordinal: number } | null {
  const users = request.messages.filter((m) => m.role === 'user');
  const last = users.at(-1);
  if (!last) return null;
  const text = contentText(last.content).trim();
  return text ? { text, ordinal: users.length } : null;
}

export function parseChatRequest(raw: unknown): ChatRequest {
  return ChatRequestSchema.parse(raw);
}

export interface CompletionOutcome {
  text: string;
  committed: boolean;
}

/**
 * Resolves the agent callback into a checked reply. Only a final user message under the
 * active binding moves the engine; greetings and stale connections get neutral lines.
 */
export async function resolveCompletion(deps: PlatformDeps, request: ChatRequest, signal?: AbortSignal): Promise<CompletionOutcome> {
  const binding = request.elevenlabs_extra_body?.binding;
  if (!binding || !verifyBindingSignature(deps.signingSecret, binding, deps.now())) {
    return { text: 'This practice connection has ended. Please return to the page to continue.', committed: false };
  }
  const session = await sessionRepo(deps).read(binding.sessionId);
  if (!session || session.voiceBindingId !== binding.bindingId || session.transportEpoch !== binding.epoch || session.activeMode !== 'voice') {
    return { text: 'This practice connection has ended. Please return to the page to continue.', committed: false };
  }
  if (session.state.ended) return { text: 'We are done for this round. Your debrief is ready on the page.', committed: false };
  const turn = lastUserTurn(request);
  if (!turn) return { text: session.turns.length === 0 ? session.openingLine : 'Go ahead.', committed: false };
  const sourceTurnKey = `${binding.bindingId}:${turn.ordinal}`;
  try {
    const result = await processTurn(
      deps,
      { sessionId: session.id, turnId: `vt_${sha256(sourceTurnKey).slice(0, 24)}`, expectedVersion: null, text: turn.text, mode: 'voice', sourceTurnKey, bindingId: binding.bindingId },
      null,
      signal,
    );
    return { text: result.replyText, committed: true };
  } catch (error) {
    if (error instanceof ApiError && error.code === 'TURN_IN_PROGRESS') return { text: 'One moment.', committed: false };
    if (error instanceof ApiError && error.code === 'SESSION_ENDED') return { text: 'We are done for this round. Your debrief is ready on the page.', committed: false };
    logEvent('warn', 'voice_turn_failed', { code: error instanceof ApiError ? error.code : 'unknown' });
    return { text: 'Sorry, could you say that again?', committed: false };
  }
}

/** Streams a short buffer word immediately, then the checked reply in sentence chunks. */
export function completionStream(deps: PlatformDeps, request: ChatRequest, signal?: AbortSignal): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const id = `chatcmpl-${Date.now().toString(36)}`;
  const created = Math.floor(deps.now().getTime() / 1_000);
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (s: string) => controller.enqueue(encoder.encode(s));
      try {
        const hasUserTurn = lastUserTurn(request) !== null;
        if (hasUserTurn) send(sseChunk(id, created, 'Hm… '));
        const outcome = await resolveCompletion(deps, request, signal);
        for (const piece of chunkReply(outcome.text)) send(sseChunk(id, created, piece));
        send(sseChunk(id, created, null, 'stop'));
        send(SSE_DONE);
      } catch {
        send(sseChunk(id, created, 'Sorry, could you say that again?'));
        send(sseChunk(id, created, null, 'stop'));
        send(SSE_DONE);
      } finally {
        controller.close();
      }
    },
  });
}
