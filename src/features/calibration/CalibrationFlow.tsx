'use client';

import { ArrowRight, CircleAlert, Loader2, Mic, Square } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { VoiceBaseline } from '@/contracts/voice';
import { ApiClientError } from '@/client/api/client';
import { createBaseline, getConfig } from '@/client/api/session';
import { createUserCapture, openMicrophone, stopStream, type UserCapture } from '@/client/voice/capture';
import { uploadRecording } from '@/client/voice/upload';
import { ScreenSkeleton } from '@/components/ui/skeleton';
import { CALIBRATION_SECONDS, CALIBRATION_TEXT } from '@/content/calibration';
import { useDraft } from '@/features/setup/useDraft';
import { startRound } from '@/features/setup/start-round';

type Phase = 'intro' | 'recording' | 'processing' | 'done';

const RING = 2 * Math.PI * 44;

/** Countdown ring with a halo that follows the microphone level (transform only, 200ms ease-out). */
function RecordingDial({ secondsLeft, level }: { secondsLeft: number; level: number }) {
  const progress = 1 - secondsLeft / CALIBRATION_SECONDS;
  const halo = 1 + Math.min(1, level * 6) * 0.32;
  return (
    <div className="relative grid h-[120px] w-[120px] place-items-center" aria-hidden>
      <span className="absolute inset-3 rounded-full bg-hold/15 transition-transform duration-200 ease-[var(--ease-out)]" style={{ transform: `scale(${halo})` }} />
      <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
        <circle cx="50" cy="50" r="44" fill="none" stroke="var(--sunken)" strokeWidth="6" />
        <circle
          cx="50"
          cy="50"
          r="44"
          fill="none"
          stroke="var(--hold)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={RING}
          strokeDashoffset={RING * (1 - progress)}
          className="transition-[stroke-dashoffset] duration-200 ease-linear"
        />
      </svg>
      <span className="relative grid h-[68px] w-[68px] place-items-center rounded-full bg-hold text-white shadow-[var(--shadow-hold)]">
        <span className="mono text-[20px] font-medium">{secondsLeft}s</span>
      </span>
    </div>
  );
}

