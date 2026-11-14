import type { TurnVoice, VoiceBaseline, VoiceMetrics } from '@/contracts/voice';

export const VALID_BASELINE: VoiceBaseline = {
  id: 'bl_fixture',
  durationMs: 20_000,
  wpm: 150,
  f0MeanHz: 120,
  f0StdHz: 18,
  pauseRatio: 0.2,
  rms: 0.08,
  fillersPerMin: 1.5,
  quality: 'valid',
  unavailableReasons: [],
};

export const INSUFFICIENT_BASELINE: VoiceBaseline = {
  id: 'bl_insufficient',
  durationMs: 20_000,
  wpm: null,
  f0MeanHz: null,
  f0StdHz: null,
  pauseRatio: null,
  rms: 0.002,
  fillersPerMin: null,
  quality: 'insufficient',
  unavailableReasons: ['Less than 5 seconds of speech.'],
};

export function turnVoice(turnId: string, turn: number, overrides: Partial<TurnVoice> = {}): TurnVoice {
  return {
    turnId,
    turn,
    wpm: 168,
    pauseRatio: 0.25,
    f0MeanHz: 141.6,
    f0StdHz: 22,
    pauseBeforeNumberMs: 900,
    fillers: 1,
    rmsDipAtNumber: true,
    tensionIndex: null,
    unavailableReasons: [],
    relativeToBaseline: true,
    ...overrides,
  };
}

export const UNAVAILABLE_VOICE: VoiceMetrics = {
  status: 'unavailable',
  baselineId: null,
  turns: [],
  formulaVersion: 1,
  reason: 'No recording for this session.',
};
