import { describe, expect, it } from 'vitest';
import { buildFeedback, FORBIDDEN_FEEDBACK, speechObservations, textObservations } from '@/onboarding/domain/assessment-rules';
import { emptyProfile } from '@/onboarding/domain/profile';

const profile = () => {
  const p = emptyProfile();
  p.kind = { value: 'raise', status: 'confirmed', sourceTurnId: null, revision: 1, formula: null };
  p.targetMoney = { value: { amountMinor: 11_000_000, currency: 'USD', period: 'year', basis: 'gross' }, status: 'confirmed', sourceTurnId: null, revision: 1, formula: null };
  return p;
};

describe('assessment rules', () => {
  it('flags an ask without a number and suggests naming the target', () => {
    const obs = textObservations("I'd like to talk about a raise.", profile());
    const { items } = buildFeedback(obs, profile(), false);
    expect(items.find((i) => i.category === 'improve')?.claim).toMatch(/without naming a number/);
    expect(items.find((i) => i.category === 'improve')?.suggestion).toContain('$110,000/year');
  });
  it('notices an amount below the user’s own target and an apology, with quotes', () => {
    const obs = textObservations("Sorry, I know it's a lot, but maybe $105,000?", profile());
    expect(obs.find((o) => o.kind === 'below_target')?.value).toBe('$105,000');
    expect(obs.find((o) => o.kind === 'apology')?.quote).toMatch(/sorry/i);
  });
  it('every feedback item has evidence and at most three items are shown', () => {
    const obs = textObservations('Because I took over the team, I am asking for $110,000.', profile());
    const { items } = buildFeedback(obs, profile(), false);
    expect(items.length).toBeLessThanOrEqual(3);
    for (const item of items) {
      expect(item.evidenceIds.length).toBeGreaterThan(0);
      for (const id of item.evidenceIds) expect(obs.some((o) => o.id === id)).toBe(true);
      expect(FORBIDDEN_FEEDBACK.test(`${item.claim} ${item.suggestion}`)).toBe(false);
    }
    expect(items[0]?.category).toBe('strength');
  });
  it('speech: fillers, a repeated word as an estimated candidate, the pause before the amount and pace', () => {
    const words = [
      { text: 'I', startMs: 0, endMs: 100 },
      { text: 'I', startMs: 150, endMs: 250 },
      { text: 'um', startMs: 300, endMs: 500 },
      { text: 'want', startMs: 600, endMs: 800 },
      { text: '$110,000', startMs: 2_900, endMs: 3_600 },
    ];
    const obs = speechObservations(words, 'rec_1');
    expect(obs.find((o) => o.kind === 'filler')?.quote).toBe('um');
    expect(obs.find((o) => o.kind === 'repetition')?.quality).toBe('estimated');
    expect(obs.find((o) => o.kind === 'pause_before_amount')?.value).toBe(2_100);
    expect(obs.find((o) => o.kind === 'pace')?.unit).toBe('words per minute');
  });
  it('no speech means no speech observations and no invented score', () => {
    expect(speechObservations([], null)).toEqual([]);
  });
});

describe('strength is not claimed next to an apology', () => {
  it('does not praise an early number that follows an apology', () => {
    const p = emptyProfile();
    const obs = textObservations("Sorry, I know it's a lot, but maybe $105,000?", p);
    const { items } = buildFeedback(obs, p, false);
    expect(items.find((i) => i.category === 'strength')).toBeUndefined();
  });
});
