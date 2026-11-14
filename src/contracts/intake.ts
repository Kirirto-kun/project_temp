import { z } from 'zod';
import { MinorAmountSchema, PeriodSchema, QuizAnswersBaseSchema, type QuizAnswers } from './domain';

/** Shared boundary between the first call (D) and the practice engine, intakeContractVersion 1. */
export const INTAKE_CONTRACT_VERSION = 1 as const;

/**
 * A money value as the user stated it. Currency is kept as said (ISO-like code) so that a
 * non-USD answer is preserved and explained instead of being silently relabelled as USD.
 */
export const MoneyAnswerSchema = z.object({
  amountMinor: MinorAmountSchema,
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'Use a three-letter currency code.'),
  period: PeriodSchema,
  basis: z.enum(['gross', 'net', 'unspecified']),
});
export type MoneyAnswer = z.infer<typeof MoneyAnswerSchema>;

export const MoneyCandidateSchema = z.object({
  value: MoneyAnswerSchema,
  formula: z.string(),
  requiresConfirmation: z.literal(true),
});
export type MoneyCandidate = z.infer<typeof MoneyCandidateSchema>;

export type QuizField = keyof QuizAnswers;

export const QUIZ_FIELDS = Object.keys(QuizAnswersBaseSchema.shape) as QuizField[];

export const FieldErrorSchema = z.object({
  field: z.union([z.enum(QUIZ_FIELDS as [QuizField, ...QuizField[]]), z.literal('_form')]),
  code: z.string(),
  message: z.string(),
});
export type FieldError = z.infer<typeof FieldErrorSchema>;

export const PracticeRangeSuggestionSchema = z.object({
  lowMinor: MinorAmountSchema,
  highMinor: MinorAmountSchema,
  rangeSource: z.literal('practice_assumption'),
  explanation: z.string(),
  requiresConfirmation: z.literal(true),
});
export type PracticeRangeSuggestion = z.infer<typeof PracticeRangeSuggestionSchema>;

export const QuizDraftSchema = QuizAnswersBaseSchema.partial();
export type QuizDraft = Partial<QuizAnswers>;

export const IntakeHandoffSchema = z.object({
  intakeId: z.string(),
  profileRevision: z.number().int().min(0),
  confirmedAt: z.string(),
  quizDraft: QuizDraftSchema,
  missingFields: z.array(z.enum(QUIZ_FIELDS as [QuizField, ...QuizField[]])),
  suggestedAvatarId: z.string().nullable(),
  referenceKind: z.enum(['observed_intake', 'none']),
  assessmentId: z.string().nullable(),
  mode: z.enum(['personal', 'example']),
});
export type IntakeHandoff = z.infer<typeof IntakeHandoffSchema>;
