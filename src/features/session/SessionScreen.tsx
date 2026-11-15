'use client';

import dynamic from 'next/dynamic';
import { ArrowRight, Flag, Loader2, Timer } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Capabilities } from '@/contracts/api';
import type { SessionView } from '@/contracts/domain';
import { formatMoney } from '@/domain/money';
import { ApiClientError, newClientId } from '@/client/api/client';
import { finishSession, getConfig, getSession, sendTurn } from '@/client/api/session';
import { AnimatedMoney } from '@/components/holdline/AnimatedMoney';
import { Avatar } from '@/components/holdline/Avatar';
import { Meter } from '@/components/holdline/Meter';
import { Money } from '@/components/holdline/Money';
import { cn } from '@/components/ui/cn';
import { ScreenSkeleton } from '@/components/ui/skeleton';
import { ARCHETYPE_LABELS } from '@/content/avatars';
import { TextComposer } from './TextComposer';
import { Transcript, type PendingLine } from './Transcript';
import { formatClock, useCountdown } from './useCountdown';

const VoicePanel = dynamic(() => import('./VoicePanel'), { ssr: false, loading: () => <div className="skeleton h-[120px] rounded-[20px]" aria-hidden /> });

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
      <div className="mx-auto grid max-w-[560px] justify-items-start gap-4">
        <p className="eyebrow m-0">Practice round</p>
        <h1 className="h-title m-0">Round not found</h1>
        <p className="m-0 text-muted">{loadError}</p>
        <Link href="/quiz" className="btn btn-primary">
          Set up a new round
        </Link>
      </div>
    );
  }
  if (!session) return <ScreenSkeleton variant="chat" label="Loading the round…" />;

  const s = session.scenarioSummary;
  const typing = pending !== null && !pending.tentative;
  const pendingLines: PendingLine[] = [...(pending ? [pending] : []), ...(tentative && session.activeMode === 'voice' ? [{ id: 'tentative', role: 'user' as const, text: tentative, tentative: true }] : [])];
  const counterpartLabel = `Your ${s.counterpartRole.toLowerCase()}`;
  const ended = session.ended !== null;
  const urgent = left !== null && left < 60 && !ended;

  return (
    <div className="grid gap-5">
      <header className="card flex items-center gap-3 p-3 pr-4 sm:gap-4">
        <Avatar avatarId={s.persona.avatarId} size={52} label={`${s.persona.name}, ${s.persona.role}`} speaking={typing} />
        <div className="mr-auto min-w-0 leading-tight">
          <div className="truncate text-[16px] font-semibold tracking-[-0.01em]">{s.persona.name}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted">
            <span className="truncate">{s.persona.role}</span>
            <span className="badge badge-hold">{ARCHETYPE_LABELS[s.persona.archetype].title}</span>
          </div>
        </div>
        <div className={cn('flex shrink-0 items-center gap-2 rounded-full px-3 py-2 transition-colors duration-300', urgent ? 'bg-gap-tint text-gap' : 'bg-sunken text-ink-soft')}>
          {urgent ? <span className="live-dot" aria-hidden /> : <Timer size={15} strokeWidth={2} aria-hidden />}
          <span className="sr-only">Time left</span>
          <span className="mono text-[15px] font-medium" aria-live="off">
            {left === null ? '–' : formatClock(left)}
          </span>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <aside className="card grid min-w-0 gap-5 p-5 lg:sticky lg:top-24 lg:order-last" aria-label="Where the round stands">
          <div className="min-w-0">
            <div className="label">On the table</div>
            <div className="mt-2 text-[clamp(30px,5vw,38px)] font-extrabold leading-none tracking-[-0.045em]">
              <AnimatedMoney amountMinor={session.offerMinor} period={s.period} />
            </div>
            <div className="mt-2 text-[13.5px] text-muted">
              Your target <Money amountMinor={s.targetMinor} period={s.period} className="font-semibold text-ink-soft" />
            </div>
          </div>
          <PositionTrack session={session} />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <Meter label="Trust" value={session.trust} delta={deltas?.trust} />
            <Meter label="Patience" value={session.patience} delta={deltas?.patience} tone="ink" />
          </div>
          <p className="m-0 text-[13px] leading-5 text-muted">
            Turn {session.turn} of {session.maxTurns}
            {s.rangeSource === 'practice_assumption' && ' · practice bounds, not a market estimate'}
            {s.inputMode === 'example' && ' · example scenario'}
          </p>
          {!ended && (
            <button type="button" className="btn btn-secondary btn-sm w-full" onClick={() => void stop()}>
              <Flag size={14} strokeWidth={2} aria-hidden /> End the round
            </button>
          )}
        </aside>

        <div className="grid min-w-0 gap-5">
          <div aria-live="polite" className="sr-only">
            {session.messages.at(-1)?.role === 'counterpart' ? `${counterpartLabel}: ${session.messages.at(-1)!.text}` : ''}
          </div>

          <Transcript messages={session.messages} pending={pendingLines} counterpartLabel={counterpartLabel} typing={typing} avatarId={s.persona.avatarId} />

          {notice && (
            <p className="callout callout-warn pop-in m-0 text-ink" role="alert">
              {notice}
            </p>
          )}

          {ended ? (
            <RoundOver session={session} analysis={analysis} onDebrief={() => router.push(`/debrief/${session.id}`)} />
          ) : (
            <section className="sticky bottom-0 z-10 -mx-4 grid gap-3 bg-[linear-gradient(to_top,var(--paper)_78%,transparent)] px-4 pb-[calc(12px+env(safe-area-inset-bottom,0px))] pt-5 sm:static sm:mx-0 sm:bg-none sm:p-0" aria-label="Your move">
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
              <p className="m-0 hidden text-[12.5px] leading-5 text-muted sm:block">Every number is computed by the simulation from your range. The counterpart does not know your target.</p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

/** How far the offer has moved from where you started toward your target. The marker glides (transform only). */
function PositionTrack({ session }: { session: SessionView }) {
  const s = session.scenarioSummary;
  const offer = session.agreedMinor ?? session.offerMinor;
  if (offer === null || s.targetMinor === s.currentMinor) return null;
  const raw = s.objective === 'maximize' ? (offer - s.currentMinor) / (s.targetMinor - s.currentMinor) : (s.currentMinor - offer) / (s.currentMinor - s.targetMinor);
  const progress = Math.max(0, Math.min(1, raw));
  return (
    <div className="grid gap-2" aria-hidden>
      <div className="relative h-2 rounded-full bg-sunken">
        <div className="absolute inset-y-0 left-0 w-full origin-left rounded-full bg-hold/25 transition-transform duration-500 ease-[var(--ease-out)]" style={{ transform: `scaleX(${progress})` }} />
        <div className="absolute inset-0 transition-transform duration-500 ease-[var(--ease-out)]" style={{ transform: `translateX(${progress * 100}%)` }}>
          <span className="absolute -left-[7px] -top-[3px] h-[14px] w-[14px] rounded-full bg-hold shadow-[0_0_0_3px_var(--raised),0_2px_6px_rgba(17,14,36,0.3)]" />
        </div>
      </div>
      <div className="flex justify-between text-[11.5px] text-muted">
        <span>
          Start <Money amountMinor={s.currentMinor} className="font-medium text-ink-soft" />
        </span>
        <span>
          Target <Money amountMinor={s.targetMinor} className="font-medium text-ink-soft" />
        </span>
      </div>
    </div>
  );
}

const BURST = [
  [-120, -70, 40],
  [-80, -110, -30],
  [-30, -130, 70],
  [30, -125, -60],
  [85, -105, 20],
  [125, -60, -45],
  [-140, -20, 80],
  [140, -15, -80],
  [-60, -150, 10],
  [60, -150, -15],
] as const;

/** End-of-round card. An agreement gets one short burst: a rare, earned moment. */
function RoundOver({ session, analysis, onDebrief }: { session: SessionView; analysis: string; onDebrief: () => void }) {
  const s = session.scenarioSummary;
  const agreed = session.ended === 'accepted' && session.agreedMinor !== null;
  return (
    <section className={cn('pop-in relative grid gap-4 overflow-hidden rounded-[28px] p-6 sm:p-7', agreed ? 'on-violet' : 'card')} aria-label="Round over">
      {agreed && (
        <div className="pointer-events-none absolute left-1/2 top-[62%]" aria-hidden>
          {BURST.map(([x, y, r], i) => (
            <span
              key={i}
              className="burst-piece"
              style={{ ['--tx' as string]: `${x}px`, ['--ty' as string]: `${y}px`, ['--r' as string]: `${r * 4}deg`, ['--delay' as string]: `${120 + (i % 3) * 40}ms`, background: i % 3 === 0 ? 'var(--spark)' : i % 3 === 1 ? 'white' : 'var(--violet-300)' }}
            />
          ))}
        </div>
      )}
      <div className={cn('label', agreed && '!text-white/75')}>Round over</div>
      <p className={cn('m-0 text-[22px] font-bold leading-[1.25] tracking-[-0.025em]', agreed && 'text-white')}>
        {agreed ? (
          <>
            Agreed at <span className="num">{formatMoney(session.agreedMinor!, s.period)}</span>.
          </>
        ) : session.ended === 'walked_away' ? (
          'No agreement. Your counterpart ended the conversation.'
        ) : session.ended === 'timeout' ? (
          'No agreement. Time ran out.'
        ) : (
          'No agreement. You stopped the round.'
        )}
      </p>
      {analysis === 'uploading' && (
        <p className={cn('m-0 flex items-center gap-2 text-[14px]', agreed ? 'text-white/80' : 'text-muted')}>
          <Loader2 size={15} className="animate-spin" aria-hidden /> Uploading your recording for the voice debrief…
        </p>
      )}
      <button type="button" className={cn('btn btn-xl', agreed ? 'btn-white' : 'btn-primary')} onClick={onDebrief} disabled={analysis === 'uploading'}>
        See the debrief <ArrowRight size={18} strokeWidth={2} className="arrow" aria-hidden />
      </button>
    </section>
  );
}
