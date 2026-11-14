import { describe, expect, it } from 'vitest';
import { MemoryStore } from './helpers/memory-store';
import { CallService, type CallProvider } from '@/onboarding/server/service';
import { DailyBudget } from '@/onboarding/server/budget';

function fixture() {
  let time = Date.parse('2026-11-15T00:00:00Z');
  const rooms = new Set<string>();
  const opened: string[] = [];
  const provider: CallProvider = {
    async open(attempt, id) { const sessionId = id + ':' + attempt.epoch; opened.push(sessionId); rooms.add(sessionId); return { providerSessionId: sessionId, credentialCiphertext: 'encrypted' }; },
    async close(attempt) { rooms.delete(attempt.providerSessionId!); },
    async credentials() { return { sessionToken: 'restricted-token' }; },
  };
  const store = new MemoryStore(() => time);
  const budget = new DailyBudget(store, { dailyCents: 1000, attemptCents: 100, concurrency: 2, attemptsPerIp: 3 }, () => time);
  const service = new CallService({ store, provider, budget, now: () => time });
  return { service, store, provider, rooms, opened, setTime: (t: number) => { time = t; } };
}
const create = (service: CallService, key = 'create-key-0001') => service.create('owner-a', key, { mode: 'video', locale: 'en', consents: { audioAnalysis: false, visualAnalysis: false }, consentVersion: 1 });

