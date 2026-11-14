import { describe, expect, it, vi } from 'vitest';
import { analyzeOffer } from '@/intelligence/offer-analysis';
import { createCustomScenario, CustomScenarioError } from '@/intelligence/custom-scenario';
import { NO_MODEL, type ModelPorts } from '@/intelligence/ports';
import { RAISE_QUIZ } from '@/testing/fixtures';

const OFFER = `We are pleased to offer you the role of Senior Engineer.
Your annual base salary will be $150,000.
You are eligible for a target bonus of 10% of base, paid annually.
You will receive 4,000 RSUs vesting over four years.
A sign-on bonus of $15,000 is paid with your first paycheck.`;

describe('analyzeOffer', () => {
  it('extracts parts with sources, computes the bonus by code and never adds equity', async () => {
    const analysis = await analyzeOffer({ text: OFFER, currency: 'USD', period: 'year' }, NO_MODEL);
    expect(analysis.base).toMatchObject({ amountMinor: 15_000_000, guaranteed: true });
    expect(analysis.base.sourceText && OFFER.includes(analysis.base.sourceText)).toBe(true);
    expect(analysis.bonus).toMatchObject({ amountMinor: 1_500_000, guaranteed: false });
    expect(analysis.equity.amountMinor).toBeNull();
    expect(analysis.signOn.amountMinor).toBe(1_500_000);
    expect(analysis.guaranteedTotalMinor).toBe(16_500_000);
    expect(analysis.unknowns.join(' ')).toMatch(/Equity is mentioned without a dollar value/);
  });
  it('ignores model excerpts that are not verbatim', async () => {
    const deps: ModelPorts = { available: true, completeStructured: vi.fn().mockResolvedValue({ base: 'Base is $999,000', bonus: null, equity: null, signOn: null }) };
    const analysis = await analyzeOffer({ text: 'We would love to have you on the team, details to follow.', currency: 'USD', period: 'year' }, deps);
    expect(analysis.base.amountMinor).toBeNull();
    expect(analysis.guaranteedTotalMinor).toBeNull();
  });
});

describe('createCustomScenario', () => {
  const quiz = { ...RAISE_QUIZ, kind: 'custom' as const, objective: 'maximize' as const };
  it('fails clearly without a model instead of returning a standard scenario', async () => {
    await expect(createCustomScenario(quiz, 'Raising my freelance day rate with a long-time client.', NO_MODEL)).rejects.toBeInstanceOf(CustomScenarioError);
  });
  it('keeps money limits from the quiz', async () => {
    const deps: ModelPorts = {
      available: true,
      completeStructured: vi.fn().mockResolvedValue({
        suitable: true,
        reason: '',
        counterpartRole: 'Client',
        archetype: 'analyst',
        objections: [{ text: 'Other freelancers charge less for the same work.', clearedBy: ['justify'] }],
      }),
    };
    const config = await createCustomScenario(quiz, 'Raising my freelance day rate with a long-time client.', deps);
    expect(config.kind).toBe('custom');
    expect(config.reservationAmountMinor).toBe(quiz.marketHighMinor);
    expect(config.objections[0]?.id).toBe('custom_1');
  });
  it('refuses unsuitable descriptions', async () => {
    const deps: ModelPorts = {
      available: true,
      completeStructured: vi.fn().mockResolvedValue({ suitable: false, reason: 'This is not a money conversation.', counterpartRole: '', archetype: 'analyst', objections: [] }),
    };
    await expect(createCustomScenario(quiz, 'Write me a poem about negotiations please.', deps)).rejects.toMatchObject({ code: 'unsuitable' });
  });
});
