// src/onboarding/client/avatar-session.ts
import type { AvatarSessionFactory } from './avatar-call';

/** ElevenLabs client_tool_call payloads arrive either wrapped in `client_tool_call` or flat. */
export function toolCall(type: string, data: Record<string, unknown>): { id: string; name: string; args: string } | null {
  if (type !== 'client_tool_call') return null;
  const raw = (data.client_tool_call ?? data) as Record<string, unknown>;
  if (typeof raw.tool_call_id !== 'string' || typeof raw.tool_name !== 'string') return null;
  return { id: raw.tool_call_id, name: raw.tool_name, args: JSON.stringify(raw.parameters ?? {}) };
}

/**
 * Thin wrapper over the LiveAvatar SDK's ElevenLabs agent session, loaded only when a video call
 * starts. The microphone starts muted; the caller unmutes once the attempt is confirmed current.
 */
export const createAvatarSession: AvatarSessionFactory = async (token, callbacks) => {
  const { ElevenLabsAgentSession, AgentEventsEnum, SessionEvent, SessionDisconnectReason, VoiceChatState } = await import('@heygen/liveavatar-web-sdk');
  const session = new ElevenLabsAgentSession(token, { autoKeepAlive: true, voiceChat: { defaultMuted: true } });
  let media: HTMLVideoElement | null = null;
  let closing = false;
  session.on(AgentEventsEnum.USER_TRANSCRIPTION, (e) => callbacks.caption('user', e.text, e.event_id));
  session.on(AgentEventsEnum.AVATAR_TRANSCRIPTION, (e) => callbacks.caption('coach', e.text, e.event_id));
  session.on(AgentEventsEnum.AVATAR_SPEAK_STARTED, () => callbacks.speaking(true));
  session.on(AgentEventsEnum.AVATAR_SPEAK_ENDED, () => callbacks.speaking(false));
  session.on(AgentEventsEnum.ELEVENLABS_AGENT_EVENT, (e) => {
    const call = toolCall(e.elevenlabs_event_type, e.data);
    if (call) callbacks.tool(call.id, call.name, call.args);
  });
  // The SDK also emits this for our own stop() and failed start(); only provider-side drops count.
  session.on(SessionEvent.SESSION_DISCONNECTED, (reason) => {
    if (closing || reason === SessionDisconnectReason.CLIENT_INITIATED || reason === SessionDisconnectReason.SESSION_START_FAILED) return;
    callbacks.disconnected();
  });
  return {
    async start() {
      await session.start();
      // The SDK can resolve start() after swallowing a microphone error; trust its public state.
      if (session.voiceChat.state !== VoiceChatState.ACTIVE) {
        closing = true;
        session.voiceChat.stop();
        await session.stop().catch(() => undefined);
        throw new Error('The microphone did not start.');
      }
    },
    attach(element) {
      media = element;
      session.attach(element);
    },
    setMuted: (muted) => (muted ? session.voiceChat.mute() : session.voiceChat.unmute()),
    sendToolResult(callId, result) {
      session.sendClientToolResult({ toolCallId: callId, result });
    },
    async stop() {
      closing = true;
      session.voiceChat.stop();
      if (media) {
        media.pause();
        media.srcObject = null;
      }
      await session.stop().catch(() => undefined);
    },
  };
};
