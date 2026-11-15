'use client';

import { Loader2, Mic, Square, Volume2, VolumeX } from 'lucide-react';
import type { useDictation } from '@/client/voice/useDictation';
import type { SpokenLine, useSpeaker } from '@/client/voice/useSpeaker';
import { cn } from '@/components/ui/cn';

type Speaker = ReturnType<typeof useSpeaker>;
type Dictation = ReturnType<typeof useDictation>;

/** Header switch for reading the other side's replies aloud. Hidden when no voice is available. */
export function SpeakerToggle({ speaker, className }: { speaker: Speaker; className?: string }) {
  if (!speaker.available) return null;
  const on = !speaker.muted;
  return (
    <button
      type="button"
      className={cn('btn btn-ghost btn-sm speech-toggle', className)}
      aria-pressed={on}
      onClick={speaker.toggleMuted}
      title={on ? 'Replies are read aloud. Click to mute.' : 'Replies are muted. Click to read them aloud.'}
    >
      {on ? <Volume2 size={16} strokeWidth={2} aria-hidden /> : <VolumeX size={16} strokeWidth={2} aria-hidden />}
      <span className="sr-only sm:not-sr-only">{on ? 'Sound on' : 'Muted'}</span>
      <span className="sr-only"> — read replies aloud</span>
    </button>
  );
}

/** Small play/stop button on one of the other side's bubbles. */
export function ReplayButton({ speaker, line }: { speaker: Speaker; line: SpokenLine }) {
  if (!speaker.available) return null;
  const playing = speaker.playingId === line.id;
  return (
    <button
      type="button"
      className="speech-replay"
      data-playing={playing || undefined}
      aria-label={playing ? 'Stop reading this line' : 'Read this line aloud'}
      onClick={() => (playing ? speaker.stop() : void speaker.play(line))}
    >
      {playing ? <Square size={11} strokeWidth={2.5} fill="currentColor" aria-hidden /> : <Volume2 size={14} strokeWidth={2} aria-hidden />}
    </button>
  );
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** Mic button inside the composer: record, then stop to put the words in the box. */
export function DictationButton({ dictation, disabled }: { dictation: Dictation; disabled: boolean }) {
  if (!dictation.available) return null;
  const { state } = dictation;
  if (state === 'recording') {
    return (
      <button type="button" className="btn btn-icon composer-mic" data-recording onClick={() => void dictation.stop()} aria-label="Stop recording and use the words">
        <Square size={15} strokeWidth={2.5} fill="currentColor" aria-hidden />
      </button>
    );
  }
  return (
    <button
      type="button"
      className="btn btn-ghost btn-icon composer-mic"
      disabled={disabled || state === 'transcribing'}
      onClick={() => void dictation.start()}
      aria-label="Dictate your reply"
    >
      {state === 'transcribing' ? <Loader2 size={18} className="animate-spin" aria-hidden /> : <Mic size={19} strokeWidth={2} aria-hidden />}
    </button>
  );
}

/** Shown in place of the text field while recording or transcribing. */
export function DictationStatus({ dictation }: { dictation: Dictation }) {
  if (dictation.state === 'idle') return null;
  return (
    <div className="composer-status" role="status">
      {dictation.state === 'recording' ? (
        <>
          <span className="live-dot text-gap" aria-hidden />
          <span>Recording</span>
          <span className="mono text-muted" aria-label={`${dictation.seconds} seconds`}>
            {clock(dictation.seconds)}
          </span>
          <button type="button" className="composer-status-cancel" onClick={dictation.cancel}>
            Cancel
          </button>
        </>
      ) : (
        <span className="text-muted">Turning your words into text…</span>
      )}
    </div>
  );
}
