import type { ErrorCode, SpeakRequest, SpeechContext } from '@/contracts/api';
import { ApiClientError } from '@/client/api/client';

/**
 * Shared plumbing for dictation and read-aloud in the text chats: the API calls, the mute
 * preference, one playback at a time, and the "the user just sent something" signal that lets a
 * reply be read aloud without fighting the browser's autoplay policy.
 */

export const SPEAKER_STORAGE_KEY = 'holdline.readAloud';

export function readSpeakerMuted(): boolean {
  try {
    return window.localStorage.getItem(SPEAKER_STORAGE_KEY) === 'off';
  } catch {
    return false;
  }
}

export function writeSpeakerMuted(muted: boolean): void {
  try {
    window.localStorage.setItem(SPEAKER_STORAGE_KEY, muted ? 'off' : 'on');
  } catch {
    // Private mode or blocked storage: the choice lasts for this page only.
  }
}

// ---------------------------------------------------------------------------------------------
// Autoplay: a reply is read aloud only right after the user sent something from the text chat.

const AUTO_READ_WINDOW_MS = 120_000;
let autoReadArmedAt: number | null = null;
let sharedAudio: HTMLAudioElement | null = null;

/** A short silent WAV, played inside the user's gesture so later playback is allowed (iOS Safari). */
function silentWavUrl(): string {
  const samples = 160;
  const buffer = new ArrayBuffer(44 + samples * 2);
  const view = new DataView(buffer);
  const write = (offset: number, text: string) => [...text].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  write(0, 'RIFF');
  view.setUint32(4, 36 + samples * 2, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 8_000, true);
  view.setUint32(28, 16_000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, samples * 2, true);
  return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
}

function quietly(result: unknown): void {
  if (result && typeof (result as Promise<void>).catch === 'function') (result as Promise<void>).catch(() => undefined);
}

/** Call from a click or key handler: arms one automatic read-aloud and unlocks audio playback. */
export function markTextInteraction(): void {
  autoReadArmedAt = Date.now();
  if (typeof Audio === 'undefined' || sharedAudio) return;
  try {
    sharedAudio = new Audio();
    sharedAudio.src = silentWavUrl();
    quietly(sharedAudio.play());
  } catch {
    sharedAudio = null;
  }
}

/** True once per text send, for a new reply that arrives soon after it. */
export function takeAutoReadTurn(now = Date.now()): boolean {
  const armed = autoReadArmedAt !== null && now - autoReadArmedAt <= AUTO_READ_WINDOW_MS;
  autoReadArmedAt = null;
  return armed;
}

// ---------------------------------------------------------------------------------------------
// One voice at a time across the page.

let current: { owner: symbol; stop: () => void } | null = null;

export function stopAllSpeech(): void {
  const playing = current;
  current = null;
  playing?.stop();
}

export function claimSpeech(owner: symbol, stop: () => void): void {
  stopAllSpeech();
  current = { owner, stop };
}

export function releaseSpeech(owner: symbol): void {
  if (current?.owner === owner) current = null;
}

export function stopSpeechOf(owner: symbol): void {
  if (current?.owner === owner) stopAllSpeech();
}

export function playbackElement(): HTMLAudioElement {
  sharedAudio ??= new Audio();
  return sharedAudio;
}

// ---------------------------------------------------------------------------------------------
// Server calls.

async function failure(response: Response): Promise<ApiClientError> {
  let envelope: { code?: ErrorCode; message?: string; retryable?: boolean } | undefined;
  try {
    envelope = ((await response.json()) as { error?: typeof envelope }).error;
  } catch {
    envelope = undefined;
  }
  return new ApiClientError({
    code: envelope?.code ?? 'INTERNAL',
    status: response.status,
    message: envelope?.message ?? 'Something went wrong. Please try again.',
    retryable: envelope?.retryable ?? response.status >= 500,
  });
}

async function send(path: string, init: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiClientError({
      code: 'NETWORK',
      status: 0,
      message: 'You seem to be offline. Check the connection and try again.',
      retryable: true,
    });
  }
  if (!response.ok) throw await failure(response);
  return response;
}

export async function transcribeClip(clip: Blob, context: SpeechContext, signal?: AbortSignal): Promise<string> {
  const query = context.kind === 'intake' ? `kind=intake&id=${encodeURIComponent(context.id)}` : `kind=round&sessionId=${encodeURIComponent(context.sessionId)}`;
  const response = await send(`/api/speech/transcribe?${query}`, {
    method: 'POST',
    body: clip,
    headers: {
      'Content-Type': clip.type || 'audio/webm',
      Accept: 'application/json',
    },
    signal,
  });
  const body = (await response.json()) as { text?: unknown };
  return typeof body.text === 'string' ? body.text : '';
}

export async function fetchSpeech(target: SpeakRequest, signal?: AbortSignal): Promise<Blob> {
  const response = await send('/api/speech/say', {
    method: 'POST',
    body: JSON.stringify(target),
    headers: { 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    signal,
  });
  return response.blob();
}

// ---------------------------------------------------------------------------------------------
// Browser fallbacks.

export interface BrowserRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export function recognitionConstructor(): (new () => BrowserRecognition) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => BrowserRecognition;
    webkitSpeechRecognition?: new () => BrowserRecognition;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function browserSynthesisAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function';
}

export function microphoneBlocked(error: unknown): boolean {
  const name = (error as { name?: string } | null)?.name;
  return name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError';
}
