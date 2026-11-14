import { describe, expect, it } from 'vitest';
import type { CoreState, ScenarioConfig } from '@/contracts/domain';
import { applyMove, createInitialState, finishSession } from '@/engine';
import { RAISE_CONFIG, RENT_CONFIG, move } from '@/testing/fixtures';

/** Raise config: offer $95,000, reservation $112,000, step $3,400, objections level→budget. */
const config: ScenarioConfig = RAISE_CONFIG;
const noObjections: ScenarioConfig = { ...RAISE_CONFIG, objections: [] };
const start = (c: ScenarioConfig = config, patch: Partial<CoreState> = {}): CoreState => ({ ...createInitialState(c), ...patch });

describe('fixture assumptions', () => {
  it('has the expected numbers', () => {
    expect(config.initialOfferMinor).toBe(9_500_000);
    expect(config.reservationAmountMinor).toBe(11_200_000);
    expect(config.concessionStepMinor).toBe(340_000);
    expect(config.objections.map((o) => o.id)).toEqual(['raise_level', 'raise_budget']);
  });
});

describe('state_number', () => {
  it('with a reason and an open objection: trust +3 and object', () => {
    const { state, action } = applyMove(config, start(), move('state_number', 11_000_000, true));
    expect(action).toEqual({ kind: 'object', objectionId: 'raise_level' });
    expect(state.trust).toBe(start().trust + 3);
    expect(state.userLastMinor).toBe(11_000_000);
    expect(state.offerMinor).toBe(9_500_000);
  });
  it('with a reason and no open objection: concede one step toward the ask', () => {
    const { state, action } = applyMove(noObjections, start(noObjections), move('state_number', 11_000_000, true));
    expect(action).toEqual({ kind: 'concede', toMinor: 9_840_000 });
    expect(state.offerMinor).toBe(9_840_000);
  });
  it('without a reason: patience −2 and the first open objection', () => {
    const { state, action } = applyMove(config, start(), move('state_number', 11_000_000, false));
    expect(action).toEqual({ kind: 'object', objectionId: 'raise_level' });
    expect(state.patience).toBe(start().patience - 2);
  });
  it('without a reason and all objections cleared: hold', () => {
    const s = start(config, { clearedObjectionIds: ['raise_level', 'raise_budget'] });
    expect(applyMove(config, s, move('state_number', 11_000_000, false)).action).toEqual({ kind: 'hold' });
  });
  it('treats more than 15% over the reservation as out of range: patience −5 and hold', () => {
    const ask = Math.floor(11_200_000 * 1.15) + 100; // just over the 15% line
    const { state, action } = applyMove(noObjections, start(noObjections), move('state_number', ask, true));
    expect(action).toEqual({ kind: 'hold' });
    expect(state.patience).toBe(start(noObjections).patience - 5);
    expect(state.trust).toBe(start(noObjections).trust);
  });
  it('treats exactly 15% over as within range but never concedes past the reservation', () => {
    const ask = Math.round(11_200_000 * 1.15);
    const s = start(noObjections, { offerMinor: 11_000_000 });
    const { state, action } = applyMove(noObjections, s, move('state_number', ask, true));
    expect(action).toEqual({ kind: 'concede', toMinor: 11_200_000 });
    expect(state.offerMinor).toBe(11_200_000);
  });
  it('at the reservation with no room left: hold', () => {
    const s = start(noObjections, { offerMinor: 11_200_000 });
    expect(applyMove(noObjections, s, move('state_number', 11_500_000, true)).action).toEqual({ kind: 'hold' });
  });
  it('with an ambiguous amount: nothing moves', () => {
    const before = start();
    const { state, action } = applyMove(config, before, move('state_number', null, true));
    expect(action).toEqual({ kind: 'hold' });
    expect({ ...state, turn: 0, lastAction: null }).toEqual(before);
  });
});

