import type { TurnVoice, VoiceBaseline } from '@/contracts/voice';

/**
 * Tension index, formulaVersion 1. A heuristic deviation index against the user's own neutral
 * baseline, not emotion recognition. Returns null unless the baseline is valid and all three
 * measurements (F0, WPM, pause ratio) exist on both sides with positive F0 and WPM.
 */
export function computeTension(
  current: Pick<TurnVoice, 'f0MeanHz' | 'wpm' | 'pauseRatio'>,
  baseline: VoiceBaseline | null,
): number | null {
  if (!baseline || baseline.quality !== 'valid') return null;
  const { f0MeanHz: baseF0, wpm: baseWpm, pauseRatio: basePause } = baseline;
  const { f0MeanHz: f0, wpm, pauseRatio } = current;
  if (baseF0 === null || baseWpm === null || basePause === null) return null;
  if (f0 === null || wpm === null || pauseRatio === null) return null;
  if (!(baseF0 > 0 && baseWpm > 0 && f0 > 0 && wpm > 0)) return null;
  if (![baseF0, baseWpm, basePause, f0, wpm, pauseRatio].every(Number.isFinite)) return null;

  const dF = Math.max(0, (f0 - baseF0) / baseF0);
  const dW = Math.max(0, (wpm - baseWpm) / baseWpm);
  const dP = Math.abs(pauseRatio - basePause) / Math.max(basePause, 0.05);
  const index = Math.round(100 * Math.min(1, 0.4 * dF + 0.4 * dW + 0.2 * dP));
  return Number.isFinite(index) ? index : null;
}
