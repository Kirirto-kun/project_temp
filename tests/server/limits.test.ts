import { describe, expect, it } from 'vitest';
import { Budget } from '@/server/limits/budget';
import { DEFAULT_LIMITS, Quota } from '@/server/limits/quota';
import { MemoryKV } from '@/server/storage/kv';

describe('quota', () => {
  it('allows three sessions per IP per UTC day, concurrently, and resets the next day', async () => {
    let now = new Date('2026-11-15T23:00:00Z');
    const kv = new MemoryKV(() => now.getTime());
    const quota = new Quota({ kv, limits: { ...DEFAULT_LIMITS, session: 3 }, now: () => now });
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => quota.consume('session', 'ip1')));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
    await expect(quota.consume('session', 'ip2')).resolves.toBeUndefined();
    now = new Date('2026-11-16T00:00:01Z');
    await expect(quota.consume('session', 'ip1')).resolves.toBeUndefined();
  });
  it('lets demo-pool members draw from a separate pool', async () => {
    const kv = new MemoryKV();
    const quota = new Quota({ kv, limits: { ...DEFAULT_LIMITS, session: 1 }, demoPool: { isMember: async (o) => o === 'jury', size: 2 } });
    await quota.consume('session', 'nat', 'jury');
    await quota.consume('session', 'nat', 'jury');
    await quota.consume('session', 'nat', 'jury');
    await expect(quota.consume('session', 'nat', 'jury')).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    await expect(quota.consume('session', 'nat', 'someone')).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });
  it('separate kinds have separate counters', async () => {
    const quota = new Quota({ kv: new MemoryKV(), limits: { ...DEFAULT_LIMITS, session: 1, intake: 1 } });
    await quota.consume('session', 'ip');
    await expect(quota.consume('intake', 'ip')).resolves.toBeUndefined();
  });
});

describe('budget', () => {
  it('reserves atomically under the ceiling and reconciles to actual usage', async () => {
    const budget = new Budget(new MemoryKV(), 100_000);
    const a = await budget.reserve('llm', 60_000);
    await expect(budget.reserve('llm', 60_000)).rejects.toMatchObject({ code: 'BUDGET_EXHAUSTED' });
    await budget.reconcile(a, 10_000);
    expect(await budget.spentToday()).toBe(10_000);
    await expect(budget.reserve('scribe', 60_000)).resolves.toBeTruthy();
  });
});
