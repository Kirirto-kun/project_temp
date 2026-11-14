import type { Move, SessionState, TurnRecord } from '@/contracts/domain';
import type { Debrief, VoiceMetrics } from '@/contracts/voice';
import { applyMove, createInitialState } from '@/engine';
import { buildDebrief, renderOpening, templateReply } from '@/intelligence';
import { NO_MODEL } from '@/intelligence/ports';
import { buildBaseScenario } from '@/scenarios';

/**
 * Synthetic example round, clearly labelled on the page. It runs through the real engine and
 * templates so every number is produced the same way as in a live round.
 */
const QUIZ = {
  kind: 'raise' as const,
  description: 'Example: annual review after taking over a team.',
  counterpartRole: 'Manager',
  conversationDate: null,
  currentMinor: 9_500_000,
  targetMinor: 11_200_000,
  marketLowMinor: 10_000_000,
  marketHighMinor: 11_200_000,
  period: 'year' as const,
  fear: 'Budget is frozen.',
  avatarId: 'maya-chen',
  currency: 'USD' as const,
  moneyBasis: 'gross' as const,
  inputMode: 'example' as const,
  rangeSource: 'example' as const,
};

const SCRIPT: { text: string; move: Move }[] = [
  { text: 'I would like $112,000.', move: { type: 'state_number', amountMinor: 11_200_000, hasReason: false, tone: 'assertive', raw: 'I would like $112,000.' } },
  { text: 'I took over the payments team in spring and we shipped the migration a month early.', move: { type: 'justify', amountMinor: null, hasReason: true, tone: 'neutral', raw: '' } },
  { text: 'What would make $112,000 workable this cycle?', move: { type: 'ask_question', amountMinor: null, hasReason: false, tone: 'neutral', raw: '' } },
  { text: 'Given the scope I now own, $112,000 is fair for the role.', move: { type: 'state_number', amountMinor: 11_200_000, hasReason: true, tone: 'assertive', raw: '' } },
  { text: 'Okay, I could do $104,000.', move: { type: 'concede', amountMinor: 10_400_000, hasReason: false, tone: 'apologetic', raw: '' } },
];

function buildExampleSession(): SessionState {
  const config = buildBaseScenario(QUIZ);
  const initial = createInitialState(config);
  let state = initial;
  const turns: TurnRecord[] = [];
  const base: SessionState = {
    id: 'example',
    ownerId: 'example',
    scenarioId: config.id,
    scenarioVersion: config.version,
    scenarioSnapshot: config,
    initialState: initial,
    state: initial,
    turns,
    version: 1,
    startedAt: '2026-11-15T10:00:00.000Z',
    deadlineAt: '2026-11-15T10:05:00.000Z',
    replayOf: null,
    replayRootId: 'example',
    baselineId: null,
    voiceAnalysisStatus: 'ready',
    activeMode: 'voice',
    transportEpoch: 1,
    voiceBindingId: null,
    analysisId: null,
    openingLine: renderOpening(config),
  };
  SCRIPT.forEach((step, index) => {
    const move = { ...step.move, raw: step.text };
    const before = state;
    const result = applyMove(config, before, move);
    const session = { ...base, state: before, turns: [...turns] };
    turns.push({
      turnId: `example-${index + 1}`,
      turn: result.state.turn,
      input: { turnId: `example-${index + 1}`, expectedVersion: index + 1, text: step.text, mode: 'voice', sourceTurnKey: null },
      move,
      before,
      after: result.state,
      action: result.action,
      replyText: templateReply(result.action, { session, move, next: result.state }),
      committedAt: base.startedAt,
    });
    state = result.state;
  });
  return { ...base, state, turns, version: 1 + turns.length };
}

const EXAMPLE_VOICE: VoiceMetrics = {
  status: 'ready',
  baselineId: 'example',
  formulaVersion: 1,
  reason: 'Synthetic example values for illustration.',
  turns: [
    { turnId: 'example-1', turn: 1, wpm: 171, pauseRatio: 0.12, f0MeanHz: 138, f0StdHz: 21, pauseBeforeNumberMs: 1_400, fillers: 1, rmsDipAtNumber: true, tensionIndex: 22, unavailableReasons: [], relativeToBaseline: true },
    { turnId: 'example-4', turn: 4, wpm: 150, pauseRatio: 0.18, f0MeanHz: 124, f0StdHz: 17, pauseBeforeNumberMs: 300, fillers: 0, rmsDipAtNumber: false, tensionIndex: 6, unavailableReasons: [], relativeToBaseline: true },
    { turnId: 'example-5', turn: 5, wpm: 182, pauseRatio: 0.3, f0MeanHz: 145, f0StdHz: 26, pauseBeforeNumberMs: 2_100, fillers: 2, rmsDipAtNumber: true, tensionIndex: 41, unavailableReasons: [], relativeToBaseline: true },
  ],
};

export async function exampleDebrief(): Promise<Debrief> {
  return buildDebrief(buildExampleSession(), EXAMPLE_VOICE, NO_MODEL);
}
