'use client';

import { useEffect, useRef, useState } from 'react';
import { CoachMark } from '@/components/holdline/Avatar';
import { CallStage } from '@/components/holdline/CallStage';
import { useCountdown } from '@/features/session/useCountdown';
import type { IntakeView } from '../contracts';
import { connectVideo, getIntake, postVideoTurn, stopIntake } from '../client/api';
import { AvatarCall, type AvatarCallState } from '../client/avatar-call';
import { createAvatarSession } from '../client/avatar-session';
import { Captions } from './TextCoach';
import { ProfileSoFar } from './ProfileSoFar';

/**
 * Video call with Alex (LiveAvatar FULL) in a Meet/Zoom-style room (CallStage). Only the
 * microphone is used; the camera stays off.
 * LiveAvatar hears the user; our deterministic coach writes every line Alex says.
 */
export function AvatarCoach({ view, onView, onFallback, onTypeInstead }: { view: IntakeView; onView: (v: IntakeView) => void; onFallback: (reason: string) => void; onTypeInstead: () => void }) {
  const [state, setState] = useState<AvatarCallState>('idle');
  const [muted, setMuted] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [live, setLive] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const callRef = useRef<AvatarCall | null>(null);
  const left = useCountdown(view.deadlineAt);

  useEffect(() => () => void callRef.current?.end('end'), []);

  useEffect(() => {
    if (left === 0 && state === 'active') void callRef.current?.end('timeout');
  }, [left, state]);

  // If the stop request failed, the view may still show an open call; re-read it so the screen
  // moves on to review instead of stopping at a disabled "Call ended".
  useEffect(() => {
    if (state === 'ended') void getIntake(view.id).then(onView, () => undefined);
  }, [state, view.id, onView]);

  function start() {
    if (callRef.current) return;
    const call = new AvatarCall(
      {
        connect: () => connectVideo(view.id, view.revision),
        turn: (epoch, itemId, text) => postVideoTurn(view.id, epoch, itemId, text),
        stop: (reason) => stopIntake(view.id, reason),
      },
      createAvatarSession,
      { state: setState, view: onView, speaking: setSpeaking, live: setLive, failed: onFallback },
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

  const active = state === 'active';
  const status =
    state === 'idle' ? 'Ready when you are.' : state === 'connecting' ? 'Connecting to Alex… this takes a few seconds.' : active ? (speaking ? 'Alex is speaking' : 'Listening') : 'Call ended';

  const last = view.committedTranscript.at(-1);
  const caption = last ? { speaker: last.role === 'coach' ? 'Alex' : 'You', text: last.text } : null;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_248px] lg:items-start">
      <div className="grid gap-4">
        <CallStage
          videoRef={videoRef}
          live={live}
          state={state}
          name="Alex"
          subtitle="AI practice coach"
          placeholder={<CoachMark size={128} speaking={speaking} idle />}
          speaking={speaking}
          status={status}
          timeLeft={view.deadlineAt && active ? left : null}
          caption={caption}
          muted={muted}
          startLabel="Start the video call"
          onStart={start}
          onMute={toggleMute}
          endLabel="End and review"
          onEnd={() => void callRef.current?.end('end')}
          secondary={state === 'idle' ? { label: 'Type instead', onClick: onTypeInstead } : undefined}
          tall
        />
        {state === 'idle' && <p className="m-0 text-center text-[13px] leading-5 text-muted">Use headphones if you can. Your microphone goes to our video provider so Alex can hear you; your camera stays off. You can mute or end at any time.</p>}
        <Captions view={view} />
      </div>
      <ProfileSoFar profile={view.publicProfile} />
    </div>
  );
}
