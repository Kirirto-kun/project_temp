import 'server-only';
import { SPEECH_LIMITS, type SpeakRequest, type SpeechContext } from '@/contracts/api';
import { intakeStore } from '@/onboarding/server/service';
import { ApiError } from '../http';
import { COST_ESTIMATES } from '../limits/budget';
import { logEvent } from '../observability';
import type { PlatformDeps } from '../platform';
import { loadOwnedSession } from '../session/service';
import { toSessionView } from '../session/view';
import type { SpeechClients } from './clients';

const CLIP_TYPES = new Set(['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/aac', 'audio/mpeg', 'audio/wav', 'audio/x-wav']);

function speechClients(deps: PlatformDeps, capability: 'speechInput' | 'speechOutput'): SpeechClients {
  if (!deps.capabilities[capability] || !deps.speech) {
    throw new ApiError(
      'FEATURE_DISABLED',
      capability === 'speechInput' ? 'Dictation is not available here. Type your reply instead.' : 'Reading replies aloud is not available here.',
    );
  }
  return deps.speech;
}

/** Cuts a long line to the read-aloud limit, at a sentence end where one is close. */
export function clipForSpeech(text: string, max: number = SPEECH_LIMITS.maxSpokenChars): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const head = clean.slice(0, max);
  const stop = Math.max(head.lastIndexOf('. '), head.lastIndexOf('? '), head.lastIndexOf('! '));
  return stop >= max / 2 ? head.slice(0, stop + 1) : `${head.slice(0, head.lastIndexOf(' ') > 0 ? head.lastIndexOf(' ') : max).trimEnd()}…`;
}

/** The other side's line, read from our own store with the owner check. User lines are refused. */
async function ownedLine(deps: PlatformDeps, ownerId: string, request: SpeakRequest): Promise<{ text: string; voiceKey: string }> {
  if (request.kind === 'intake') {
    const intake = await intakeStore(deps).readOwned(request.id, ownerId);
    const line = intake.transcript.find((t) => t.turnId === request.turnId && t.role === 'coach');
    if (!line?.text.trim()) throw new ApiError('NOT_FOUND', 'That line is not in this conversation.');
    return { text: line.text, voiceKey: 'coach' };
  }
  const session = await loadOwnedSession(deps, request.sessionId, ownerId);
  const line = toSessionView(session).messages.find((m) => m.id === request.messageId && m.role === 'counterpart');
  if (!line?.text.trim()) throw new ApiError('NOT_FOUND', 'That line is not in this round.');
  return {
    text: line.text,
    voiceKey: session.scenarioSnapshot.persona.voiceKey,
  };
}

/** Speech for one of the other side's lines. Charged per IP and against the daily budget. */
export async function speakLine(deps: PlatformDeps, ownerId: string, ipHash: string, request: SpeakRequest, signal?: AbortSignal): Promise<ReadableStream<Uint8Array>> {
  const speech = speechClients(deps, 'speechOutput');
  const line = await ownedLine(deps, ownerId, request);
  const text = clipForSpeech(line.text);
  await deps.quota.consume('speech_out', ipHash, ownerId);
  let reservation;
  try {
    reservation = await deps.budget.reserve('tts', text.length * COST_ESTIMATES.ttsPerChar);
  } catch (error) {
    await deps.quota.refund('speech_out', ipHash);
    throw error;
  }
  try {
    return await speech.tts.synthesize(text, speech.voiceFor(line.voiceKey), signal);
  } catch (error) {
    await deps.budget.reconcile(reservation, 0);
    await deps.quota.refund('speech_out', ipHash);
    logEvent('error', 'tts_failed', {
      status: (error as { status?: number }).status ?? null,
    });
    throw new ApiError('UPSTREAM_UNAVAILABLE', 'Could not read this line aloud right now.');
  }
}

/** Parses the conversation a clip belongs to from the query string. */
export function speechContextFromUrl(url: string): SpeechContext {
  const params = new URL(url).searchParams;
  const kind = params.get('kind');
  if (kind === 'intake') return { kind, id: params.get('id') ?? '' };
  if (kind === 'round') return { kind, sessionId: params.get('sessionId') ?? '' };
  throw new ApiError('INVALID_INPUT', 'Say which conversation this clip belongs to.');
}

async function assertOwnedContext(deps: PlatformDeps, ownerId: string, context: SpeechContext): Promise<void> {
  if (context.kind === 'intake') {
    await intakeStore(deps).readOwned(context.id, ownerId);
    return;
  }
  const session = await loadOwnedSession(deps, context.sessionId, ownerId);
  if (session.state.ended) throw new ApiError('SESSION_ENDED', 'The round has ended.');
}

/**
 * Transcribes one short dictated clip. The bytes live only in this request's memory: they are
 * passed to speech-to-text and dropped; nothing is written to storage or logs.
 */
export async function transcribeClip(
  deps: PlatformDeps,
  ownerId: string,
  ipHash: string,
  input: { context: SpeechContext; audio: Uint8Array; mimeType: string },
  signal?: AbortSignal,
): Promise<{ text: string }> {
  const speech = speechClients(deps, 'speechInput');
  const baseType = input.mimeType.split(';')[0]!.trim().toLowerCase();
  if (!CLIP_TYPES.has(baseType)) throw new ApiError('INVALID_INPUT', 'Unsupported audio format.');
  if (input.audio.byteLength === 0) throw new ApiError('INVALID_INPUT', 'The recording is empty.');
  if (input.audio.byteLength > SPEECH_LIMITS.maxClipBytes) throw new ApiError('UPLOAD_TOO_LARGE', `Keep a dictated reply under ${SPEECH_LIMITS.maxClipSeconds} seconds.`);
  await assertOwnedContext(deps, ownerId, input.context);
  await deps.quota.consume('speech_in', ipHash, ownerId);
  let reservation;
  try {
    // A clip is at most 30 s; reserve a whole minute to stay on the safe side.
    reservation = await deps.budget.reserve('scribe', COST_ESTIMATES.scribePerMinute);
  } catch (error) {
    await deps.quota.refund('speech_in', ipHash);
    throw error;
  }
  try {
    const transcript = await speech.stt.transcribe(input.audio, baseType, signal);
    return { text: transcript.text.replace(/\s+/g, ' ').trim() };
  } catch (error) {
    await deps.budget.reconcile(reservation, 0);
    await deps.quota.refund('speech_in', ipHash);
    logEvent('error', 'dictation_failed', {
      status: (error as { status?: number }).status ?? null,
    });
    throw new ApiError('UPSTREAM_UNAVAILABLE', 'Could not transcribe that. Try again or type your reply.');
  }
}
