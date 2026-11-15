import { describe, expect, it } from 'vitest';
import type { CoreState } from '@/contracts/domain';
import { buildDebriefRows, computeMoneyOutcome, outcomeSummary } from '@/domain/debrief';
import { createInitialState, finishSession } from '@/engine';
import { RAISE_CONFIG, RENT_CONFIG, move, playSession } from '@/testing/fixtures';

const accepted = (agreedMinor: number): CoreState => ({ ...createInitialState(RAISE_CONFIG), ended: 'accepted', agreedMinor, offerMinor: agreedMinor });

describe('computeMoneyOutcome', () => {
  it('salary: reservation $112,000, accepted $104,000 leaves $8,000/year', () => {
    const outcome = computeMoneyOutcome(RAISE_CONFIG, accepted(10_400_000));
    expect(outcome.leftOnTableMinor).toBe(800_000);
    expect(outcome.leftOnTableAnnualizedMinor).toBe(800_000);
    expect(outcome.gainMinor).toBe(900_000);
  });
  it('rent: reservation $1,800, accepted $2,000 leaves $200/month and $2,400/year', () => {
    const rent: CoreState = { ...createInitialState(RENT_CONFIG), ended: 'accepted', agreedMinor: 200_000 };
    const outcome = computeMoneyOutcome(RENT_CONFIG, rent);
    expect(outcome.leftOnTableMinor).toBe(20_000);
    expect(outcome.leftOnTableAnnualizedMinor).toBe(240_000);
    expect(outcome.gainMinor).toBe(0);
  });
  it('never reports a negative gap', () => {
    expect(computeMoneyOutcome(RAISE_CONFIG, accepted(11_200_000)).leftOnTableMinor).toBe(0);
  });
  it('stopped and timeout have no agreement and null money', () => {
    for (const reason of ['stopped', 'timeout'] as const) {
      const outcome = computeMoneyOutcome(RAISE_CONFIG, finishSession(createInitialState(RAISE_CONFIG), reason));
      expect(outcome).toEqual({ agreedMinor: null, leftOnTableMinor: null, leftOnTableAnnualizedMinor: null, gainMinor: null });
    }
  });
});

describe('buildDebriefRows', () => {
  it('does not double count a concession in the final gap', () => {
    const config = { ...RAISE_CONFIG, objections: [] };
    // Ask $112,000 with a reason twice (offer $101,800), repeat it bare, then drop $8,000 to
    // $104,000, which is above the offer and within one step of it.
    const session = playSession(config, [
      move('state_number', 11_200_000, true),
      move('state_number', 11_200_000, true),
      move('state_number', 11_200_000, false),
      move('concede', 10_400_000),
    ]);
    expect(session.state.ended).toBe('accepted');
    expect(session.state.agreedMinor).toBe(10_400_000);
    const rows = buildDebriefRows(config, session.turns, session.state);
    const concession = rows.reduce((sum, row) => sum + row.userConcessionMinor, 0);
    expect(concession).toBe(800_000);
    expect(computeMoneyOutcome(config, session.state).leftOnTableMinor).toBe(800_000);
    expect(rows[3]?.quality).toBe('cost');
    expect(rows[3]?.betterLine).toContain('$112,000');
    expect(rows[0]?.offerDeltaMinor).toBe(340_000);
  });
  it('reports a positive offer delta as improvement for rent too', () => {
    const config = { ...RENT_CONFIG, objections: [] };
    const session = playSession(config, [move('state_number', 180_000, true)]);
    const rows = buildDebriefRows(config, session.turns, session.state);
    expect(rows[0]?.offerDeltaMinor).toBeGreaterThan(0);
  });
  it('summarises a missing agreement honestly', () => {
    const session = playSession(RAISE_CONFIG, [move('offtopic')]);
    const stopped = finishSession(session.state, 'stopped');
    expect(outcomeSummary(RAISE_CONFIG, stopped, stopped.offerMinor)).toMatch(/^No agreement/);
  });
});
