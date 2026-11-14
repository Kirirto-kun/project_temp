import {
  QuizAnswersSchema,
  STANDARD_KINDS,
  allowedPeriodsForKind,
  quizObjective,
  type Objective,
  type QuizAnswers,
  type ScenarioKind,
} from '@/contracts/domain';
import type { FieldError, MoneyAnswer, MoneyCandidate, PracticeRangeSuggestion, QuizDraft, QuizField } from '@/contracts/intake';
import { formatMoney } from './money';

export class PracticeDraftError extends Error {
  readonly errors: FieldError[];
  readonly missingFields: QuizField[];
  constructor(errors: FieldError[], missingFields: QuizField[]) {
    super(errors[0]?.message ?? `Missing ${missingFields.join(', ')}`);
    this.name = 'PracticeDraftError';
    this.errors = errors;
    this.missingFields = missingFields;
  }
}

export class MoneyNormalizationError extends Error {
  readonly code: 'unsupported_currency' | 'period_not_convertible' | 'rounding_required' | 'out_of_range';
  constructor(code: MoneyNormalizationError['code'], message: string) {
    super(message);
    this.name = 'MoneyNormalizationError';
    this.code = code;
  }
}

/** Fields the engine needs that a person has to provide (or explicitly choose a default for). */
const REQUIRED_FIELDS: QuizField[] = [
  'kind',
  'counterpartRole',
  'currentMinor',
  'targetMinor',
  'marketLowMinor',
  'marketHighMinor',
  'period',
  'avatarId',
  'currency',
  'moneyBasis',
  'inputMode',
  'rangeSource',
];

export interface PracticeDraftValidation {
  ready: boolean;
  missingFields: QuizField[];
  errors: FieldError[];
}

export interface ValidateOptions {
  availableKinds?: readonly ScenarioKind[];
}

function withDefaults(draft: QuizDraft): QuizDraft {
  return {
    description: '',
    fear: '',
    conversationDate: null,
    ...draft,
  };
}

export function validatePracticeDraft(draft: QuizDraft, options: ValidateOptions = {}): PracticeDraftValidation {
  const availableKinds = options.availableKinds ?? STANDARD_KINDS;
  const filled = withDefaults(draft);
  const missingFields = REQUIRED_FIELDS.filter((field) => filled[field] === undefined || filled[field] === null || filled[field] === '');
  const errors: FieldError[] = [];

  if (filled.currency !== undefined && filled.currency !== 'USD') {
    errors.push({ field: 'currency', code: 'unsupported_currency', message: 'Practice rounds use US dollars in this version.' });
  }
  if (filled.kind !== undefined && !availableKinds.includes(filled.kind)) {
    errors.push({ field: 'kind', code: 'kind_unavailable', message: `A ${filled.kind} practice is not available here.` });
  }
  if (filled.kind !== undefined && filled.period !== undefined && !allowedPeriodsForKind(filled.kind).includes(filled.period)) {
    errors.push({ field: 'period', code: 'period_mismatch', message: `A ${filled.kind} practice cannot use a ${filled.period} amount.` });
  }
  if (filled.moneyBasis !== undefined && !['gross', 'net', 'unspecified'].includes(filled.moneyBasis)) {
    errors.push({ field: 'moneyBasis', code: 'invalid_basis', message: 'Choose gross, net or not specified.' });
  }

  if (missingFields.length === 0 && errors.length === 0) {
    const parsed = QuizAnswersSchema.safeParse(filled);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = (issue.path[0] as QuizField | undefined) ?? '_form';
        errors.push({ field, code: 'invalid', message: issue.message });
      }
    }
  }

  return { ready: missingFields.length === 0 && errors.length === 0, missingFields, errors };
}

/** Builds QuizAnswers from a complete draft, re-validating everything; throws PracticeDraftError. */
export function buildQuizAnswers(draft: QuizDraft, avatarId: string, options: ValidateOptions = {}): QuizAnswers {
  const candidate = withDefaults({ ...draft, avatarId });
  const validation = validatePracticeDraft(candidate, options);
  if (!validation.ready) throw new PracticeDraftError(validation.errors, validation.missingFields);
  return QuizAnswersSchema.parse(candidate);
}

/**
 * Converts a stated amount into the practice period. Only month <-> year inside USD is allowed;
 * there is no FX and no gross <-> net conversion. The result always requires confirmation.
 */
