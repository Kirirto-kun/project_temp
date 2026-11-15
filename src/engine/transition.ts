import type { CoreState, CounterpartAction, Move, ScenarioConfig } from '@/contracts/domain';
import { better, stepToward, utility, worse } from '@/domain/money';
import { clampMeter, openObjections } from './state';

export interface TransitionResult {
  state: CoreState;
  action: CounterpartAction;
}

/** Fraction of the reservation beyond which a request is treated as out of range. */
export const UNREALISTIC_SHARE = 0.15;

interface Draft {
  offerMinor: number | null;
  userLastMinor: number | null;
  patience: number;
  trust: number;
  cleared: string[];
  ended: CoreState['ended'];
  agreedMinor: number | null;
}

/** The furthest the counterpart can move toward an ask: never past the ask, never past reservation. */
function cap(config: ScenarioConfig, askMinor: number): number {
  return worse(config.objective, askMinor, config.reservationAmountMinor);
}

/** One concession step from the current offer toward the capped ask. */
function stepOffer(config: ScenarioConfig, offerMinor: number, askMinor: number, stepMinor: number): number {
  const limit = cap(config, askMinor);
  // Never worsen the offer: if the limit is not better than the current offer, stay.
  if (utility(config.objective, limit) <= utility(config.objective, offerMinor)) return offerMinor;
  return stepToward(offerMinor, limit, stepMinor);
}

function concedeAction(config: ScenarioConfig, draft: Draft, askMinor: number | null, stepMinor: number): CounterpartAction {
  if (draft.offerMinor === null) return { kind: 'hold' };
  const target = askMinor ?? config.reservationAmountMinor;
  const next = stepOffer(config, draft.offerMinor, target, stepMinor);
  if (next === draft.offerMinor) {
    return askMinor !== null && next === askMinor ? { kind: 'concede', toMinor: next } : { kind: 'hold' };
  }
  draft.offerMinor = next;
  return { kind: 'concede', toMinor: next };
}

function firstOpen(config: ScenarioConfig, draft: Draft) {
  return openObjections(config, { clearedObjectionIds: draft.cleared } as CoreState)[0];
}

function clearFirstMatching(config: ScenarioConfig, draft: Draft, moveType: Move['type']): boolean {
  const match = config.objections.find((objection) => !draft.cleared.includes(objection.id) && objection.clearedBy.includes(moveType));
  if (!match) return false;
  draft.cleared = [...draft.cleared, match.id];
  return true;
}

function isUnrealistic(config: ScenarioConfig, askMinor: number): boolean {
  const excess = utility(config.objective, askMinor) - utility(config.objective, config.reservationAmountMinor);
  return excess > UNREALISTIC_SHARE * config.reservationAmountMinor;
}

/**
 * Pure transition (CoreState, Move) -> (CoreState', CounterpartAction). No I/O, time or
 * randomness; the input state is never mutated. Order of checks: finished session is a no-op,
 * turn limit, move-specific rules, meter clamp, patience <= 0 ends the conversation.
 */
