import { VOICE_CONSTANTS, type AcousticSample, type AudioPurpose } from '@/contracts/voice';
import { startAcousticSampler, type AcousticSampler } from './acoustics';
import { pickRecorderMime, startRecorder, type Recorder } from './recorder';

export interface CaptureResult {
  recordingId: string;
  blob: Blob | null;
  mimeType: string | null;
  durationMs: number;
  samples: AcousticSample[];
}

export interface UserCapture {
  recordingId: string;
  purpose: AudioPurpose;
  /** Milliseconds since this recording started: the only zero of its timeline. */
  clock(): number;
  level(): number;
  /** Turns the audio recording on or off; without consent no blob is ever created. */
  setRecordingConsent(consent: boolean): void;
  stop(): Promise<CaptureResult>;
  dispose(): void;
  readonly recordingAvailable: boolean;
}

function randomId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return `rec_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Shared capture for calibration, practice and the coach call. It takes an already opened
 * microphone stream (never calls getUserMedia itself), clones the track for its own use and
 * releases only what it created. The owner of `userStream` stops the original tracks.
 */
export function createUserCapture({ userStream, purpose, recordAudio, signal }: { userStream: MediaStream; purpose: AudioPurpose; recordAudio: boolean; signal?: AbortSignal }): UserCapture {
  const recordingId = randomId();
  const started = performance.now();
  const clock = () => performance.now() - started;
  const clones = userStream.getAudioTracks().map((t) => t.clone());
  const stream = new MediaStream(clones);
  const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const context = new AudioCtx();
  const source = context.createMediaStreamSource(stream);
  const sampler: AcousticSampler = startAcousticSampler(context, source, clock);
  const mimeType = pickRecorderMime();
  let recorder: Recorder | null = recordAudio && mimeType ? startRecorder(stream, mimeType, VOICE_CONSTANTS.maxUploadBytes) : null;
  let disposed = false;
  const maxMs = purpose === 'baseline' ? VOICE_CONSTANTS.maxBaselineMs : VOICE_CONSTANTS.maxRecordingMs;
  const limitTimer = setTimeout(() => recorder?.stop().catch(() => undefined), maxMs);

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    clearTimeout(limitTimer);
    sampler.stop();
    recorder?.discard();
    recorder = null;
    clones.forEach((t) => t.stop());
    void context.close().catch(() => undefined);
  };
  signal?.addEventListener('abort', dispose, { once: true });

  return {
    recordingId,
    purpose,
    clock,
    level: () => sampler.level(),
    recordingAvailable: mimeType !== null,
    setRecordingConsent(consent) {
      if (!consent) {
        recorder?.discard();
        recorder = null;
      } else if (!recorder && mimeType && !disposed) {
        recorder = startRecorder(stream, mimeType, VOICE_CONSTANTS.maxUploadBytes);
      }
    },
    async stop() {
      const durationMs = Math.round(clock());
      const blob = recorder ? await recorder.stop() : null;
      const usedMime = recorder?.mimeType ?? null;
      const samples = sampler.samples.filter((s) => s.tMs <= durationMs);
      recorder = null;
      dispose();
      return { recordingId, blob: blob && blob.size > 0 ? blob : null, mimeType: usedMime, durationMs, samples };
    },
    dispose,
  };
}

/** Opens the microphone only in response to a user action. */
export async function openMicrophone(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser cannot use a microphone here.');
  return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false }, video: false });
}

export function stopStream(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach((t) => t.stop());
}