export function normalizePracticeMoney(
  input: MoneyAnswer,
  targetPeriod: QuizAnswers['period'],
  options: { rounding?: 'nearest_cent' } = {},
): MoneyCandidate {
  if (input.currency !== 'USD') {
    throw new MoneyNormalizationError('unsupported_currency', `Amounts in ${input.currency} are kept as you said them; practice rounds use USD.`);
  }
  if (input.period === targetPeriod) {
    return { value: { ...input }, formula: `${formatMoney(input.amountMinor, input.period)} as stated`, requiresConfirmation: true };
  }
  if (input.period === 'one_time' || targetPeriod === 'one_time') {
    throw new MoneyNormalizationError('period_not_convertible', 'A one-time amount cannot be converted to a monthly or yearly amount.');
  }
  let amountMinor: number;
  let formula: string;
  if (input.period === 'month' && targetPeriod === 'year') {
    amountMinor = input.amountMinor * 12;
    formula = `${formatMoney(input.amountMinor, 'month')} × 12 = ${formatMoney(amountMinor, 'year')}`;
  } else {
    const exact = input.amountMinor / 12;
    if (!Number.isInteger(exact) && options.rounding !== 'nearest_cent') {
      throw new MoneyNormalizationError('rounding_required', 'Dividing by 12 leaves a fraction of a cent; confirm rounding to the nearest cent.');
    }
    amountMinor = Math.round(exact);
    formula = `${formatMoney(input.amountMinor, 'year')} ÷ 12 ${Number.isInteger(exact) ? '=' : '≈'} ${formatMoney(amountMinor, 'month')}${Number.isInteger(exact) ? '' : ' (rounded to the cent)'}`;
  }
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 1 || amountMinor > 10_000_000_000) {
    throw new MoneyNormalizationError('out_of_range', 'The converted amount is outside the supported range.');
  }
  return { value: { ...input, amountMinor, period: targetPeriod }, formula, requiresConfirmation: true };
}

/**
 * "15% more than my current pay": amount × (1 + bp / 10 000), rounded to the cent when needed.
 * Negative basis points express a decrease.
 */
export function applyMoneyPercent(input: MoneyAnswer, percentBasisPoints: number): MoneyCandidate {
  if (!Number.isInteger(percentBasisPoints) || percentBasisPoints <= -10_000 || percentBasisPoints > 100_000) {
    throw new MoneyNormalizationError('out_of_range', 'The percentage is outside the supported range.');
  }
  const exact = (input.amountMinor * (10_000 + percentBasisPoints)) / 10_000;
  const amountMinor = Math.round(exact);
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 1 || amountMinor > 10_000_000_000) {
    throw new MoneyNormalizationError('out_of_range', 'The result is outside the supported range.');
  }
  const pct = (Math.abs(percentBasisPoints) / 100).toString();
  const sign = percentBasisPoints >= 0 ? '+' : '−';
  const formula = `${formatMoney(input.amountMinor, input.period)} ${sign} ${pct}% ${Number.isInteger(exact) ? '=' : '≈'} ${formatMoney(amountMinor, input.period)}`;
  return { value: { ...input, amountMinor }, formula, requiresConfirmation: true };
}

/**
 * Practice bounds between the user's current and target amounts, offered only as an explicit,
 * separately confirmed assumption when the market range is unknown. Not a market estimate.
 */
export function suggestPracticeRange(currentMinor: number, targetMinor: number, objective: Objective): PracticeRangeSuggestion | null {
  if (objective === 'maximize') {
    if (!(targetMinor > currentMinor)) return null;
    return {
      lowMinor: currentMinor,
      highMinor: targetMinor,
      rangeSource: 'practice_assumption',
      explanation: `Practice bounds from your current ${formatMoney(currentMinor)} to your target ${formatMoney(targetMinor)}. Practice assumption — not a market estimate.`,
      requiresConfirmation: true,
    };
  }
  if (!(targetMinor < currentMinor)) return null;
  return {
    lowMinor: targetMinor,
    highMinor: currentMinor,
    rangeSource: 'practice_assumption',
    explanation: `Practice bounds from your target ${formatMoney(targetMinor)} to the current ${formatMoney(currentMinor)}. Practice assumption — not a market estimate.`,
    requiresConfirmation: true,
  };
}

export function draftObjective(draft: QuizDraft): Objective | null {
  if (!draft.kind) return null;
  return quizObjective({ kind: draft.kind, objective: draft.objective });
}
