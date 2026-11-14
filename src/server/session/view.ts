import { CONTRACT_VERSION, type SessionMessage, type SessionState, type SessionView } from '@/contracts/domain';

/**
 * Public projection of a session. Reservation, objection rules, owner id and prompts never
 * leave the server before the debrief.
 */
export function toSessionView(session: SessionState): SessionView {
  const config = session.scenarioSnapshot;
  const messages: SessionMessage[] = [
    { id: `${session.id}:opening`, turnId: null, sourceTurnKey: null, role: 'counterpart', text: session.openingLine, status: 'committed' },
  ];
  for (const turn of session.turns) {
    messages.push({ id: `${turn.turnId}:user`, turnId: turn.turnId, sourceTurnKey: turn.input.sourceTurnKey, role: 'user', text: turn.input.text, status: 'committed' });
    messages.push({ id: `${turn.turnId}:reply`, turnId: turn.turnId, sourceTurnKey: turn.input.sourceTurnKey, role: 'counterpart', text: turn.replyText, status: 'committed' });
  }
  return {
    id: session.id,
    contractVersion: CONTRACT_VERSION,
    version: session.version,
    scenarioSummary: {
      kind: config.kind,
      currency: 'USD',
      period: config.period,
      objective: config.objective,
      currentMinor: config.currentMinor,
      targetMinor: config.targetMinor,
      marketLowMinor: config.marketLowMinor,
      marketHighMinor: config.marketHighMinor,
      moneyBasis: config.moneyBasis,
      inputMode: config.inputMode,
      rangeSource: config.rangeSource,
      counterpartRole: config.counterpartRole,
      persona: { name: config.persona.name, role: config.persona.role, archetype: config.persona.archetype, avatarId: config.persona.avatarId },
    },
    offerMinor: session.state.offerMinor,
    patience: session.state.patience,
    trust: session.state.trust,
    turn: session.state.turn,
    maxTurns: config.maxTurns,
    ended: session.state.ended,
    agreedMinor: session.state.agreedMinor,
    deadlineAt: session.deadlineAt,
    messages,
    voiceAnalysisStatus: session.voiceAnalysisStatus,
    replayOf: session.replayOf,
    replayRootId: session.replayRootId,
    activeMode: session.activeMode,
    baselineId: session.baselineId,
  };
}