describe('intake call lifecycle', () => {
  it('creates only a draft before an explicit connection and hides private identifiers', async () => {
    const f = fixture(); const view = await create(f.service);
    expect(view.mediaStatus).toBe('not_started');
    expect(f.opened).toHaveLength(0);
    expect(view).not.toHaveProperty('ownerId');
    expect(view).not.toHaveProperty('attempt');
    expect(await create(f.service)).toEqual(view);
    await expect(f.service.read('other-owner', view.id)).rejects.toMatchObject({ status: 404 });
  });
  it('rejects reuse of a create idempotency key with a different payload', async () => {
    const f = fixture(); await create(f.service);
    await expect(f.service.create('owner-a', 'create-key-0001', { mode: 'audio', locale: 'en', consents: { audioAnalysis: false, visualAnalysis: false }, consentVersion: 1 })).rejects.toMatchObject({ status: 409 });
  });
  it('retries the same attempt without extending its deadline or dispatching again', async () => {
    const f = fixture(); const view = await create(f.service);
    const input = { expectedRevision: view.revision, mode: 'video' as const, restart: false, clientId: '00000000-0000-4000-8000-000000000001' };
    const first = await f.service.connect('owner-a', view.id, 'connect-key-001', 'ip-a', input);
    f.setTime(Date.parse('2026-11-15T00:01:00Z'));
    const second = await f.service.connect('owner-a', view.id, 'connect-key-001', 'ip-a', input);
    expect(first.deadlineAt).toBe('2026-11-15T00:05:00.000Z');
    expect(second.deadlineAt).toBe(first.deadlineAt);
    expect(second.providerEpoch).toBe(1);
    expect(f.opened).toHaveLength(1);
  });
  it('CAS admits one concurrent connection and rejects the stale request', async () => {
    const f = fixture(); const view = await create(f.service);
    const result = await Promise.allSettled(['connect-key-001', 'connect-key-002'].map(key => f.service.connect('owner-a', view.id, key, 'ip-a', { expectedRevision: view.revision, mode: 'video', restart: false, clientId: '00000000-0000-4000-8000-000000000001' })));
    expect(result.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(f.opened).toHaveLength(1);
    const failure = result.find(r => r.status === 'rejected') as PromiseRejectedResult;
    expect(failure.reason).toMatchObject({ status: 409 });
  });
  it('stops with stale client revision, retains the draft and cannot replay connect into a new call', async () => {
    const f = fixture(); const view = await create(f.service);
    const input = { expectedRevision: view.revision, mode: 'video' as const, restart: false, clientId: '00000000-0000-4000-8000-000000000001' };
    await f.service.connect('owner-a', view.id, 'connect-key-001', 'ip-a', input);
    const stopped = await f.service.stop('owner-a', view.id, 'stop-key-00001', 'user');
    expect(stopped.mediaStatus).toBe('closed'); expect(stopped.phase).toBe('review'); expect(f.rooms.size).toBe(0);
    expect((await f.service.read('owner-a', view.id)).id).toBe(view.id);
    await expect(f.service.connect('owner-a', view.id, 'connect-key-001', 'ip-a', input)).rejects.toMatchObject({ code: 'ATTEMPT_CLOSED' });
  });
  it('closes a room created after a racing End and never returns credentials', async () => {
    const f = fixture(); const view = await create(f.service);
    let release!: () => void; let entered!: () => void;
    const started = new Promise<void>(r => { entered = r; });
    const gate = new Promise<void>(r => { release = r; });
    f.provider.open = async () => { entered(); await gate; f.rooms.add('late-session'); return { providerSessionId: 'late-session', credentialCiphertext: 'encrypted' }; };
    const connecting = f.service.connect('owner-a', view.id, 'connect-key-001', 'ip-a', { expectedRevision: 0, mode: 'video', restart: false, clientId: '00000000-0000-4000-8000-000000000001' });
    await started; await f.service.stop('owner-a', view.id, 'stop-key-00001', 'user'); release();
    await expect(connecting).rejects.toMatchObject({ code: 'ATTEMPT_CLOSED' });
    expect(f.rooms.size).toBe(0);
    expect((await f.service.read('owner-a', view.id)).mediaStatus).toBe('closed');
  });
  it('leaves failed cleanup retryable instead of claiming the room is closed', async () => {
    const f = fixture(); const view = await create(f.service);
    await f.service.connect('owner-a', view.id, 'connect-key-001', 'ip-a', { expectedRevision: 0, mode: 'video', restart: false, clientId: '00000000-0000-4000-8000-000000000001' });
    const close = f.provider.close; f.provider.close = async () => { throw new Error('provider offline'); };
    await expect(f.service.stop('owner-a', view.id, 'stop-key-00001', 'user')).rejects.toMatchObject({ code: 'CLEANUP_PENDING' });
    expect((await f.service.read('owner-a', view.id)).mediaStatus).toBe('stopping');
    f.provider.close = close;
    expect((await f.service.stop('owner-a', view.id, 'stop-key-00001', 'user')).mediaStatus).toBe('closed');
  });
  it('does not restart an expired attempt during token refresh', async () => {
    const f = fixture(); const view = await create(f.service);
    const input = { expectedRevision: 0, mode: 'video' as const, restart: false, clientId: '00000000-0000-4000-8000-000000000001' };
    await f.service.connect('owner-a', view.id, 'connect-key-001', 'ip-a', input);
    f.setTime(Date.parse('2026-11-15T00:05:01Z'));
    await expect(f.service.connect('owner-a', view.id, 'connect-key-001', 'ip-a', input)).rejects.toMatchObject({ code: 'CALL_EXPIRED' });
    expect(f.opened).toHaveLength(1); expect(f.rooms.size).toBe(0);
  });
  it('requires explicit restart and a new epoch to change to audio', async () => {
    const f = fixture(); const view = await create(f.service);
    await f.service.connect('owner-a', view.id, 'connect-key-001', 'ip-a', { expectedRevision: 0, mode: 'video', restart: false, clientId: '00000000-0000-4000-8000-000000000001' });
    const ended = await f.service.stop('owner-a', view.id, 'stop-key-00001', 'fallback');
    await expect(f.service.connect('owner-a', view.id, 'connect-key-002', 'ip-a', { expectedRevision: ended.revision, mode: 'audio', restart: false, clientId: '00000000-0000-4000-8000-000000000001' })).rejects.toMatchObject({ code: 'RESTART_REQUIRED' });
    const audio = await f.service.connect('owner-a', view.id, 'connect-key-003', 'ip-a', { expectedRevision: ended.revision, mode: 'audio', restart: true, clientId: '00000000-0000-4000-8000-000000000001' });
    expect(audio.providerEpoch).toBe(2); expect(f.rooms.size).toBe(1);
    const lateEnd=await f.service.stop('owner-a',view.id,'late-stop-0001','disconnect',1);
    expect(lateEnd.providerEpoch).toBe(2);expect(lateEnd.mediaStatus).toBe('connecting');expect(f.rooms.size).toBe(1);
  });
});
