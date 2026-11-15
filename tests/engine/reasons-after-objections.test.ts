import { describe, expect, it } from 'vitest';
import type { CoreState, Move, QuizAnswers, ScenarioConfig } from '@/contracts/domain';
import { applyMove, createInitialState } from '@/engine';
import { buildBaseScenario } from '@/scenarios';
import { RAISE_CONFIG, RAISE_QUIZ, RENT_QUIZ, move } from '@/testing/fixtures';

/** Raise config: offer $95,000, reservation $112,000, step $3,400, objections level→budget. */
const config: ScenarioConfig = RAISE_CONFIG;
const cleared = ['raise_level', 'raise_budget'];
const start = (c: ScenarioConfig, patch: Partial<CoreState> = {}): CoreState => ({ ...createInitialState(c), ...patch });

function offers(c: ScenarioConfig, moves: Move[]): number[] {
  const out: number[] = [];
  let state = createInitialState(c);
  for (const m of moves) {
    state = applyMove(c, state, m).state;
    out.push(state.offerMinor!);
  }
  return out;
}

describe('reasons after the objections are cleared', () => {
  it('with a standing ask: half a step, no trust bonus', () => {
    const s = start(config, { clearedObjectionIds: cleared, userLastMinor: 11_000_000, offerMinor: 10_180_000 });
    const { state, action } = applyMove(config, s, move('justify', null, true));
    expect(action).toEqual({ kind: 'concede', toMinor: 10_350_000 });
    expect(state.trust).toBe(s.trust);
  });

  it('never past the standing ask or the limit', () => {
    const nearAsk = start(config, { clearedObjectionIds: cleared, userLastMinor: 11_000_000, offerMinor: 10_950_000 });
    expect(applyMove(config, nearAsk, move('justify', null, true)).state.offerMinor).toBe(11_000_000);
    const atLimit = start(config, { clearedObjectionIds: cleared, userLastMinor: 11_500_000, offerMinor: 11_200_000 });
    const { state, action } = applyMove(config, atLimit, move('justify', null, true));
    expect(action).toEqual({ kind: 'hold' });
    expect(state.offerMinor).toBe(11_200_000);
  });

  it('without a standing ask: hold', () => {
    const s = start(config, { clearedObjectionIds: cleared });
    expect(applyMove(config, s, move('justify', null, true)).action).toEqual({ kind: 'hold' });
  });

  it('the half step stays in whole dollars when the step is odd', () => {
    const rent = buildBaseScenario({ ...RENT_QUIZ, currentMinor: 230_000, targetMinor: 210_000, marketLowMinor: 205_000, marketHighMinor: 240_000 } as QuizAnswers);
    expect(rent.concessionStepMinor).toBe(6_300);
    const s = start(rent, { clearedObjectionIds: rent.objections.map((o) => o.id), userLastMinor: 210_000, offerMinor: 217_400 });
    expect(applyMove(rent, s, move('justify', null, true)).state.offerMinor).toBe(214_300);
  });

  it('one number, then reasons: the hardliner never offers more than the relationship builder', () => {
    const raiseFor = (avatarId: string) => buildBaseScenario({ ...RAISE_QUIZ, avatarId, marketHighMinor: 11_500_000 } as QuizAnswers);
    const script = [move('state_number', 11_000_000, false), ...Array.from({ length: 9 }, () => move('justify', null, true))];
    const hard = offers(raiseFor('tom-becker'), script);
    const soft = offers(raiseFor('priya-raman'), script);
    hard.forEach((offer, i) => expect(offer).toBeLessThanOrEqual(soft[i]!));
    expect(hard[4]!).toBeLessThan(soft[4]!);
    expect(Math.max(...hard, ...soft)).toBe(11_000_000);
  });
});
