import type { CoreState, Objective, ScenarioConfig, TurnRecord } from '@/contracts/domain';
import type { DebriefRow, TurnVoice } from '@/contracts/voice';
import { annualize, formatMoney, isBetter, utility } from './money';

export interface MoneyOutcome {
  agreedMinor: number | null;
  /** max(0, utility(reservation) - utility(agreed)); null without an agreement. */
  leftOnTableMinor: number | null;
  leftOnTableAnnualizedMinor: number | null;
  /** max(0, utility(agreed) - utility(initialOffer)); null without an agreement. */
  gainMinor: number | null;
}

/**
 * Money result of a finished session. Concessions logged in the turn rows are never added on
 * top: the final gap is only the distance between the reservation and the agreed amount.
 */
export function computeMoneyOutcome(config: ScenarioConfig, state: CoreState): MoneyOutcome {
  if (state.ended !== 'accepted' || state.agreedMinor === null) {
    return { agreedMinor: null, leftOnTableMinor: null, leftOnTableAnnualizedMinor: null, gainMinor: null };
  }
  const { objective } = config;
  const agreed = state.agreedMinor;
  const leftOnTableMinor = Math.max(0, utility(objective, config.reservationAmountMinor) - utility(objective, agreed));
  const gainMinor = Math.max(0, utility(objective, agreed) - utility(objective, config.initialOfferMinor));
  return {
    agreedMinor: agreed,
    leftOnTableMinor,
    leftOnTableAnnualizedMinor: annualize(leftOnTableMinor, config.period),
    gainMinor,
  };
}

export function offerDelta(objective: Objective, before: number | null, after: number | null): number {
  if (before === null || after === null) return 0;
  return utility(objective, after) - utility(objective, before);
}

export function userConcession(objective: Objective, previousAsk: number | null, newAsk: number | null): number {
  if (previousAsk === null || newAsk === null) return 0;
  return Math.max(0, utility(objective, previousAsk) - utility(objective, newAsk));
}

const MOVE_LABELS: Record<TurnRecord['move']['type'], string> = {
  state_number: 'Stated a number',
  justify: 'Gave a reason',
  concede: 'Conceded',
  ask_question: 'Asked a question',
  hold_silence: 'Held the silence',
  ultimatum: 'Gave an ultimatum',
  accept: 'Accepted',
  offtopic: 'Off topic',
};

export function moveLabel(type: TurnRecord['move']['type']): string {
  return MOVE_LABELS[type];
}

function describeTurn(config: ScenarioConfig, record: TurnRecord, delta: number, concession: number): string {
  const { move, action, before, after } = record;
  const role = `Your ${config.counterpartRole.toLowerCase()}`;
  const amount = move.amountMinor !== null ? formatMoney(move.amountMinor, config.period) : null;
  const parts: string[] = [];
  switch (move.type) {
    case 'state_number':
      parts.push(amount ? `You asked for ${amount}${move.hasReason ? ' with a reason' : ' and gave no reason'}.` : 'You named more than one number, so nothing moved.');
      break;
    case 'justify':
      parts.push('You backed your number with a reason.');
      break;
    case 'concede':
      parts.push(amount ? `You dropped to ${amount}${concession > 0 ? `, ${formatMoney(concession)} below your last ask` : ''}.` : 'You signalled you would accept less.');
      break;
    case 'ask_question':
      parts.push('You asked a question instead of conceding.');
      break;
    case 'hold_silence':
      parts.push('You let the objection sit without filling the silence.');
      break;
    case 'ultimatum':
      parts.push(before.trust < 40 ? 'You gave an ultimatum before trust was there.' : 'You gave an ultimatum with enough trust built.');
      break;
    case 'accept':
      parts.push(after.agreedMinor !== null ? `You accepted ${formatMoney(after.agreedMinor, config.period)}.` : 'You tried to accept, but there was no offer on the table.');
      break;
    case 'offtopic':
      parts.push('The reply did not move the conversation.');
      break;
  }
  switch (action.kind) {
    case 'concede':
      parts.push(`${role} moved to ${formatMoney(action.toMinor, config.period)}${delta > 0 ? ` (${formatMoney(delta)} better for you)` : ''}.`);
      break;
    case 'object':
      parts.push(`${role} raised an objection.`);
      break;
    case 'accept':
      if (move.type !== 'accept') parts.push(`${role} took the deal at ${formatMoney(action.atMinor, config.period)}.`);
      break;
    case 'walk_away':
      parts.push(`${role} ended the conversation.`);
      break;
    case 'probe':
      parts.push(`${role} explained what would help.`);
      break;
    case 'hold':
      if (move.type !== 'accept') parts.push(`${role} held the number.`);
      break;
  }
  return parts.join(' ');
}

