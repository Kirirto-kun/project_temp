import { describe, expect, it, vi } from 'vitest';
import { createLiveAvatar, type LiveAvatarClient } from '@/onboarding/server/liveavatar';
import { COST_ESTIMATES } from '@/server/limits/budget';
import { ROUND_AVATARS } from '@/server/session/round-avatars';
import { readJson } from '@/server/storage/kv';
import { roundVideoKey, type RoundVideoRecord } from '@/server/session/round-video-store';
import { createSession, enforceDeadline, finishSessionByUser, loadOwnedSession, sessionRepo } from '@/server/session/service';
import { connectRoundVideo, stopRoundVideo } from '@/server/session/video';
import { ALL_ON, IP, OTHER, OWNER, makeDeps, quizRequest } from './helpers';

function fakeLiveAvatar(): LiveAvatarClient & { mintToken: ReturnType<typeof vi.fn>; stopSession: ReturnType<typeof vi.fn> } {
  let n = 0;
  return {
    mintToken: vi.fn(async () => ({ sessionId: `sess-${(n += 1)}`, sessionToken: `token-${n}` })),
    stopSession: vi.fn(async () => undefined),
  };
}

async function setup(personaAvatarId = 'maya-chen', options: { avatar?: boolean } = {}) {
  const liveAvatar = fakeLiveAvatar();
  const deps = makeDeps({ capabilities: { ...ALL_ON, avatarIntake: options.avatar ?? true }, liveAvatar, budgetMicros: 50_000_000 });
  const view = await createSession(deps, quizRequest(), { ownerId: OWNER, ipHash: IP, idempotencyKey: null });
  await sessionRepo(deps).update(view.id, (s) => ({ ...s, scenarioSnapshot: { ...s.scenarioSnapshot, persona: { ...s.scenarioSnapshot.persona, avatarId: personaAvatarId } } }));
  const record = () => readJson<RoundVideoRecord>(deps.kv, roundVideoKey(view.id));
  return { deps, liveAvatar, view, record };
}

async function code(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'ok';
  } catch (error) {
    return (error as { code?: string }).code ?? String(error);
  }
}

