import 'server-only';
import { ApiError } from '../http';
import { utcDay } from '../ids';
import type { KeyValueStore } from '../storage/kv';

export type QuotaKind = 'session' | 'intake' | 'baseline' | 'upload' | 'analysis' | 'voice_token' | 'custom' | 'offer' | 'checkout' | 'intake_message' | 'round_video' | 'speech_in' | 'speech_out';

export const DEFAULT_LIMITS: Record<QuotaKind, number> = {
  session: 3,
  intake: 3,
  baseline: 6,
  upload: 20,
  analysis: 6,
  voice_token: 12,
  custom: 4,
  offer: 4,
  checkout: 6,
  intake_message: 80,
  /** Paid avatar video calls in practice rounds (each connect or reconnect). */
  round_video: 6,
  speech_in: 60,
  speech_out: 200,
};

function secondsUntilUtcMidnight(now: Date): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(1, Math.ceil((next - now.getTime()) / 1_000));
}

export interface QuotaOptions {
  kv: KeyValueStore;
  limits: Record<QuotaKind, number>;
  now?: () => Date;
  /** Owners that redeemed the private demo-pool token, with the pool size. */
  demoPool?: { isMember: (ownerId: string) => Promise<boolean>; size: number } | null;
}

export class Quota {
  constructor(private readonly options: QuotaOptions) {}

  /**
   * Counts one use of `kind` for this IP in the current UTC day and rejects past the limit.
   * Over the limit, a demo-pool member draws from the shared pool instead.
   */
  async consume(kind: QuotaKind, ipHash: string, ownerId?: string): Promise<void> {
    const now = this.options.now?.() ?? new Date();
    const day = utcDay(now);
    const ttl = secondsUntilUtcMidnight(now) + 3_600;
    const limit = this.options.limits[kind];
    const key = `quota:${kind}:${day}:${ipHash}`;
    const used = await this.options.kv.incrBy(key, 1, ttl);
    if (used <= limit) return;
    await this.options.kv.incrBy(key, -1, ttl);
    const pool = this.options.demoPool;
    if (pool && ownerId && (kind === 'session' || kind === 'intake') && (await pool.isMember(ownerId))) {
      const poolKey = `quota:demo:${kind}:${day}`;
      const poolUsed = await this.options.kv.incrBy(poolKey, 1, ttl);
      if (poolUsed <= pool.size) return;
      await this.options.kv.incrBy(poolKey, -1, ttl);
    }
    throw new ApiError('RATE_LIMITED', `Daily limit reached for ${kind.replace('_', ' ')}. It resets at midnight UTC.`, {}, secondsUntilUtcMidnight(now));
  }

  /** Gives one use back, for example when the guarded call failed before doing paid work. */
  async refund(kind: QuotaKind, ipHash: string): Promise<void> {
    const now = this.options.now?.() ?? new Date();
    await this.options.kv.incrBy(`quota:${kind}:${utcDay(now)}:${ipHash}`, -1, secondsUntilUtcMidnight(now) + 3_600);
  }
}
