'use client';

import { Mic, MicOff, PhoneOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { CoachMark } from '@/components/holdline/Avatar';
import { formatClock, useCountdown } from '@/features/session/useCountdown';
import type { IntakeView } from '../contracts';
import { connectVideo, getIntake, postTranscript, relayTool, stopIntake } from '../client/api';
import { AvatarCall, type AvatarCallState } from '../client/avatar-call';
import { createAvatarSession } from '../client/avatar-session';
import { Captions } from './TextCoach';
import { ProfileSoFar } from './ProfileSoFar';

/**
 * Video call with Alex (LiveAvatar + ElevenLabs agent). Only the microphone is used; the camera
 * stays off. Tools and transcripts go through the same server routes as the audio coach.
 */
export function AvatarCoach({ view, onView, onFallback, onTypeInstead }: { view: IntakeView; onView: (v: IntakeView) => void; onFallback: (reason: string) => void; onTypeInstead: () => void }) {
  const [state, setState] = useState<AvatarCallState>('idle');
  const [muted, setMuted] = useState(false);
  const [speaking, setSpeaking] = useState(false);
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
        transcript: (epoch, itemId, role, text) => postTranscript(view.id, epoch, itemId, role, text),
        tool: (epoch, callId, name, args) => relayTool(view.id, epoch, callId, name, args),
        stop: (reason) => stopIntake(view.id, reason),
      },
      createAvatarSession,
      { state: setState, view: onView, speaking: setSpeaking, failed: onFallback },
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

  const live = state === 'active';
  return (
    <div className="grid gap-6 min-[900px]:grid-cols-[minmax(0,1fr)_280px]">
      <div className="grid gap-4">
        <div className="card relative overflow-hidden p-0">
          <video ref={videoRef} autoPlay playsInline className="block aspect-video w-full bg-raised object-cover" aria-label="Alex, AI practice coach" />
          {!live && (
            <div className="absolute inset-0 grid place-items-center bg-raised">
              <CoachMark size={96} />
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="mr-auto">
            <div className="text-[16px] font-semibold">Alex</div>
            <div className="label">AI practice coach · AI avatar</div>
            <div className="mt-1 text-[14px] text-muted" role="status">
              {state === 'idle' && 'Ready when you are.'}
              {state === 'connecting' && 'Connecting to Alex…'}
              {live && (speaking ? 'Alex is speaking' : 'Listening')}
              {(state === 'ending' || state === 'ended') && 'Call ended'}
            </div>
          </div>
          {view.deadlineAt && live && <span className="mono text-[14px]">{left === null ? '' : formatClock(left)}</span>}
        </div>
        {state === 'idle' ? (
          <div className="grid gap-3">
            <p className="m-0 text-[14px] leading-5 text-muted">Use headphones if you can. Your microphone goes to our video and speech providers so Alex can answer; your camera stays off. You can mute or end at any time.</p>
            <button type="button" className="btn btn-primary btn-xl" onClick={start}>
              Start the video call
            </button>
            <button type="button" className="btn btn-ghost" onClick={onTypeInstead}>
              Type instead
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-secondary" onClick={toggleMute} aria-pressed={muted} disabled={!live}>
              {muted ? <MicOff size={20} strokeWidth={1.5} aria-hidden /> : <Mic size={20} strokeWidth={1.5} aria-hidden />}
              {muted ? 'Unmute' : 'Mute'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => void callRef.current?.end('end')} disabled={state === 'ending' || state === 'ended'}>
              <PhoneOff size={20} strokeWidth={1.5} aria-hidden /> End and review
            </button>
          </div>
        )}
        <Captions view={view} />
      </div>
      <ProfileSoFar profile={view.publicProfile} />
    </div>
  );
}
