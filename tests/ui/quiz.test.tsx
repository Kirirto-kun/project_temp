import { describe, expect, it } from 'vitest';
import { minorToInput, parseTypedMoney } from '@/features/quiz/money-input';
import { simulatedGains, type RoundResult } from '@/client/storage/plan';

describe('typed money', () => {
  it('parses dollars into cents without guessing magnitude', () => {
    expect(parseTypedMoney('$110,000')).toBe(11_000_000);
    expect(parseTypedMoney('110000')).toBe(11_000_000);
    expect(parseTypedMoney('110k')).toBe(11_000_000);
    expect(parseTypedMoney('1,999.99')).toBe(199_999);
    expect(parseTypedMoney('110')).toBe(11_000);
    expect(parseTypedMoney('11,00')).toBeNull();
    expect(parseTypedMoney('abc')).toBeNull();
    expect(parseTypedMoney('-5')).toBeNull();
    expect(minorToInput(11_000_000)).toBe('110,000');
  });
});

describe('simulated gains', () => {
  const r = (patch: Partial<RoundResult>): RoundResult => ({ sessionId: 's', replayRootId: 'root', kind: 'raise', period: 'year', outcome: 'accepted', gainMinor: 100, leftOnTableMinor: 0, finishedAt: '', ...patch });
  it('counts the best attempt per original round and never mixes periods', () => {
    const gains = simulatedGains([
      r({ sessionId: 'a', replayRootId: 'r1', gainMinor: 300_000 }),
      r({ sessionId: 'b', replayRootId: 'r1', gainMinor: 500_000 }),
      r({ sessionId: 'c', replayRootId: 'r2', gainMinor: 100_000 }),
      r({ sessionId: 'd', replayRootId: 'r3', period: 'month', kind: 'rent', gainMinor: 10_000 }),
      r({ sessionId: 'e', replayRootId: 'r4', gainMinor: null, outcome: 'walked_away' }),
    ]);
    expect(gains).toEqual(
      expect.arrayContaining([
        { period: 'year', totalMinor: 600_000, rounds: 2 },
        { period: 'month', totalMinor: 10_000, rounds: 1 },
      ]),
    );
  });
});
