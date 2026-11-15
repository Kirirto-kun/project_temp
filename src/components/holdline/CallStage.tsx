'use client';

import { Captions, CaptionsOff, Loader2, Mic, MicOff, PhoneOff, Video } from 'lucide-react';
import { useState, type ReactNode, type RefObject } from 'react';
import { formatClock } from '@/features/session/useCountdown';
import { cn } from '@/components/ui/cn';

export type CallStageState = 'idle' | 'connecting' | 'active' | 'ending' | 'ended';

/**
 * A video-call room in the style of Google Meet / Zoom, shared by the coach (Alex) and the
 * negotiation counterparts: one dark meeting window with the remote tile, a small self tile
 * (camera always off), a timer, live captions and a centred control bar.
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
  /** Left label of the control bar after the name. Defaults to "Practice call". */
  callLabel?: string;
}

const roundButton = 'btn btn-icon !min-h-12 !w-12 sm:!min-h-[52px] sm:!w-[52px]';

export function CallStage(props: CallStageProps) {
  const { videoRef, live, state, name, subtitle, placeholder, speaking, status, timeLeft, caption, muted, startLabel, onStart, onMute, endLabel, onEnd, secondary, callLabel = 'Practice call' } = props;
  const [captionsOn, setCaptionsOn] = useState(true);
  const lobby = state === 'idle';
  const closing = state === 'ending' || state === 'ended';
  const showVideo = live && !closing;
  const lowTime = timeLeft !== null && timeLeft < 60;

  return (
    <section aria-label={`Video call with ${name}`} className="call-room grid gap-2 rounded-[22px] p-2 shadow-lift sm:gap-3 sm:rounded-[24px] sm:p-3">
      <p role="status" className="sr-only">
        {status}
      </p>

      {/* Remote tile */}
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-[16px] bg-[var(--room-tile)] min-[480px]:aspect-[4/3] sm:aspect-video">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          aria-label={subtitle ? `${name}, ${subtitle}` : name}
          className={cn('absolute inset-0 h-full w-full object-cover transition-opacity duration-300', showVideo ? 'opacity-100' : 'opacity-0')}
        />

        {!showVideo && (
          <div className="absolute inset-0 grid place-content-center justify-items-center gap-4 px-4 pb-14 pt-12 text-center" aria-hidden>
            <div className="grid place-items-center">{placeholder}</div>
            <div className="flex items-center gap-2 text-[14px] leading-5 text-white/80">
              {state === 'connecting' && <Loader2 size={16} strokeWidth={2} className="shrink-0 animate-spin motion-reduce:animate-none" />}
              <span>{status}</span>
            </div>
          </div>
        )}

        <div className="call-speaking-ring pointer-events-none absolute inset-0 rounded-[inherit]" data-on={speaking && !closing} aria-hidden />

        {timeLeft !== null && (
          <span
            className={cn(
              'mono absolute left-3 top-3 rounded-full px-3 py-1 text-[13px] tabular-nums text-white backdrop-blur-sm',
              lowTime ? 'bg-[var(--room-danger)]/85' : 'bg-black/50',
            )}
            aria-label={`${formatClock(timeLeft)} left`}
          >
            {formatClock(timeLeft)}
          </span>
        )}

        {/* Self tile: the user's camera is never used. Top-right on phones, bottom-right above. */}
        <div
          className="absolute right-3 top-3 grid aspect-[3/4] w-[76px] place-items-center rounded-[12px] bg-[var(--room-raised)] shadow-[0_4px_16px_rgba(0,0,0,0.35)] sm:bottom-3 sm:top-auto sm:aspect-video sm:w-40"
          aria-label={muted ? 'You, camera off, microphone muted' : 'You, camera off'}
          role="img"
        >
          <span className="grid size-9 place-items-center rounded-full bg-violet-500 text-[15px] font-semibold text-white sm:size-11 sm:text-[17px]" aria-hidden>
            Y
          </span>
          <span className="absolute bottom-1.5 left-2 flex items-center gap-1 text-[11px] font-medium text-white/90" aria-hidden>
            {muted && <MicOff size={12} strokeWidth={2} className="text-[var(--room-danger)]" />}
            You
          </span>
        </div>

        {captionsOn && caption && !lobby && (
          <div className="absolute inset-x-3 bottom-16 flex justify-center sm:bottom-[7.25rem]" aria-hidden>
            <div className="max-w-[36rem] rounded-[10px] bg-black/70 px-3.5 py-2 text-left backdrop-blur-sm">
              <div className="text-[12px] font-medium leading-4 text-white/70">{caption.speaker}</div>
              <p className="m-0 line-clamp-3 text-[15px] leading-[1.35] text-white sm:text-[16px]">{caption.text}</p>
            </div>
          </div>
        )}

        {/* Remote name tag */}
        <div className="absolute bottom-3 left-3 flex max-w-[calc(100%-1.5rem)] items-center gap-2 rounded-[10px] bg-black/55 px-2.5 py-1.5 backdrop-blur-sm sm:max-w-[calc(100%-12.5rem)]">
          <Mic size={14} strokeWidth={2} className={cn('shrink-0 transition-colors', speaking && !closing ? 'text-violet-300' : 'text-white/80')} aria-hidden />
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-[13px] font-medium text-white">{name}</span>
            {subtitle && <span className="block truncate text-[11px] text-white/70">{subtitle}</span>}
          </span>
        </div>
      </div>

      {/* Control bar */}
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 px-1 py-1 sm:grid sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:px-2">
        <div className="hidden min-w-0 truncate text-[14px] text-white/80 sm:block">
          <span className="font-medium text-white">{name}</span> · {callLabel}
        </div>

        {lobby ? (
          <div className="flex justify-center">
            <button type="button" className="btn btn-primary !min-h-12 px-6 text-[15.5px]" onClick={onStart}>
              <Video size={18} strokeWidth={2} aria-hidden /> {startLabel}
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              className={cn(roundButton, muted ? 'call-btn-danger' : 'call-btn')}
              onClick={onMute}
              aria-label="Mute"
              aria-pressed={muted}
              title={muted ? 'Unmute' : 'Mute'}
              disabled={state !== 'active'}
            >
              {muted ? <MicOff size={20} strokeWidth={1.9} aria-hidden /> : <Mic size={20} strokeWidth={1.9} aria-hidden />}
            </button>
            <button
              type="button"
              className={cn(roundButton, 'call-btn', captionsOn && '!bg-violet-300 !text-violet-950')}
              onClick={() => setCaptionsOn((on) => !on)}
              aria-label="Captions"
              aria-pressed={captionsOn}
              title={captionsOn ? 'Turn off captions' : 'Turn on captions'}
              disabled={closing}
            >
              {captionsOn ? <Captions size={20} strokeWidth={1.9} aria-hidden /> : <CaptionsOff size={20} strokeWidth={1.9} aria-hidden />}
            </button>
            <button type="button" className="btn call-btn-danger !min-h-12 !w-[64px] !px-0 sm:!min-h-[52px] sm:!w-auto sm:!px-5" onClick={onEnd} aria-label={endLabel} disabled={closing}>
              <PhoneOff size={20} strokeWidth={1.9} aria-hidden />
              <span className="hidden sm:inline">{endLabel}</span>
            </button>
          </div>
        )}

        {secondary ? (
          <div className="flex min-w-0 justify-end">
            <button type="button" className="btn btn-sm bg-transparent !text-white/80 hover:!text-white" onClick={secondary.onClick}>
              {secondary.label}
            </button>
          </div>
        ) : (
          <div className="hidden sm:block" aria-hidden />
        )}
      </div>
    </section>
  );
}
