import { VOICE_CONSTANTS, type AcousticSample, type TurnVoice, type VoiceBaseline, type VoiceMetrics } from '@/contracts/voice';
import { computeTension } from '@/domain/voice-index';
import type { ScribeWord } from './scribe';

const NUMBER_WORD = /^(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|grand|k)$/;

export function normalizeWord(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9$%]/g, '');
}

export function isNumberToken(text: string): boolean {
  const word = normalizeWord(text);
  return /\d/.test(word) || word.includes('$') || NUMBER_WORD.test(word);
}

export function isFiller(text: string): boolean {
  return VOICE_CONSTANTS.fillers.includes(normalizeWord(text));
}

const STEP = VOICE_CONSTANTS.sampleIntervalMs;

function inRange<T extends { tMs: number }>(samples: readonly T[], t0: number, t1: number): T[] {
  return samples.filter((s) => s.tMs >= t0 && s.tMs < t1);
}

/** Total time in runs of quiet samples (RMS below threshold) lasting at least pauseMinMs. */
export function pauseMs(samples: readonly AcousticSample[]): number {
  let total = 0;
  let run = 0;
  for (const sample of samples) {
    if (sample.rms < VOICE_CONSTANTS.pauseRmsThreshold) {
      run += STEP;
    } else {
      if (run >= VOICE_CONSTANTS.pauseMinMs) total += run;
      run = 0;
    }
  }
  if (run >= VOICE_CONSTANTS.pauseMinMs) total += run;
  return total;
}

function meanStd(values: readonly number[]): { mean: number; std: number } | null {
  if (values.length === 0) return null;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return { mean, std: Math.sqrt(variance) };
}

const round1 = (v: number) => Math.round(v * 10) / 10;
const round3 = (v: number) => Math.round(v * 1_000) / 1_000;

export function computeBaseline(id: string, durationMs: number, words: readonly ScribeWord[], samples: readonly AcousticSample[]): VoiceBaseline {
  const spoken = words.filter((w) => w.type === 'word');
  const reasons: string[] = [];
  const voicedMs = samples.filter((s) => s.rms >= VOICE_CONSTANTS.pauseRmsThreshold).length * STEP;
  if (voicedMs < VOICE_CONSTANTS.baselineMinSpeechMs) reasons.push('Less than 5 seconds of speech was detected.');
  if (spoken.length < VOICE_CONSTANTS.baselineMinWords) reasons.push('Fewer than 10 words were recognised.');
  if (spoken.length === 0) {
    return { id, durationMs, wpm: null, f0MeanHz: null, f0StdHz: null, pauseRatio: null, rms: null, fillersPerMin: null, quality: 'insufficient', unavailableReasons: reasons };
  }
  const start = spoken[0]!.startMs;
  const end = spoken.at(-1)!.endMs;
  const span = Math.max(1, end - start);
  const inside = inRange(samples, start, end);
  const f0 = meanStd(inside.map((s) => s.f0Hz).filter((v): v is number => v !== null));
  const voiced = inside.filter((s) => s.rms >= VOICE_CONSTANTS.pauseRmsThreshold);
  const rms = voiced.length ? voiced.reduce((s, v) => s + v.rms, 0) / voiced.length : null;
  if (!f0) reasons.push('No reliable pitch was detected.');
  return {
    id,
    durationMs,
    wpm: round1((spoken.length / span) * 60_000),
    f0MeanHz: f0 ? round1(f0.mean) : null,
    f0StdHz: f0 ? round1(f0.std) : null,
    pauseRatio: inside.length ? round3(pauseMs(inside) / span) : null,
    rms: rms !== null ? round3(rms) : null,
    fillersPerMin: round1((spoken.filter((w) => isFiller(w.text)).length / span) * 60_000),
    quality: voicedMs >= VOICE_CONSTANTS.baselineMinSpeechMs && spoken.length >= VOICE_CONSTANTS.baselineMinWords && f0 !== null ? 'valid' : 'insufficient',
    unavailableReasons: reasons,
  };
}

export interface TurnWindow {
  turnId: string;
  turn: number;
  t0Ms: number;
  t1Ms: number;
}

