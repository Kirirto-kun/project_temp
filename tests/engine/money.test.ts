import { describe, expect, it } from 'vitest';
import { annualize, formatMoney, formatMoneyDelta, getQuizPreview, stepToward, utility } from '@/domain/money';
import { applyBasisPoints, parseAmounts, parsePercents, resolveAmounts } from '@/domain/money-parse';
import { RAISE_QUIZ, RENT_QUIZ } from '@/testing/fixtures';

describe('formatMoney', () => {
  it('formats whole and fractional dollars with periods', () => {
    expect(formatMoney(10_400_000)).toBe('$104,000');
    expect(formatMoney(20_000, 'month')).toBe('$200/month');
    expect(formatMoney(20_050)).toBe('$200.50');
    expect(formatMoneyDelta(-50_000)).toBe('-$500');
    expect(formatMoneyDelta(0)).toBe('$0');
  });
});

describe('utility and steps', () => {
  it('flips the sign for minimize', () => {
    expect(utility('maximize', 5)).toBe(5);
    expect(utility('minimize', 5)).toBe(-5);
  });
  it('steps toward a value without overshooting', () => {
    expect(stepToward(100, 1_000, 300)).toBe(400);
    expect(stepToward(100, 250, 300)).toBe(250);
    expect(stepToward(1_000, 100, 300)).toBe(700);
  });
  it('annualizes month amounts only', () => {
    expect(annualize(20_000, 'month')).toBe(240_000);
    expect(annualize(20_000, 'year')).toBe(20_000);
    expect(annualize(20_000, 'one_time')).toBeNull();
  });
});

describe('getQuizPreview', () => {
  it('measures the gap to the user target in both directions', () => {
    expect(getQuizPreview(RAISE_QUIZ)).toEqual({ gapMinor: 1_500_000, annualizedGapMinor: 1_500_000 });
    expect(getQuizPreview(RENT_QUIZ)).toEqual({ gapMinor: 20_000, annualizedGapMinor: 240_000 });
    expect(getQuizPreview({ ...RENT_QUIZ, kind: 'bill', period: 'one_time' })).toEqual({ gapMinor: 20_000, annualizedGapMinor: null });
  });
});

describe('parseAmounts', () => {
  const values = (text: string) => parseAmounts(text).map((a) => a.valueMinor);
  it('reads digits, k suffixes and separators', () => {
    expect(values('I want $110,000')).toEqual([11_000_000]);
    expect(values('Make it 110k')).toEqual([11_000_000]);
    expect(values('$1.5k a month')).toEqual([150_000]);
    expect(values('$1,999.99')).toEqual([199_999]);
  });
  it('reads number words', () => {
    expect(values('a hundred and ten thousand dollars')).toEqual([11_000_000]);
    expect(values('ninety-five thousand')).toEqual([9_500_000]);
    expect(values('ninety grand')).toEqual([9_000_000]);
    expect(values('eighteen hundred')).toEqual([180_000]);
  });
  it('skips percentages, years, counts and durations', () => {
    expect(values('I led 3 projects over 2 years since 2021')).toEqual([]);
    expect(values('That is 15% more')).toEqual([]);
    expect(values('one question')).toEqual([]);
  });
  it('inherits magnitude across a range', () => {
    expect(values('somewhere in 110-115k')).toEqual([11_000_000, 11_500_000]);
  });
  it('keeps a foreign currency marker', () => {
    expect(parseAmounts('€90,000')[0]?.currency).toBe('EUR');
  });
});

describe('resolveAmounts', () => {
  it('reads bare thousands in the units of the scenario', () => {
    expect(resolveAmounts('I was thinking 110', 9_500_000)).toEqual([11_000_000]);
    expect(resolveAmounts('I can pay 1800', 200_000)).toEqual([180_000]);
    expect(resolveAmounts('I can pay 110', 200_000)).toEqual([]);
  });
});

describe('percentages', () => {
  it('parses percent with direction', () => {
    expect(parsePercents('a 15% raise')).toEqual([expect.objectContaining({ basisPoints: 1_500, direction: 'up' })]);
    expect(parsePercents('ten percent less')).toEqual([expect.objectContaining({ basisPoints: 1_000, direction: 'down' })]);
    expect(applyBasisPoints(9_500_000, 1_500, 'up')).toBe(10_925_000);
  });
});
