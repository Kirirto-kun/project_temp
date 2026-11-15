// tests/intake/avatar-session.test.ts
import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { AvatarSessionCallbacks } from '@/onboarding/client/avatar-call';

const sdk = vi.hoisted(() => ({ last: null as null | { voiceChat: { state: string } } }));

vi.mock('@heygen/liveavatar-web-sdk', async () => {
  const { EventEmitter: Emitter } = await import('node:events');
  class LiveAvatarSession extends Emitter {
    voiceChat = { state: 'ACTIVE', stop: vi.fn(), mute: vi.fn(async () => undefined), unmute: vi.fn(async () => undefined) };
    start = vi.fn(async () => undefined);
    stop = vi.fn(async () => undefined);
    attach = vi.fn();
    repeat = vi.fn();
    interrupt = vi.fn();
    constructor(readonly token: string, readonly config: unknown) {
      super();
      sdk.last = this;
    }
  }
  return {
    LiveAvatarSession,
    AgentEventsEnum: {
      USER_TRANSCRIPTION: 'user.transcription',
      USER_SPEAK_STARTED: 'user.speak_started',
      AVATAR_SPEAK_STARTED: 'avatar.speak_started',
      AVATAR_SPEAK_ENDED: 'avatar.speak_ended',
    },
    SessionEvent: { SESSION_DISCONNECTED: 'session.disconnected', SESSION_STREAM_READY: 'session.stream_ready' },
    SessionDisconnectReason: { CLIENT_INITIATED: 'CLIENT_INITIATED', SESSION_START_FAILED: 'SESSION_START_FAILED', SERVER_INITIATED: 'SERVER_INITIATED', UNKNOWN_REASON: 'UNKNOWN_REASON' },
    VoiceChatState: { ACTIVE: 'ACTIVE' },
  };
});

import { createAvatarSession } from '@/onboarding/client/avatar-session';

type Fake = EventEmitter & { config: unknown; attach: ReturnType<typeof vi.fn>; voiceChat: { state: string; stop: ReturnType<typeof vi.fn>; mute: ReturnType<typeof vi.fn>; unmute: ReturnType<typeof vi.fn> }; start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; repeat: ReturnType<typeof vi.fn>; interrupt: ReturnType<typeof vi.fn> };
const fake = () => sdk.last as unknown as Fake;

function callbacks(): { [K in keyof AvatarSessionCallbacks]: Mock<AvatarSessionCallbacks[K]> } {
  return { userSaid: vi.fn(), userSpeaking: vi.fn(), speaking: vi.fn(), streamReady: vi.fn(), disconnected: vi.fn() };
}

beforeEach(() => {
  sdk.last = null;
});

describe('avatar session wrapper', () => {
  it('starts muted with SDK keep-alive', async () => {
    await createAvatarSession('tok', callbacks());
    expect(fake().config).toEqual({ autoKeepAlive: true, voiceChat: { defaultMuted: true } });
  });

  it('maps user transcripts, barge-in, speaking and disconnects', async () => {
    const cb = callbacks();
    await createAvatarSession('tok', cb);
    fake().emit('user.speak_started', { event_id: 'e0' });
    fake().emit('user.transcription', { event_id: 'e1', text: 'I make ninety-five' });
    fake().emit('avatar.speak_started', { event_id: 'e3' });
    fake().emit('avatar.speak_ended', { event_id: 'e4' });
    fake().emit('session.disconnected', 'SERVER_INITIATED');
    expect(cb.userSpeaking).toHaveBeenCalledOnce();
    expect(cb.userSaid.mock.calls).toEqual([['I make ninety-five', 'e1']]);
    expect(cb.speaking.mock.calls).toEqual([[true], [false]]);
    expect(cb.disconnected).toHaveBeenCalledOnce();
  });

  it('does not report SDK-originated disconnects as provider drops', async () => {
    const cb = callbacks();
    await createAvatarSession('tok', cb);
    fake().emit('session.disconnected', 'CLIENT_INITIATED');
    fake().emit('session.disconnected', 'SESSION_START_FAILED');
    expect(cb.disconnected).not.toHaveBeenCalled();
  });

  it('ignores disconnects after the wrapper has been stopped', async () => {
    const cb = callbacks();
    const session = await createAvatarSession('tok', cb);
    await session.stop();
    fake().emit('session.disconnected', 'SERVER_INITIATED');
    expect(cb.disconnected).not.toHaveBeenCalled();
  });

  it('maps setMuted to voice chat mute and unmute', async () => {
    const session = await createAvatarSession('tok', callbacks());
    session.setMuted(false);
    expect(fake().voiceChat.unmute).toHaveBeenCalledOnce();
    session.setMuted(true);
    expect(fake().voiceChat.mute).toHaveBeenCalledOnce();
  });

  it('speaks server lines with repeat and interrupts, but not after stop', async () => {
    const session = await createAvatarSession('tok', callbacks());
    session.speak('What do you do?');
    session.interrupt();
    expect(fake().repeat).toHaveBeenCalledWith('What do you do?');
    expect(fake().interrupt).toHaveBeenCalledOnce();
    await session.stop();
    session.speak('late');
    session.interrupt();
    expect(fake().repeat).toHaveBeenCalledOnce();
    expect(fake().interrupt).toHaveBeenCalledOnce();
  });

  it('fails the start when the microphone did not come on', async () => {
    const session = await createAvatarSession('tok', callbacks());
    fake().voiceChat.state = 'INACTIVE';
    await expect(session.start()).rejects.toThrow('microphone');
    expect(fake().voiceChat.stop).toHaveBeenCalled();
    expect(fake().stop).toHaveBeenCalled();
  });

  it('attaches the media element again once the stream is ready (and reports it), but not after stop', async () => {
    const cb = callbacks();
    const session = await createAvatarSession('tok', cb);
    const element = { pause: vi.fn(), srcObject: null } as unknown as HTMLVideoElement;
    session.attach(element);
    fake().attach.mockClear();
    fake().emit('session.stream_ready');
    expect(fake().attach).toHaveBeenCalledWith(element);
    expect(cb.streamReady).toHaveBeenCalledOnce();
    fake().attach.mockClear();
    await session.stop();
    fake().emit('session.stream_ready');
    expect(fake().attach).not.toHaveBeenCalled();
  });

  it('stop releases the microphone before closing the session', async () => {
    const session = await createAvatarSession('tok', callbacks());
    await session.stop();
    expect(fake().voiceChat.stop.mock.invocationCallOrder[0]!).toBeLessThan(fake().stop.mock.invocationCallOrder[0]!);
  });
});
