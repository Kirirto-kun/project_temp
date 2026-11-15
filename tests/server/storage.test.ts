import { describe, expect, it } from 'vitest';
import { MemoryKV, updateJson } from '@/server/storage/kv';
import { SessionRepo } from '@/server/storage/sessions';
import { createSession } from '@/server/session/service';
import { IP, OWNER, makeDeps, quizRequest } from './helpers';

describe('MemoryKV', () => {
  it('honours TTL, NX and compare-and-set', async () => {
    let now = 1_000;
    const kv = new MemoryKV(() => now);
    expect(await kv.set('a', '1', { ttlSeconds: 1 })).toBe(true);
    expect(await kv.set('a', '2', { nx: true })).toBe(false);
    expect(await kv.compareAndSet('a', '1', '3')).toBe(true);
    expect(await kv.compareAndSet('a', '1', '4')).toBe(false);
    expect(await kv.get('a')).toBe('3');
    expect(await kv.compareAndSet('new', null, 'x', 1)).toBe(true);
    now += 2_000;
    expect(await kv.get('new')).toBeNull();
    expect(await kv.incrBy('c', 2, 10)).toBe(2);
    expect(await kv.incrBy('c', -1)).toBe(1);
  });
  it('updateJson retries until its CAS lands', async () => {
    const kv = new MemoryKV();
    await kv.set('k', JSON.stringify({ n: 0 }));
    await Promise.all(Array.from({ length: 10 }, () => updateJson<{ n: number }>(kv, 'k', (cur) => ({ n: (cur?.n ?? 0) + 1 }), { retries: 20 })));
    expect(JSON.parse((await kv.get('k'))!)).toEqual({ n: 10 });
  });
});

describe('SessionRepo', () => {
  it('is visible to a second repository instance on the same store and bumps versions', async () => {
    const deps = makeDeps();
    const view = await createSession(deps, quizRequest(), { ownerId: OWNER, ipHash: IP, idempotencyKey: 'create-key-1' });
    const second = new SessionRepo(deps.kv, deps.now);
    const read = await second.read(view.id);
    expect(read?.version).toBe(1);
    const { session } = await second.update(view.id, (s) => ({ ...s, baselineId: null }));
    expect(session.version).toBe(2);
  });
  it('expires sessions after 24 hours', async () => {
    const deps = makeDeps();
    const view = await createSession(deps, quizRequest(), { ownerId: OWNER, ipHash: IP, idempotencyKey: null });
    deps.clock.now += 24 * 3_600_000 + 1_000;
    expect(await new SessionRepo(deps.kv, deps.now).read(view.id)).toBeNull();
  });
  it('keeps the 24-hour retention after an update (regression: updates set a 60s TTL)', async () => {
    const deps = makeDeps();
    const view = await createSession(deps, quizRequest(), { ownerId: OWNER, ipHash: IP, idempotencyKey: null });
    const repo = new SessionRepo(deps.kv, deps.now);
    await repo.update(view.id, (s) => ({ ...s, baselineId: null }));
    deps.clock.now += 10 * 60_000;
    expect(await repo.read(view.id)).not.toBeNull();
  });
});

describe('updateJson TTL', () => {
  it('evaluates a TTL function after mutate, against the written value', async () => {
    let now = 0;
    const kv = new MemoryKV(() => now);
    await kv.set('k', JSON.stringify({ ttl: 3_600 }));
    await updateJson<{ ttl: number }>(kv, 'k', (cur) => ({ ttl: cur!.ttl }), { ttlSeconds: (next) => next.ttl });
    now += 120_000;
    expect(await kv.get('k')).not.toBeNull();
    now += 3_600_000;
    expect(await kv.get('k')).toBeNull();
  });
});
