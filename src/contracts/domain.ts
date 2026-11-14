import { z } from 'zod';

const minor = z.number().int().min(1).max(10_000_000_000);
// A/B/C integration boundary from plan A. The intake service persists this same
// draft for both the quick form and the coach; missing answers stay absent.
export const QuizAnswersSchema = z.object({
  kind: z.enum(['raise', 'offer', 'rent', 'bill', 'custom']),
  description: z.string().trim().max(4000),
  counterpartRole: z.string().trim().min(1).max(200),
  conversationDate: z.iso.date().nullable(),
  currentMinor: minor, targetMinor: minor, marketLowMinor: minor, marketHighMinor: minor,
  period: z.enum(['year', 'month', 'one_time']), currency: z.literal('USD'),
  moneyBasis: z.enum(['gross', 'net', 'unspecified']),
  inputMode: z.enum(['personal', 'example']),
  rangeSource: z.enum(['user_provided', 'practice_assumption', 'example']),
  fear: z.string().trim().max(500), avatarId: z.string().min(1).max(120),
  userRole: z.string().trim().max(200).optional(), sourceIntakeId: z.uuid().optional(),
}).strict();
export const QuizDraftSchema = QuizAnswersSchema.partial().omit({ sourceIntakeId: true });
export type QuizAnswers = z.infer<typeof QuizAnswersSchema>;
export type QuizDraft = z.infer<typeof QuizDraftSchema>;
