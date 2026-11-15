import { describe, expect, it } from 'vitest';
import type { CounterpartAction, ScenarioConfig, SessionState } from '@/contracts/domain';
import { buildDebriefRows, templateBetterLine } from '@/domain/debrief';
import { buildBaseScenario } from '@/scenarios';
import { templateReply } from '@/intelligence/actor';
import { containsNumberLike } from '@/intelligence/money-guard';
import { RAISE_CONFIG, RAISE_QUIZ, RENT_QUIZ, move, playSession } from '@/testing/fixtures';

/** The round from the report: rent $2,300 -> target $2,100, range $2,050-$2,400, Linda Park. */
const RENT = buildBaseScenario({ ...RENT_QUIZ, currentMinor: 230_000, targetMinor: 210_000, marketLowMinor: 205_000, marketHighMinor: 240_000 });
const BILL = buildBaseScenario({ ...RENT_QUIZ, kind: 'bill', counterpartRole: 'Retention specialist', avatarId: 'jordan-lee', currentMinor: 12_000, targetMinor: 9_000, marketLowMinor: 8_500, marketHighMinor: 12_000 });
const OFFER = buildBaseScenario({ ...RAISE_QUIZ, kind: 'offer', counterpartRole: 'Recruiter', avatarId: 'ana-souza' });
const RAISE_WORDS = /what I delivered|for the role|the scope I'm taking on|your current role|what you have delivered|take to finance|changed in your role|what you have taken on|\bbudget\b/i;

const rentRound = () => playSession(RENT, [move('state_number', 210_000, false), move('justify'), move('concede', 215_000), move('concede', 220_000)]);

describe('QA-10: rent and bill wording', () => {
  it('a tenant who raises the ask is told they went up, not that they dropped', () => {
    const session = rentRound();
    const rows = buildDebriefRows(RENT, session.turns, session.state);
    expect(rows[2]!.userConcessionMinor).toBe(5_000);
    expect(rows[2]!.note).toContain('You went up to $2,150/month, $50 above your last ask.');
    expect(rows.map((r) => r.note).join(' ')).not.toMatch(/dropped to|below your last ask/);
  });

  it('Try lines for rent and bill carry no raise wording, and keep the amounts', () => {
    for (const config of [RENT, BILL]) {
      const session = playSession(config, [move('state_number', config.targetMinor, false), move('ultimatum'), move('concede', config.targetMinor + 1_000), move('accept')]);
      const rows = buildDebriefRows(config, session.turns, session.state);
      const lines = rows.map((r) => r.betterLine).filter((l): l is string => l !== null);
      expect(lines.length).toBeGreaterThanOrEqual(3);
      for (const line of lines) expect(line).not.toMatch(RAISE_WORDS);
      expect(lines[0]).toContain(config.kind === 'rent' ? '$2,100/month' : '$90/month');
    }
  });

  it('counterpart templates for rent and bill carry no raise wording and no stray numbers', () => {
    for (const config of [RENT, BILL, buildBaseScenario({ ...RENT_QUIZ, avatarId: 'sam-wright', counterpartRole: 'Property manager' })]) {
      const base = playSession(config, []);
      for (let turn = 0; turn < 4; turn += 1) {
        for (const [action, m] of [[{ kind: 'hold' }, move('offtopic')], [{ kind: 'hold' }, move('concede', config.targetMinor)], [{ kind: 'probe' }, move('ask_question')], [{ kind: 'walk_away' }, move('offtopic')]] as [CounterpartAction, ReturnType<typeof move>][]) {
          const session: SessionState = base;
          const line = templateReply(action, { session, move: m, next: { ...session.state, turn } });
          expect(line, `${config.persona.name} ${action.kind} turn ${turn}`).not.toMatch(RAISE_WORDS);
          if (m.type !== 'concede') expect(containsNumberLike(line)).toBe(false);
        }
      }
    }
  });
});

describe('QA-10: raise and offer wording stays exactly as it was', () => {
  const lineFor = (config: ScenarioConfig, m: ReturnType<typeof move>) => {
    const session = playSession(config, [m]);
    return templateBetterLine(config, session.turns[0]!);
  };
  it('Try lines', () => {
    for (const config of [RAISE_CONFIG, OFFER]) {
      expect(lineFor(config, move('state_number', 11_000_000, false))).toBe("I'm asking for $110,000/year because of what I delivered this year — I can walk you through the results.");
      expect(lineFor(config, move('ultimatum'))).toBe("I'd like to find a number we can both stand behind. Here's why $110,000/year is fair for the role.");
      expect(lineFor(config, move('accept'))).toBe("Before we close, I'd like to revisit the number — $110,000/year reflects the scope I'm taking on.");
    }
  });
  it('concession note', () => {
    const config = { ...RAISE_CONFIG, objections: [] };
    const session = playSession(config, [move('state_number', 11_200_000, true), move('concede', 11_000_000)]);
    const rows = buildDebriefRows(config, session.turns, session.state);
    expect(rows[1]!.note).toContain('You dropped to $110,000/year, $2,000 below your last ask.');
  });
  it('counterpart templates', () => {
    const base = playSession(RAISE_CONFIG, []);
    const budget = playSession(buildBaseScenario({ ...RAISE_QUIZ, avatarId: 'maya-chen' }), []);
    const people = playSession(buildBaseScenario({ ...RAISE_QUIZ, avatarId: 'priya-raman' }), []);
    const say = (s: SessionState, action: CounterpartAction, m: ReturnType<typeof move>, turn: number) => templateReply(action, { session: s, move: m, next: { ...s.state, turn } });
    expect(say(budget, { kind: 'hold' }, move('offtopic'), 0)).toBe("I hear you, but the budget doesn't move that easily.");
    expect(say(budget, { kind: 'hold' }, move('concede', 10_000_000), 0)).toBe('I can stay at $95,000/year. That is what the budget allows today.');
    expect(say(budget, { kind: 'probe' }, move('ask_question'), 0)).toBe('If you can show me impact beyond your current role, I have a bit of room.');
    expect(say(budget, { kind: 'probe' }, move('ask_question'), 1)).toBe('What would help is a clear picture of what you have delivered.');
    expect(say(base, { kind: 'probe' }, move('ask_question'), 0)).toBe("What I'd need is evidence: results or market data I can take to finance.");
    expect(say(people, { kind: 'probe' }, move('ask_question'), 0)).toBe('Tell me what matters most to you here, and what you have taken on.');
    expect(say(people, { kind: 'probe' }, move('ask_question'), 1)).toBe('Help me understand what changed in your role.');
  });
});
