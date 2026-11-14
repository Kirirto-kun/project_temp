'use client';

import { Mic, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { newClientId } from '@/client/api/client';
import { createUserCapture, openMicrophone, stopStream, type UserCapture } from '@/client/voice/capture';
import { uploadRecording } from '@/client/voice/upload';
import type { IntakeView } from '../contracts';
import { submitPracticeAudio } from '../client/api';

/** Records the opening sentence (max 30 s) for speech analysis. Only with audio-analysis consent. */
export function PracticeRecorder({ intakeId, onDone, onError }: { intakeId: string; onDone: (view: IntakeView) => void; onError: (message: string) => void }) {
  const [state, setState] = useState<'idle' | 'recording' | 'uploading'>('idle');
  const [seconds, setSeconds] = useState(0);
  const captureRef = useRef<UserCapture | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(
    () => () => {
      captureRef.current?.dispose();
      stopStream(streamRef.current);
    },
    [],
  );

  useEffect(() => {
    if (state !== 'recording') return;
    const timer = setInterval(() => {
      const s = Math.floor((captureRef.current?.clock() ?? 0) / 1000);
      setSeconds(s);
      if (s >= 30) void stop();
    }, 250);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  async function start() {
    try {
      const stream = await openMicrophone();
      streamRef.current = stream;
      const capture = createUserCapture({ userStream: stream, purpose: 'intake', recordAudio: true });
      if (!capture.recordingAvailable) {
        capture.dispose();
        stopStream(stream);
        onError('This browser cannot record for analysis. Type the sentence instead.');
        return;
      }
      captureRef.current = capture;
      setState('recording');
    } catch {
      onError('The microphone is not available. Type the sentence instead.');
    }
  }

  async function stop() {
    const capture = captureRef.current;
    if (!capture) return;
    captureRef.current = null;
    setState('uploading');
    const result = await capture.stop();
    stopStream(streamRef.current);
    streamRef.current = null;
    if (!result.blob || !result.mimeType) {
      setState('idle');
      onError('Nothing was recorded. Try again or type it.');
      return;
    }
    const turnId = newClientId('pr');
    try {
      const audioId = await uploadRecording(result.blob, {
        recordingId: result.recordingId,
        purpose: 'intake',
        sessionId: null,
        intakeId,
        durationMs: Math.max(1, result.durationMs),
        mimeType: result.mimeType,
        timebase: 'recording_ms',
        turns: [{ turnId, t0Ms: 0, t1Ms: Math.max(1, result.durationMs) }],
        samples: result.samples,
      });
      onDone(await submitPracticeAudio(intakeId, audioId, turnId));
    } catch (err) {
      setState('idle');
      onError(err instanceof Error ? err.message : 'The recording could not be analysed. Type the sentence instead.');
    }
  }

  if (state === 'recording') {
    return (
      <button type="button" className="btn btn-secondary" onClick={() => void stop()}>
        <Square size={18} strokeWidth={1.5} aria-hidden /> Stop recording · <span className="mono">{seconds}s</span>
      </button>
    );
  }
  return (
    <button type="button" className="btn btn-secondary" onClick={() => void start()} disabled={state === 'uploading'}>
      <Mic size={20} strokeWidth={1.5} aria-hidden /> {state === 'uploading' ? 'Analysing…' : 'Say it aloud instead'}
    </button>
  );
}
