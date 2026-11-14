import type { CoreState, EndReason, Objection, ScenarioConfig } from '@/contracts/domain';

export function clampMeter(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function createInitialState(config: ScenarioConfig): CoreState {
  return {
    offerMinor: config.initialOfferMinor,
    userLastMinor: null,
    patience: clampMeter(config.patience0),
    trust: clampMeter(config.trust0),
    clearedObjectionIds: [],
    lastAction: null,
    turn: 0,
    ended: null,
    agreedMinor: null,
  };
}

/**
 * Ends a session without a deal (server deadline or explicit stop). An already finished
 * session, including an accepted deal, is returned unchanged.
 */
export function finishSession(state: CoreState, reason: Extract<EndReason, 'timeout' | 'stopped'>): CoreState {
  if (state.ended) return state;
  return { ...state, ended: reason, agreedMinor: null };
}

export function openObjections(config: ScenarioConfig, state: CoreState): Objection[] {
  return config.objections.filter((objection) => !state.clearedObjectionIds.includes(objection.id));
}
