import { z } from 'zod';

const minor = z.number().int().min(1).max(10_000_000_000);
export const ConversationKindSchema = z.enum([
  'raise', 'offer', 'rent', 'bill', 'interview', 'feedback', 'conflict',
  'relationship', 'presentation', 'custom',
]);
export type ConversationKind = z.infer<typeof ConversationKindSchema>;
// A/B/C integration boundary from plan A. The intake service persists this same
// draft for both the quick form and the coach; missing answers stay absent.
export const QuizAnswersSchema = z.object({
  kind: ConversationKindSchema,
  description: z.string().trim().max(4000),
  counterpartRole: z.string().trim().min(1).max(200),
  goal: z.string().trim().min(1).max(2000),
  desiredTone: z.string().trim().min(1).max(300).optional(),
  conversationDate: z.iso.date().nullable().optional(),
  currentMinor: minor.optional(), targetMinor: minor.optional(),
  marketLowMinor: minor.optional(), marketHighMinor: minor.optional(),
  period: z.enum(['year', 'month', 'one_time']).optional(), currency: z.literal('USD').optional(),
  moneyBasis: z.enum(['gross', 'net', 'unspecified']).optional(),
  inputMode: z.enum(['personal', 'example']).optional(),
  rangeSource: z.enum(['user_provided', 'practice_assumption', 'example']).optional(),
  fear: z.string().trim().max(500).optional(), avatarId: z.string().min(1).max(120).optional(),
  userRole: z.string().trim().max(200).optional(), sourceIntakeId: z.uuid().optional(),
}).strict();
export const QuizDraftSchema = QuizAnswersSchema.partial().omit({ sourceIntakeId: true });
export type QuizAnswers = z.infer<typeof QuizAnswersSchema>;
export type QuizDraft = z.infer<typeof QuizDraftSchema>;
