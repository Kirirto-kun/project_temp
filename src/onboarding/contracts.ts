import { z } from 'zod';
import { MoneyAnswerSchema, IntakeHandoffSchema } from '@/contracts/intake';

/** Local schemas of the first-call vertical, intakeContractVersion 1. */
export const IntakePhaseSchema = z.enum(['lobby', 'connecting', 'interviewing', 'mini_practice', 'review', 'completed', 'interrupted', 'expired']);
export type IntakePhase = z.infer<typeof IntakePhaseSchema>;

export const FieldStatusSchema = z.enum(['unknown', 'candidate', 'confirmed', 'skipped']);
export type FieldStatus = z.infer<typeof FieldStatusSchema>;

export function fieldSchema<T extends z.ZodTypeAny>(value: T) {
  return z.object({
    value: value.nullable(),
    status: FieldStatusSchema,
    sourceTurnId: z.string().nullable(),
    revision: z.number().int().min(0),
    /** How a derived value was computed, e.g. "$95,000/year + 15% = $109,250/year". */
    formula: z.string().nullable(),
  });
}

export const RangeValueSchema = z.object({ lowMinor: z.number().int().positive(), highMinor: z.number().int().positive(), currency: z.string(), period: z.enum(['year', 'month', 'one_time']) });
export type RangeValue = z.infer<typeof RangeValueSchema>;

export const IntakeKindSchema = z.enum(['raise', 'offer', 'rent', 'bill']);

export const IntakeProfileSchema = z.object({
  userRole: fieldSchema(z.string().max(120)),
  kind: fieldSchema(IntakeKindSchema),
  counterpartRole: fieldSchema(z.string().max(80)),
  currentMoney: fieldSchema(MoneyAnswerSchema),
  targetMoney: fieldSchema(MoneyAnswerSchema),
  marketRange: fieldSchema(RangeValueSchema),
  practiceRange: fieldSchema(RangeValueSchema),
  reasons: fieldSchema(z.string().max(1_000)),
  conversationDate: fieldSchema(z.string().max(10)),
  fear: fieldSchema(z.string().max(500)),
  selfReportedNervousness: fieldSchema(z.string().max(300)),
});
export type IntakeProfile = z.infer<typeof IntakeProfileSchema>;
export type ProfileKey = keyof IntakeProfile;
export type IntakeFieldOf<K extends ProfileKey> = IntakeProfile[K];

export const ConsentsSchema = z.object({ audioAnalysis: z.boolean(), visualAnalysis: z.literal(false) });
export type Consents = z.infer<typeof ConsentsSchema>;

export const TranscriptItemSchema = z.object({
  turnId: z.string(),
  sequence: z.number().int(),
  role: z.enum(['user', 'coach']),
  text: z.string().max(4_000),
  recordingId: z.string().nullable(),
  spokenRangeMs: z.tuple([z.number(), z.number()]).nullable(),
});
export type TranscriptItem = z.infer<typeof TranscriptItemSchema>;

export const ObservationSchema = z.object({
  id: z.string(),
  recordingId: z.string().nullable(),
  kind: z.enum(['ask_without_number', 'number_position', 'apology', 'hedge', 'reason_given', 'below_target', 'filler', 'pause_before_amount', 'pace', 'repetition', 'self_report']),
  startMs: z.number().nullable(),
  endMs: z.number().nullable(),
  value: z.union([z.number(), z.string(), z.boolean()]).nullable(),
  unit: z.string().nullable(),
  quote: z.string().nullable(),
  quality: z.enum(['measured', 'estimated', 'self_reported']),
  source: z.enum(['scribe', 'acoustic', 'text', 'model', 'self_report']),
  modelVersion: z.string().nullable(),
  unavailableReason: z.string().nullable(),
});
export type Observation = z.infer<typeof ObservationSchema>;

export const FeedbackItemSchema = z.object({
  category: z.enum(['strength', 'improve', 'next_attempt']),
  claim: z.string(),
  evidenceIds: z.array(z.string()).min(1),
  quote: z.string().nullable(),
  suggestion: z.string(),
  confidenceLabel: z.enum(['observed', 'estimated', 'self_reported']),
  limitations: z.string().nullable(),
});
export type FeedbackItem = z.infer<typeof FeedbackItemSchema>;

export const IntakeAssessmentSchema = z.object({
  intakeId: z.string(),
  revision: z.number().int(),
  profileRevision: z.number().int(),
  consentVersion: z.number().int(),
  status: z.enum(['pending', 'ready', 'partial', 'unavailable']),
  practiceText: z.string().nullable(),
  observations: z.array(ObservationSchema),
  topFeedback: z.array(FeedbackItemSchema).max(3),
  nextPracticeFocus: z.string().nullable(),
  speechAvailable: z.boolean(),
  reason: z.string().nullable(),
  stale: z.boolean(),
});
export type IntakeAssessment = z.infer<typeof IntakeAssessmentSchema>;

export const PendingClarificationSchema = z.object({
  field: z.enum(['currentMoney', 'targetMoney', 'marketRange']),
  question: z.string(),
  proposal: z.union([MoneyAnswerSchema, RangeValueSchema]),
});
export type PendingClarification = z.infer<typeof PendingClarificationSchema>;

export const IntakeSessionSchema = z.object({
  id: z.string(),
  ownerId: z.string(),
  revision: z.number().int(),
  profileRevision: z.number().int(),
  phase: IntakePhaseSchema,
  profile: IntakeProfileSchema,
  consentVersion: z.number().int(),
  consents: ConsentsSchema,
  mode: z.enum(['text', 'audio']),
  mediaStatus: z.enum(['not_started', 'connecting', 'active', 'stopping', 'closed']),
  providerEpoch: z.number().int(),
  startedAt: z.string(),
  deadlineAt: z.string().nullable(),
  createdAt: z.string(),
  lastEventSeq: z.number().int(),
  transcript: z.array(TranscriptItemSchema),
  pending: PendingClarificationSchema.nullable(),
  askedField: z.string().nullable(),
  inputMode: z.enum(['personal', 'example']),
  practiceTurnId: z.string().nullable(),
  assessment: IntakeAssessmentSchema.nullable(),
  handoff: IntakeHandoffSchema.nullable(),
  toolCalls: z.array(z.string()),
  budgetReservation: z.object({ id: z.string(), day: z.string(), category: z.enum(['llm', 'scribe', 'agents', 'realtime']), micros: z.number() }).nullable(),
});
export type IntakeSession = z.infer<typeof IntakeSessionSchema>;

export const PublicFieldSchema = z.object({ value: z.unknown(), status: FieldStatusSchema, formula: z.string().nullable() });

export interface IntakeView {
  id: string;
  revision: number;
  profileRevision: number;
  phase: IntakePhase;
  mode: 'text' | 'audio';
  mediaStatus: IntakeSession['mediaStatus'];
  publicProfile: IntakeProfile;
  committedTranscript: { turnId: string; role: 'user' | 'coach'; text: string }[];
  availability: { coachVoice: boolean; audioAnalysis: boolean };
  consents: Consents;
  consentVersion: number;
  missingFields: string[];
  pendingQuestion: string | null;
  expiresAt: string;
  deadlineAt: string | null;
  inputMode: 'personal' | 'example';
  assessmentStatus: IntakeAssessment['status'] | null;
  handoff: z.infer<typeof IntakeHandoffSchema> | null;
  supportedCurrency: boolean;
}
