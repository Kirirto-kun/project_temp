import { describe, expect, it, vi } from 'vitest';
import { COST_ESTIMATES } from '@/server/limits/budget';
import type { LiveAvatarClient } from '@/onboarding/server/liveavatar';
import { confirmProfile, connectVideo, createIntake, deleteIntake, handleTool, intakeStore, postMessage, stopMedia } from '@/onboarding/server/service';
import { ALL_ON, IP, OWNER, makeDeps } from '../server/helpers';

function fakeLiveAvatar(): LiveAvatarClient & { mintToken: ReturnType<typeof vi.fn>; stopSession: ReturnType<typeof vi.fn> } {
  let n = 0;
  return {
    mintToken: vi.fn(async () => ({ sessionId: `sess-${(n += 1)}`, sessionToken: `token-${n}` })),
    stopSession: vi.fn(async () => undefined),
  };
}

async function videoIntake(liveAvatar = fakeLiveAvatar()) {
  const deps = makeDeps({ capabilities: { ...ALL_ON, avatarIntake: true }, liveAvatar, budgetMicros: 50_000_000 });
  const v = await createIntake(deps, OWNER, { mode: 'video', consents: { audioAnalysis: false, visualAnalysis: false }, consentVersion: 1 });
  return { deps, liveAvatar, v };
}

