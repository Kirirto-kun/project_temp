import { z } from 'zod';

// Shared A8 boundary: integer minor units; no implicit FX, period or tax conversion.
export const MoneyAnswerSchema = z.object({
  amountMinor: z.number().int().min(1).max(10_000_000_000),
  currency: z.string().regex(/^[A-Z]{3}$/),
  period: z.enum(['year', 'month', 'one_time']),
  basis: z.enum(['gross', 'net', 'unspecified']),
}).strict();
export type MoneyAnswer = z.infer<typeof MoneyAnswerSchema>;
