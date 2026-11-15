import { describe, expect, it } from 'vitest';
import type { CoreState, ScenarioConfig } from '@/contracts/domain';
import { applyMove, createInitialState } from '@/engine';
import { classifyByRules } from '@/intelligence/classifier';
import { RAISE_CONFIG, RENT_CONFIG, move } from '@/testing/fixtures';

/** Raise: last ask $112,000, the counterpart has moved to $99,250. */
const raise: CoreState = { ...createInitialState(RAISE_CONFIG), userLastMinor: 11_200_000, offerMinor: 9_925_000, lastAction: { kind: 'concede', toMinor: 9_925_000 }, turn: 3 };
/** Rent: last ask $1,800, $2,000 still on the table. */
const rent: CoreState = { ...createInitialState(RENT_CONFIG), userLastMinor: 180_000, turn: 2 };

function play(config: ScenarioConfig, state: CoreState, text: string) {
  const classified = classifyByRules(text, config, state);
  return { move: classified, ...applyMove(config, state, classified) };
}

describe('a reply that quotes the standing offer without agreeing keeps the round open', () => {
  it.each([
    '$99,250 is too low.',
    'I hear you, but $99,000 is still far below the market data I have seen for this role.',
    'You offered $99,250, that is not enough.',
    "I can't accept $99,250.",
    'I can’t take $99,250.',
    "$99,250 doesn't work for me.",
    'No, $99,250 does not work.',
    'Okay, but $99,250 is under the market.',
    'Is $99,250 really the best you can do?',
    '$95,000 is what I make today.',
    'I currently earn $95,000 and I led the migration.',
  ])('raise: %s', (text) => {
    const { move: classified, state } = play(RAISE_CONFIG, raise, text);
    expect(['concede', 'accept', 'state_number']).not.toContain(classified.type);
    expect(state.ended).toBeNull();
    expect(state.offerMinor).toBeGreaterThanOrEqual(9_925_000);
    expect(state.userLastMinor).toBe(11_200_000);
  });
  it.each(['$2,000 is too much for this unit.', '$2,050 is still above what similar units cost.'])('rent: %s', (text) => {
    const { move: classified, state } = play(RENT_CONFIG, rent, text);
    expect(['concede', 'accept', 'state_number']).not.toContain(classified.type);
    expect(state.ended).toBeNull();
    expect(state.userLastMinor).toBe(180_000);
  });
});

describe('agreeing by naming the offered number, or a worse one, closes at the standing offer', () => {
  it.each(['Okay, $99,250 works for me.', "I'll take $99,250.", "Fine, let's do $99,250.", 'OK, $99,250 it is.', '$99,250 is fine.', 'ok 99,250', 'Deal at $99,250.', '$90,000 would be fine I guess'])('raise: %s', (text) => {
    expect(play(RAISE_CONFIG, raise, text).state).toMatchObject({ ended: 'accepted', agreedMinor: 9_925_000, offerMinor: 9_925_000 });
  });
  it('rent: "$2,100 would be fine" closes at the $2,000 on the table', () => {
    expect(play(RENT_CONFIG, rent, '$2,100 would be fine').state).toMatchObject({ ended: 'accepted', agreedMinor: 200_000 });
  });
});

describe('genuine concessions are unchanged', () => {
  it.each([
    ['I could do $105,000.', 10_500_000],
    ['Okay, I could go down to 105.', 10_500_000],
    ["I can't go below $108,000.", 10_800_000],
    ['$99,250 is too low. I could do $105,000.', 10_500_000],
    ['Anything below $106,000 will not work for me.', 10_600_000],
  ])('%s', (text, amountMinor) => {
    const { move: classified, state } = play(RAISE_CONFIG, raise, text);
    expect(classified).toMatchObject({ type: 'concede', amountMinor });
    expect(state).toMatchObject({ userLastMinor: amountMinor, ended: null, offerMinor: 9_925_000 });
  });
  it('a concession within one step above the offer still closes at the new ask', () => {
    expect(play(RAISE_CONFIG, raise, 'I could do $100,000.').state).toMatchObject({ ended: 'accepted', agreedMinor: 10_000_000 });
  });
  it('rent: asking for more than the last ask is still a concession', () => {
    expect(play(RENT_CONFIG, rent, 'I could do $1,900.').move).toMatchObject({ type: 'concede', amountMinor: 190_000 });
  });
});

describe('engine: a concede move never closes worse than the standing offer', () => {
  it('raise: an ask of $90,000 against an offer of $99,250 closes at $99,250', () => {
    const { state, action } = applyMove(RAISE_CONFIG, raise, move('concede', 9_000_000));
    expect(state).toMatchObject({ ended: 'accepted', agreedMinor: 9_925_000, offerMinor: 9_925_000 });
    expect(action).toEqual({ kind: 'accept', atMinor: 9_925_000 });
  });
  it('rent: an ask of $2,100 against an offer of $2,000 closes at $2,000', () => {
    const { state, action } = applyMove(RENT_CONFIG, rent, move('concede', 210_000));
    expect(state.agreedMinor).toBe(200_000);
    expect(action).toEqual({ kind: 'accept', atMinor: 200_000 });
  });
});
