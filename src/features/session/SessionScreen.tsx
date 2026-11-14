'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Capabilities } from '@/contracts/api';
import type { SessionView } from '@/contracts/domain';
import { formatMoney } from '@/domain/money';
import { ApiClientError, newClientId } from '@/client/api/client';
import { finishSession, getConfig, getSession, sendTurn } from '@/client/api/session';
import { Avatar } from '@/components/holdline/Avatar';
import { Meter } from '@/components/holdline/Meter';
import { Money } from '@/components/holdline/Money';
import { ARCHETYPE_LABELS } from '@/content/avatars';
import { TextComposer } from './TextComposer';
import { Transcript, type PendingLine } from './Transcript';
import { formatClock, useCountdown } from './useCountdown';

const VoicePanel = dynamic(() => import('./VoicePanel'), { ssr: false, loading: () => <p className="text-muted">Loading voice…</p> });

export function SessionScreen({ id }: { id: string }) {
  const router = useRouter();
  const [session, setSession] = useState<SessionView | null>(null);
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [pending, setPending] = useState<PendingLine | null>(null);
  const [tentative, setTentative] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<'none' | 'uploading' | 'started' | 'skipped' | 'failed'>('none');
  const [deltas, setDeltas] = useState<{ patience: number; trust: number } | null>(null);
  const previous = useRef<SessionView | null>(null);
  const left = useCountdown(session?.deadlineAt ?? null);

  const accept = useCallback((view: SessionView) => {
    setSession((current) => {
      if (current && current.version > view.version) return current;
      const before = previous.current;
      if (before && view.turn > before.turn) setDeltas({ patience: view.patience - before.patience, trust: view.trust - before.trust });
      previous.current = view;
      return view;
    });
  }, []);

  useEffect(() => {
    getSession(id)
      .then(accept)
      .catch((error) => setLoadError(error instanceof ApiClientError && error.status === 404 ? 'This round is not available. Rounds expire after 24 hours and open only in the browser that started them.' : 'Could not load the round.'));
    getConfig()
      .then((c) => setCaps(c.capabilities))
      .catch(() => setCaps(null));
  }, [id, accept]);

  // Poll while the voice agent is driving turns, and once at the deadline.
  useEffect(() => {
    if (!session || session.ended || session.activeMode !== 'voice') return;
    const timer = setInterval(() => {
      void getSession(id).then(accept).catch(() => undefined);
    }, 1_000);
    return () => clearInterval(timer);
  }, [id, session, accept]);

  useEffect(() => {
    if (left === 0 && session && !session.ended) void getSession(id).then(accept).catch(() => undefined);
  }, [left, session, id, accept]);

  async function send(text: string): Promise<boolean> {
    if (!session) return false;
    const turnId = newClientId('turn');
    setNotice(null);
    setPending({ id: turnId, role: 'user', text, tentative: false });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const result = await sendTurn({ sessionId: session.id, turnId, expectedVersion: session.version, text });
        accept(result.session);
        setPending(null);
        return true;
      } catch (error) {
        if (error instanceof ApiClientError && error.code === 'NETWORK' && attempt < 2) {
          await new Promise((r) => setTimeout(r, 700 * (attempt + 1)));
          continue; // same turnId: the server returns the stored result if it already committed
        }
        const fresh = await getSession(session.id).catch(() => null);
        if (fresh) accept(fresh);
        setPending(null);
        if (fresh?.messages.some((m) => m.turnId === turnId)) return true;
        if (error instanceof ApiClientError) {
          if (error.code === 'SESSION_ENDED') setNotice('The round has ended.');
          else if (error.code === 'VERSION_CONFLICT' || error.code === 'TURN_IN_PROGRESS') setNotice('The round moved on. Your reply was not sent; read the latest message and send it again.');
          else setNotice(error.message);
        }
        return false;
      }
    }
    return false;
  }

  async function stop() {
    if (!session) return;
    try {
      accept(await finishSession(session.id, session.version));
    } catch (error) {
      setNotice(error instanceof ApiClientError ? error.message : 'Could not finish the round.');
    }
  }

  if (loadError) {
    return (
      <div className="grid gap-4">
        <h1 className="h-title m-0">Round not found</h1>
        <p className="m-0 text-muted">{loadError}</p>
        <Link href="/quiz" className="btn btn-primary w-fit">
          Set up a new round
        </Link>
      </div>
    );
  }
  if (!session) return <p className="text-muted">Loading the round…</p>;

  const s = session.scenarioSummary;
  const typing = pending !== null && !pending.tentative;
  const pendingLines: PendingLine[] = [...(pending ? [pending] : []), ...(tentative && session.activeMode === 'voice' ? [{ id: 'tentative', role: 'user' as const, text: tentative, tentative: true }] : [])];
  const counterpartLabel = `Your ${s.counterpartRole.toLowerCase()}`;
  const ended = session.ended !== null;

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-center gap-4">
        <Avatar avatarId={s.persona.avatarId} size={56} label={`${s.persona.name}, ${s.persona.role}`} speaking={typing} />
        <div className="mr-auto min-w-0">
          <div className="text-[16px] font-semibold">{s.persona.name}</div>
          <div className="text-[14px] text-muted">
            {s.persona.role} · {ARCHETYPE_LABELS[s.persona.archetype].title}
          </div>
        </div>
        <div className="text-right">
          <div className="label">Time left</div>
          <div className={`mono text-[18px] ${left !== null && left < 60 ? 'text-gap' : ''}`} aria-live="off">
            {left === null ? '–' : formatClock(left)}
          </div>
        </div>
      </header>

      <section className="card grid gap-4 p-4" aria-label="Where the round stands">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <div className="label">On the table</div>
            <Money amountMinor={session.offerMinor} period={s.period} className="text-[28px] font-bold" />
          </div>
          <div className="text-right">
            <div className="label">Your target</div>
            <Money amountMinor={s.targetMinor} period={s.period} className="text-[18px] font-semibold" />
          </div>
        </div>
        <Meter label="Trust" value={session.trust} delta={deltas?.trust} />
        <Meter label="Patience" value={session.patience} delta={deltas?.patience} tone="ink" />
        <p className="m-0 text-[13px] text-muted">
          Turn {session.turn} of {session.maxTurns}
          {s.rangeSource === 'practice_assumption' && ' · practice bounds, not a market estimate'}
          {s.inputMode === 'example' && ' · example scenario'}
        </p>
      </section>

      <div aria-live="polite" className="sr-only">
        {session.messages.at(-1)?.role === 'counterpart' ? `${counterpartLabel}: ${session.messages.at(-1)!.text}` : ''}
      </div>

      <Transcript messages={session.messages} pending={pendingLines} counterpartLabel={counterpartLabel} typing={typing} />

      {notice && (
        <p className="m-0 rounded-[8px] bg-gap-tint p-3 text-[14px]" role="alert">
          {notice}
        </p>
      )}

      {ended ? (
        <section className="card grid gap-3 p-4" aria-label="Round over">
          <div className="label">Round over</div>
          <p className="m-0 text-[18px]">
            {session.ended === 'accepted' && session.agreedMinor !== null ? (
              <>
                Agreed at <span className="num font-semibold">{formatMoney(session.agreedMinor, s.period)}</span>.
              </>
            ) : session.ended === 'walked_away' ? (
              'No agreement. Your counterpart ended the conversation.'
            ) : session.ended === 'timeout' ? (
              'No agreement. Time ran out.'
            ) : (
              'No agreement. You stopped the round.'
            )}
          </p>
          {analysis === 'uploading' && <p className="m-0 text-[14px] text-muted">Uploading your recording for the voice debrief…</p>}
          <button type="button" className="btn btn-primary btn-xl" onClick={() => router.push(`/debrief/${session.id}`)} disabled={analysis === 'uploading'}>
            See the debrief
          </button>
        </section>
      ) : (
        <section className="grid gap-3" aria-label="Your move">
          {session.activeMode === 'text' && <TextComposer disabled={typing} onSend={send} />}
          {caps?.voice && (
            <VoicePanel
              session={session}
              onSession={accept}
              onTentative={setTentative}
              onFallback={(reason) => setNotice(reason)}
              onAnalysis={(status) => setAnalysis(status)}
            />
          )}
          <div className="flex flex-wrap justify-between gap-2">
            <p className="m-0 text-[13px] text-muted">Every number is computed by the simulation from your range. The counterpart does not know your target.</p>
            <button type="button" className="btn btn-ghost" onClick={() => void stop()}>
              End the round
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
