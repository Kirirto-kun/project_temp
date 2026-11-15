import { describe, expect, it } from 'vitest';
import { buildDebriefRows, computeMoneyOutcome } from '@/domain/debrief';
import { RAISE_CONFIG, RENT_CONFIG, move, playSession } from '@/testing/fixtures';

describe('QA-51: the Try line on the accepting turn never names a number worse than the agreed one', () => {
  it('raise: agreed $105,200 above the $104,000 target -> the line names the $112,000 ceiling', () => {
    const config = { ...RAISE_CONFIG, objections: [], targetMinor: 10_400_000 };
    const session = playSession(config, [move('state_number', 11_200_000, true), move('state_number', 11_200_000, true), move('state_number', 11_200_000, true), move('accept')]);
    expect(session.state.agreedMinor).toBe(10_520_000);
    const row = buildDebriefRows(config, session.turns, session.state).at(-1)!;
    expect(row.quality).toBe('cost');
    expect(row.betterLine).toContain('$112,000/year');
    expect(row.betterLine).not.toContain('$104,000');
  });
  it('raise: agreed exactly at the target -> still not the agreed number', () => {
    const config = { ...RAISE_CONFIG, objections: [], targetMinor: 10_520_000 };
    const session = playSession(config, [move('state_number', 11_200_000, true), move('state_number', 11_200_000, true), move('state_number', 11_200_000, true), move('accept')]);
    const row = buildDebriefRows(config, session.turns, session.state).at(-1)!;
    expect(row.betterLine).toContain('$112,000/year');
  });
  it('rent: agreed $1,850 below the $1,900 target -> the line names the $1,800 floor', () => {
    const config = { ...RENT_CONFIG, objections: [], targetMinor: 190_000 };
    const session = playSession(config, [move('state_number', 180_000, true), move('state_number', 180_000, true), move('state_number', 180_000, true), move('accept')]);
    const agreed = session.state.agreedMinor!;
    expect(agreed).toBeLessThan(190_000);
    expect(agreed).toBeGreaterThan(180_000);
    const row = buildDebriefRows(config, session.turns, session.state).at(-1)!;
    expect(row.quality).toBe('cost');
    expect(row.betterLine).toContain('$1,800/month');
    expect(row.betterLine).not.toContain('$1,900');
  });
  it('unchanged: accepting below the target still points at the target', () => {
    const config = { ...RAISE_CONFIG, objections: [] };
    const session = playSession(config, [move('state_number', 11_200_000, true), move('accept')]);
    expect(session.state.agreedMinor).toBe(9_840_000);
    const row = buildDebriefRows(config, session.turns, session.state).at(-1)!;
    expect(row.betterLine).toContain('$110,000/year');
  });
  it('unchanged: accepting at the ceiling has no Try line, money outcome untouched', () => {
    const config = { ...RAISE_CONFIG, objections: [] };
    const session = playSession(config, [...Array(5).fill(move('state_number', 11_200_000, true)), move('accept')]);
    expect(computeMoneyOutcome(config, session.state).leftOnTableMinor).toBe(0);
    expect(buildDebriefRows(config, session.turns, session.state).at(-1)!.betterLine).toBeNull();
  });
});
