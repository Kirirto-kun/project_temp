'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { Capabilities } from '@/contracts/api';
import { ApiClientError } from '@/client/api/client';
import { getConfig } from '@/client/api/session';
import { CoachMark } from '@/components/holdline/Avatar';
import { createIntake } from '../client/api';

/** Invitation to the first call with the AI coach. No paid connection and no device prompt before a click. */
export function IntakeEntry() {
  const router = useRouter();
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [audioAnalysis, setAudioAnalysis] = useState(false);
  const [busy, setBusy] = useState<'audio' | 'text' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getConfig()
      .then((c) => setCaps(c.capabilities))
      .catch(() => setCaps(null));
  }, []);

  async function start(mode: 'audio' | 'text') {
    setBusy(mode);
    setError(null);
    try {
      const intake = await createIntake(mode, audioAnalysis);
      router.push(`/intake/${intake.id}`);
    } catch (err) {
      setBusy(null);
      setError(err instanceof ApiClientError ? err.message : 'The coach is not available right now.');
    }
  }

  const voice = caps?.coachVoice ?? false;
  return (
    <div className="mx-auto grid max-w-[640px] gap-6">
      <section className="card grid gap-5 p-6">
        <div className="flex items-center gap-4">
          <CoachMark size={64} />
          <div>
            <div className="text-[16px] font-semibold">Alex</div>
            <div className="label">AI practice coach</div>
          </div>
        </div>
        <h1 className="h-title m-0">Prepare for your next money conversation.</h1>
        <p className="m-0 text-muted">Tell me about your role and what you want to ask for. We’ll build your practice together.</p>
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
          <li className="chip">About 3–4 minutes</li>
          <li className="chip">{voice ? 'Speak or type' : 'Type your answers'}</li>
          <li className="chip">No camera</li>
        </ul>
        {voice && (
          <p className="m-0 text-[14px] leading-5 text-muted">
            In a voice call your microphone goes to our speech provider so Alex can answer. You confirm every number on screen afterwards.
          </p>
        )}
        {caps?.voiceAnalysis && (
          <label className="flex items-start gap-3 text-[14px] leading-5">
            <input type="checkbox" className="mt-0.5 h-5 w-5" checked={audioAnalysis} onChange={(e) => setAudioAnalysis(e.target.checked)} />
            Analyse a recording of my practice sentence (pauses, filler words, pace). Optional; audio is deleted after the analysis, within 24 hours.
          </label>
        )}
        <div className="grid gap-2">
          <button type="button" className="btn btn-primary btn-xl" disabled={busy !== null} onClick={() => void start(voice ? 'audio' : 'text')}>
            {busy ? 'Starting…' : 'Start the conversation'}
          </button>
          {voice && (
            <button type="button" className="btn btn-secondary" disabled={busy !== null} onClick={() => void start('text')}>
              Type instead
            </button>
          )}
          <Link href="/quiz" className="btn btn-ghost">
            Use the quick form
          </Link>
        </div>
        {error && (
          <p className="m-0 text-gap" role="alert">
            {error}
          </p>
        )}
      </section>
      <p className="m-0 text-center text-[13px] text-muted">
        Alex is an AI, not a person and not your employer. <Link href="/example">See an example result</Link>.
      </p>
    </div>
  );
}
