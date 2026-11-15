'use client';

import { Mic, MicOff, PhoneOff, Video } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { CoachMark } from '@/components/holdline/Avatar';
import { formatClock, useCountdown } from '@/features/session/useCountdown';
import type { IntakeView } from '../contracts';
import { connectVideo, getIntake, postVideoTurn, stopIntake } from '../client/api';
import { AvatarCall, type AvatarCallState } from '../client/avatar-call';
import { createAvatarSession } from '../client/avatar-session';
import { Captions } from './TextCoach';
import { ProfileSoFar } from './ProfileSoFar';

/**
 * Video call with Alex (LiveAvatar FULL). Same layout and controls as the voice call: the avatar
 * video takes the place of the coach mark. Only the microphone is used; the camera stays off.
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

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
      <div className="grid gap-5">
        <section className="on-violet relative grid justify-items-center gap-4 overflow-hidden rounded-[32px] px-6 pb-7 pt-9 text-center" aria-label="Video call with Alex">
          <div className="pointer-events-none absolute inset-x-0 -top-24 mx-auto h-64 w-64 rounded-full bg-violet-400/40 blur-3xl" aria-hidden />
          <div className="relative aspect-video w-full max-w-[560px] overflow-hidden rounded-[24px] bg-white/10 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.15)]">
            <video ref={videoRef} autoPlay playsInline className={`h-full w-full object-cover transition-opacity duration-300 ${live ? 'opacity-100' : 'opacity-0'}`} aria-label="Alex, AI practice coach (AI avatar)" />
            {!live && (
              <div className="absolute inset-0 grid place-items-center">
                <CoachMark size={112} speaking={speaking} idle={state === 'idle'} />
              </div>
            )}
            {view.deadlineAt && active && <span className="mono absolute right-3 top-3 rounded-full bg-black/35 px-3 py-1 text-[13px] text-white">{left === null ? '' : formatClock(left)}</span>}
          </div>
          <div className="relative grid gap-1">
            <div className="flex items-center justify-center gap-2">
              <span className="text-[19px] font-semibold tracking-[-0.02em]">Alex</span>
              <span className="badge bg-white/15 text-white">AI coach · AI avatar</span>
            </div>
            <div className="text-[14px] text-white/80" role="status">
              {status}
            </div>
          </div>
          {state === 'idle' ? (
            <div className="relative mt-2 grid w-full max-w-[360px] gap-2">
              <button type="button" className="btn btn-white btn-xl !max-w-none" onClick={start}>
                <Video size={18} strokeWidth={2} aria-hidden /> Start the video call
              </button>
              <button type="button" className="btn hero-ghost" onClick={onTypeInstead}>
                Type instead
              </button>
            </div>
          ) : (
            <div className="relative mt-2 flex items-start justify-center gap-6">
              <div className="grid justify-items-center gap-1.5">
                <button type="button" className={`btn btn-icon !min-h-14 !w-14 ${muted ? 'btn-white' : 'hero-ghost'}`} onClick={toggleMute} aria-pressed={muted} disabled={!active} aria-label={muted ? 'Unmute' : 'Mute'}>
                  {muted ? <MicOff size={22} strokeWidth={1.75} aria-hidden /> : <Mic size={22} strokeWidth={1.75} aria-hidden />}
                </button>
                <span className="text-[12px] text-white/75">{muted ? 'Unmute' : 'Mute'}</span>
              </div>
              <div className="grid justify-items-center gap-1.5">
                <button type="button" className="btn btn-icon call-end !min-h-14 !w-14" onClick={() => void callRef.current?.end('end')} disabled={state === 'ending' || state === 'ended'} aria-label="End and review">
                  <PhoneOff size={22} strokeWidth={1.75} aria-hidden />
                </button>
                <span className="text-[12px] text-white/75">End and review</span>
              </div>
            </div>
          )}
        </section>
        {state === 'idle' && <p className="m-0 text-center text-[14px] leading-6 text-muted">Use headphones if you can. Your microphone goes to our video provider so Alex can hear you; your camera stays off. You can mute or end at any time.</p>}
        <Captions view={view} />
      </div>
      <ProfileSoFar profile={view.publicProfile} />
    </div>
  );
}
