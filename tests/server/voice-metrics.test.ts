import { describe, expect, it } from 'vitest';
import type { AcousticSample } from '@/contracts/voice';
import { computeBaseline, computeTurnVoice, isFiller, pauseMs } from '@/server/voice/metrics';
import type { ScribeWord } from '@/server/voice/scribe';
import { VALID_BASELINE } from '@/testing/fixtures';

function samples(fromMs: number, toMs: number, rms: number, f0: number | null): AcousticSample[] {
  const out: AcousticSample[] = [];
  for (let t = fromMs; t < toMs; t += 50) out.push({ tMs: t, rms, f0Hz: f0 });
  return out;
}

function words(list: [string, number, number][]): ScribeWord[] {
  return list.map(([text, startMs, endMs]) => ({ text, startMs, endMs, type: 'word' as const }));
}

describe('pause and fillers', () => {
  it('counts only quiet runs of at least 200 ms', () => {
    expect(pauseMs([...samples(0, 150, 0.001, null), ...samples(150, 300, 0.1, 120)])).toBe(0);
    expect(pauseMs([...samples(0, 400, 0.001, null), ...samples(400, 600, 0.1, 120)])).toBe(400);
  });
  it('matches fillers as whole words only', () => {
    expect(isFiller('um,')).toBe(true);
    expect(isFiller('Uh')).toBe(true);
    expect(isFiller('number')).toBe(false);
    expect(isFiller('umbrella')).toBe(false);
  });
});

describe('computeBaseline', () => {
  it('is insufficient on silence and never reports zeros as measurements', () => {
    const baseline = computeBaseline('bl_1', 20_000, [], samples(0, 20_000, 0.001, null));
    expect(baseline.quality).toBe('insufficient');
    expect(baseline.wpm).toBeNull();
    expect(baseline.f0MeanHz).toBeNull();
  });
  it('is valid with enough speech and words', () => {
    const w = words(Array.from({ length: 40 }, (_, i) => [`word${i}`, i * 400, i * 400 + 300] as [string, number, number]));
    const baseline = computeBaseline('bl_2', 20_000, w, samples(0, 16_000, 0.08, 120));
    expect(baseline.quality).toBe('valid');
    expect(baseline.wpm).toBeGreaterThan(140);
    expect(baseline.f0MeanHz).toBe(120);
  });
});

describe('computeTurnVoice', () => {
  const window = { turnId: 't1', turn: 1, t0Ms: 0, t1Ms: 4_000 };
  const turnWords = words([
    ['I', 0, 200],
    ['want', 250, 500],
    ['um', 600, 800],
    ['$110,000', 1_800, 2_600],
    ['please', 2_700, 3_000],
  ]);
  const turnSamples = [...samples(0, 1_000, 0.1, 140), ...samples(1_000, 1_800, 0.001, null), ...samples(1_800, 2_600, 0.03, 140), ...samples(2_600, 4_000, 0.1, 140)];

  it('measures pause before the amount, the loudness dip, fillers and tension against the baseline', () => {
    const voice = computeTurnVoice(window, turnWords, turnSamples, VALID_BASELINE);
    expect(voice.pauseBeforeNumberMs).toBe(1_000);
    expect(voice.rmsDipAtNumber).toBe(true);
    expect(voice.fillers).toBe(1);
    expect(voice.wpm).toBe(75);
    expect(voice.relativeToBaseline).toBe(true);
    expect(voice.tensionIndex).not.toBeNull();
  });
  it('without a baseline the index is null and values are absolute', () => {
    const voice = computeTurnVoice(window, turnWords, turnSamples, null);
    expect(voice.tensionIndex).toBeNull();
    expect(voice.relativeToBaseline).toBe(false);
  });
  it('an empty turn is unavailable, not zero', () => {
    const voice = computeTurnVoice(window, [], samples(0, 4_000, 0.001, null), null);
    expect(voice.wpm).toBeNull();
    expect(voice.fillers).toBeNull();
    expect(voice.f0MeanHz).toBeNull();
    expect(voice.unavailableReasons.length).toBeGreaterThan(0);
  });
});