export function CalibrationFlow() {
  const router = useRouter();
  const [state, setState] = useDraft();
  const [phase, setPhase] = useState<Phase>('intro');
  const [available, setAvailable] = useState<boolean | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(CALIBRATION_SECONDS);
  const [level, setLevel] = useState(0);
  const [baseline, setBaseline] = useState<VoiceBaseline | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const captureRef = useRef<UserCapture | null>(null);
  const finishingRef = useRef(false);

  useEffect(() => {
    getConfig()
      .then((c) => setAvailable(c.capabilities.voiceAnalysis))
      .catch(() => setAvailable(false));
    return () => {
      captureRef.current?.dispose();
      stopStream(streamRef.current);
    };
  }, []);

  async function finishRecording() {
    const capture = captureRef.current;
    if (!capture || finishingRef.current) return;
    finishingRef.current = true;
    captureRef.current = null;
    setPhase('processing');
    const result = await capture.stop();
    stopStream(streamRef.current);
    streamRef.current = null;
    finishingRef.current = false;
    if (!result.blob || !result.mimeType) {
      setMessage('Nothing was recorded. Try again or skip.');
      setPhase('intro');
      return;
    }
    try {
      const audioId = await uploadRecording(result.blob, {
        recordingId: result.recordingId,
        purpose: 'baseline',
        sessionId: null,
        intakeId: null,
        durationMs: Math.max(1, result.durationMs),
        mimeType: result.mimeType,
        timebase: 'recording_ms',
        turns: [],
        samples: result.samples,
      });
      const measured = await createBaseline(audioId);
      setBaseline(measured);
      if (measured.quality === 'valid' && state) setState({ ...state, baselineId: measured.id });
      setPhase('done');
    } catch (error) {
      setMessage(error instanceof ApiClientError ? error.message : 'The calibration could not be analysed. Try again or skip.');
      setPhase('intro');
    }
  }

  useEffect(() => {
    if (phase !== 'recording') return;
    const timer = setInterval(() => {
      setLevel(captureRef.current?.level() ?? 0);
      const left = CALIBRATION_SECONDS - Math.floor((captureRef.current?.clock() ?? 0) / 1000);
      setSecondsLeft(Math.max(0, left));
      if (left <= 0) void finishRecording();
    }, 200);
    return () => clearInterval(timer);
    // finishRecording reads refs only; re-running on its identity would restart the timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  async function startRecording() {
    setMessage(null);
    try {
      const stream = await openMicrophone();
      streamRef.current = stream;
      const capture = createUserCapture({ userStream: stream, purpose: 'baseline', recordAudio: true });
      if (!capture.recordingAvailable) {
        capture.dispose();
        stopStream(stream);
        setMessage('This browser cannot record audio for analysis. You can skip calibration and practise.');
        return;
      }
      captureRef.current = capture;
      setSecondsLeft(CALIBRATION_SECONDS);
      setPhase('recording');
    } catch {
      setMessage('The microphone is not available. You can skip calibration; the round works by typing too.');
    }
  }

  async function begin(withBaseline: boolean) {
    if (!state) return;
    setStarting(true);
    setMessage(null);
    try {
      const session = await startRound(state, withBaseline && baseline?.quality === 'valid' ? baseline.id : null);
      router.push(`/session/${session.id}`);
    } catch (error) {
      setStarting(false);
      if (error instanceof ApiClientError && error.code === 'PROFILE_STALE' && state.intake) {
        router.push(`/intake/${state.intake.intakeId}`);
        return;
      }
      setMessage(error instanceof Error ? error.message : 'The round could not start.');
    }
  }

  if (!state) return <ScreenSkeleton />;
  if (!state.avatarId) {
    return (
      <div className="mx-auto grid max-w-[560px] justify-items-start gap-4">
        <h1 className="h-title m-0">Choose a counterpart first</h1>
        <Link href="/opponents" className="btn btn-primary">
          Back to counterparts
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-[600px] gap-7">
      <header className="grid gap-3">
        <p className="eyebrow m-0">Optional · 20 seconds</p>
        <h1 className="h-title m-0">Calibrate your voice</h1>
        <p className="m-0 text-[15px] leading-6 text-muted">
          Read a neutral text so the debrief can compare your pace, pauses and pitch with your own normal. Only your microphone is recorded, it is sent for transcription, and the audio is deleted after the
          analysis (never kept longer than 24 hours). Skipping is fine: you will get absolute values instead.
        </p>
      </header>

      {available === false && <p className="callout m-0">Voice calibration is not available right now. You can still play the round by typing.</p>}

      {available && phase !== 'done' && (
        <div className="card grid gap-6 p-5 sm:p-7">
          <div className="grid gap-2">
            <span className="label">Read this aloud</span>
            <p className="m-0 text-[19px] leading-8 tracking-[-0.01em] text-ink">{CALIBRATION_TEXT}</p>
          </div>
          {phase === 'recording' && (
            <div className="grid justify-items-center gap-4 border-t border-line pt-6" aria-live="polite">
              <RecordingDial secondsLeft={secondsLeft} level={level} />
              <span className="badge badge-hold">
                <span className="live-dot" aria-hidden /> Recording · {secondsLeft}s left
              </span>
              <button type="button" className="btn btn-secondary" onClick={() => void finishRecording()}>
                <Square size={16} strokeWidth={2} aria-hidden /> Stop now
              </button>
            </div>
          )}
          {phase === 'intro' && (
            <button type="button" className="btn btn-secondary btn-xl !max-w-none" onClick={() => void startRecording()}>
              <span className="grid h-7 w-7 place-items-center rounded-full bg-hold text-white">
                <Mic size={15} strokeWidth={2.25} aria-hidden />
              </span>
              Record 20 seconds
            </button>
          )}
          {phase === 'processing' && (
            <p className="m-0 flex items-center justify-center gap-2 border-t border-line pt-6 text-muted" role="status">
              <Loader2 size={18} className="animate-spin" aria-hidden /> Analysing your calibration…
            </p>
          )}
        </div>
      )}

      {phase === 'done' && baseline && (
        <div className="card pop-in grid gap-4 p-5 sm:p-6" role="status">
          <div className="flex items-center justify-between gap-3">
            <span className="label">{baseline.quality === 'valid' ? 'Calibration saved' : 'Not enough speech'}</span>
            <span className={`badge ${baseline.quality === 'valid' ? 'badge-won' : 'badge-gap'}`}>{baseline.quality === 'valid' ? 'Ready' : 'Retry'}</span>
          </div>
          {baseline.quality === 'valid' ? (
            <div className="grid grid-cols-3 gap-2">
              {[
                ['Pace', `${Math.round(baseline.wpm ?? 0)}`, 'words / min'],
                ['Pitch', `${Math.round(baseline.f0MeanHz ?? 0)}`, 'Hz'],
                ['Pauses', `${Math.round((baseline.pauseRatio ?? 0) * 100)}%`, 'of the time'],
              ].map(([k, v, unit]) => (
                <div key={k} className="rounded-[16px] bg-paper-subtle p-3 shadow-[inset_0_0_0_1px_var(--line)]">
                  <div className="label">{k}</div>
                  <div className="num mt-1 text-[24px] font-bold tracking-[-0.03em]">{v}</div>
                  <div className="text-[12px] text-muted">{unit}</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="m-0 text-[15px]">{baseline.unavailableReasons.join(' ')} You can record again or skip.</p>
          )}
          {baseline.quality !== 'valid' && (
            <button type="button" className="btn btn-secondary w-fit" onClick={() => setPhase('intro')}>
              Record again
            </button>
          )}
        </div>
      )}

      {message && (
        <p className="callout callout-warn m-0 flex items-start gap-2 text-ink" role="alert">
          <CircleAlert size={18} strokeWidth={2} className="mt-px shrink-0 text-gap" aria-hidden />
          {message}
        </p>
      )}

      <div className="funnel-actions">
        <button type="button" className="btn btn-primary btn-xl !max-w-none sm:!w-full" disabled={starting || phase === 'recording' || phase === 'processing'} onClick={() => void begin(true)}>
          {starting ? (
            <>
              <Loader2 size={18} className="animate-spin" aria-hidden /> Starting…
            </>
          ) : (
            <>
              Start the round <ArrowRight size={18} strokeWidth={2} className="arrow" aria-hidden />
            </>
          )}
        </button>
        {phase !== 'done' && available && (
          <button type="button" className="btn btn-ghost" disabled={starting || phase === 'processing'} onClick={() => void begin(false)}>
            Skip calibration
          </button>
        )}
        <p className="m-0 text-center text-[12.5px] leading-4 text-muted">The round is free. Five minutes at most.</p>
      </div>
    </div>
  );
}
