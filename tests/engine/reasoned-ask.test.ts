import { describe, expect, it } from 'vitest';
import type { CoreState, Move, QuizAnswers, ScenarioConfig } from '@/contracts/domain';
import { utility } from '@/domain/money';
import { applyMove, createInitialState } from '@/engine';
import { buildBaseScenario } from '@/scenarios';
import { RAISE_CONFIG, RAISE_QUIZ, move } from '@/testing/fixtures';

/** Raise config: offer $95,000, reservation $112,000, step $3,400, objections level→budget. */
const config: ScenarioConfig = RAISE_CONFIG;
const start = (patch: Partial<CoreState> = {}): CoreState => ({ ...createInitialState(config), ...patch });

function play(c: ScenarioConfig, moves: Move[]): CoreState[] {
  const states: CoreState[] = [];
  let state = createInitialState(c);
  for (const m of moves) {
    state = applyMove(c, state, m).state;
    states.push(state);
  }
  return states;
}

/** $95,000 now, asks $110,000, hidden limit $115,000. */
const raiseFor = (avatarId: string): ScenarioConfig => buildBaseScenario({ ...RAISE_QUIZ, avatarId, marketHighMinor: 11_500_000 } as QuizAnswers);
const AVATARS = ['maya-chen', 'daniel-okafor', 'priya-raman', 'tom-becker'] as const;
const reasonedAsks = (count: number, askMinor = 11_000_000): Move[] => [move('state_number', askMinor, false), ...Array.from({ length: count - 1 }, () => move('state_number', askMinor, true))];

describe('a reasoned ask answers the objection it follows', () => {
  it('the first reasoned ask still meets the objection', () => {
    const { state, action } = applyMove(config, start(), move('state_number', 11_000_000, true));
    expect(action).toEqual({ kind: 'object', objectionId: 'raise_level' });
    expect(state.offerMinor).toBe(9_500_000);
    expect(state.clearedObjectionIds).toEqual([]);
  });

  it('right after an objection it clears the objection and moves one step', () => {
    const s = start({ lastAction: { kind: 'object', objectionId: 'raise_level' }, userLastMinor: 11_000_000 });
    const { state, action } = applyMove(config, s, move('state_number', 11_000_000, true));
    expect(action).toEqual({ kind: 'concede', toMinor: 9_840_000 });
    expect(state.clearedObjectionIds).toEqual(['raise_level']);
    expect(state.trust).toBe(s.trust + 3);
  });

  it('an ask without a reason after an objection clears nothing', () => {
    const s = start({ lastAction: { kind: 'object', objectionId: 'raise_level' }, userLastMinor: 11_000_000 });
    const { state, action } = applyMove(config, s, move('state_number', 11_000_000, false));
    expect(action).toEqual({ kind: 'object', objectionId: 'raise_level' });
    expect(state.clearedObjectionIds).toEqual([]);
    expect(state.offerMinor).toBe(9_500_000);
  });

  it.each(AVATARS)('%s: six replies with the number and a reason move the offer, never past the ask', (avatarId) => {
    const c = raiseFor(avatarId);
    const offers = play(c, reasonedAsks(6)).map((s) => s.offerMinor!);
    expect(offers.at(-1)!).toBeGreaterThan(c.initialOfferMinor);
    offers.forEach((offer, i) => {
      expect(offer).toBeLessThanOrEqual(11_000_000);
      expect(offer).toBeGreaterThanOrEqual(i === 0 ? c.initialOfferMinor : offers[i - 1]!);
    });
  });

  it('the hardliner never offers more than the relationship builder', () => {
    const hard = play(raiseFor('tom-becker'), reasonedAsks(10)).map((s) => s.offerMinor!);
    const soft = play(raiseFor('priya-raman'), reasonedAsks(10)).map((s) => s.offerMinor!);
    hard.forEach((offer, i) => expect(offer).toBeLessThanOrEqual(soft[i]!));
    expect(hard[4]!).toBeLessThan(soft[4]!);
  });

  it.each(AVATARS)('%s: an ask above the limit stops at the limit and the round ends at the turn limit', (avatarId) => {
    const c = raiseFor(avatarId);
    const states = play(c, reasonedAsks(30, 12_500_000));
    for (const s of states) expect(utility(c.objective, s.offerMinor!)).toBeLessThanOrEqual(utility(c.objective, c.reservationAmountMinor));
    expect(states.at(-1)!.ended).toBe('timeout');
    expect(states.at(-1)!.turn).toBe(c.maxTurns);
  });
});