describe('justify', () => {
  it('clears the first matching objection, trust +2 and a step', () => {
    const s = start(config, { userLastMinor: 11_000_000 });
    const { state, action } = applyMove(config, s, move('justify', null, true));
    expect(state.clearedObjectionIds).toEqual(['raise_level']);
    expect(state.trust).toBe(s.trust + 2);
    expect(action).toEqual({ kind: 'concede', toMinor: 9_840_000 });
  });
  it('without an ask steps toward the reservation', () => {
    const { action } = applyMove(config, start(), move('justify', null, true));
    expect(action).toEqual({ kind: 'concede', toMinor: 9_840_000 });
  });
  it('repeating after everything is cleared: hold and no bonus', () => {
    const s = start(config, { clearedObjectionIds: ['raise_level', 'raise_budget'] });
    const { state, action } = applyMove(config, s, move('justify', null, true));
    expect(action).toEqual({ kind: 'hold' });
    expect(state.trust).toBe(s.trust);
  });
});

describe('concede', () => {
  it('a real concession within offer+step closes the deal at the new ask', () => {
    const s = start(config, { userLastMinor: 11_000_000, offerMinor: 10_200_000 });
    const { state, action } = applyMove(config, s, move('concede', 10_500_000));
    expect(action).toEqual({ kind: 'accept', atMinor: 10_500_000 });
    expect(state.ended).toBe('accepted');
    expect(state.agreedMinor).toBe(10_500_000);
  });
  it('a concession still beyond offer+step: hold, ask recorded', () => {
    const s = start(config, { userLastMinor: 11_000_000, offerMinor: 9_500_000 });
    const { state, action } = applyMove(config, s, move('concede', 10_800_000));
    expect(action).toEqual({ kind: 'hold' });
    expect(state.userLastMinor).toBe(10_800_000);
    expect(state.ended).toBeNull();
  });
  it('no previous number or no actual drop: hold', () => {
    expect(applyMove(config, start(), move('concede', 10_000_000)).action).toEqual({ kind: 'hold' });
    const s = start(config, { userLastMinor: 10_000_000 });
    expect(applyMove(config, s, move('concede', 10_500_000)).action).toEqual({ kind: 'hold' });
  });
});

describe('ask_question', () => {
  it('patience +1 and probe without a money move', () => {
    const { state, action } = applyMove(config, start(), move('ask_question'));
    expect(action).toEqual({ kind: 'probe' });
    expect(state.patience).toBe(start().patience + 1);
    expect(state.offerMinor).toBe(9_500_000);
  });
  it('clears an objection that a question resolves', () => {
    const s = start(config, { clearedObjectionIds: ['raise_level'] });
    expect(applyMove(config, s, move('ask_question')).state.clearedObjectionIds).toEqual(['raise_level', 'raise_budget']);
  });
});

describe('hold_silence', () => {
  it('after an objection: patience −1, trust +1, half a step', () => {
    const s = start(config, { lastAction: { kind: 'object', objectionId: 'raise_level' }, userLastMinor: 11_000_000 });
    const { state, action } = applyMove(config, s, move('hold_silence'));
    expect(state.patience).toBe(s.patience - 1);
    expect(state.trust).toBe(s.trust + 1);
    expect(action).toEqual({ kind: 'concede', toMinor: 9_670_000 });
  });
  it('without a preceding objection: hold, nothing changes', () => {
    const s = start();
    const { state, action } = applyMove(config, s, move('hold_silence'));
    expect(action).toEqual({ kind: 'hold' });
    expect(state.patience).toBe(s.patience);
  });
});

describe('ultimatum', () => {
  it('trust 39: patience −10 and walk away below 15', () => {
    const s = start(config, { trust: 39, patience: 24 });
    const { state, action } = applyMove(config, s, move('ultimatum'));
    expect(action).toEqual({ kind: 'walk_away' });
    expect(state.ended).toBe('walked_away');
    expect(state.patience).toBe(14);
  });
  it('trust 39, patience lands on 15: hold', () => {
    const s = start(config, { trust: 39, patience: 25 });
    const { state, action } = applyMove(config, s, move('ultimatum'));
    expect(action).toEqual({ kind: 'hold' });
    expect(state.patience).toBe(15);
    expect(state.ended).toBeNull();
  });
  it('trust 40: a step within the reservation', () => {
    const s = start(config, { trust: 40, userLastMinor: 11_000_000 });
    expect(applyMove(config, s, move('ultimatum')).action).toEqual({ kind: 'concede', toMinor: 9_840_000 });
  });
});

