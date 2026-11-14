// tests/intake/avatar-session.test.ts
import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { AvatarSessionCallbacks } from '@/onboarding/client/avatar-call';

const sdk = vi.hoisted(() => ({ last: null as null | { voiceChat: { state: string } } }));

vi.mock('@heygen/liveavatar-web-sdk', async () => {
  const { EventEmitter: Emitter } = await import('node:events');
  class ElevenLabsAgentSession extends Emitter {
    voiceChat = { state: 'ACTIVE', stop: vi.fn(), mute: vi.fn(async () => undefined), unmute: vi.fn(async () => undefined) };
    start = vi.fn(async () => undefined);
    stop = vi.fn(async () => undefined);
    attach = vi.fn();
    sendClientToolResult = vi.fn();
    constructor(readonly token: string, readonly config: unknown) {
      super();
      sdk.last = this;
    }
  }
  return {
    ElevenLabsAgentSession,
    AgentEventsEnum: {
      USER_TRANSCRIPTION: 'user.transcription',
      AVATAR_TRANSCRIPTION: 'avatar.transcription',
      AVATAR_SPEAK_STARTED: 'avatar.speak_started',
      AVATAR_SPEAK_ENDED: 'avatar.speak_ended',
      ELEVENLABS_AGENT_EVENT: 'elevenlabs_agent_event',
    },
    SessionEvent: { SESSION_DISCONNECTED: 'session.disconnected' },
    SessionDisconnectReason: { CLIENT_INITIATED: 'CLIENT_INITIATED', SESSION_START_FAILED: 'SESSION_START_FAILED', SERVER_INITIATED: 'SERVER_INITIATED', UNKNOWN_REASON: 'UNKNOWN_REASON' },
    VoiceChatState: { ACTIVE: 'ACTIVE' },
  };
});

import { createAvatarSession, toolCall } from '@/onboarding/client/avatar-session';

type Fake = EventEmitter & { config: unknown; voiceChat: { state: string; stop: ReturnType<typeof vi.fn>; mute: ReturnType<typeof vi.fn>; unmute: ReturnType<typeof vi.fn> }; start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; sendClientToolResult: ReturnType<typeof vi.fn> };
const fake = () => sdk.last as unknown as Fake;

function callbacks(): { [K in keyof AvatarSessionCallbacks]: Mock<AvatarSessionCallbacks[K]> } {
  return { caption: vi.fn(), tool: vi.fn(), speaking: vi.fn(), disconnected: vi.fn() };
}

beforeEach(() => {
  sdk.last = null;
});

describe('avatar session wrapper', () => {
  it('starts muted with SDK keep-alive', async () => {
    await createAvatarSession('tok', callbacks());
    expect(fake().config).toEqual({ autoKeepAlive: true, voiceChat: { defaultMuted: true } });
  });

  it('maps captions, speaking and disconnects', async () => {
    const cb = callbacks();
    await createAvatarSession('tok', cb);
    fake().emit('user.transcription', { event_id: 'e1', text: 'I make ninety-five' });
    fake().emit('avatar.transcription', { event_id: 'e2', text: 'Is that per year?' });
    fake().emit('avatar.speak_started', { event_id: 'e3' });
    fake().emit('avatar.speak_ended', { event_id: 'e4' });
    fake().emit('session.disconnected', 'SERVER_INITIATED');
    expect(cb.caption.mock.calls).toEqual([['user', 'I make ninety-five', 'e1'], ['coach', 'Is that per year?', 'e2']]);
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

  it('relays client tool calls and returns results', async () => {
    const cb = callbacks();
    const session = await createAvatarSession('tok', cb);
    fake().emit('elevenlabs_agent_event', { elevenlabs_event_type: 'client_tool_call', data: { client_tool_call: { tool_call_id: 'c1', tool_name: 'get_missing_fields', parameters: {} } } });
    fake().emit('elevenlabs_agent_event', { elevenlabs_event_type: 'agent_response', data: {} });
    expect(cb.tool.mock.calls).toEqual([['c1', 'get_missing_fields', '{}']]);
    session.sendToolResult('c1', '{"ok":true}');
    expect(fake().sendClientToolResult).toHaveBeenCalledWith({ toolCallId: 'c1', result: '{"ok":true}' });
  });

  it('fails the start when the microphone did not come on', async () => {
    const session = await createAvatarSession('tok', callbacks());
    fake().voiceChat.state = 'INACTIVE';
    await expect(session.start()).rejects.toThrow('microphone');
    expect(fake().voiceChat.stop).toHaveBeenCalled();
    expect(fake().stop).toHaveBeenCalled();
  });

  it('stop releases the microphone before closing the session', async () => {
    const session = await createAvatarSession('tok', callbacks());
    await session.stop();
    expect(fake().voiceChat.stop.mock.invocationCallOrder[0]!).toBeLessThan(fake().stop.mock.invocationCallOrder[0]!);
  });
});

describe('toolCall', () => {
  it('accepts wrapped and flat payloads and ignores other events', () => {
    expect(toolCall('client_tool_call', { tool_call_id: 'a', tool_name: 'request_end', parameters: { x: 1 } })).toEqual({ id: 'a', name: 'request_end', args: '{"x":1}' });
    expect(toolCall('client_tool_call', { client_tool_call: { tool_call_id: 'b', tool_name: 'request_end' } })).toEqual({ id: 'b', name: 'request_end', args: '{}' });
    expect(toolCall('client_tool_call', { tool_name: 'request_end' })).toBeNull();
    expect(toolCall('interruption', {})).toBeNull();
  });
});