function rowQuality(record: TurnRecord, delta: number, concession: number, outcome: MoneyOutcome, isLast: boolean): DebriefRow['quality'] {
  const patienceDelta = record.after.patience - record.before.patience;
  if (record.action.kind === 'walk_away') return 'cost';
  if (concession > 0) return 'cost';
  if (record.move.type === 'accept' && isLast && (outcome.leftOnTableMinor ?? 0) > 0) return 'cost';
  if (record.move.type === 'ultimatum' && record.before.trust < 40) return 'cost';
  if (record.move.type === 'state_number' && !record.move.hasReason && record.move.amountMinor !== null) return 'cost';
  if (patienceDelta <= -5) return 'cost';
  if (delta > 0) return 'good';
  if (record.after.clearedObjectionIds.length > record.before.clearedObjectionIds.length) return 'good';
  if (record.move.type === 'state_number' && record.move.hasReason) return 'good';
  if (record.move.type === 'ask_question') return 'neutral';
  return 'neutral';
}

/** Deterministic better line for a costly move; models may refine wording but never numbers. */
export function templateBetterLine(config: ScenarioConfig, record: TurnRecord): string | null {
  const ask = record.before.userLastMinor ?? config.targetMinor;
  const askText = formatMoney(ask, config.period);
  const target = formatMoney(config.targetMinor, config.period);
  switch (record.move.type) {
    case 'state_number':
      if (!record.move.hasReason && record.move.amountMinor !== null) {
        return `I'm asking for ${formatMoney(record.move.amountMinor, config.period)} because of what I delivered this year — I can walk you through the results.`;
      }
      return null;
    case 'concede':
      return `Before I move, help me understand what's blocking ${askText}. What would make it workable?`;
    case 'ultimatum':
      return `I'd like to find a number we can both stand behind. Here's why ${target} is fair for the role.`;
    case 'accept': {
      const goal = record.after.agreedMinor !== null && !isBetter(config.objective, config.targetMinor, record.after.agreedMinor) ? config.reservationAmountMinor : config.targetMinor;
      return `Before we close, I'd like to revisit the number — ${formatMoney(goal, config.period)} reflects the scope I'm taking on.`;
    }
    case 'offtopic':
      return `Coming back to the number: I'm asking for ${askText}, and here's why.`;
    default:
      if (record.action.kind === 'walk_away') return `Let's take a step back — what would you need to see from me to reach ${askText}?`;
      return null;
  }
}

/** Ledger rows computed purely from before/after snapshots of each committed turn. */
export function buildDebriefRows(
  config: ScenarioConfig,
  turns: readonly TurnRecord[],
  finalState: CoreState,
  voiceByTurnId: ReadonlyMap<string, TurnVoice> = new Map(),
): DebriefRow[] {
  const outcome = computeMoneyOutcome(config, finalState);
  return turns.map((record, index) => {
    const delta = offerDelta(config.objective, record.before.offerMinor, record.after.offerMinor);
    const concession = userConcession(config.objective, record.before.userLastMinor, record.after.userLastMinor);
    const quality = rowQuality(record, delta, concession, outcome, index === turns.length - 1);
    return {
      turnId: record.turnId,
      turn: record.turn,
      move: record.move.type,
      userText: record.input.text,
      counterpartText: record.replyText,
      actionKind: record.action.kind,
      note: describeTurn(config, record, delta, concession),
      offerDeltaMinor: delta,
      userConcessionMinor: concession,
      meterEffect: {
        patience: record.after.patience - record.before.patience,
        trust: record.after.trust - record.before.trust,
      },
      quality,
      voice: voiceByTurnId.get(record.turnId) ?? null,
      betterLine: quality === 'cost' ? templateBetterLine(config, record) : null,
    };
  });
}

export function outcomeSummary(config: ScenarioConfig, state: CoreState, finalOfferMinor: number | null): string {
  const outcome = computeMoneyOutcome(config, state);
  const ceiling = formatMoney(config.reservationAmountMinor, config.period);
  if (outcome.agreedMinor === null) {
    const where = finalOfferMinor !== null ? ` The last offer on the table was ${formatMoney(finalOfferMinor, config.period)}.` : '';
    const why = state.ended === 'walked_away' ? 'Your counterpart ended the conversation.' : state.ended === 'timeout' ? 'Time ran out.' : 'You stopped the round.';
    return `No agreement. ${why}${where} The scenario's limit was ${ceiling}.`;
  }
  const stopped = formatMoney(outcome.agreedMinor, config.period);
  const limitWord = config.objective === 'maximize' ? 'ceiling' : 'floor';
  if (outcome.leftOnTableMinor === 0) return `You stopped at ${stopped}, the scenario's ${limitWord}. Nothing left on the table against your range.`;
  return `You stopped at ${stopped}. The ${limitWord} was ${ceiling}.`;
}
