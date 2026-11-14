import { describe, expect, it } from 'vitest';
import { ApiError } from '@/server/http';
import { createSession, finishSessionByUser, getDebrief, loadOwnedSession, processTurn, replaySession } from '@/server/session/service';
import { IP, OWNER, makeDeps, quizRequest } from './helpers';

describe('replay', () => {
  it('starts a new round from the same snapshot and keeps the root id', async () => {
    const deps = makeDeps();
    const first = await createSession(deps, quizRequest(), { ownerId: OWNER, ipHash: IP, idempotencyKey: null });
    await expect(replaySession(deps, first.id, { ownerId: OWNER, ipHash: IP, idempotencyKey: null }, null)).rejects.toBeInstanceOf(ApiError);
    await finishSessionByUser(deps, first.id, OWNER, first.version);
    const second = await replaySession(deps, first.id, { ownerId: OWNER, ipHash: IP, idempotencyKey: 'replay-key-1' }, null);
    const third = await replaySession(deps, second.id === first.id ? first.id : first.id, { ownerId: OWNER, ipHash: IP, idempotencyKey: 'replay-key-1' }, null);
    expect(third.id).toBe(second.id);
    expect(second.replayOf).toBe(first.id);
    expect(second.replayRootId).toBe(first.id);
    const a = await loadOwnedSession(deps, first.id, OWNER);
    const b = await loadOwnedSession(deps, second.id, OWNER);
    expect(b.scenarioSnapshot).toEqual(a.scenarioSnapshot);
    expect(b.initialState).toEqual(a.initialState);
    expect(b.turns).toHaveLength(0);
  });
});

describe('debrief', () => {
  it('is available only after the end, money ready without voice, and cached per version', async () => {
    const deps = makeDeps();
    const view = await createSession(deps, quizRequest(), { ownerId: OWNER, ipHash: IP, idempotencyKey: null });
    await expect(getDebrief(deps, view.id, OWNER)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    const turn = await processTurn(deps, { sessionId: view.id, turnId: 'turn-0000-0001', expectedVersion: view.version, text: 'Deal, I accept.', mode: 'text', sourceTurnKey: null }, OWNER);
    expect(turn.session.ended).toBe('accepted');
    const debrief = await getDebrief(deps, view.id, OWNER);
    expect(debrief.agreedMinor).toBe(9_500_000);
    expect(debrief.leftOnTableMinor).toBe(1_700_000);
    expect(debrief.voice.status).toBe('unavailable');
    expect(await getDebrief(deps, view.id, OWNER)).toEqual(debrief);
  });
});
