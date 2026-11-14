import { expect, it } from 'vitest';
import { MemoryStore } from './helpers/memory-store';
import { DailyBudget } from '@/onboarding/server/budget';

it('enforces concurrent, per-IP and global daily reservations atomically', async () => {
  let now = Date.parse('2026-11-15T00:00:00Z');
  const budget = new DailyBudget(new MemoryStore(() => now), { dailyCents: 400, attemptCents: 100, concurrency: 2, attemptsPerIp: 3 }, () => now);
  await budget.reserve('a', 'ip', now + 300000); await budget.reserve('a', 'ip', now + 300000);
  await budget.reserve('b', 'ip', now + 300000);
  await expect(budget.reserve('c', 'other', now + 300000)).rejects.toMatchObject({ code: 'CONCURRENCY_LIMIT' });
  await budget.release('a'); await budget.release('b');
  await budget.reserve('c', 'ip', now + 300000); await budget.release('c');
  await expect(budget.reserve('d', 'ip', now + 300000)).rejects.toMatchObject({ code: 'INTAKE_QUOTA' });
  await budget.reserve('e', 'other', now + 300000); await budget.release('e');
  await expect(budget.reserve('f', 'third', now + 300000)).rejects.toMatchObject({ code: 'DAILY_BUDGET' });
  now += 86400000;
  await expect(budget.reserve('g', 'ip', now + 300000)).resolves.toBeUndefined();
});

it('does not overspend a daily budget with parallel admissions', async () => {
  const now = Date.parse('2026-11-15T00:00:00Z');
  const budget = new DailyBudget(new MemoryStore(() => now), { dailyCents: 100, attemptCents: 100, concurrency: 10, attemptsPerIp: 3 }, () => now);
  const results = await Promise.allSettled(['a','b'].map(id => budget.reserve(id, id, now + 300000)));
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
});

it('keeps global concurrency atomic across the UTC day boundary', async () => {
  let now = Date.parse('2026-11-15T23:59:59Z');
  const budget = new DailyBudget(new MemoryStore(() => now), { dailyCents: 1000, attemptCents: 100, concurrency: 1, attemptsPerIp: 3 }, () => now);
  await budget.reserve('yesterday', 'ip', now + 300000);
  now += 2000;
  await expect(budget.reserve('today', 'other', now + 300000)).rejects.toMatchObject({ code: 'CONCURRENCY_LIMIT' });
  await budget.release('yesterday');
  await expect(budget.reserve('today', 'other', now + 300000)).resolves.toBeUndefined();
});