describe('round video call: connect', () => {
  it('mints for the minutes left with the persona avatar, holds the avatar budget, and returns only the token', async () => {
    const { deps, liveAvatar, view, record } = await setup('maya-chen');
    const result = await connectRoundVideo(deps, OWNER, IP, view.id);
    expect(result).toEqual({ sessionToken: 'token-1', providerEpoch: 1 });
    expect(liveAvatar.mintToken).toHaveBeenCalledWith({ maxSeconds: 295, avatarId: '5dd4d830-957a-419f-9334-0dc4399ada5d', voiceId: 'b2bd6569-a537-4342-aeca-a1f15d2a2c97' });
    expect(await deps.budget.spentToday()).toBe(5 * COST_ESTIMATES.avatarPerMinute);
    expect(await record()).toMatchObject({ epoch: 1, providerSessionId: 'sess-1', heldMinutes: 5 });
  });

  it('maps each catalog counterpart to its own avatar and voice', async () => {
    for (const [persona, avatar] of Object.entries(ROUND_AVATARS)) {
      const { deps, liveAvatar, view } = await setup(persona);
      await connectRoundVideo(deps, OWNER, IP, view.id);
      expect(liveAvatar.mintToken).toHaveBeenCalledWith({ maxSeconds: 295, ...avatar });
    }
    expect(ROUND_AVATARS['priya-raman']).toEqual({ avatarId: 'bf00036b-558a-44b5-b2ff-1e3cec0f4ceb', voiceId: '8a504f9b-95dd-42d4-8b0c-edc2567b6382' });
  });

  it('an unknown persona (custom scenario) uses the configured avatar', async () => {
    const { deps, liveAvatar, view } = await setup('custom-counterpart');
    await connectRoundVideo(deps, OWNER, IP, view.id);
    expect(liveAvatar.mintToken).toHaveBeenCalledWith({ maxSeconds: 295 });
  });

  it('is refused when the capability is off', async () => {
    const { deps, liveAvatar, view } = await setup('maya-chen', { avatar: false });
    expect(await code(connectRoundVideo(deps, OWNER, IP, view.id))).toBe('FEATURE_DISABLED');
    expect(liveAvatar.mintToken).not.toHaveBeenCalled();
  });

  it("is refused for another owner's round", async () => {
    const { deps, liveAvatar, view } = await setup();
    expect(await code(connectRoundVideo(deps, OTHER, IP, view.id))).toBe('NOT_FOUND');
    expect(liveAvatar.mintToken).not.toHaveBeenCalled();
    await connectRoundVideo(deps, OWNER, IP, view.id);
    expect(await code(stopRoundVideo(deps, OTHER, view.id))).toBe('NOT_FOUND');
    expect(liveAvatar.stopSession).not.toHaveBeenCalled();
  });

  it('is refused for an ended round', async () => {
    const { deps, liveAvatar, view } = await setup();
    await finishSessionByUser(deps, view.id, OWNER, view.version);
    expect(await code(connectRoundVideo(deps, OWNER, IP, view.id))).toBe('SESSION_ENDED');
    expect(liveAvatar.mintToken).not.toHaveBeenCalled();
    expect(await deps.budget.spentToday()).toBe(0);
  });

  it('is refused past the deadline and when too little time is left', async () => {
    const { deps, view } = await setup();
    deps.clock.now += 290_000;
    expect(await code(connectRoundVideo(deps, OWNER, IP, view.id))).toBe('INVALID_INPUT');
    deps.clock.now += 20_000;
    expect(await code(connectRoundVideo(deps, OWNER, IP, view.id))).toBe('SESSION_ENDED');
  });

  it('a failed mint releases the budget hold and the quota unit', async () => {
    const { deps, liveAvatar, view, record } = await setup();
    liveAvatar.mintToken.mockRejectedValueOnce(new Error('402'));
    expect(await code(connectRoundVideo(deps, OWNER, IP, view.id))).toBe('UPSTREAM_UNAVAILABLE');
    expect(await deps.budget.spentToday()).toBe(0);
    expect(await record()).toBeNull();
    for (let i = 0; i < 6; i += 1) await deps.quota.consume('round_video', IP, OWNER);
    expect(await code(deps.quota.consume('round_video', IP, OWNER))).toBe('RATE_LIMITED');
  });

  it('a reconnect closes and settles the previous attempt first', async () => {
    const { deps, liveAvatar, view, record } = await setup();
    await connectRoundVideo(deps, OWNER, IP, view.id);
    deps.clock.now += 30_000;
    const second = await connectRoundVideo(deps, OWNER, IP, view.id);
    expect(second.providerEpoch).toBe(2);
    expect(liveAvatar.stopSession).toHaveBeenCalledWith('sess-1');
    // First attempt settled at one minute; the second holds the minutes left (270s - 5s → 5).
    expect(await deps.budget.spentToday()).toBe(1 * COST_ESTIMATES.avatarPerMinute + 5 * COST_ESTIMATES.avatarPerMinute);
    expect(await record()).toMatchObject({ epoch: 2, providerSessionId: 'sess-2' });
  });
});

