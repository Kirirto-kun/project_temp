import { describe, expect, it } from 'vitest';
import { ApiError } from '@/server/http';
import { changeMode, createSession, finishSessionByUser, loadOwnedSession, processTurn } from '@/server/session/service';
import { IP, OTHER, OWNER, makeDeps, quizRequest } from './helpers';

async function setup() {
  const deps = makeDeps();
  const view = await createSession(deps, quizRequest(), { ownerId: OWNER, ipHash: IP, idempotencyKey: null });
  return { deps, view };
}

const text = (sessionId: string, turnId: string, expectedVersion: number, body = "I'm asking for $110,000 because I lead the payments team.") => ({
  sessionId,
  turnId,
  expectedVersion,
  text: body,
  mode: 'text' as const,
  sourceTurnKey: null,
});

async function code(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'ok';
  } catch (error) {
    return error instanceof ApiError ? error.code : String(error);
  }
}

describe('processTurn', () => {
  it('commits one turn and returns the public view', async () => {
    const { deps, view } = await setup();
    const result = await processTurn(deps, text(view.id, 'turn-0000-0001', view.version), OWNER);
    expect(result.session.version).toBe(view.version + 1);
    expect(result.session.turn).toBe(1);
    expect(result.session.messages.at(-1)?.role).toBe('counterpart');
    expect(JSON.stringify(result.session)).not.toContain('reservationAmountMinor');
  });

  it('a retry with the same turnId returns the stored result without a second move', async () => {
    const { deps, view } = await setup();
    const first = await processTurn(deps, text(view.id, 'turn-0000-0001', view.version), OWNER);
    const again = await processTurn(deps, text(view.id, 'turn-0000-0001', view.version), OWNER);
    expect(again.committedTurnId).toBe(first.committedTurnId);
    expect(again.session.version).toBe(first.session.version);
    expect((await loadOwnedSession(deps, view.id, OWNER)).turns).toHaveLength(1);
  });

  it('the same key with a different text is a conflict', async () => {
    const { deps, view } = await setup();
    await processTurn(deps, text(view.id, 'turn-0000-0001', view.version), OWNER);
    expect(await code(processTurn(deps, text(view.id, 'turn-0000-0001', view.version, 'Something else'), OWNER))).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('two concurrent turns: exactly one commits', async () => {
    const { deps, view } = await setup();
    const results = await Promise.all([
      code(processTurn(deps, text(view.id, 'turn-0000-000a', view.version), OWNER)),
      code(processTurn(deps, text(view.id, 'turn-0000-000b', view.version), OWNER)),
    ]);
    expect(results.filter((r) => r === 'ok')).toHaveLength(1);
    expect(results.filter((r) => r === 'TURN_IN_PROGRESS' || r === 'VERSION_CONFLICT')).toHaveLength(1);
    expect((await loadOwnedSession(deps, view.id, OWNER)).turns).toHaveLength(1);
  });

  it('rejects a stale expectedVersion', async () => {
    const { deps, view } = await setup();
    await processTurn(deps, text(view.id, 'turn-0000-0001', view.version), OWNER);
    expect(await code(processTurn(deps, text(view.id, 'turn-0000-0002', view.version), OWNER))).toBe('VERSION_CONFLICT');
  });

  it('hides sessions of other owners', async () => {
    const { deps, view } = await setup();
    expect(await code(processTurn(deps, text(view.id, 'turn-0000-0001', view.version), OTHER))).toBe('NOT_FOUND');
  });

  it('ends the round at the server deadline', async () => {
    const { deps, view } = await setup();
    deps.clock.now += 301_000;
    expect(await code(processTurn(deps, text(view.id, 'turn-0000-0001', view.version), OWNER))).toBe('SESSION_ENDED');
    expect((await loadOwnedSession(deps, view.id, OWNER)).state.ended).toBe('timeout');
  });

  it('finish is idempotent and never overwrites an accepted deal', async () => {
    const { deps, view } = await setup();
    const r1 = await processTurn(deps, text(view.id, 'turn-0000-0001', view.version, 'Deal, I accept.'), OWNER);
    expect(r1.session.ended).toBe('accepted');
    const finished = await finishSessionByUser(deps, view.id, OWNER, r1.session.version);
    expect(finished.ended).toBe('accepted');
    expect(finished.agreedMinor).toBe(9_500_000);
  });

  it('switching to text revokes the voice binding so old voice turns cannot apply', async () => {
    const { deps, view } = await setup();
    const voice = await changeMode(deps, view.id, OWNER, 'voice', view.version);
    expect(voice.activeMode).toBe('voice');
    const text1 = await changeMode(deps, view.id, OWNER, 'text', voice.version);
    expect(text1.activeMode).toBe('text');
    const late = processTurn(deps, { sessionId: view.id, turnId: 'vt_0000000000000000000001', expectedVersion: null, text: 'I want 110k', mode: 'voice', sourceTurnKey: 'vb_x:1', bindingId: 'vb_x' }, null);
    expect(await code(late)).toBe('VERSION_CONFLICT');
  });

  it('mode change waits for a turn in progress', async () => {
    const { deps, view } = await setup();
    await deps.kv.set(`lock:turn:${view.id}`, 'turn-x', { ttlSeconds: 30, nx: true });
    expect(await code(changeMode(deps, view.id, OWNER, 'voice', view.version))).toBe('TURN_IN_PROGRESS');
  });
});

describe('createSession', () => {
  it('replays the same idempotency key and rejects it with a different body', async () => {
    const deps = makeDeps();
    const a = await createSession(deps, quizRequest(), { ownerId: OWNER, ipHash: IP, idempotencyKey: 'key-create-1' });
    const b = await createSession(deps, quizRequest(), { ownerId: OWNER, ipHash: IP, idempotencyKey: 'key-create-1' });
    expect(b.id).toBe(a.id);
    expect(await code(createSession(deps, quizRequest({ targetMinor: 11_100_000 }), { ownerId: OWNER, ipHash: IP, idempotencyKey: 'key-create-1' }))).toBe('IDEMPOTENCY_CONFLICT');
  });
  it('ignores a client-supplied sourceIntakeId and refuses custom kind', async () => {
    const deps = makeDeps();
    const view = await createSession(deps, quizRequest({ sourceIntakeId: 'int_fake' }), { ownerId: OWNER, ipHash: IP, idempotencyKey: null });
    expect((await loadOwnedSession(deps, view.id, OWNER)).scenarioSnapshot.sourceIntakeId).toBeNull();
    expect(await code(createSession(deps, quizRequest({ kind: 'custom', objective: 'maximize' }), { ownerId: OWNER, ipHash: IP, idempotencyKey: null }))).toBe('ENTITLEMENT_REQUIRED');
  });
});