describe('accept', () => {
  it('accepts exactly the current offer, not a new number from the text', () => {
    const s = start(config, { offerMinor: 10_300_000 });
    const { state, action } = applyMove(config, s, move('accept', 11_000_000));
    expect(action).toEqual({ kind: 'accept', atMinor: 10_300_000 });
    expect(state.agreedMinor).toBe(10_300_000);
  });
  it('without an offer there is no deal', () => {
    const s = start(config, { offerMinor: null });
    const { state, action } = applyMove(config, s, move('accept'));
    expect(action).toEqual({ kind: 'hold' });
    expect(state.ended).toBeNull();
    expect(state.agreedMinor).toBeNull();
  });
});

describe('offtopic and patience', () => {
  it('offtopic: patience −1 and hold', () => {
    const { state, action } = applyMove(config, start(), move('offtopic'));
    expect(action).toEqual({ kind: 'hold' });
    expect(state.patience).toBe(start().patience - 1);
  });
  it('patience reaching 0 ends the conversation with priority over the normal reply', () => {
    const s = start(config, { patience: 1 });
    const { state, action } = applyMove(config, s, move('offtopic'));
    expect(action).toEqual({ kind: 'walk_away' });
    expect(state.ended).toBe('walked_away');
  });
});

describe('terminal and limits', () => {
  it('a finished session is a no-op', () => {
    const s: CoreState = { ...start(), ended: 'accepted', agreedMinor: 10_000_000, lastAction: { kind: 'accept', atMinor: 10_000_000 } };
    expect(applyMove(config, s, move('state_number', 11_000_000, true)).state).toBe(s);
  });
  it('the last allowed turn ends in timeout without a deal', () => {
    const s = start(config, { turn: config.maxTurns - 1 });
    const { state } = applyMove(config, s, move('ask_question'));
    expect(state.turn).toBe(config.maxTurns);
    expect(state.ended).toBe('timeout');
    expect(state.agreedMinor).toBeNull();
  });
  it('finishSession does not overwrite an accepted deal', () => {
    const accepted: CoreState = { ...start(), ended: 'accepted', agreedMinor: 10_000_000 };
    expect(finishSession(accepted, 'stopped')).toBe(accepted);
    expect(finishSession(start(), 'timeout')).toMatchObject({ ended: 'timeout', agreedMinor: null });
  });
});

describe('rent mirrors raise', () => {
  it('concedes downward and never below the reservation', () => {
    const c = { ...RENT_CONFIG, objections: [] };
    const s = start(c, { offerMinor: 182_000 });
    const { state, action } = applyMove(c, s, move('state_number', 175_000, true));
    expect(action).toEqual({ kind: 'concede', toMinor: 180_000 });
    expect(state.offerMinor).toBe(180_000);
  });
  it('flags a rent more than 15% under the reservation as out of range', () => {
    const c = { ...RENT_CONFIG, objections: [] };
    const { action, state } = applyMove(c, start(c), move('state_number', 150_000, true));
    expect(action).toEqual({ kind: 'hold' });
    expect(state.patience).toBe(start(c).patience - 5);
  });
  it('a rent concession means asking for more', () => {
    const c = RENT_CONFIG;
    const s = start(c, { userLastMinor: 180_000, offerMinor: 195_000 });
    const step = c.concessionStepMinor;
    const ask = 195_000 - step;
    const { action } = applyMove(c, s, move('concede', ask));
    expect(action).toEqual({ kind: 'accept', atMinor: ask });
  });
});
