import 'server-only';
import { ApiError } from '../http';
import { newId, utcDay } from '../ids';
import type { KeyValueStore } from '../storage/kv';

/**
 * Upper-bound cost estimates in micro-USD used to reserve budget before paid calls. They are
 * deliberately conservative; reconcile() replaces them with measured usage where known.
 */
export const COST_ESTIMATES = {
  llmFastCall: 2_000,
  llmMainCall: 60_000,
  llmDebrief: 150_000,
  scribePerMinute: 7_000,
  agentPerMinute: 120_000,
  realtimePerMinute: 300_000,
} as const;

/** Token prices in micro-USD per token (from Anthropic's published per-million rates). */
export const TOKEN_PRICES: Record<string, { input: number; output: number }> = {
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
};

export type BudgetCategory = 'llm' | 'scribe' | 'agents' | 'realtime';

export interface Reservation {
  id: string;
  day: string;
  category: BudgetCategory;
  micros: number;
}

export class Budget {
  constructor(
    private readonly kv: KeyValueStore,
    private readonly dailyCeilingMicros: number | null,
    private readonly now: () => Date = () => new Date(),
  ) {}

  get configured(): boolean {
    return this.dailyCeilingMicros !== null;
  }

  /** Atomically reserves an upper-bound cost; rejects when the daily ceiling would be exceeded. */
  async reserve(category: BudgetCategory, micros: number): Promise<Reservation> {
    const day = utcDay(this.now());
    const amount = Math.max(0, Math.ceil(micros));
    if (this.dailyCeilingMicros !== null) {
      const total = await this.kv.incrBy(`budget:${day}`, amount, 3 * 86_400);
      if (total > this.dailyCeilingMicros) {
        await this.kv.incrBy(`budget:${day}`, -amount, 3 * 86_400);
        throw new ApiError('BUDGET_EXHAUSTED', 'Today’s spending limit for live services is reached. The text path and the example still work.');
      }
    }
    await this.kv.incrBy(`budget:${day}:${category}`, amount, 3 * 86_400);
    return { id: newId('rsv'), day, category, micros: amount };
  }

  /** Replaces a reservation with the actual cost (may be zero when the call failed early). */
  async reconcile(reservation: Reservation, actualMicros: number): Promise<void> {
    const delta = Math.ceil(Math.max(0, actualMicros)) - reservation.micros;
    if (delta === 0) return;
    if (this.dailyCeilingMicros !== null) await this.kv.incrBy(`budget:${reservation.day}`, delta, 3 * 86_400);
    await this.kv.incrBy(`budget:${reservation.day}:${reservation.category}`, delta, 3 * 86_400);
  }

  async spentToday(): Promise<number> {
    return Number((await this.kv.get(`budget:${utcDay(this.now())}`)) ?? 0);
  }
}

export function tokenCostMicros(model: string, inputTokens: number, outputTokens: number): number {
  const price = TOKEN_PRICES[model] ?? TOKEN_PRICES['claude-opus-5-5']!;
  return Math.ceil(inputTokens * price.input + outputTokens * price.output);
}
