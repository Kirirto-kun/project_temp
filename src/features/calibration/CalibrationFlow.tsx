'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Mic } from 'lucide-react';
import type { VoiceBaseline } from '@/contracts/voice';
import { ApiClientError } from '@/client/api/client';
import { createBaseline, getConfig } from '@/client/api/session';
import { createUserCapture, openMicrophone, stopStream, type UserCapture } from '@/client/voice/capture';
import { uploadRecording } from '@/client/voice/upload';
import { CALIBRATION_SECONDS, CALIBRATION_TEXT } from '@/content/calibration';
import { useDraft } from '@/features/setup/useDraft';
import { startRound } from '@/features/setup/start-round';

type Phase = 'intro' | 'recording' | 'processing' | 'done';

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

  if (!state) return <p className="text-muted">Loading…</p>;
  if (!state.avatarId) {
    return (
      <p>
        Choose a counterpart first. <a href="/opponents">Back to counterparts</a>
      </p>
    );
  }

  return (
    <div className="mx-auto grid max-w-[560px] gap-6">
      <div>
        <p className="eyebrow m-0">Optional · 20 seconds</p>
        <h1 className="h-screen m-0 mt-2">Calibrate your voice</h1>
        <p className="m-0 mt-2 text-[15px] leading-6 text-muted">
          Read a neutral text so the debrief can compare your pace, pauses and pitch with your own normal. Only your microphone is recorded, it is sent for transcription, and the audio is deleted after the
          analysis (never kept longer than 24 hours). Skipping is fine: you will get absolute values instead.
        </p>
      </div>

      {available === false && <p className="m-0 rounded-[8px] bg-hold-tint p-3 text-[14px]">Voice calibration is not available right now. You can still play the round by typing.</p>}

      {available && phase !== 'done' && (
        <div className="card grid gap-4 p-4">
          <p className="m-0 text-[18px] leading-7">{CALIBRATION_TEXT}</p>
          {phase === 'recording' && (
            <div className="grid gap-2" aria-live="polite">
              <div className="flex items-center justify-between">
                <span className="label">Recording</span>
                <span className="mono text-[14px]">{secondsLeft}s</span>
              </div>
              <div className="meter-track" aria-hidden>
                <div className="meter-fill bg-hold" style={{ width: `${Math.min(100, level * 600)}%` }} />
              </div>
              <button type="button" className="btn btn-secondary" onClick={() => void finishRecording()}>
                Stop now
              </button>
            </div>
          )}
          {phase === 'intro' && (
            <button type="button" className="btn btn-secondary" onClick={() => void startRecording()}>
              <Mic size={20} strokeWidth={1.5} aria-hidden /> Record 20 seconds
            </button>
          )}
          {phase === 'processing' && (
            <p className="m-0 text-muted" role="status">
              Analysing your calibration…
            </p>
          )}
        </div>
      )}

      {phase === 'done' && baseline && (
        <div className="card grid gap-2 p-4" role="status">
          <div className="label">{baseline.quality === 'valid' ? 'Calibration saved' : 'Not enough speech'}</div>
          {baseline.quality === 'valid' ? (
            <p className="m-0 text-[15px]">
              Pace <span className="num">{Math.round(baseline.wpm ?? 0)}</span> words per minute · pitch <span className="num">{Math.round(baseline.f0MeanHz ?? 0)}</span> Hz · pauses{' '}
              <span className="num">{Math.round((baseline.pauseRatio ?? 0) * 100)}%</span>
            </p>
          ) : (
            <p className="m-0 text-[15px]">{baseline.unavailableReasons.join(' ')} You can record again or skip.</p>
          )}
          {baseline.quality !== 'valid' && (
            <button type="button" className="btn btn-secondary" onClick={() => setPhase('intro')}>
              Record again
            </button>
          )}
        </div>
      )}

      {message && (
        <p className="m-0 text-gap" role="alert">
          {message}
        </p>
      )}

      <div className="grid gap-2">
        <button type="button" className="btn btn-primary btn-xl" disabled={starting || phase === 'recording' || phase === 'processing'} onClick={() => void begin(true)}>
          {starting ? 'Starting…' : 'Start the round'}
        </button>
        {phase !== 'done' && available && (
          <button type="button" className="btn btn-ghost" disabled={starting || phase === 'processing'} onClick={() => void begin(false)}>
            Skip calibration
          </button>
        )}
        <p className="m-0 text-center text-[12px] leading-4 text-muted">The round is free. Five minutes at most.</p>
      </div>
    </div>
  );
}
