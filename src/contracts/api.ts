import { z } from 'zod';
import {
  CONTRACT_VERSION,
  LIMITS,
  MinorAmountSchema,
  ObjectiveSchema,
  PeriodSchema,
  QuizAnswersSchema,
  SessionViewSchema,
  TransportModeSchema,
} from './domain';
import { INTAKE_CONTRACT_VERSION } from './intake';
import { AudioManifestSchema, DebriefSchema, VoiceBaselineSchema, VoiceMetricsSchema } from './voice';

export const ErrorCodeSchema = z.enum([
  'INVALID_INPUT',
  'UNAUTHORIZED',
  'NOT_FOUND',
  'VERSION_CONFLICT',
  'IDEMPOTENCY_CONFLICT',
  'TURN_IN_PROGRESS',
  'SESSION_ENDED',
  'EXPIRED',
  'UPLOAD_TOO_LARGE',
  'RATE_LIMITED',
  'BUDGET_EXHAUSTED',
  'UPSTREAM_UNAVAILABLE',
  'FEATURE_DISABLED',
  'ENTITLEMENT_REQUIRED',
  'PROFILE_INCOMPLETE',
  'PROFILE_STALE',
  'FORBIDDEN_ORIGIN',
  'INTERNAL',
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const ErrorEnvelopeSchema = z.object({
  error: z.object({
    code: ErrorCodeSchema,
    message: z.string(),
    retryable: z.boolean(),
    requestId: z.string(),
    currentVersion: z.number().int().optional(),
    missingFields: z.array(z.string()).optional(),
    fields: z.array(z.object({ field: z.string(), message: z.string() })).optional(),
  }),
});
export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;

export const CapabilitiesSchema = z.object({
  voice: z.boolean(),
  voiceAnalysis: z.boolean(),
  rent: z.boolean(),
  offer: z.boolean(),
  bill: z.boolean(),
  plan: z.boolean(),
  customScenario: z.boolean(),
  offerAnalysis: z.boolean(),
  voiceClone: z.boolean(),
  payments: z.boolean(),
  avatarIntake: z.boolean(),
  /** Text conversation with the AI coach. Works without any paid provider. */
  coachIntake: z.boolean(),
  /** Audio call with the AI coach through a realtime speech provider. */
  coachVoice: z.boolean(),
  visualIntake: z.boolean(),
  modelAssist: z.boolean(),
});
export type Capabilities = z.infer<typeof CapabilitiesSchema>;

export const ConfigResponseSchema = z.object({
  contractVersion: z.literal(CONTRACT_VERSION),
  intakeContractVersion: z.literal(INTAKE_CONTRACT_VERSION),
  capabilities: CapabilitiesSchema,
  sessionLimitSeconds: z.literal(LIMITS.sessionLimitSeconds),
  intakeLimitSeconds: z.literal(LIMITS.intakeLimitSeconds),
  paidProduct: z
    .object({ productKey: z.literal('conversation_pack'), priceMinor: z.number().int(), currency: z.literal('USD'), billing: z.literal('one_time') })
    .nullable(),
});
export type ConfigResponse = z.infer<typeof ConfigResponseSchema>;

const baselineId = z.string().min(1).max(80).nullable();

export const CreateSessionRequestSchema = z.union([
  z.object({ quiz: QuizAnswersSchema, baselineId }).strict(),
  z.object({ customScenarioId: z.string().min(1).max(80), baselineId }).strict(),
  z
    .object({
      intakeId: z.string().min(1).max(80),
      profileRevision: z.number().int().min(0),
      avatarId: z.string().min(1).max(64),
      baselineId,
      /** Fields the user completed on the practice screen (missingFields of the handoff). */
      completion: z.record(z.string(), z.unknown()).optional(),
    })
    .strict(),
]);
export type CreateSessionRequest = z.infer<typeof CreateSessionRequestSchema>;

export const SessionResponseSchema = z.object({ session: SessionViewSchema });
export type SessionResponse = z.infer<typeof SessionResponseSchema>;

export const TurnRequestSchema = z.object({
  sessionId: z.string().min(1),
  turnId: z.string().min(8).max(80),
  expectedVersion: z.number().int().min(0),
  text: z.string().trim().min(1).max(LIMITS.replyMaxChars),
});
export type TurnRequest = z.infer<typeof TurnRequestSchema>;

export const TurnResponseSchema = z.object({ session: SessionViewSchema, committedTurnId: z.string() });
export type TurnResponse = z.infer<typeof TurnResponseSchema>;

export const FinishRequestSchema = z.object({ expectedVersion: z.number().int().min(0), reason: z.literal('stopped') });
export const ModeRequestSchema = z.object({ expectedVersion: z.number().int().min(0), mode: TransportModeSchema });
export const ReplayRequestSchema = z.object({ baselineId });
export const DebriefRequestSchema = z.object({ sessionId: z.string().min(1) });
export const DebriefResponseSchema = z.object({ debrief: DebriefSchema });

export const ElevenLabsTokenRequestSchema = z.object({
  sessionId: z.string().min(1),
  connectionType: z.enum(['webrtc', 'websocket']),
});

export const SessionBindingSchema = z.object({
  bindingId: z.string(),
  sessionId: z.string(),
  epoch: z.number().int(),
  /** HMAC over sessionId, bindingId and epoch. Sent back by the agent as extra body. */
  signature: z.string(),
  expiresAt: z.string(),
});
export type SessionBinding = z.infer<typeof SessionBindingSchema>;

export const ElevenLabsTokenResponseSchema = z.discriminatedUnion('connectionType', [
  z.object({
    connectionType: z.literal('webrtc'),
    conversationToken: z.string(),
    voiceId: z.string().nullable(),
    firstMessage: z.string(),
    sessionBinding: SessionBindingSchema,
    session: SessionViewSchema,
  }),
  z.object({
    connectionType: z.literal('websocket'),
    signedUrl: z.string(),
    voiceId: z.string().nullable(),
    firstMessage: z.string(),
    sessionBinding: SessionBindingSchema,
    session: SessionViewSchema,
  }),
]);
export type ElevenLabsTokenResponse = z.infer<typeof ElevenLabsTokenResponseSchema>;

export const AudioUploadRequestSchema = z.object({
  purpose: z.enum(['baseline', 'session', 'intake']),
  mimeType: z.string().min(3).max(100),
  bytes: z.number().int().min(1),
  sessionId: z.string().nullable(),
  intakeId: z.string().nullable(),
});
export const AudioUploadResponseSchema = z.object({
  audioId: z.string(),
  uploadUrl: z.string(),
  uploadMethod: z.literal('PUT'),
  uploadHeaders: z.record(z.string(), z.string()),
  expiresAt: z.string(),
});
export type AudioUploadResponse = z.infer<typeof AudioUploadResponseSchema>;

export const AudioCompleteRequestSchema = z.object({ manifest: AudioManifestSchema });
export const BaselineRequestSchema = z.object({ audioId: z.string().min(1) });
export const BaselineResponseSchema = z.object({ baseline: VoiceBaselineSchema });
export const AnalyzeRequestSchema = z.object({ sessionId: z.string().min(1), audioId: z.string().min(1), baselineId });
export const AnalyzeResponseSchema = z.object({ analysisId: z.string(), status: z.literal('pending') });
export const AnalysisResponseSchema = z.object({ analysisId: z.string(), metrics: VoiceMetricsSchema });

export const CheckoutRequestSchema = z.object({ productKey: z.literal('conversation_pack') });
export const CheckoutResponseSchema = z.object({ checkoutUrl: z.string(), checkoutId: z.string() });

export const EntitlementResponseSchema = z.object({
  status: z.enum(['none', 'pending', 'active', 'revoked']),
  customScenariosRemaining: z.number().int().min(0),
  offerAnalysesRemaining: z.number().int().min(0),
});
export type EntitlementResponse = z.infer<typeof EntitlementResponseSchema>;

export const CustomScenarioRequestSchema = z.object({
  quiz: QuizAnswersSchema,
  description: z.string().trim().min(20).max(LIMITS.descriptionMaxChars),
});
export const CustomScenarioResponseSchema = z.object({ scenarioId: z.string() });

export const OfferAnalyzeRequestSchema = z.object({
  text: z.string().trim().min(20).max(LIMITS.offerTextMaxChars),
  currency: z.literal('USD'),
  period: PeriodSchema,
});

const ExtractedAmountSchema = z.object({
  amountMinor: MinorAmountSchema.nullable(),
  /** Exact excerpt of the offer text that states the amount, or null when unknown. */
  sourceText: z.string().nullable(),
  guaranteed: z.boolean(),
});

export const OfferAnalysisSchema = z.object({
  currency: z.literal('USD'),
  period: PeriodSchema,
  base: ExtractedAmountSchema,
  bonus: ExtractedAmountSchema,
  equity: ExtractedAmountSchema,
  signOn: ExtractedAmountSchema,
  /** Base + guaranteed bonus + sign-on, computed by code. Equity is never added. */
  guaranteedTotalMinor: MinorAmountSchema.nullable(),
  unknowns: z.array(z.string()),
  questionsToAsk: z.array(z.string()).max(6),
  objective: ObjectiveSchema,
});
export type OfferAnalysis = z.infer<typeof OfferAnalysisSchema>;
export const OfferAnalyzeResponseSchema = z.object({ analysis: OfferAnalysisSchema });
