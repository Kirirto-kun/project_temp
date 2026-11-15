'use client';

import { ArrowRight, Loader2, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { Capabilities } from '@/contracts/api';
import type { Debrief } from '@/contracts/voice';
import { formatMoney } from '@/domain/money';
import { ApiClientError } from '@/client/api/client';
import { getConfig, getDebrief, replay } from '@/client/api/session';
import { recordResult } from '@/client/storage/plan';
import { ScreenSkeleton } from '@/components/ui/skeleton';
import { DebriefReport } from './DebriefReport';

function Comparison({ current, previous }: { current: Debrief; previous: Debrief }) {
  const comparable = current.scenarioId === previous.scenarioId && current.scenarioVersion === previous.scenarioVersion && current.period === previous.period && current.objective === previous.objective;
  if (!comparable) return null;
  let line: string;
  if (previous.agreedMinor === null && current.agreedMinor === null) line = 'Neither round reached an agreement.';
  else if (previous.agreedMinor === null) line = `The previous round had no agreement. This time you agreed at ${formatMoney(current.agreedMinor!, current.period)}.`;
  else if (current.agreedMinor === null) line = `The previous round agreed at ${formatMoney(previous.agreedMinor, previous.period)}. This round had no agreement.`;
  else {
    const delta = current.objective === 'maximize' ? current.agreedMinor - previous.agreedMinor : previous.agreedMinor - current.agreedMinor;
    line = delta === 0 ? `Same result as the previous round: ${formatMoney(current.agreedMinor, current.period)}.` : delta > 0 ? `${formatMoney(delta, current.period)} better than your previous round.` : `${formatMoney(-delta, current.period)} below your previous round.`;
  }
  return (
    <div className="card flex items-start gap-3 p-5">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-hold-tint text-hold-text">
        <RotateCcw size={16} strokeWidth={2} aria-hidden />
      </span>
      <div>
        <div className="label">Compared with your previous round</div>
        <p className="m-0 mt-1 text-[15.5px] leading-6">{line}</p>
      </div>
    </div>
  );
}

export function DebriefScreen({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [debrief, setDebrief] = useState<Debrief | null>(null);
  const [previous, setPrevious] = useState<Debrief | null>(null);
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [replaying, setReplaying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    async function load() {
      try {
        const d = await getDebrief(sessionId);
        if (cancelled) return;
        setDebrief(d);
        recordResult(d);
        if (d.replayOf) getDebrief(d.replayOf).then((p) => !cancelled && setPrevious(p)).catch(() => undefined);
        if (d.voice.status === 'pending' && attempts < 30) {
          attempts += 1;
          setTimeout(load, 3_000);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiClientError ? err.message : 'Could not load the debrief.');
      }
    }
    void load();
    getConfig().then((c) => !cancelled && setCaps(c.capabilities)).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  async function onReplay() {
    setReplaying(true);
    setError(null);
    try {
      const next = await replay(sessionId, null);
      router.push(`/session/${next.id}`);
    } catch (err) {
      setReplaying(false);
      setError(err instanceof ApiClientError ? err.message : 'Could not start the replay.');
    }
  }

  if (error && !debrief) {
    return (
      <div className="mx-auto grid max-w-[560px] justify-items-start gap-4">
        <p className="eyebrow m-0">Debrief</p>
        <h1 className="h-title m-0">Debrief unavailable</h1>
        <p className="m-0 text-muted">{error}</p>
        <Link href="/example" className="btn btn-secondary">
          See the example debrief
        </Link>
      </div>
    );
  }
  if (!debrief) {
    return (
      <div className="mx-auto grid w-full max-w-[640px] gap-5">
        {/* The first load can wait on the written comments; say so instead of showing bare placeholders. */}
        <p className="fade-in m-0 flex items-center gap-2.5 text-[15px] leading-6 text-muted" style={{ ['--delay' as string]: '400ms' }} aria-hidden>
          <Loader2 size={16} className="shrink-0 animate-spin" aria-hidden />
          Writing your debrief. This can take several seconds.
        </p>
        <ScreenSkeleton variant="report" label="Writing your debrief. This can take several seconds." />
      </div>
    );
  }

  return (
    <DebriefReport
      debrief={debrief}
      actions={
        <div className="grid gap-4">
          {previous && <Comparison current={debrief} previous={previous} />}
          <section className="on-violet relative grid gap-5 overflow-hidden rounded-[28px] p-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-8" aria-label="Next">
            <div className="pointer-events-none absolute -right-16 -top-20 h-60 w-60 rounded-full bg-violet-400/40 blur-3xl" aria-hidden />
            <div className="relative grid gap-2">
              <span className="text-[12px] font-medium uppercase tracking-[0.08em] text-white/70">Run it back</span>
              <p className="m-0 text-[22px] font-bold leading-[1.2] tracking-[-0.025em] text-white">Same counterpart, same range. Try the better line.</p>
              <p className="m-0 text-[13.5px] leading-5 text-white/75">The replay is free; the wording of replies may differ, the rules do not.</p>
            </div>
            <div className="relative grid gap-2 sm:justify-items-end">
              <button type="button" className="btn btn-white btn-xl" onClick={() => void onReplay()} disabled={replaying}>
                {replaying ? <Loader2 size={18} className="animate-spin" aria-hidden /> : <RotateCcw size={18} strokeWidth={2} aria-hidden />}
                {replaying ? 'Starting…' : 'Replay this round'}
              </button>
              <Link href="/plan" className="btn hero-ghost">
                Add to my plan
              </Link>
            </div>
          </section>
          {error && (
            <p className="callout callout-warn m-0 text-ink" role="alert">
              {error}
            </p>
          )}
          {(caps?.customScenario || caps?.offerAnalysis) && (
            <div className="card flex flex-wrap items-center justify-between gap-4 p-5">
              <div className="grid gap-1">
                <div className="label">Your own situation</div>
                <p className="m-0 text-[15px] leading-6">Practise a scenario written from your own description, or get a real offer read line by line.</p>
              </div>
              <Link href="/pricing" className="btn btn-secondary">
                See the conversation pack <ArrowRight size={16} strokeWidth={2} className="arrow" aria-hidden />
              </Link>
            </div>
          )}
        </div>
      }
    />
  );
}
