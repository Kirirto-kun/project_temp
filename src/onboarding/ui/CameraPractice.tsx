'use client';

import { Camera, CircleAlert, Loader2, RotateCcw, ShieldCheck, Square, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { getConfig } from '@/client/api/session';
import { cn } from '@/components/ui/cn';
import { alignMoments } from '../client/vision/align';
import { REASON_TEXT } from '../client/vision/copy';
import { createVisionSession, type VisionSession, type VisionUpdate } from '../client/vision/session';
import type { Moment, VisualSummary } from '../client/vision/types';
import { VisualReport } from './VisualReport';

/** Long enough for an opening line and a breath; the session itself caps memory at 10 minutes. */
const MAX_TAKE_MS = 45_000;
const TAKE_ID = 'opening';

type Phase = 'intro' | 'starting' | 'live' | 'finishing' | 'done';
interface Live {
  session: VisionSession;
  stream: MediaStream;
  t0: number;
}

const clock = (ms: number) => `${Math.floor(ms / 60_000)}:${String(Math.floor((ms % 60_000) / 1000)).padStart(2, '0')}`;

function stopStream(stream: MediaStream | null | undefined) {
  stream?.getTracks().forEach((track) => track.stop());
}

/**
 * Optional "practise on camera" step for the coach review. Body language is measured on this device
 * by the vision module (MediaPipe in a worker); nothing is uploaded or stored, there is no uploader at all.
 * Renders nothing unless the server advertises visualIntake (VISUAL_INTAKE=1 and the model files present).
 */
export function CameraPractice({ prompt }: { prompt: string }) {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    getConfig()
      .then((c) => setEnabled(c.capabilities.visualIntake))
      .catch(() => setEnabled(false));
  }, []);
  if (!enabled) return null;
  return <CameraTake prompt={prompt} />;
}