describe('video call', () => {
  it('starts in the lobby without a greeting (Alex greets on the call)', async () => {
    const { v } = await videoIntake();
    expect(v).toMatchObject({ mode: 'video', phase: 'lobby', committedTranscript: [] });
    expect(v.availability.avatarIntake).toBe(true);
  });

  it('mints a token for the remaining minutes, holds the avatar budget, and never exposes provider ids', async () => {
    const { deps, liveAvatar, v } = await videoIntake();
    const result = await connectVideo(deps, OWNER, IP, v.id, v.revision);
    expect(liveAvatar.mintToken).toHaveBeenCalledWith({ maxSeconds: 295 });
    expect(result).toMatchObject({ sessionToken: 'token-1', providerEpoch: 1 });
    expect(result.intake).toMatchObject({ mode: 'video', mediaStatus: 'connecting', phase: 'interviewing' });
    expect(JSON.stringify(result.intake)).not.toMatch(/sess-1|token-1/);
    expect((await intakeStore(deps).read(v.id))?.providerSessionId).toBe('sess-1');
    expect(await deps.budget.spentToday()).toBe(5 * COST_ESTIMATES.avatarPerMinute);
  });

  it('is refused when the avatar is not available', async () => {
    const deps = makeDeps({ liveAvatar: fakeLiveAvatar() });
    const v = await createIntake(deps, OWNER, { mode: 'video', consents: { audioAnalysis: false, visualAnalysis: false }, consentVersion: 1 });
    await expect(connectVideo(deps, OWNER, IP, v.id, v.revision)).rejects.toMatchObject({ code: 'FEATURE_DISABLED' });
  });

  it('a failed mint releases the budget hold and leaves the intake untouched', async () => {
    const liveAvatar = fakeLiveAvatar();
    liveAvatar.mintToken.mockRejectedValueOnce(new Error('402'));
    const { deps, v } = await videoIntake(liveAvatar);
    await expect(connectVideo(deps, OWNER, IP, v.id, v.revision)).rejects.toMatchObject({ code: 'UPSTREAM_UNAVAILABLE' });
    expect(await deps.budget.spentToday()).toBe(0);
    expect((await intakeStore(deps).read(v.id))?.providerEpoch).toBe(0);
    // The quota unit is refunded: the IP can still make the full daily number of attempts.
    for (let i = 0; i < 3; i += 1) await expect(deps.quota.consume('intake', IP, OWNER)).resolves.toBeUndefined();
    await expect(deps.quota.consume('intake', IP, OWNER)).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('a failed store write after minting releases the attempt and stops the new provider session', async () => {
    const liveAvatar = fakeLiveAvatar();
    const { deps, v } = await videoIntake(liveAvatar);
    liveAvatar.mintToken.mockImplementationOnce(async () => {
      await deps.kv.del(`int:${v.id}`);
      return { sessionId: 'sess-minted', sessionToken: 'token-minted' };
    });
    await expect(connectVideo(deps, OWNER, IP, v.id, v.revision)).rejects.toMatchObject({ code: 'EXPIRED' });
    expect(await deps.budget.spentToday()).toBe(0);
    expect(liveAvatar.stopSession).toHaveBeenCalledWith('sess-minted');
  });

  it('deleting the intake during a video call stops the provider session', async () => {
    const { deps, liveAvatar, v } = await videoIntake();
    await connectVideo(deps, OWNER, IP, v.id, v.revision);
    await deleteIntake(deps, OWNER, v.id);
    expect(liveAvatar.stopSession).toHaveBeenCalledWith('sess-1');
    expect(await intakeStore(deps).read(v.id)).toBeNull();
  });

  it('a mint failure while resuming keeps the existing hold', async () => {
    const { deps, liveAvatar, v } = await videoIntake();
    const first = await connectVideo(deps, OWNER, IP, v.id, v.revision);
    deps.clock.now += 60_000;
    liveAvatar.mintToken.mockRejectedValueOnce(new Error('500'));
    await expect(connectVideo(deps, OWNER, IP, v.id, first.intake.revision)).rejects.toMatchObject({ code: 'UPSTREAM_UNAVAILABLE' });
    expect(await deps.budget.spentToday()).toBe(5 * COST_ESTIMATES.avatarPerMinute);
  });

  it('stop closes the provider session and settles the hold at the avatar rate', async () => {
    const { deps, liveAvatar, v } = await videoIntake();
    await connectVideo(deps, OWNER, IP, v.id, v.revision);
    deps.clock.now += 2 * 60_000;
    const stopped = await stopMedia(deps, OWNER, v.id, 'end');
    expect(stopped).toMatchObject({ mediaStatus: 'closed', phase: 'review' });
    expect(liveAvatar.stopSession).toHaveBeenCalledWith('sess-1');
    expect(await deps.budget.spentToday()).toBe(2 * COST_ESTIMATES.avatarPerMinute);
    expect((await intakeStore(deps).read(v.id))?.providerSessionId).toBeNull();
  });

  it('reconnecting within the deadline stops the old provider session and keeps the same hold', async () => {
    const { deps, liveAvatar, v } = await videoIntake();
    const first = await connectVideo(deps, OWNER, IP, v.id, v.revision);
    deps.clock.now += 60_000;
    const second = await connectVideo(deps, OWNER, IP, v.id, first.intake.revision);
    expect(liveAvatar.stopSession).toHaveBeenCalledWith('sess-1');
    expect(liveAvatar.mintToken).toHaveBeenLastCalledWith({ maxSeconds: 235 });
    expect(second.providerEpoch).toBe(2);
    expect(await deps.budget.spentToday()).toBe(5 * COST_ESTIMATES.avatarPerMinute);
  });

  it('a provider that fails to stop never blocks closing the intake', async () => {
    const liveAvatar = fakeLiveAvatar();
    liveAvatar.stopSession.mockRejectedValue(new Error('500'));
    const { deps, v } = await videoIntake(liveAvatar);
    await connectVideo(deps, OWNER, IP, v.id, v.revision);
    await expect(stopMedia(deps, OWNER, v.id, 'end')).resolves.toMatchObject({ mediaStatus: 'closed' });
  });

  it('a video call that fails after minting falls back to the next coach, not review', async () => {
    const { deps, liveAvatar, v } = await videoIntake();
    await connectVideo(deps, OWNER, IP, v.id, v.revision);
    const stopped = await stopMedia(deps, OWNER, v.id, 'fallback');
    expect(stopped).toMatchObject({ mediaStatus: 'closed', phase: 'interrupted' });
    expect(liveAvatar.stopSession).toHaveBeenCalledWith('sess-1');
    const next = await postMessage(deps, OWNER, IP, v.id, { turnId: 'turn-after-fallback-01', text: 'I want a raise' });
    expect(next.committedTranscript.some((t) => t.text === 'I want a raise')).toBe(true);
  });

  it('confirming after Alex asked to end still stops the provider session and settles the hold', async () => {
    const { deps, liveAvatar, v } = await videoIntake();
    const connected = await connectVideo(deps, OWNER, IP, v.id, v.revision);
    await handleTool(deps, OWNER, v.id, { providerEpoch: connected.providerEpoch, callId: 'call-end-1', name: 'request_end', arguments: '{}' });
    const before = await intakeStore(deps).read(v.id);
    expect(before?.mediaStatus).toBe('stopping');
    deps.clock.now += 60_000;
    await confirmProfile(deps, OWNER, v.id, before!.revision, []);
    expect(liveAvatar.stopSession).toHaveBeenCalledWith('sess-1');
    expect(await deps.budget.spentToday()).toBe(COST_ESTIMATES.avatarPerMinute);
  });
});
