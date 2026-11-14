import { describe, expect, it } from 'vitest';
import { applyMoneyPercent, buildQuizAnswers, normalizePracticeMoney, PracticeDraftError, suggestPracticeRange, validatePracticeDraft } from '@/domain/intake-handoff';
import { buildBaseScenario } from '@/scenarios';
import { createInitialState } from '@/engine';
import { FULL_DRAFT, MISSING_SALARY_DRAFT, NET_DRAFT, SALARY_95K, UNKNOWN_MARKET_DRAFT, EXAMPLE_DRAFT, RAISE_QUIZ } from '@/testing/fixtures';

describe('validatePracticeDraft', () => {
  it('a full profile only misses the counterpart until one is chosen', () => {
    expect(validatePracticeDraft(FULL_DRAFT)).toEqual({ ready: false, missingFields: ['avatarId'], errors: [] });
    expect(validatePracticeDraft({ ...FULL_DRAFT, avatarId: 'daniel-okafor' }).ready).toBe(true);
  });
  it('reports missing salary and unknown market as missing, never invented', () => {
    expect(validatePracticeDraft(MISSING_SALARY_DRAFT).missingFields).toContain('currentMinor');
    const unknown = validatePracticeDraft(UNKNOWN_MARKET_DRAFT);
    expect(unknown.missingFields).toEqual(expect.arrayContaining(['marketLowMinor', 'marketHighMinor', 'rangeSource']));
  });
  it('rejects another currency and an unavailable kind', () => {
    expect(validatePracticeDraft({ ...FULL_DRAFT, currency: 'EUR' as 'USD', avatarId: 'x' }).errors[0]?.code).toBe('unsupported_currency');
    expect(validatePracticeDraft({ ...FULL_DRAFT, kind: 'custom', avatarId: 'x' }).errors[0]?.code).toBe('kind_unavailable');
  });
  it('keeps net as net', () => {
    expect(buildQuizAnswers(NET_DRAFT, 'daniel-okafor').moneyBasis).toBe('net');
  });
});

describe('buildQuizAnswers', () => {
  it('produces the same QuizAnswers as the quick form for the same data', () => {
    const quiz = buildQuizAnswers(FULL_DRAFT, 'daniel-okafor');
    expect(quiz.currentMinor).toBe(RAISE_QUIZ.currentMinor);
    expect(buildBaseScenario(quiz).reservationAmountMinor).toBe(buildBaseScenario({ ...RAISE_QUIZ, avatarId: 'daniel-okafor' }).reservationAmountMinor);
  });
  it('throws a typed error on incomplete drafts', () => {
    expect(() => buildQuizAnswers(MISSING_SALARY_DRAFT, 'daniel-okafor')).toThrow(PracticeDraftError);
  });
  it('keeps example mode labelled', () => {
    expect(buildQuizAnswers(EXAMPLE_DRAFT, 'daniel-okafor')).toMatchObject({ inputMode: 'example', rangeSource: 'example' });
  });
  it('camera or speech assessment cannot change the scenario: it is not an input', () => {
    const quiz = buildQuizAnswers(FULL_DRAFT, 'daniel-okafor');
    const withNoise = buildQuizAnswers({ ...FULL_DRAFT, ...({ assessment: { nervous: true } } as object) }, 'daniel-okafor');
    expect(createInitialState(buildBaseScenario(withNoise))).toEqual(createInitialState(buildBaseScenario(quiz)));
  });
});

describe('money normalisation', () => {
  it('$95,000 + 15% = $109,250 as a candidate', () => {
    const candidate = applyMoneyPercent(SALARY_95K, 1_500);
    expect(candidate.value.amountMinor).toBe(10_925_000);
    expect(candidate.requiresConfirmation).toBe(true);
    expect(candidate.formula).toBe('$95,000/year + 15% = $109,250/year');
  });
  it('converts month to year and back with explicit rounding', () => {
    expect(normalizePracticeMoney({ ...SALARY_95K, amountMinor: 800_000, period: 'month' }, 'year').value.amountMinor).toBe(9_600_000);
    expect(() => normalizePracticeMoney({ ...SALARY_95K, amountMinor: 10_000_001 }, 'month')).toThrow(/rounding/);
    expect(normalizePracticeMoney({ ...SALARY_95K, amountMinor: 10_000_001 }, 'month', { rounding: 'nearest_cent' }).value.amountMinor).toBe(833_333);
  });
  it('refuses other currencies and one-time conversions', () => {
    expect(() => normalizePracticeMoney({ ...SALARY_95K, currency: 'EUR' }, 'year')).toThrow(/EUR/);
    expect(() => normalizePracticeMoney({ ...SALARY_95K, period: 'one_time' }, 'year')).toThrow();
  });
});

describe('suggestPracticeRange', () => {
  it('raise: [current, target]; rent: [target, current]; requires confirmation', () => {
    expect(suggestPracticeRange(9_500_000, 11_000_000, 'maximize')).toMatchObject({ lowMinor: 9_500_000, highMinor: 11_000_000, rangeSource: 'practice_assumption', requiresConfirmation: true });
    expect(suggestPracticeRange(200_000, 180_000, 'minimize')).toMatchObject({ lowMinor: 180_000, highMinor: 200_000 });
  });
  it('refuses a target on the wrong side', () => {
    expect(suggestPracticeRange(9_500_000, 9_000_000, 'maximize')).toBeNull();
    expect(suggestPracticeRange(200_000, 210_000, 'minimize')).toBeNull();
  });
  it('labels the assumption', () => {
    expect(suggestPracticeRange(9_500_000, 11_000_000, 'maximize')?.explanation).toMatch(/not a market estimate/);
  });
});