function CameraTake({ prompt }: { prompt: string }) {
  const [phase, setPhase] = useState<Phase>('intro');
  const [consent, setConsent] = useState(false);
  const [update, setUpdate] = useState<VisionUpdate | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<{ summary: VisualSummary; moments: Moment[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const liveRef = useRef<Live | null>(null);

  function releaseCamera(live: Live | null) {
    stopStream(live?.stream);
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  // Leaving the page withdraws the take: the session is revoked and the camera released.
  useEffect(
    () => () => {
      const live = liveRef.current;
      liveRef.current = null;
      if (!live) return;
      stopStream(live.stream);
      void live.session.revoke().catch(() => undefined);
    },
    [],
  );

  async function start() {
    if (liveRef.current || !consent) return;
    setError(null);
    setResult(null);
    setUpdate(null);
    setElapsed(0);
    setPhase('starting');
    let stream: MediaStream | null = null;
    let session: VisionSession | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 360, facingMode: 'user' }, audio: false });
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      const t0 = performance.now();
      const ownStream = stream;
      session = createVisionSession({
        video,
        clock: () => performance.now() - t0,
        recordingId: `vis_${crypto.randomUUID()}`,
        consent: true,
        // Hand-derived kinds stay off until they pass the labelled-clip evaluation (spec, Plan 4).
        enableHands: false,
        onUpdate: (u) => {
          setUpdate(u);
          // The session gave up (slow device or model failure): free the camera now; Finish still returns the summary.
          if (u.status === 'off') {
            stopStream(ownStream);
            if (videoRef.current) videoRef.current.srcObject = null;
          }
        },
      });
      liveRef.current = { session, stream, t0 };
      await session.start();
      setPhase('live');
    } catch (err) {
      stopStream(stream);
      if (videoRef.current) videoRef.current.srcObject = null;
      liveRef.current = null;
      await session?.revoke().catch(() => undefined);
      setPhase('intro');
      const denied = err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
      const missing = err instanceof DOMException && err.name === 'NotFoundError';
      setError(denied ? 'Camera permission was denied. You can allow it in the browser’s site settings and try again.' : missing ? 'No camera was found on this device.' : 'The camera or the on-device model could not start on this browser.');
    }
  }

  async function finish() {
    const live = liveRef.current;
    if (!live) return;
    liveRef.current = null;
    setPhase('finishing');
    const takeMs = performance.now() - live.t0;
    releaseCamera(live);
    try {
      const summary = await live.session.stop();
      const moments = alignMoments(live.session.getObservations(), [{ turnId: TAKE_ID, t0Ms: 0, t1Ms: takeMs }], [TAKE_ID]);
      setResult({ summary, moments });
      setPhase('done');
    } catch {
      setError('The take could not be analysed. Try again.');
      setPhase('intro');
    }
  }

  async function discard() {
    const live = liveRef.current;
    liveRef.current = null;
    releaseCamera(live);
    await live?.session.revoke().catch(() => undefined);
    setResult(null);
    setUpdate(null);
    setPhase('intro');
  }

  // Take timer; ends the take at the limit so nothing runs unattended.
  useEffect(() => {
    if (phase !== 'live') return;
    const timer = setInterval(() => {
      const live = liveRef.current;
      if (!live) return;
      const ms = performance.now() - live.t0;
      setElapsed(ms);
      if (ms >= MAX_TAKE_MS) void finish();
    }, 250);
    return () => clearInterval(timer);
    // finish reads refs only; re-running on its identity would restart the timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const cameraOn = phase === 'starting' || phase === 'live';
  const visibleShare = update && update.observedMs > 0 ? Math.round((update.validMs / update.observedMs) * 100) : null;
  const gaveUp = update?.status === 'off';

  return (
    <section className="grid gap-4" aria-labelledby="camera-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-2">
          <p className="eyebrow m-0">On camera · optional</p>
          <h2 id="camera-title" className="m-0 text-[24px] font-bold leading-[1.15] tracking-[-0.03em]">
            How you come across on camera
          </h2>
        </div>
        <span className="badge badge-hold">
          <ShieldCheck size={12} strokeWidth={2.5} aria-hidden /> On this device
        </span>
      </div>
      <p className="m-0 max-w-[62ch] text-[15px] leading-6 text-muted">
        Say your opening line out loud while an on-device model notes where you look, how your head and shoulders move, and how long you stay in view. Video never leaves this browser, and nothing is saved.
      </p>

      <div className="card grid gap-5 p-5 sm:p-6">
        {/* The preview stays mounted while the camera is on so the session can read frames from it. */}
        <div className={cn('relative overflow-hidden rounded-[20px] bg-night', cameraOn ? 'aspect-[4/5] sm:aspect-video' : 'hidden')}>
          <video ref={videoRef} muted playsInline className="h-full w-full -scale-x-100 object-cover" aria-label="Your camera preview, shown only to you" />
          {phase === 'starting' && (
            <div className="absolute inset-0 grid place-items-center bg-night/80 text-white">
              <span className="flex items-center gap-2 text-[14px]">
                <Loader2 size={16} className="animate-spin" aria-hidden /> Loading the on-device model…
              </span>
            </div>
          )}
          {phase === 'live' && (
            <>
              <span className="badge absolute left-3 top-3 bg-night/70 text-white backdrop-blur-sm">
                <span className="live-dot text-spark" aria-hidden /> <span className="sm:hidden">On device</span>
                <span className="hidden sm:inline">Analysing on this device</span>
              </span>
              <span className="mono absolute right-3 top-3 rounded-full bg-night/70 px-2.5 py-1 text-[12.5px] text-white backdrop-blur-sm">
                {clock(elapsed)} / {clock(MAX_TAKE_MS)}
              </span>
              <p className="absolute inset-x-3 bottom-3 m-0 rounded-[14px] bg-night/70 px-4 py-3 text-[14.5px] leading-6 text-white backdrop-blur-sm">
                <span className="mb-0.5 block text-[11px] font-medium uppercase tracking-[0.08em] text-white/65">Say it out loud</span>“{prompt}”
              </p>
            </>
          )}
        </div>

        {phase === 'intro' && (
          <div className="grid gap-4">
            <label className="flex cursor-pointer items-start gap-3 rounded-[14px] bg-paper-subtle p-3 text-[14.5px] leading-6 shadow-[inset_0_0_0_1px_var(--line)]">
              <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              Analyse my movements on this device while I practise. I can discard the result at any time.
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" className="btn btn-secondary" disabled={!consent} onClick={() => void start()}>
                <Camera size={17} strokeWidth={2} aria-hidden /> Turn on camera
              </button>
              <span className="text-[13px] text-muted">Works best in good light, with your face and shoulders in frame.</span>
            </div>
          </div>
        )}

        {phase === 'live' && (
          <div className="grid gap-3" aria-live="polite">
            {gaveUp ? (
              <p className="callout callout-warn m-0">{update?.offReason ? REASON_TEXT[update.offReason] : 'Visual analysis stopped'}. Finish to see what was measured.</p>
            ) : (
              <p className="m-0 text-[13.5px] text-muted">
                {visibleShare === null ? 'Finding you in the frame…' : `In clear view ${visibleShare}% of the time so far.`} Finish whenever you are done; it stops on its own at {clock(MAX_TAKE_MS)}.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-primary" onClick={() => void finish()}>
                <Square size={15} strokeWidth={2.25} aria-hidden /> Finish
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => void discard()}>
                <Trash2 size={15} strokeWidth={2} aria-hidden /> Discard
              </button>
            </div>
          </div>
        )}

        {phase === 'finishing' && (
          <p className="m-0 flex items-center gap-2 text-muted" role="status">
            <Loader2 size={16} className="animate-spin" aria-hidden /> Putting the observations together…
          </p>
        )}

        {phase === 'done' && result && (
          <div className="pop-in grid gap-4">
            <VisualReport summary={result.summary} moments={result.moments} />
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-secondary" onClick={() => void start()}>
                <RotateCcw size={15} strokeWidth={2} aria-hidden /> Practise again
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => void discard()}>
                <Trash2 size={15} strokeWidth={2} aria-hidden /> Discard the report
              </button>
            </div>
          </div>
        )}

        {error && (
          <p className="callout callout-warn m-0 flex items-start gap-2 text-ink" role="alert">
            <CircleAlert size={18} strokeWidth={2} className="mt-px shrink-0 text-gap" aria-hidden />
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
