'use client';

import { ArrowRight, CameraOff, CircleAlert, Clock, Keyboard, Loader2, Mic } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { Capabilities } from '@/contracts/api';
import { ApiClientError } from '@/client/api/client';
import { getConfig } from '@/client/api/session';
import { CoachMark } from '@/components/holdline/Avatar';
import { createIntake } from '../client/api';

const AGENDA = [
  ['What you are negotiating', 'A raise, an offer, rent or a bill, and with whom.'],
  ['Your numbers', 'What you earn or pay now, and what you want instead.'],
  ['The range you know', 'Or practice bounds, clearly labelled as an assumption.'],
  ['What worries you', 'The answer you dread, so the round can rehearse it.'],
] as const;

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
    <div className="mx-auto grid max-w-[1000px] gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
      <section className="card rise grid content-start gap-6 p-6 sm:p-9" aria-labelledby="intake-title">
        <div className="flex items-center gap-4">
          <CoachMark size={64} idle />
          <div className="grid gap-1">
            <div className="flex items-center gap-2">
              <span className="text-[17px] font-semibold tracking-[-0.015em]">Alex</span>
              <span className="badge badge-hold">AI</span>
            </div>
            <span className="text-[13.5px] text-muted">Practice coach</span>
          </div>
        </div>
        <h1 id="intake-title" className="h-title m-0">
          Prepare for your next money conversation.
        </h1>
        <p className="m-0 text-[16px] leading-7 text-muted">Tell me about your role and what you want to ask for. We’ll build your practice together.</p>
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
          <li className="chip">
            <Clock size={14} strokeWidth={2} aria-hidden /> About 3–4 minutes
          </li>
          <li className="chip">
            {voice ? <Mic size={14} strokeWidth={2} aria-hidden /> : <Keyboard size={14} strokeWidth={2} aria-hidden />} {voice ? 'Speak or type' : 'Type your answers'}
          </li>
          <li className="chip">
            <CameraOff size={14} strokeWidth={2} aria-hidden /> No camera
          </li>
        </ul>
        {voice && <p className="m-0 text-[14px] leading-6 text-muted">In a voice call your microphone goes to our speech provider so Alex can answer. You confirm every number on screen afterwards.</p>}
        {caps?.voiceAnalysis && (
          <label className="flex cursor-pointer items-start gap-3 rounded-[16px] bg-paper-subtle p-4 text-[14px] leading-6 shadow-[inset_0_0_0_1px_var(--line)]">
            <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={audioAnalysis} onChange={(e) => setAudioAnalysis(e.target.checked)} />
            Analyse a recording of my practice sentence (pauses, filler words, pace). Optional; audio is deleted after the analysis, within 24 hours.
          </label>
        )}
        <div className="grid gap-2 sm:flex sm:flex-wrap sm:items-center">
          <button type="button" className="btn btn-primary btn-xl" disabled={busy !== null} onClick={() => void start(voice ? 'audio' : 'text')}>
            {busy ? (
              <>
                <Loader2 size={18} className="animate-spin" aria-hidden /> Starting…
              </>
            ) : (
              <>
                Start the conversation <ArrowRight size={18} strokeWidth={2} className="arrow" aria-hidden />
              </>
            )}
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
          <p className="callout callout-warn m-0 flex items-start gap-2 text-ink" role="alert">
            <CircleAlert size={18} strokeWidth={2} className="mt-px shrink-0 text-gap" aria-hidden />
            {error}
          </p>
        )}
      </section>

      <aside className="panel rise grid content-start gap-5 p-6 sm:p-8" style={{ ['--delay' as string]: '90ms' }} aria-label="What Alex will ask">
        <span className="label">What Alex will ask</span>
        <ol className="m-0 grid list-none gap-4 p-0">
          {AGENDA.map(([title, text], i) => (
            <li key={title} className="grid grid-cols-[32px_minmax(0,1fr)] gap-3">
              <span className="mono grid h-8 w-8 place-items-center rounded-full bg-raised text-[12.5px] text-hold-text shadow-[var(--shadow-raise)]">{i + 1}</span>
              <span className="grid gap-0.5">
                <span className="text-[15px] font-semibold tracking-[-0.01em]">{title}</span>
                <span className="text-[14px] leading-5 text-muted">{text}</span>
              </span>
            </li>
          ))}
        </ol>
        <p className="m-0 rounded-[16px] bg-raised p-4 text-[14px] leading-6 text-ink-soft shadow-[var(--shadow-raise)]">
          Nothing is used until you review it. Alex is an AI, not a person and not your employer. <Link href="/example">See an example result</Link>.
        </p>
      </aside>
    </div>
  );
}
