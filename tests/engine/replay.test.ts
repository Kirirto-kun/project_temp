import { describe, expect, it } from 'vitest';
import { createInitialState } from '@/engine';
import { RAISE_CONFIG, RENT_CONFIG, move, playSession } from '@/testing/fixtures';

describe('replay', () => {
  it('a new round starts from the same initial state and leaves the first untouched', () => {
    const first = playSession(RAISE_CONFIG, [move('state_number', 11_000_000, true), move('justify', null, true), move('accept')]);
    const before = JSON.stringify(first);
    const replayInitial = createInitialState(first.scenarioSnapshot);
    expect(replayInitial).toEqual(first.initialState);
    expect(replayInitial.turn).toBe(0);
    expect(replayInitial.clearedObjectionIds).toEqual([]);
    expect(replayInitial.ended).toBeNull();
    expect(JSON.stringify(first)).toBe(before);
  });
  it('fixtures exist for raise and rent', () => {
    expect(RAISE_CONFIG.kind).toBe('raise');
    expect(RENT_CONFIG.kind).toBe('rent');
  });
});
