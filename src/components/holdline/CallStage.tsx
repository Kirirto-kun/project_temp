'use client';

import type { ReactNode, RefObject } from 'react';

export type CallStageState = 'idle' | 'connecting' | 'active' | 'ending' | 'ended';

/**
 * A video-call room in the style of Google Meet / Zoom, shared by the coach (Alex) and the
 * negotiation counterparts. Placeholder implementation: the layout is being built separately;
 * keep this props contract stable.
 */
export interface CallStageProps {
  /** The remote avatar video element. */
  videoRef: RefObject<HTMLVideoElement | null>;
  /** True once the remote stream is attached and playing. */
  live: boolean;
  state: CallStageState;
  /** Name tag on the remote tile, e.g. "Alex" or "Maya Chen". */
  name: string;
  /** Second line of the name tag, e.g. "AI coach" or "Engineering manager". */
  subtitle?: string;
  /** Shown in the remote tile while the video is not live (e.g. the illustrated avatar). */
  placeholder: ReactNode;
  speaking: boolean;
  /** Short status for screen readers and the not-live tile, e.g. "Connecting…". */
  status: string;
  /** Seconds left, or null to hide the timer. */
  timeLeft: number | null;
  /** The latest line, shown as a live caption over the video. */
  caption: { speaker: string; text: string } | null;
  muted: boolean;
  startLabel: string;
  onStart(): void;
  onMute(): void;
  endLabel: string;
  onEnd(): void;
  /** Optional extra action in the lobby and control bar, e.g. "Type instead". */
  secondary?: { label: string; onClick(): void };
}

export function CallStage(props: CallStageProps) {
  const { videoRef, live, state, name, subtitle, placeholder, status, muted, startLabel, onStart, onMute, endLabel, onEnd, secondary } = props;
  return (
    <section aria-label={`Video call with ${name}`} className="grid gap-3">
      <div className="relative aspect-video overflow-hidden rounded-[16px] bg-black">
        <video ref={videoRef} autoPlay playsInline className={live ? 'h-full w-full object-cover' : 'hidden'} aria-label={name} />
        {!live && <div className="absolute inset-0 grid place-items-center">{placeholder}</div>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-auto">
          {name}
          {subtitle ? ` · ${subtitle}` : ''} — <span role="status">{status}</span>
        </span>
        {state === 'idle' ? (
          <button type="button" className="btn btn-primary" onClick={onStart}>
            {startLabel}
          </button>
        ) : (
          <>
            <button type="button" className="btn btn-secondary" onClick={onMute} aria-pressed={muted} disabled={state !== 'active'}>
              {muted ? 'Unmute' : 'Mute'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={onEnd} disabled={state === 'ending' || state === 'ended'}>
              {endLabel}
            </button>
          </>
        )}
        {secondary && (
          <button type="button" className="btn btn-ghost" onClick={secondary.onClick}>
            {secondary.label}
          </button>
        )}
      </div>
    </section>
  );
}
