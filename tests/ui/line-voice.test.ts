// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AvatarSession, AvatarSessionCallbacks } from '@/onboarding/client/avatar-call';
import { looksLikeEcho, MERGE_QUIET_MS, withServerVoice, type LineVoice } from '@/client/voice/line-voice';

function harness() {
  const inner = { start: vi.fn(async () => undefined), attach: vi.fn(), setMuted: vi.fn(async () => undefined), speak: vi.fn(), interrupt: vi.fn(), stop: vi.fn(async () => undefined) } satisfies AvatarSession;
  let wrapped!: AvatarSessionCallbacks;
  const factory = vi.fn(async (_t: string, cb: AvatarSessionCallbacks) => {
    wrapped = cb;
    return inner;
  });
  let speaking: (on: boolean) => void = () => undefined;
  const voice = { say: vi.fn(), stop: vi.fn() } satisfies LineVoice;
  const makeVoice = (on: (v: boolean) => void) => ((speaking = on), voice);
  const outer = { userSaid: vi.fn(), userSpeaking: vi.fn(), speaking: vi.fn(), streamReady: vi.fn(), disconnected: vi.fn() } satisfies AvatarSessionCallbacks;
  return { inner, voice, makeVoice, outer, factory, provider: () => wrapped, setSpeaking: (on: boolean) => speaking(on) };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('withServerVoice', () => {
  it('plays each identified line through our voice and still sends it to the avatar', async () => {
    const h = harness();
    const session = await withServerVoice(h.factory, (id) => ({ kind: 'intake', id: 'int_1', turnId: id }), h.makeVoice)('tok', h.outer);
    session.speak('Hi, I am Alex.', 't1');
    expect(h.inner.speak).toHaveBeenCalledWith('Hi, I am Alex.', 't1');
    expect(h.voice.say).toHaveBeenCalledWith({ kind: 'intake', id: 'int_1', turnId: 't1' }, 'Hi, I am Alex.');
    session.speak('no id');
    expect(h.voice.say).toHaveBeenCalledTimes(1);
  });

  it('mutes the provider audio on the video element', async () => {
    const h = harness();
    const session = await withServerVoice(h.factory, () => null, h.makeVoice)('tok', h.outer);
    const video = { muted: false } as HTMLVideoElement;
    session.attach(video);
    expect(video.muted).toBe(true);
    video.muted = false;
    h.provider().streamReady();
    expect(video.muted).toBe(true);
    expect(h.outer.streamReady).toHaveBeenCalled();
  });

  it('merges recognised fragments into one turn after a quiet moment', async () => {
    const h = harness();
    await withServerVoice(h.factory, () => null, h.makeVoice)('tok', h.outer);
    h.provider().userSaid('I am a nurse and I want to ask', 'e1');
    h.provider().userSaid('my manager for a raise.', 'e2');
    await vi.advanceTimersByTimeAsync(MERGE_QUIET_MS - 1);
    expect(h.outer.userSaid).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(h.outer.userSaid).toHaveBeenCalledExactlyOnceWith('I am a nurse and I want to ask my manager for a raise.', 'e1');
  });

  it('drops the avatar line leaking back through the microphone, but keeps real answers', async () => {
    const h = harness();
    const session = await withServerVoice(h.factory, (id) => ({ kind: 'intake', id: 'int_1', turnId: id }), h.makeVoice)('tok', h.outer);
    session.speak('What do you do, and what conversation are you preparing for?', 't1');
    h.setSpeaking(true);
    h.provider().userSpeaking();
    expect(h.outer.userSpeaking).not.toHaveBeenCalled();
    h.provider().userSaid('what conversation are you preparing for', 'e1');
    h.provider().userSaid('a raise with my manager', 'e2');
    await vi.advanceTimersByTimeAsync(MERGE_QUIET_MS);
    expect(h.outer.userSaid).toHaveBeenCalledExactlyOnceWith('a raise with my manager', 'e2');
  });

  it('interrupt and stop also silence our voice', async () => {
    const h = harness();
    const session = await withServerVoice(h.factory, () => null, h.makeVoice)('tok', h.outer);
    session.interrupt();
    await session.stop();
    expect(h.voice.stop).toHaveBeenCalledTimes(2);
    expect(h.inner.interrupt).toHaveBeenCalled();
    expect(h.inner.stop).toHaveBeenCalled();
  });
});

describe('looksLikeEcho', () => {
  it('matches a repeated line and not a different answer', () => {
    expect(looksLikeEcho('What conversation are you preparing for?', 'What do you do, and what conversation are you preparing for?')).toBe(true);
    expect(looksLikeEcho('I want a raise from my manager', 'What do you do, and what conversation are you preparing for?')).toBe(false);
    expect(looksLikeEcho('', 'anything')).toBe(false);
  });
});
