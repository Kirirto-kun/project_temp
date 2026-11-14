import type { IntakeHandoff, MoneyAnswer, QuizDraft } from '@/contracts/intake';

export const SALARY_95K: MoneyAnswer = { amountMinor: 9_500_000, currency: 'USD', period: 'year', basis: 'gross' };

export const FULL_DRAFT: QuizDraft = {
  kind: 'raise',
  counterpartRole: 'Manager',
  currentMinor: 9_500_000,
  targetMinor: 11_000_000,
  marketLowMinor: 10_000_000,
  marketHighMinor: 11_200_000,
  period: 'year',
  currency: 'USD',
  moneyBasis: 'gross',
  inputMode: 'personal',
  rangeSource: 'user_provided',
  userRole: 'Backend engineer',
  description: 'Took over the payments team.',
  fear: 'Budget is frozen.',
  conversationDate: null,
};

export const MISSING_SALARY_DRAFT: QuizDraft = { ...FULL_DRAFT, currentMinor: undefined };
export const UNKNOWN_MARKET_DRAFT: QuizDraft = { ...FULL_DRAFT, marketLowMinor: undefined, marketHighMinor: undefined, rangeSource: undefined };
export const NET_DRAFT: QuizDraft = { ...FULL_DRAFT, moneyBasis: 'net' };
export const EXAMPLE_DRAFT: QuizDraft = { ...FULL_DRAFT, inputMode: 'example', rangeSource: 'example' };

export const CONFIRMED_HANDOFF: IntakeHandoff = {
  intakeId: 'int_fixture',
  profileRevision: 3,
  confirmedAt: '2026-11-15T10:04:00.000Z',
  quizDraft: FULL_DRAFT,
  missingFields: ['avatarId'],
  suggestedAvatarId: 'daniel-okafor',
  referenceKind: 'observed_intake',
  assessmentId: 'asm_fixture',
  mode: 'personal',
};
