import type { AvatarSessionFactory } from './avatar-call';

/**
 * Thin wrapper over the LiveAvatar SDK in FULL mode, loaded only when a video call starts.
 * LiveAvatar hears the user and lip-syncs; every line Alex says comes from our server via
 * `repeat`. The microphone starts muted; the caller unmutes once the attempt is current.
 */
export const createAvatarSession: AvatarSessionFactory = async (token, callbacks) => {
  const { LiveAvatarSession, AgentEventsEnum, SessionEvent, SessionDisconnectReason, VoiceChatState } = await import('@heygen/liveavatar-web-sdk');
  const session = new LiveAvatarSession(token, { autoKeepAlive: true, voiceChat: { defaultMuted: true } });
  let media: HTMLVideoElement | null = null;
  let closing = false;
  session.on(AgentEventsEnum.USER_TRANSCRIPTION, (e) => callbacks.userSaid(e.text, e.event_id));
  session.on(AgentEventsEnum.USER_SPEAK_STARTED, () => callbacks.userSpeaking());
  session.on(AgentEventsEnum.AVATAR_SPEAK_STARTED, () => callbacks.speaking(true));
  session.on(AgentEventsEnum.AVATAR_SPEAK_ENDED, () => callbacks.speaking(false));
  // attach() is a no-op until the remote tracks exist; attach again once they arrive.
  session.on(SessionEvent.SESSION_STREAM_READY, () => {
    if (media && !closing) {
      session.attach(media);
      callbacks.streamReady();
    }
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
    speak(text) {
      if (!closing) session.repeat(text);
    },
    interrupt() {
      if (!closing) session.interrupt();
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
