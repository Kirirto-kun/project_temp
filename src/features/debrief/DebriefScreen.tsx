'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { Capabilities } from '@/contracts/api';
import type { Debrief } from '@/contracts/voice';
import { formatMoney } from '@/domain/money';
import { ApiClientError } from '@/client/api/client';
import { getConfig, getDebrief, replay } from '@/client/api/session';
import { recordResult } from '@/client/storage/plan';
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
    <div className="card p-4">
      <div className="label">Compared with your previous round</div>
      <p className="m-0 mt-1 text-[15px]">{line}</p>
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
      <div className="grid gap-4">
        <h1 className="h-title m-0">Debrief unavailable</h1>
        <p className="m-0 text-muted">{error}</p>
        <Link href="/example" className="btn btn-secondary w-fit">
          See the example debrief
        </Link>
      </div>
    );
  }
  if (!debrief) return <p className="text-muted">Loading the debrief…</p>;

  return (
    <DebriefReport
      debrief={debrief}
      actions={
        <div className="grid gap-3">
          {previous && <Comparison current={debrief} previous={previous} />}
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn btn-primary btn-xl" onClick={() => void onReplay()} disabled={replaying}>
              {replaying ? 'Starting…' : 'Replay this round'}
            </button>
            <Link href="/plan" className="btn btn-secondary">
              Add to my plan
            </Link>
          </div>
          <p className="m-0 text-[13px] text-muted">Same counterpart, same range. The replay is free; the wording of replies may differ, the rules do not.</p>
          {error && (
            <p className="m-0 text-gap" role="alert">
              {error}
            </p>
          )}
          {(caps?.customScenario || caps?.offerAnalysis) && (
            <div className="card grid gap-2 p-4">
              <div className="label">Your own situation</div>
              <p className="m-0 text-[15px]">Practise a scenario written from your own description, or get a real offer read line by line.</p>
              <Link href="/pricing" className="btn btn-secondary w-fit">
                See the conversation pack
              </Link>
            </div>
          )}
        </div>
      }
    />
  );
}
