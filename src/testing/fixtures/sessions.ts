import type { Move, QuizAnswers, ScenarioConfig, SessionState, TurnRecord } from '@/contracts/domain';
import { applyMove, createInitialState } from '@/engine';
import { buildBaseScenario } from '@/scenarios';

/** Raise: $95,000 now, wants $110,000, range $100,000–$112,000, analyst director. */
export const RAISE_QUIZ: QuizAnswers = {
  kind: 'raise',
  description: 'Annual review next month; I took over the payments team in spring.',
  counterpartRole: 'Manager',
  conversationDate: '2026-12-01',
  currentMinor: 9_500_000,
  targetMinor: 11_000_000,
  marketLowMinor: 10_000_000,
  marketHighMinor: 11_200_000,
  period: 'year',
  fear: 'They will say the budget is frozen.',
  avatarId: 'daniel-okafor',
  currency: 'USD',
  moneyBasis: 'gross',
  inputMode: 'personal',
  rangeSource: 'user_provided',
  userRole: 'Backend engineer',
};

/** Rent: $2,000/month now, wants $1,800, range $1,800–$2,100, budget-guard landlord. */
export const RENT_QUIZ: QuizAnswers = {
  kind: 'rent',
  description: 'Lease renewal; I have paid on time for two years.',
  counterpartRole: 'Landlord',
  conversationDate: null,
  currentMinor: 200_000,
  targetMinor: 180_000,
  marketLowMinor: 180_000,
  marketHighMinor: 210_000,
  period: 'month',
  fear: '',
  avatarId: 'linda-park',
  currency: 'USD',
  moneyBasis: 'unspecified',
  inputMode: 'personal',
  rangeSource: 'user_provided',
};

export const RAISE_CONFIG: ScenarioConfig = buildBaseScenario(RAISE_QUIZ);
export const RENT_CONFIG: ScenarioConfig = buildBaseScenario(RENT_QUIZ);

export function move(type: Move['type'], amountMinor: number | null = null, hasReason = false, raw = ''): Move {
  return { type, amountMinor, hasReason, tone: 'neutral', raw: raw || type };
}

/** Plays a list of moves through the engine and returns a SessionState with full records. */
export function playSession(config: ScenarioConfig, moves: Move[], overrides: Partial<SessionState> = {}): SessionState {
  const initial = createInitialState(config);
  let state = initial;
  const turns: TurnRecord[] = [];
  moves.forEach((m, index) => {
    const before = state;
    const result = applyMove(config, state, m);
    state = result.state;
    turns.push({
      turnId: `turn-fixture-${index + 1}`,
      turn: result.state.turn,
      input: { turnId: `turn-fixture-${index + 1}`, expectedVersion: index + 1, text: m.raw, mode: 'text', sourceTurnKey: null },
      move: m,
      before,
      after: result.state,
      action: result.action,
      replyText: `reply ${index + 1}`,
      committedAt: new Date(Date.UTC(2026, 10, 15, 10, 0, index)).toISOString(),
    });
  });
  return {
    id: 'ses_fixture',
    ownerId: 'own_fixture',
    scenarioId: config.id,
    scenarioVersion: config.version,
    scenarioSnapshot: config,
    initialState: initial,
    state,
    turns,
    version: 1 + turns.length,
    startedAt: '2026-11-15T10:00:00.000Z',
    deadlineAt: '2026-11-15T10:05:00.000Z',
    replayOf: null,
    replayRootId: 'ses_fixture',
    baselineId: null,
    voiceAnalysisStatus: 'not_requested',
    activeMode: 'text',
    transportEpoch: 0,
    voiceBindingId: null,
    analysisId: null,
    openingLine: 'Thanks for making time. What did you want to discuss?',
    ...overrides,
  };
}
