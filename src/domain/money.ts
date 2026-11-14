import type { Objective, Period, QuizAnswers } from '@/contracts/domain';
import { quizObjective } from '@/contracts/domain';

/**
 * utility(x) is +x when the user wants the number to go up (salary, offer) and -x when the
 * user wants it to go down (rent, bill). "Better for the user" always means larger utility.
 */
export function utility(objective: Objective, amountMinor: number): number {
  return objective === 'maximize' ? amountMinor : -amountMinor;
}

/** True when `a` is strictly better for the user than `b`. */
export function isBetter(objective: Objective, a: number, b: number): boolean {
  return utility(objective, a) > utility(objective, b);
}

/** The amount that is better for the user. */
export function better(objective: Objective, a: number, b: number): number {
  return utility(objective, a) >= utility(objective, b) ? a : b;
}

/** The amount that is worse for the user. */
export function worse(objective: Objective, a: number, b: number): number {
  return utility(objective, a) <= utility(objective, b) ? a : b;
}

/**
 * Move `from` toward `toward` by at most `step` (in cents), never past `toward`.
 * Works in both directions; returns an integer number of cents.
 */
export function stepToward(from: number, toward: number, step: number): number {
  const s = Math.max(0, Math.floor(step));
  if (toward > from) return Math.min(toward, from + s);
  if (toward < from) return Math.max(toward, from - s);
  return from;
}

export function assertSafeMinor(value: number, label = 'amount'): number {
  if (!Number.isFinite(value) || !Number.isSafeInteger(value)) {
    throw new RangeError(`${label} must be a safe integer number of cents`);
  }
  return value;
}

/** Converts whole or fractional dollars to cents; rejects fractions of a cent. */
export function dollarsToMinor(dollars: number): number {
  if (!Number.isFinite(dollars)) throw new RangeError('amount must be finite');
  const cents = Math.round(dollars * 100);
  if (Math.abs(cents - dollars * 100) > 1e-6) throw new RangeError('fractions of a cent are not allowed');
  return assertSafeMinor(cents);
}

export function annualize(amountMinor: number, period: Period): number | null {
  if (period === 'year') return amountMinor;
  if (period === 'month') return assertSafeMinor(amountMinor * 12, 'annualized amount');
  return null;
}

export interface QuizPreview {
  /** max(0, utility(target) - utility(current)), in the quiz period. */
  gapMinor: number;
  /** gap per year: equal for year, x12 for month, null for one-time amounts. */
  annualizedGapMinor: number | null;
}

/**
 * Gap between the user's current amount and their own target. It describes the user's goal,
 * not a proven loss.
 */
export function getQuizPreview(quiz: Pick<QuizAnswers, 'kind' | 'objective' | 'currentMinor' | 'targetMinor' | 'period'>): QuizPreview {
  const objective = quizObjective(quiz) ?? 'maximize';
  const gapMinor = Math.max(0, utility(objective, quiz.targetMinor) - utility(objective, quiz.currentMinor));
  return { gapMinor, annualizedGapMinor: annualize(gapMinor, quiz.period) };
}

const PERIOD_SUFFIX: Record<Period, string> = { year: '/year', month: '/month', one_time: '' };

export function periodSuffix(period: Period | null | undefined): string {
  return period ? PERIOD_SUFFIX[period] : '';
}

/**
 * Formats cents as US dollars: 10_400_000 -> "$104,000"; 20_050 -> "$200.50".
 * Whole-dollar amounts omit the cents.
 */
export function formatMoney(amountMinor: number, period?: Period | null): string {
  const negative = amountMinor < 0;
  const abs = Math.abs(amountMinor);
  const dollars = Math.floor(abs / 100);
  const cents = abs % 100;
  const whole = dollars.toLocaleString('en-US');
  const body = cents === 0 ? `$${whole}` : `$${whole}.${String(cents).padStart(2, '0')}`;
  return `${negative ? '-' : ''}${body}${periodSuffix(period)}`;
}

/** Signed money for deltas: "+$2,000" / "-$500" / "$0". */
export function formatMoneyDelta(amountMinor: number): string {
  if (amountMinor === 0) return '$0';
  return `${amountMinor > 0 ? '+' : '-'}${formatMoney(Math.abs(amountMinor))}`;
}

export function periodLabel(period: Period): string {
  return period === 'year' ? 'per year' : period === 'month' ? 'per month' : 'one-time';
}
