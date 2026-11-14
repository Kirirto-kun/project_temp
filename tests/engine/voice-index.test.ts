import { describe, expect, it } from 'vitest';
import { computeTension } from '@/domain/voice-index';
import { INSUFFICIENT_BASELINE, VALID_BASELINE, turnVoice } from '@/testing/fixtures';

describe('computeTension v1', () => {
  it('matches the published formula', () => {
    // dF = (141.6-120)/120 = 0.18; dW = (168-150)/150 = 0.12; dP = |0.25-0.2|/0.2 = 0.25
    // 0.4*0.18 + 0.4*0.12 + 0.2*0.25 = 0.072 + 0.048 + 0.05 = 0.17 -> 17
    expect(computeTension(turnVoice('t1', 1), VALID_BASELINE)).toBe(17);
  });
  it('caps at 100 and floors deviations below the baseline at zero for F0 and WPM', () => {
    expect(computeTension(turnVoice('t1', 1, { f0MeanHz: 400, wpm: 400, pauseRatio: 0.9 }), VALID_BASELINE)).toBe(100);
    expect(computeTension(turnVoice('t1', 1, { f0MeanHz: 100, wpm: 100, pauseRatio: 0.2 }), VALID_BASELINE)).toBe(0);
  });
  it('is null without a valid baseline or with missing or zero measurements', () => {
    expect(computeTension(turnVoice('t1', 1), null)).toBeNull();
    expect(computeTension(turnVoice('t1', 1), INSUFFICIENT_BASELINE)).toBeNull();
    expect(computeTension(turnVoice('t1', 1, { f0MeanHz: 0 }), VALID_BASELINE)).toBeNull();
    expect(computeTension(turnVoice('t1', 1, { wpm: null }), VALID_BASELINE)).toBeNull();
    expect(computeTension(turnVoice('t1', 1), { ...VALID_BASELINE, wpm: 0 })).toBeNull();
  });
  it('uses the 0.05 floor for a near-zero baseline pause ratio', () => {
    const value = computeTension(turnVoice('t1', 1, { f0MeanHz: 120, wpm: 150, pauseRatio: 0.1 }), { ...VALID_BASELINE, pauseRatio: 0 });
    expect(value).toBe(40);
  });
});
