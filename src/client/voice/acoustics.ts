import { YIN } from 'pitchfinder';
import { VOICE_CONSTANTS, type AcousticSample } from '@/contracts/voice';

export function rmsOf(buffer: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buffer.length; i += 1) sum += buffer[i]! * buffer[i]!;
  return Math.sqrt(sum / buffer.length);
}

/** F0 only on confidently voiced windows; null instead of 0 when there is no pitch. */
export function pitchOf(buffer: Float32Array, sampleRate: number, detector: (b: Float32Array) => number | null, rms: number): number | null {
  if (rms < VOICE_CONSTANTS.pauseRmsThreshold * 2) return null;
  const f0 = detector(buffer);
  if (f0 === null || !Number.isFinite(f0) || f0 < 60 || f0 > 500) return null;
  return Math.round(f0 * 10) / 10;
}

export interface AcousticSampler {
  samples: AcousticSample[];
  /** Latest RMS for a level meter (0..1). */
  level(): number;
  stop(): void;
}

/**
 * Samples RMS and F0 every 50 ms from an AnalyserNode. `clock` returns milliseconds since the
 * recording started, so samples share the recording's timebase.
 */
export function startAcousticSampler(context: AudioContext, source: MediaStreamAudioSourceNode, clock: () => number): AcousticSampler {
  const analyser = context.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser);
  const buffer = new Float32Array(analyser.fftSize);
  const detector = YIN({ sampleRate: context.sampleRate, threshold: 0.15, probabilityThreshold: 0.1 });
  const samples: AcousticSample[] = [];
  let last = 0;
  const timer = setInterval(() => {
    analyser.getFloatTimeDomainData(buffer);
    const rms = Math.min(1, rmsOf(buffer));
    last = rms;
    const tMs = Math.max(0, Math.round(clock()));
    if (samples.length && tMs <= samples[samples.length - 1]!.tMs) return;
    if (samples.length >= VOICE_CONSTANTS.maxSamples) return;
    samples.push({ tMs, rms: Math.round(rms * 10_000) / 10_000, f0Hz: pitchOf(buffer, context.sampleRate, detector, rms) });
  }, VOICE_CONSTANTS.sampleIntervalMs);
  return {
    samples,
    level: () => last,
    stop: () => {
      clearInterval(timer);
      try {
        source.disconnect(analyser);
      } catch {
        /* already disconnected */
      }
    },
  };
}