describe('round video call: stop', () => {
  it('stops the provider and settles the budget by elapsed minutes', async () => {
    const { deps, liveAvatar, view, record } = await setup();
    await connectRoundVideo(deps, OWNER, IP, view.id);
    deps.clock.now += 90_000;
    await expect(stopRoundVideo(deps, OWNER, view.id)).resolves.toEqual({ stopped: true });
    expect(liveAvatar.stopSession).toHaveBeenCalledWith('sess-1');
    expect(await deps.budget.spentToday()).toBe(2 * COST_ESTIMATES.avatarPerMinute);
    expect(await record()).toMatchObject({ epoch: 1, providerSessionId: null, reservation: null });
    // Repeating is safe and charges nothing more.
    await expect(stopRoundVideo(deps, OWNER, view.id)).resolves.toEqual({ stopped: false });
    expect(liveAvatar.stopSession).toHaveBeenCalledOnce();
    expect(await deps.budget.spentToday()).toBe(2 * COST_ESTIMATES.avatarPerMinute);
  });

  it('a provider error never blocks the stop', async () => {
    const { deps, liveAvatar, view, record } = await setup();
    await connectRoundVideo(deps, OWNER, IP, view.id);
    liveAvatar.stopSession.mockRejectedValueOnce(new Error('500'));
    await expect(stopRoundVideo(deps, OWNER, view.id)).resolves.toEqual({ stopped: true });
    expect(await record()).toMatchObject({ providerSessionId: null });
  });

  it('a late stop from an older attempt leaves the newer call open', async () => {
    const { deps, liveAvatar, view, record } = await setup();
    await connectRoundVideo(deps, OWNER, IP, view.id);
    await connectRoundVideo(deps, OWNER, IP, view.id);
    liveAvatar.stopSession.mockClear();
    await expect(stopRoundVideo(deps, OWNER, view.id, 1)).resolves.toEqual({ stopped: false });
    expect(liveAvatar.stopSession).not.toHaveBeenCalled();
    expect(await record()).toMatchObject({ epoch: 2, providerSessionId: 'sess-2' });
  });

  it('finishing the round stops the call', async () => {
    const { deps, liveAvatar, view, record } = await setup();
    await connectRoundVideo(deps, OWNER, IP, view.id);
    await finishSessionByUser(deps, view.id, OWNER, view.version);
    expect(liveAvatar.stopSession).toHaveBeenCalledWith('sess-1');
    expect(await record()).toMatchObject({ providerSessionId: null });
    expect(await deps.budget.spentToday()).toBe(1 * COST_ESTIMATES.avatarPerMinute);
  });

  it('the round deadline stops the call', async () => {
    const { deps, liveAvatar, view, record } = await setup();
    await connectRoundVideo(deps, OWNER, IP, view.id);
    deps.clock.now += 301_000;
    const after = await enforceDeadline(deps, await loadOwnedSession(deps, view.id, OWNER));
    expect(after.state.ended).toBe('timeout');
    expect(liveAvatar.stopSession).toHaveBeenCalledWith('sess-1');
    expect(await record()).toMatchObject({ providerSessionId: null });
    expect(await deps.budget.spentToday()).toBe(5 * COST_ESTIMATES.avatarPerMinute);
  });
});

describe('LiveAvatar avatar override', () => {
  const settings = { apiKey: 'la-key', avatarId: 'env-avatar', voiceId: 'env-voice', sandbox: false };
  const ok = () => new Response(JSON.stringify({ code: 1000, data: { session_id: 's', session_token: 't' } }), { status: 200 });
  const bodyOf = (fetchImpl: ReturnType<typeof vi.fn>) => JSON.parse(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body));

  it('uses the persona avatar and voice outside the sandbox', async () => {
    const fetchImpl = vi.fn(async () => ok());
    await createLiveAvatar(settings, fetchImpl as unknown as typeof fetch).mintToken({ maxSeconds: 100, ...ROUND_AVATARS['tom-becker'] });
    expect(bodyOf(fetchImpl)).toMatchObject({ avatar_id: ROUND_AVATARS['tom-becker']!.avatarId, avatar_persona: { voice_id: ROUND_AVATARS['tom-becker']!.voiceId } });
  });

  it('the sandbox always uses the configured avatar and voice', async () => {
    const fetchImpl = vi.fn(async () => ok());
    await createLiveAvatar({ ...settings, sandbox: true }, fetchImpl as unknown as typeof fetch).mintToken({ maxSeconds: 100, ...ROUND_AVATARS['maya-chen'] });
    expect(bodyOf(fetchImpl)).toMatchObject({ avatar_id: 'env-avatar', is_sandbox: true, avatar_persona: { voice_id: 'env-voice' } });
  });

  it('without an override it uses the configured avatar', async () => {
    const fetchImpl = vi.fn(async () => ok());
    await createLiveAvatar(settings, fetchImpl as unknown as typeof fetch).mintToken({ maxSeconds: 100 });
    expect(bodyOf(fetchImpl)).toMatchObject({ avatar_id: 'env-avatar', avatar_persona: { voice_id: 'env-voice' } });
  });
});
