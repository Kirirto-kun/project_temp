import { describe, expect, it, vi } from 'vitest';
import type { Move, QuizAnswers, ScenarioConfig, SessionState, TurnRecord } from '@/contracts/domain';
import { applyMove } from '@/engine';
import { classifyMove } from '@/intelligence/classifier';
import { NO_MODEL, type ModelPorts } from '@/intelligence/ports';
import { buildBaseScenario } from '@/scenarios';
import { RAISE_QUIZ, playSession } from '@/testing/fixtures';

const turnInput = (text: string, n: number) => ({ turnId: `turn-repeat-${String(n).padStart(4, '0')}`, expectedVersion: n, text, mode: 'text' as const, sourceTurnKey: null });

/** Sends replies through classifyMove + applyMove the way processTurn does. */
async function round(config: ScenarioConfig, replies: string[], deps: ModelPorts = NO_MODEL): Promise<{ session: SessionState; moves: Move[] }> {
  let session = playSession(config, []);
  const moves: Move[] = [];
  for (const [i, text] of replies.entries()) {
    if (session.state.ended) break;
    const input = turnInput(text, i + 1);
    const move = await classifyMove(input, session, deps);
    const result = applyMove(config, session.state, move);
    const record: TurnRecord = { turnId: input.turnId, turn: result.state.turn, input, move, before: session.state, after: result.state, action: result.action, replyText: 'reply', committedAt: session.startedAt };
    session = { ...session, state: result.state, turns: [...session.turns, record] };
    moves.push(move);
  }
  return { session, moves };
}

const raiseFor = (avatarId: string): ScenarioConfig => buildBaseScenario({ ...RAISE_QUIZ, avatarId, marketHighMinor: 11_500_000 } as QuizAnswers);
const AVATARS = ['maya-chen', 'daniel-okafor', 'priya-raman', 'tom-becker'] as const;

describe('a repeated reply earns no second credit', () => {
  it.each(AVATARS)('%s: the same reasoned ask pasted six times moves the offer at most once', async (avatarId) => {
    const config = raiseFor(avatarId);
    const { session, moves } = await round(config, Array.from({ length: 6 }, () => 'Because I took over the team, $115,000 is fair.'));
    expect(moves[0]).toMatchObject({ type: 'state_number', hasReason: true });
    for (const m of moves.slice(1)) expect(m).toMatchObject({ type: 'state_number', amountMinor: 11_500_000, hasReason: false });
    expect(session.state.offerMinor).toBe(config.initialOfferMinor);
  });

  it.each(AVATARS)('%s: the same reason pasted after a number counts once', async (avatarId) => {
    const config = raiseFor(avatarId);
    const { session, moves } = await round(config, ["I'm asking for $115,000.", ...Array.from({ length: 6 }, () => 'I led the payments migration.')]);
    expect(moves.map((m) => m.type)).toEqual(['state_number', 'justify', 'offtopic', 'offtopic', 'offtopic', 'offtopic', 'offtopic']);
    expect(session.state.offerMinor).toBe(config.initialOfferMinor + config.concessionStepMinor);
    expect(session.state.offerMinor!).toBeLessThan(config.reservationAmountMinor);
  });

  it('ignores case, spacing and punctuation when comparing', async () => {
    const { moves } = await round(raiseFor('maya-chen'), ["I'm asking for $110,000.", 'I led the payments migration.', '  i led the payments   migration!!']);
    expect(moves[2]).toMatchObject({ type: 'offtopic', hasReason: false });
  });

  it('different reasons are still counted', async () => {
    const config = raiseFor('priya-raman');
    const { session, moves } = await round(config, ["I'm asking for $110,000.", 'I led the payments migration.', 'My performance reviews put me at the top of the team.', 'Market data shows comparable roles pay more.']);
    expect(moves.map((m) => m.type)).toEqual(['state_number', 'justify', 'justify', 'justify']);
    expect(moves.every((m, i) => i === 0 || m.hasReason)).toBe(true);
    expect(session.state.offerMinor!).toBeGreaterThanOrEqual(config.initialOfferMinor + config.concessionStepMinor);
  });

  it('leaves silence, bare numbers and acceptance alone', async () => {
    const { moves } = await round(raiseFor('tom-becker'), ['$110,000.', '$110,000.', '...', '...', 'Deal, I accept.']);
    expect(moves.map((m) => m.type)).toEqual(['state_number', 'state_number', 'hold_silence', 'hold_silence', 'accept']);
  });

  it('applies to the model path as well', async () => {
    const deps: ModelPorts = { available: true, completeStructured: vi.fn().mockResolvedValue({ moveType: 'justify', amountIndex: null, hasReason: true, tone: 'neutral' }) };
    const { moves } = await round(raiseFor('maya-chen'), ['I led the payments migration.', 'I led the payments migration.'], deps);
    expect(moves.map((m) => m.type)).toEqual(['justify', 'offtopic']);
  });
});
