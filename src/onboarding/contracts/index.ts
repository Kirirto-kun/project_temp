import { z } from 'zod';
import { QuizDraftSchema } from '@/contracts/domain';

export const ModeSchema = z.enum(['video', 'audio']);
export const ConsentsSchema = z.object({ audioAnalysis: z.literal(false), visualAnalysis: z.literal(false) }).strict();
export const CreateInputSchema = z.object({
  mode: ModeSchema, locale: z.literal('en'), consents: ConsentsSchema, consentVersion: z.literal(1),
}).strict();
export const ConnectInputSchema = z.object({
  expectedRevision: z.number().int().nonnegative(), mode: ModeSchema, restart: z.boolean().default(false),
  clientId: z.uuid(),
}).strict();
export const StopReasonSchema = z.enum(['user', 'fallback', 'review', 'timeout', 'disconnect', 'error', 'deleted']);
export const ProfileSchema = QuizDraftSchema;
const patchShape=Object.fromEntries(Object.entries(QuizDraftSchema.shape).map(([name,schema])=>[name,schema.nullable().optional()])) as {
  [K in keyof typeof QuizDraftSchema.shape]: z.ZodOptional<z.ZodNullable<(typeof QuizDraftSchema.shape)[K]>>
};
export const ProfilePatchSchema = z.object(patchShape).strict();
export const TranscriptItemSchema = z.object({
  turnId: z.string().min(1).max(160), role: z.enum(['user', 'assistant']),
  text: z.string().min(1).max(4000), interrupted: z.boolean(),
}).strict();
export const IntakeViewSchema = z.object({
  id: z.string(), revision: z.number(), profileRevision: z.number(),
  phase: z.enum(['lobby', 'connecting', 'interviewing', 'mini_practice', 'review', 'completed', 'expired']),
  mediaStatus: z.enum(['not_started', 'connecting', 'active', 'stopping', 'closed']),
  mode: ModeSchema, publicProfile: ProfileSchema, confirmed: z.boolean(),
  committedTranscript: z.array(TranscriptItemSchema), expiresAt: z.string(),
  deadlineAt: z.string().nullable(), providerEpoch: z.number().int(),
  availability: z.object({ audioAnalysis: z.literal(false), visualAnalysis: z.literal(false) }),
});
export const ConnectionSchema = z.object({
  sessionToken: z.string(), providerEpoch: z.number(), deadlineAt: z.string(), view: IntakeViewSchema,
});
export const ClientEventSchema = z.object({
  providerEpoch: z.number().int().positive(), clientId: z.uuid(),
  eventId: z.string().min(1).max(160),
  type: z.enum(['ready', 'heartbeat', 'transcript', 'speech_started']),
  transcript: TranscriptItemSchema.optional(),
}).strict();
export const ClientRespondSchema=z.object({providerEpoch:z.number().int().positive(),clientId:z.uuid(),turnId:z.string().min(1).max(160)}).strict();
export const CoachReplySchema=z.object({reply:z.string().max(1800),turnId:z.string(),providerEpoch:z.number().int(),view:IntakeViewSchema});
export const ClientToolSchema = z.object({
  providerEpoch: z.number().int().positive(), clientId: z.uuid(),
  callId: z.string().min(1).max(160), expectedRevision: z.number().int().nonnegative(),
  toolName: z.enum(['save_profile', 'get_missing_fields', 'prepare_confirmation', 'request_mini_practice', 'request_end']),
  payload: z.object({ patch: ProfilePatchSchema.optional() }).strict(),
}).strict();

export type CreateInput = z.infer<typeof CreateInputSchema>;
export type ConnectInput = z.infer<typeof ConnectInputSchema>;
export type Mode = z.infer<typeof ModeSchema>;
export type Profile = z.infer<typeof ProfileSchema>;
export type ProfilePatch = z.infer<typeof ProfilePatchSchema>;
export type IntakeView = z.infer<typeof IntakeViewSchema>;
export type Connection = z.infer<typeof ConnectionSchema>;
export type StopReason = z.infer<typeof StopReasonSchema>;
export type TranscriptItem = z.infer<typeof TranscriptItemSchema>;
export type ClientEvent = z.infer<typeof ClientEventSchema>;
export type ClientTool = z.infer<typeof ClientToolSchema>;
export type ClientRespond = z.infer<typeof ClientRespondSchema>;
export type CoachReply = z.infer<typeof CoachReplySchema>;