export function computeTurnVoice(window: TurnWindow, words: readonly ScribeWord[], samples: readonly AcousticSample[], baseline: VoiceBaseline | null): TurnVoice {
  const { t0Ms, t1Ms } = window;
  const reasons: string[] = [];
  const spoken = words.filter((w) => w.type === 'word' && w.startMs >= t0Ms && w.endMs <= t1Ms + 100);
  const inside = inRange(samples, t0Ms, t1Ms);
  const durationMs = Math.max(1, t1Ms - t0Ms);

  const wpm = spoken.length > 0 ? round1((spoken.length / durationMs) * 60_000) : null;
  if (spoken.length === 0) reasons.push('No words were recognised in this turn.');
  const pauseRatio = inside.length > 0 ? round3(pauseMs(inside) / durationMs) : null;
  if (inside.length === 0) reasons.push('No acoustic samples for this turn.');

  const voicedF0 = inside.map((s) => s.f0Hz).filter((v): v is number => v !== null);
  const f0 = voicedF0.length * STEP >= VOICE_CONSTANTS.turnMinVoicedMs ? meanStd(voicedF0) : null;
  if (!f0) reasons.push('Not enough voiced audio for pitch.');

  let pauseBeforeNumberMs: number | null = null;
  let rmsDipAtNumber: boolean | null = null;
  const numberIndex = spoken.findIndex((w) => isNumberToken(w.text));
  if (numberIndex >= 0) {
    const numberWord = spoken[numberIndex]!;
    let numberEnd = numberWord.endMs;
    for (let i = numberIndex + 1; i < spoken.length && isNumberToken(spoken[i]!.text); i += 1) numberEnd = spoken[i]!.endMs;
    const previousEnd = numberIndex > 0 ? spoken[numberIndex - 1]!.endMs : t0Ms;
    pauseBeforeNumberMs = Math.max(0, numberWord.startMs - previousEnd);
    const during = inRange(samples, numberWord.startMs, numberEnd);
    const context = samples.filter(
      (s) => s.tMs >= numberWord.startMs - VOICE_CONSTANTS.rmsDipWindowMs && s.tMs < numberEnd + VOICE_CONSTANTS.rmsDipWindowMs && (s.tMs < numberWord.startMs || s.tMs >= numberEnd) && s.rms >= VOICE_CONSTANTS.pauseRmsThreshold,
    );
    if (during.length > 0 && context.length * STEP >= VOICE_CONSTANTS.rmsDipMinContextMs) {
      const mean = (xs: AcousticSample[]) => xs.reduce((s, v) => s + v.rms, 0) / xs.length;
      rmsDipAtNumber = mean(during) < VOICE_CONSTANTS.rmsDipRatio * mean(context);
    } else {
      reasons.push('Not enough surrounding speech to compare loudness at the amount.');
    }
  }

  const base: TurnVoice = {
    turnId: window.turnId,
    turn: window.turn,
    wpm,
    pauseRatio,
    f0MeanHz: f0 ? round1(f0.mean) : null,
    f0StdHz: f0 ? round1(f0.std) : null,
    pauseBeforeNumberMs,
    fillers: spoken.length > 0 ? spoken.filter((w) => isFiller(w.text)).length : null,
    rmsDipAtNumber,
    tensionIndex: null,
    unavailableReasons: reasons,
    relativeToBaseline: baseline?.quality === 'valid',
  };
  return { ...base, tensionIndex: computeTension(base, baseline) };
}

/**
 * Per-turn metrics joined by turnId. Turns without a recorded interval are reported as
 * unavailable rather than borrowing a neighbour's audio.
 */
export function computeSessionMetrics(
  windows: readonly TurnWindow[],
  words: readonly ScribeWord[],
  samples: readonly AcousticSample[],
  baseline: VoiceBaseline | null,
): VoiceMetrics {
  const turns = windows.map((w) => computeTurnVoice(w, words, samples, baseline));
  return {
    status: 'ready',
    baselineId: baseline?.id ?? null,
    turns,
    formulaVersion: 1,
    reason: baseline?.quality === 'valid' ? null : 'No valid calibration: values are absolute, without comparison to your baseline.',
  };
}