export function applyMove(config: ScenarioConfig, state: CoreState, move: Move): TransitionResult {
  if (state.ended) return { state, action: state.lastAction ?? { kind: 'hold' } };
  if (state.turn >= config.maxTurns) {
    const ended: CoreState = { ...state, ended: 'timeout', agreedMinor: null };
    return { state: ended, action: { kind: 'hold' } };
  }

  const draft: Draft = {
    offerMinor: state.offerMinor,
    userLastMinor: state.userLastMinor,
    patience: state.patience,
    trust: state.trust,
    cleared: [...state.clearedObjectionIds],
    ended: null,
    agreedMinor: null,
  };
  const step = config.concessionStepMinor;
  let action: CounterpartAction = { kind: 'hold' };

  switch (move.type) {
    case 'state_number': {
      if (move.amountMinor === null) {
        // Ambiguous amount (two numbers, unresolvable units): ask which one, change nothing.
        action = { kind: 'hold' };
        break;
      }
      draft.userLastMinor = move.amountMinor;
      if (isUnrealistic(config, move.amountMinor)) {
        draft.patience -= 5;
        action = { kind: 'hold' };
        break;
      }
      const open = firstOpen(config, draft);
      if (move.hasReason) {
        draft.trust += 3;
        // A reasoned ask in reply to an objection answers it, the same way a bare reason does.
        if (state.lastAction?.kind === 'object' && clearFirstMatching(config, draft, 'justify')) {
          action = concedeAction(config, draft, move.amountMinor, step);
          break;
        }
        action = open ? { kind: 'object', objectionId: open.id } : concedeAction(config, draft, move.amountMinor, step);
      } else {
        draft.patience -= 2;
        action = open ? { kind: 'object', objectionId: open.id } : { kind: 'hold' };
      }
      break;
    }
    case 'justify': {
      if (clearFirstMatching(config, draft, 'justify')) {
        draft.trust += 2;
        action = concedeAction(config, draft, draft.userLastMinor, step);
      } else if (draft.userLastMinor !== null) {
        // Nothing left to clear: a further reason earns half a step (whole dollars) toward the standing ask.
        action = concedeAction(config, draft, draft.userLastMinor, Math.max(100, Math.floor(step / 200) * 100));
      } else {
        action = { kind: 'hold' };
      }
      break;
    }
    case 'concede': {
      const previous = draft.userLastMinor;
      const ask = move.amountMinor;
      if (ask === null || previous === null || utility(config.objective, ask) >= utility(config.objective, previous)) {
        action = { kind: 'hold' };
        break;
      }
      draft.userLastMinor = ask;
      const offer = draft.offerMinor;
      if (offer === null) {
        action = { kind: 'hold' };
        break;
      }
      const reachableUtility = Math.min(utility(config.objective, offer) + step, utility(config.objective, config.reservationAmountMinor));
      if (utility(config.objective, ask) <= reachableUtility) {
        // Never close at a number worse for the user than the offer already on the table.
        const close = better(config.objective, ask, offer);
        draft.ended = 'accepted';
        draft.agreedMinor = close;
        draft.offerMinor = close;
        action = { kind: 'accept', atMinor: close };
      } else {
        action = { kind: 'hold' };
      }
      break;
    }
    case 'ask_question': {
      draft.patience += 1;
      clearFirstMatching(config, draft, 'ask_question');
      action = { kind: 'probe' };
      break;
    }
    case 'hold_silence': {
      if (state.lastAction?.kind === 'object') {
        draft.patience -= 1;
        draft.trust += 1;
        clearFirstMatching(config, draft, 'hold_silence');
        action = concedeAction(config, draft, draft.userLastMinor, Math.floor(step / 2));
      } else {
        action = { kind: 'hold' };
      }
      break;
    }
    case 'ultimatum': {
      if (move.amountMinor !== null) draft.userLastMinor = move.amountMinor;
      if (draft.trust < 40) {
        draft.patience -= 10;
        if (draft.patience < 15) {
          draft.ended = 'walked_away';
          action = { kind: 'walk_away' };
        } else {
          action = { kind: 'hold' };
        }
      } else {
        action = concedeAction(config, draft, draft.userLastMinor, step);
      }
      break;
    }
    case 'accept': {
      if (draft.offerMinor === null) {
        action = { kind: 'hold' };
      } else {
        draft.ended = 'accepted';
        draft.agreedMinor = draft.offerMinor;
        action = { kind: 'accept', atMinor: draft.offerMinor };
      }
      break;
    }
    case 'offtopic': {
      draft.patience -= 1;
      action = { kind: 'hold' };
      break;
    }
  }

  draft.patience = clampMeter(draft.patience);
  draft.trust = clampMeter(draft.trust);
  if (draft.patience <= 0 && draft.ended === null) {
    draft.ended = 'walked_away';
    action = { kind: 'walk_away' };
  }

  const turn = state.turn + 1;
  let ended = draft.ended;
  if (ended === null && turn >= config.maxTurns) ended = 'timeout';

  const next: CoreState = {
    offerMinor: draft.offerMinor,
    userLastMinor: draft.userLastMinor,
    patience: draft.patience,
    trust: draft.trust,
    clearedObjectionIds: draft.cleared,
    lastAction: action,
    turn,
    ended,
    agreedMinor: ended === 'accepted' ? draft.agreedMinor : null,
  };
  return { state: next, action };
}
