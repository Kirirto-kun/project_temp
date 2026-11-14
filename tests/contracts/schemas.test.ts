import { describe, expect, it } from 'vitest';
import { AudioManifestSchema, QuizAnswersSchema, ScenarioConfigSchema, VoiceBaselineSchema, MoveSchema } from '@/contracts';
import { dollarsToMinor } from '@/domain/money';
import { PERSONAS, buildBaseScenario } from '@/scenarios';
import { RAISE_QUIZ, RENT_QUIZ, INSUFFICIENT_BASELINE } from '@/testing/fixtures';

describe('money units', () => {
  it('stores $104,000 as 10_400_000 cents', () => {
    expect(dollarsToMinor(104_000)).toBe(10_400_000);
  });
  it('rejects fractions of a cent and non-finite values', () => {
    expect(() => dollarsToMinor(1.005)).toThrow();
    expect(() => dollarsToMinor(Number.NaN)).toThrow();
    expect(() => dollarsToMinor(Number.POSITIVE_INFINITY)).toThrow();
  });
});

describe('QuizAnswers', () => {
  it('accepts a yearly raise and a monthly rent', () => {
    expect(QuizAnswersSchema.safeParse(RAISE_QUIZ).success).toBe(true);
    expect(QuizAnswersSchema.safeParse(RENT_QUIZ).success).toBe(true);
  });
  it('rejects marketLow above marketHigh', () => {
    const result = QuizAnswersSchema.safeParse({ ...RAISE_QUIZ, marketLowMinor: 12_000_000 });
    expect(result.success).toBe(false);
  });
  it('rejects negative, fractional and NaN amounts', () => {
    for (const bad of [-1, 10.5, Number.NaN, 0, 10_000_000_001]) {
      expect(QuizAnswersSchema.safeParse({ ...RAISE_QUIZ, currentMinor: bad }).success).toBe(false);
    }
  });
  it('rejects a monthly salary and a yearly rent', () => {
    expect(QuizAnswersSchema.safeParse({ ...RAISE_QUIZ, period: 'month' }).success).toBe(false);
    expect(QuizAnswersSchema.safeParse({ ...RENT_QUIZ, period: 'year' }).success).toBe(false);
  });
  it('requires the target on the better side of the current amount', () => {
    expect(QuizAnswersSchema.safeParse({ ...RAISE_QUIZ, targetMinor: 9_000_000 }).success).toBe(false);
    expect(QuizAnswersSchema.safeParse({ ...RENT_QUIZ, targetMinor: 220_000 }).success).toBe(false);
  });
  it('requires a direction for custom quizzes', () => {
    expect(QuizAnswersSchema.safeParse({ ...RAISE_QUIZ, kind: 'custom' }).success).toBe(false);
    expect(QuizAnswersSchema.safeParse({ ...RAISE_QUIZ, kind: 'custom', objective: 'maximize' }).success).toBe(true);
  });
  it('rejects a non-USD currency', () => {
    expect(QuizAnswersSchema.safeParse({ ...RAISE_QUIZ, currency: 'EUR' }).success).toBe(false);
  });
});

describe('ScenarioConfig', () => {
  it('derives reservation from the market range and keeps it deterministic', () => {
    const raise = buildBaseScenario(RAISE_QUIZ);
    expect(raise.objective).toBe('maximize');
    expect(raise.reservationAmountMinor).toBe(RAISE_QUIZ.marketHighMinor);
    expect(raise.initialOfferMinor).toBe(RAISE_QUIZ.currentMinor);
    expect(buildBaseScenario(RAISE_QUIZ)).toEqual(raise);
    const rent = buildBaseScenario(RENT_QUIZ);
    expect(rent.objective).toBe('minimize');
    expect(rent.reservationAmountMinor).toBe(RENT_QUIZ.marketLowMinor);
    expect(ScenarioConfigSchema.safeParse(rent).success).toBe(true);
  });
  it('rejects a counterpart that does not play the kind', () => {
    expect(() => buildBaseScenario({ ...RAISE_QUIZ, avatarId: 'linda-park' })).toThrow(/does not play/);
  });
  it('rejects an initial offer already past the reservation', () => {
    const raise = buildBaseScenario(RAISE_QUIZ);
    expect(ScenarioConfigSchema.safeParse({ ...raise, initialOfferMinor: 12_000_000 }).success).toBe(false);
  });
});

describe('catalog', () => {
  it('has 6–8 personas with unique avatar ids covering all four archetypes', () => {
    expect(PERSONAS.length).toBeGreaterThanOrEqual(6);
    expect(PERSONAS.length).toBeLessThanOrEqual(8);
    expect(new Set(PERSONAS.map((p) => p.avatarId)).size).toBe(PERSONAS.length);
    expect(new Set(PERSONAS.map((p) => p.archetype)).size).toBe(4);
  });
});

describe('voice contracts', () => {
  it('allows null measurements instead of zeros', () => {
    expect(VoiceBaselineSchema.safeParse(INSUFFICIENT_BASELINE).success).toBe(true);
  });
  it('validates manifest purposes and intervals', () => {
    const base = { recordingId: 'rec_12345678', durationMs: 10_000, mimeType: 'audio/webm', timebase: 'recording_ms' as const, samples: [] };
    expect(AudioManifestSchema.safeParse({ ...base, purpose: 'baseline', sessionId: null, intakeId: null, turns: [] }).success).toBe(true);
    expect(AudioManifestSchema.safeParse({ ...base, purpose: 'baseline', sessionId: 'ses_1', intakeId: null, turns: [] }).success).toBe(false);
    expect(
      AudioManifestSchema.safeParse({ ...base, purpose: 'session', sessionId: 'ses_1', intakeId: null, turns: [{ turnId: 't1', t0Ms: 500, t1Ms: 400 }] }).success,
    ).toBe(false);
    expect(
      AudioManifestSchema.safeParse({ ...base, purpose: 'session', sessionId: 'ses_1', intakeId: null, turns: [{ turnId: 't1', t0Ms: 500, t1Ms: 20_000 }] }).success,
    ).toBe(false);
    expect(
      AudioManifestSchema.safeParse({ ...base, purpose: 'intake', sessionId: null, intakeId: 'int_1', turns: [{ turnId: 't1', t0Ms: 0, t1Ms: 900 }] }).success,
    ).toBe(true);
  });
  it('accepts only the eight move types', () => {
    expect(MoveSchema.safeParse({ type: 'flatter', amountMinor: null, hasReason: false, tone: 'neutral', raw: '' }).success).toBe(false);
  });
});
