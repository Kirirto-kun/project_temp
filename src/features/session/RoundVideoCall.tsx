'use client';

import { useEffect, useRef, useState } from 'react';
import { connectRoundVideo, stopRoundVideo } from '@/client/api/session';
import type { SessionView } from '@/contracts/domain';
import { Avatar } from '@/components/holdline/Avatar';
import { CallStage } from '@/components/holdline/CallStage';
import { createAvatarSession } from '@/onboarding/client/avatar-session';
import { withServerVoice } from '@/client/voice/line-voice';
import { markTextInteraction } from '@/client/voice/speech';
import { RoundAvatarCall, type RoundAvatarCallApi, type RoundCallState } from './RoundAvatarCall';
import { useCountdown } from './useCountdown';

export interface RoundVideoCallProps {
  session: SessionView;
  /** The latest view the screen holds (the call reads it between turns). */
  current: RoundAvatarCallApi['current'];
  /** One round turn through the screen's normal send pipeline. */
  turn: RoundAvatarCallApi['turn'];
  /** The call failed or dropped; the screen continues in text with this notice. */
  onFailed(message: string): void;
  onTypeInstead(): void;
}

/**
 * Video call with the negotiation counterpart (LiveAvatar FULL). Only the microphone is used;
 * the camera stays off. The avatar says what the round engine writes, numbers included.
 */
export default function RoundVideoCall({ session, current, turn, onFailed, onTypeInstead }: RoundVideoCallProps) {
  const [state, setState] = useState<RoundCallState>('idle');
  const [muted, setMuted] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [live, setLive] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const callRef = useRef<RoundAvatarCall | null>(null);
  const left = useCountdown(session.deadlineAt);
  const persona = session.scenarioSummary.persona;
  const sessionId = session.id;
  const ended = session.ended !== null;

  useEffect(() => () => void callRef.current?.end(), []);

  useEffect(() => {
    if (left === 0) void callRef.current?.end();
  }, [left]);

  // The round ended outside the call (End the round, timeout): hang up unless a goodbye is playing.
  useEffect(() => {
    if (ended) callRef.current?.roundEnded();
  }, [ended]);

  function start() {
    if (callRef.current) return;
    // Inside the click: unlocks audio playback for the counterpart's lines (Safari needs a gesture).
    markTextInteraction();
    const call = new RoundAvatarCall(
      {
        connect: () => connectRoundVideo(sessionId),
        current,
        turn,
        stop: async (epoch) => {
          await stopRoundVideo(sessionId, epoch);
        },
      },
      withServerVoice(createAvatarSession, (messageId) => ({ kind: 'round', sessionId, messageId })),
      { state: setState, speaking: setSpeaking, live: setLive, failed: onFailed },
    );
    callRef.current = call;
    if (videoRef.current) call.attach(videoRef.current);
    void call.start();
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    void callRef.current?.mute(next);
  }

  const last = session.messages.at(-1);
  const status =
    state === 'idle'
      ? `Ready when you are. ${persona.name} will hear you through your microphone; your camera stays off.`
      : state === 'connecting'
        ? `Connecting to ${persona.name}… this takes a few seconds.`
        : state === 'active'
          ? speaking
            ? `${persona.name} is speaking`
            : 'Listening'
          : 'Call ended';

  return (
    <CallStage
      videoRef={videoRef}
      live={live}
      state={state}
      name={persona.name}
      subtitle={persona.role}
      placeholder={<Avatar avatarId={persona.avatarId} size={160} speaking={speaking} />}
      speaking={speaking}
      status={status}
      timeLeft={ended ? null : left}
      caption={last ? { speaker: last.role === 'counterpart' ? persona.name : 'You', text: last.text } : null}
      muted={muted}
      startLabel="Start the video call"
      onStart={start}
      onMute={toggleMute}
      endLabel="Leave the call"
      onEnd={() => {
        void callRef.current?.end();
        onTypeInstead();
      }}
      secondary={{ label: 'Type instead', onClick: onTypeInstead }}
    />
  );
}
