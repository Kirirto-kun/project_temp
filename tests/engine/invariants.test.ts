import { describe, expect, it } from 'vitest';
import { MOVE_TYPES, type CoreState, type Move } from '@/contracts/domain';
import { applyMove, createInitialState } from '@/engine';
import { RAISE_CONFIG, RENT_CONFIG, move } from '@/testing/fixtures';

function randomMoves(seed: number, count: number, reference: number): Move[] {
  let x = seed;
  const next = () => {
    x = (x * 1_103_515_245 + 12_345) % 2_147_483_648;
    return x / 2_147_483_648;
  };
  return Array.from({ length: count }, () => {
    const type = MOVE_TYPES[Math.floor(next() * MOVE_TYPES.length)]!;
    const amount = next() < 0.7 ? Math.round(reference * (0.8 + next() * 0.6)) : null;
    return move(type, amount, next() < 0.5);
  });
}

describe('engine invariants', () => {
  for (const config of [RAISE_CONFIG, RENT_CONFIG]) {
    it(`${config.kind}: meters stay in 0..100, no mutation, deterministic, offer never worsens`, () => {
      for (let seed = 1; seed <= 40; seed += 1) {
        const moves = randomMoves(seed, 25, config.currentMinor);
        let state = createInitialState(config);
        const snapshot = JSON.stringify(config);
        for (const m of moves) {
          const frozen = JSON.stringify(state);
          const a = applyMove(config, state, m);
          const b = applyMove(config, state, m);
          expect(a).toEqual(b);
          expect(JSON.stringify(state)).toBe(frozen);
          expect(a.state.patience).toBeGreaterThanOrEqual(0);
          expect(a.state.patience).toBeLessThanOrEqual(100);
          expect(a.state.trust).toBeGreaterThanOrEqual(0);
          expect(a.state.trust).toBeLessThanOrEqual(100);
          if (state.offerMinor !== null && a.state.offerMinor !== null && a.state.ended !== 'accepted') {
            const better = config.objective === 'maximize' ? a.state.offerMinor >= state.offerMinor : a.state.offerMinor <= state.offerMinor;
            expect(better).toBe(true);
            const withinReservation =
              config.objective === 'maximize' ? a.state.offerMinor <= config.reservationAmountMinor : a.state.offerMinor >= config.reservationAmountMinor;
            expect(withinReservation).toBe(true);
          }
          if (a.state.ended && a.state.ended !== 'accepted') expect(a.state.agreedMinor).toBeNull();
          state = a.state;
        }
        expect(JSON.stringify(config)).toBe(snapshot);
        expect(state.turn).toBeLessThanOrEqual(config.maxTurns);
      }
    });
  }

  it('terminal states never change', () => {
    const ended: CoreState = { ...createInitialState(RAISE_CONFIG), ended: 'walked_away' };
    for (const type of MOVE_TYPES) expect(applyMove(RAISE_CONFIG, ended, move(type, 10_000_000, true)).state).toBe(ended);
  });
});
